'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MARKA_SINIRLARI, upsertClientProfileSchema, type BilgiBankasiTaslak } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';

/**
 * ═══ TEK TUŞLA BİLGİ BANKASI ═══
 *
 * Kullanıcının isteği: *"bilgi bankası benim verdiğim workspace bilgilerine
 * göre AI asistan ile reklam stratejisine uygun bir şekilde bilgileri
 * dolduracak tek tuş ile araştırma yapıp"*.
 *
 * ═══ ÜRETİLEN METİN DOĞRUDAN KAYDEDİLMİYOR ═══
 *
 * Bu kayıt reklam metnini besliyor ve gerçek bir işletmeyi anlatıyor. Yapay
 * zekânın ürettiği bir cümle insan görmeden oraya girerse, yanlış bir bilgi
 * müşterinin parasıyla yayına çıkıyor — ve kimse onu bir daha okumuyor.
 * Taslak ekranda gösteriliyor, DÜZENLENEBİLİYOR ve kullanıcı kaydediyor.
 *
 * KAYNAK YAZILI. Metin işletmenin kendi sitesinden okunuyor ve hangi
 * adresten okunduğu panelde duruyor: "nereden biliyor" sorusunun cevabı
 * olmadan kullanıcı metne güvenip güvenmeyeceğini bilemez.
 */
export function AiDoldur({ clientId, canWrite }: { clientId: string; canWrite: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [taslak, setTaslak] = useState<BilgiBankasiTaslak | null>(null);
  const [kaydedildi, setKaydedildi] = useState(false);

  if (!canWrite) return null;

  async function uret(): Promise<void> {
    setBusy(true);
    setHata(null);
    setKaydedildi(false);
    try {
      const r = await apiFetch<BilgiBankasiTaslak>('/client-profile/ai-taslak', {
        method: 'POST',
        body: JSON.stringify({ clientId }),
      });
      setTaslak(r);
    } catch (err) {
      /*
       * SUNUCUNUN KENDİ CÜMLESİ. "Taslak üretilemedi" kullanıcıyı sebebi
       * aramaya gönderiyor; sunucu ne olduğunu söylüyor (site adresi yok,
       * site JavaScript ile çiziliyor, site yönlendirme döndürdü) ve her biri
       * farklı bir iş.
       */
      setHata(err instanceof ApiRequestError ? err.message : 'Taslak üretilemedi.');
    } finally {
      setBusy(false);
    }
  }

  async function kaydet(): Promise<void> {
    if (!taslak) return;
    setBusy(true);
    setHata(null);
    try {
      const govde = {
        clientId,
        // BOŞ BÖLÜM YAZILMIYOR: model bölümlerin bir kısmını üretmiş olabilir
        // ve boş değeri kaydetmek, kullanıcının elle yazdığını silmek olurdu.
        // Listeler için de aynı: boş liste "temizle" demek.
        ...(taslak.bilgiBankasi.trim() ? { bilgiBankasi: taslak.bilgiBankasi } : {}),
        ...(taslak.hedefKitle.trim() ? { hedefKitle: taslak.hedefKitle } : {}),
        ...(taslak.markaBilgileri.trim() ? { markaBilgileri: taslak.markaBilgileri } : {}),
        ...(taslak.markaAdi.trim() ? { markaAdi: taslak.markaAdi } : {}),
        ...(taslak.sektor.trim() ? { sektor: taslak.sektor } : {}),
        ...(taslak.uslup.trim() ? { uslup: taslak.uslup } : {}),
        ...(taslak.urunKategorileri.length ? { urunKategorileri: taslak.urunKategorileri } : {}),
        ...(taslak.vaatler.length ? { vaatler: taslak.vaatler } : {}),
      };
      // Kullanıcı öneriyi düzenledi: sunucunun kuralını burada da uygula,
      // hata kaydederken görünsün.
      const kontrol = upsertClientProfileSchema.safeParse(govde);
      if (!kontrol.success) {
        setHata(kontrol.error.issues[0]?.message ?? 'Alanlardan biri geçersiz.');
        return;
      }
      await apiFetch('/client-profile', { method: 'POST', body: JSON.stringify(govde) });
      setKaydedildi(true);
      setTaslak(null);
      // Sekmeler kendi verilerini kendileri çekiyor; sayfayı tazelemek
      // ikisini de güncel hâle getiriyor.
      router.refresh();
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : 'Kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  }

  function alanDegistir(
    alan: 'bilgiBankasi' | 'hedefKitle' | 'markaBilgileri' | 'markaAdi' | 'sektor' | 'uslup',
    deger: string,
  ): void {
    setTaslak((t) => (t ? { ...t, [alan]: deger } : t));
  }

  /** Liste alanları satır satır düzenleniyor: bir satır = bir öğe. */
  function listeDegistir(alan: 'urunKategorileri' | 'vaatler', metin: string): void {
    const ogeler = metin.split('\n').map((x) => x.trim()).filter(Boolean);
    setTaslak((t) => (t ? { ...t, [alan]: ogeler } : t));
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">Yapay zekâ ile doldur</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Workspace’in site adresini okuyup bilgi bankası, hedef kitle ve marka
            alanlarını reklam stratejisine göre önerir. Kaydetmeden önce
            düzenleyebilirsin.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void uret()}
          disabled={busy}
          className="shrink-0 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy && !taslak ? 'Araştırılıyor…' : taslak ? 'Yeniden üret' : 'Araştır ve doldur'}
        </button>
      </div>

      {hata && (
        <p
          role="alert"
          className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger-strong ring-1 ring-inset ring-danger/30"
        >
          {hata}
        </p>
      )}

      {kaydedildi && (
        <p role="status" className="mt-2 text-xs text-ok-strong">
          Kaydedildi. Sekmelerde güncel hâli görebilirsin.
        </p>
      )}

      {taslak && (
        <div className="mt-3 space-y-3">
          <p className="text-[11px] text-ink-muted">
            Kaynak: <span className="text-ink">{taslak.kaynak}</span>
          </p>

          {(
            [
              ['bilgiBankasi', 'Bilgi Bankası'],
              ['hedefKitle', 'Hedef Kitle'],
              ['markaBilgileri', 'Marka: ek notlar'],
            ] as const
          ).map(([alan, etiket]) => (
            <label key={alan} className="block">
              <span className="text-[11px] font-medium text-ink">{etiket}</span>
              {/*
                BOŞ BÖLÜM GİZLENMİYOR, BOŞ GÖSTERİLİYOR. Model üç bölümden
                ikisini üretmiş olabilir ve eksik olanı hiç çizmemek, "üçü de
                dolduruldu" izlenimi verirdi.
              */}
              <textarea
                value={taslak[alan]}
                onChange={(e) => alanDegistir(alan, e.target.value)}
                rows={taslak[alan] ? 5 : 2}
                maxLength={2000}
                placeholder="Bu bölüm üretilemedi; elle yazabilirsin."
                className="mt-0.5 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
              />
            </label>
          ))}

          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ['markaAdi', 'Marka adı', MARKA_SINIRLARI.markaAdi],
                ['sektor', 'Sektör', MARKA_SINIRLARI.sektor],
                ['uslup', 'Üslup', MARKA_SINIRLARI.uslup],
              ] as const
            ).map(([alan, etiket, sinir]) => (
              <label key={alan} className="block">
                <span className="text-[11px] font-medium text-ink">{etiket}</span>
                <input
                  value={taslak[alan]}
                  onChange={(e) => alanDegistir(alan, e.target.value)}
                  maxLength={sinir}
                  placeholder="Sitede bulunamadı; elle yazabilirsin."
                  className="mt-0.5 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
                />
              </label>
            ))}
          </div>
          {(
            [
              ['urunKategorileri', 'Ürün ve hizmet kategorileri', MARKA_SINIRLARI.kategori.adet],
              ['vaatler', 'Öne çıkan vaatler', MARKA_SINIRLARI.vaat.adet],
            ] as const
          ).map(([alan, etiket, adet]) => (
            <label key={alan} className="block">
              <span className="text-[11px] font-medium text-ink">
                {etiket} (her satır bir öğe, en fazla {adet})
              </span>
              {/*
                `defaultValue` + `onBlur`: kontrollü bir textarea'da satır
                satır ayırıp birleştirmek, boş satır yazmaya çalışan
                kullanıcının Enter'ını yutardı.
              */}
              <textarea
                defaultValue={taslak[alan].join('\n')}
                onBlur={(e) => listeDegistir(alan, e.target.value)}
                rows={Math.max(2, taslak[alan].length)}
                placeholder="Sitede bulunamadı; elle yazabilirsin."
                className="mt-0.5 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
              />
            </label>
          ))}
          <p className="text-[11px] text-ink-muted">
            Ana amaç ve sık kullanılan sayfalar önerilmez: ilki senin kararın, ikincisi gerçek adres ister.
            Marka sekmesinden ekle.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void kaydet()}
              disabled={busy}
              className="rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
            >
              {busy ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
            <button
              type="button"
              onClick={() => setTaslak(null)}
              disabled={busy}
              className="rounded-lg border border-line px-3 py-2 text-xs font-medium text-ink-muted transition hover:bg-surface-sunken"
            >
              Vazgeç
            </button>
            <span className="text-[11px] text-ink-muted">
              Dolu gelen alanlar sekmelerdeki değerin üzerine yazar; boş olanlar dokunulmaz.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
