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
import { useEffect, useState, type ReactNode } from 'react';
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

const etiketler = (gruplar: readonly YerlesimGrubu[]) => gruplar.map((g) => YERLESIM_GRUPLARI[g].etiket).join(', ');

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
  const [menu, setMenu] = useState<string | null>(null);
  const [ustunde, setUstunde] = useState<number | 'yeni' | null>(null);

  useEffect(() => {
    if (!menu) return;
    const tikla = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-set-menu]')) setMenu(null);
    };
    const tus = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null);
    document.addEventListener('click', tikla);
    document.addEventListener('keydown', tus);
    return () => {
      document.removeEventListener('click', tikla);
      document.removeEventListener('keydown', tus);
    };
  }, [menu]);

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
                <span className={s.rozet}>1 reklam</span>
                {coklu && (
                  <button type="button" className={`${s.metinDugme} ${s.sagaYasla}`} onClick={() => setiSil(i)}>
                    Seti sil
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
                          aria-label={`Set ${i + 1} için ${ORAN_ETIKETI[o]} ekle`}
                          onClick={() => yuvayaYukle(null, i)}
                        >
                          <span className={s.ekle}>
                            + {ORAN_ETIKETI[o]} ekle<span>{ONERILEN_OLCU[o]}</span>
                          </span>
                        </button>
                        <div className={s.yuvaAlt}>
                          <b>{ORAN_ETIKETI[o]}</b>
                          {kapanan.length ? (
                            <span className={s.kapaliYazi}>{etiketler(kapanan)} kapalı kalacak</span>
                          ) : (
                            <span className={s.yer}>
                              {yedek.length ? `${etiketler(yedek)}: ${ORAN_ETIKETI[plan.gruplar[yedek[0]!]!]} kullanılır` : ' '}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  }
                  const bilgi = medyaBilgisi.get(g.varlikId);
                  const yerler = kullanildigiYerler(plan, ortak, o);
                  const menuAcik = menu === g.varlikId;
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
                        <div data-set-menu>
                          <button
                            type="button"
                            className={s.menuDugme}
                            aria-label={`${bilgi?.ad ?? 'Görsel'} için seçenekler`}
                            aria-haspopup="menu"
                            aria-expanded={menuAcik}
                            onClick={() => setMenu(menuAcik ? null : g.varlikId)}
                          >
                            ⋯
                          </button>
                          <div className={s.setMenu} role="menu" data-acik={menuAcik}>
                            <div className={s.mBaslik}>Sete taşı</div>
                            {digerleri.map((j) => (
                              <button
                                key={j}
                                type="button"
                                role="menuitem"
                                tabIndex={menuAcik ? 0 : -1}
                                onClick={() => {
                                  setMenu(null);
                                  tasi(g.varlikId, j);
                                }}
                              >
                                Set {j + 1}
                                {setler[j]![o] && <small>{ORAN_ETIKETI[o]} var, yer değiştirirler</small>}
                              </button>
                            ))}
                            <button
                              type="button"
                              role="menuitem"
                              tabIndex={menuAcik ? 0 : -1}
                              disabled={sinirda}
                              onClick={() => {
                                setMenu(null);
                                tasi(g.varlikId, 'yeni');
                              }}
                            >
                              Yeni set{sinirda && <small>En çok {EKRAN_EN_COK_SET} set</small>}
                            </button>
                            <hr />
                            <button
                              type="button"
                              role="menuitem"
                              tabIndex={menuAcik ? 0 : -1}
                              onClick={() => {
                                setMenu(null);
                                kaldir(g.varlikId);
                              }}
                            >
                              Kaldır
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className={s.yuvaAlt}>
                        <b>
                          {ORAN_ETIKETI[o]}
                          {/* Otomatik üretilen boyut kaynağını söylüyor; kullanıcı beğenmezse kaldırır. */}
                          {g.uretildi && <span className={s.uretildi}> · Üretildi</span>}
                        </b>
                        {yerler.length ? (
                          <span className={s.yer}>
                            {ortak.otomatik && o === 'kare' ? 'Kalan her yer' : etiketler(yerler)}
                          </span>
                        ) : (
                          // Ortak kapanış bu görseli kullanılmaz yapıyor; sessiz durmasın.
                          <span className={s.kullanilmiyor}>Şimdilik kullanılmıyor</span>
                        )}
                        <small>
                          {bilgi?.ad ?? 'Görsel'}
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
                      <b>Bu sette görsel yok</b>
                      <br />
                      <span className={s.acikYazi}>Aynı tasarımın dört boyutunu ekle; her boyut kendi yerinde gösterilir.</span>
                    </>
                  ) : plan.otomatik ? (
                    <>
                      <b>4 boyut tam · yerleşimler otomatik</b>
                      <br />
                      <span className={s.acikYazi}>Meta yerleşimleri kendisi seçer.</span>
                    </>
                  ) : plan.kapanan.length ? (
                    <>
                      <b>
                        {n} / 4 boyut · {etiketler(plan.kapanan)} kapalı
                      </b>
                      <br />
                      <span className={s.acikYazi}>Eksik boyutu eklersen açılır.</span>
                    </>
                  ) : (
                    <>
                      <b>{n} / 4 boyut · bütün yerler açık</b>
                      <br />
                      <span className={s.acikYazi}>Eksik boyutun yerinde başka boyut gösterilir.</span>
                    </>
                  )}
                </span>
              </div>
              {googleArama && (
                <div className={s.googleNot}>
                  <Ikon d={IKON.google} />
                  Google Arama reklamı metinle gösterilir; görseller yalnız Meta&apos;da kullanılır.
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
            <b>Reklam setinde {etiketler(ortak.kapanan)} kapalı.</b> Yerleşim bütün setlerde ortak olduğu için en az boyutu olan set belirler.
            Açmak için Set {sebepSetler.join(', ')} içine eksik boyutu ekle.
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
        {sinirda ? `En çok ${EKRAN_EN_COK_SET} set eklenebilir` : '+ Yeni set (başka bir fikir)'}
      </button>
      <p className={s.ipucu}>
        Her set ayrı bir reklamdır. Birden çok set eklersen Meta hepsini dener; hangisinin daha iyi çalıştığını raporda görürsün.
      </p>
    </div>
  );
}
