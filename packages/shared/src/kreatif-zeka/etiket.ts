import { z } from 'zod';

/**
 * ═══ KREATİF ETİKET ŞEMASI v1 — SABİT VE KAPALI ═══
 *
 * Ayrıntı ve gerekçe: `docs/kreatif-zeka/MIMARI.md` § 2 ve Ç-1.
 *
 * NEDEN SABİT (workspace'e özel değil): etiket × performans karşılaştırması
 * ancak AYNI etiketin yeterince kreatifte geçmesiyle anlam kazanıyor. Tipik
 * bir workspace'te harcaması olan kreatif sayısı onlarla ölçülüyor; workspace
 * kendi etiketlerini tanımlasaydı her etiket birkaç kreatifte kalır ve
 * neredeyse her karşılaştırma "veri yetersiz" çıkardı. Ayrıca şema
 * değiştiğinde eski etiketler YENİ şemayla karşılaştırılamaz: kapalı tek şema
 * bunu bir sürüm numarasına (`ETIKET_SEMA_SURUMU`) indiriyor.
 *
 * NEDEN HER ALAN İKİ-ÜÇ DEĞERLİ: değer sayısı arttıkça her grup küçülüyor.
 * "Baskın renk" on renk olsaydı kırmızı görselli kreatif sayısı üç olurdu ve
 * "kırmızı daha iyi" cümlesi gürültüden üretilmiş olurdu.
 *
 * YAPAY ZEKÂNIN BİLMEDİĞİ ŞEYİ YAPAY ZEKÂYA SORMA: biçim (görsel/video/
 * karusel) ve en-boy oranı platform verisinden ve görselin başlığından KESİN
 * okunuyor; Gemini'ye sorulursa yanılabilir ve aynı görsel iki çağrıda iki
 * farklı cevap alabilir. O iki alan `KESIN_ALANLAR`da ve modele gitmiyor.
 */

/** Şema değişirse artar; istatistik yalnız GÜNCEL sürümün etiketlerini okur. */
export const ETIKET_SEMA_SURUMU = 1;

/**
 * Gemini'nin doldurduğu alanlar. Sıra ekrandaki sıradır.
 *
 * Değer adları kod (ASCII, küçük harf); Türkçe karşılık `ETIKET_ETIKETLERI`te.
 * `belirsiz` YOK ve bilinçli: model kararsız kaldığında "belirsiz"e kaçmak
 * çok kolay ve o değer hiçbir karşılaştırmaya girmeyen ölü bir kova olur.
 * Model her alanda bir taraf seçmek zorunda; kararsızlığı ölçüm betiği
 * (aynı görsel iki kez) yakalar, MIMARI § 9.2.
 */
export const GORU_ALANLARI = {
  insan: ['yok', 'var'],
  urun_gorunur: ['yok', 'var'],
  metin_yogunlugu: ['yok', 'az', 'cok'],
  baskin_renk: ['sicak', 'soguk', 'notr'],
  eylem_cagrisi_gorselde: ['yok', 'var'],
  fiyat_veya_indirim: ['yok', 'var'],
  logo_gorunur: ['yok', 'var'],
  gorsel_turu: ['fotograf', 'tasarim', 'karma'],
} as const;

/** Platform verisinden ve görsel başlığından kesin okunan alanlar (modele GİTMEZ). */
export const KESIN_ALANLAR = {
  bicim: ['gorsel', 'video', 'karusel'],
  en_boy: ['kare', 'dikey', 'yatay'],
} as const;

export type GoruAlani = keyof typeof GORU_ALANLARI;
export type KesinAlan = keyof typeof KESIN_ALANLAR;
export type EtiketAlani = GoruAlani | KesinAlan;

export const GORU_ALAN_ADLARI = Object.keys(GORU_ALANLARI) as GoruAlani[];
export const ETIKET_ALAN_ADLARI = [...GORU_ALAN_ADLARI, ...(Object.keys(KESIN_ALANLAR) as KesinAlan[])] as EtiketAlani[];

export type GoruEtiketleri = { [K in GoruAlani]: (typeof GORU_ALANLARI)[K][number] };
export type KesinEtiketler = { [K in KesinAlan]: (typeof KESIN_ALANLAR)[K][number] };
export type KreatifEtiketleri = GoruEtiketleri & KesinEtiketler;

/** Alan → değer listesi (iki kaynağın birleşimi). */
export function alanDegerleri(alan: EtiketAlani): readonly string[] {
  return (alan in GORU_ALANLARI ? GORU_ALANLARI[alan as GoruAlani] : KESIN_ALANLAR[alan as KesinAlan]) as readonly string[];
}

/** Ekrandaki Türkçe adlar. `Record` olduğu için yeni alan eklemek derlemeyi buraya getirir. */
export const ETIKET_ETIKETLERI: { [K in EtiketAlani]: { ad: string; degerler: Record<string, string> } } = {
  insan: { ad: 'İnsan', degerler: { yok: 'İnsan yok', var: 'İnsan var' } },
  urun_gorunur: { ad: 'Ürün', degerler: { yok: 'Ürün görünmüyor', var: 'Ürün görünüyor' } },
  metin_yogunlugu: { ad: 'Görseldeki yazı', degerler: { yok: 'Yazı yok', az: 'Az yazı', cok: 'Çok yazı' } },
  baskin_renk: { ad: 'Renk', degerler: { sicak: 'Sıcak renkler', soguk: 'Soğuk renkler', notr: 'Nötr renkler' } },
  eylem_cagrisi_gorselde: { ad: 'Görselde çağrı', degerler: { yok: 'Görselde çağrı yok', var: 'Görselde çağrı var' } },
  fiyat_veya_indirim: { ad: 'Fiyat / indirim', degerler: { yok: 'Fiyat yok', var: 'Fiyat ya da indirim var' } },
  logo_gorunur: { ad: 'Logo', degerler: { yok: 'Logo yok', var: 'Logo var' } },
  gorsel_turu: { ad: 'Görsel türü', degerler: { fotograf: 'Fotoğraf', tasarim: 'Tasarım', karma: 'Fotoğraf + tasarım' } },
  bicim: { ad: 'Biçim', degerler: { gorsel: 'Tek görsel', video: 'Video', karusel: 'Karusel' } },
  en_boy: { ad: 'En-boy', degerler: { kare: 'Kare', dikey: 'Dikey', yatay: 'Yatay' } },
};

/**
 * Gemini `responseJsonSchema` gövdesi. ŞEMADAN TÜRETİLİYOR: elle ikinci bir
 * JSON şeması yazmak, alan eklendiğinde ikisinin ayrışması demekti ve model
 * eksik alanı hiç doldurmaz, `etiketCoz` da "şema dışı" der.
 */
export function goruJsonSemasi(): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const alan of GORU_ALAN_ADLARI) properties[alan] = { type: 'string', enum: [...GORU_ALANLARI[alan]] };
  return { type: 'object', properties, required: [...GORU_ALAN_ADLARI], additionalProperties: false };
}

const goruCevabiSchema = z
  .object(
    Object.fromEntries(GORU_ALAN_ADLARI.map((a) => [a, z.enum(GORU_ALANLARI[a] as unknown as [string, ...string[]])])) as Record<
      GoruAlani,
      z.ZodEnum<[string, ...string[]]>
    >,
  )
  .strict();

/**
 * Modelin cevabını doğrular. Şema dışı cevap SESSİZCE düzeltilmez ve
 * varsayılan değerle doldurulmaz: eksik "insan" alanını "yok" saymak,
 * o kreatifi yanlış gruba koyup karşılaştırmayı bozardı. Sonuç
 * `etiketlenemez` + neden `sema_disi` (bir kez yeniden denenir, MIMARI § 4).
 */
export function etiketCoz(metin: string): { ok: true; etiketler: GoruEtiketleri } | { ok: false; sebep: string } {
  let ham: unknown;
  try {
    ham = JSON.parse(metin);
  } catch {
    return { ok: false, sebep: 'cevap JSON değil' };
  }
  const r = goruCevabiSchema.safeParse(ham);
  if (!r.success) {
    const ilk = r.error.issues[0];
    return { ok: false, sebep: `şema dışı: ${ilk?.path.join('.') || 'kök'} ${ilk?.message ?? ''}`.trim() };
  }
  return { ok: true, etiketler: r.data as GoruEtiketleri };
}

/**
 * En-boy oranı görselin KENDİ boyutundan. Eşik ±%10: 1080×1080 kare,
 * 1080×1350 (4:5) dikey, 1200×628 (1,91:1) yatay. 4:5'i "kareye yakın"
 * saymak cazip ama Meta onu akışta dikey olarak gösteriyor ve performansı
 * kareden farklı; sınır 1,1'de.
 */
export function enBoyAnla(genislik: number, yukseklik: number): KesinEtiketler['en_boy'] | null {
  if (!(genislik > 0) || !(yukseklik > 0)) return null;
  const oran = genislik / yukseklik;
  if (oran > 1.1) return 'yatay';
  if (oran < 1 / 1.1) return 'dikey';
  return 'kare';
}

// ─── Görsel biçimi (görü girdisi) ───────────────────────────────────────────

/**
 * Gemini'nin kabul ettiği görsel biçimleri arasından CDN'lerin döndürdükleri.
 *
 * RAPORDAKİ LİSTEDEN GENİŞ ve bilinçli: rapor PDF'i `pdf-lib` yüzünden
 * yalnız JPEG/PNG gömebiliyor (`kreatif-gorseli.ts#turuAnla`), ama Meta
 * thumbnail'larının bir kısmı WebP ve görü girdisi için WebP sorunsuz.
 * Rapor listesini burada kullanmak WebP'li kreatifleri sessizce
 * "etiketlenemez" yapardı. GIF yok: Gemini'nin görsel listesinde değil.
 *
 * Biçim GÖVDEDEN (sihirli baytlar) okunur, uzantıdan ya da `content-type`tan
 * DEĞİL (CLAUDE.md "pdf-lib yalnız JPEG ve PNG" notu, aynı ders).
 */
export const GORU_BICIMLERI = ['jpg', 'png', 'webp'] as const;
export type GoruBicimi = (typeof GORU_BICIMLERI)[number];
export const GORU_MIME: Record<GoruBicimi, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export function goruBicimi(b: Uint8Array): GoruBicimi | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  // RIFF....WEBP: ilk dört bayt "RIFF", 8-11 "WEBP". Yalnız RIFF'e bakmak WAV/AVI'yi de kabul ederdi.
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return 'webp';
  }
  return null;
}

/**
 * Görü çağrısının ayarları — HEPSİ AÇIKÇA (CLAUDE.md "platformun
 * varsayılanına güvenme"). `mediaResolution` token maliyetini doğrudan
 * belirliyor ve varsayılanı modele göre değişiyor; yazılmazsa aynı kod
 * model güncellemesinde sessizce pahalılaşır. Sayılar ÖLÇÜLECEK (§ 9.1):
 * orta çözünürlük, metin yoğunluğunu okumaya yetiyor mu, betik söyleyecek.
 */
export const GORU_AYARI = {
  mediaResolution: 'MEDIA_RESOLUTION_MEDIUM',
  dusunme: 'low',
  enCokCikti: 300,
  /** Görsel indirme üst sınırı: rapordaki gibi 4 MB (`GORSEL_SINIRI`). */
  maxBayt: 4 * 1024 * 1024,
  indirmeZamanAsimiMs: 6000,
} as const;

/** İçerik özeti: indirilen baytların SHA-256'sı, küçük harf hex. */
export const ICERIK_OZETI_DESENI = /^[0-9a-f]{64}$/;

/**
 * KAYNAK ANAHTARI — görseli İNDİRMEDEN tanımanın yolu.
 *
 * İçerik özeti baytları indirmeyi gerektiriyor ve indirme, Meta'da önce bir
 * platform çağrısıyla adres tazelemeyi (CLAUDE.md "KREATİF GÖRSEL ADRESİ
 * İMZALI VE ÖLÜYOR"). Aynı görsel onlarca reklamda kullanılıyor (Meta aynı
 * içerikli kreatifi yeniden kullanıyor, N-12); platformun kendi görsel
 * kimliği bilindiğinde ikinci indirme hiç yapılmaz.
 *
 * `meta:img:<hesap>:<image_hash>` — image_hash HESAP BAŞINA (CLAUDE.md), o
 * yüzden hesap anahtarın içinde. `meta:vid:<video_id>`, `google:asset:<id>`.
 * Platform kimliği yoksa (gönderi tabanlı kreatif) `kreatif:<creative_id>`:
 * indirilir, içerik özetiyle tekilleşir.
 */
export const KAYNAK_ANAHTARI_DESENI = /^(meta:img:[0-9a-z_]+:[0-9a-f]{8,64}|meta:vid:\d+|google:asset:\d+|kreatif:[0-9a-f-]{36})$/;
