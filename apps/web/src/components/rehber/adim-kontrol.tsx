'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  REHBER_AMACLARI,
  VARSAYILAN_META_PAYI,
  butceBol,
  type PlatformYayinOzeti,
  type RehberPlatformu,
  type RehberProvaSonucu,
  type RehberYayinDurumu,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import { REKLAM_YONETICISI } from '@/lib/reklam-yoneticisi';
import { AltCubuk, Soru, Uyari, type AdimBaglami } from './adim-ortak';
import type { MedyaBilgisi } from './adim-reklam';
import { IKON, Ikon } from './ikonlar';
import {
  CTA_METNI,
  alanAdi,
  bugun,
  geriAlinabilirMi,
  paraGoster,
  provaGosterimi,
  tarihGoster,
  yayinAdimlari,
  yayinSonucu,
  type EkranNo,
  type ProvaGosterimi,
} from './rehber-mantik';
import s from './rehber.module.css';

export interface ProvaHali {
  sonuc: RehberProvaSonucu | null;
  suruyor: boolean;
  hata: string | null;
}

const PLATFORM_ADI: Record<RehberPlatformu, string> = { meta: 'Meta', google: 'Google' };

// ─────────────────────────────────────────────────────────────────────────────
// 6 · Kontrol
// ─────────────────────────────────────────────────────────────────────────────

export function AdimKontrol({
  b,
  git,
  prova,
  provaEt,
  yayinlanabilir,
  onayAc,
  medyaBilgisi,
}: {
  b: AdimBaglami;
  git: (n: EkranNo) => void;
  prova: ProvaHali;
  provaEt: () => void;
  yayinlanabilir: boolean;
  onayAc: () => void;
  medyaBilgisi: ReadonlyMap<string, MedyaBilgisi>;
}) {
  const [metaKip, setMetaKip] = useState<'akis' | 'hikaye'>('akis');
  const [googleKip, setGoogleKip] = useState<'arama' | 'mobil'>('arama');
  const amac = b.a.amac?.deger ?? null;
  const m = b.a.metin?.deger;
  const basliklar = (m?.basliklar ?? []).map((x) => x.trim()).filter(Boolean);
  const aciklamalar = (m?.aciklamalar ?? []).map((x) => x.trim()).filter(Boolean);
  const ilkMedya = b.a.medya?.deger[0];
  const gorsel = ilkMedya ? medyaBilgisi.get(ilkMedya.varlikId) : undefined;
  const hesapAdi =
    b.h.instagramHesaplari.find((x) => x.id === b.a.instagramId?.deger)?.ad ?? b.h.sayfalar.find((x) => x.id === b.a.sayfaId?.deger)?.ad ?? 'Sayfa seçilmedi';
  const engel = b.kayit.eksikler.filter((e) => e.seviye === 'engel').length;
  const kurgu = amac ? REHBER_AMACLARI[amac].google.kurgu : null;
  const kararSutunlari = (['meta', 'google'] as const).filter((p) => b.kayit.kararlar.some((k) => k[p] !== null));

  return (
    <>
      <Soru baslik="Son kontrol">
        Reklamın {b.acik.meta && b.acik.google ? 'iki platformda' : 'platformda'} böyle görünecek. Önce prova ediyoruz: platformlar kurulumu para
        harcamadan kontrol ediyor.
      </Soru>
      <div className={s.onizlemeler}>
        {b.acik.meta && (
          <div className={`${s.kart} ${s.onKart}`}>
            <header>
              Meta önizleme
              <div className={s.seg} role="group" aria-label="Meta önizleme biçimi">
                <button type="button" aria-pressed={metaKip === 'akis'} onClick={() => setMetaKip('akis')}>
                  Akış
                </button>
                <button type="button" aria-pressed={metaKip === 'hikaye'} onClick={() => setMetaKip('hikaye')}>
                  Hikâye
                </button>
              </div>
            </header>
            <div className={s.telefon}>
              <div className={s.akisUst}>
                <i />
                <div>
                  <b>{hesapAdi}</b>
                  <small>Sponsorlu</small>
                </div>
              </div>
              {metaKip === 'akis' && <div className={s.akisMetin}>{m?.anaMetin || 'Ana metin yazılmadı.'}</div>}
              <div className={s.akisGorsel} data-kip={metaKip}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {gorsel && <img src={gorsel.onizleme} alt="" />}
              </div>
              <div className={s.akisCta}>
                <b>{basliklar[0] ?? 'Başlık yazılmadı'}</b>
                <span>{amac ? CTA_METNI[amac] : 'Daha fazla bilgi al'}</span>
              </div>
            </div>
          </div>
        )}
        {b.acik.google && (
          <div className={`${s.kart} ${s.onKart}`}>
            <header>
              Google önizleme
              {kurgu === 'ARAMA' && (
                <div className={s.seg} role="group" aria-label="Google önizleme biçimi">
                  <button type="button" aria-pressed={googleKip === 'arama'} onClick={() => setGoogleKip('arama')}>
                    Arama
                  </button>
                  <button type="button" aria-pressed={googleKip === 'mobil'} onClick={() => setGoogleKip('mobil')}>
                    Mobil
                  </button>
                </div>
              )}
            </header>
            {kurgu === 'ARAMA' ? (
              <>
                <div className={s.arama} data-kip={googleKip}>
                  <div className={s.rk}>
                    <b>Sponsorlu</b> · {alanAdi(b.a.hedefAdres?.deger) || 'site adresi yok'}
                  </div>
                  <h4>{basliklar.slice(0, 2).join(' | ') || 'Başlık yazılmadı'}</h4>
                  <p>{aciklamalar[0] ?? 'Açıklama yazılmadı.'}</p>
                </div>
                <p className={s.ipucu} style={{ margin: '0 14px 14px' }}>
                  Google başlık ve açıklamaları farklı sıralarda dener; bu bir örnek.
                </p>
              </>
            ) : (
              <p className={s.ipucu} style={{ margin: 14 }}>
                {kurgu === 'TALEP_YARATMA_VIDEO'
                  ? `YouTube videosu: ${b.a.youtubeVideo?.deger?.videoId ?? 'seçilmedi'}. YouTube ve Shorts'taki görünüm Google'da kurulduktan sonra Reklam Yöneticisi'nde açılır.`
                  : "Bu kampanyanın görünümü Google'ın yerleşimine göre değişir; kurulduktan sonra Reklam Yöneticisi'nde açılır."}
              </p>
            )}
          </div>
        )}
      </div>

      <div className={s.kart}>
        <details className={s.ac}>
          <summary>
            Senin yerine verdiğimiz kararlar <span className={s.ops}>platformun kendi seçimine bırakmadık</span>
            <Ikon d={IKON.asagi} className={s.ok} boyut={16} />
          </summary>
          <div className={s.tabloKap}>
            {b.kayit.kararlar.length === 0 ? (
              <p className={s.ipucu} style={{ margin: 16 }}>
                Amaç ve platform seçilince burada görünür.
              </p>
            ) : (
              <table className={s.kararlar}>
                <thead>
                  <tr>
                    <th>Karar</th>
                    {kararSutunlari.map((p) => (
                      <th key={p}>{PLATFORM_ADI[p]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.kayit.kararlar.map((k) => (
                    <tr key={k.kod}>
                      <td>{k.konu}</td>
                      {kararSutunlari.map((p) => {
                        const h = k[p];
                        return (
                          <td key={p}>
                            {h ? h.deger : '—'}
                            {h?.not && <small>{h.not}</small>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </details>
      </div>

      <div className={s.kart}>
        <div className={s.prova}>
          {(['meta', 'google'] as const)
            .filter((p) => b.acik[p])
            .map((p) => (
              <ProvaSatiri key={p} ad={PLATFORM_ADI[p]} g={provaGosterimi(prova.sonuc, b.kayit.icerikOzeti, p, prova.suruyor)} />
            ))}
        </div>
        {prova.hata && (
          <p className={s.hataMetni} role="alert" style={{ margin: '0 16px 12px' }}>
            {prova.hata}
          </p>
        )}
      </div>

      <AltCubuk git={git} adim={6}>
        <button
          type="button"
          className={s.ikincil}
          disabled={prova.suruyor || engel > 0}
          title={engel > 0 ? `${engel} eksik var` : undefined}
          onClick={provaEt}
        >
          {prova.suruyor ? 'Prova ediliyor…' : 'Prova et'}
        </button>
        <button
          type="button"
          className={s.birincil}
          disabled={!yayinlanabilir}
          title={!yayinlanabilir ? (engel > 0 ? `${engel} eksik var` : 'Önce prova geçmeli') : undefined}
          onClick={onayAc}
        >
          Yayınla
        </button>
      </AltCubuk>
    </>
  );
}

function ProvaSatiri({ ad, g }: { ad: string; g: ProvaGosterimi }) {
  const nokta = g.tur === 'gecti' ? s.ok : g.tur === 'suruyor' ? s.donuyor : g.tur === 'reddetti' ? s.ret : '';
  const metin =
    g.tur === 'yok'
      ? 'Henüz yapılmadı'
      : g.tur === 'suruyor'
        ? 'Platforma soruluyor…'
        : g.tur === 'bayat'
          ? 'İçerik değişti, yeniden prova et'
          : g.tur === 'gecti'
            ? `Geçti · para harcanmadı${g.not ? ` · ${g.not}` : ''}`
            : g.tur === 'reddetti'
              ? `Reddetti: ${g.mesajlar.join(' · ')}`
              : `Yapılmadı: ${g.sebep}`;
  return (
    <div>
      <span className={`${s.durumNokta} ${nokta}`} />
      <div>
        <b>{ad} provası</b>
        <br />
        <small>{metin}</small>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Onay penceresi (İyileştir'deki desen): DOM'dan çıkmaz, görünürlük geçişle
// ─────────────────────────────────────────────────────────────────────────────

const ADIM_METNI: Record<RehberPlatformu, [string, string, string]> = {
  meta: ['Duraklatılmış kur (kampanya, set, reklam)', "Meta'dan geri oku ve karşılaştır", 'Yayına al'],
  google: ['Duraklatılmış kur (kampanya, grup, reklam, kelimeler)', "Google'dan geri oku ve karşılaştır", 'Yayına al'],
};

export function OnayPenceresi({
  acik,
  b,
  yayin,
  gonderiliyor,
  hata,
  denemePlatformlari,
  onayla,
  kapat,
}: {
  acik: boolean;
  b: AdimBaglami;
  yayin: RehberYayinDurumu | null;
  gonderiliyor: boolean;
  hata: string | null;
  /** `deneme` açılışındaki platformlar: kurulur, geri okunur, AÇILMAZ. */
  denemePlatformlari: RehberPlatformu[];
  onayla: () => void;
  kapat: () => void;
}) {
  const onayRef = useRef<HTMLButtonElement>(null);
  const suruyor = gonderiliyor || (yayin !== null && yayin.uyum?.tur !== 'durdu' && yayin.platformlar.some((p) => yayinSonucu(p) === 'suruyor'));
  const butce = b.a.butce?.deger;
  const baslangic = b.a.takvim?.deger.baslangic;
  const acikPlatformlar = (['meta', 'google'] as const).filter((p) => b.acik[p]);
  const hepsiDeneme = acikPlatformlar.length > 0 && acikPlatformlar.every((p) => denemePlatformlari.includes(p));

  useEffect(() => {
    if (acik) onayRef.current?.focus();
  }, [acik]);

  useEffect(() => {
    if (!acik) return;
    const tus = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !suruyor) kapat();
    };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [acik, suruyor, kapat]);

  const ne = butce ? `${butce.tip === 'gunluk' ? 'günlük' : 'toplam'} ${paraGoster(butce.micros, b.paraBirimi)}` : '';
  const ne_zaman = !baslangic || baslangic === bugun(b.saatDilimi) ? 'bugün' : `${tarihGoster(baslangic)} tarihinde`;

  return (
    <div className={`${s.perde} ${acik ? s.acik : ''}`} aria-hidden={!acik}>
      <div className={s.pencere} role="dialog" aria-modal="true" aria-labelledby="rehber-onay-baslik">
        <h3 id="rehber-onay-baslik">Yayınla: onay</h3>
        <p>
          {hepsiDeneme ? (
            <>
              Bu amaç deneme açılışında: platformlarda <b>duraklatılmış</b> kurulur, okunup karşılaştırılır ve açılmaz. Harcama sen Reklam
              Yöneticisi&apos;nden başlatınca başlar ({ne}).
            </>
          ) : (
            <>
              Onaylarsan harcama {ne_zaman} başlar: <b>{ne}</b>. Her platformda önce duraklatılmış kuruyoruz, sonra okuyup karşılaştırıyoruz, en son
              açıyoruz. Biri düşerse diğeri etkilenmez.
              {denemePlatformlari.length > 0 &&
                ` ${denemePlatformlari.map((p) => PLATFORM_ADI[p]).join(' ve ')} deneme açılışında: orada duraklatılmış kalır.`}
            </>
          )}
        </p>
        {yayin?.uyum?.tur === 'durdu' && (
          <Uyari>
            Yayın durduruldu: {yayin.uyum.bulgular.map((x) => x.metin).join(' ')}
          </Uyari>
        )}
        {hata && <Uyari>{hata}</Uyari>}
        {acikPlatformlar.map((p) => {
          const ozet: PlatformYayinOzeti | undefined = yayin?.platformlar.find((x) => x.platform === p);
          const haller = ozet ? yayinAdimlari(ozet.durum) : (['bekliyor', 'bekliyor', 'bekliyor'] as const);
          return (
            <div key={p} className={s.pltAdim}>
              <h4>{PLATFORM_ADI[p]}</h4>
              <ul className={s.adimlar}>
                {ADIM_METNI[p].map((t, i) => (
                  <li key={t} data-hal={haller[i]}>
                    <i />
                    {i === 2 && haller[2] === 'atlandi' ? 'Duraklatılmış bırakıldı (açılmadı)' : t}
                  </li>
                ))}
              </ul>
              {ozet?.sebep && yayinSonucu(ozet) === 'hata' && <p className={s.adimSebep}>{ozet.sebep}</p>}
            </div>
          );
        })}
        <div className={s.pencereAlt}>
          <button type="button" className={s.ikincil} disabled={suruyor} onClick={kapat}>
            Vazgeç
          </button>
          <button ref={onayRef} type="button" className={s.birincil} disabled={suruyor || yayin !== null} onClick={onayla}>
            {suruyor ? 'Kuruluyor…' : 'Onayla ve yayınla'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Son ekran
// ─────────────────────────────────────────────────────────────────────────────

/**
 * "VAZGEÇ VE ARŞİVLE" — duraklatılmış ya da durmuş Meta kurulumunu Advetics'ten
 * geri almak. Canlı turda (2026-10-10) bu yol yoktu: deneme kurulumu Meta'dan
 * elle arşivlendi ve kayıt "duraklatılmış" kaldı. Onay SATIR İÇİNDE (tek
 * tıkla arşiv yok); sonuç sunucudan yoklanır, "gönderildi" bir sonuç değil.
 * Hata platformun kendi cümlesiyle görünür.
 */
function GeriAl({ rehberId, ozet, guncelle }: { rehberId: string; ozet: PlatformYayinOzeti; guncelle: (y: RehberYayinDurumu) => void }) {
  const [hal, setHal] = useState<'bos' | 'onay' | 'gonderiliyor' | 'hata'>('bos');
  const [hata, setHata] = useState<string | null>(null);
  async function arsivle() {
    setHal('gonderiliyor');
    setHata(null);
    try {
      await apiFetch(`/reklam/yayinlar/${encodeURIComponent(ozet.yayinId!)}/geri-al`, { method: 'POST' });
      // İş kuyrukta: durum değişene kadar yokla (en çok ~45 sn).
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const y = await apiFetch<RehberYayinDurumu>(`/reklam/rehberler/${encodeURIComponent(rehberId)}/yayin`);
        const p = y.platformlar.find((x) => x.platform === ozet.platform);
        if (p && (p.durum !== ozet.durum || (p.sebep ?? '') !== (ozet.sebep ?? ''))) {
          guncelle(y);
          if (p.durum !== 'arsivlendi') {
            setHata(p.sebep ?? 'Arşivlenemedi; Meta’nın cevabı yok.');
            return setHal('hata');
          }
          return setHal('bos');
        }
      }
      setHata('Meta henüz cevap vermedi; birkaç dakika sonra sayfayı yenile.');
      setHal('hata');
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.');
      setHal('hata');
    }
  }
  if (hal === 'onay' || hal === 'gonderiliyor') {
    return (
      <div className={s.geriAlOnay} role="group" aria-label="Arşivleme onayı">
        <span>Meta&apos;daki kampanya arşivlenecek; tekrar açılamaz.</span>
        <button type="button" className={s.birincil} disabled={hal === 'gonderiliyor'} onClick={() => void arsivle()}>
          {hal === 'gonderiliyor' ? 'Arşivleniyor…' : 'Arşivle'}
        </button>
        <button type="button" className={s.ikincil} disabled={hal === 'gonderiliyor'} onClick={() => setHal('bos')}>
          Vazgeç
        </button>
      </div>
    );
  }
  return (
    <div className={s.geriAlOnay}>
      <button type="button" className={s.ikincil} onClick={() => setHal('onay')}>
        Vazgeç ve arşivle
      </button>
      {hal === 'hata' && hata && (
        <span className={s.hataMetni} role="alert">
          {hata}
        </span>
      )}
    </div>
  );
}

export function SonEkran({
  b,
  yayin,
  yeniReklam,
  yeniHata,
  rehberId,
  yayinGuncelle,
}: {
  b: AdimBaglami;
  yayin: RehberYayinDurumu | null;
  yeniReklam: () => void;
  yeniHata: string | null;
  rehberId: string;
  yayinGuncelle: (y: RehberYayinDurumu) => void;
}) {
  const amac = b.a.amac?.deger ?? null;
  const platformlar = yayin?.platformlar ?? [];
  const sonuclar = platformlar.map((p) => yayinSonucu(p));
  const uyumDurdu = yayin?.uyum?.tur === 'durdu';
  const hal: 'tamam' | 'dur' | 'hata' | 'arsiv' =
    uyumDurdu || sonuclar.includes('hata')
      ? 'hata'
      : sonuclar.length > 0 && sonuclar.every((x) => x === 'arsivlendi')
        ? 'arsiv'
        : sonuclar.includes('duraklatildi') || sonuclar.includes('suruyor')
          ? 'dur'
          : 'tamam';
  const butce = b.a.butce?.deger;
  const pay =
    butce && BigInt(butce.micros) > 0n && (b.acik.meta || b.acik.google)
      ? butceBol(BigInt(butce.micros), b.acik, b.a.metaPayiYuzde?.deger ?? VARSAYILAN_META_PAYI, b.paraBirimi)
      : null;
  const tekPlatform = platformlar.length === 1 ? PLATFORM_ADI[platformlar[0]!.platform] : null;
  const ok = b.h.onKosullar;
  const yonetici = baglanti(REKLAM_YONETICISI, { musteri: b.clientId });

  return (
    <>
      <div className={s.kart}>
        <div className={s.kuruldu}>
          <div className={s.buyuk} data-hal={hal === 'arsiv' ? 'dur' : hal}>
            <Ikon d={hal === 'hata' ? IKON.kapat : IKON.tik} boyut={26} />
          </div>
          <h2>{hal === 'tamam' ? 'Reklamın yayında' : hal === 'dur' ? 'Duraklatılmış kuruldu' : hal === 'arsiv' ? 'Reklam arşivlendi' : 'Kurulum tamamlanamadı'}</h2>
          <p>
            {hal === 'arsiv'
              ? 'Kampanya platformda arşivlendi; harcama olmaz. Aynı içerikle yeni bir reklam açabilirsin.'
              : hal === 'tamam'
              ? `${tekPlatform ? `${tekPlatform}'da` : 'İki platformda da'} kuruldu, geri okunup kontrol edildi ve açıldı.`
              : hal === 'dur'
                ? "Kuruldu, geri okunup kontrol edildi ve açılmadı. Reklam Yöneticisi'nden başlatabilirsin; başlatana kadar harcama olmaz."
                : uyumDurdu
                  ? 'Yayın, platforma hiçbir şey gönderilmeden durduruldu.'
                  : 'Aşağıda hangi platformda neyin durduğu yazıyor; diğer platform bundan etkilenmedi.'}
          </p>
        </div>
        {uyumDurdu && yayin?.uyum?.tur === 'durdu' && (
          <div style={{ padding: '0 16px 12px' }}>
            <Uyari>{yayin.uyum.bulgular.map((x) => x.metin).join(' ')}</Uyari>
          </div>
        )}
        {platformlar.map((p, i) => {
          const sonuc = sonuclar[i]!;
          const tanim = amac ? REHBER_AMACLARI[amac] : null;
          const kurulacak = tanim ? (p.platform === 'meta' ? tanim.meta.kurulacak : tanim.google.kurgu !== null ? tanim.google.kurulacak : '') : '';
          const tutar = pay && butce ? `${butce.tip === 'gunluk' ? 'günlük' : 'toplam'} ${paraGoster(pay[p.platform], b.paraBirimi)}` : null;
          return (
            <div key={p.platform} className={s.sonucSatir}>
              <div className={`${s.karo} ${s.gri} ${s.karoKucuk}`}>
                <Ikon d={p.platform === 'meta' ? IKON.meta : IKON.google} />
              </div>
              <div>
                <b>{PLATFORM_ADI[p.platform]}</b>
                {kurulacak && ` · ${kurulacak}`}
                <small>
                  {[p.kampanyaKimligi ? `Kampanya ${p.kampanyaKimligi}` : null, tutar].filter(Boolean).join(' · ') || ' '}
                  {sonuc === 'hata' && p.sebep ? ` · ${p.sebep}` : ''}
                </small>
              </div>
              <span className={s.yayinda} data-hal={sonuc === 'yayinda' ? undefined : sonuc === 'hata' ? 'hata' : 'dur'}>
                <i />
                {sonuc === 'yayinda'
                  ? 'Yayında'
                  : sonuc === 'duraklatildi'
                    ? 'Duraklatılmış'
                    : sonuc === 'arsivlendi'
                      ? 'Arşivlendi'
                      : sonuc === 'suruyor'
                        ? 'Sürüyor'
                        : 'Kurulamadı'}
              </span>
              {geriAlinabilirMi(p) && <GeriAl rehberId={rehberId} ozet={p} guncelle={yayinGuncelle} />}
            </div>
          );
        })}
        <div className={s.sonDugmeler}>
          <Link href={yonetici} className={s.birincil}>
            Reklam Yöneticisi&apos;nde gör
          </Link>
          <button type="button" className={s.ikincil} onClick={yeniReklam}>
            Yeni reklam
          </button>
        </div>
        {yeniHata && (
          <p className={s.hataMetni} role="alert" style={{ margin: '0 16px 12px', textAlign: 'center' }}>
            Yeni reklam açılamadı: {yeniHata}
          </p>
        )}
      </div>
      <div className={s.kart}>
        <h3 className={s.kartBaslik}>Sonuçları iyileştirmek için</h3>
        <ul className={s.yapilacak}>
          {b.acik.meta && ok.metaSatisOlcumu === false && (
            <li>Sitende Meta pikseli satış saymıyor. Kurulursa reklamı satın alan kişiye göre iyileştirebiliriz.</li>
          )}
          {b.acik.google && ok.googleDonusumEtkin === false && <li>Google Ads&apos;te dönüşüm işlemi etkin değil; kurulana kadar teklif tıklamaya göre.</li>}
          <li>
            İlk sonuçlar 3 ile 7 gün içinde gelir. İyileştir sekmesi öneri yazdığında haber veririz.
            <Link href={baglanti('/iyilestir', { musteri: b.clientId })}>İyileştir</Link>
          </li>
        </ul>
      </div>
    </>
  );
}
