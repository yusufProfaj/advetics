'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import type {
  AiAssistantAction,
  AiAssistantSendResult,
  AiAssistantThreadMessage,
  AssetRecord,
  AssetUploadResult,
  AsistanPlatformu,
} from '@advetics/shared';
import { API_URL, ApiRequestError, apiFetch } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import { Halka } from '@/components/yukleniyor';
import { KreatifGorsel } from '@/components/kreatif-gorsel';
import { OnayKarti } from './onay-karti';

/**
 * AI KAMPANYA ASİSTANI — panel içi sohbet.
 *
 * AKIŞ YOK (SSE/WebSocket), tur SENKRON. Kod tabanında hiç akış yok ve bu
 * bilinçli: `toplu-tazeleme.tsx` sunucudan itmeyi paylaşımlı VPS'te "açık
 * bağlantı başına bir süreç kaynağı" gerekçesiyle reddediyor. Bir tur birkaç
 * saniye sürüyor; bekleme göstergesi yeterli.
 *
 * MESAJ KUTUSU DÜZ `<textarea>`. `mail-govde-editoru.tsx`teki
 * `contentEditable` deseni BURAYA UYMUYOR — o, zengin HTML düzenlemenin
 * imleç sorununu çözüyor; burada girdi düz metin.
 *
 * SOHBET KİMLİĞİ URL'DE (`?sohbet=`): sayfa yenilendiğinde geçmiş sunucudan
 * geri yükleniyor ve bağlantı paylaşılabiliyor. Bağlantı `baglanti()` ile
 * kuruluyor — elle birleştirmek `?musteri=` süzgecini düşürürdü (CLAUDE.md).
 */
export function AiAsistanSohbeti({
  clientId,
  platform,
  conversationId: ilkSohbetId,
  ilkMesajlar,
  ilkAksiyonlar,
  yuklemeHatasi,
}: {
  clientId: string;
  /**
   * Hangi asistan. YALNIZCA yeni sohbette gönderiliyor: sunucu var olan bir
   * sohbette kayıtlı değeri kullanıyor ve buradakini yok sayıyor — platformu
   * sohbetin ortasında değiştirmek o ana kadarki bütün bağlamı geçersiz
   * kılardı.
   */
  platform: AsistanPlatformu;
  conversationId: string | null;
  ilkMesajlar: AiAssistantThreadMessage[];
  ilkAksiyonlar: AiAssistantAction[];
  /** Geçmiş yüklenemediyse SEBEBİ — sessizce boş sohbet göstermiyoruz. */
  yuklemeHatasi: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dosyaRef = useRef<HTMLInputElement>(null);

  const [sohbetId, setSohbetId] = useState<string | null>(ilkSohbetId);
  const [mesajlar, setMesajlar] = useState<AiAssistantThreadMessage[]>(ilkMesajlar);
  const [aksiyonlar, setAksiyonlar] = useState<AiAssistantAction[]>(ilkAksiyonlar);
  const [girdi, setGirdi] = useState('');
  const [ekler, setEkler] = useState<AssetRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [yukleniyorEk, setYukleniyorEk] = useState(false);
  /** Sürükle-bırak sırasında kutunun vurgulanması. */
  const [surukleniyor, setSurukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  async function gonder(): Promise<void> {
    const metin = girdi.trim();
    if (!metin || busy) return;

    setBusy(true);
    setHata(null);

    /*
     * KULLANICI MESAJI HEMEN EKRANA YAZILIYOR. Sunucu cevabını beklemek,
     * kullanıcının yazdığını birkaç saniye görmemesi demek ve o sürede
     * tekrar göndermeye çalışıyor.
     */
    setMesajlar((m) => [...m, { role: 'user', text: metin, createdAt: new Date().toISOString() }]);
    setGirdi('');
    const gonderilenEkler = ekler.map((e) => e.id);
    setEkler([]);

    try {
      const res = await apiFetch<AiAssistantSendResult>('/ai-assistant/messages', {
        method: 'POST',
        body: JSON.stringify({
          conversationId: sohbetId ?? undefined,
          clientId: sohbetId ? undefined : clientId,
          platform: sohbetId ? undefined : platform,
          message: metin,
          attachmentAssetIds: gonderilenEkler.length > 0 ? gonderilenEkler : undefined,
        }),
      });

      setMesajlar((m) => [
        ...m,
        { role: 'assistant', text: res.reply, createdAt: new Date().toISOString() },
      ]);
      setAksiyonlar((a) => [...a, ...res.actions]);

      if (!sohbetId) {
        setSohbetId(res.conversationId);
        // Yenilemede geçmiş geri gelsin diye kimliği URL'ye yazıyoruz.
        // `replace` — her tur için geri düğmesine bir adım eklemiyoruz.
        router.replace(
          baglanti(pathname, Object.fromEntries(searchParams?.entries() ?? []), {
            sohbet: res.conversationId,
          }),
        );
      }
    } catch (err) {
      /*
       * HATA YUTULMUYOR ve kullanıcı mesajı ekranda KALIYOR — mesajı geri
       * almak, kullanıcının yazdığını kaybetmesi demek. Platformun/sunucunun
       * kendi cümlesi gösteriliyor (CLAUDE.md: `.catch(() => setX([]))` yasak).
       */
      setHata(err instanceof ApiRequestError ? err.message : 'Mesaj gönderilemedi.');
    } finally {
      setBusy(false);
    }
  }

  /**
   * ═══ GÖRSELİ SÜRÜKLE, YAPIŞTIR YA DA SEÇ ═══
   *
   * Üç yol da AYNI fonksiyona giriyor. Ayrı ayrı yazmak, birinde doğrulama
   * ya da hata gösterimi unutulunca kullanıcının neden yükleyemediğini
   * anlamaması demekti.
   *
   * `FileList` yerine `File[]` alıyor: pano (`clipboardData.items`) ve
   * sürükleme (`dataTransfer.files`) farklı kaplar veriyor ve ikisini de
   * düz diziye indirmek çağıran tarafın işi.
   */
  async function ekle(files: readonly File[] | FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    setYukleniyorEk(true);
    setHata(null);
    for (const file of Array.from(files)) {
      /*
       * GÖRSEL OLMAYAN DOSYA BURADA ELENİYOR — sunucuya gitmeden.
       *
       * Sürüklemede ve yapıştırmada kullanıcı ne bıraktığını seçmiyor:
       * bir PDF ya da metin parçası da gelebiliyor. Sunucuya göndermek,
       * kullanıcının sebebi belirsiz bir hata görmesi demekti; burada
       * dosyanın ADI ile birlikte söyleniyor.
       */
      if (!file.type.startsWith('image/')) {
        setHata(`${file.name || 'Dosya'} bir görsel değil, eklenmedi.`);
        continue;
      }
      try {
        const form = new FormData();
        form.append('file', file);
        // `apiFetch` JSON gövdesi kuruyor; multipart için doğrudan fetch —
        // `asset-library.tsx` ile aynı desen, Content-Type ELLE VERİLMİYOR.
        const res = await fetch(`${API_URL}/assets?clientId=${clientId}&kind=image`, {
          method: 'POST',
          credentials: 'include',
          body: form,
        });
        if (!res.ok) {
          const b = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new Error(b?.message ?? `${file.name} yüklenemedi`);
        }
        const sonuc = (await res.json()) as AssetUploadResult;
        setEkler((cur) => (cur.some((e) => e.id === sonuc.asset.id) ? cur : [...cur, sonuc.asset]));
      } catch (err) {
        // TEK DOSYA PATLASA DA DİĞERLERİ DEVAM EDİYOR — `asset-library.tsx`
        // ile aynı gerekçe.
        setHata(err instanceof Error ? err.message : 'Görsel yüklenemedi.');
      }
    }
    setYukleniyorEk(false);
    if (dosyaRef.current) dosyaRef.current.value = '';
  }

  const onaylar = aksiyonlar.filter((a) => a.kind === 'onay');
  const taslakVar = aksiyonlar.some((a) => a.kind === 'taslak');

  return (
    <div
      /*
       * SÜRÜKLE-BIRAK BÜTÜN KUTUYA. Yalnızca küçük bir alana bırakmayı
       * zorunlu kılmak, kullanıcıya hedef aratıyor; sohbetin tamamı hedef.
       *
       * `onDragOver` PREVENT DEFAULT ETMEK ZORUNDA: etmezse tarayıcı
       * dosyayı SEKMEDE AÇIYOR ve kullanıcı sohbetten çıkıyor.
       */
      onDragOver={(e) => {
        e.preventDefault();
        if (!surukleniyor) setSurukleniyor(true);
      }}
      onDragLeave={(e) => {
        // Çocuk öğelere geçişte de tetikleniyor; yalnızca kutunun DIŞINA
        // çıkıldığında vurgu kalkmalı.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSurukleniyor(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setSurukleniyor(false);
        void ekle(e.dataTransfer.files);
      }}
      className={`flex min-h-[26rem] flex-col rounded-xl border bg-surface-muted p-3.5 transition ${
        surukleniyor ? 'border-brand ring-2 ring-brand/30' : 'border-line'
      }`}
    >
      {yuklemeHatasi && (
        <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-strong ring-1 ring-inset ring-danger/30">
          Önceki sohbet yüklenemedi: {yuklemeHatasi} — yeni bir sohbet başlatabilirsin.
        </p>
      )}

      <div className="flex flex-1 flex-col gap-2.5">
        {mesajlar.length === 0 && !yuklemeHatasi && (
          <div className="my-auto px-6 text-center">
            <p className="text-sm font-semibold text-ink">Ne yapmak istediğini yaz</p>
            <p className="mx-auto mt-1.5 max-w-md text-xs text-ink-muted">
              Örn. &quot;Bu workspace’e form kampanyası aç, kreatifler ekte, bütçe günde 500 TL
              olsun.&quot; Asistan taslak hazırlar — yayınlama her zaman senin onayınla, panelin
              kendi Yayınla düğmesinden.
            </p>
          </div>
        )}

        {mesajlar.map((m, i) => (
          <div
            key={`${m.createdAt}-${i}`}
            className={
              m.role === 'user'
                ? 'max-w-[78%] self-end whitespace-pre-wrap rounded-xl rounded-br-sm bg-brand px-3 py-2 text-sm leading-relaxed text-white'
                : 'max-w-[82%] self-start whitespace-pre-wrap rounded-xl rounded-bl-sm border border-line bg-surface px-3 py-2 text-sm leading-relaxed text-ink'
            }
          >
            {m.text}
          </div>
        ))}

        {onaylar.map((a) =>
          a.kind === 'onay' && sohbetId ? (
            <OnayKarti
              key={a.confirmationId}
              conversationId={sohbetId}
              confirmationId={a.confirmationId}
              summary={a.summary}
              onKapat={() =>
                setAksiyonlar((cur) =>
                  cur.filter((x) => !(x.kind === 'onay' && x.confirmationId === a.confirmationId)),
                )
              }
            />
          ) : null,
        )}

        {taslakVar && (
          <div className="max-w-[82%] self-start rounded-xl border border-line bg-surface px-3 py-2 text-sm">
            <p className="text-ink">Taslak hazır — platforma henüz yayınlanmadı.</p>
            <Link
              href={baglanti('/reklam-olustur', {}, { musteri: clientId })}
              className="mt-1 inline-block text-sm text-brand-strong underline"
            >
              Taslakları incele ve yayınla
            </Link>
          </div>
        )}

        {busy && (
          <div className="flex items-center gap-2 self-start px-1 text-xs text-ink-muted">
            <Halka className="h-3.5 w-3.5" /> Asistan çalışıyor…
          </div>
        )}
      </div>

      {hata && (
        <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-strong ring-1 ring-inset ring-danger/30">
          {hata}
        </p>
      )}

      {ekler.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {ekler.map((e) => (
            <div key={e.id} className="relative h-14 w-14 overflow-hidden rounded-lg border border-line">
              <KreatifGorsel src={e.previewUrl} alt={e.name} bosMetin="Görsel yok" />
              <button
                type="button"
                aria-label={`${e.name} ekini kaldır`}
                onClick={() => setEkler((cur) => cur.filter((x) => x.id !== e.id))}
                className="absolute right-0 top-0 bg-ink/70 px-1 text-[11px] leading-4 text-white"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-end gap-2">
        <label className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink hover:bg-surface-sunken">
          {yukleniyorEk ? 'Yükleniyor…' : 'Görsel ekle'}
          <input
            ref={dosyaRef}
            type="file"
            multiple
            accept="image/png,image/jpeg"
            className="hidden"
            disabled={busy || yukleniyorEk}
            onChange={(e) => void ekle(e.target.files)}
          />
        </label>

        <textarea
          value={girdi}
          onChange={(e) => setGirdi(e.target.value)}
          onPaste={(e) => {
            /*
             * EKRAN GÖRÜNTÜSÜ YAPIŞTIRMA. Ajansın en sık yaptığı şeylerden
             * biri: görseli panoya alıp doğrudan yapıştırmak. Dosya olarak
             * kaydedip sonra seçtirmek, iki fazladan adım demek.
             *
             * `e.preventDefault()` YALNIZCA görsel varsa: metin yapıştırmayı
             * engellemek, kullanıcının kopyaladığı brief'i kutuya
             * yazamaması demekti.
             */
            const gorseller = Array.from(e.clipboardData?.items ?? [])
              .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
              .map((i) => i.getAsFile())
              .filter((f): f is File => f !== null);
            if (gorseller.length === 0) return;
            e.preventDefault();
            void ekle(gorseller);
          }}
          onKeyDown={(e) => {
            // Enter GÖNDERİYOR, Shift+Enter satır atlıyor — sohbet kutusunun
            // beklenen davranışı.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void gonder();
            }
          }}
          rows={2}
          maxLength={4000}
          placeholder="Mesaj yaz, görsel sürükle ya da yapıştır…"
          className="min-w-0 flex-1 resize-none rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
        />

        <button
          type="button"
          onClick={() => void gonder()}
          disabled={busy || girdi.trim() === ''}
          className="rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Gönder
        </button>
      </div>
    </div>
  );
}
