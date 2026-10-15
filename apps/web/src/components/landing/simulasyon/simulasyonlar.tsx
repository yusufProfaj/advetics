'use client';

import { useDil, useSozluk } from '@/dil/saglayici';
import { simulasyonSozlugu, type SimulasyonMetni } from '@/dil/sozlukler/simulasyon';
import { PLAN_BUTCE, SAHNELER, TABLO_SEKMELERI, olcumListesi, type DilinSahneleri } from './sahneler';
import { SahneCercevesi, Sayac, belir, useSahne } from './sahne';

/**
 * ═══ TANITIM SİTESİNİN SAHNELERİ ═══
 *
 * Her bölümdeki panel taklidi. Görünüş ve sıra onaylı taslaktan
 * (`docs/site/taslak.html`); senaryo `sahneler.ts`te, oynatıcı `sahne.tsx`te.
 * Bu dosya yalnız ÇİZİYOR: hangi öğenin ne zaman göründüğü durumdan okunuyor.
 *
 * Bütün rakamlar ve adlar ÖRNEK. Ekran okuyucu canlandırmayı değil
 * `etiket`teki tek cümleyi okuyor.
 *
 * Metin `simulasyonSozlugu`nden, sahne (adım listesi) dilin hazır
 * kurulmuş sahnesinden (`SAHNELER[dil]`). İki dilde AYNI kalan ürün ve
 * platform adları (Meta, Instagram, PDF, ADVETICS) bu dosyada sabit.
 */

/** Ziyaretçinin dili için metin ve sahneler. */
function useMetin(): { m: SimulasyonMetni; sahneler: DilinSahneleri } {
  const { dil } = useDil();
  return { m: useSozluk(simulasyonSozlugu), sahneler: SAHNELER[dil] };
}

function PencereBasi({ yer, sag, noktali = true }: { yer: string; sag?: React.ReactNode; noktali?: boolean }) {
  return (
    <div className="pencere-bas">
      {noktali && (
        <span className="nokta">
          <i />
          <i />
          <i />
        </span>
      )}
      <span className={`yer${noktali ? '' : ' yer-duz'}`}>{yer}</span>
      {sag && <span className="sag-uc">{sag}</span>}
    </div>
  );
}

function Bildirim({ gor, baslik, metin, konum }: { gor: boolean; baslik: string; metin: string; konum: string }) {
  return (
    <div className={`bildirim ${konum}${gor ? ' gor' : ''}`}>
      <i className="n" />
      <div>
        <b>{baslik}</b>
        <span>{metin}</span>
      </div>
    </div>
  );
}

/* ─────────────── Hero: Genel Bakış ─────────────── */

const HERO_CUBUKLARI = [18, 26, 22, 31, 28, 36, 33, 40, 38, 47, 44, 52, 49, 63];

export function HeroSahnesi() {
  const { m, sahneler } = useMetin();
  const h = m.hero;
  const s = useSahne(sahneler.HERO);
  const enBuyuk = Math.max(...HERO_CUBUKLARI);
  return (
    <SahneCercevesi s={s} etiket={h.etiket}>
      <div className="pencere">
        <PencereBasi yer={`${h.yer} · ${m.ornek.firma}`} sag={<span className="rozet canli">{h.canli}</span>} />
        <div className="pencere-ic izgara-14">
          <div className="uclu">
            <div className="kart kutu">
              <div className="etiket">{h.harcama}</div>
              <div className="buyuk-sayi">
                <Sayac calis={s.d.sayac} hedef={48250} bicim={m.para} />
              </div>
            </div>
            <div className="kart kutu">
              <div className="etiket">{h.form}</div>
              <div className="buyuk-sayi">
                <Sayac calis={s.d.sayac} hedef={312} />
              </div>
            </div>
            <div className="kart kutu">
              <div className="etiket">{h.formBasi}</div>
              <div className="buyuk-sayi">
                <Sayac calis={s.d.sayac} hedef={154} bicim={m.para} />
              </div>
            </div>
          </div>
          <div className="kart kutu-genis">
            <div className="ara">
              <span className="etiket">{h.son14}</span>
              <span className="rozet">{h.gunlukForm}</span>
            </div>
            <div className="cubuk-grafik ust-12">
              {HERO_CUBUKLARI.map((v, k) => (
                <i
                  key={k}
                  className={k === HERO_CUBUKLARI.length - 1 ? 'son' : undefined}
                  style={{ height: s.d.cubuk ? `${(v / enBuyuk) * 100}%` : '4%', transitionDelay: `${k * 60}ms` }}
                />
              ))}
            </div>
          </div>
          <div className={belir(s.d.oneri, 'kart oneri-karti')}>
            <div className="esnek-1">
              <b className="mont kucuk-baslik">{h.oneriBaslik}</b>
              <div className="soluk-12">{h.oneriMetin}</div>
            </div>
            <span ref={s.h('onayla')} className={`mini-dg${s.basili('onayla') ? ' basildi' : ''}`}>
              {s.d.onaylandi ? h.onaylandi : h.onayla}
            </span>
          </div>
        </div>
      </div>
      <Bildirim
        gor={s.d.bildirim}
        konum="b-sag-ust"
        baslik={h.bildirimBaslik}
        metin={h.bildirimMetin}
      />
    </SahneCercevesi>
  );
}

/* ─────────────── 1 · Tek Panel: Reklam Yöneticisi ─────────────── */

/**
 * Satırın dilden bağımsız yarısı. Ad ve sonuç sözlükte (`tablo.satirlar`)
 * AYNI SIRAYLA; uzunlukların eşitliğini `simulasyon.spec.ts` kilitliyor
 * (biri kısa kalırsa satır adsız çizilirdi).
 */
export const TABLO_VERISI = [
  { platform: 'Meta', harcama: 18420 },
  { platform: 'Google', harcama: 9880 },
  { platform: 'Meta', harcama: 11240 },
  { platform: 'LinkedIn', harcama: 8710 },
] as const;

/** Sütun başlığı iki dilde aynı kelime; sözlük yaprağı olamaz. */
const PLATFORM = 'Platform';

export function TabloSahnesi() {
  const { m, sahneler } = useMetin();
  const t = m.tablo;
  const s = useSahne(sahneler.TABLO);
  const satirlar = TABLO_VERISI.map((v, i) => ({ ...v, ...t.satirlar[i]! }));
  const liste = satirlar.filter((r) => s.d.sekme === 'tumu' || r.platform === s.d.sekme);
  return (
    <SahneCercevesi s={s} etiket={t.etiket}>
      <div className="pencere">
        <PencereBasi yer={t.yer} />
        <div className="pencere-ic bosluksuz">
          <div className="sekme-satiri">
            {TABLO_SEKMELERI.map((k) => (
              <span
                key={k}
                ref={s.h(k)}
                className={`cip${s.d.sekme === k ? ' sec' : ''}${s.basili(k) ? ' basildi' : ''}`}
              >
                {k === 'tumu' ? t.tumu : k}
              </span>
            ))}
          </div>
          <table className="sahne-tablo">
            <thead>
              <tr>
                <th>{t.kampanya}</th>
                <th>{PLATFORM}</th>
                <th className="sag">{t.harcama}</th>
                <th className="sag">{t.sonuc}</th>
              </tr>
            </thead>
            {/* Sekme değişince satırlar YENİDEN belirsin diye gövdenin anahtarı sekme. */}
            <tbody key={s.d.sekme}>
              {liste.map((r, i) => (
                <tr key={r.ad} className="satir-gel" style={{ animationDelay: `${i * 120}ms` }}>
                  <td className="kalin">{r.ad}</td>
                  <td>
                    <span className="rozet">{r.platform}</span>
                  </td>
                  <td className="sag">{m.para(r.harcama)}</td>
                  <td className="sag">{r.sonuc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Sessiz kesme yok: gösterilen ve toplam sayı her zaman yazılı (panel kuralı). */}
          <div className="tablo-sayac">
            {t.sayac(liste.length, satirlar.length)}
          </div>
        </div>
      </div>
    </SahneCercevesi>
  );
}

/* ─────────────── 2 · Reklam Kurma: AdvCampaign ─────────────── */

export function KurmaSahnesi() {
  const { m, sahneler } = useMetin();
  const k = m.kurma;
  const s = useSahne(sahneler.KURMA);
  return (
    <SahneCercevesi s={s} etiket={k.etiket}>
      <div className="yan-yana">
        <div className="pencere dar-330">
          <PencereBasi
            yer={k.yer}
            noktali={false}
            sag={<span className="rozet">{s.d.durum}</span>}
          />
          <div className="pencere-ic izgara-12">
            <div>
              <div className="etiket">{k.soru}</div>
              <div className="cip-satiri">
                <span className="cip">{k.satis}</span>
                <span
                  ref={s.h('amac')}
                  className={`cip${s.d.amac ? ' sec' : ''}${s.basili('amac') ? ' basildi' : ''}`}
                >
                  {k.whatsapp}
                </span>
                <span className="cip">{k.form}</span>
              </div>
            </div>
            <div>
              <div className="etiket">{k.gunlukButce}</div>
              <div ref={s.h('butce')} className={`alan ust-6${s.yaziyor('butce') ? ' imlec' : ''}`}>
                {s.d.butce}
              </div>
            </div>
            <div>
              <div className="etiket">{k.bolge}</div>
              <div ref={s.h('bolge')} className={`alan ust-6${s.yaziyor('bolge') ? ' imlec' : ''}`}>
                {s.d.bolge}
              </div>
            </div>
            <span
              ref={s.h('kur')}
              className={`mini-dg${s.d.hazir ? '' : ' pasif'}${s.basili('kur') ? ' basildi' : ''}`}
            >
              {s.d.dugme}
            </span>
          </div>
        </div>
        <div className={belir(s.d.telefon, 'telefon gizle-dar')}>
          <div className="cerceve izgara-10 ic-14">
            <div className="hesap-satiri">
              <i className="avatar" />
              <div className="kucuk-12">
                <b>{m.ornek.firma}</b>
                <br />
                <span className="soluk">{k.sponsorlu}</span>
              </div>
            </div>
            <div className="kucuk-12">{k.reklamMetni}</div>
            <div className="gorsel-yeri oran-45">{k.gorsel}</div>
            <div className="cta-satiri">
              <span>{'api.whatsapp.com'}</span>
              <span className="mini-dg kucuk-dg">{k.cta}</span>
            </div>
          </div>
        </div>
      </div>
      <Bildirim
        gor={s.d.bildirim}
        konum="b-sag-alt"
        baslik={k.bildirimBaslik}
        metin={k.bildirimMetin}
      />
    </SahneCercevesi>
  );
}

/* ─────────────── 3 · Planlama: AdvStrategy ─────────────── */

/** Kalemlerin adı sözlükte (`plan.dagilim`) AYNI SIRAYLA; uzunluk eşitliği spec'te. */
export const PLAN_YUZDELERI = [
  { yuzde: 55, vurgu: false },
  { yuzde: 35, vurgu: false },
  { yuzde: 10, vurgu: true },
] as const;

export function PlanSahnesi() {
  const { m, sahneler } = useMetin();
  const p = m.plan;
  const s = useSahne(sahneler.PLAN);
  const oran = (n: number) => `${(n / PLAN_BUTCE.ust) * 100}%`;
  const dagilim = PLAN_YUZDELERI.map((v, i) => ({ ...v, ad: p.dagilim[i]! }));
  return (
    <SahneCercevesi s={s} etiket={p.etiket}>
      <div className="pencere">
        <PencereBasi yer={p.yer} noktali={false} sag={<span className="rozet">{s.d.adim} / 4</span>} />
        <div className="pencere-ic izgara-16">
          <div className="ilerleme">
            {[1, 2, 3, 4].map((k) => (
              <i key={k} className={k <= s.d.adim ? 'dolu' : undefined} />
            ))}
          </div>
          <div>
            <div className="ara">
              <span className="etiket">{p.aylikButce}</span>
              <b className="mont">
                <Sayac
                  calis={s.d.kaydir}
                  baslangic={PLAN_BUTCE.baslangic}
                  hedef={PLAN_BUTCE.hedef}
                  sure={1200}
                  yuvarla={PLAN_BUTCE.adim}
                  bicim={m.para}
                />
              </b>
            </div>
            <div className="kaydirak">
              <i ref={s.h('kaydir')} style={{ width: s.d.kaydir ? oran(PLAN_BUTCE.hedef) : oran(PLAN_BUTCE.baslangic) }} />
            </div>
          </div>
          <div className="izgara-9">
            {dagilim.map((d, i) => (
              <div key={d.ad}>
                <div className="ara kucuk-125">
                  <span>{d.ad}</span>
                  <b>{m.yuzde(d.yuzde)}</b>
                </div>
                <div className="pay">
                  <i
                    className={d.vurgu ? 'vurgu' : undefined}
                    style={{ width: s.d.dagilim ? `${d.yuzde}%` : '0%', transitionDelay: `${100 + i * 200}ms` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="sag-dugmeler">
            <span className="mini-dg ikincil-dg">{'PDF'}</span>
            <span ref={s.h('gonder')} className={`mini-dg${s.basili('gonder') ? ' basildi' : ''}`}>
              {s.d.gonderildi ? p.gonderildi : p.gonder}
            </span>
          </div>
        </div>
      </div>
      <Bildirim
        gor={s.d.bildirim}
        konum="b-sol-alt"
        baslik={p.bildirimBaslik}
        metin={p.bildirimMetin(m.ornek.kisi)}
      />
    </SahneCercevesi>
  );
}

/* ─────────────── 4 · Akıllı Boost ─────────────── */

export function BoostSahnesi() {
  const { m, sahneler } = useMetin();
  const b = m.boost;
  const s = useSahne(sahneler.BOOST);
  return (
    <SahneCercevesi s={s} etiket={b.etiket}>
      <div className="yan-yana">
        <div className="telefon">
          <div className="cerceve izgara-8 ic-12">
            <div className="mont kalin-15">{'Instagram'}</div>
            <div className={belir(s.d.gonderi, 'izgara-6')}>
              <div className="hesap-satiri kucuk-12">
                <i className="avatar kucuk-avatar" />
                <b>{m.ornek.hesap}</b>
                <span className="soluk">{b.simdi}</span>
              </div>
              <div className="gorsel-yeri oran-11">{b.yeniGonderi}</div>
              <div className="kucuk-115">{b.gonderiMetni}</div>
            </div>
          </div>
        </div>
        <div className={belir(s.d.kart, 'pencere dar-300')}>
          <PencereBasi yer={b.yer} noktali={false} sag={<span className="rozet k">{b.yeni}</span>} />
          <div className="pencere-ic izgara-10 kucuk-13">
            <div className="ara">
              <span className="soluk">{b.kitle}</span>
              <b>{m.ornek.kitle}</b>
            </div>
            <div className="ara">
              <span className="soluk">{b.butce}</span>
              <b>{b.gunluk}</b>
            </div>
            <div className="ara">
              <span className="soluk">{b.sure}</span>
              <b>{b.gun}</b>
            </div>
            <span ref={s.h('boost')} className={`mini-dg${s.basili('boost') ? ' basildi' : ''}`}>
              {s.d.dugme}
            </span>
            <div className={belir(s.d.yayinda, 'rozet canli ortala')}>{b.yayinda('Meta')}</div>
          </div>
        </div>
      </div>
      <Bildirim
        gor={s.d.bildirim}
        konum="b-sol-ust"
        baslik={b.bildirimBaslik}
        metin={b.bildirimMetin(m.ornek.hesap)}
      />
    </SahneCercevesi>
  );
}

/* ─────────────── 5 · İyileştirme: Kurallar ─────────────── */

export function KuralSahnesi() {
  const { m, sahneler } = useMetin();
  const k = m.kural;
  const s = useSahne(sahneler.KURAL);
  const cip = (ad: 'kosul' | 'karsilastirma' | 'eylem', metin: string) => (
    <span ref={s.h(ad)} className={`cip${s.d[ad] ? ' sec' : ''}${s.basili(ad) ? ' basildi' : ''}`}>
      {metin}
    </span>
  );
  return (
    <SahneCercevesi s={s} etiket={k.etiket}>
      <div className="pencere">
        <PencereBasi yer={k.yer} noktali={false} />
        <div className="pencere-ic izgara-12">
          <div className="kural-satiri">
            <b>{k.eger}</b>
            {cip('kosul', k.kosul)}
            {cip('karsilastirma', k.karsilastirma)}
            <span ref={s.h('esik')} className={`alan alan-kucuk${s.yaziyor('esik') ? ' imlec' : ''}`}>
              {s.d.esik}
            </span>
          </div>
          <div className="kural-satiri">
            <b>{k.yap}</b>
            {cip('eylem', k.eylem)}
            <span ref={s.h('kaydet')} className={`mini-dg sola-it${s.basili('kaydet') ? ' basildi' : ''}`}>
              {s.d.acik ? k.acik : k.ac}
            </span>
          </div>
          <table className="sahne-tablo kucuk-tablo">
            <thead>
              <tr>
                <th>{k.reklamSeti}</th>
                <th>{k.formBasi}</th>
                <th className="sag">{k.durum}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{m.ornek.set1}</td>
                <td>{m.para(142)}</td>
                <td className="sag">
                  <span className="rozet canli">{k.yayinda}</span>
                </td>
              </tr>
              <tr>
                <td>{m.ornek.set2}</td>
                <td>{s.d.cpa}</td>
                <td className="sag">
                  {s.d.durduruldu ? (
                    <span className="rozet k">{k.durduruldu}</span>
                  ) : (
                    <span className="rozet canli">{k.yayinda}</span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <Bildirim
        gor={s.d.bildirim}
        konum="b-sag-alt"
        baslik={k.bildirimBaslik}
        metin={k.bildirimMetin}
      />
    </SahneCercevesi>
  );
}

/* ─────────────── 6 · Raporlama ─────────────── */

export function RaporSahnesi() {
  const { m, sahneler } = useMetin();
  const r = m.rapor;
  const s = useSahne(sahneler.RAPOR);
  const g = (n: number) => s.d.satir >= n;
  return (
    <SahneCercevesi s={s} imlec={false} etiket={r.etiket}>
      <div className="yan-yana">
        <div className="kart rapor-sayfasi">
          <div className={belir(g(1), 'ara orta')}>
            <b className="mont kucuk-12">{'ADVETICS'}</b>
            <span className="cok-kucuk soluk">{r.donem}</span>
          </div>
          <div className={belir(g(2))}>
            <i className="kirmizi-cizgi" />
            <b className="mont rapor-baslik">{r.baslik}</b>
          </div>
          <div className={belir(g(3), 'ikili')}>
            <div className="rapor-kutu">
              {r.harcama}
              <br />
              <b>{m.para(48250)}</b>
            </div>
            <div className="rapor-kutu dolu">
              {r.form}
              <br />
              <b>312</b>
            </div>
          </div>
          <div className={belir(g(4), 'cubuk-grafik kisa')}>
            {[30, 45, 38, 60, 52, 74, 88].map((h, i, a) => (
              <i key={i} className={i === a.length - 1 ? 'son' : undefined} style={{ height: `${h}%` }} />
            ))}
          </div>
          <div className={belir(g(5), 'metin-cizgileri')}>
            <i />
            <i style={{ width: '80%' }} />
            <i style={{ width: '90%' }} />
          </div>
        </div>
        <div className={belir(s.d.mail, 'pencere dar-270')}>
          <PencereBasi yer={r.yer} noktali={false} />
          <div className="pencere-ic izgara-8 kucuk-125">
            <div>
              <span className="etiket">{r.alicilar}</span>
              <div className="cip-satiri ust-5">
                <span className="cip cip-kucuk">{m.ornek.eposta1}</span>
                <span className="cip cip-kucuk">{m.ornek.eposta2}</span>
              </div>
            </div>
            <div>
              <span className="etiket">{r.ekler}</span>
              <div className="ust-4">{r.ekMetni}</div>
            </div>
            <div>
              <span className="etiket">{r.gun}</span>
              <div className="ust-4">{r.gunMetni}</div>
            </div>
          </div>
        </div>
      </div>
      <Bildirim gor={s.d.bildirim} konum="b-sag-ust-0" baslik={r.bildirimBaslik} metin={r.bildirimMetin} />
    </SahneCercevesi>
  );
}

/* ─────────────── 7 · Ölçüm Kurulumu ─────────────── */

export function OlcumSahnesi() {
  const { m, sahneler } = useMetin();
  const s = useSahne(sahneler.OLCUM);
  const liste = olcumListesi(m);
  return (
    <SahneCercevesi s={s} etiket={m.olcum.etiket}>
      <div className="pencere dar-460">
        <PencereBasi
          yer={`${m.olcum.yer} · ${m.ornek.firma}`}
          noktali={false}
          sag={
            <b className="mont">
              {s.d.tamam} / {liste.length}
            </b>
          }
        />
        <div className="pencere-ic izgara-4">
          {liste.map((ad, i) => (
            <div key={ad} className={`ol${i < s.d.tamam ? ' ok' : ''}${s.d.calisan === i ? ' calisiyor' : ''}`}>
              {ad}
            </div>
          ))}
          <span ref={s.h('tamamla')} className={`mini-dg ust-10${s.basili('tamamla') ? ' basildi' : ''}`}>
            {s.d.dugme}
          </span>
        </div>
      </div>
    </SahneCercevesi>
  );
}

/* ─────────────── 8 · Yapay Zekâ Asistanı ─────────────── */

export function AsistanSahnesi() {
  const { m, sahneler } = useMetin();
  const a = m.asistan;
  const s = useSahne(sahneler.ASISTAN);
  return (
    <SahneCercevesi s={s} imlec={false} etiket={a.etiket}>
      <div className="pencere dar-520">
        <PencereBasi yer={a.yer} noktali={false} />
        <div className="pencere-ic sohbet">
          <div className={belir(s.d.soru, 'balon soru')}>{a.soru}</div>
          <div className={belir(s.d.cevapKutusu, 'balon cevap')}>
            <span className={s.yaziyor('cevap') ? 'imlec' : undefined}>{s.d.cevap}</span>
            <div className={belir(s.d.rakamlar, 'izgara-6 ust-10')}>
              <div className="ara kucuk-12">
                <span>{m.ornek.set2}</span>
                <b className="kirmizi">{`${m.para(268)} ↑ ${m.yuzde(74)}`}</b>
              </div>
              <div className="ara kucuk-12">
                <span>{m.ornek.set1}</span>
                <b>{`${m.para(142)} ↓ ${m.yuzde(6)}`}</b>
              </div>
            </div>
          </div>
          <div className={belir(s.d.oneriler, 'cip-satiri')}>
            <span className="cip">{a.durdur}</span>
            <span className="cip">{a.kaydir}</span>
          </div>
        </div>
      </div>
    </SahneCercevesi>
  );
}
