import type { ReactNode } from 'react';
import {
  AMAC_ASAMASI,
  AMAC_OLCUTU,
  REHBER_AMACLARI,
  STRATEJI_ASAMA_ETIKETI,
  type StratejiBolumKodu,
  type StratejiKalemi,
} from '@advetics/shared';
import {
  HALKA_CEVRE,
  PLATFORM_ADI,
  amacAdi,
  asamaDagilimi,
  aySayisi,
  beklenenKutulari,
  belgeMetni,
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
import { Nokta, Rozet } from './ortak';
import { Tutar } from './tutar';
import type { Gerceklesen, StratejiBelgeVerisi } from './yanit';

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
}: {
  veri: StratejiBelgeVerisi;
  onayYuvasi: ReactNode;
  gerceklesen: { tur: 'veri'; v: Gerceklesen } | { tur: 'hata'; mesaj: string } | null;
}) {
  const durum = veri.plan.durum;
  const cizici: Record<StratejiBolumKodu, () => ReactNode> = {
    kapak: () => <Kapak veri={veri} />,
    ozet: () => <Ozet veri={veri} />,
    isletme: () => <Isletme veri={veri} />,
    gecmis: () => <GecmisBolumu veri={veri} />,
    hedefler: () => <Hedefler veri={veri} />,
    butce: () => <ButceBolumu veri={veri} />,
    kampanyalar: () => <Kampanyalar veri={veri} />,
    kitle: () => <Kitle veri={veri} />,
    kreatif: () => <Kreatif veri={veri} />,
    takvim: () => <Takvim veri={veri} />,
    olcum: () => <OlcumBolumu veri={veri} />,
    riskler: () => <Riskler veri={veri} />,
    onay: () => onayYuvasi,
    gerceklesen: () => <GerceklesenBolumu veri={veri} gerceklesen={gerceklesen} />,
  };
  return (
    <article className="strateji-kagit mx-auto w-full max-w-[860px] overflow-hidden rounded border border-line bg-white text-black shadow-kart">
      {gorunurBolumler(durum).map((b) =>
        b.kod === 'kapak' ? (
          <div key={b.kod}>{cizici.kapak()}</div>
        ) : (
          <Sayfa key={b.kod} no={bolumNumarasi(b.kod, durum)} baslik={b.baslik}>
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
      <span className="font-baslik text-[13px] font-extrabold tracking-[0.08em] text-[#ff2400]">{no}</span>
      <h2 className="font-baslik mb-3 mt-0.5 text-[22px] font-bold">{baslik}</h2>
      {children}
    </section>
  );
}

const IKINCIL = 'text-[#302e2d]/70';
const CIZGI = 'border-black/10';

function Kapak({ veri }: { veri: StratejiBelgeVerisi }) {
  const { plan } = veri;
  const f = filigran(plan.durum);
  const onay = onayCumlesi(plan.onay);
  return (
    <section className="relative flex min-h-[480px] flex-col border-b border-dashed border-black/20 px-5 py-8 sm:min-h-[620px] sm:px-14 sm:py-12" aria-label="Kapak">
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
      <h1 className="font-baslik m-0 text-[32px] font-extrabold leading-[1.06] tracking-[-0.02em] sm:text-[44px]">
        Dijital Reklam
        <br />
        <span className="text-[#ff2400]">Stratejisi</span>
      </h1>
      <div className="mb-[18px] mt-[26px] h-[5px] w-[72px] bg-brand" />
      <div className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-3">
        <div>
          <span className={`block text-xs ${IKINCIL}`}>Dönem</span>
          {donemMetni(plan.baslangic, plan.bitis)}
        </div>
        <div>
          <span className={`block text-xs ${IKINCIL}`}>Toplam bütçe</span>
          <Tutar micros={plan.toplamButceMicros} para={plan.paraBirimi} />
        </div>
        <div>
          <span className={`block text-xs ${IKINCIL}`}>Hazırlayan</span>
          {plan.hazirlayan ?? 'Ajans'} · sürüm {plan.surum}
        </div>
      </div>
      {onay && <p className="mt-4 text-[13px] font-semibold">{onay}</p>}
    </section>
  );
}

function BosMetin({ children }: { children: ReactNode }) {
  return <p className={`m-0 text-sm ${IKINCIL}`}>{children}</p>;
}

function Ozet({ veri }: { veri: StratejiBelgeVerisi }) {
  const { plan, kalemler } = veri;
  const metin = belgeMetni(veri.bolumler.ozet);
  const beklenen = beklenenKutulari(kalemler).slice(0, 1);
  return (
    <>
      {metin ? <p className="mb-5 mt-0 whitespace-pre-line text-sm leading-relaxed">{metin}</p> : <BosMetin>Özet henüz yazılmadı.</BosMetin>}
      <div className={`mt-4 grid grid-cols-2 overflow-hidden rounded-[10px] border sm:grid-cols-4 ${CIZGI}`}>
        <Kutu etiket="Dönem" deger={`${aySayisi(plan.baslangic, plan.bitis)} ay`} />
        <Kutu etiket="Kampanya" deger={String(kalemler.length)} />
        {beklenen[0] ? (
          <Kutu
            etiket={`Beklenen ${beklenen[0].birim} · ${PLATFORM_ADI[beklenen[0].platform]}`}
            deger={beklenen[0].alt === beklenen[0].ust ? String(beklenen[0].alt) : `${beklenen[0].alt}-${beklenen[0].ust}`}
            alt="Hesabınızın verisi"
          />
        ) : (
          <Kutu etiket="Beklenen sonuç" deger="Tahmin yok" alt="Geçmiş veri yok" />
        )}
        <div className="col-span-2 bg-[#302e2d] px-4 py-3.5 text-white sm:col-span-1">
          <div className="text-xs text-white/75">Toplam bütçe</div>
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

function Isletme({ veri }: { veri: StratejiBelgeVerisi }) {
  const metin = belgeMetni(veri.bolumler.isletme);
  return (
    <>
      <p className={`mb-4 mt-0 text-sm ${IKINCIL}`}>Marka Merkezi ve sitenizden. Boş alanlar uydurulmadı.</p>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          {veri.isletme.length === 0 && <BosMetin>Marka Merkezi'nde işletme bilgisi yok.</BosMetin>}
          {veri.isletme.map((s) => (
            <div key={s.etiket} className={`flex justify-between gap-3 border-b py-2 text-[13px] ${CIZGI}`}>
              <span className={IKINCIL}>{s.etiket}</span>
              <span className={`text-right ${s.deger === null ? IKINCIL : ''}`}>{s.deger ?? "Marka Merkezi'nde boş"}</span>
            </div>
          ))}
        </div>
        <div className="text-[13px] leading-relaxed">{metin ? <p className="m-0 whitespace-pre-line">{metin}</p> : <BosMetin>Analiz metni henüz yazılmadı.</BosMetin>}</div>
      </div>
    </>
  );
}

function GecmisBolumu({ veri }: { veri: StratejiBelgeVerisi }) {
  const { gecmis, plan } = veri;
  return (
    <>
      <p className={`mb-4 mt-0 text-sm ${IKINCIL}`}>
        Son {gecmis.gun} gün, hesaplarınızın verisi. Meta ve Google sonuçları farklı sayıldığı için toplanmıyor.
      </p>
      {gecmis.satirlar.length === 0 ? (
        <BosMetin>{gecmis.bosNedeni ?? 'Bu dönemde harcama yok.'}</BosMetin>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className={`border-b text-left text-xs ${CIZGI} ${IKINCIL}`}>
                <th className="py-2 pr-3 font-semibold">Platform · amaç</th>
                <th className="py-2 pr-3 text-right font-semibold">Harcama</th>
                <th className="py-2 pr-3 text-right font-semibold">Sonuç</th>
                <th className="py-2 text-right font-semibold">Sonuç başı</th>
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
                  <td className="py-2.5 pr-3 text-right tabular-nums">{s.sonuc === null ? 'Ölçülmüyor' : `${s.sonuc.toLocaleString('tr-TR')} ${s.birim}`}</td>
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

function Hedefler({ veri }: { veri: StratejiBelgeVerisi }) {
  if (veri.kalemler.length === 0) return <BosMetin>Kampanya yok.</BosMetin>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className={`border-b text-left text-xs ${CIZGI} ${IKINCIL}`}>
            <th className="py-2 pr-3 font-semibold">Kampanya</th>
            <th className="py-2 pr-3 font-semibold">Ölçüt</th>
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
                const t = tahminMetni(k.tahmin[p], k.amac);
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
function ButceBolumu({ veri }: { veri: StratejiBelgeVerisi }) {
  const { plan, kalemler } = veri;
  const p = platformToplamlari(kalemler, plan.paraBirimi);
  const yay = halkaYaylari(p.meta, p.google);
  const asamalar = asamaDagilimi(kalemler, plan.paraBirimi);
  return (
    <>
      <p className={`mb-4 mt-0 text-sm ${IKINCIL}`}>Önce sonuç getiren kampanya, kalanı tanıtım.</p>
      <div className="grid items-center gap-6 md:grid-cols-[220px_1fr]">
        <svg viewBox="0 0 200 200" width="200" height="200" role="img" aria-label={`Meta yüzde ${Math.round(yuzde(p.meta, p.meta + p.google))}, Google yüzde ${Math.round(yuzde(p.google, p.meta + p.google))}`} className="mx-auto">
          <circle cx="100" cy="100" r="70" fill="none" stroke="rgba(48,46,45,.07)" strokeWidth="28" />
          <circle cx="100" cy="100" r="70" fill="none" stroke="#302e2d" strokeWidth="28" strokeDasharray={`${yay.meta} ${HALKA_CEVRE}`} transform="rotate(-90 100 100)" />
          <circle cx="100" cy="100" r="70" fill="none" stroke="#ff2400" strokeWidth="28" strokeDasharray={`${yay.google} ${HALKA_CEVRE}`} strokeDashoffset={-yay.meta} transform="rotate(-90 100 100)" />
          <text x="100" y="96" textAnchor="middle" className="tutar" fontWeight="700" fontSize="17" fill="#000">
            {/* SVG içinde de Montserrat: `₺` Open Sans'ta yok. */}
            {kisaTutar(plan.toplamButceMicros)} {plan.paraBirimi === 'TRY' ? '₺' : plan.paraBirimi}
          </text>
          <text x="100" y="116" textAnchor="middle" fontSize="11" fill="rgba(48,46,45,.62)">
            {aySayisi(plan.baslangic, plan.bitis)} ay toplam
          </text>
        </svg>
        <div>
          <div className={`mb-2.5 flex flex-wrap gap-3.5 text-xs ${IKINCIL}`}>
            <span>
              <i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-[#302e2d] align-[-1px]" />
              Meta <Tutar micros={p.meta} para={plan.paraBirimi} />
            </span>
            <span>
              <i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-brand align-[-1px]" />
              Google <Tutar micros={p.google} para={plan.paraBirimi} />
            </span>
          </div>
          {asamalar.map((a) => (
            <div key={a.asama} className="my-2 grid grid-cols-[80px_1fr_100px] items-center gap-2.5 text-[13px] sm:grid-cols-[110px_1fr_120px]">
              <span>{STRATEJI_ASAMA_ETIKETI[a.asama]}</span>
              <div className="flex h-3.5 overflow-hidden rounded-[7px] bg-black/[0.07]">
                <span className="block h-full bg-[#302e2d]" style={{ width: `${yuzde(a.meta, a.toplam)}%` }} />
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

function Kampanyalar({ veri }: { veri: StratejiBelgeVerisi }) {
  const { kalemler, plan } = veri;
  if (kalemler.length === 0) return <BosMetin>Kampanya yok.</BosMetin>;
  return (
    <>
      <p className={`mb-4 mt-0 text-sm ${IKINCIL}`}>Onaydan sonra her biri ayrı bir reklam olarak kurulur.</p>
      {kalemler.map((k) => (
        <KalemKarti key={k.id} k={k} para={plan.paraBirimi} />
      ))}
    </>
  );
}

function KalemKarti({ k, para }: { k: StratejiKalemi; para: string }) {
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
              {STRATEJI_ASAMA_ETIKETI[AMAC_ASAMASI[k.amac]]} · {REHBER_AMACLARI[k.amac].neAlacaksin}
            </span>
          </div>
        </div>
        <Tutar micros={k.butceMicros} para={para} className="text-lg font-bold" />
      </div>
      <dl className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px] md:grid-cols-4">
        <div>
          <dt className={`text-[11px] font-semibold ${IKINCIL}`}>Nerede</dt>
          <dd className="m-0">
            {k.meta && <span className="block">Meta: <Tutar micros={t.meta} para={para} /></span>}
            {k.google && <span className="block">{g.kurgu ? g.nerede : 'Google'}: <Tutar micros={t.google} para={para} /></span>}
          </dd>
        </div>
        <div>
          <dt className={`text-[11px] font-semibold ${IKINCIL}`}>Tarih</dt>
          <dd className="m-0">{tarihAraligi(k.baslangic, k.bitis)}</dd>
        </div>
        <div>
          <dt className={`text-[11px] font-semibold ${IKINCIL}`}>Bölge · yaş</dt>
          <dd className="m-0">
            {konumOzeti(k.konumlar)} · {yasMetni(k.yasMin, k.yasMax)}
          </dd>
        </div>
        <div>
          <dt className={`text-[11px] font-semibold ${IKINCIL}`}>Beklenen</dt>
          <dd className="m-0">
            {(['meta', 'google'] as const)
              .filter((p) => k[p])
              .map((p) => {
                const x = tahminMetni(k.tahmin[p], k.amac);
                return (
                  <span key={p} className="block">
                    {k.meta && k.google ? `${PLATFORM_ADI[p]}: ` : ''}
                    {x.ana} {x.veri && <Rozet>Veri</Rozet>}
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
              <b>Görsel ve mesaj:</b> {yon}
            </p>
          )}
          {metin && metin.basliklar[0] && <p className={`m-0 mt-1 ${IKINCIL}`}>Örnek başlık: "{metin.basliklar[0]}"</p>}
        </div>
      )}
    </div>
  );
}

export function AmacIkonu({ amac }: { amac: StratejiKalemi['amac'] }) {
  const donusum = AMAC_ASAMASI[amac] === 'donusum';
  return (
    <span className={`font-baslik grid h-[30px] w-[30px] flex-none place-items-center rounded-lg text-xs font-bold text-white ${donusum ? 'bg-brand' : 'bg-[#302e2d]'}`} aria-hidden>
      {amacAdi(amac).charAt(0)}
    </span>
  );
}

function Kitle({ veri }: { veri: StratejiBelgeVerisi }) {
  const metin = belgeMetni(veri.bolumler.kitle);
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        {veri.kalemler.map((k) => (
          <div key={k.id} className={`flex justify-between gap-3 border-b py-2 text-[13px] ${CIZGI}`}>
            <span className={IKINCIL}>{amacAdi(k.amac)}</span>
            <span className="text-right">
              {k.konumlar.map((x) => x.etiket).join(', ') || 'Bölge seçilmedi'} · {yasMetni(k.yasMin, k.yasMax)}
            </span>
          </div>
        ))}
      </div>
      <div className="text-[13px] leading-relaxed">
        <p className={`m-0 mb-1.5 text-xs font-semibold ${IKINCIL}`}>Kime anlatıyoruz</p>
        {metin ? <p className="m-0 whitespace-pre-line">{metin}</p> : <BosMetin>Kitle tarifi henüz yazılmadı.</BosMetin>}
        <p className="mt-2 text-[11px] text-black/45">Bu tarif reklamın diline yön verir; hedefleme bölge ve yaşla yapılır.</p>
      </div>
    </div>
  );
}

function Kreatif({ veri }: { veri: StratejiBelgeVerisi }) {
  const metin = belgeMetni(veri.bolumler.kreatif);
  const kalemYonleri = veri.kalemler.map((k) => ({ k, yon: belgeMetni(k.kreatifYonergesi) })).filter((x) => x.yon);
  return (
    <>
      {metin ? <p className="mb-4 mt-0 whitespace-pre-line text-sm leading-relaxed">{metin}</p> : <BosMetin>Genel kreatif yön henüz yazılmadı.</BosMetin>}
      {kalemYonleri.map(({ k, yon }) => (
        <p key={k.id} className={`m-0 border-t py-2 text-[13px] ${CIZGI}`}>
          <b>{amacAdi(k.amac)}:</b> {yon}
        </p>
      ))}
    </>
  );
}

function Takvim({ veri }: { veri: StratejiBelgeVerisi }) {
  const { plan, kalemler } = veri;
  const aylar = takvimAylari(plan);
  if (kalemler.length === 0) return <BosMetin>Kampanya yok.</BosMetin>;
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px] text-[11px]">
        <div className={`grid grid-cols-[150px_1fr] border-b ${CIZGI}`}>
          <span className={`py-1 ${IKINCIL}`}>Kampanya</span>
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
                  className={`absolute top-[11px] h-3.5 rounded-[7px] ${k.meta && !k.google ? 'bg-[#302e2d]' : k.google && !k.meta ? 'bg-brand' : 'bg-[#302e2d]/60'}`}
                  style={{ left: `${c.sol}%`, width: `${c.genislik}%` }}
                  title={tarihAraligi(k.baslangic, k.bitis)}
                />
              </div>
            </div>
          );
        })}
        <p className="mt-2 text-[11px] text-black/45">Gri: Meta, kırmızı: Google, açık gri: ikisi birlikte. Özel günler takvimi bu sürümde yok.</p>
      </div>
    </div>
  );
}

const OLCUM_METNI = { hazir: 'Sayılıyor', kurulmali: 'Kurulmalı', bilinmiyor: 'Bilinmiyor' } as const;

function OlcumBolumu({ veri }: { veri: StratejiBelgeVerisi }) {
  if (veri.olcum.length === 0) return <BosMetin>Bu stratejinin ölçtüğü bir sonuç yok.</BosMetin>;
  return (
    <div>
      {veri.olcum.map((o, i) => (
        <div key={i} className={`flex justify-between gap-3 border-b py-2 text-[13px] ${CIZGI}`}>
          <span className={IKINCIL}>
            {o.etiket}
            {o.platform ? ` · ${PLATFORM_ADI[o.platform]}` : ''}
          </span>
          <span className={`inline-flex items-center gap-1.5 ${o.durum === 'kurulmali' ? 'font-semibold text-[#ff2400]' : ''}`}>
            {o.durum === 'hazir' && <Nokta ton="ok" />}
            {OLCUM_METNI[o.durum]}
          </span>
        </div>
      ))}
    </div>
  );
}

function Riskler({ veri }: { veri: StratejiBelgeVerisi }) {
  if (veri.riskler.length === 0) return <BosMetin>Kurallardan çıkan bir risk yok.</BosMetin>;
  return (
    <div>
      {veri.riskler.map((r, i) => (
        <div key={i} className={`flex gap-2.5 border-b py-2.5 text-[13px] last:border-b-0 ${CIZGI}`}>
          <span className="min-w-[84px] text-[11px] font-semibold text-black/45">{r.kalem ? `Kampanya ${r.kalem}` : 'Genel'}</span>
          <span>{r.metin}</span>
        </div>
      ))}
    </div>
  );
}

function GerceklesenBolumu({ veri, gerceklesen }: { veri: StratejiBelgeVerisi; gerceklesen: { tur: 'veri'; v: Gerceklesen } | { tur: 'hata'; mesaj: string } | null }) {
  if (gerceklesen === null) return <BosMetin>Gerçekleşen veri bu görünümde yüklenmedi.</BosMetin>;
  if (gerceklesen.tur === 'hata') return <p className="m-0 text-sm text-[#ff2400]" role="alert">Gerçekleşen veri alınamadı: {gerceklesen.mesaj}</p>;
  return <PlanGerceklesenTablosu veri={veri} g={gerceklesen.v} />;
}

/** Plan ve gerçekleşen — aktarım ekranı ve belge AYNI tabloyu çizer. */
export function PlanGerceklesenTablosu({ veri, g }: { veri: Pick<StratejiBelgeVerisi, 'plan' | 'kalemler'>; g: Gerceklesen }) {
  const para = veri.plan.paraBirimi;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className={`border-b text-left text-xs ${CIZGI} ${IKINCIL}`}>
            <th className="py-2 pr-3 font-semibold">Kampanya</th>
            <th className="py-2 pr-3 font-semibold">Durum</th>
            <th className="py-2 pr-3 text-right font-semibold">Harcanan / plan</th>
            <th className="py-2 pr-3 text-right font-semibold">Sonuç / beklenen</th>
            <th className="hidden py-2 font-semibold md:table-cell">Not</th>
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
                const t = tahminMetni(k.tahmin[p], k.amac);
                const durum = kalemDurumSatirlari(k.durum).find((d) => d.platform === p || d.platform === null);
                const sapma = x?.kurulanButceMicros && x.kurulanButceMicros !== plan[p].toString();
                return (
                  <tr key={`${k.id}-${p}`} className={`border-b align-top ${CIZGI}`}>
                    <td className="py-2.5 pr-3">
                      {amacAdi(k.amac)} · {PLATFORM_ADI[p]}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="inline-flex items-center gap-1.5">
                        <Nokta ton={durum?.nokta ?? 'notr'} />
                        {durum?.metin.split(' · ')[0] ?? 'Aktarılmadı'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      {x ? <Tutar micros={x.harcananMicros} para={para} /> : '-'} / <Tutar micros={plan[p]} para={para} />
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {x?.sonuc != null ? x.sonuc.toLocaleString('tr-TR') : '-'} / {t.veri ? t.ana : 'Tahmin yok'}
                    </td>
                    <td className={`hidden py-2.5 text-xs md:table-cell ${IKINCIL}`}>
                      {sapma ? (
                        <>
                          Bütçe AdvCampaign'de değişti: plan <Tutar micros={plan[p]} para={para} />, kurulan <Tutar micros={x.kurulanButceMicros!} para={para} />
                        </>
                      ) : !x ? (
                        'Veri yok'
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
      <p className="mt-2 text-[11px] text-black/45">Meta ve Google satırları ayrı; sonuçlar toplanmaz. {donemMetni(veri.plan.baslangic, veri.plan.bitis)}.</p>
    </div>
  );
}
