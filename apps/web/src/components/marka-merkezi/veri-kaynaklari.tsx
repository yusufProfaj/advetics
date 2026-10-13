'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import {
  KAYNAK_TANIMI,
  type KaynakSecenekleriYaniti,
  type KaynakTuru,
  type VeriKaynagiOzeti,
  type VeriKaynaklariYaniti,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { formatDayLong } from '@/lib/format';
import { kaynakDurumMetni } from '@/lib/veri-kaynagi';
import { markaMerkeziAdresi } from '@/lib/panel-adresleri';
import { Dugme } from '@/components/ui/dugme';
import { Uyari } from '@/components/ui/uyari';

/**
 * ═══ MARKA MERKEZİ › KURULUM › DİĞER VERİ KAYNAKLARI (Paket F1) ═══
 *
 * GA4 BURADA BAĞLANMIYOR (docs/panel-sadelestirme/MIMARI.md Ç-8): Analytics'in
 * TEK kaydı Kurulum'un `ga4_mulk` adımı (mülk seçilince `kurulumdanBagla`
 * veri kaynağını da bağlıyor). İkinci bir bağlama formu aynı mülk için
 * ikinci bir doğru üretirdi. GA4 kartı `haric` ile bu listeden çıkıyor ve
 * durumu Dönüşüm ölçümü adımında salt okunur (`Ga4KaynakDurumu`).
 *
 * docs/veri-kaynagi/MIMARI.md § 3.4 ve taslak.html ekran 1. AYRI BÖLÜM
 * DEĞİL, Bağlantılar'ın içinde kart grubu (dağınık yapı "nereye nereden
 * girdiğimi unutuyorum" şikâyetinin sebebiydi). Yapılmamış dalganın kartı
 * gri ve "Yakında" DEĞİL, NEDENİ yazar (sunucunun `engel` cümlesi).
 *
 * DÖRT HÂL AYRI: okunuyor, çağrı düştü (platformun/sunucunun cümlesi),
 * boş + neden, dolu. `.catch(() => setX([]))` yok.
 */
type Hal = { tur: 'okunuyor' } | { tur: 'hata'; mesaj: string } | { tur: 'geldi'; veri: VeriKaynaklariYaniti };
type Secim = { tur: 'kapali' } | { tur: 'okunuyor' } | { tur: 'hata'; mesaj: string } | { tur: 'geldi'; veri: KaynakSecenekleriYaniti };

const KISALTMA: Record<KaynakTuru, string> = {
  ga4: 'GA',
  search_console: 'SC',
  merchant_center: 'MC',
  meta_katalog: 'MK',
  ikas: 'E',
  ticimax: 'E',
  shopify: 'E',
};

const hataMetni = (e: unknown) => (e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.');
// Dönüş Kurulum'a (eski Bağlantılar bölümü kalktı). ÇAPASIZ: OAuth dönüş denetimi `#` kabul etmiyor.
const izinDonusu = (clientId: string) => markaMerkeziAdresi('kurulum', clientId);

export function VeriKaynaklari({
  clientId,
  yonetebilir,
  yazabilir,
  haric = [],
}: {
  clientId: string;
  /** Bu listede GÖSTERİLMEYEN türler (GA4: evi Dönüşüm ölçümü adımı). */
  haric?: readonly KaynakTuru[];
  /** `connection.manage`: bağla / kaldır. */
  yonetebilir: boolean;
  /** `connection.write`: yenile / duraklat / mülk listesi. */
  yazabilir: boolean;
}) {
  const [hal, setHal] = useState<Hal>({ tur: 'okunuyor' });

  const oku = useCallback(async () => {
    try {
      setHal({ tur: 'geldi', veri: await apiFetch<VeriKaynaklariYaniti>(`/veri-kaynaklari?clientId=${encodeURIComponent(clientId)}`) });
    } catch (e) {
      setHal({ tur: 'hata', mesaj: hataMetni(e) });
    }
  }, [clientId]);

  useEffect(() => {
    void oku();
  }, [oku]);

  return (
    <section aria-labelledby="veri-kaynaklari-baslik" className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-5 py-4">
        <h3 id="veri-kaynaklari-baslik" className="font-heading text-base font-bold text-ink">
          Veri kaynakları
        </h3>
        <span className="text-sm text-ink-muted">Reklam dışı veri: site, organik arama, ürün, sipariş. Yalnız okunur.</span>
      </div>
      {hal.tur === 'okunuyor' && <p className="px-5 py-4 text-sm text-ink-muted">Veri kaynakları okunuyor…</p>}
      {hal.tur === 'hata' && (
        <div className="p-5">
          <Uyari ton="tehlike" baslik="Veri kaynakları alınamadı.">
            {hal.mesaj}{' '}
            <button type="button" className="font-semibold underline" onClick={() => void oku()}>
              Yeniden dene
            </button>
          </Uyari>
        </div>
      )}
      {hal.tur === 'geldi' && (
        <>
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            {hal.veri.kaynaklar.filter((k) => !haric.includes(k.tur)).map((k) => (
              <BagliKart key={k.id} k={k} clientId={clientId} yonetebilir={yonetebilir} yazabilir={yazabilir} yenile={oku} />
            ))}
            {hal.veri.baglanabilir.filter((b) => !haric.includes(b.tur)).map((b) => (
              <BaglanabilirKart key={b.tur} tur={b.tur} engel={b.engel} izinBaglantiId={b.izinBaglantiId ?? null} clientId={clientId} yonetebilir={yonetebilir} yazabilir={yazabilir} yenile={oku} />
            ))}
          </div>
          <ul className="space-y-1 border-t border-line px-5 py-3 text-xs text-ink-muted">
            <li>Bir mülk yalnız bir workspace’e bağlanabilir (ajans toplamında iki kez sayılmasın).</li>
            {haric.includes('ga4') && <li>Google Analytics Dönüşüm ölçümü adımında bağlanır; durumu orada yazar.</li>}
          </ul>
        </>
      )}
    </section>
  );
}

function KartBasi({ tur, alt }: { tur: KaynakTuru; alt: string }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink font-heading text-xs font-bold text-white">
        {KISALTMA[tur]}
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-ink">{KAYNAK_TANIMI[tur].ad}</p>
        <p className="truncate text-xs text-ink-muted">{alt}</p>
      </div>
    </div>
  );
}

function Durum({ metin, ton }: { metin: string; ton: 'yesil' | 'kirmizi' | 'gri' }) {
  const renk = ton === 'yesil' ? 'bg-ok' : ton === 'kirmizi' ? 'bg-brand' : 'bg-ink-muted';
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
      <span aria-hidden className={`h-2 w-2 rounded-full ${renk}`} />
      {metin}
    </span>
  );
}

async function izinVer(baglantiId: string, clientId: string, hata: (m: string) => void) {
  try {
    const r = await apiFetch<{ authorizeUrl: string }>(
      `/connections/${baglantiId}/reauthorize?platform=google&kapsam=olcum&donus=${encodeURIComponent(izinDonusu(clientId))}`,
      { method: 'POST' },
    );
    window.location.href = r.authorizeUrl;
  } catch (e) {
    hata(hataMetni(e));
  }
}

function BagliKart({
  k,
  clientId,
  yonetebilir,
  yazabilir,
  yenile,
}: {
  k: VeriKaynagiOzeti;
  clientId: string;
  yonetebilir: boolean;
  yazabilir: boolean;
  yenile: () => Promise<void>;
}) {
  const [islem, setIslem] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);
  const d = kaynakDurumMetni(k);

  async function yap(ad: string, yol: string, method: 'POST' | 'DELETE', sonra?: string) {
    setIslem(ad);
    setHata(null);
    setBilgi(null);
    try {
      await apiFetch(yol, { method });
      if (sonra) setBilgi(sonra);
      await yenile();
    } catch (e) {
      setHata(hataMetni(e));
    } finally {
      setIslem(null);
    }
  }

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <KartBasi tur={k.tur} alt={`Mülk ${k.disKimlik} · ${k.ad}`} />
      <Durum {...d} />
      <ul className="space-y-1 text-xs text-ink-muted">
        <li>
          Son çekim <b className="text-ink">{k.sonBasariliCekim ? formatDayLong(k.sonBasariliCekim.slice(0, 10)) : 'henüz yok'}</b>
          {k.sonBasariliCekim ? ' (son 3 gün her gece yenilenir)' : ''}
        </li>
        <li>
          Anahtar etkinlik{' '}
          <b className="text-ink">
            {k.anahtarEtkinlikler === null ? 'henüz okunmadı' : k.anahtarEtkinlikler.length === 0 ? 'tanımlı değil' : k.anahtarEtkinlikler.join(', ')}
          </b>
        </li>
        {(k.saatDilimi || k.paraBirimi) && (
          <li>
            Saat dilimi <b className="text-ink">{k.saatDilimi ?? 'bilinmiyor'}</b> · Para birimi <b className="text-ink">{k.paraBirimi ?? 'bilinmiyor'}</b>
          </li>
        )}
      </ul>
      {k.sonHata && <p className="rounded-lg bg-brand/5 px-3 py-2 text-xs text-ink">Google’ın cevabı: {k.sonHata}</p>}
      {k.kurulumUyusmazligi && (
        <p className="rounded-lg bg-ink/5 px-3 py-2 text-xs text-ink">
          Kurulumdaki mülk farklı ({k.kurulumUyusmazligi.kurulumMulkId}). Okunan mülk {k.disKimlik}; doğru olan bu değilse kaldırıp kurulumdakini seç.
        </p>
      )}
      {hata && (
        <p role="alert" className="text-xs font-semibold text-brand-strong">
          {hata}
        </p>
      )}
      {bilgi && <p className="text-xs text-ink-muted">{bilgi}</p>}
      <div className="mt-auto flex flex-wrap gap-2">
        {k.izinBaglantiId && yonetebilir && yazabilir && (
          <Dugme boyut="kucuk" bekliyor={islem === 'izin'} onClick={() => (setIslem('izin'), void izinVer(k.izinBaglantiId!, clientId, (m) => (setHata(m), setIslem(null))))}>
            Analytics iznini ver
          </Dugme>
        )}
        {yazabilir && k.durum !== 'duraklatildi' && (
          <Dugme boyut="kucuk" ton="ikincil" bekliyor={islem === 'yenile'} onClick={() => void yap('yenile', `/veri-kaynaklari/${k.id}/yenile`, 'POST', 'Yenileme kuyruğa alındı; birkaç dakika içinde son çekim güncellenir.')}>
            Şimdi yenile
          </Dugme>
        )}
        {yazabilir && (
          <Dugme boyut="kucuk" ton="ikincil" bekliyor={islem === 'duraklat'} onClick={() => void yap('duraklat', `/veri-kaynaklari/${k.id}/duraklat`, 'POST')}>
            {k.durum === 'duraklatildi' ? 'Sürdür' : 'Duraklat'}
          </Dugme>
        )}
        {yonetebilir && (
          <Dugme
            boyut="kucuk"
            ton="sade"
            bekliyor={islem === 'kaldir'}
            onClick={() => {
              if (window.confirm('Okuma durur, çekilmiş veri raporlarda kalır. Kaldırılsın mı?')) void yap('kaldir', `/veri-kaynaklari/${k.id}`, 'DELETE');
            }}
          >
            Kaldır
          </Dugme>
        )}
      </div>
    </article>
  );
}

function BaglanabilirKart({
  tur,
  engel,
  izinBaglantiId,
  clientId,
  yonetebilir,
  yazabilir,
  yenile,
}: {
  tur: KaynakTuru;
  engel: string | null;
  izinBaglantiId: string | null;
  clientId: string;
  yonetebilir: boolean;
  yazabilir: boolean;
  yenile: () => Promise<void>;
}) {
  const sonraki = KAYNAK_TANIMI[tur].paket !== 'F1';
  const [secim, setSecim] = useState<Secim>({ tur: 'kapali' });
  const [secili, setSecili] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [bagliyor, setBagliyor] = useState(false);
  const etiket = useId();

  async function secenekleriAc() {
    setSecim({ tur: 'okunuyor' });
    try {
      const veri = await apiFetch<KaynakSecenekleriYaniti>(`/veri-kaynaklari/secenekler?clientId=${encodeURIComponent(clientId)}&tur=${tur}`);
      setSecim({ tur: 'geldi', veri });
      // Kurulum rehberinin kurduğu mülk önden seçili gelir.
      const onerilen = veri.secenekler.find((s) => s.disKimlik === veri.kurulumMulkId && !s.bagliWorkspace);
      setSecili(onerilen?.disKimlik ?? '');
    } catch (e) {
      setSecim({ tur: 'hata', mesaj: hataMetni(e) });
    }
  }

  async function bagla() {
    setBagliyor(true);
    setHata(null);
    try {
      await apiFetch('/veri-kaynaklari', { method: 'POST', body: JSON.stringify({ clientId, tur, disKimlik: secili }) });
      await yenile();
    } catch (e) {
      // Doğrulama BIRAKINCA: mülk okunamıyorsa Google'ın cümlesi şimdi görünür.
      setHata(hataMetni(e));
    } finally {
      setBagliyor(false);
    }
  }

  return (
    <article className={`flex flex-col gap-3 rounded-xl border border-line p-4 ${sonraki ? 'bg-ink/[0.03]' : 'bg-surface'}`}>
      <KartBasi tur={tur} alt={sonraki ? 'Sonraki aşama' : 'Bağlı değil'} />
      <Durum metin={sonraki ? 'Henüz bağlanamıyor' : engel ? 'Bağlanamıyor' : 'Bağlı değil'} ton={engel && !sonraki ? 'kirmizi' : 'gri'} />
      {engel && <p className="text-xs text-ink-muted">{engel}</p>}
      {!sonraki && izinBaglantiId && yonetebilir && yazabilir && (
        <div>
          <Dugme boyut="kucuk" onClick={() => void izinVer(izinBaglantiId, clientId, setHata)}>
            Analytics iznini ver
          </Dugme>
        </div>
      )}
      {!sonraki && !engel && yonetebilir && yazabilir && (
        <div className="space-y-2">
          {secim.tur === 'kapali' && (
            <Dugme boyut="kucuk" ton="ikincil" onClick={() => void secenekleriAc()}>
              Mülk seç
            </Dugme>
          )}
          {secim.tur === 'okunuyor' && <p className="text-xs text-ink-muted">Analytics mülkleri okunuyor…</p>}
          {secim.tur === 'hata' && (
            <p role="alert" className="text-xs font-semibold text-brand-strong">
              {secim.mesaj}
            </p>
          )}
          {secim.tur === 'geldi' &&
            (secim.veri.secenekler.length === 0 ? (
              <p className="text-xs text-ink-muted">Bu Google hesabının erişebildiği Analytics mülkü yok.</p>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <label htmlFor={etiket} className="sr-only">
                  Analytics mülkü
                </label>
                <select
                  id={etiket}
                  className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
                  value={secili}
                  onChange={(e) => setSecili(e.target.value)}
                >
                  <option value="">Mülk seçin</option>
                  {[...new Set(secim.veri.secenekler.map((s) => s.grup))].map((g) => (
                    <optgroup key={g} label={g}>
                      {secim.veri.secenekler
                        .filter((s) => s.grup === g)
                        .map((s) => (
                          <option key={s.disKimlik} value={s.disKimlik} disabled={s.bagliWorkspace !== null}>
                            {s.ad} ({s.disKimlik}){s.bagliWorkspace ? ` · ${s.bagliWorkspace} workspace’ine bağlı` : ''}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
                <Dugme boyut="kucuk" disabled={!secili} bekliyor={bagliyor} onClick={() => void bagla()}>
                  Bağla
                </Dugme>
              </div>
            ))}
        </div>
      )}
      {!sonraki && !engel && !(yonetebilir && yazabilir) && <p className="text-xs text-ink-muted">Bağlamak için bağlantıları yönetme yetkisi gerekiyor.</p>}
      {hata && (
        <p role="alert" className="text-xs font-semibold text-brand-strong">
          {hata}
        </p>
      )}
    </article>
  );
}
