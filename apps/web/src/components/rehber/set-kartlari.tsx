'use client';

/*
 * BANNER SETİ KARTLARI (adım 4). Onaylı taslak:
 * `docs/advcampaign/banner-seti-taslak.html`. Kullanıcı kararları
 * (2026-10-11): düğmeler panelin degradesiyle (`.birincil`, `.karo`),
 * uyarılar marka kırmızısıyla. Metin önce bütün setlerde ortaktı; Dalga 2'den
 * (2026-10-12) beri her set kendi metnini taşıyabilir (`setAlti`), taşımayana
 * ortak metin gider.
 *
 * Yerleşim kuralları BURADA YAZILMIYOR: hangi grubun hangi oranı kullandığı
 * ve neyin kapandığı `setPlani`/`reklamSetiPlani`nden (shared) okunuyor. Ekran
 * ikinci bir eşleme kurarsa "açık" dediği yerleşimi derleyici kapatır.
 */
import { AcilirMenu, MenuAyraci, MenuBasligi, MenuOgesi } from '@/components/ui/acilir-menu';
import { useState, type ReactNode } from 'react';
import {
  GORSEL_ORANLARI,
  ORAN_ETIKETI,
  YERLESIM_GRUPLARI,
  YERLESIM_SIRASI,
  reklamSetiPlani,
  setPlani,
  type GorselOrani,
  type NiyetKodu,
  type SetPlani,
  type YerlesimGrubu,
} from '@advetics/shared';
import { useSozluk } from '@/dil/saglayici';
import { reklamEkSozlugu } from '@/dil/sozlukler/reklam-ek';
import { IKON, Ikon } from './ikonlar';
import { EKRAN_EN_COK_SET, type SetYuvalari } from './rehber-mantik';
import type { MedyaBilgisi } from './adim-reklam';
import s from './rehber.module.css';

/** Yuvanın altındaki ölçü: kullanıcı neyi hazırlayacağını görsün. */
const ONERILEN_OLCU: Record<GorselOrani, string> = {
  dikey: '1080 × 1920',
  dik45: '1080 × 1350',
  kare: '1200 × 1200',
  yatay: '1200 × 628',
};
const ORAN_CSS: Record<GorselOrani, string> = { dikey: s.oDikey!, dik45: s.oDik45!, kare: s.oKare!, yatay: s.oYatay! };

/** Sürüklenen görselin kimliği bu türle taşınıyor; dosya bırakmayla karışmasın. */
const SURUKLEME_TURU = 'application/x-advetics-varlik';

/** Yerleşim adı ekran dilinde: shared'daki `etiket` Türkçe, anahtarla eşleniyor (Marketplace iki dilde aynı). */
const yerlesimAdi = (g: YerlesimGrubu, t: { yerlesim: { hikaye: string; akis: string; yan: string } }) => (g === 'pazar' ? YERLESIM_GRUPLARI[g].etiket : t.yerlesim[g]);
const etiketler = (gruplar: readonly YerlesimGrubu[], t: { yerlesim: { hikaye: string; akis: string; yan: string } }) => gruplar.map((g) => yerlesimAdi(g, t)).join(', ');

/** Bu oran bu sette hangi açık yerleşimlerde gösterilecek. */
function kullanildigiYerler(plan: SetPlani, ortak: SetPlani, oran: GorselOrani): YerlesimGrubu[] {
  return YERLESIM_SIRASI.filter((g) => !ortak.kapanan.includes(g) && !ortak.niyetKapanan.includes(g) && plan.gruplar[g] === oran);
}

export function SetKartlari({
  setler,
  medyaBilgisi,
  googleArama,
  tasi,
  kaldir,
  setiSil,
  yuvayaYukle,
  setAlti,
  niyet,
}: {
  setler: readonly SetYuvalari[];
  medyaBilgisi: ReadonlyMap<string, MedyaBilgisi>;
  googleArama: boolean;
  tasi: (varlikId: string, hedef: number | 'yeni') => void;
  kaldir: (varlikId: string) => void;
  setiSil: (sira: number) => void;
  /** `hedef` null = yeni set; dosya seçici ya da sürüklenen dosyalar. */
  yuvayaYukle: (dosyalar: File[] | null, hedef: number | null) => void;
  /** Setin altına konan içerik: görsele özel metin kutusu (Dalga 2). */
  setAlti?: (st: SetYuvalari, sira: number) => ReactNode;
  /**
   * Amacın niyeti: FORM'da elle yerleşim yalnız akış, hikâye ve Reels
   * (`niyetYerlesimKisiti`). Verilmezse kart derleyiciden GENİŞ bir plan
   * gösterir ("sağ sütun açık" der, gövde kapatır).
   */
  niyet?: NiyetKodu;
}) {
  const t = useSozluk(reklamEkSozlugu).set;
  const [ustunde, setUstunde] = useState<number | 'yeni' | null>(null);

  const oranListeleri = setler.map((st) => GORSEL_ORANLARI.filter((o) => st[o]));
  const planlar = oranListeleri.map((o) => setPlani(o, niyet));
  // Derleyiciyle AYNI karar: banner seti varsa kesişim, yoksa birleşim; niyet kısıtı dahil.
  const ortak = reklamSetiPlani(oranListeleri, niyet);
  const coklu = setler.length > 1;
  const sinirda = setler.length >= EKRAN_EN_COK_SET;
  // Ortak kapanışın sebebi olan setler: açmak için kullanıcının gideceği yer.
  const sebepSetler = planlar.map((p, i) => (p.kapanan.some((g) => ortak.kapanan.includes(g)) ? i + 1 : null)).filter((x) => x !== null);

  function birakmaOlaylari(hedef: number | 'yeni') {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (hedef === 'yeni' && sinirda) return;
        const tur = e.dataTransfer.types;
        if (!tur.includes(SURUKLEME_TURU) && !tur.includes('Files')) return;
        e.preventDefault();
        setUstunde(hedef);
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) setUstunde(null);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setUstunde(null);
        const id = e.dataTransfer.getData(SURUKLEME_TURU);
        if (id) return tasi(id, hedef);
        if (e.dataTransfer.files.length) yuvayaYukle([...e.dataTransfer.files], hedef === 'yeni' ? null : hedef);
      },
    };
  }

  return (
    <div>
      <div className={s.setler}>
        {setler.map((st, i) => {
          const plan = planlar[i]!;
          const n = oranListeleri[i]!.length;
          return (
            <div key={i} className={s.set} data-ustunde={ustunde === i} {...birakmaOlaylari(i)}>
              <div className={s.setUst}>
                <h3>Set {i + 1}</h3>
                <span className={s.rozet}>{t.birReklam}</span>
                {coklu && (
                  <button type="button" className={`${s.metinDugme} ${s.sagaYasla}`} onClick={() => setiSil(i)}>
                    {t.setiSil}
                  </button>
                )}
              </div>
              <div className={s.yuvalar}>
                {GORSEL_ORANLARI.map((o) => {
                  const g = st[o];
                  if (!g) {
                    // Boş yuva bir yerleşimi kapatıyor mu: bu oranı İLK tercih
                    // eden ve sette karşılığı olmayan grup.
                    const kapanan = plan.kapanan.filter((k) => YERLESIM_GRUPLARI[k].oranlar.includes(o as never));
                    const yedek = YERLESIM_SIRASI.filter((k) => YERLESIM_GRUPLARI[k].oranlar[0] === o && plan.gruplar[k]);
                    return (
                      <div key={o} className={s.yuva}>
                        <button
                          type="button"
                          className={s.cerceve}
                          data-bos="true"
                          data-kapatir={kapanan.length > 0}
                          aria-label={t.ekleEtiket(i + 1, ORAN_ETIKETI[o])}
                          onClick={() => yuvayaYukle(null, i)}
                        >
                          <span className={s.ekle}>
                            {t.ekle(ORAN_ETIKETI[o])}<span>{ONERILEN_OLCU[o]}</span>
                          </span>
                        </button>
                        <div className={s.yuvaAlt}>
                          <b>{ORAN_ETIKETI[o]}</b>
                          {kapanan.length ? (
                            <span className={s.kapaliYazi}>{t.kapaliKalacak(etiketler(kapanan, t))}</span>
                          ) : (
                            <span className={s.yer}>
                              {yedek.length ? t.kullanilir(etiketler(yedek, t), ORAN_ETIKETI[plan.gruplar[yedek[0]!]!]) : ' '}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  }
                  const bilgi = medyaBilgisi.get(g.varlikId);
                  const yerler = kullanildigiYerler(plan, ortak, o);
                  const digerleri = setler.map((_, j) => j).filter((j) => j !== i);
                  return (
                    <div key={o} className={s.yuva}>
                      <div
                        className={s.cerceve}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData(SURUKLEME_TURU, g.varlikId);
                        }}
                        onDragEnd={() => setUstunde(null)}
                      >
                        {bilgi ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={bilgi.onizleme} alt="" className={`${s.setGorsel} ${ORAN_CSS[o]}`} data-solgun={yerler.length === 0} />
                        ) : (
                          <span className={`${s.setGorsel} ${ORAN_CSS[o]}`} />
                        )}
                        {/* Ortak açılır menü (DOM'da kalır, Esc ve ok tuşları bileşende). */}
                        <div className={s.menuKonum}>
                          <AcilirMenu
                            etiket={t.secenekler(bilgi?.ad ?? t.gorsel)}
                            hizala="sag"
                            genislik="w-56"
                            tetik={({ acik: _acik, ...tp }) => (
                              <button type="button" {...tp} className={s.menuDugme} aria-label={t.secenekler(bilgi?.ad ?? t.gorsel)}>
                                ⋯
                              </button>
                            )}
                          >
                            <MenuBasligi>{t.seteTasi}</MenuBasligi>
                            {digerleri.map((j) => (
                              <MenuOgesi
                                key={j}
                                aciklama={setler[j]![o] ? t.yerDegistirir(ORAN_ETIKETI[o]) : undefined}
                                onClick={() => tasi(g.varlikId, j)}
                              >
                                Set {j + 1}
                              </MenuOgesi>
                            ))}
                            <MenuOgesi
                              devreDisi={sinirda}
                              aciklama={sinirda ? t.enCokSet(EKRAN_EN_COK_SET) : undefined}
                              onClick={() => tasi(g.varlikId, 'yeni')}
                            >
                              {t.yeniSet}
                            </MenuOgesi>
                            <MenuAyraci />
                            <MenuOgesi tehlike onClick={() => kaldir(g.varlikId)}>
                              {t.kaldir}
                            </MenuOgesi>
                          </AcilirMenu>
                        </div>
                      </div>
                      <div className={s.yuvaAlt}>
                        <b>
                          {ORAN_ETIKETI[o]}
                          {/* Otomatik üretilen boyut kaynağını söylüyor; kullanıcı beğenmezse kaldırır. */}
                          {g.uretildi && <span className={s.uretildi}>{t.uretildi}</span>}
                        </b>
                        {yerler.length ? (
                          <span className={s.yer}>
                            {ortak.otomatik && o === 'kare' ? t.kalanHerYer : etiketler(yerler, t)}
                          </span>
                        ) : (
                          // Ortak kapanış bu görseli kullanılmaz yapıyor; sessiz durmasın.
                          <span className={s.kullanilmiyor}>{t.kullanilmiyor}</span>
                        )}
                        <small>
                          {bilgi?.ad ?? t.gorsel}
                          {bilgi?.en && bilgi.boy ? ` · ${bilgi.en} × ${bilgi.boy}` : ''}
                        </small>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className={s.setAlt}>
                <span className={s.nokta} data-eksik={n > 0 && plan.kapanan.length > 0} />
                <span>
                  {n === 0 ? (
                    <>
                      <b>{t.bosSet}</b>
                      <br />
                      <span className={s.acikYazi}>{t.bosSetAcik}</span>
                    </>
                  ) : plan.otomatik ? (
                    <>
                      <b>{t.tamOtomatik}</b>
                      <br />
                      <span className={s.acikYazi}>{t.metaSecer}</span>
                    </>
                  ) : plan.kapanan.length ? (
                    <>
                      <b>
                        {t.boyutKapali(n, etiketler(plan.kapanan, t))}
                      </b>
                      <br />
                      <span className={s.acikYazi}>{t.eksikEklersen}</span>
                    </>
                  ) : (
                    <>
                      <b>{t.hepsiAcik(n)}</b>
                      <br />
                      <span className={s.acikYazi}>{t.baskaBoyut}</span>
                    </>
                  )}
                </span>
              </div>
              {googleArama && (
                <div className={s.googleNot}>
                  <Ikon d={IKON.google} />
                  {t.googleNot}
                </div>
              )}
              {n > 0 && setAlti?.(st, i)}
            </div>
          );
        })}
      </div>

      {/* Uyarı MARKA KIRMIZISIYLA (kullanıcı kararı). Yalnız birden çok sette:
          tek sette aynı bilgi kartın altında zaten yazıyor. */}
      {coklu && ortak.kapanan.length > 0 && (
        <div className={s.ortakUyari} role="status">
          <Ikon d={IKON.ucgen} />
          <span>
            <b>{t.ortakBaslik(etiketler(ortak.kapanan, t))}</b>{t.ortakGovde(sebepSetler.join(', '))}
          </span>
        </div>
      )}

      <button
        type="button"
        className={s.yeniSet}
        disabled={sinirda}
        data-ustunde={ustunde === 'yeni'}
        onClick={() => yuvayaYukle(null, null)}
        {...birakmaOlaylari('yeni')}
      >
        {sinirda ? t.sinirda(EKRAN_EN_COK_SET) : t.yeniSetDugme}
      </button>
      <p className={s.ipucu}>
        {t.herSetAyri}
      </p>
    </div>
  );
}
