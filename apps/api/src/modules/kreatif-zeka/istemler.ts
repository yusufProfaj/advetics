import {
  AMAC_GRUBU_ADI,
  ETIKET_ETIKETLERI,
  GORU_ALAN_ADLARI,
  GORU_ALANLARI,
  METRIK_GOSTERIMI,
  type BriefBulgusu,
} from '@advetics/shared';

/**
 * ═══ GEMİNİ İSTEMLERİ (görü + brief) ═══
 *
 * İKİSİ DE ŞEMADAN TÜRETİLİYOR: alan listesi ve değer adları shared'daki
 * sabitlerden okunuyor. Elle yazılmış bir alan listesi, şemaya alan
 * eklendiğinde istemde eksik kalır ve model o alanı hiç doldurmaz;
 * `etiketCoz` de cevabı "şema dışı" diye reddeder (her kreatif para yakıp
 * `sema_disi` olurdu).
 */

/** Alan başına tek satırlık tarif. `Record` olduğu için yeni alan derlemeyi buraya getirir. */
const ALAN_TARIFI: Record<(typeof GORU_ALAN_ADLARI)[number], string> = {
  insan: 'görselde bir insan (yüz, el, beden) görünüyor mu',
  urun_gorunur: 'satılan ürün ya da hizmetin kendisi görünüyor mu',
  metin_yogunlugu: 'görselin ÜSTÜNE yazılmış yazı: yok, az (bir iki kısa satır), çok (görselin önemli kısmını kaplıyor)',
  baskin_renk: 'baskın renk tonu: sıcak (kırmızı, turuncu, sarı), soğuk (mavi, yeşil, mor), nötr (beyaz, gri, siyah, bej)',
  eylem_cagrisi_gorselde: 'görselin içinde "hemen al", "şimdi ara" gibi bir çağrı ya da düğme görünüyor mu',
  fiyat_veya_indirim: 'görselde fiyat, indirim oranı ya da kampanya rozeti var mı',
  logo_gorunur: 'markanın logosu görünüyor mu',
  gorsel_turu: 'fotograf (gerçek çekim), tasarim (grafik, illüstrasyon), karma (fotoğraf üstüne grafik)',
};

export const GORU_SISTEM_ISTEMI = [
  'Sen bir reklam görseli sınıflandırıcısısın. Görseli yalnız aşağıdaki alanlara göre etiketle.',
  'Her alanda verilen değerlerden TAM OLARAK birini seç; kararsız kalırsan görselde en çok öne çıkan durumu seç.',
  'Başka alan ekleme, açıklama yazma; yalnız JSON döndür.',
].join(' ');

export function goruIstemi(): string {
  const satirlar = GORU_ALAN_ADLARI.map((a) => `- ${a} (${GORU_ALANLARI[a].join(' | ')}): ${ALAN_TARIFI[a]}`);
  return ['Bu reklam görselini etiketle. Alanlar:', ...satirlar].join('\n');
}

/**
 * BRIEF: modele SAYI GİTMİYOR (MIMARI § 8). Bulgunun kodu, yönü ve Türkçe
 * değer adları gidiyor; oran ve örneklem şablon cümlesinde (`farkCumlesi`)
 * kalıyor. Model sayı yazarsa `briefMetniDenetle` reddediyor; talimat bir
 * gün atlanır, ret atlanmaz.
 */
export const BRIEF_SISTEM_ISTEMI = [
  'Sen bir reklam ajansında kreatif yönetmensin. Sana bir reklam hesabının geçmişinden çıkmış, görsellerin hangi özelliklerinin daha iyi sonuç verdiğini gösteren bulgular veriliyor.',
  'Bir sonraki reklam görselini hazırlayacak tasarımcıya kısa ve uygulanabilir bir yönerge yaz.',
  'RAKAM YAZMA: hiçbir alanda sayı, yüzde ya da oran kullanma; en-boy oranını kelimeyle söyle (kare, dikey, yatay).',
  'Her bulgu için TAM BİR talimat yaz, bulguların sırasıyla ve bulgunun alan kodunu "alan" alanına aynen koy. Bulgu uydurma.',
  'Türkçe yaz, kısa cümlelerle.',
].join(' ');

export function briefIstemMetni(kumeAmaci: keyof typeof AMAC_GRUBU_ADI, bulgular: readonly BriefBulgusu[]): string {
  const satirlar = bulgular.map((b) => {
    const e = ETIKET_ETIKETLERI[b.alan];
    const iyi = e.degerler[b.deger] ?? b.deger;
    const karsi = b.karsi
      .split(',')
      .map((k) => e.degerler[k] ?? k)
      .join(' ya da ');
    return `- alan: ${b.alan} (${e.ad}). Daha iyi giden: "${iyi}". Karşısındaki: "${karsi}". Ölçüt: ${METRIK_GOSTERIMI[b.metrik].ad.toLocaleLowerCase('tr')}.`;
  });
  return [`Reklam amacı: ${AMAC_GRUBU_ADI[kumeAmaci]}.`, 'Bulgular (önem sırasıyla):', ...satirlar].join('\n');
}

/** Gemini `responseJsonSchema`: `briefCevabiSchema` ile aynı alanlar (testte karşılaştırılıyor). */
export function briefJsonSemasi(alanlar: readonly string[]): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      yon: { type: 'string' },
      talimatlar: {
        type: 'array',
        items: {
          type: 'object',
          properties: { alan: { type: 'string', enum: [...new Set(alanlar)] }, talimat: { type: 'string' } },
          required: ['alan', 'talimat'],
          additionalProperties: false,
        },
      },
      kacin: { type: 'array', items: { type: 'string' } },
    },
    required: ['yon', 'talimatlar', 'kacin'],
    additionalProperties: false,
  };
}
