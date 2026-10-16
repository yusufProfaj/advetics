import type { ReactNode } from 'react';
import {
  AMAC_ASAMASI,
  AMAC_OLCUTU,
  REHBER_AMACLARI,
  sec,
  type Dil,
  type StratejiBolumKodu,
  type StratejiKalemi,
} from '@advetics/shared';
import {
  HALKA_CEVRE,
  PLATFORM_ADI,
  amacAdi,
  asamaDagilimi,
  asamaEtiketi,
  aySayisi,
  beklenenKutulari,
  belgeMetni,
  bolumBasligi,
  bolumNumarasi,
  donemMetni,
  filigran,
  gorunurBolumler,
  halkaYaylari,
  kalemDurumSatirlari,
  kalemPlatformTutarlari,
  konumOzeti,
  onayCumlesi,
  payMetni,
  platformToplamlari,
  tahminMetni,
  takvimAylari,
  takvimCubugu,
  tarihAraligi,
  yasMetni,
  yuzde,
} from './hesap';
import { stratejiHesapSozlugu } from '@/dil/sozlukler/strateji-v2';
import { stratejiBelgeSozlugu } from '@/dil/sozlukler/strateji-v2-belge';
import { Nokta, Etiket } from './ortak';
import { Tutar } from './tutar';
import type { Gerceklesen, StratejiBelgeVerisi } from '@advetics/shared';

/**
 * ═══ STRATEJİ BELGESİ — MÜŞTERİNİN GÖRDÜĞÜ (panel referans, PDF ikizi) ═══
 *
 * Bölüm sırası TEK LİSTEDEN (`STRATEJI_BELGE_BOLUMLERI`, shared): panel ve
 * PDF aynı listeyi gezer. Çizici bir `Record<StratejiBolumKodu, …>`: listeye
 * bölüm eklenince derleme burada kırılır; rapor PDF'indeki `PLATFORM_SIRASI`
 * dersi (döngünün gezmediği bölüm hata vermeden HİÇ çizilmez) burada
 * tekrarlanamaz.
 *
 * Bu bileşen HOOK TAŞIMAZ: hem panelde (istemci kabı içinde) hem girişsiz
 * onay sayfasında (sunucu) aynısı çiziliyor. Onay kutusu bir YUVA
 * (`onayYuvasi`): panelde oturumla, bağlantıda ad + e-postayla karar verilir;
 * belge ikisinde de aynı.
 *
 * KAĞIT HER TEMADA BEYAZ: belge müşteriye giden bir belge, PDF'i beyaz ve
 * logo (siyah yazı, kırmızı nokta) koyu zeminde kayboluyordu.
 *
 * YAPAY ZEKÂ ÖNERİSİ BELGEYE GİRMEZ (`belgeMetni` → `belgeyeGirerMi`):
 * ajans "Kullan" demeden müşteriye strateji diye gösterilmez.
 */
export function StratejiBelgesi({
  veri,
  onayYuvasi,
  gerceklesen,
  kapakBasligi = 'h1',
  dil = 'tr',
}: {
  veri: StratejiBelgeVerisi;
  onayYuvasi: ReactNode;
  /**
   * Kapaktaki "Dijital Reklam Stratejisi" başlığının seviyesi. Girişsiz onay
   * sayfasında belge sayfanın KENDİSİ ve başlığı `h1`; panelde sayfa
   * başlığı (AdvStrategy) zaten `h1` ve belge onun altında bir bölüm, yani
   * `h2`. Görünüş sınıftan geliyor, seviye değişince değişmiyor.
   */
  kapakBasligi?: 'h1' | 'h2';
  gerceklesen: { tur: 'veri'; v: Gerceklesen } | { tur: 'hata'; mesaj: string } | null;
  /**
   * Belgenin dili. Bileşen direktifsiz (girişsiz onay sayfasında sunucuda da
   * çiziliyor), kanca kullanamaz: dil propla geliyor. Varsayılan Türkçe;
   * panel ekranı kullanıcının dilini geçiriyor, onay sayfası henüz geçirmiyor.
   */
  dil?: Dil;
}) {
  const durum = veri.plan.durum;
  const cizici: Record<StratejiBolumKodu, () => ReactNode> = {
    kapak: () => <Kapak veri={veri} baslik={kapakBasligi} dil={dil} />,
    ozet: () => <Ozet veri={veri} dil={dil} />,
    isletme: () => <Isletme veri={veri} dil={dil} />,
    gecmis: () => <GecmisBolumu veri={veri} dil={dil} />,
    hedefler: () => <Hedefler veri={veri} dil={dil} />,
    butce: () => <ButceBolumu veri={veri} dil={dil} />,
    kampanyalar: () => <Kampanyalar veri={veri} dil={dil} />,
    kitle: () => <Kitle veri={veri} dil={dil} />,
    kreatif: () => <Kreatif veri={veri} dil={dil} />,
    takvim: () => <Takvim veri={veri} dil={dil} />,
    olcum: () => <OlcumBolumu veri={veri} dil={dil} />,
    riskler: () => <Riskler veri={veri} dil={dil} />,
    onay: () => onayYuvasi,
    gerceklesen: () => <GerceklesenBolumu veri={veri} gerceklesen={gerceklesen} dil={dil} />,
  };
  return (
    <article className="strateji-kagit mx-auto w-full max-w-[860px] overflow-hidden rounded border border-line bg-white text-black shadow-kart">
      {gorunurBolumler(durum).map((b) =>
        b.kod === 'kapak' ? (
          <div key={b.kod}>{cizici.kapak()}</div>
        ) : (
          <Sayfa key={b.kod} no={bolumNumarasi(b.kod, durum)} baslik={bolumBasligi(b.kod, dil)}>
            {cizici[b.kod]()}
          </Sayfa>
        ),
      )}
    </article>
  );
}

function Sayfa({ no, baslik, children }: { no: string | null; baslik: string; children: ReactNode }) {
  return (
    <section className="border-b border-dashed border-black/20 px-5 py-8 last:border-b-0 sm:px-14 sm:py-12" aria-label={baslik}>
      <span className="font-baslik text-[13px] font-extrabold tracking-[0.08em] text-[var(--kirmizi)]">{no}</span>
      <h2 className="font-baslik mb-3 mt-0.5 text-[22px] font-bold">{baslik}</h2>
      {children}
    </section>
  );
}

const IKINCIL = 'text-[var(--gri)]/70';
const CIZGI = 'border-black/10';

function Kapak({ veri, baslik: Baslik, dil }: { veri: StratejiBelgeVerisi; baslik: 'h1' | 'h2'; dil: Dil }) {
  const bm = sec(stratejiBelgeSozlugu, dil).kapak;
  const { plan } = veri;
  const f = filigran(plan.durum, dil);
  const onay = onayCumlesi(plan.onay, dil);
  return (
    <section className="relative flex min-h-[480px] flex-col border-b border-dashed border-black/20 px-5 py-8 sm:min-h-[620px] sm:px-14 sm:py-12" aria-label={bm.kapak}>
      {/* Logo ve filigran AYNI satırda, akışta: mutlak konumlu filigran telefonda logonun üstüne biniyordu. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* YALNIZ ADVETICS LOGOSU (kullanıcı kararı K-1): kapakta ajansın ya da Profaj'ın logosu yok. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/advetics-logo.png" alt="Advetics" width={168} height={35} className="h-[35px] w-auto" />
        {f && (
          <span className="font-baslik rounded border border-black/20 px-2.5 py-1 text-[13px] font-extrabold tracking-[0.2em] text-black/45">{f}</span>
        )}
      </div>
      <p className={`mb-1.5 mt-auto text-[15px] ${IKINCIL}`}>{plan.workspaceAdi}</p>
      <Baslik className="font-baslik m-0 text-[32px] font-extrabold leading-[1.06] tracking-[-0.02em] sm:text-[44px]">
        {bm.baslikUst}
        <br />
        <span className="text-[var(--kirmizi)]">{bm.baslikAlt}</span>
      </Baslik>
      <div className="mb-[18px] mt-[26px] h-[5px] w-[72px] bg-brand" />
      <div className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-3">
        <div>
          <span className={`block text-xs ${IKINCIL}`}>{bm.donem}</span>
          {donemMetni(plan.baslangic, plan.bitis, dil)}
        </div>
        <div>
          <span className={`block text-xs ${IKINCIL}`}>{bm.toplamButce}</span>
          <Tutar micros={plan.toplamButceMicros} para={plan.paraBirimi} />
        </div>
        <div>
          <span className={`block text-xs ${IKINCIL}`}>{bm.hazirlayan}</span>
          {plan.hazirlayan ?? bm.ajans} · {bm.surum(plan.surum)}
        </div>
      </div>
      {onay && <p className="mt-4 text-[13px] font-semibold">{onay}</p>}
    </section>
  );
}

function BosMetin({ children }: { children: ReactNode }) {
  return <p className={`m-0 text-sm ${IKINCIL}`}>{children}</p>;
}

function Ozet({ veri, dil }: { veri: StratejiBelgeVerisi; dil: Dil }) {
  const bm = sec(stratejiBelgeSozlugu, dil).ozet;
  const { plan, kalemler } = veri;
  const metin = belgeMetni(veri.bolumler.ozet);
  const beklenen = beklenenKutulari(kalemler).slice(0, 1);
  return (
    <>
      {metin ? <p className="mb-5 mt-0 whitespace-pre-line text-sm leading-relaxed">{metin}</p> : <BosMetin>{bm.yazilmadi}</BosMetin>}
      <div className={`mt-4 grid grid-cols-2 overflow-hidden rounded-[10px] border sm:grid-cols-4 ${CIZGI}`}>
        <Kutu etiket={bm.donem} deger={bm.ay(aySayisi(plan.baslangic, plan.bitis))} />
        <Kutu etiket={bm.kampanya} deger={String(kalemler.length)} />
        {beklenen[0] ? (
          <Kutu
            etiket={bm.beklenen(beklenen[0].birim, PLATFORM_ADI[beklenen[0].platform])}
            deger={beklenen[0].alt === beklenen[0].ust ? String(beklenen[0].alt) : `${beklenen[0].alt}-${beklenen[0].ust}`}
            alt={bm.hesapVerisi}
          />
        ) : (
          <Kutu etiket={bm.beklenenSonuc} deger={bm.tahminYok} alt={bm.gecmisVeriYok} />
        )}
        <div className="col-span-2 bg-[var(--gri)] px-4 py-3.5 text-white sm:col-span-1">
          <div className="text-xs text-white/75">{bm.toplamButce}</div>
          <Tutar micros={plan.toplamButceMicros} para={plan.paraBirimi} className="text-[20px] font-bold" />
        </div>
      </div>
    </>
  );
}

function Kutu({ etiket, deger, alt }: { etiket: string; deger: ReactNode; alt?: string }) {
  return (
    <div className={`border-b border-r px-4 py-3.5 sm:border-b-0 ${CIZGI}`}>
      <div className={`text-xs ${IKINCIL}`}>{etiket}</div>
      <div className="font-baslik text-[20px] font-bold tracking-[-0.01em]">{deger}</div>
      {alt && <div className="text-[11px] text-black/45">{alt}</div>}
    </div>
  );
}

function Isletme({ veri, dil }: { veri: StratejiBelgeVerisi; dil: Dil }) {
  const bm = sec(stratejiBelgeSozlugu, dil).isletme;
  const metin = belgeMetni(veri.bolumler.isletme);
  return (
    <>
      <p className={`mb-4 mt-0 text-sm ${IKINCIL}`}>{bm.kaynak}</p>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          {veri.isletme.length === 0 && <BosMetin>{bm.bilgiYok}</BosMetin>}
          {veri.isletme.map((s) => (
            <div key={s.etiket} className={`flex justify-between gap-3 border-b py-2 text-[13px] ${CIZGI}`}>
              <span className={IKINCIL}>{s.etiket}</span>
              <span className={`text-right ${s.deger === null ? IKINCIL : ''}`}>{s.deger ?? bm.bos}</span>
            </div>
          ))}
        </div>
        <div className="text-[13px] leading-relaxed">{metin ? <p className="m-0 whitespace-pre-line">{metin}</p> : <BosMetin>{bm.analizYok}</BosMetin>}</div>
      </div>
    </>
  );
}

function GecmisBolumu({ veri, dil }: { veri: StratejiBelgeVerisi; dil: Dil }) {
  const bm = sec(stratejiBelgeSozlugu, dil).gecmis;
  const { gecmis, plan } = veri;
  return (
    <>
      <p className={`mb-4 mt-0 text-sm ${IKINCIL}`}>
        {bm.aciklama(gecmis.gun)}
      </p>
      {gecmis.satirlar.length === 0 ? (
        <BosMetin>{gecmis.bosNedeni ?? bm.harcamaYok}</BosMetin>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className={`border-b text-left text-xs ${CIZGI} ${IKINCIL}`}>
                <th className="py-2 pr-3 font-semibold">{bm.platformAmac}</th>
                <th className="py-2 pr-3 text-right font-semibold">{bm.harcama}</th>
                <th className="py-2 pr-3 text-right font-semibold">{bm.sonuc}</th>
                <th className="py-2 text-right font-semibold">{bm.sonucBasi}</th>
              </tr>
            </thead>
            <tbody>
              {gecmis.satirlar.map((s, i) => (
                <tr key={i} className={`border-b ${CIZGI}`}>
                  <td className="py-2.5 pr-3">
                    {PLATFORM_ADI[s.platform]} · {s.etiket}
                  </td>
                  <td className="py-2.5 pr-3 text-right">
                    <Tutar micros={s.harcamaMicros} para={plan.paraBirimi} />
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{s.sonuc === null ? bm.olculmuyor : `${s.sonuc.toLocaleString(dil === 'en' ? 'en-US' : 'tr-TR')} ${s.birim}`}</td>
                  <td className="py-2.5 text-right">
                    {s.sonuc && s.sonuc > 0 ? <Tutar micros={(BigInt(s.harcamaMicros) * 10_000n / BigInt(Math.round(s.sonuc * 10_000))).toString()} para={plan.paraBirimi} /> : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Hedefler({ veri, dil }: { veri: StratejiBelgeVerisi; dil: Dil }) {
  const bm = sec(stratejiBelgeSozlugu, dil).hedefler;
  if (veri.kalemler.length === 0) return <BosMetin>{bm.kampanyaYok}</BosMetin>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className={`border-b text-left text-xs ${CIZGI} ${IKINCIL}`}>
            <th className="py-2 pr-3 font-semibold">{bm.kampanya}</th>
            <th className="py-2 pr-3 font-semibold">{bm.olcut}</th>
            <th className="py-2 pr-3 font-semibold">Meta</th>
            <th className="py-2 font-semibold">Google</th>
          </tr>
        </thead>
        <tbody>
          {veri.kalemler.map((k) => (
            <tr key={k.id} className={`border-b align-top ${CIZGI}`}>
              <td className="py-2.5 pr-3 font-semibold">{amacAdi(k.amac)}</td>
              <td className="py-2.5 pr-3">{AMAC_OLCUTU[k.amac].birim}</td>
              {(['meta', 'google'] as const).map((p) => {
                const t = tahminMetni(k.tahmin[p], k.amac, dil);
                return (
                  <td key={p} className="py-2.5 pr-3">
                    {t.ana}
                    <span className="block text-[11px] text-black/45">{t.alt}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Halka + aşama çubukları. Meta gri, Google kırmızı (kılavuz). */
function ButceBolumu({ veri, dil }: { veri: StratejiBelgeVerisi; dil: Dil }) {
  const bm = sec(stratejiBelgeSozlugu, dil).butce;
  const { plan, kalemler } = veri;
  const p = platformToplamlari(kalemler, plan.paraBirimi);
  const yay = halkaYaylari(p.meta, p.google);
  const asamalar = asamaDagilimi(kalemler, plan.paraBirimi);
  return (
    <>
      <p className={`mb-4 mt-0 text-sm ${IKINCIL}`}>{bm.aciklama}</p>
      <div className="grid items-center gap-6 md:grid-cols-[220px_1fr]">
        <svg viewBox="0 0 200 200" width="200" height="200" role="img" aria-label={bm.halka(Math.round(yuzde(p.meta, p.meta + p.google)), Math.round(yuzde(p.google, p.meta + p.google)))} className="mx-auto">
          <circle cx="100" cy="100" r="70" fill="none" stroke="rgba(48,46,45,.07)" strokeWidth="28" />
          <circle cx="100" cy="100" r="70" fill="none" className="stroke-[var(--gri)]" strokeWidth="28" strokeDasharray={`${yay.meta} ${HALKA_CEVRE}`} transform="rotate(-90 100 100)" />
          <circle cx="100" cy="100" r="70" fill="none" className="stroke-[var(--kirmizi)]" strokeWidth="28" strokeDasharray={`${yay.google} ${HALKA_CEVRE}`} strokeDashoffset={-yay.meta} transform="rotate(-90 100 100)" />
          <text x="100" y="96" textAnchor="middle" className="tutar" fontWeight="700" fontSize="17" fill="#000">
            {/* SVG içinde de Montserrat: `₺` Open Sans'ta yok. */}
            {kisaTutar(plan.toplamButceMicros)} {plan.paraBirimi === 'TRY' ? '₺' : plan.paraBirimi}
          </text>
          <text x="100" y="116" textAnchor="middle" fontSize="11" fill="rgba(48,46,45,.62)">
            {bm.toplamAy(aySayisi(plan.baslangic, plan.bitis))}
          </text>
        </svg>
        <div>
          <div className={`mb-2.5 flex flex-wrap gap-3.5 text-xs ${IKINCIL}`}>
            <span>
              <i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-[var(--gri)] align-[-1px]" />
              Meta <Tutar micros={p.meta} para={plan.paraBirimi} />
            </span>
            <span>
              <i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-brand align-[-1px]" />
              Google <Tutar micros={p.google} para={plan.paraBirimi} />
            </span>
          </div>
          {asamalar.map((a) => (
            <div key={a.asama} className="my-2 grid grid-cols-[80px_1fr_100px] items-center gap-2.5 text-[13px] sm:grid-cols-[110px_1fr_120px]">
              <span>{asamaEtiketi(a.asama, dil)}</span>
              <div className="flex h-3.5 overflow-hidden rounded-[7px] bg-black/[0.07]">
                <span className="block h-full bg-[var(--gri)]" style={{ width: `${yuzde(a.meta, a.toplam)}%` }} />
                <span className="block h-full bg-brand" style={{ width: `${yuzde(a.google, a.toplam)}%` }} />
              </div>
              <Tutar micros={a.toplam} para={plan.paraBirimi} className="text-right" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/** Halkanın ortası için binlik ayraçlı tam kısım (kuruş yok; tam tutar lejantta). */
function kisaTutar(micros: string): string {
  return (BigInt(micros) / 1_000_000n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function Kampanyalar({ veri, dil }: { veri: StratejiBelgeVerisi; dil: Dil }) {
  const bm = sec(stratejiBelgeSozlugu, dil).kampanyalar;
  const { kalemler, plan } = veri;
  if (kalemler.length === 0) return <BosMetin>{bm.kampanyaYok}</BosMetin>;
  return (
    <>
      <p className={`mb-4 mt-0 text-sm ${IKINCIL}`}>{bm.aciklama}</p>
      {kalemler.map((k) => (
        <KalemKarti key={k.id} k={k} para={plan.paraBirimi} dil={dil} />
      ))}
    </>
  );
}

function KalemKarti({ k, para, dil }: { k: StratejiKalemi; para: string; dil: Dil }) {
  const bm = sec(stratejiBelgeSozlugu, dil).kalem;
  const yon = belgeMetni(k.kreatifYonergesi);
  const metin = k.metin && k.metin.kaynak === 'ajans' ? k.metin : null;
  const t = kalemPlatformTutarlari(k, para);
  const g = REHBER_AMACLARI[k.amac].google;
  return (
    <div className={`mb-3 break-inside-avoid rounded-[10px] border p-4 ${CIZGI}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <AmacIkonu amac={k.amac} />
          <div>
            <b className="block text-[15px]">{amacAdi(k.amac)}</b>
            <span className={`text-xs ${IKINCIL}`}>
              {asamaEtiketi(AMAC_ASAMASI[k.amac], dil)} · {REHBER_AMACLARI[k.amac].neAlacaksin}
            </span>
          </div>
        </div>
        <Tutar micros={k.butceMicros} para={para} className="text-lg font-bold" />
      </div>
      <dl className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px] md:grid-cols-4">
        <div>
          <dt className={`text-[11px] font-semibold ${IKINCIL}`}>{bm.nerede}</dt>
          <dd className="m-0">
            {k.meta && <span className="block">Meta: <Tutar micros={t.meta} para={para} /></span>}
            {k.google && <span className="block">{g.kurgu ? g.nerede : 'Google'}: <Tutar micros={t.google} para={para} /></span>}
          </dd>
        </div>
        <div>
          <dt className={`text-[11px] font-semibold ${IKINCIL}`}>{bm.tarih}</dt>
          <dd className="m-0">{tarihAraligi(k.baslangic, k.bitis, dil)}</dd>
        </div>
        <div>
          <dt className={`text-[11px] font-semibold ${IKINCIL}`}>{bm.bolgeYas}</dt>
          <dd className="m-0">
            {konumOzeti(k.konumlar, dil)} · {yasMetni(k.yasMin, k.yasMax)}
          </dd>
        </div>
        <div>
          <dt className={`text-[11px] font-semibold ${IKINCIL}`}>{bm.beklenenKisa}</dt>
          <dd className="m-0">
            {(['meta', 'google'] as const)
              .filter((p) => k[p])
              .map((p) => {
                const x = tahminMetni(k.tahmin[p], k.amac, dil);
                return (
                  <span key={p} className="block">
                    {k.meta && k.google ? `${PLATFORM_ADI[p]}: ` : ''}
                    {x.ana} {x.veri && <Etiket>{bm.veri}</Etiket>}
                  </span>
                );
              })}
          </dd>
        </div>
      </dl>
      {(yon || metin) && (
        <div className={`mt-3 border-t pt-3 text-[13px] ${CIZGI}`}>
          {yon && (
            <p className="m-0">
              <b>{bm.gorselMesaj}</b> {yon}
            </p>
          )}
          {metin && metin.basliklar[0] && <p className={`m-0 mt-1 ${IKINCIL}`}>{bm.ornekBaslik(metin.basliklar[0])}</p>}
        </div>
      )}
    </div>
  );
}

export function AmacIkonu({ amac }: { amac: StratejiKalemi['amac'] }) {
  const donusum = AMAC_ASAMASI[amac] === 'donusum';
  return (
    <span className={`font-baslik grid h-[30px] w-[30px] flex-none place-items-center rounded-lg text-xs font-bold text-white ${donusum ? 'bg-brand' : 'bg-[var(--gri)]'}`} aria-hidden>
      {amacAdi(amac).charAt(0)}
    </span>
  );
}

function Kitle({ veri, dil }: { veri: StratejiBelgeVerisi; dil: Dil }) {
  const bm = sec(stratejiBelgeSozlugu, dil).kitle;
  const metin = belgeMetni(veri.bolumler.kitle);
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        {veri.kalemler.map((k) => (
          <div key={k.id} className={`flex justify-between gap-3 border-b py-2 text-[13px] ${CIZGI}`}>
            <span className={IKINCIL}>{amacAdi(k.amac)}</span>
            <span className="text-right">
              {k.konumlar.map((x) => x.etiket).join(', ') || sec(stratejiHesapSozlugu, dil).bolgeSecilmedi} · {yasMetni(k.yasMin, k.yasMax)}
            </span>
          </div>
        ))}
      </div>
      <div className="text-[13px] leading-relaxed">
        <p className={`m-0 mb-1.5 text-xs font-semibold ${IKINCIL}`}>{bm.kime}</p>
        {metin ? <p className="m-0 whitespace-pre-line">{metin}</p> : <BosMetin>{bm.tarifYok}</BosMetin>}
        <p className="mt-2 text-[11px] text-black/45">{bm.not}</p>
      </div>
    </div>
  );
}

function Kreatif({ veri, dil }: { veri: StratejiBelgeVerisi; dil: Dil }) {
  const bm = sec(stratejiBelgeSozlugu, dil).kreatif;
  const metin = belgeMetni(veri.bolumler.kreatif);
  const kalemYonleri = veri.kalemler.map((k) => ({ k, yon: belgeMetni(k.kreatifYonergesi) })).filter((x) => x.yon);
  return (
    <>
      {metin ? <p className="mb-4 mt-0 whitespace-pre-line text-sm leading-relaxed">{metin}</p> : <BosMetin>{bm.yazilmadi}</BosMetin>}
      {kalemYonleri.map(({ k, yon }) => (
        <p key={k.id} className={`m-0 border-t py-2 text-[13px] ${CIZGI}`}>
          <b>{amacAdi(k.amac)}:</b> {yon}
        </p>
      ))}
    </>
  );
}

function Takvim({ veri, dil }: { veri: StratejiBelgeVerisi; dil: Dil }) {
  const bm = sec(stratejiBelgeSozlugu, dil).takvim;
  const { plan, kalemler } = veri;
  const aylar = takvimAylari(plan, dil);
  if (kalemler.length === 0) return <BosMetin>{bm.kampanyaYok}</BosMetin>;
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px] text-[11px]">
        <div className={`grid grid-cols-[150px_1fr] border-b ${CIZGI}`}>
          <span className={`py-1 ${IKINCIL}`}>{bm.kampanya}</span>
          <div className="flex">
            {aylar.map((a) => (
              <span key={a.ad} className={`border-l py-1 text-center ${CIZGI} ${IKINCIL}`} style={{ width: `${a.genislik}%` }}>
                {a.ad}
              </span>
            ))}
          </div>
        </div>
        {kalemler.map((k) => {
          const c = takvimCubugu(k, plan);
          return (
            <div key={k.id} className={`grid grid-cols-[150px_1fr] items-center border-b ${CIZGI}`}>
              <span className="py-2 pr-2 text-xs font-semibold">{amacAdi(k.amac)}</span>
              <div className="relative h-9">
                <span
                  className={`absolute top-[11px] h-3.5 rounded-[7px] ${k.meta && !k.google ? 'bg-[var(--gri)]' : k.google && !k.meta ? 'bg-brand' : 'bg-[var(--gri)]/60'}`}
                  style={{ left: `${c.sol}%`, width: `${c.genislik}%` }}
                  title={tarihAraligi(k.baslangic, k.bitis, dil)}
                />
              </div>
            </div>
          );
        })}
        <p className="mt-2 text-[11px] text-black/45">{bm.aciklama}</p>
      </div>
    </div>
  );
}

function OlcumBolumu({ veri, dil }: { veri: StratejiBelgeVerisi; dil: Dil }) {
  const bm = sec(stratejiBelgeSozlugu, dil).olcum;
  if (veri.olcum.length === 0) return <BosMetin>{bm.yok}</BosMetin>;
  return (
    <div>
      {veri.olcum.map((o, i) => (
        <div key={i} className={`flex justify-between gap-3 border-b py-2 text-[13px] ${CIZGI}`}>
          <span className={IKINCIL}>
            {o.etiket}
            {o.platform ? ` · ${PLATFORM_ADI[o.platform]}` : ''}
          </span>
          <span className={`inline-flex items-center gap-1.5 ${o.durum === 'kurulmali' ? 'font-semibold text-[var(--kirmizi)]' : ''}`}>
            {o.durum === 'hazir' && <Nokta ton="ok" />}
            {bm.durum[o.durum]}
          </span>
        </div>
      ))}
    </div>
  );
}

function Riskler({ veri, dil }: { veri: StratejiBelgeVerisi; dil: Dil }) {
  const bm = sec(stratejiBelgeSozlugu, dil).riskler;
  if (veri.riskler.length === 0) return <BosMetin>{bm.yok}</BosMetin>;
  return (
    <div>
      {veri.riskler.map((r, i) => (
        <div key={i} className={`flex gap-2.5 border-b py-2.5 text-[13px] last:border-b-0 ${CIZGI}`}>
          <span className="min-w-[84px] text-[11px] font-semibold text-black/45">{r.kalem ? bm.kampanya(r.kalem) : bm.genel}</span>
          <span>{r.metin}</span>
        </div>
      ))}
    </div>
  );
}

function GerceklesenBolumu({ veri, gerceklesen, dil }: { veri: StratejiBelgeVerisi; gerceklesen: { tur: 'veri'; v: Gerceklesen } | { tur: 'hata'; mesaj: string } | null; dil: Dil }) {
  const bm = sec(stratejiBelgeSozlugu, dil).gerceklesen;
  if (gerceklesen === null) return <BosMetin>{bm.yuklenmedi}</BosMetin>;
  if (gerceklesen.tur === 'hata') return <p className="m-0 text-sm text-[var(--kirmizi)]" role="alert">{bm.alinamadi(gerceklesen.mesaj)}</p>;
  return <PlanGerceklesenTablosu veri={veri} g={gerceklesen.v} dil={dil} />;
}

/** Plan ve gerçekleşen — aktarım ekranı ve belge AYNI tabloyu çizer. */
export function PlanGerceklesenTablosu({ veri, g, dil = 'tr' }: { veri: Pick<StratejiBelgeVerisi, 'plan' | 'kalemler'>; g: Gerceklesen; dil?: Dil }) {
  const bm = sec(stratejiBelgeSozlugu, dil).tablo;
  const para = veri.plan.paraBirimi;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className={`border-b text-left text-xs ${CIZGI} ${IKINCIL}`}>
            <th className="py-2 pr-3 font-semibold">{bm.kampanya}</th>
            <th className="py-2 pr-3 font-semibold">{bm.durum}</th>
            <th className="py-2 pr-3 text-right font-semibold">{bm.harcananPlan}</th>
            <th className="py-2 pr-3 text-right font-semibold">{bm.sonucBeklenen}</th>
            <th className="hidden py-2 font-semibold md:table-cell">{bm.not}</th>
          </tr>
        </thead>
        <tbody>
          {veri.kalemler.map((k) => {
            const satir = g.kalemler.find((x) => x.kalemId === k.id);
            const plan = kalemPlatformTutarlari(k, para);
            return (['meta', 'google'] as const)
              .filter((p) => k[p])
              .map((p) => {
                const x = satir?.platformlar[p];
                const t = tahminMetni(k.tahmin[p], k.amac, dil);
                const durum = kalemDurumSatirlari(k.durum, dil).find((d) => d.platform === p || d.platform === null);
                const sapma = x?.kurulanButceMicros && x.kurulanButceMicros !== plan[p].toString();
                return (
                  <tr key={`${k.id}-${p}`} className={`border-b align-top ${CIZGI}`}>
                    <td className="py-2.5 pr-3">
                      {amacAdi(k.amac)} · {PLATFORM_ADI[p]}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="inline-flex items-center gap-1.5">
                        <Nokta ton={durum?.nokta ?? 'notr'} />
                        {durum?.metin.split(' · ')[0] ?? bm.aktarilmadi}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      {x ? <Tutar micros={x.harcananMicros} para={para} /> : '-'} / <Tutar micros={plan[p]} para={para} />
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {x?.sonuc != null ? x.sonuc.toLocaleString(dil === 'en' ? 'en-US' : 'tr-TR') : '-'} / {t.veri ? t.ana : bm.tahminYok}
                    </td>
                    <td className={`hidden py-2.5 text-xs md:table-cell ${IKINCIL}`}>
                      {sapma ? (
                        <>
                          {bm.butceDegisti} <Tutar micros={plan[p]} para={para} />, {bm.kurulan} <Tutar micros={x.kurulanButceMicros!} para={para} />
                        </>
                      ) : !x ? (
                        bm.veriYok
                      ) : (
                        ''
                      )}
                    </td>
                  </tr>
                );
              });
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-black/45">{bm.ayri} {donemMetni(veri.plan.baslangic, veri.plan.bitis, dil)}.</p>
    </div>
  );
}
