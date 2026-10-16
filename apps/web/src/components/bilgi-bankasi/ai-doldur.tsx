'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MARKA_SINIRLARI, upsertClientProfileSchema, type BilgiBankasiTaslak } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Dugme } from '@/components/ui/dugme';
import { Kart } from '@/components/ui/kart';
import { Alan, Girdi, MetinAlani } from '@/components/ui/alan';
import { Serit } from '@/components/ui/hal';
import { useSozluk } from '@/dil/saglayici';
import { markaMerkeziSozlugu } from '@/dil/sozlukler/marka-merkezi';

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
  const d = useSozluk(markaMerkeziSozlugu).ai;
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
      setHata(err instanceof ApiRequestError ? err.message : d.taslakUretilemedi);
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
        setHata(kontrol.error.issues[0]?.message ?? d.gecersizAlan);
        return;
      }
      await apiFetch('/client-profile', { method: 'POST', body: JSON.stringify(govde) });
      setKaydedildi(true);
      setTaslak(null);
      // Sekmeler kendi verilerini kendileri çekiyor; sayfayı tazelemek
      // ikisini de güncel hâle getiriyor.
      router.refresh();
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : d.kaydedilemedi);
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
    <Kart
      baslik={d.baslik}
      eylem={
        <Dugme ton={taslak ? 'ikincil' : 'koyu'} boyut="kucuk" onClick={() => void uret()} disabled={busy}>
          {busy && !taslak ? d.araniyor : taslak ? d.yenidenUret : d.arastir}
        </Dugme>
      }
    >
      <p className="m-0 text-13 text-ink-muted">
        {d.aciklama}
      </p>

      {hata && (
        <div className="mt-3">
          <Serit ton="hata" baslik={d.islemBasarisiz}>
            {hata}
          </Serit>
        </div>
      )}

      {kaydedildi && (
        <p role="status" className="mt-3 text-13 text-ink">
          {d.kaydedildi}
        </p>
      )}

      {taslak && (
        <div className="mt-4 space-y-4">
          <p className="text-12 text-ink-muted">
            {d.kaynak} <span className="text-ink">{taslak.kaynak}</span>
          </p>

          {(
            [
              ['bilgiBankasi', d.markayiAnlat],
              ['hedefKitle', d.kimeSatiyoruz],
              ['markaBilgileri', d.ekNotlar],
            ] as const
          ).map(([alan, etiket]) => (
            <Alan key={alan} etiket={etiket}>
              {/*
                BOŞ BÖLÜM GİZLENMİYOR, BOŞ GÖSTERİLİYOR. Model üç bölümden
                ikisini üretmiş olabilir ve eksik olanı hiç çizmemek, "üçü de
                dolduruldu" izlenimi verirdi.
              */}
              {(id) => (
                <MetinAlani
                  id={id}
                  value={taslak[alan]}
                  onChange={(e) => alanDegistir(alan, e.target.value)}
                  rows={taslak[alan] ? 5 : 2}
                  maxLength={2000}
                  placeholder={d.bolumUretilemedi}
                />
              )}
            </Alan>
          ))}

          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ['markaAdi', d.markaAdi, MARKA_SINIRLARI.markaAdi],
                ['sektor', d.sektor, MARKA_SINIRLARI.sektor],
                ['uslup', d.uslup, MARKA_SINIRLARI.uslup],
              ] as const
            ).map(([alan, etiket, sinir]) => (
              <Alan key={alan} etiket={etiket}>
                {(id) => (
                  <Girdi
                    id={id}
                    value={taslak[alan]}
                    onChange={(e) => alanDegistir(alan, e.target.value)}
                    maxLength={sinir}
                    placeholder={d.sitedeYok}
                  />
                )}
              </Alan>
            ))}
          </div>
          {(
            [
              ['urunKategorileri', d.kategoriler(MARKA_SINIRLARI.kategori.adet)],
              ['vaatler', d.vaatler(MARKA_SINIRLARI.vaat.adet)],
            ] as const
          ).map(([alan, etiket]) => (
            <Alan key={alan} etiket={etiket}>
              {/*
                `defaultValue` + `onBlur`: kontrollü bir textarea'da satır
                satır ayırıp birleştirmek, boş satır yazmaya çalışan
                kullanıcının Enter'ını yutardı.
              */}
              {(id) => (
                <MetinAlani
                  id={id}
                  defaultValue={taslak[alan].join('\n')}
                  onBlur={(e) => listeDegistir(alan, e.target.value)}
                  rows={Math.max(2, taslak[alan].length)}
                  placeholder={d.sitedeYok}
                />
              )}
            </Alan>
          ))}
          <p className="text-12 text-ink-muted">
            {d.onerilmeyenler}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Dugme ton="koyu" boyut="kucuk" onClick={() => void kaydet()} disabled={busy}>
              {busy ? d.kaydediliyor : d.kaydet}
            </Dugme>
            <Dugme ton="hayalet" boyut="kucuk" onClick={() => setTaslak(null)} disabled={busy}>
              {d.vazgec}
            </Dugme>
            <span className="text-12 text-ink-muted">
              {d.ustuneYazar}
            </span>
          </div>
        </div>
      )}
    </Kart>
  );
}
