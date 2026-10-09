'use client';

import Link from 'next/link';
import { useId } from 'react';
import {
  REHBER_AMACLARI,
  onerilenPlatformlar,
  platformGorunurMu,
  type RehberAmacKodu,
  type RehberPlatformu,
} from '@advetics/shared';
import { baglanti } from '@/lib/baglanti';
import { AltCubuk, Soru, sil, yaz, type AdimBaglami } from './adim-ortak';
import { AMAC_IKONU, IKON, Ikon } from './ikonlar';
import { gorunurAmaclar, platformDurumu, platformNedeni, type EkranNo } from './rehber-mantik';
import s from './rehber.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// 1 · Amaç
// ─────────────────────────────────────────────────────────────────────────────

export function AdimAmac({ b, git }: { b: AdimBaglami; git: (n: EkranNo) => void }) {
  const kodlar = gorunurAmaclar(b.h.ajansYoneticisi);
  const secili = b.a.amac?.deger ?? null;

  /*
   * AMAÇ DEĞİŞİNCE PLATFORM ÖNERİSİ YENİDEN KURULUR (taslakta da öyle):
   * önceki amacın seçimi yeni amaçta anlamsız olabilir (WhatsApp'ta Google
   * yok). Öneri `derleyici` kaynağıyla yazılıyor; ekranda "önerilen" ve
   * sebebi görünüyor, kullanıcı kapatabiliyor.
   */
  function sec(kod: RehberAmacKodu) {
    if (kod === secili) return;
    b.degistir([
      { alan: 'amac', deger: kod, kaynak: 'kullanici' },
      { alan: 'platformlar', deger: onerilenPlatformlar(kod, b.h, platformGorunurMu), kaynak: 'derleyici' },
    ]);
  }

  return (
    <>
      <Soru baslik="Bu reklamdan ne bekliyorsun?">
        Birini seç. Meta ve Google&apos;da en uygun kurulumu biz seçeriz ve sana gösteririz.
      </Soru>
      {kodlar.length === 0 ? (
        /*
         * BOŞ LİSTE NEDENİNİ SÖYLER: amaçlar canlı turu geçince açılıyor
         * (`REHBER_ACILIS`). Boş bir ızgara "bir şey yüklenmedi" sanılırdı.
         */
        <div className={s.neden}>
          <Ikon d={IKON.bilgi} />
          <span>Henüz herkese açık bir reklam amacı yok. Amaçlar platformlarda canlı denemeden geçtikçe burada açılıyor.</span>
        </div>
      ) : (
        <div className={s.amaclar}>
          {kodlar.map((kod) => {
            const t = REHBER_AMACLARI[kod];
            return (
              <button key={kod} type="button" className={s.amac} aria-pressed={kod === secili} onClick={() => sec(kod)}>
                <span className={s.tik}>
                  <Ikon d={IKON.tik} />
                </span>
                <span className={s.karo}>
                  <Ikon d={AMAC_IKONU[kod]} />
                </span>
                <h3>{t.ekranAdi}</h3>
                <p>{t.neAlacaksin}</p>
                <span className={s.platformlar}>
                  {(['meta', 'google'] as const).map((p) => {
                    const d = platformDurumu(kod, p, b.h.ajansYoneticisi);
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
      <AltCubuk git={git} adim={1} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 · Nerede
// ─────────────────────────────────────────────────────────────────────────────

export function AdimNerede({ b, git }: { b: AdimBaglami; git: (n: EkranNo) => void }) {
  const amac = b.a.amac?.deger ?? null;
  if (!amac) {
    return (
      <>
        <Soru baslik="Reklam nerede çıksın?">Önce bir amaç seç; platformlar amaca göre açılıyor.</Soru>
        <AltCubuk git={git} adim={2} />
      </>
    );
  }
  const t = REHBER_AMACLARI[amac];
  const secim = b.a.platformlar?.deger ?? { meta: false, google: false };
  const baglantilar = baglanti('/marka-merkezi', { bolum: 'baglantilar', musteri: b.clientId });
  const videoKurgusu = t.google.kurgu === 'TALEP_YARATMA_VIDEO';

  function anahtar(p: RehberPlatformu) {
    yaz(b, 'platformlar', { ...secim, [p]: !secim[p] });
  }

  const kart = (p: RehberPlatformu) => {
    const d = platformDurumu(amac, p, b.h.ajansYoneticisi);
    const kurulacak = p === 'meta' ? t.meta.kurulacak : t.google.kurgu !== null ? t.google.kurulacak : null;
    const eksikler = b.kayit.eksikler.filter((e) => e.adim === 2 && e.platform === p);
    const tamamlar: string[] = [];
    if (p === 'meta' && b.acik.meta) {
      const sayfa = b.h.sayfalar.find((x) => x.id === b.a.sayfaId?.deger);
      const ig = b.h.instagramHesaplari.find((x) => x.id === b.a.instagramId?.deger);
      if (sayfa) tamamlar.push(`Facebook sayfası: ${sayfa.ad}`);
      if (ig) tamamlar.push(`Instagram: ${ig.ad}`);
    }
    if (p === 'google' && b.acik.google) {
      const g = b.h.googleHesaplari.find((x) => x.id === b.a.googleHesabiId?.deger);
      if (g) tamamlar.push(`Google Ads hesabı: ${g.ad}`);
      const k = b.h.youtubeKanallari.find((x) => x.id === b.a.youtubeKanaliId?.deger);
      if (videoKurgusu && k) tamamlar.push(`YouTube kanalı bağlı: ${k.ad}`);
    }
    return (
      <div className={`${s.pltKart} ${b.acik[p] ? s.secili : ''} ${d.gorunur ? '' : s.kapali}`}>
        <div className={s.pltUst}>
          <div className={`${s.karo} ${s.gri}`}>
            <Ikon d={p === 'meta' ? IKON.meta : IKON.google} />
          </div>
          <div>
            <h3>{p === 'meta' ? 'Meta' : 'Google'}</h3>
            <small>{p === 'meta' ? 'Instagram ve Facebook' : t.google.kurgu !== null ? t.google.nerede : 'Kurulamıyor'}</small>
          </div>
          <button
            type="button"
            className={s.anahtar}
            role="switch"
            aria-checked={b.acik[p]}
            aria-label={p === 'meta' ? "Meta'da aç" : "Google'da aç"}
            disabled={!d.gorunur}
            onClick={() => anahtar(p)}
          />
        </div>
        {kurulacak && d.gorunur && (
          <div className={s.kurulacak}>
            <b>Kurulacak:</b> {kurulacak}.
            {d.deneme && <> Deneme açılışı: platformda duraklatılmış kurulur, sen başlatana kadar harcama olmaz.</>}
          </div>
        )}
        <ul className={s.kontrol}>
          {!d.gorunur && (
            <li className={s.eksik}>
              <Ikon d={IKON.yok} />
              <span>
                {d.sebep}. Bu amaç yalnız {p === 'meta' ? 'Google' : 'Meta'}&apos;da açılır.
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
              {(e.kod === 'M-HESAP' || e.kod === 'M-SAYFA' || e.kod === 'G-HESAP' || e.kod === 'G-KANAL' || e.kod === 'G-LOGO') && (
                <Link href={e.kod === 'G-LOGO' ? baglanti('/marka-merkezi', { bolum: 'marka', musteri: b.clientId }) : baglantilar}>
                  {e.kod === 'G-LOGO' ? 'Marka' : 'Bağlantılar'}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <>
      <Soru baslik="Reklam nerede çıksın?">İkisi de hazırsa ikisinde birden açıyoruz. Kapatmak istediğini kapatabilirsin.</Soru>
      <div className={s.neden}>
        <Ikon d={IKON.bilgi} />
        <span>{platformNedeni(amac, b.h)}</span>
      </div>
      <div className={s.pltKartlar}>
        {kart('meta')}
        {kart('google')}
      </div>
      {(b.acik.meta || b.acik.google) && (
        <div className={`${s.kart} ${s.blok}`}>
          <div className={s.blokBaslik}>
            Reklam hesapları <span className={s.ops}>Bu workspace&apos;e atanmış olanlar</span>
          </div>
          <div className={s.alanlar}>
            {b.acik.meta && (
              <>
                <Secici
                  etiket="Meta reklam hesabı"
                  deger={b.a.metaHesabiId?.deger}
                  secenekler={b.h.hesaplar.map((x) => ({ id: x.id, ad: x.disKimlik ? `${x.ad} · ${x.disKimlik}` : x.ad }))}
                  bos="Atanmış Meta hesabı yok"
                  degisti={(v) => (v === null ? sil(b, 'metaHesabiId') : yaz(b, 'metaHesabiId', v))}
                />
                <Secici
                  etiket="Facebook sayfası"
                  deger={b.a.sayfaId?.deger}
                  secenekler={b.h.sayfalar}
                  bos="Bu workspace'te Facebook sayfası yok"
                  degisti={(v) => (v === null ? sil(b, 'sayfaId') : yaz(b, 'sayfaId', v))}
                />
                <Secici
                  etiket="Instagram hesabı"
                  deger={b.a.instagramId?.deger ?? undefined}
                  secenekler={b.h.instagramHesaplari}
                  bos="Bağlı Instagram hesabı yok"
                  hicbiri="Instagram olmadan"
                  // "Instagram olmadan" bir KARAR: null DEĞER yazılır, alan silinmez.
                  degisti={(v) => yaz(b, 'instagramId', v)}
                />
              </>
            )}
            {b.acik.google && (
              <>
                <Secici
                  etiket="Google Ads hesabı"
                  deger={b.a.googleHesabiId?.deger}
                  secenekler={b.h.googleHesaplari.map((x) => ({ id: x.id, ad: `${x.ad} · ${x.musteriNo}` }))}
                  bos="Atanmış Google Ads hesabı yok"
                  degisti={(v) => (v === null ? sil(b, 'googleHesabiId') : yaz(b, 'googleHesabiId', v))}
                />
                {videoKurgusu && (
                  <Secici
                    etiket="YouTube kanalı"
                    deger={b.a.youtubeKanaliId?.deger ?? undefined}
                    secenekler={b.h.youtubeKanallari}
                    bos="Bağlı YouTube kanalı yok"
                    degisti={(v) => (v === null ? sil(b, 'youtubeKanaliId') : yaz(b, 'youtubeKanaliId', v))}
                  />
                )}
              </>
            )}
          </div>
          {((b.acik.meta && b.h.hesaplar.length === 0) || (b.acik.google && b.h.googleHesaplari.length === 0)) && (
            <p className={s.ipucu}>
              Hesap ataması Marka Merkezi&apos;nde yapılır. <Link href={baglantilar} className={s.metinDugme}>Bağlantılara git</Link>
            </p>
          )}
        </div>
      )}
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
  etiket,
  deger,
  secenekler,
  bos,
  hicbiri,
  degisti,
}: {
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
                  {hicbiri ?? 'Seç'}
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
