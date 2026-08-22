import {
  formatMoney,
  formatNumber,
  formatPercent,
  type ReportData,
  type ReportPlatformBlock,
} from '@advetics/shared';

/**
 * ═══ RAPOR MAİLİ — SAYILAR ÜRETİLİYOR, ANLATI ÜRETİLMİYOR ═══
 *
 * Ajansın kullandığı mail bir performans özeti ve İKİ TÜR içerik taşıyor:
 *
 *   · SAYILAR — harcama, gösterim, tıklama, form/mesaj. Bunlar rapordan
 *     birebir geliyor ve elle yazılmaları hata kaynağı: örnek metinde
 *     platform toplamları genel toplamı tutmuyordu (₺34.001,64 vs
 *     ₺34.026,44; 341.398 vs 322.754 gösterim). Otomatik üretilen mail
 *     kendi içinde tutarlı.
 *
 *   · ANLATI — "Urla bölgesindeki konut ve villa aramalarında aktif satın
 *     alma niyetindeki kitleyi yakalamak" gibi cümleler. Bunlar VERİDEN
 *     ÜRETİLEMEZ; uydurmak, müşteriye yanlış bir strateji anlatmak olurdu.
 *     Taslak bunları BOŞ BIRAKMIYOR ama doldurmuyor da: şablonun kapanış
 *     metni geliyor ve gönderen kişi göndermeden önce düzenliyor.
 *
 * Bu yüzden uç nokta "gönder" değil "taslak üret + gönder": taslak ekranda
 * düzenlenebiliyor.
 */
export interface MailTaslagi {
  subject: string;
  html: string;
}

export function raporMailTaslagi(data: ReportData, danismanAdi: string): MailTaslagi {
  const p = data.currency;
  const t = data.total ?? data.platforms[0] ?? null;

  const bloklar = data.platforms.map((b, i) => platformBlogu(b, i + 1, p)).join('');

  const oneCikan = enIyiKampanyalar(data)
    .map(
      (k) =>
        `<li><strong>${kacis(k.name)}:</strong> ${formatMoney(k.spendMicros, p)} harcama, ` +
        `${formatNumber(k.impressions)} gösterim ve ${formatNumber(k.clicks)} tıklama ` +
        `(${formatPercent(k.ctr)} TO) ile ${formatNumber(k.conversions)} dönüşüm.</li>`,
    )
    .join('');

  /*
   * ARAMA TERİMLERİ ANAHTAR KELİMELERİN YERİNE GEÇMİYOR, YANINA GELİYOR.
   * Biri hedeflediğimiz, diğeri kullanıcının yazdığı şey; ikisini tek listede
   * karıştırmak müşteriye "bu kelimeyi biz mi seçtik" sorusunu sordururdu.
   */
  const kelimeler = (data.keywords ?? [])
    .slice(0, 3)
    .map(
      (k) =>
        `<li><strong>${kacis(k.keyword)}</strong> (anahtar kelime): ${formatMoney(k.spendMicros, p)} harcama, ` +
        `${formatNumber(k.clicks)} tıklama (${formatPercent(k.ctr)} TO).</li>`,
    )
    .join('');

  const terimler = (data.searchTerms ?? [])
    .slice(0, 3)
    .map(
      (t) =>
        `<li><strong>${kacis(t.term)}</strong> (arama terimi): ${formatMoney(t.spendMicros, p)} harcama, ` +
        `${formatNumber(t.clicks)} tıklama ile ${formatNumber(t.conversions)} dönüşüm.</li>`,
    )
    .join('');

  const html = `<p>Merhaba,</p>
<p>${donem(data.from, data.to)} dönemini kapsayan <strong>${kacis(data.client.name)}</strong> firmasına ait
aylık dijital pazarlama faaliyetlerinin kurumsal reklam özeti aşağıda bilgilerinize sunulmuştur.
Ayrıntılı rapor ekte yer almaktadır.</p>

<h3>Genel Performans Özeti</h3>
<ul>
  <li>Toplam Harcama: <strong>${formatMoney(t?.spendMicros ?? null, p)}</strong></li>
  <li>Toplam Gösterim: <strong>${formatNumber(t?.impressions ?? null)}</strong></li>
  <li>Toplam Tıklama: <strong>${formatNumber(t?.clicks ?? null)}</strong></li>
  <li>Toplam Dönüşüm: <strong>${formatNumber(t?.conversions ?? null)}</strong></li>
  <li>Ortalama TBM: <strong>${formatMoney(mikro(t?.cpc ?? null), p)}</strong></li>
</ul>

<h3>Mecra ve Kampanya Bazlı Reklam Sonuçları</h3>
${bloklar}

${
  oneCikan || kelimeler || terimler
    ? `<h3>Öne Çıkan Kampanya ve Arama Terimleri Performansı</h3><ul>${oneCikan}${kelimeler}${terimler}</ul>`
    : ''
}

<h3>Genel Değerlendirme</h3>
<p>${kacis(data.closingText ?? '').replace(/\n/g, '<br />') || '&nbsp;'}</p>

<p>Rapor detayları ve faturalandırma süreci ile ilgili sorularınız için bizimle her zaman
iletişime geçebilirsiniz.</p>
<p>İyi çalışmalar dileriz.<br />${kacis(danismanAdi)}</p>`;

  return {
    subject: `${data.client.name} — ${donem(data.from, data.to)} Reklam Raporu`,
    html,
  };
}

function platformBlogu(b: ReportPlatformBlock, sira: number, para: string | null): string {
  const k = b.conversionCounts;
  /*
   * DÖNÜŞÜM DÖKÜMÜ YALNIZCA VARSA. Google `actions` dizisi döndürmüyor ve
   * orada "0 form, 0 mesaj" yazmak "hiç form gelmedi" gibi okunur — oysa o
   * platformda bu döküm diye bir şey yok.
   */
  const dokum =
    k.form > 0 || k.message > 0
      ? `<li>Dönüşüm detayları: <strong>${formatNumber(k.form)}</strong> adet nitelikli müşteri formu ` +
        `ve <strong>${formatNumber(k.message)}</strong> adet mesaj başlatması olmak üzere toplam ` +
        `<strong>${formatNumber(b.conversions)}</strong> dönüşüm elde edilmiştir.</li>`
      : `<li>Toplam Dönüşüm: <strong>${formatNumber(b.conversions)}</strong></li>`;

  return `<p><strong>${sira}. ${kacis(b.label)}</strong></p>
<ul>
  <li>Harcama: <strong>${formatMoney(b.spendMicros, para)}</strong></li>
  <li>Gösterim / Tıklama: ${formatNumber(b.impressions)} gösterim / ${formatNumber(b.clicks)} tıklama</li>
  <li>Tıklama Oranı (TO): ${formatPercent(b.ctr)}</li>
  <li>Ortalama TBM: ${formatMoney(mikro(b.cpc), para)}</li>
  ${dokum}
</ul>`;
}

/** En çok harcayan üç kampanya — platform fark etmeksizin. */
function enIyiKampanyalar(data: ReportData) {
  return [...data.metaCampaigns, ...data.googleCampaigns]
    .sort((a, b) => Number(BigInt(b.spendMicros) - BigInt(a.spendMicros)))
    .slice(0, 3);
}

function mikro(v: number | null): string | null {
  return v === null ? null : String(Math.round(v * 1_000_000));
}

/**
 * HTML KAÇIŞI — müşteri adı ve kampanya adı PLATFORMDAN geliyor.
 *
 * Kampanya adını reklam veren yazıyor ve içinde `<` olabiliyor. Kaçırmadan
 * gömmek, giden mailde bozuk işaretleme (ve alıcının istemcisinde bir
 * enjeksiyon yüzeyi) demek.
 */
function kacis(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const AYLAR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

/** `1 - 31 Temmuz 2026` — aynı aydaysa ay bir kez yazılıyor. */
function donem(from: string, to: string): string {
  const [y1, a1, g1] = from.split('-').map(Number) as [number, number, number];
  const [y2, a2, g2] = to.split('-').map(Number) as [number, number, number];
  if (y1 === y2 && a1 === a2) return `${g1} - ${g2} ${AYLAR[a1 - 1]} ${y1}`;
  if (y1 === y2) return `${g1} ${AYLAR[a1 - 1]} - ${g2} ${AYLAR[a2 - 1]} ${y1}`;
  return `${g1} ${AYLAR[a1 - 1]} ${y1} - ${g2} ${AYLAR[a2 - 1]} ${y2}`;
}
