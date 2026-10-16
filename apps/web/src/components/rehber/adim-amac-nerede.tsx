'use client';

import Link from 'next/link';
import { useId } from 'react';
import { REHBER_AMACLARI, SITE_YOK_SEBEBI, type RehberAmacKodu, type RehberPlatformu } from '@advetics/shared';
import { useDil, useSozluk } from '@/dil/saglayici';
import { reklamAmacSozlugu } from '@/dil/sozlukler/reklam-amac';
import { hesaplarAdresi, markaMerkeziAdresi } from '@/lib/panel-adresleri';
import { AltCubuk, Soru, sil, yaz, type AdimBaglami } from './adim-ortak';
import { AMAC_IKONU, IKON, Ikon } from './ikonlar';
import { PikselSecici } from './meta-dalga3';
import {
  OLCUM_ENGEL_KODLARI,
  amacDegisimi,
  amacSiteSebebi,
  amacEkranAdi,
  amacNeAlacaksin,
  amactanSonraki,
  gorunurAmaclar,
  platformAnahtari,
  platformDurumu,
  platformNedeni,
  siteKapisiyla,
  type EkranNo,
} from './rehber-mantik';
import s from './rehber.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// 1 · Amaç
// ─────────────────────────────────────────────────────────────────────────────

export function AdimAmac({ b, git }: { b: AdimBaglami; git: (n: EkranNo) => void }) {
  const { dil } = useDil();
  const d0 = useSozluk(reklamAmacSozlugu).amac;
  const kodlar = gorunurAmaclar(b.h.ajansYoneticisi);
  const secili = b.a.amac?.deger ?? null;

  /*
   * AMAÇ DEĞİŞİNCE PLATFORM: kullanıcının kendi seçimi yeni amaçta da
   * kurulabiliyorsa korunur, kurulamıyorsa öneri yazılır (`amacDegisimi`).
   * Her değişiklikte öneriyi yeniden yazmak, kapatılan Google'ı başka amaca
   * bakıp dönünce sessizce yeniden açıyordu.
   */
  function sec(kod: RehberAmacKodu) {
    if (kod === secili) return;
    // "WEB SİTEMİZ YOK" KAPISI: kapalı kart seçilmez, sebebi kartın üstünde yazılı.
    if (amacSiteSebebi(kod, b.h.ajansYoneticisi, b.siteYok, dil) !== null) return;
    b.degistir(amacDegisimi(kod, b.a.platformlar, b.h));
  }

  return (
    <>
      <Soru adim={1} baslik={d0.soru}>
        {d0.aciklama}
      </Soru>
      {kodlar.length === 0 ? (
        /*
         * BOŞ LİSTE NEDENİNİ SÖYLER: amaçlar canlı turu geçince açılıyor
         * (`REHBER_ACILIS`). Boş bir ızgara "bir şey yüklenmedi" sanılırdı.
         */
        <div className={s.neden}>
          <Ikon d={IKON.bilgi} />
          <span>{d0.bos}</span>
        </div>
      ) : (
        <div className={s.amaclar}>
          {kodlar.map((kod) => {
            const siteSebebi = amacSiteSebebi(kod, b.h.ajansYoneticisi, b.siteYok, dil);
            return (
              <button
                key={kod}
                type="button"
                className={`${s.amac} ${siteSebebi ? s.amacKapali : ''}`}
                aria-pressed={kod === secili}
                aria-disabled={siteSebebi !== null || undefined}
                onClick={() => sec(kod)}
              >
                <span className={s.tik}>
                  <Ikon d={IKON.tik} />
                </span>
                <span className={s.karo}>
                  <Ikon d={AMAC_IKONU[kod]} />
                </span>
                <h3>{amacEkranAdi(kod, dil)}</h3>
                <p>{amacNeAlacaksin(kod, dil)}</p>
                {siteSebebi && <span className={s.kapaliYazi}>{siteSebebi}</span>}
                <span className={s.platformlar}>
                  {(['meta', 'google'] as const).map((p) => {
                    const d = siteKapisiyla(platformDurumu(kod, p, b.h.ajansYoneticisi, dil), kod, p, b.siteYok);
                    return (
                      <span key={p} className={`${s.plt} ${d.gorunur ? '' : s.yok}`} title={d.sebep ?? undefined}>
                        <i />
                        {p === 'meta' ? 'Meta' : 'Google'}
                      </span>
                    );
                  })}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <AltCubuk git={git} adim={1} ileri={amactanSonraki(b.kayit.eksikler, secili !== null, b.h.hazirlama !== null)} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 · Nerede
// ─────────────────────────────────────────────────────────────────────────────

export function AdimNerede({ b, git }: { b: AdimBaglami; git: (n: EkranNo) => void }) {
  const { dil } = useDil();
  const d0 = useSozluk(reklamAmacSozlugu).nerede;
  const amac = b.a.amac?.deger ?? null;
  if (!amac) {
    return (
      <>
        <Soru adim={2} baslik={d0.soru}>{d0.amacYok}</Soru>
        <AltCubuk git={git} adim={2} />
      </>
    );
  }
  const t = REHBER_AMACLARI[amac];
  // Hesap/sayfa atama bir WORKSPACE işi: Kurulum'un hesaplar bloğu (tek karar `hesaplarAdresi`te).
  const baglantilar = hesaplarAdresi(b.clientId);
  const videoKurgusu = t.google.kurgu === 'TALEP_YARATMA_VIDEO';

  function anahtar(p: RehberPlatformu) {
    yaz(b, 'platformlar', platformAnahtari(b.acik, p));
  }

  const kart = (p: RehberPlatformu) => {
    const d = siteKapisiyla(platformDurumu(amac, p, b.h.ajansYoneticisi, dil), amac, p, b.siteYok);
    const kurulacak = p === 'meta' ? t.meta.kurulacak : t.google.kurgu !== null ? t.google.kurulacak : null;
    const eksikler = b.kayit.eksikler.filter((e) => e.adim === 2 && e.platform === p);
    const tamamlar: string[] = [];
    if (p === 'meta' && b.acik.meta) {
      const sayfa = b.h.sayfalar.find((x) => x.id === b.a.sayfaId?.deger);
      const ig = b.h.instagramHesaplari.find((x) => x.id === b.a.instagramId?.deger);
      if (sayfa) tamamlar.push(d0.facebookSayfasiAdi(sayfa.ad));
      if (ig) tamamlar.push(`Instagram: ${ig.ad}`);
    }
    if (p === 'google' && b.acik.google) {
      const g = b.h.googleHesaplari.find((x) => x.id === b.a.googleHesabiId?.deger);
      if (g) tamamlar.push(d0.googleHesabiAdi(g.ad));
      const k = b.h.youtubeKanallari.find((x) => x.id === b.a.youtubeKanaliId?.deger);
      if (videoKurgusu && k) tamamlar.push(d0.youtubeBagli(k.ad));
    }
    return (
      <div className={`${s.pltKart} ${b.acik[p] ? s.secili : ''} ${d.gorunur ? '' : s.kapali}`}>
        <div className={s.pltUst}>
          <div className={`${s.karo} ${s.gri}`}>
            <Ikon d={p === 'meta' ? IKON.meta : IKON.google} />
          </div>
          <div>
            <h3>{p === 'meta' ? 'Meta' : 'Google'}</h3>
            <small>{p === 'meta' ? 'Instagram ve Facebook' : t.google.kurgu !== null ? t.google.nerede : d0.kurulamiyor}</small>
          </div>
          <button
            type="button"
            className={s.anahtar}
            role="switch"
            aria-checked={b.acik[p]}
            aria-label={p === 'meta' ? d0.metaAc : d0.googleAc}
            disabled={!d.gorunur}
            onClick={() => anahtar(p)}
          />
        </div>
        {kurulacak && d.gorunur && (
          <div className={s.kurulacak}>
            <b>{d0.kurulacak}</b> {kurulacak}.
            {d.deneme && <>{d0.deneme}</>}
          </div>
        )}
        <ul className={s.kontrol}>
          {!d.gorunur && (
            <li className={s.eksik}>
              <Ikon d={IKON.yok} />
              <span>
                {/* SİTE KAPISININ CÜMLESİ ZATEN TAM: "yalnız X'te açılır" eki yanlış olurdu (diğer platform da kapalı olabilir). */}
                {d.sebep === SITE_YOK_SEBEBI ? d.sebep : d0.yalnizDiger(d.sebep ?? '', p === 'meta' ? 'Google' : 'Meta')}
              </span>
            </li>
          )}
          {tamamlar.map((m) => (
            <li key={m} className={s.tamam}>
              <Ikon d={IKON.tik} />
              <span>{m}</span>
            </li>
          ))}
          {eksikler.map((e) => (
            <li key={e.kod} className={s.eksik}>
              <Ikon d={IKON.eksik} />
              <span>{e.metin}</span>
              {(e.kod === 'M-HESAP' || e.kod === 'M-SAYFA' || e.kod === 'G-HESAP' || e.kod === 'G-LOGO' || e.kod === 'G-LOGO-KARE') && (
                <Link href={e.kod === 'G-LOGO' || e.kod === 'G-LOGO-KARE' ? markaMerkeziAdresi('marka', b.clientId, 'logo') : baglantilar}>
                  {e.kod === 'G-LOGO' || e.kod === 'G-LOGO-KARE' ? d0.markaLogo : d0.kurulum}
                </Link>
              )}
              {OLCUM_ENGEL_KODLARI.includes(e.kod) && <Link href={markaMerkeziAdresi('kurulum', b.clientId, 'olcum')}>{d0.olcum}</Link>}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <>
      <Soru adim={2} baslik={d0.soru}>{d0.ikisiHazir}</Soru>
      <div className={s.neden}>
        <Ikon d={IKON.bilgi} />
        <span>{platformNedeni(amac, b.h, dil)}</span>
      </div>
      <div className={s.pltKartlar}>
        {kart('meta')}
        {kart('google')}
      </div>
      {(b.acik.meta || b.acik.google) && (
        <div className={`${s.kart} ${s.blok}`}>
          <div className={s.blokBaslik}>
            {d0.hesaplarBaslik} <span className={s.ops}>{d0.hesaplarEk}</span>
          </div>
          <div className={s.alanlar}>
            {b.acik.meta && (
              <>
                <Secici
                  secEtiketi={d0.sec}
                  etiket={d0.metaHesabi}
                  deger={b.a.metaHesabiId?.deger}
                  secenekler={b.h.hesaplar.map((x) => ({ id: x.id, ad: x.disKimlik ? `${x.ad} · ${x.disKimlik}` : x.ad }))}
                  bos={d0.metaHesabiYok}
                  degisti={(v) => (v === null ? sil(b, 'metaHesabiId') : yaz(b, 'metaHesabiId', v))}
                />
                <Secici
                  secEtiketi={d0.sec}
                  etiket={d0.facebookSayfasi}
                  deger={b.a.sayfaId?.deger}
                  secenekler={b.h.sayfalar}
                  bos={d0.facebookSayfasiYok}
                  degisti={(v) => (v === null ? sil(b, 'sayfaId') : yaz(b, 'sayfaId', v))}
                />
                <Secici
                  secEtiketi={d0.sec}
                  etiket={d0.instagramHesabi}
                  deger={b.a.instagramId?.deger ?? undefined}
                  secenekler={b.h.instagramHesaplari}
                  bos={d0.instagramYok}
                  hicbiri={d0.instagramOlmadan}
                  // "Instagram olmadan" bir KARAR: null DEĞER yazılır, alan silinmez.
                  degisti={(v) => yaz(b, 'instagramId', v)}
                />
              </>
            )}
            {b.acik.google && (
              <>
                <Secici
                  secEtiketi={d0.sec}
                  etiket={d0.googleHesabi}
                  deger={b.a.googleHesabiId?.deger}
                  secenekler={b.h.googleHesaplari.map((x) => ({ id: x.id, ad: `${x.ad} · ${x.musteriNo}` }))}
                  bos={d0.googleHesabiYok}
                  degisti={(v) => (v === null ? sil(b, 'googleHesabiId') : yaz(b, 'googleHesabiId', v))}
                />
                {videoKurgusu && (
                  <Secici
                  secEtiketi={d0.sec}
                    etiket={d0.youtubeKanali}
                    deger={b.a.youtubeKanaliId?.deger ?? undefined}
                    secenekler={b.h.youtubeKanallari}
                    bos={d0.youtubeKanaliYok}
                    degisti={(v) => (v === null ? sil(b, 'youtubeKanaliId') : yaz(b, 'youtubeKanaliId', v))}
                  />
                )}
              </>
            )}
          </div>
          {((b.acik.meta && b.h.hesaplar.length === 0) || (b.acik.google && b.h.googleHesaplari.length === 0)) && (
            <p className={s.ipucu}>
              {d0.atamaIpucu} <Link href={baglantilar} className={s.metinDugme}>{d0.baglantilaraGit}</Link>
            </p>
          )}
        </div>
      )}
      {/* Satış amacı: piksel hesaba bağlı, o yüzden hesap seçiminin hemen altında. */}
      {b.acik.meta && amac === 'SATIS' && <PikselSecici b={b} />}
      <AltCubuk git={git} adim={2} />
    </>
  );
}

/**
 * Hesap/sayfa seçicisi. Seçim yoksa boş seçenek "Seç" görünür: tek seçenek
 * dışında rehber seçim YAPMIYOR (`onDoldurma`), listenin ilkini göstermek
 * kullanıcıya seçilmiş izlenimi verirdi.
 */
function Secici({
  secEtiketi,
  etiket,
  deger,
  secenekler,
  bos,
  hicbiri,
  degisti,
}: {
  secEtiketi: string;
  etiket: string;
  deger: string | null | undefined;
  secenekler: ReadonlyArray<{ id: string; ad: string }>;
  bos: string;
  /** Seçimi kaldırmaya izin veren seçeneğin adı (Instagram gibi isteğe bağlı alanlar). */
  hicbiri?: string;
  degisti: (v: string | null) => void;
}) {
  const id = useId();
  return (
    <div className={s.alan}>
      <label htmlFor={id}>{etiket}</label>
      <div className={s.girdi}>
          <select
            id={id}
            value={deger ?? ''}
            disabled={secenekler.length === 0}
            onChange={(e) => degisti(e.target.value === '' ? null : e.target.value)}
          >
            {secenekler.length === 0 ? (
              <option value="">{bos}</option>
            ) : (
              <>
                <option value="" disabled={!hicbiri}>
                  {hicbiri ?? secEtiketi}
                </option>
                {secenekler.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.ad}
                  </option>
                ))}
              </>
            )}
          </select>
      </div>
    </div>
  );
}
