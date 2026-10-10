/**
 * AdvCampaign rehberinin SAF kararları (panel).
 *
 * Bileşenden ayrı duruyor çünkü panelde bileşen render eden test altyapısı
 * yok (`vitest.config.ts` bilinçli reddediyor): handler ya da effect içine
 * gömülen bir karar yalnız kaynak taramasıyla sınanabilir ve o tarama yanlış
 * şeyi kilitleyebilir (CLAUDE.md "REACT EFFECT'İNİN İÇİNDEKİ KARAR").
 *
 * BURADA YAZILMAYANLAR, BİLEREK:
 * - "Yayına ne kaldı" listesi. Tek cevap sunucunun `RehberKaydi.eksikler`i
 *   (paylaşılan `rehberEksikleri`). Panel ikinci bir liste kurarsa ekran
 *   "hazır" derken yayın kapısı reddeder.
 * - Amaç × platform açılışı. Tek karar `platformGorunurMu` (shared); burada
 *   yalnız onu ekranın sorusuna çeviriyoruz.
 * - "Senin yerine verdiğimiz kararlar". Sunucunun `kararlar`ı; panelde
 *   yazılırsa derleyiciyle karşılaştıran test ekranı yakalayamaz.
 */
import {
  REHBER_ACILIS,
  REHBER_AMACLARI,
  REHBER_AMAC_KODLARI,
  GERI_ALINABILIR_DURUMLAR,
  YAYIN_DURUM_SINIFI,
  amacGorunurMu,
  platformGorunurMu,
  tutarAyristir,
  type AlanKaynagi,
  type AnahtarKelime,
  type AnahtarKelimeOnerisi,
  type MetinOnerisi,
  type OzelKategori,
  type PlatformProvaSonucu,
  type PlatformYayinOzeti,
  type RehberAdimi,
  type RehberAlanAdi,
  type RehberAlanlari,
  type RehberAmacKodu,
  type RehberEksigi,
  type RehberHazirligi,
  type RehberPlatformu,
  type RehberProvaSonucu,
  type YayinDurumu,
  type YoutubeVideoListesi,
} from '@advetics/shared';
import { ApiRequestError } from '@/lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Değişiklik kuyruğu
// ─────────────────────────────────────────────────────────────────────────────

/** `PUT /reklam/rehberler/:id` gövdesindeki tek satır (`rehberGuncelleSchema`). */
export interface Degisiklik {
  alan: RehberAlanAdi;
  /**
   * Değerin KENDİSİ. `null` da bir değer ("Instagram yok", "yaş aralığı
   * yok"); alanı silmek `sil: true` ile (sözleşme, `rehberGuncelleSchema`).
   * İkisi bir sürüm karışıktı: Instagram'sız kurulum "hiç seçilmedi"den
   * ayrılamıyordu.
   */
  deger: unknown;
  kaynak: AlanKaynagi;
  sil?: true;
}

/** Alanı silen değişiklik (boşaltılan kutu, kaldırılan seçim). */
export function silme(alan: RehberAlanAdi, kaynak: AlanKaynagi = 'kullanici'): Degisiklik {
  return { alan, deger: null, kaynak, sil: true };
}

/** Sözleşmenin tek istekteki üst sınırı (`degisiklikler.max(30)`). */
export const ISTEK_BASINA_DEGISIKLIK = 30;

/**
 * Kuyruğa yeni değişiklik ekler: AYNI ALAN İKİ KEZ GİTMEZ, sonuncusu kazanır.
 * Kullanıcı başlığı harf harf yazarken her tuş bir değişiklik; birleştirilmeseydi
 * 600 ms sonra aynı alan için yirmi satır gönderilir ve sınır (30) aşılırdı.
 * Sıra ilk görünüşte kalır: ekranda neyin önce değiştiği sunucu için önemsiz,
 * ama sabit sıra testte kararlı çıktı demek.
 */
export function degisiklikBirlestir(kuyruk: readonly Degisiklik[], yeni: readonly Degisiklik[]): Degisiklik[] {
  const sonuc = [...kuyruk];
  for (const d of yeni) {
    const i = sonuc.findIndex((x) => x.alan === d.alan);
    if (i === -1) sonuc.push(d);
    else sonuc[i] = d;
  }
  return sonuc;
}

/**
 * Ekranda görünen alanlar = sunucunun son kaydı + henüz yazılmamış
 * değişiklikler. Sunucu cevabı geldiğinde kullanıcı yazmaya DEVAM ediyorsa
 * cevaptaki alan onun yazdığını ezmemeli; aksi hâlde imleç altındaki metin
 * geri sıçrar.
 */
export function yerelAlanlar(sunucu: RehberAlanlari, bekleyen: readonly Degisiklik[]): RehberAlanlari {
  if (bekleyen.length === 0) return sunucu;
  const a: Record<string, unknown> = { ...sunucu };
  for (const d of bekleyen) {
    if (d.sil) delete a[d.alan];
    else a[d.alan] = { deger: d.deger, kaynak: d.kaynak, kim: null, zaman: '' };
  }
  return a as RehberAlanlari;
}


/** Kayıt hatasının iki ayrı işi var: 409 yenilemek, diğerleri tekrar denemek. */
export type KayitHatasi = { tur: 'catisma' } | { tur: 'hata'; mesaj: string };

export function kayitHatasi(e: unknown): KayitHatasi {
  if (e instanceof ApiRequestError && e.status === 409) return { tur: 'catisma' };
  if (e instanceof ApiRequestError) return { tur: 'hata', mesaj: e.message };
  // `fetch` ağ hatasında tarayıcının İngilizce cümlesini ("Failed to fetch") fırlatıyor.
  if (e instanceof TypeError) return { tur: 'hata', mesaj: 'Sunucuya ulaşılamadı.' };
  if (e instanceof Error && e.message) return { tur: 'hata', mesaj: e.message };
  return { tur: 'hata', mesaj: 'Sunucuya ulaşılamadı.' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Öneriler: DÖRT HÂL AYRI (CLAUDE.md `.catch(() => setX([]))` yasağı)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * "Henüz istemedim", "soruluyor", "sonuç yok" ve "çağrı düştü" dördü
 * ekranda AYNI boş alan olarak görünürse kullanıcı hangisinde olduğunu
 * bilemez. Lokasyon aramasının neden boş döndüğü tam bu yüzden teşhis
 * edilemedi.
 */
export type OneriHali<T> =
  | { tur: 'istenmedi' }
  | { tur: 'isteniyor' }
  | { tur: 'bos'; neden: string }
  | { tur: 'dustu'; mesaj: string }
  | { tur: 'geldi'; deger: T };

export function oneriHatasi(e: unknown): { tur: 'dustu'; mesaj: string } {
  if (e instanceof ApiRequestError) return { tur: 'dustu', mesaj: e.message };
  if (e instanceof TypeError) return { tur: 'dustu', mesaj: 'Sunucuya ulaşılamadı.' };
  if (e instanceof Error && e.message) return { tur: 'dustu', mesaj: e.message };
  return { tur: 'dustu', mesaj: 'Sunucuya ulaşılamadı.' };
}

export function kelimeOnerisiHali(s: AnahtarKelimeOnerisi): OneriHali<AnahtarKelimeOnerisi> {
  if (s.satirlar.length > 0) return { tur: 'geldi', deger: s };
  // Sunucu boşun NEDENİNİ yazmakla yükümlü; yazmadıysa uydurmuyoruz.
  return { tur: 'bos', neden: s.bosNeden ?? 'Google bu arama için kelime önermedi.' };
}

export function metinOnerisiHali(m: MetinOnerisi): OneriHali<MetinOnerisi> {
  const dolu = m.anaMetin.trim() !== '' || m.basliklar.some((b) => b.trim()) || m.aciklamalar.some((a) => a.trim());
  if (dolu) return { tur: 'geldi', deger: m };
  return { tur: 'bos', neden: m.notlar.length ? m.notlar.join(' ') : 'Öneri boş döndü.' };
}

/** Kanal videoları: boş liste "kanalda video yok" ile "okunamadı" ayrı (dört hâl). */
export function videoListesiHali(r: YoutubeVideoListesi): OneriHali<YoutubeVideoListesi> {
  if (r.satirlar.length > 0) return { tur: 'geldi', deger: r };
  return { tur: 'bos', neden: r.bosNeden ?? 'Bu kanalda yayınlanmış video yok.' };
}

/**
 * Form şablonu seçicisinin hâli. `null` = sayfanın formları OKUNAMADI;
 * boş dizi = okundu, kayıtlı form yok. İkisini aynı boş seçiciye çevirmek
 * kullanıcıyı ya olmayan bir izin sorununu ya da olmayan bir formu aramaya
 * gönderir.
 */
export type FormSecimi =
  | { tur: 'okunamadi' }
  | { tur: 'yok' }
  | { tur: 'liste'; formlar: ReadonlyArray<{ id: string; ad: string }> };

export function formSecimi(formlar: ReadonlyArray<{ id: string; ad: string }> | null | undefined): FormSecimi {
  if (formlar === null || formlar === undefined) return { tur: 'okunamadi' };
  return formlar.length === 0 ? { tur: 'yok' } : { tur: 'liste', formlar };
}

export interface KelimeSatiri {
  metin: string;
  aylikArama: number | null;
  rekabet: 'dusuk' | 'orta' | 'yuksek' | null;
  secili: boolean;
}

const kucuk = (s: string) => s.trim().toLocaleLowerCase('tr-TR');

/**
 * Seçili kelimeler ÖNCE ve hepsi (öneri listesinde olmasa da: elle eklenen
 * ya da önceki öneriden kalan), sonra seçilmemiş öneriler. Aynı kelime iki
 * kez çıkmaz; Türkçe küçük harfle karşılaştırılır ("İzmir" = "izmir").
 */
export function kelimeSatirlari(secili: readonly AnahtarKelime[], oneri: AnahtarKelimeOnerisi | null): KelimeSatiri[] {
  const gorulen = new Set<string>();
  const sonuc: KelimeSatiri[] = [];
  const oneriHaritasi = new Map((oneri?.satirlar ?? []).map((s) => [kucuk(s.metin), s]));
  for (const k of secili) {
    const anahtar = kucuk(k.metin);
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    sonuc.push({ metin: k.metin, aylikArama: k.aylikArama, rekabet: oneriHaritasi.get(anahtar)?.rekabet ?? null, secili: true });
  }
  for (const s of oneri?.satirlar ?? []) {
    const anahtar = kucuk(s.metin);
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    sonuc.push({ metin: s.metin, aylikArama: s.aylikArama, rekabet: s.rekabet, secili: false });
  }
  return sonuc;
}

/** Bir kelimeyi seçer/bırakır; seçim listesi sözleşmenin biçiminde döner. */
export function kelimeDegistir(secili: readonly AnahtarKelime[], satir: Pick<KelimeSatiri, 'metin' | 'aylikArama'>): AnahtarKelime[] {
  const anahtar = kucuk(satir.metin);
  if (secili.some((k) => kucuk(k.metin) === anahtar)) return secili.filter((k) => kucuk(k.metin) !== anahtar);
  return [...secili, { metin: satir.metin.trim(), aylikArama: satir.aylikArama }];
}

// ─────────────────────────────────────────────────────────────────────────────
// Görünürlük (tek karar `platformGorunurMu`)
// ─────────────────────────────────────────────────────────────────────────────

/** Kullanıcının görebileceği amaç kartları, sabit sırada. */
export function gorunurAmaclar(ajansYoneticisi: boolean): RehberAmacKodu[] {
  return REHBER_AMAC_KODLARI.filter((k) => amacGorunurMu(k, ajansYoneticisi));
}

export interface PlatformDurumu {
  /** Anahtar açılabilir mi. */
  gorunur: boolean;
  /** Açılamıyorsa NEDENİ — kart üstü çizili kalır ve sebebi yazar. */
  sebep: string | null;
  /** `deneme` açılışı: kurulum duraklatılmış kalır (yalnız ajans yöneticisi görür). */
  deneme: boolean;
}

export function platformDurumu(amac: RehberAmacKodu, platform: RehberPlatformu, ajansYoneticisi: boolean): PlatformDurumu {
  const tanim = REHBER_AMACLARI[amac];
  const gorunur = platformGorunurMu(amac, platform, ajansYoneticisi);
  const deneme = gorunur && REHBER_ACILIS[amac][platform] === 'deneme';
  if (gorunur) return { gorunur, sebep: null, deneme };
  if (platform === 'google' && tanim.google.kurgu === null) return { gorunur, sebep: tanim.google.sebep, deneme };
  return { gorunur, sebep: `Bu amaçta ${platform === 'meta' ? 'Meta' : 'Google'} henüz açık değil`, deneme };
}

/**
 * "Reklam nerede çıksın?" adımındaki öneri cümlesi. Sayı UYDURMAZ: taslaktaki
 * "ayda yaklaşık 6.000 arama" bir örnekti, gerçek hacim burada bilinmiyor.
 */
export function platformNedeni(amac: RehberAmacKodu, h: Pick<RehberHazirligi, 'ajansYoneticisi' | 'hesaplar' | 'googleHesaplari'>): string {
  const m = platformDurumu(amac, 'meta', h.ajansYoneticisi);
  const g = platformDurumu(amac, 'google', h.ajansYoneticisi);
  if (m.gorunur && !g.gorunur) return `${g.sebep}; reklam yalnız Instagram ve Facebook'ta açılacak.`;
  if (!m.gorunur && g.gorunur) return `${m.sebep}; reklam yalnız Google'da açılacak.`;
  if (m.gorunur && g.gorunur) {
    if (h.hesaplar.length === 0) return "Bu workspace'e Meta reklam hesabı atanmamış; şimdilik yalnız Google'ı açtık.";
    if (h.googleHesaplari.length === 0) return "Bu workspace'e Google Ads hesabı atanmamış; şimdilik yalnız Meta'yı açtık.";
    if (amac === 'SITE') {
      return 'İkisini birden öneriyoruz: Google, seni zaten arayan kişiyi yakalar; Meta, henüz aramayan ama ilgilenebilecek kişiye gösterir.';
    }
    if (amac === 'VIDEO') return "İkisini birden öneriyoruz: aynı video Reels ve YouTube Shorts'ta farklı kişilere ulaşır.";
    return 'İkisi de bu workspace için hazır; ikisinde birden açıyoruz.';
  }
  return 'Bu amaç için şu an açık bir platform yok.';
}

// ─────────────────────────────────────────────────────────────────────────────
// Adım rayı ve eksik listesi (liste SUNUCUDAN; burada yalnız gruplama)
// ─────────────────────────────────────────────────────────────────────────────

/** Ekrandaki adım: 1-6 rehber, 7 son ekran. */
export type EkranNo = RehberAdimi | 7;

export function adimEngelleri(eksikler: readonly RehberEksigi[], adim: RehberAdimi): RehberEksigi[] {
  return eksikler.filter((e) => e.adim === adim && e.seviye === 'engel');
}

/**
 * Raydaki işaret: geçilmiş VE engeli kalmamış adım "bitti". Yalnız
 * "geçildi" diye işaretlemek, eksik bırakılmış bir adımı yeşil gösterirdi.
 */
export function adimBittiMi(eksikler: readonly RehberEksigi[], adim: RehberAdimi, simdiki: EkranNo): boolean {
  if (simdiki === 7) return true;
  return adim < simdiki && adimEngelleri(eksikler, adim).length === 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Kime: yaş ve kategori
// ─────────────────────────────────────────────────────────────────────────────

export type YasSecenegi = 'genis' | '25-54' | '35+' | 'ozel';

export const YAS_SECENEKLERI: ReadonlyArray<{ kod: YasSecenegi; ad: string; alt?: string; aralik: { min: number; max: number } | null }> = [
  { kod: 'genis', ad: '18 yaş ve üzeri', alt: 'Önerilen · en geniş', aralik: null },
  { kod: '25-54', ad: '25 ile 54 arası', aralik: { min: 25, max: 54 } },
  { kod: '35+', ad: '35 yaş ve üzeri', aralik: { min: 35, max: 65 } },
  { kod: 'ozel', ad: 'Kendim seçeyim', aralik: null },
];

/**
 * Kayıtlı aralıktan seçili düğme. `ozel` yalnız kullanıcı "Kendim seçeyim"e
 * bastıysa ya da aralık hazır seçeneklerden biri değilse; aralık yoksa en geniş.
 */
export function yasSecenegi(aralik: { min: number; max: number } | null | undefined, ozelAcik: boolean): YasSecenegi {
  if (ozelAcik) return 'ozel';
  if (!aralik) return 'genis';
  const hazir = YAS_SECENEKLERI.find((s) => s.aralik && s.aralik.min === aralik.min && s.aralik.max === aralik.max);
  return hazir?.kod ?? 'ozel';
}

export type KategoriKodu = 'YOK' | OzelKategori;

export const KATEGORI_SECENEKLERI: ReadonlyArray<{ kod: KategoriKodu; ad: string; alt?: string }> = [
  { kod: 'YOK', ad: 'Hayır, hiçbiri' },
  { kod: 'HOUSING', ad: 'Konut', alt: 'Satılık, kiralık ev' },
  { kod: 'EMPLOYMENT', ad: 'İş ilanı' },
  { kod: 'FINANCIAL_PRODUCTS_SERVICES', ad: 'Kredi, finans' },
  { kod: 'ISSUES_ELECTIONS_POLITICS', ad: 'Siyaset, seçim' },
];

/**
 * Seçili kategori düğmesi. Alan HİÇ YOKSA `null`: soru cevaplanmadı ve
 * hiçbir şık seçili görünmez (T-16). "Hayır, hiçbiri" boş dizi — ikisini
 * karıştırmak, yasal soruyu kullanıcı adına cevaplamak olurdu.
 */
export function seciliKategori(ek: readonly OzelKategori[] | undefined): KategoriKodu | null {
  if (ek === undefined) return null;
  return ek.length === 0 ? 'YOK' : (ek[0] as OzelKategori);
}

export function kategoriDegeri(kod: KategoriKodu): OzelKategori[] {
  return kod === 'YOK' ? [] : [kod];
}

const KISITLI: readonly OzelKategori[] = ['HOUSING', 'EMPLOYMENT', 'FINANCIAL_PRODUCTS_SERVICES'];

/**
 * Konut, iş ilanı ve kredi reklamında yaş daraltılamaz. Workspace kaydındaki
 * taban kategori de sayılır: rehberin seçimi "hayır" olsa bile müşteri kartı
 * konut diyorsa reklam konut reklamı olarak derleniyor (`rehberdenGoogle`).
 */
export function yasKilitliMi(ek: readonly OzelKategori[] | undefined, taban: readonly OzelKategori[]): boolean {
  return [...(ek ?? []), ...taban].some((k) => KISITLI.includes(k));
}

// ─────────────────────────────────────────────────────────────────────────────
// Para ve tarih
// ─────────────────────────────────────────────────────────────────────────────

const simge = (pb: string) => (pb.toUpperCase() === 'TRY' ? '₺' : pb.toUpperCase());
const binlik = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** Girdi kutusundaki metin: "500", "1.250,5". Kayan nokta yok (BigInt). */
export function tutarMetni(micros: string | bigint): string {
  const m = BigInt(micros);
  const tam = binlik((m / 1_000_000n).toString());
  const kesir = (m % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return kesir ? `${tam},${kesir}` : tam;
}

/** Ekran yankısı: "500 ₺", "1.250,5 ₺", "40 USD". */
export function paraGoster(micros: string | bigint, paraBirimi: string): string {
  return `${tutarMetni(micros)} ${simge(paraBirimi)}`;
}

export function paraSimgesi(paraBirimi: string): string {
  return simge(paraBirimi);
}

/** Kutudaki metni micros dizgesine çevirir; ayrıştırılamıyorsa sebebiyle döner. */
export function tutarOku(metin: string, paraBirimi: string): { tur: 'tamam'; micros: string } | { tur: 'hata'; mesaj: string } {
  const r = tutarAyristir(metin, paraBirimi);
  return r.tur === 'tamam' ? { tur: 'tamam', micros: r.micros.toString() } : r;
}

/**
 * "Bugün" HESABIN saat diliminde, tarayıcınınkinde değil: İstanbul'da gece
 * 02:00'de Los Angeles'tan bakan ajans çalışanı bir gün geriyi seçerdi.
 */
export function bugun(saatDilimi: string, an: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: saatDilimi, year: 'numeric', month: '2-digit', day: '2-digit' }).format(an);
}

/** Tarih aritmetiği UTC'de: yaz saati geçişi bir günü kaydırmasın. */
export function gunEkle(tarih: string, gun: number): string {
  const d = new Date(`${tarih}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + gun);
  return d.toISOString().slice(0, 10);
}

export function gunFarki(baslangic: string, bitis: string): number {
  return Math.round((Date.parse(`${bitis}T00:00:00Z`) - Date.parse(`${baslangic}T00:00:00Z`)) / 86_400_000);
}

export type BitisSecenegi = 7 | 30 | 'yok';

/** Kayıtlı takvimden seçili bitiş düğmesi; hazır seçeneklere uymuyorsa `null`. */
export function bitisSecenegi(takvim: { baslangic: string; bitis: string | null } | null | undefined): BitisSecenegi | null {
  if (!takvim) return null;
  if (takvim.bitis === null) return 'yok';
  const f = gunFarki(takvim.baslangic, takvim.bitis);
  return f === 7 ? 7 : f === 30 ? 30 : null;
}

export function tarihGoster(tarih: string): string {
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${tarih}T00:00:00Z`));
}

// ─────────────────────────────────────────────────────────────────────────────
// Prova ve yayın
// ─────────────────────────────────────────────────────────────────────────────

export type ProvaGosterimi =
  | { tur: 'yok' }
  | { tur: 'suruyor' }
  | { tur: 'bayat' }
  | { tur: 'gecti'; not: string | null }
  | { tur: 'reddetti'; mesajlar: string[] }
  | { tur: 'yapilmadi'; sebep: string };

/**
 * Prova İÇERİĞE bağlı: alanlar değiştiyse eski "geçti" artık bu reklamın
 * provası değil. Sunucu yayın kapısında aynı özetle bakıyor; ekran bayat
 * provayı "geçti" gösterirse Yayınla açılır ve 409 alır.
 */
export function provaGosterimi(sonuc: RehberProvaSonucu | null, icerikOzeti: string, platform: RehberPlatformu, suruyor: boolean): ProvaGosterimi {
  if (suruyor) return { tur: 'suruyor' };
  if (!sonuc) return { tur: 'yok' };
  if (sonuc.icerikOzeti !== icerikOzeti) return { tur: 'bayat' };
  const p: PlatformProvaSonucu | null = sonuc[platform];
  if (!p) return { tur: 'yok' };
  if (p.tur === 'gecti') return { tur: 'gecti', not: p.not };
  if (p.tur === 'reddetti') return { tur: 'reddetti', mesajlar: p.mesajlar };
  // Meta provası kuyrukta: "yapılmadı" demek kullanıcıyı ikinci kez Prova et'e
  // bastırırdı; sürüyor gösterilir ve ekran yoklar.
  if (p.tur === 'bekliyor') return { tur: 'suruyor' };
  return { tur: 'yapilmadi', sebep: p.sebep };
}

/**
 * Prova yoklaması: bir platformun provası kuyruktaysa (`bekliyor`) ekran son
 * provayı yeniden okur. Karar saf fonksiyonda (CLAUDE.md: effect içindeki
 * karar test edilemiyor). Bayat provayı yoklamak boşa istek: içerik
 * değiştiyse kullanıcı zaten yeniden prova edecek.
 */
export function provaYoklanmaliMi(sonuc: RehberProvaSonucu | null, icerikOzeti: string): boolean {
  if (!sonuc || sonuc.icerikOzeti !== icerikOzeti) return false;
  return sonuc.meta?.tur === 'bekliyor' || sonuc.google?.tur === 'bekliyor';
}

/**
 * Yayınla düğmesi: engel yok VE açık her platformun provası bu içerikle
 * geçti. Sunucu aynı kapıları ayrıca uyguluyor; burası kullanıcıyı 409'a
 * göndermemek için.
 */
export function yayinlanabilirMi(
  eksikler: readonly RehberEksigi[],
  acik: Record<RehberPlatformu, boolean>,
  prova: RehberProvaSonucu | null,
  icerikOzeti: string,
): boolean {
  if (eksikler.some((e) => e.seviye === 'engel')) return false;
  const platformlar = (['meta', 'google'] as const).filter((p) => acik[p]);
  if (platformlar.length === 0) return false;
  return platformlar.every((p) => provaGosterimi(prova, icerikOzeti, p, false).tur === 'gecti');
}

export type AdimHali = 'bekliyor' | 'suruyor' | 'bitti' | 'hata' | 'atlandi';

/**
 * Onay penceresindeki üç adım (kur · geri oku · yayına al) yayın durum
 * makinesinden. Taslakta bu adımlar zamanlayıcıyla ilerliyordu; burada
 * `GET /yayin`in döndürdüğü GERÇEK durumdan.
 */
export function yayinAdimlari(durum: YayinDurumu | null): [AdimHali, AdimHali, AdimHali] {
  switch (durum) {
    case null:
    case 'on_kontrol':
    case 'medya':
    case 'kuruluyor':
    case 'uzlastirma':
      return ['suruyor', 'bekliyor', 'bekliyor'];
    case 'kurulamadi':
    case 'sonuc_belirsiz':
    case 'kayit_belirsiz':
      return ['hata', 'bekliyor', 'bekliyor'];
    case 'geri_okuma':
      return ['bitti', 'suruyor', 'bekliyor'];
    case 'fark_var':
    case 'dogrulanamadi':
      return ['bitti', 'hata', 'bekliyor'];
    case 'tekillik_kapisi':
    case 'aciliyor':
      return ['bitti', 'bitti', 'suruyor'];
    case 'kapali_kuruldu':
      return ['bitti', 'bitti', 'atlandi'];
    case 'iletildi':
    case 'incelemede':
    case 'ogreniyor':
    case 'yayinda':
      return ['bitti', 'bitti', 'bitti'];
    case 'kismen_acik':
    case 'sorunlu':
    case 'bekletildi':
    case 'durduruldu':
    case 'arsivlendi':
      return ['bitti', 'bitti', 'hata'];
  }
}

export type YayinSonucu = 'suruyor' | 'yayinda' | 'duraklatildi' | 'arsivlendi' | 'hata';

export function yayinSonucu(p: Pick<PlatformYayinOzeti, 'durum'>): YayinSonucu {
  // Motor bu durumdan kendiliğinden ilerliyorsa iş sürüyor; null = henüz başlamadı.
  if (p.durum === null || YAYIN_DURUM_SINIFI[p.durum].motor) return 'suruyor';
  if (p.durum === 'kapali_kuruldu') return 'duraklatildi';
  // Geri alınan reklam bir HATA değil, kullanıcının kararı: "Kurulamadı"
  // yazmak onu olmayan bir arızayı aramaya gönderirdi.
  if (p.durum === 'arsivlendi') return 'arsivlendi';
  if (['iletildi', 'incelemede', 'ogreniyor', 'yayinda'].includes(p.durum)) return 'yayinda';
  return 'hata';
}

/**
 * "Vazgeç ve arşivle" düğmesi bu satırda görünür mü — sunucunun izin
 * listesiyle AYNI sabit (`GERI_ALINABILIR_DURUMLAR`). Yalnız Meta: Google
 * kurulumu Google Ads'ten kaldırılıyor ve sunucu onu reddediyor; reddedilecek
 * bir düğme göstermek yanlış söz olurdu.
 */
export function geriAlinabilirMi(p: Pick<PlatformYayinOzeti, 'platform' | 'durum' | 'yayinId'>): boolean {
  return p.platform === 'meta' && !!p.yayinId && p.durum !== null && GERI_ALINABILIR_DURUMLAR.includes(p.durum);
}

/** Yoklama ne zaman durur: her platform son durumda ya da uyum denetçisi durdurdu. */
export function yayinBittiMi(platformlar: ReadonlyArray<Pick<PlatformYayinOzeti, 'durum'>>, uyumDurdu: boolean): boolean {
  if (uyumDurdu) return true;
  return platformlar.length > 0 && platformlar.every((p) => yayinSonucu(p) !== 'suruyor');
}

// ─────────────────────────────────────────────────────────────────────────────
// Reklam adımı yardımcıları
// ─────────────────────────────────────────────────────────────────────────────

export type OranSinifi = '1:1' | '4:5' | '9:16' | '1.91:1' | 'diger';

export function oranSinifi(en: number, boy: number): OranSinifi {
  const r = en / boy;
  const yakin = (h: number) => Math.abs(r - h) / h < 0.03;
  if (yakin(1)) return '1:1';
  if (yakin(4 / 5)) return '4:5';
  if (yakin(9 / 16)) return '9:16';
  if (yakin(1.91)) return '1.91:1';
  return 'diger';
}

/**
 * Google'ın görsel reklamı (Talep Yaratma) yatay, kare ve 4:5 kabul ediyor;
 * dikey (9:16) görsel orada kullanılmıyor. Arama reklamında görsel yok,
 * o yüzden rozet yalnız görsel kullanan kurguda gösterilir.
 */
export function googleGorselUygunMu(oran: OranSinifi): boolean {
  return oran === '1:1' || oran === '1.91:1' || oran === '4:5';
}

/** YouTube bağlantısından ya da çıplak kimlikten video kimliği; tanınmazsa `null`. */
export function youtubeKimligi(metin: string): string | null {
  const s = metin.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/.exec(s);
  return m ? (m[1] as string) : null;
}

/** Telefon kutusu "+90" önekli: kayıt E.164 (`+905551234567`). */
export function telefonKaydi(girdi: string): string | null {
  const rakam = girdi.replace(/\D/g, '').replace(/^0+/, '');
  return rakam ? `+90${rakam}` : null;
}

export function telefonGirdisi(kayit: string | null | undefined): string {
  if (!kayit) return '';
  return kayit.startsWith('+90') ? kayit.slice(3) : kayit;
}

/** Site adresi kutusu "https://" önekli; kayıt tam adres. */
export function adresKaydi(girdi: string): string | null {
  const s = girdi.trim();
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

export function adresGirdisi(kayit: string | null | undefined): string {
  return (kayit ?? '').replace(/^https:\/\//i, '');
}

export function alanAdi(adres: string | null | undefined): string {
  if (!adres) return '';
  try {
    return new URL(adres).hostname.replace(/^www\./, '');
  } catch {
    return adres;
  }
}

/** Meta önizlemesindeki düğme yazısı (amaçtan). */
export const CTA_METNI: Record<RehberAmacKodu, string> = {
  SITE: 'Daha fazla bilgi al',
  FORM: 'Kaydol',
  WHATSAPP: "WhatsApp'tan yaz",
  TELEFON: 'Hemen ara',
  VIDEO: 'Daha fazla bilgi al',
  ERISIM: 'Daha fazla bilgi al',
  SATIS: 'Satın al',
};

/**
 * Google konum eşlemesi istenmeli mi: Google açık, kayıtlı konumlardan biri
 * eşlenmemiş ve AYNI küme daha önce denenmemiş. İmza döner (denenenlere
 * eklenir); eşlenemeyen bir konum için ikinci istek sonsuz döngü olurdu.
 */
export function konumEslemeImzasi(a: RehberAlanlari, googleAcik: boolean, denenen: ReadonlySet<string>): string | null {
  if (!googleAcik) return null;
  const eksik = (a.konumlar?.deger ?? []).filter((k) => !k.google);
  if (eksik.length === 0) return null;
  const imza = eksik
    .map((k) => `${k.tur}:${k.key}`)
    .sort()
    .join('|');
  return denenen.has(imza) ? null : imza;
}

// ─────────────────────────────────────────────────────────────────────────────
// Açılışta önden doldurma
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rehber AÇILIRKEN boş alanları workspace'in tek seçeneğinden ve Marka
 * Merkezi'nden doldurur. Yalnız ALAN YOKSA: kullanıcı konumu sonradan
 * silerse açılışta geri gelmemeli (silinen alan sözleşmede de yok olur, ama
 * bu fonksiyon yalnız ilk açılışta çağrılıyor).
 *
 * TEK SEÇENEK DIŞINDA SEÇİM YAPILMAZ. Sayfa ya da hesap birden çoksa kullanıcı
 * seçer: panel turunda Meta sayfayı kendiliğinden BAŞKA bir müşterinin
 * sayfası seçti (A4 § 4.1); "listenin ilki" aynı hatanın bizdeki adı olurdu.
 */
export function onDoldurma(a: RehberAlanlari, h: RehberHazirligi): Degisiklik[] {
  const d: Degisiklik[] = [];
  const tek = <T extends { id: string }>(liste: readonly T[]) => (liste.length === 1 ? (liste[0] as T).id : null);
  const ekle = (alan: RehberAlanAdi, deger: unknown, kaynak: AlanKaynagi) => {
    if (a[alan] === undefined && deger !== null && deger !== undefined) d.push({ alan, deger, kaynak });
  };
  ekle('metaHesabiId', tek(h.hesaplar), 'workspace_profili');
  ekle('googleHesabiId', tek(h.googleHesaplari), 'workspace_profili');
  ekle('sayfaId', tek(h.sayfalar), 'workspace_profili');
  ekle('instagramId', tek(h.instagramHesaplari), 'workspace_profili');
  ekle('youtubeKanaliId', tek(h.youtubeKanallari), 'workspace_profili');
  const konumlar = h.varsayilanKitle?.konumlar ?? [];
  ekle('konumlar', konumlar.length ? konumlar : null, 'marka_merkezi');
  ekle('hedefAdres', h.iletisim.siteAdresi, 'marka_merkezi');
  ekle('telefon', h.iletisim.telefon, 'marka_merkezi');
  return d;
}

/** Hesabın para birimi ve saat dilimi: Meta hesabı, yoksa Google hesabı, yoksa TRY. */
export function hesapBaglami(a: RehberAlanlari, h: RehberHazirligi): { paraBirimi: string; saatDilimi: string } {
  const m = h.hesaplar.find((x) => x.id === a.metaHesabiId?.deger);
  const g = h.googleHesaplari.find((x) => x.id === a.googleHesabiId?.deger);
  return {
    paraBirimi: m?.paraBirimi ?? g?.paraBirimi ?? 'TRY',
    saatDilimi: m?.saatDilimi ?? g?.saatDilimi ?? 'Europe/Istanbul',
  };
}
