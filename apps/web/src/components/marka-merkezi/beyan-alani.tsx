'use client';

import { useId, useState } from 'react';
import {
  KURULUM_BEYAN_OGESI_ADI,
  kapiNedeni,
  type Dil,
  type KurulumBeyani,
  type KurulumBeyanOgesi,
  type KurulumPlatformu,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { useDil, useSozluk } from '@/dil/saglayici';
import { markaMerkeziKurulumSozlugu } from '@/dil/sozlukler/marka-merkezi-kurulum';
import { Dugme } from '@/components/ui/dugme';
import { Girdi } from '@/components/ui/alan';
import { adimBeyanlari, type BeyanSecenegi } from '@/components/kurulum/sihirbaz-akisi';
import { beyanDegistir } from './kurulum-listesi-mantik';
import type { KurulumListesiKodu } from '@/lib/panel-adresleri';

/**
 * ═══ "BUNU KULLANMIYORUM" — BEYAN YAZ / GERİ AL (docs/kurulum-sihirbazi/MIMARI.md § 5) ═══
 *
 * Sihirbazın sözü "hiç eksik kalmasın"; bazı öğeler ise bazı işletmelerde
 * gerçekten YOK (fiziksel adres, web sitesi, bildirim isteği). Beyan
 * kapsamı daraltmanın AÇIK ve İZLİ yolu: kim, ne zaman, hangi gerekçeyle.
 * Liste ve sihirbaz AYNI bileşeni çiziyor (tek ev): ikinci bir beyan formu,
 * biri gerekçe sorup diğeri sormadığı gün ayrışırdı.
 *
 * Seçenekler adımdan TÜRÜYOR (`adimBeyanlari`): ödeme, hesap, marka gibi
 * kapanamaz öğeler buraya hiçbir yoldan girmiyor.
 *
 * GEREKÇE ALANI DOM'DAN ÇIKMAZ: görünürlük sınıfla değişiyor, yazılan
 * gerekçe kapatıp açınca kaybolmuyor (CLAUDE.md tasarım kuralı).
 */
const hataMetniDil = (e: unknown, yedek: string) => (e instanceof ApiRequestError ? e.message : yedek);

const PLATFORM_ADI: Record<KurulumPlatformu, string> = { meta: 'Meta', google: 'Google Ads' };

export function BeyanAlani({
  adim,
  clientId,
  beyanlar,
  kullanilmayanlar,
  yazabilir,
  tazele,
}: {
  adim: KurulumListesiKodu;
  clientId: string;
  /** `null` = okunamadı: yazma kapalı (var olanı görmeden "ekle" demek mükerrer beyan açardı). */
  beyanlar: readonly KurulumBeyani[] | null;
  kullanilmayanlar: readonly KurulumPlatformu[];
  /** `kurulum.beyan`. */
  yazabilir: boolean;
  tazele: () => void;
}) {
  const d = useSozluk(markaMerkeziKurulumSozlugu);
  const { dil } = useDil();
  const secenekler = adimBeyanlari(adim);
  const baslikId = useId();
  if (secenekler.length === 0) return null;

  return (
    <section id={`beyan-${adim}`} aria-labelledby={baslikId} className="scroll-mt-24 rounded-alan border border-dashed border-line px-3 py-2.5">
      <p id={baslikId} className="text-xs font-semibold text-ink">
        {d.bunuKullanmiyorum}
      </p>
      <p className="text-[11px] text-ink-muted">{d.beyanAciklama}</p>
      {beyanlar === null && <p className="mt-1 text-xs text-danger-strong">{d.beyanlarOkunamadi}</p>}
      {!yazabilir && <p className="mt-1 text-xs text-ink-muted">{kapiNedeni('kurulum.beyan', dil)}</p>}
      <ul className="mt-2 space-y-2">
        {secenekler.map((s) => (
          <BeyanSatiri
            key={s.tur === 'oge' ? s.oge : `p-${s.platform}`}
            s={s}
            clientId={clientId}
            beyanlar={beyanlar}
            kullanilmayanlar={kullanilmayanlar}
            yazabilir={yazabilir && beyanlar !== null}
            tazele={tazele}
          />
        ))}
      </ul>
    </section>
  );
}

function BeyanSatiri({
  s,
  clientId,
  beyanlar,
  kullanilmayanlar,
  yazabilir,
  tazele,
}: {
  s: BeyanSecenegi;
  clientId: string;
  beyanlar: readonly KurulumBeyani[] | null;
  kullanilmayanlar: readonly KurulumPlatformu[];
  yazabilir: boolean;
  tazele: () => void;
}) {
  const d = useSozluk(markaMerkeziKurulumSozlugu);
  const { dil } = useDil();
  const hataMetni = (e: unknown) => hataMetniDil(e, d.sunucuyaUlasilamadi);
  const [acik, setAcik] = useState(false);
  const [gerekce, setGerekce] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const alanId = useId();

  if (s.tur === 'platform') {
    const kapali = kullanilmayanlar.includes(s.platform);
    const yeni = beyanDegistir(kullanilmayanlar, s.platform);
    async function platform() {
      if (!yeni) return;
      setBekliyor(true);
      setHata(null);
      try {
        await apiFetch(`/clients/${clientId}/kurulum/platformlar`, { method: 'PUT', body: JSON.stringify({ kullanilmayanlar: yeni }) });
        tazele();
      } catch (e) {
        setHata(hataMetni(e));
      } finally {
        setBekliyor(false);
      }
    }
    return (
      <li className="flex flex-wrap items-center gap-2 text-xs">
        <span className="min-w-0 flex-1 text-ink">
          {kapali ? d.platformKullanilmiyor(PLATFORM_ADI[s.platform]) : d.platformVermeyecek(PLATFORM_ADI[s.platform])}
        </span>
        {yazabilir && (
          <Dugme boyut="kucuk" ton="ikincil" bekliyor={bekliyor} disabled={!yeni} onClick={() => void platform()}>
            {kapali ? d.geriAl : `${PLATFORM_ADI[s.platform]}${d.kullanilmiyorEki}`}
          </Dugme>
        )}
        {/* İKİSİ BİRDEN KAPATILAMAZ (sözleşme şeması): düğme kapalı ve NEDENİ yazıyor. */}
        {yazabilir && !yeni && <span className="basis-full text-[11px] text-ink-muted">{d.ikisiBirdenKapatilamaz}</span>}
        {hata && (
          <span role="alert" className="basis-full text-danger-strong">
            {hata}
          </span>
        )}
      </li>
    );
  }

  const oge: KurulumBeyanOgesi = s.oge;
  const var_ = beyanlar?.find((b) => b.oge === oge) ?? null;

  async function yaz(kapsamDisi: boolean) {
    setBekliyor(true);
    setHata(null);
    try {
      await apiFetch(`/clients/${clientId}/kurulum/beyan`, {
        method: 'PUT',
        body: JSON.stringify({ oge, kapsamDisi, ...(kapsamDisi && gerekce.trim() ? { gerekce: gerekce.trim() } : {}) }),
      });
      setAcik(false);
      setGerekce('');
      tazele();
    } catch (e) {
      setHata(hataMetni(e));
    } finally {
      setBekliyor(false);
    }
  }

  return (
    <li className="text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 text-ink">
          {var_ ? (
            <>
              <b>{KURULUM_BEYAN_OGESI_ADI[oge]}.</b>{' '}
              <span className="text-ink-muted">
                {var_.beyanEden ? `${var_.beyanEden.ad}, ` : ''}
                {tarihYaz(var_.tarih, dil)}
                {var_.gerekce ? `: “${var_.gerekce}”` : ''}
              </span>
            </>
          ) : (
            `“${KURULUM_BEYAN_OGESI_ADI[oge]}”`
          )}
        </span>
        {yazabilir &&
          (var_ ? (
            <Dugme boyut="kucuk" ton="sade" bekliyor={bekliyor} onClick={() => void yaz(false)}>
              {d.geriAl}
            </Dugme>
          ) : (
            <Dugme boyut="kucuk" ton="ikincil" aria-expanded={acik} aria-controls={alanId} onClick={() => setAcik((x) => !x)}>
              {acik ? d.vazgec : d.boyleDe}
            </Dugme>
          ))}
      </div>
      <div id={alanId} className={`mt-2 flex flex-wrap items-center gap-2 ${acik && !var_ ? '' : 'hidden'}`}>
        <Girdi
          value={gerekce}
          onChange={(e) => setGerekce(e.target.value)}
          maxLength={300}
          placeholder={d.gerekceYerTutucu}
          aria-label={d.gerekce}
          className="!h-8 !w-auto min-w-0 flex-1"
        />
        <Dugme ton="koyu" boyut="kucuk" bekliyor={bekliyor} onClick={() => void yaz(true)}>
          {d.kapsamDisiBirak}
        </Dugme>
      </div>
      {hata && (
        <p role="alert" className="mt-1 text-danger-strong">
          {hata}
        </p>
      )}
    </li>
  );
}

/** "13 Eki 2026" / "Oct 13, 2026": tarih ISO; saat dilimi kaymasın diye yalnız gün kısmı okunur, biçim UTC'de. */
export function tarihYaz(iso: string, dil: Dil = 'tr'): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso.slice(0, 10);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(dil === 'en' ? 'en-US' : 'tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
