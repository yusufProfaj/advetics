'use client';

import {
  ASISTAN,
  ASISTAN_CEVABI,
  BOOST,
  HERO,
  KURAL,
  KURMA,
  OLCUM,
  OLCUM_LISTESI,
  PLAN,
  PLAN_BUTCE,
  RAPOR,
  TABLO,
  TABLO_SEKMELERI,
} from './sahneler';
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
 */

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
  const s = useSahne(HERO);
  const enBuyuk = Math.max(...HERO_CUBUKLARI);
  return (
    <SahneCercevesi s={s} etiket="Genel Bakış ekranı: harcama, form sayısı, günlük grafik ve onay bekleyen bir öneri.">
      <div className="pencere">
        <PencereBasi yer="Genel Bakış · Ege Yapı" sag={<span className="rozet canli">Canlı</span>} />
        <div className="pencere-ic izgara-14">
          <div className="uclu">
            <div className="kart kutu">
              <div className="etiket">Harcama</div>
              <div className="buyuk-sayi">
                <Sayac calis={s.d.sayac} hedef={48250} son=" ₺" />
              </div>
            </div>
            <div className="kart kutu">
              <div className="etiket">Form</div>
              <div className="buyuk-sayi">
                <Sayac calis={s.d.sayac} hedef={312} />
              </div>
            </div>
            <div className="kart kutu">
              <div className="etiket">Form başı</div>
              <div className="buyuk-sayi">
                <Sayac calis={s.d.sayac} hedef={154} son=" ₺" />
              </div>
            </div>
          </div>
          <div className="kart kutu-genis">
            <div className="ara">
              <span className="etiket">Son 14 gün</span>
              <span className="rozet">Günlük form</span>
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
              <b className="mont kucuk-baslik">{"Öneri: bütçeyi Instagram'a kaydır"}</b>
              <div className="soluk-12">{"Instagram'da form başı 118 ₺, Facebook'ta 212 ₺."}</div>
            </div>
            <span ref={s.h('onayla')} className={`mini-dg${s.basili('onayla') ? ' basildi' : ''}`}>
              {s.d.onaylandi ? 'Onaylandı ✓' : 'Onayla'}
            </span>
          </div>
        </div>
      </div>
      <Bildirim
        gor={s.d.bildirim}
        konum="b-sag-ust"
        baslik="Bütçe güncellendi"
        metin="Meta'da kaydedildi ve geri okundu."
      />
    </SahneCercevesi>
  );
}

/* ─────────────── 1 · Tek Panel: Reklam Yöneticisi ─────────────── */

const TABLO_SATIRLARI = [
  { ad: 'Bornova daire · form', platform: 'Meta', harcama: '18.420 ₺', sonuc: '124 form' },
  { ad: 'Marka araması', platform: 'Google', harcama: '9.880 ₺', sonuc: '61 dönüşüm' },
  { ad: 'Instagram mesaj', platform: 'Meta', harcama: '11.240 ₺', sonuc: '96 mesaj' },
  { ad: 'Yönetici kitlesi', platform: 'LinkedIn', harcama: '8.710 ₺', sonuc: '31 lead' },
];

export function TabloSahnesi() {
  const s = useSahne(TABLO);
  const liste = TABLO_SATIRLARI.filter((r) => s.d.sekme === 'Tümü' || r.platform === s.d.sekme);
  return (
    <SahneCercevesi s={s} etiket="Reklam Yöneticisi: Meta, Google ve LinkedIn kampanyaları tek tabloda, platforma göre süzülüyor.">
      <div className="pencere">
        <PencereBasi yer="Reklam Yöneticisi" />
        <div className="pencere-ic bosluksuz">
          <div className="sekme-satiri">
            {TABLO_SEKMELERI.map((t) => (
              <span
                key={t}
                ref={s.h(t)}
                className={`cip${s.d.sekme === t ? ' sec' : ''}${s.basili(t) ? ' basildi' : ''}`}
              >
                {t}
              </span>
            ))}
          </div>
          <table className="sahne-tablo">
            <thead>
              <tr>
                <th>Kampanya</th>
                <th>Platform</th>
                <th className="sag">Harcama</th>
                <th className="sag">Sonuç</th>
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
                  <td className="sag">{r.harcama}</td>
                  <td className="sag">{r.sonuc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Sessiz kesme yok: gösterilen ve toplam sayı her zaman yazılı (panel kuralı). */}
          <div className="tablo-sayac">
            {liste.length} / {TABLO_SATIRLARI.length} kampanya
          </div>
        </div>
      </div>
    </SahneCercevesi>
  );
}

/* ─────────────── 2 · Reklam Kurma: AdvCampaign ─────────────── */

export function KurmaSahnesi() {
  const s = useSahne(KURMA);
  return (
    <SahneCercevesi s={s} etiket="AdvCampaign: amaç, bütçe ve bölge seçiliyor, reklam önizlemesi telefonda görünüyor ve kurulum duraklatılmış hazırlanıyor.">
      <div className="yan-yana">
        <div className="pencere dar-330">
          <PencereBasi
            yer="Yeni reklam"
            noktali={false}
            sag={<span className="rozet">{s.d.durum}</span>}
          />
          <div className="pencere-ic izgara-12">
            <div>
              <div className="etiket">Ne istiyorsunuz?</div>
              <div className="cip-satiri">
                <span className="cip">Satış</span>
                <span
                  ref={s.h('amac')}
                  className={`cip${s.d.amac ? ' sec' : ''}${s.basili('amac') ? ' basildi' : ''}`}
                >
                  WhatsApp mesajı
                </span>
                <span className="cip">Form</span>
              </div>
            </div>
            <div>
              <div className="etiket">Günlük bütçe</div>
              <div ref={s.h('butce')} className={`alan ust-6${s.yaziyor('butce') ? ' imlec' : ''}`}>
                {s.d.butce}
              </div>
            </div>
            <div>
              <div className="etiket">Bölge</div>
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
                <b>Ege Yapı</b>
                <br />
                <span className="soluk">Sponsorlu</span>
              </div>
            </div>
            <div className="kucuk-12">Hayalinizdeki daire Bornova&apos;da. Fiyat ve plan için yazın.</div>
            <div className="gorsel-yeri oran-45">4:5 görsel</div>
            <div className="cta-satiri">
              <span>api.whatsapp.com</span>
              <span className="mini-dg kucuk-dg">WhatsApp&apos;tan yaz</span>
            </div>
          </div>
        </div>
      </div>
      <Bildirim
        gor={s.d.bildirim}
        konum="b-sag-alt"
        baslik="Kurulum hazır, duraklatılmış"
        metin="1 kampanya · 1 set · 2 reklam. Açmak sizde."
      />
    </SahneCercevesi>
  );
}

/* ─────────────── 3 · Planlama: AdvStrategy ─────────────── */

const PLAN_DAGILIMI = [
  { ad: 'Meta · Form', yuzde: 55, vurgu: false },
  { ad: 'Google · Arama', yuzde: 35, vurgu: false },
  { ad: 'Meta · Yeniden hedefleme', yuzde: 10, vurgu: true },
];

export function PlanSahnesi() {
  const s = useSahne(PLAN);
  const oran = (n: number) => `${(n / PLAN_BUTCE.ust) * 100}%`;
  return (
    <SahneCercevesi s={s} etiket="AdvStrategy: aylık bütçe seçiliyor, platformlara bölünüyor ve plan müşteriye onaya gönderiliyor.">
      <div className="pencere">
        <PencereBasi yer="Strateji oluştur" noktali={false} sag={<span className="rozet">{s.d.adim} / 4</span>} />
        <div className="pencere-ic izgara-16">
          <div className="ilerleme">
            {[1, 2, 3, 4].map((k) => (
              <i key={k} className={k <= s.d.adim ? 'dolu' : undefined} />
            ))}
          </div>
          <div>
            <div className="ara">
              <span className="etiket">Aylık bütçe</span>
              <b className="mont">
                <Sayac
                  calis={s.d.kaydir}
                  baslangic={PLAN_BUTCE.baslangic}
                  hedef={PLAN_BUTCE.hedef}
                  sure={1200}
                  yuvarla={PLAN_BUTCE.adim}
                  son=" ₺"
                />
              </b>
            </div>
            <div className="kaydirak">
              <i ref={s.h('kaydir')} style={{ width: s.d.kaydir ? oran(PLAN_BUTCE.hedef) : oran(PLAN_BUTCE.baslangic) }} />
            </div>
          </div>
          <div className="izgara-9">
            {PLAN_DAGILIMI.map((p, i) => (
              <div key={p.ad}>
                <div className="ara kucuk-125">
                  <span>{p.ad}</span>
                  <b>%{p.yuzde}</b>
                </div>
                <div className="pay">
                  <i
                    className={p.vurgu ? 'vurgu' : undefined}
                    style={{ width: s.d.dagilim ? `${p.yuzde}%` : '0%', transitionDelay: `${100 + i * 200}ms` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="sag-dugmeler">
            <span className="mini-dg ikincil-dg">PDF</span>
            <span ref={s.h('gonder')} className={`mini-dg${s.basili('gonder') ? ' basildi' : ''}`}>
              {s.d.gonderildi ? 'Gönderildi ✓' : 'Müşteriye gönder'}
            </span>
          </div>
        </div>
      </div>
      <Bildirim
        gor={s.d.bildirim}
        konum="b-sol-alt"
        baslik="Müşteri planı onayladı"
        metin="Ayşe K. · 14:32 · 3 kalem kuruluma hazır"
      />
    </SahneCercevesi>
  );
}

/* ─────────────── 4 · Akıllı Boost ─────────────── */

export function BoostSahnesi() {
  const s = useSahne(BOOST);
  return (
    <SahneCercevesi s={s} etiket="Akıllı Boost: yeni Instagram gönderisi algılanıyor, öne çıkarma önerisi hazırlanıyor ve onayla yayına alınıyor.">
      <div className="yan-yana">
        <div className="telefon">
          <div className="cerceve izgara-8 ic-12">
            <div className="mont kalin-15">Instagram</div>
            <div className={belir(s.d.gonderi, 'izgara-6')}>
              <div className="hesap-satiri kucuk-12">
                <i className="avatar kucuk-avatar" />
                <b>egeyapi</b>
                <span className="soluk">· şimdi</span>
              </div>
              <div className="gorsel-yeri oran-11">Yeni gönderi</div>
              <div className="kucuk-115">Teslim tarihi açıklandı 🎉</div>
            </div>
          </div>
        </div>
        <div className={belir(s.d.kart, 'pencere dar-300')}>
          <PencereBasi yer="Öne çıkarma önerisi" noktali={false} sag={<span className="rozet k">Yeni</span>} />
          <div className="pencere-ic izgara-10 kucuk-13">
            <div className="ara">
              <span className="soluk">Kitle</span>
              <b>İzmir · 25-54</b>
            </div>
            <div className="ara">
              <span className="soluk">Bütçe</span>
              <b>250 ₺ / gün</b>
            </div>
            <div className="ara">
              <span className="soluk">Süre</span>
              <b>5 gün</b>
            </div>
            <span ref={s.h('boost')} className={`mini-dg${s.basili('boost') ? ' basildi' : ''}`}>
              {s.d.dugme}
            </span>
            <div className={belir(s.d.yayinda, 'rozet canli ortala')}>Yayında · Meta</div>
          </div>
        </div>
      </div>
      <Bildirim
        gor={s.d.bildirim}
        konum="b-sol-ust"
        baslik="Yeni gönderi algılandı"
        metin="@egeyapi · öne çıkarmaya uygun"
      />
    </SahneCercevesi>
  );
}

/* ─────────────── 5 · İyileştirme: Kurallar ─────────────── */

export function KuralSahnesi() {
  const s = useSahne(KURAL);
  const cip = (ad: 'kosul' | 'karsilastirma' | 'eylem', metin: string) => (
    <span ref={s.h(ad)} className={`cip${s.d[ad] ? ' sec' : ''}${s.basili(ad) ? ' basildi' : ''}`}>
      {metin}
    </span>
  );
  return (
    <SahneCercevesi s={s} etiket="Kurallar: form başı maliyet 250 liranın üstüne çıkınca reklam setini durduran bir kural kuruluyor ve gece çalışıyor.">
      <div className="pencere">
        <PencereBasi yer="Yeni kural" noktali={false} />
        <div className="pencere-ic izgara-12">
          <div className="kural-satiri">
            <b>Eğer</b>
            {cip('kosul', 'Form başı maliyet')}
            {cip('karsilastirma', 'büyükse')}
            <span ref={s.h('esik')} className={`alan alan-kucuk${s.yaziyor('esik') ? ' imlec' : ''}`}>
              {s.d.esik}
            </span>
          </div>
          <div className="kural-satiri">
            <b>Yap</b>
            {cip('eylem', 'Reklam setini durdur')}
            <span ref={s.h('kaydet')} className={`mini-dg sola-it${s.basili('kaydet') ? ' basildi' : ''}`}>
              {s.d.acik ? 'Açık ✓' : 'Kuralı aç'}
            </span>
          </div>
          <table className="sahne-tablo kucuk-tablo">
            <thead>
              <tr>
                <th>Reklam seti</th>
                <th>Form başı</th>
                <th className="sag">Durum</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>İzmir · 25-44</td>
                <td>142 ₺</td>
                <td className="sag">
                  <span className="rozet canli">Yayında</span>
                </td>
              </tr>
              <tr>
                <td>Manisa · geniş</td>
                <td>{s.d.cpa}</td>
                <td className="sag">
                  {s.d.durduruldu ? (
                    <span className="rozet k">Durduruldu</span>
                  ) : (
                    <span className="rozet canli">Yayında</span>
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
        baslik="Kural çalıştı · 03:00"
        metin="Manisa · geniş durduruldu. Form başı 268 ₺ > 250 ₺"
      />
    </SahneCercevesi>
  );
}

/* ─────────────── 6 · Raporlama ─────────────── */

export function RaporSahnesi() {
  const s = useSahne(RAPOR);
  const g = (n: number) => s.d.satir >= n;
  return (
    <SahneCercevesi s={s} imlec={false} etiket="Raporlama: aylık PDF rapor hazırlanıyor ve planlı gönderimle iki alıcıya faturalarla birlikte gidiyor.">
      <div className="yan-yana">
        <div className="kart rapor-sayfasi">
          <div className={belir(g(1), 'ara orta')}>
            <b className="mont kucuk-12">ADVETICS</b>
            <span className="cok-kucuk soluk">Eylül 2026</span>
          </div>
          <div className={belir(g(2))}>
            <i className="kirmizi-cizgi" />
            <b className="mont rapor-baslik">Aylık Performans Raporu</b>
          </div>
          <div className={belir(g(3), 'ikili')}>
            <div className="rapor-kutu">
              Harcama
              <br />
              <b>48.250 ₺</b>
            </div>
            <div className="rapor-kutu dolu">
              Form
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
          <PencereBasi yer="Planlı gönderim" noktali={false} />
          <div className="pencere-ic izgara-8 kucuk-125">
            <div>
              <span className="etiket">Alıcılar</span>
              <div className="cip-satiri ust-5">
                <span className="cip cip-kucuk">ayse@egeyapi</span>
                <span className="cip cip-kucuk">mehmet@egeyapi</span>
              </div>
            </div>
            <div>
              <span className="etiket">Ekler</span>
              <div className="ust-4">rapor-eylul.pdf · 2 fatura</div>
            </div>
            <div>
              <span className="etiket">Gün</span>
              <div className="ust-4">Her ayın 1&apos;i · 09:00</div>
            </div>
          </div>
        </div>
      </div>
      <Bildirim gor={s.d.bildirim} konum="b-sag-ust-0" baslik="Rapor gönderildi" metin="2 alıcı · 3 ek · 1 Ekim 09:00" />
    </SahneCercevesi>
  );
}

/* ─────────────── 7 · Ölçüm Kurulumu ─────────────── */

export function OlcumSahnesi() {
  const s = useSahne(OLCUM);
  return (
    <SahneCercevesi s={s} etiket="Ölçüm kurulumu: on adımlık listede eksik dört adım tek düğmeyle sırayla kuruluyor.">
      <div className="pencere dar-460">
        <PencereBasi
          yer="Kurulum · Ege Yapı"
          noktali={false}
          sag={
            <b className="mont">
              {s.d.tamam} / {OLCUM_LISTESI.length}
            </b>
          }
        />
        <div className="pencere-ic izgara-4">
          {OLCUM_LISTESI.map((ad, i) => (
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
  const s = useSahne(ASISTAN);
  return (
    <SahneCercevesi s={s} imlec={false} etiket={`Asistan: "Eylülde form başı neden arttı?" sorusuna kendi veriden rakamla cevap veriyor. ${ASISTAN_CEVABI}`}>
      <div className="pencere dar-520">
        <PencereBasi yer="Asistan" noktali={false} />
        <div className="pencere-ic sohbet">
          <div className={belir(s.d.soru, 'balon soru')}>Eylülde form başı neden arttı?</div>
          <div className={belir(s.d.cevapKutusu, 'balon cevap')}>
            <span className={s.yaziyor('cevap') ? 'imlec' : undefined}>{s.d.cevap}</span>
            <div className={belir(s.d.rakamlar, 'izgara-6 ust-10')}>
              <div className="ara kucuk-12">
                <span>Manisa · geniş</span>
                <b className="kirmizi">268 ₺ ↑ %74</b>
              </div>
              <div className="ara kucuk-12">
                <span>İzmir · 25-44</span>
                <b>142 ₺ ↓ %6</b>
              </div>
            </div>
          </div>
          <div className={belir(s.d.oneriler, 'cip-satiri')}>
            <span className="cip">{"Manisa'yı durdur"}</span>
            <span className="cip">{"Bütçeyi İzmir'e kaydır"}</span>
          </div>
        </div>
      </div>
    </SahneCercevesi>
  );
}
