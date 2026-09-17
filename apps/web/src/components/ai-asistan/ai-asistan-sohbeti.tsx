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
import { SohbetBalonu } from './sohbet-balonu';

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
/**
 * Boş ekrandaki örnek istemler.
 *
 * ÜÇ TANE VE HEPSİ FARKLI BİR İŞİ anlatıyor: yeni kampanya, var olanı
 * düzenleme, durum sorusu. Beş benzer örnek, kullanıcıya seçenek değil
 * okuma yükü veriyor.
 */
const ORNEK_ISTEMLER = [
  'Bu workspace’e form kampanyası aç, bütçe günde 500 TL olsun',
  'Hangi kampanyam kötü gidiyor?',
  'Geçen ay en iyi çalışan reklam metnine benzer bir metin yaz',
] as const;

export function AiAsistanSohbeti({
  clientId,
  platform,
  kullaniciAdi,
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
  /**
   * Balonun üstünde görünen ad.
   *
   * Kimin yazdığı ekranda YAZILI olmak zorunda: eski hâlde yalnızca hizalama
   * ve renk fark ediyordu ve uzun bir planın ortasında kimin konuştuğu
   * kayboluyordu.
   */
  kullaniciAdi: string;
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
        /*
         * VİDEO AYRI CÜMLEYLE. "Görsel değil" demek, video ekleyen
         * kullanıcıya dosyasının bozuk olduğunu düşündürüyor; oysa sorun
         * dosyada değil, bizde: video yükleme Meta'nın AYRI bir ucunu
         * (`/advideos`), işlenme beklemeyi ve kapak görseli üretmeyi
         * gerektiriyor ve o yol henüz yazılmadı.
         */
        setHata(
          file.type.startsWith('video/')
            ? `${file.name || 'Video'} eklenmedi: video reklamları henüz desteklenmiyor, ` +
                'şimdilik JPEG ya da PNG görsel ekleyebilirsin.'
            : `${file.name || 'Dosya'} bir görsel değil, eklenmedi (JPEG ya da PNG olmalı).`,
        );
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

      {/*
        MESAJ ALANI KENDİ KAYDIRMASINDA. Sayfayı kaydırmak, uzun bir sohbette
        yazma kutusunu ekrandan çıkarıyor ve kullanıcı her mesajdan sonra
        aşağı kaydırmak zorunda kalıyordu.
      */}
      <div className="flex max-h-[60vh] flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {mesajlar.length === 0 && !yuklemeHatasi && (
          <div className="my-auto px-4 text-center">
            <p className="text-sm font-semibold text-ink">Ne yapmak istediğini yaz</p>
            <p className="mx-auto mt-1.5 max-w-md text-xs text-ink-muted">
              Asistan taslak hazırlar; yayınlama her zaman senin onayınla oluyor. Görseli
              buraya sürükleyebilir ya da yapıştırabilirsin.
            </p>
            {/*
              ÖRNEK İSTEMLER TIKLANABİLİR. Boş bir kutuya ne yazacağını
              bilmemek bu ekranın en büyük angaryası: kullanıcı reklamcılık
              bilmiyor ve "serbest yaz" demek, onu boş sayfayla baş başa
              bırakmak. Tıklayınca kutuya YAZILIYOR, gönderilmiyor —
              kullanıcı kendi cümlesine çevirebilmeli.
            */}
            <div className="mx-auto mt-3 flex max-w-lg flex-wrap justify-center gap-1.5">
              {ORNEK_ISTEMLER.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setGirdi(o)}
                  className="rounded-full border border-line bg-surface px-3 py-1.5 text-[11px] text-ink transition hover:border-brand hover:text-brand-strong"
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
        )}

        {mesajlar.map((m, i) => (
          <SohbetBalonu
            key={`${m.createdAt}-${i}`}
            rol={m.role}
            metin={m.text}
            /*
             * ASİSTANIN ADI "Advetics" — model adı ya da "Asistan" değil.
             * Beyaz etiketli üründe kullanıcı ürünle konuşuyor; hangi modelin
             * çalıştığı onun sorusu değil.
             */
            yazan={m.role === 'user' ? kullaniciAdi : 'Advetics'}
            zaman={m.createdAt}
          />
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

      {/*
        GİRİŞ TEK KUTUDA. Üç ayrı kenarlıklı öğe (ekle · yaz · gönder) yan
        yana dururken ekran parçalı görünüyordu; şimdi tek bir çerçeve var ve
        içindeki düğmeler sade.
      */}
      {/*
        SÜRÜKLEME SIRASINDA NE OLACAĞI YAZIYOR. Vurgulu bir çerçeve tek
        başına "bırakabilirsin" demiyor; kullanıcı dosyayı havada tutarken
        okuyabileceği bir cümle görmeli.
      */}
      {surukleniyor && (
        <p className="mt-2 rounded-lg border border-dashed border-brand bg-brand-soft px-3 py-2 text-center text-xs font-medium text-brand-strong">
          Görseli buraya bırak
        </p>
      )}

      <div className="mt-3 flex items-end gap-1.5 rounded-xl border border-line bg-surface p-1.5 focus-within:border-brand">
        <label
          title="JPEG ya da PNG görsel"
          className="cursor-pointer rounded-lg px-2.5 py-2 text-sm text-ink-muted transition hover:bg-surface-sunken hover:text-ink"
        >
          {yukleniyorEk ? 'Yükleniyor…' : 'Görsel'}
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
          className="min-w-0 flex-1 resize-none border-0 bg-transparent px-1.5 py-2 text-sm outline-none"
        />

        <button
          type="button"
          onClick={() => void gonder()}
          disabled={busy || girdi.trim() === ''}
          className="shrink-0 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {busy ? 'Yazıyor…' : 'Gönder'}
        </button>
      </div>
    </div>
  );
}
