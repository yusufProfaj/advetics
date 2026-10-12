import {
  DEGISIKLIK_TURU_ADI,
  DEGISIKLIK_YOLU_ADI,
  OZET_METRIK_TANIMI,
  // Platform adı TEK sözlükten: elle yazılan liste üçüncü platformu düşürür (CLAUDE.md).
  PLATFORM_KISA_ADLARI,
  YORUM_DURUMU_ADI,
  aralikMetni,
  bolumGorunurMu,
  ozetKitleyeGore,
  ozetKonusu,
  type BekleyenIsTuru,
  type HaftalikOzet,
  type KalemMetrigi,
  type OzetBolumu,
  type OzetKitlesi,
} from '@advetics/shared';
import { gunMetni } from '../sinyal/sinyal-metni';
import { paraMetni, sayiMetni, yuzdeMetni } from './ozet-uret';

/**
 * ═══ HAFTALIK ÖZET MAİLİ — TEK OLUŞTURUCU (MIMARI § 6) ═══
 *
 * Müşteriye giden mail, ajans kanalına giden e-posta ve panel önizlemesi
 * BU fonksiyondan çıkıyor. Panel ikinci bir şablon yazmıyor (önizleme borcu,
 * CLAUDE.md): API'nin ürettiği HTML'i yalıtılmış çerçevede gösteriyor.
 *
 * KİTLE SÜZGECİ BURADA, ÇAĞIRANDA DEĞİL. `ozetKitleyeGore` fonksiyonun ilk
 * satırında çağrılıyor ve bölümler `bolumGorunurMu` ile çiziliyor: süzgeci
 * çağırana bırakmak, bir gün süzülmemiş özetle çağrılıp sinyali müşteri
 * mailine koymak demekti (Ç-B1). İki katman bilerek ÜST ÜSTE: ilki veriyi
 * siliyor, ikincisi bölümü çizmiyor.
 *
 * Biçim: tablolar ve bütün stiller SATIR İÇİ (mail istemcileri `<style>`u
 * siliyor), renkler yalnız kılavuz dördü (#ffffff, #000000, #302e2d,
 * #ff2400); yeşil yalnız durum noktası. Kullanıcı kaynaklı her metin
 * (kampanya adı `<` taşıyabilir, yapay zekâ yorumu) KAÇIŞLANIYOR.
 */

const GRI = '#302e2d';
const SIYAH = '#000000';
const KIRMIZI = '#ff2400';
const YESIL = '#16a34a';
/** Grinin saydam tonları yerine düz karşılıkları: bazı istemciler rgba'yı tanımıyor. */
const CIZGI = '#e0dfdf';
const IKINCIL = '#7a7877';
const ZEMIN = '#f5f5f5';

const GOVDE_FONT = "'Open Sans',Arial,sans-serif";
const BASLIK_FONT = 'Montserrat,Arial,sans-serif';

export function htmlKac(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const BEKLEYEN_IS_METNI: Record<BekleyenIsTuru, (n: number) => string> = {
  boost_onay: (n) => `${n} Akıllı Boost kartı onay bekliyor`,
  sinyal_acik: (n) => `${n} açık sinyal`,
  geri_besleme_sorunu: () => "Lead sonuçları Meta'ya gitmiyor",
  strateji_onay: (n) => `${n} medya planı onay bekliyor`,
  strateji_aktar: (n) => `${n} onaylı plan kurulmayı bekliyor`,
  butce_yok: () => 'Bu ayın bütçesi tanımlı değil',
};

const BOLUM_ADI: Record<OzetBolumu, string> = {
  sonuc: 'Sonuç',
  degisenler: 'En çok değişenler',
  yaptiklarimiz: 'Bu hafta yaptıklarımız',
  etkiler: 'Ölçülen etkiler',
  yorum: 'Yorum',
  sinyaller: 'Açık sinyaller',
  bekleyen_isler: 'Bekleyen işler',
  oneri: 'Öneri',
};

const GUN_ADLARI = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const gunAdi = (g: string) => GUN_ADLARI[new Date(`${g}T00:00:00Z`).getUTCDay()] ?? '';

function degisimMetni(d: number): string {
  return `${yuzdeMetni(d)} ${d < 0 ? 'düştü' : 'arttı'}`;
}

function kalemDegeri(m: KalemMetrigi, x: number, para: string): string {
  return m === 'donusum' ? sayiMetni(x) : paraMetni(x, para);
}

const h4 = (metin: string) =>
  `<p style="margin:0 0 8px 0;font-family:${GOVDE_FONT};font-size:13px;font-weight:700;color:${SIYAH}">${htmlKac(metin)}</p>`;
const kucuk = (metin: string) => `<span style="font-size:12px;color:${IKINCIL}">${htmlKac(metin)}</span>`;

function liste(satirlar: string[]): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${CIZGI};border-collapse:collapse">` +
    satirlar.map((s) => `<tr><td style="padding:9px 12px;border-bottom:1px solid ${CIZGI};font-size:13px;color:${GRI}">${s}</td></tr>`).join('') +
    '</table>'
  );
}

function fazla(toplam: number, gosterilen: number): string {
  return toplam > gosterilen ? `<p style="margin:6px 0 0 0">${kucuk(`ve ${toplam - gosterilen} daha (panelde)`)}</p>` : '';
}

export interface OzetEpostasi {
  konu: string;
  html: string;
}

/**
 * @param panelAdresi Tam adres (`APP_URL/raporlar?...`). Gönderim anında
 *   kuruluyor; özet satırı adres taşımıyor (kök değişirse eski adres gitmesin).
 */
export function ozetEpostasi(ham: HaftalikOzet, kitle: OzetKitlesi, panelAdresi: string): OzetEpostasi {
  // İLK SATIR: süzgeç. Aşağıdaki hiçbir kod süzülmemiş özeti görmüyor.
  const o = ozetKitleyeGore(ham, kitle);
  const para = o.paraBirimi;
  const parcalar: string[] = [];

  parcalar.push(
    `<div><p style="margin:0;font-family:${BASLIK_FONT};font-size:17px;font-weight:700;color:${SIYAH}">Geçen hafta</p>` +
      `<p style="margin:2px 0 0 0;font-size:13px;color:${IKINCIL}">${htmlKac(aralikMetni(o.aralik))}, bir önceki haftaya göre</p></div>`,
  );

  if (o.hacim === 'bos') {
    parcalar.push(`<p style="margin:0;font-size:13.5px">Bu hafta ve önceki hafta reklam harcaması kaydedilmedi.</p>`);
  } else if (bolumGorunurMu('sonuc', kitle)) {
    const hucreler = o.metrikler.map((m) => {
      const ad = OZET_METRIK_TANIMI[m.metrik].ad + (m.kesinlesmedi ? '*' : '');
      const renk = m.yon === 'kotu' ? KIRMIZI : GRI;
      const kalin = m.yon === 'iyi' || m.yon === 'kotu' ? 'font-weight:700;' : '';
      const alt = [m.onceki ? htmlKac(m.onceki.metin) : null, m.degisim === null ? null : `<span style="${kalin}color:${renk}">${degisimMetni(m.degisim)}</span>`]
        .filter(Boolean)
        .join(' · ');
      return (
        `<td valign="top" style="padding:10px 12px;border:1px solid ${CIZGI};width:25%">` +
        `<span style="display:block;font-size:11.5px;font-weight:600;color:${IKINCIL}">${htmlKac(ad)}</span>` +
        `<span style="display:block;font-family:${BASLIK_FONT};font-size:18px;font-weight:700;color:${SIYAH};margin-top:2px">${m.bu ? htmlKac(m.bu.metin) : '-'}</span>` +
        `<span style="display:block;font-size:11.5px;color:${IKINCIL}">${alt || '&nbsp;'}</span></td>`
      );
    });
    parcalar.push(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${hucreler.join('')}</tr></table>`,
    );
    if (o.metrikler.some((m) => m.kesinlesmedi)) {
      const k = o.donusumKiyasi;
      const gunler = k ? `${gunAdi(k.bu.bas)}-${gunAdi(k.bu.son)} günleri` : 'olgun günleri';
      parcalar.push(
        `<p style="margin:0;font-size:12px;color:${IKINCIL}">* Haftanın son günlerinin dönüşümleri henüz kesinleşmedi. Değişim iki haftanın ${htmlKac(gunler)} üzerinden.</p>`,
      );
    }
  }

  if (bolumGorunurMu('yorum', kitle)) {
    if (o.yorum.durum === 'yazildi' && o.yorum.metin) {
      parcalar.push(
        `<div style="border-left:3px solid ${KIRMIZI};background:${ZEMIN};padding:10px 12px;font-size:13.5px;color:${GRI}">${htmlKac(o.yorum.metin)}` +
          `<span style="display:block;font-size:11px;color:${IKINCIL};margin-top:4px">Yapay zekâ yorumu · sayılar yukarıdaki tablodan</span></div>`,
      );
    } else if (kitle === 'ajans' && o.hacim !== 'bos') {
      // Yorumun neden olmadığı YALNIZ ajansa: müşteri yorumsuz bir mail
      // görüyor, "yapay zekâ bozuk" cümlesini değil.
      parcalar.push(`<p style="margin:0">${kucuk(`Yorum yok: ${YORUM_DURUMU_ADI[o.yorum.durum]}`)}</p>`);
    }
  }

  if (o.hacim !== 'bos' && bolumGorunurMu('degisenler', kitle)) {
    const d = o.degisenler;
    let govde: string;
    if (d.kalemler.length > 0) {
      const th = (t: string, sag = false) =>
        `<th style="text-align:${sag ? 'right' : 'left'};padding:8px 10px;border-bottom:1px solid ${CIZGI};font-size:11.5px;color:${IKINCIL};font-weight:600">${t}</th>`;
      const td = (t: string, sag = false) =>
        `<td style="text-align:${sag ? 'right' : 'left'};padding:8px 10px;border-bottom:1px solid ${CIZGI};font-size:13px;color:${GRI}">${t}</td>`;
      const satirlar = d.kalemler.map(
        (k) =>
          '<tr>' +
          td(`${htmlKac(k.ad)}<br>${kucuk(PLATFORM_KISA_ADLARI[k.platform])}`) +
          td(htmlKac(`${OZET_METRIK_TANIMI[k.metrik].ad} ${degisimMetni(k.degisim)}`)) +
          td(htmlKac(kalemDegeri(k.metrik, k.bu, para)), true) +
          td(htmlKac(kalemDegeri(k.metrik, k.onceki, para)), true) +
          '</tr>',
      );
      govde =
        `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${CIZGI};border-collapse:collapse">` +
        `<tr>${th('Kampanya')}${th('Ne değişti')}${th('Geçen hafta', true)}${th('Önceki', true)}</tr>${satirlar.join('')}</table>`;
    } else {
      govde = `<p style="margin:0;font-size:13px">${
        d.bosNedeni === 'dusuk_hacim'
          ? 'Gösterim az olduğu için kampanyalar kıyaslanmadı.'
          : 'Kampanyalarda belirgin bir değişiklik olmadı.'
      }</p>`;
    }
    const elenen = d.elenen.hacim_dusuk + d.elenen.degisim_kucuk + d.elenen.pay_kucuk + d.elenen.deger_yok;
    const not = d.kalemler.length > 0 && elenen > 0
      ? `<p style="margin:6px 0 0 0">${kucuk(`${elenen} küçük değişiklik listeye alınmadı (az gösterim, küçük değişim ya da küçük pay).`)}</p>`
      : '';
    parcalar.push(`<div>${h4(BOLUM_ADI.degisenler)}${govde}${not}</div>`);
  }

  if (bolumGorunurMu('yaptiklarimiz', kitle)) {
    const y = o.yaptiklarimiz;
    const govde =
      y.toplam === 0
        ? `<p style="margin:0;font-size:13px">Bu hafta hesapta ölçülen bir değişiklik yapılmadı.</p>`
        : liste(
            y.satirlar.map(
              (s) =>
                `<b style="color:${SIYAH}">${htmlKac(DEGISIKLIK_TURU_ADI[s.tur])}</b> · ${htmlKac(`${s.varlikAdi}: ${s.metin}`)}<br>` +
                kucuk(`${gunMetni(s.gun)} · ${DEGISIKLIK_YOLU_ADI[s.yol]}`),
            ),
          ) + fazla(y.toplam, y.satirlar.length);
    parcalar.push(`<div>${h4(BOLUM_ADI.yaptiklarimiz)}${govde}</div>`);
  }

  if (bolumGorunurMu('etkiler', kitle) && (o.etkiler.toplam > 0 || o.etkiler.olcumde > 0)) {
    const e = o.etkiler;
    const satirlar = e.satirlar.map((s) => {
      const nokta = s.sonuc === 'iyilesti' ? YESIL : s.sonuc === 'kotulesti' ? KIRMIZI : IKINCIL;
      return (
        `<span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${nokta};margin-right:6px"></span>` +
        `<b style="color:${SIYAH}">${htmlKac(s.varlikAdi)}</b> · ${htmlKac(s.ne)}<br>${kucuk(s.cumle)}`
      );
    });
    const olcumde = e.olcumde > 0 ? `<p style="margin:6px 0 0 0">${kucuk(`${e.olcumde} değişikliğin etkisi hâlâ ölçülüyor.`)}</p>` : '';
    parcalar.push(`<div>${h4(BOLUM_ADI.etkiler)}${satirlar.length > 0 ? liste(satirlar) : ''}${fazla(e.toplam, e.satirlar.length)}${olcumde}</div>`);
  }

  // ─── Yalnız ajans ─────────────────────────────────────────────────────────
  const ajans: string[] = [];
  if (o.sinyaller && bolumGorunurMu('sinyaller', kitle)) {
    const s = o.sinyaller;
    const govde = s.sessizKosum
      ? `<p style="margin:0;font-size:13px">Sinyaller sessiz koşumda; kanala gönderilmiyor.</p>`
      : s.toplam === 0
        ? `<p style="margin:0;font-size:13px">Açık sinyal yok.</p>`
        : liste(
            s.satirlar.map(
              (x) =>
                `<b style="color:${x.onem === 'yuksek' ? KIRMIZI : SIYAH}">${x.onem === 'yuksek' ? 'Yüksek' : 'Orta'}</b> · ${htmlKac(`${x.varlikAdi}: ${x.baslik}`)}`,
            ),
          ) + fazla(s.toplam, s.satirlar.length);
    ajans.push(`<div>${h4(`${BOLUM_ADI.sinyaller} (${s.toplam})`)}${govde}</div>`);
  }
  if (o.bekleyenIsler && bolumGorunurMu('bekleyen_isler', kitle)) {
    const b = o.bekleyenIsler;
    const satirlar = [
      ...(b.acikOneri > 0 ? [`İyileştir'de onay bekleyen ${b.acikOneri} öneri`] : []),
      ...b.isler.filter((i) => i.tur !== 'sinyal_acik').map((i) => BEKLEYEN_IS_METNI[i.tur](i.sayi)),
    ];
    ajans.push(
      `<div>${h4(BOLUM_ADI.bekleyen_isler)}${
        satirlar.length > 0 ? liste(satirlar.map(htmlKac)) : '<p style="margin:0;font-size:13px">Bekleyen iş yok.</p>'
      }</div>`,
    );
  }
  if (o.oneri && bolumGorunurMu('oneri', kitle)) {
    ajans.push(`<div>${h4(BOLUM_ADI.oneri)}<p style="margin:0;font-size:13.5px">${htmlKac(o.oneri.metin)}</p></div>`);
  }
  if (ajans.length > 0) {
    parcalar.push(
      `<div style="border:1px dashed ${GRI};padding:12px">` +
        `<p style="margin:0 0 10px 0;font-size:10.5px;font-weight:700;letter-spacing:.4px;color:${GRI}">YALNIZ AJANS</p>` +
        ajans.join('<div style="height:10px"></div>') +
        '</div>',
    );
  }

  if (o.hatalar.length > 0) {
    parcalar.push(
      `<p style="margin:0">${kucuk(`Okunamayan bölüm: ${o.hatalar.map((h) => `${BOLUM_ADI[h.kaynak]} (${h.mesaj})`).join('; ')}`)}</p>`,
    );
  }

  parcalar.push(
    `<p style="margin:0"><a href="${htmlKac(panelAdresi)}" style="display:inline-block;background:${KIRMIZI};color:#ffffff;text-decoration:none;font-weight:700;font-size:13px;padding:9px 16px">Panelde aç</a></p>`,
  );
  parcalar.push(
    `<p style="margin:0;border-top:1px solid ${CIZGI};padding-top:12px;font-size:11.5px;color:${IKINCIL}">` +
      htmlKac(
        kitle === 'musteri'
          ? `Bu mail ${o.clientAdi} için haftalık olarak gönderilir. Göndermeyi durdurmak için ajansınıza yazın.`
          : `Bu mail ${o.clientAdi} için ajans bildirim kanalına gönderildi. Kanalı Marka Merkezi › Bildirimler'den yönetebilirsiniz.`,
      ) +
      '</p>',
  );

  const html =
    `<div style="background:${ZEMIN};padding:16px 0;font-family:${GOVDE_FONT};color:${GRI};font-size:14px;line-height:1.5">` +
    `<table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid ${CIZGI};border-collapse:collapse">` +
    `<tr><td style="padding:18px 20px 10px 20px;border-bottom:3px solid ${KIRMIZI};font-family:${BASLIK_FONT};font-size:18px;font-weight:800;color:${SIYAH}">ADVETICS<span style="color:${KIRMIZI}">.</span></td></tr>` +
    `<tr><td style="padding:16px 20px 20px 20px">${parcalar.join('<div style="height:18px"></div>')}</td></tr>` +
    '</table></div>';

  return { konu: ozetKonusu(o), html };
}
