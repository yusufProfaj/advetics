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
  OZEL_KATEGORI_ETIKETLERI,
  META_EN_COK_GORSEL,
  GORSEL_ORANLARI,
  bannerSetiDestekleniyor,
  METIN_SINIRLARI,
  googleOnKosulEksik,
  onerilenPlatformlar,
  type GoogleKurgu,
  type MetinSeti,
  setlereAyir,
  type GorselOrani,
  type NiyetKodu,
  googleGorselOraniMi,
  googleGorselSorunu,
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
  type MedyaMetni,
  type MetinOnerisi,
  type OzelKategori,
  fikirMetni,
  setMetinSahibi,
  type PlatformProvaSonucu,
  type PlatformYayinOzeti,
  type RehberAdimi,
  type RehberAlanAdi,
  type RehberAlanlari,
  type RehberAmacKodu,
  type RehberEksigi,
  type RehberFormListesi,
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
 * Form seçicisinin hâli (Dalga 2): liste SEÇİLİ sayfanın Meta'daki yayında
 * formları, ayrı uçtan (`/reklam/rehber/form-sablonlari`). Dört hâl ayrı:
 * sayfa seçilmedi (`istenmedi`) / okunuyor / boş (sunucunun NEDENİ) / çağrı
 * düştü (Meta'nın mesajı, `oneriHatasi`). "Okunamadı" ile "form yok"u aynı
 * boş seçiciye çevirmek kullanıcıyı ya olmayan bir izin sorununu ya da
 * olmayan bir formu aramaya gönderir. Eski seçici hazırlıktaki listeyi
 * okuyordu ve sunucu orada hiç `null` dönmediği için "okunamadı" dalı ölüydü.
 */
export function formListesiHali(r: RehberFormListesi): OneriHali<RehberFormListesi> {
  if (r.satirlar.length > 0) return { tur: 'geldi', deger: r };
  return { tur: 'bos', neden: r.bosNeden ?? 'Bu sayfada yayında anlık form yok.' };
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
export function platformNedeni(
  amac: RehberAmacKodu,
  h: Pick<RehberHazirligi, 'ajansYoneticisi' | 'hesaplar' | 'googleHesaplari'> & Partial<Pick<RehberHazirligi, 'onKosullar'>>,
): string {
  const m = platformDurumu(amac, 'meta', h.ajansYoneticisi);
  const g = platformDurumu(amac, 'google', h.ajansYoneticisi);
  if (m.gorunur && !g.gorunur) return `${g.sebep}; reklam yalnız Instagram ve Facebook'ta açılacak.`;
  if (!m.gorunur && g.gorunur) return `${m.sebep}; reklam yalnız Google'da açılacak.`;
  if (m.gorunur && g.gorunur) {
    if (h.hesaplar.length === 0) return "Bu workspace'e Meta reklam hesabı atanmamış; şimdilik yalnız Google'ı açtık.";
    if (h.googleHesaplari.length === 0) return "Bu workspace'e Google Ads hesabı atanmamış; şimdilik yalnız Meta'yı açtık.";
    if (googleOnKosulEksik(amac, h)) {
      return "Google Ads'te satın alma dönüşümü yok; reklamı yalnız Meta'da açtık. Dönüşüm kurulunca Google'ı da açabilirsin.";
    }
    if (amac === 'SITE') {
      return 'İkisini birden öneriyoruz: Google, seni zaten arayan kişiyi yakalar; Meta, henüz aramayan ama ilgilenebilecek kişiye gösterir.';
    }
    if (amac === 'VIDEO') return "İkisini birden öneriyoruz: aynı video Reels ve YouTube Shorts'ta farklı kişilere ulaşır.";
    return 'İkisi de bu workspace için hazır; ikisinde birden açıyoruz.';
  }
  return 'Bu amaç için şu an açık bir platform yok.';
}

type PlatformAlani = { deger: Record<RehberPlatformu, boolean>; kaynak: AlanKaynagi } | undefined;

/**
 * AMAÇ DEĞİŞİNCE PLATFORM SEÇİMİ. Eskiden her amaç değişikliği öneriyi
 * yeniden yazıyordu: kullanıcı Google'ı kapatıp başka amaca bakıp geri
 * dönünce Google yeniden açılmış oluyordu ve bunu ancak Kontrol adımında
 * fark ediyordu. Kural sade: KULLANICININ seçimi yeni amaçta da kurulabiliyorsa
 * (açtığı her platform görünür ve en az biri açık) dokunulmaz; kurulamıyorsa
 * öneri yazılır (WhatsApp'ta Google yok, kullanıcının "yalnız Google"u orada
 * anlamsız). Öneri ya da derleyicinin yazdığı seçim her zaman yenilenir.
 */
export function amacDegisimi(
  yeni: RehberAmacKodu,
  mevcut: PlatformAlani,
  h: Pick<RehberHazirligi, 'ajansYoneticisi' | 'hesaplar' | 'googleHesaplari'> & Partial<Pick<RehberHazirligi, 'onKosullar'>>,
): Degisiklik[] {
  const amac: Degisiklik = { alan: 'amac', deger: yeni, kaynak: 'kullanici' };
  if (mevcut?.kaynak === 'kullanici') {
    const acilan = (['meta', 'google'] as const).filter((p) => mevcut.deger[p]);
    if (acilan.length > 0 && acilan.every((p) => platformGorunurMu(yeni, p, h.ajansYoneticisi))) return [amac];
  }
  return [amac, { alan: 'platformlar', deger: onerilenPlatformlar(yeni, h, platformGorunurMu), kaynak: 'derleyici' }];
}

/**
 * Platform anahtarı EKRANDA GÖRÜNEN kümeden yazar. Ham seçimden yazmak,
 * görünmeyen ama kayıtta `true` kalan bir platformu (önceki amaçtan) bu
 * tıklamayla birlikte kalıcı yapıyordu: ekran "yalnız Meta" derken kayıt
 * iki platform taşıyordu.
 */
export function platformAnahtari(acik: Record<RehberPlatformu, boolean>, p: RehberPlatformu): Record<RehberPlatformu, boolean> {
  return { meta: acik.meta, google: acik.google, [p]: !acik[p] };
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
 * Amaç seçilmiş mi: hem ekrandaki (henüz yazılmamış olabilir) değer hem
 * sunucunun listesi. Sunucu amaçsız rehberde YALNIZ "Amaç seçilmedi"
 * döndürüyor (`rehberEksikleri` erken dönüyor), yani 2-6 için engel yok
 * görünüyor; bunu "hazır" okumak, hiçbir şey seçilmemiş ekranda beş yeşil
 * tik demekti. İkisine birden bakılıyor: amaç seçildi ama cevap henüz
 * gelmediyse eski liste aynı yanlışı yapardı.
 */
function amacTamam(eksikler: readonly RehberEksigi[], amacSecili: boolean): boolean {
  return amacSecili && !eksikler.some((e) => e.kod === 'AMAC');
}

/**
 * Raydaki işaret: geçilmiş VE engeli kalmamış adım "bitti". Yalnız
 * "geçildi" diye işaretlemek, eksik bırakılmış bir adımı yeşil gösterirdi.
 * Amaç yokken 2-6 hiçbir zaman bitmiş değil (`amacTamam`).
 */
export function adimBittiMi(eksikler: readonly RehberEksigi[], adim: RehberAdimi, simdiki: EkranNo, amacSecili: boolean): boolean {
  if (adim > 1 && !amacTamam(eksikler, amacSecili)) return false;
  if (simdiki === 7) return true;
  return adim < simdiki && adimEngelleri(eksikler, adim).length === 0;
}

/** "Yayından önce" kartındaki "X hazır" satırları: 1-5, engeli olmayan, yalnız amaç seçilmişse. */
export function hazirAdimlar(eksikler: readonly RehberEksigi[], amacSecili: boolean): RehberAdimi[] {
  if (!amacTamam(eksikler, amacSecili)) return [];
  return ([1, 2, 3, 4, 5] as const).filter((n) => !eksikler.some((e) => e.adim === n));
}

/**
 * KISA AKIŞ (hazır workspace, Dalga 3). Hazırlığı yapılmış bir workspace'te
 * Nerede/Kime/Bütçe zaten dolu geliyor; kullanıcıyı üç dolu ekrandan geçirmek
 * "kreatifi at, reklam çıksın" sözünü bozuyordu. Amaçtan sonra bu üç adımda
 * ENGEL yoksa doğrudan Reklam'a gidilir. Atlanan adımlar rayda durur ve
 * Reklam adımının üstündeki özet satırından açılır (`hazirOzeti`).
 *
 * Sunucunun listesi bayatsa (amaç henüz yazılmadı, `AMAC` hâlâ listede)
 * kısa yola girilmez: bilinmeyen durumda uzun yol güvenli olan.
 */
export function amactanSonraki(eksikler: readonly RehberEksigi[], amacSecili: boolean, hazirlamaVar: boolean): EkranNo {
  if (!hazirlamaVar || !amacTamam(eksikler, amacSecili)) return 2;
  return ([2, 3, 5] as const).every((n) => adimEngelleri(eksikler, n).length === 0) ? 4 : 2;
}

export const REHBER_PLATFORM_ADI: Readonly<Record<RehberPlatformu, string>> = { meta: 'Meta', google: 'Google' };

export interface HazirOzetSatiri {
  adim: 2 | 3 | 5;
  etiket: string;
  deger: string;
}

/** Atlanan üç adımın TEK satırlık özeti; boş alan "Seçilmedi" yazar, gizlenmez. */
export function hazirOzeti(a: RehberAlanlari, acik: Record<RehberPlatformu, boolean>, paraBirimi: string): HazirOzetSatiri[] {
  const platformlar = (Object.keys(REHBER_PLATFORM_ADI) as RehberPlatformu[]).filter((p) => acik[p]).map((p) => REHBER_PLATFORM_ADI[p]);
  const konumlar = a.konumlar?.deger ?? [];
  const GOSTER = 3;
  const konum = konumlar.length
    ? konumlar.slice(0, GOSTER).map((k) => k.etiket).join(', ') + (konumlar.length > GOSTER ? ` ve ${konumlar.length - GOSTER} yer daha` : '')
    : 'Seçilmedi';
  const b = a.butce?.deger;
  const t = a.takvim?.deger;
  const butce = b ? `${paraGoster(b.micros, paraBirimi)}${b.tip === 'gunluk' ? ' / gün' : ' toplam'}` : 'Girilmedi';
  const sure = t ? ` · ${tarihGoster(t.baslangic)} başlar${t.bitis ? `, ${gunFarki(t.baslangic, t.bitis)} gün` : ''}` : '';
  return [
    { adim: 2, etiket: 'Nerede', deger: platformlar.length ? platformlar.join(' ve ') : 'Seçilmedi' },
    { adim: 3, etiket: 'Kime', deger: konum },
    // Kısa akış Kime'yi atlıyor; ek kategori ("eleman arıyoruz" = istihdam)
    // hiç görünmeden boş kalmasın (Ajan 4, Ö7).
    { adim: 3, etiket: 'Özel kategori', deger: kategoriOzeti(a) },
    { adim: 5, etiket: 'Bütçe', deger: butce + sure },
  ];
}

/** Bu reklamın EK kategorisi; workspace beyanı yayında ayrıca eklenir. */
export function kategoriOzeti(a: RehberAlanlari): string {
  const ek = a.ekKategoriler?.deger;
  if (ek === undefined) return 'Sorulmadı';
  return ek.length ? ek.map((k) => OZEL_KATEGORI_ETIKETLERI[k]).join(', ') : 'Yok (workspace beyanı geçerli)';
}

/**
 * Raydaki alt satır SEÇİME göre. Sabit "Meta, Google" yalnız Meta açıkken
 * de iki platform yazıyordu ve kullanıcı Google'ın da kurulacağını
 * sanıyordu. Seçim yoksa adımın kendi açıklaması kalır.
 */
export function adimAltMetni(no: RehberAdimi, varsayilan: string, amac: RehberAmacKodu | null, acik: Record<RehberPlatformu, boolean>): string {
  if (no === 1 && amac) return REHBER_AMACLARI[amac].ekranAdi;
  if (no === 2 && amac) return [acik.meta && 'Meta', acik.google && 'Google'].filter(Boolean).join(' + ') || 'Platform seçilmedi';
  return varsayilan;
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

export function yayinSonucu(p: Pick<PlatformYayinOzeti, 'durum'> & Partial<Pick<PlatformYayinOzeti, 'sebep'>>): YayinSonucu {
  // Kaydı yok AMA sebebi var: platform hiç başlamadı (sunucu yazar). Bunu
  // "sürüyor" saymak ekranı sonsuza kadar "Kuruluyor"da bırakıyordu.
  if (p.durum === null && p.sebep) return 'hata';
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
 * "Vazgeç ve arşivle / kaldır" düğmesi bu satırda görünür mü — sunucunun izin
 * listesiyle AYNI sabit (`GERI_ALINABILIR_DURUMLAR`). İki platformda da:
 * Google satırında düğme yokken duraklatılmış deneme kampanyaları müşterinin
 * Google Ads hesabında birikiyordu (2026-10-11, üç PAUSED kampanya) ve
 * Advetics'ten geri almanın yolu yoktu. Bilinmeyen bir platform DIŞARIDA
 * kalır: sunucunun işleyicisi olmayan bir düğme yanlış söz olurdu.
 */
export function geriAlinabilirMi(p: Pick<PlatformYayinOzeti, 'platform' | 'durum' | 'yayinId'>): boolean {
  return Object.hasOwn(GERI_AL_METINLERI, p.platform) && !!p.yayinId && p.durum !== null && GERI_ALINABILIR_DURUMLAR.includes(p.durum);
}

/**
 * "Yeniden kontrol et": Meta kurulumu yapılmış ama geri okuma düşmüş
 * (`dogrulanamadi`). Sunucunun izin listesi (`yayin.service.ts`
 * INSAN_ADIMLARI.yeniden_oku) yalnız bu durumu ve yalnız Meta'yı kabul
 * ediyor. Canlı WhatsApp turunda (2026-10-11) Meta yeni seti birkaç saniye
 * okunamaz gösterdi; ekranda yalnız "Vazgeç ve arşivle" olduğu için Meta'da
 * EKSİKSİZ duran bir kurulumun tek yolu silmekti.
 */
/**
 * "Yeniden dene" düğmesi: platform HİÇ BAŞLAMADI (yayın kaydı yok, sebep
 * var). 2026-10-12'de Google kuruldu, Meta başlamadı ve ekranda tek yol
 * "Aynı içerikle yeniden kur"du: o YENİ bir rehber açar ve Google'ı ikinci
 * kez kurar (para). Sunucu bu yolda yalnız yayın kaydı olmayan platformu
 * prova edip kuruyor (`hedefPlatformlar`); kaydı olan satırda düğme yok.
 */
export function yenidenDenenebilirMi(p: Pick<PlatformYayinOzeti, 'durum' | 'yayinId' | 'sebep'>): boolean {
  return p.yayinId === null && p.durum === null && !!p.sebep;
}

export function yenidenOkunabilirMi(p: Pick<PlatformYayinOzeti, 'platform' | 'durum' | 'yayinId'>): boolean {
  return p.platform === 'meta' && !!p.yayinId && p.durum === 'dogrulanamadi';
}

/**
 * Satırın durum sözü. `dogrulanamadi` "Kurulamadı" DEĞİL: nesneler Meta'da
 * duruyor, yalnız okunup karşılaştırılamadı. "Kurulamadı" demek kullanıcıyı
 * yeniden kurmaya, yani İKİNCİ bir kampanya açmaya gönderirdi.
 */
export function yayinSonucuEtiketi(p: Pick<PlatformYayinOzeti, 'durum'> & Partial<Pick<PlatformYayinOzeti, 'platform' | 'sebep'>>): string {
  if (p.durum === 'dogrulanamadi') return 'Kontrol edilemedi';
  // Google'da geri alma KALDIRIR (`geriAlMetinleri`); "Arşivlendi" Meta'nın sözü.
  if (p.durum === 'arsivlendi' && p.platform === 'google') return 'Kaldırıldı';
  const e: Record<YayinSonucu, string> = { yayinda: 'Yayında', duraklatildi: 'Duraklatılmış', arsivlendi: 'Arşivlendi', suruyor: 'Sürüyor', hata: 'Kurulamadı' };
  return e[yayinSonucu(p)];
}

/** Geri alma düğmesinin platforma göre sözü (`geriAlMetinleri`). */
export interface GeriAlMetinleri {
  dugme: string;
  onay: string;
  eylem: string;
  suruyor: string;
  basarisiz: string;
  cevapYok: string;
}

/*
 * Meta'da ARŞİV, Google'da KALDIRMA (REMOVED); ikisi de geri dönüşsüz ve
 * onay metni bunu söylemek zorunda. Google satırına "arşivle" yazmak,
 * Google Ads'te "arşiv" diye bir şey arayan kullanıcıyı yanlış yere
 * gönderirdi. `Record<RehberPlatformu, …>`: rehbere üçüncü bir platform
 * eklenirse derleme burada kırılır; "google değilse Meta" üçlüsü o
 * platforma sessizce Meta'nın sözünü verirdi (`linkedin-kayit.spec.ts`).
 */
const GERI_AL_METINLERI: Readonly<Record<RehberPlatformu, GeriAlMetinleri>> = {
  meta: {
    dugme: 'Vazgeç ve arşivle',
    onay: 'Meta’daki kampanya arşivlenecek; tekrar açılamaz.',
    eylem: 'Arşivle',
    suruyor: 'Arşivleniyor…',
    basarisiz: 'Arşivlenemedi; Meta’nın cevabı yok.',
    cevapYok: 'Meta henüz cevap vermedi; birkaç dakika sonra sayfayı yenile.',
  },
  google: {
    dugme: 'Vazgeç ve kaldır',
    onay: 'Google’daki kampanya kaldırılacak; tekrar açılamaz.',
    eylem: 'Kaldır',
    suruyor: 'Kaldırılıyor…',
    basarisiz: 'Kaldırılamadı; Google’ın cevabı yok.',
    cevapYok: 'Google henüz cevap vermedi; birkaç dakika sonra sayfayı yenile.',
  },
};

export function geriAlMetinleri(platform: RehberPlatformu): GeriAlMetinleri {
  return GERI_AL_METINLERI[platform];
}

/** Yoklama ne zaman durur: her platform son durumda ya da uyum denetçisi durdurdu. */
export function yayinBittiMi(platformlar: ReadonlyArray<Pick<PlatformYayinOzeti, 'durum'>>, uyumDurdu: boolean): boolean {
  if (uyumDurdu) return true;
  return platformlar.length > 0 && platformlar.every((p) => yayinSonucu(p) !== 'suruyor');
}

// ─────────────────────────────────────────────────────────────────────────────
// Reklam adımı yardımcıları
// ─────────────────────────────────────────────────────────────────────────────

/*
 * ORAN TANIMA SHARED'DA (`oranBul`, `banner-seti.ts`). Burada bir süre ayrı
 * bir `oranSinifi` duruyordu: aynı %3 payı ikinci kez yazıyordu ve sunucunun
 * set ayrımıyla ekranın set ayrımı ancak ikisi aynı kaldıkça örtüşürdü.
 */

/**
 * Google görsel rozeti: SUNUCUNUN kuralıyla (`googleGorselSorunu`, ±%1 oran,
 * en az boyut). Burada bir süre ayrı bir oran listesi duruyordu ve Meta'nın
 * %3 payını kullanıyordu: 1200×640 ekranda "Google ✓" görünüp kurulumda
 * reddedilirdi. Bayt panelde bilinmiyor (0); büyüklük sınırını sunucunun
 * eksik listesi söylüyor. `null` = uygun, metin = sebep.
 */
/**
 * Görselle kurulan Google kurgusunun oran kuralı, kullanıcının diliyle.
 * Sunucunun engelleriyle aynı şeyi söylemeli (`googleGorselBulgulari`).
 */
export function googleGorselIpucu(kurgu: string | null): string | null {
  if (kurgu === 'MAKS_PERFORMANS') return "Google Maks. Performans yatay (1.91:1) ve kare (1:1) görselin ikisini de istiyor; 4:5 de kullanılır, 9:16 gönderilmez.";
  if (kurgu === 'TALEP_YARATMA_GORSEL') return "Google en az bir yatay (1.91:1) ya da kare (1:1) görsel istiyor; 4:5 de kullanılır, 9:16 gönderilmez.";
  return null;
}

export function googleGorselRozeti(oran: GorselOrani, en: number, boy: number): string | null {
  if (!googleGorselOraniMi(oran)) return "9:16 görsel Google'da kullanılmıyor";
  return googleGorselSorunu(oran, { genislik: en, yukseklik: boy, bayt: 0 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Banner seti (adım 4)
// ─────────────────────────────────────────────────────────────────────────────

export type MedyaOgesi = NonNullable<RehberAlanlari['medya']>['deger'][number];
export type SetYuvalari = Partial<Record<GorselOrani, MedyaOgesi>>;

/** Panelin set sınırı sunucununkiyle aynı sabit: biri büyürse ekran yalan söyler. */
export const EKRAN_EN_COK_SET = META_EN_COK_GORSEL;

/**
 * Ekranda görünen set listesi. Ayrım SUNUCUNUN fonksiyonuyla (`setlereAyir`)
 * yapılıyor; panel kendi gruplamasını kurarsa "Set 2"de gördüğü görsel
 * Meta'da başka bir reklamın parçası olur.
 *
 * Boyutu BİLİNMEYEN görsel (ölçü henüz gelmedi ya da arşivin ilk sayfasında
 * değil) ile boyutu KULLANILAMAYAN görsel ayrı dönüyor: ikincisi kullanıcının
 * işi (kırp, tekrar bırak), birincisi değil.
 */
export function setGorunumu(
  medya: readonly MedyaOgesi[],
  oranlar: ReadonlyMap<string, GorselOrani | null>,
  /**
   * Set desteklenmeyen amaçta (Form, Telefon, WhatsApp) her görsel kendi
   * seti döner (`setlereAyir`). Taşıma yardımcıları yalnız set ekranında
   * çağrıldığı için varsayılanla çalışıyor.
   */
  niyet: NiyetKodu = 'SITE',
): {
  setler: SetYuvalari[];
  kullanilamaz: MedyaOgesi[];
  bilinmeyen: MedyaOgesi[];
  cakisan: MedyaOgesi[];
  videolar: MedyaOgesi[];
} {
  const videolar = medya.filter((x) => x.kapakVarlikId);
  const ayrim = setlereAyir(
    medya.filter((x) => !x.kapakVarlikId),
    oranlar,
    niyet,
  );
  const setler = ayrim.setler.map((st) => Object.fromEntries(st.map(({ oran, ...m }) => [oran, m as MedyaOgesi])) as SetYuvalari);
  return {
    setler,
    kullanilamaz: ayrim.taninmayan.filter((x) => oranlar.has(x.varlikId)),
    bilinmeyen: ayrim.taninmayan.filter((x) => !oranlar.has(x.varlikId)),
    cakisan: ayrim.cakisan,
    videolar,
  };
}

/**
 * Bütün görsel setlerine ekranda göründükleri sırayla numara verir.
 * Taşımadan ÖNCE çalışmak zorunda: numarasız görseller sunucuda "sırayla
 * doldurulur" ve bir görsele numara vermek, numarasız komşularının hangi
 * sete düşeceğini DEĞİŞTİRİR. Hepsi sabitlenince taşınan tek görsel taşınır.
 * Sınırın ötesindeki setler (6.) numarasız kalır; şema 5'ten büyüğünü almıyor
 * ve eksik listesi onları zaten "en çok 5" diye söylüyor.
 */
export function setleriSabitle(medya: readonly MedyaOgesi[], oranlar: ReadonlyMap<string, GorselOrani | null>): MedyaOgesi[] {
  const { setler } = setGorunumu(medya, oranlar);
  const no = new Map<string, number>();
  setler.slice(0, EKRAN_EN_COK_SET).forEach((st, i) => {
    for (const m of Object.values(st)) if (m) no.set(m.varlikId, i + 1);
  });
  return medya.map((m) => {
    const n = no.get(m.varlikId);
    if (n !== undefined) return { ...m, setNo: n };
    const { setNo: _s, ...gerisi } = m;
    return gerisi;
  });
}

/**
 * Görseli başka sete taşır. Hedefte aynı boyut varsa İKİSİ YER DEĞİŞTİRİR:
 * aynı sette aynı boyuttan iki görsel olamaz ve hangisinin atılacağını
 * tahmin etmek yerine yer değiştirmek hiçbir görseli kaybetmiyor.
 * `hedef` ekrandaki sıra (0'dan) ya da 'yeni'. Değişiklik yoksa AYNI dizi
 * döner (çağıran kaydı atlayabilsin).
 */
export function setTasi(
  medya: readonly MedyaOgesi[],
  oranlar: ReadonlyMap<string, GorselOrani | null>,
  varlikId: string,
  hedef: number | 'yeni',
): readonly MedyaOgesi[] {
  const sabit = setleriSabitle(medya, oranlar);
  const oge = sabit.find((x) => x.varlikId === varlikId);
  const oran = oranlar.get(varlikId) ?? null;
  if (!oge || oge.setNo === undefined || !oran) return medya;
  const setSayisi = new Set(sabit.map((x) => x.setNo).filter((n) => n !== undefined)).size;
  let h: number;
  if (hedef === 'yeni') {
    if (setSayisi >= EKRAN_EN_COK_SET) return medya;
    h = setSayisi + 1;
  } else {
    h = hedef + 1;
    if (h === oge.setNo || h > setSayisi) return medya;
  }
  const kaynak = oge.setNo;
  const yeni = sabit.map((x) => {
    if (x.varlikId === varlikId) return { ...x, setNo: h };
    if (x.setNo === h && oranlar.get(x.varlikId) === oran) return { ...x, setNo: kaynak };
    return x;
  });
  return setleriSabitle(yeni, oranlar);
}

/** Bir setin bütün görsellerini çıkarır (videolara ve öbür setlere dokunmaz). */
export function setSil(medya: readonly MedyaOgesi[], oranlar: ReadonlyMap<string, GorselOrani | null>, sira: number): MedyaOgesi[] {
  const sabit = setleriSabitle(medya, oranlar);
  return setleriSabitle(
    sabit.filter((x) => x.setNo !== sira + 1),
    oranlar,
  );
}

/**
 * Yüklemenin hedef seti, YÜKLEME BAŞINA BİR KEZ. `null` = "Yeni set":
 * bugünkü set sayısı (0'dan sıra). Dosya başına yeniden hesaplanırsa ilk
 * dosya yeni seti açtıktan sonra ikincisi BİR SONRAKİ sete gider: aynı
 * tasarımın iki boyutu iki ayrı reklam olur ve dört set varken ikinci
 * dosya 6 numarayı alıp kaydı düşürür (Ajan 4, B3).
 * `undefined` = üstteki bırakma alanı: numara verilmez, sırayla dağıtılır.
 */
export function yuklemeHedefi(
  medya: readonly MedyaOgesi[],
  oranlar: ReadonlyMap<string, GorselOrani | null>,
  hedef: number | null | undefined,
): number | undefined {
  if (hedef === undefined) return undefined;
  if (hedef !== null) return hedef;
  const n = setGorunumu(medya, oranlar).setler.length;
  return n < EKRAN_EN_COK_SET ? n : undefined;
}

/**
 * Boş bir yuvaya yüklenen görselin numarası. Görsel BAŞKA bir boyutta
 * çıkabilir (kullanıcı 9:16 yuvasına kare bıraktı): o boyut sette boşsa
 * yine o sete girer; doluysa numarasız kalır ve sırayla yeni sete düşer —
 * aynı sete koyup çakışma engeli üretmek, kullanıcıyı kendi bırakmadığı
 * bir sorunu çözmeye gönderirdi.
 */
export function yuvayaEkle(
  medya: readonly MedyaOgesi[],
  oranlar: ReadonlyMap<string, GorselOrani | null>,
  oge: MedyaOgesi,
  hedefSira: number | null,
): MedyaOgesi[] {
  const sabit = setleriSabitle(medya, oranlar);
  const oran = oranlar.get(oge.varlikId) ?? null;
  // Sınırın ötesine numara verilmez: şema en çok 5 alıyor ve 6 yazılırsa
  // kayıt BÜTÜNÜYLE reddedilir (Ajan 4, B3). Numarasız görsel sırayla
  // dağıtılır ve eksik listesi "en çok 5" der.
  if (hedefSira === null || hedefSira >= EKRAN_EN_COK_SET || !oran) return [...sabit, oge];
  const dolu = sabit.some((x) => x.setNo === hedefSira + 1 && oranlar.get(x.varlikId) === oran);
  return [...sabit, dolu ? oge : { ...oge, setNo: hedefSira + 1 }];
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
export function onDoldurma(a: RehberAlanlari, h: RehberHazirligi, an: Date = new Date()): Degisiklik[] {
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
  // WhatsApp numarası önden YAZILMAZ (Ajan 4, Dalga 3 F5): Marka Merkezi
  // telefonu WhatsApp hattı olmayabilir; ekran onu bir ÖNERİ düğmesi olarak
  // gösteriyor ve kullanıcı seçince `kullanici` kaynağıyla yazılıyor.

  // HAZIR WORKSPACE (Dalga 3): hazırlığın kararları. Kullanıcı yalnız amacı
  // ve kreatifi verip geçebilsin diye piksel, bütçe, başlangıç ve kategori
  // beyanı da dolu gelir; onay penceresi bütçeyi ve tarihi açıkça yazıyor.
  const hz = h.hazirlama;
  if (hz) {
    const metaId = a.metaHesabiId?.deger ?? tek(h.hesaplar);
    const googleId = a.googleHesabiId?.deger ?? tek(h.googleHesaplari);
    const m = h.hesaplar.find((x) => x.id === metaId);
    const g = h.googleHesaplari.find((x) => x.id === googleId);
    const saatDilimi = m?.saatDilimi ?? g?.saatDilimi ?? 'Europe/Istanbul';
    const paraBirimi = m?.paraBirimi ?? g?.paraBirimi ?? 'TRY';
    ekle('pikselId', hz.pikselId, 'workspace_profili');
    // BİRİM AYNIYSA (Ajan 4, Ö3): micros birimsiz bir sayı; TRY için
    // önerilen 500, USD hesabında günde 500 dolar olurdu.
    const birimTutar = hz.gunlukButceMicros && hz.gunlukButceParaBirimi === paraBirimi;
    ekle('butce', birimTutar ? { tip: 'gunluk', micros: hz.gunlukButceMicros } : null, 'workspace_profili');
    // Kategori beyanı workspace'te (`clients.special_ad_categories`); burada
    // "ek kategori yok" yalnız hazırlıkta SORULUP cevaplandıysa yazılır —
    // sorulmamış beyanı boş saymak konut/istihdam reklamını kategorisiz açardı.
    if (hz.kategoriCevaplandi) ekle('ekKategoriler', [], 'workspace_profili');
    // Başlangıç YARIN: inceleme ve geri okuma için bir gün pay, bitiş 30 gün
    // sonra (günlük bütçe açık uçlu kalmasın). Gün HESABIN saat diliminde.
    const bugunu = bugun(saatDilimi, an);
    const yarin = gunEkle(bugunu, 1);
    const takvim = { baslangic: yarin, bitis: gunEkle(yarin, 30) };
    // BAYAT ÖNERİ YENİLENİR (Ajan 4, Ö4): taslağa günler sonra dönülürse
    // önerilen "yarın" geçmişte kalıyor, Meta geçmiş başlangıcı kurulum
    // anına çekiyor (N-09) ve pencere yanlış gün söylüyordu. Yalnız
    // DERLEYİCİNİN önerisi; kullanıcının seçtiği tarihe dokunulmaz.
    const t = a.takvim;
    if (t?.kaynak === 'derleyici' && t.deger.baslangic < bugunu) d.push({ alan: 'takvim', deger: takvim, kaynak: 'derleyici' });
    else ekle('takvim', takvim, 'derleyici');
  }
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

// ─────────────────────────────────────────────────────────────────────────────
// Metin kutusu: hangi platformun kuralı
// ─────────────────────────────────────────────────────────────────────────────

export interface MetinKurali {
  /** Reklam adımının üst cümlesi (yalnız açık platform(lar)ı anlatır). */
  soru: string;
  /** Boş ekranda gösterilen kutu sayısı (asgari). */
  baslikKutu: number;
  baslikEnCok: number;
  baslikNotu: string;
  aciklamaKutu: number;
  aciklamaEnCok: number;
  aciklamaNotu: string;
  /** "Reklam gücü" çubuğu: Google duyarlı arama reklamının kavramı. */
  gucGoster: boolean;
}

/**
 * METİN KUTUSU AÇIK PLATFORMA GÖRE. Eskiden hep Google arama reklamının
 * kuralı görünüyordu (3 başlık, 2 açıklama, "Google hepsini dener", reklam
 * gücü) ve yalnız Meta açıkken kullanıcı Meta'nın hiç kullanmadığı
 * kutuları doldurmak zorunda sanıyordu. Sayılar derleyicinin kullandığı
 * kadar: Meta ilk 5 başlığı ve ilk açıklamayı (`turet.ts`), Google Talep
 * Yaratma / Maks. Performans ilk 5 başlığı (`derle-google.ts`), Google Arama
 * 3 ile 15 başlık ve en az 2 açıklama (`G-BASLIK-SAYI`, `G-ACIKLAMA-SAYI`).
 */
export function metinKurali(acik: Record<RehberPlatformu, boolean>, kurgu: GoogleKurgu | null): MetinKurali {
  const L = METIN_SINIRLARI;
  const soru = reklamSorusu(acik, kurgu);
  if (acik.google && kurgu === 'ARAMA') {
    return {
      soru,
      baslikKutu: L.basliklarEnAz,
      baslikEnCok: L.basliklarEnCok,
      baslikNotu: `${L.basliklarEnAz} ile ${L.basliklarEnCok} arası · Google hepsini dener${acik.meta ? `, Meta ilk ${L.metaBaslikSayisi}'ini` : ''}`,
      aciklamaKutu: L.aciklamalarEnAz,
      aciklamaEnCok: L.aciklamalarEnCok,
      aciklamaNotu: `En az ${L.aciklamalarEnAz}`,
      gucGoster: true,
    };
  }
  const kim = [acik.meta && 'Meta', acik.google && 'Google'].filter(Boolean).join(' ve ') || 'Platform';
  return {
    soru,
    baslikKutu: 1,
    baslikEnCok: L.metaBaslikSayisi,
    baslikNotu: `En çok ${L.metaBaslikSayisi} · ${kim} hepsini dener`,
    aciklamaKutu: 1,
    aciklamaEnCok: acik.google ? L.aciklamalarEnCok : 1,
    aciklamaNotu: acik.google ? 'En az 1' : 'İsteğe bağlı · başlığın altında görünür',
    gucGoster: false,
  };
}

/**
 * Reklam adımının üst cümlesi. SİMETRİK: yalnız Google açıkken "iki
 * platformun kalıbına bölüyoruz" demek (canlı tur), yalnız Meta açıkken
 * Google kuralı göstermekle aynı hata. Google Arama'da görsel istenmiyor.
 */
function reklamSorusu(acik: Record<RehberPlatformu, boolean>, kurgu: GoogleKurgu | null): string {
  if (acik.meta && acik.google) return 'Görselleri ve metni bir kez ver; iki platformun kalıbına biz bölüyoruz.';
  if (acik.meta) return "Görselleri ve metni ver; Meta'nın kalıbına biz yerleştiriyoruz.";
  if (acik.google) {
    const ne = kurgu === 'ARAMA' ? 'Metni' : kurgu === 'TALEP_YARATMA_VIDEO' ? 'Videoyu ve metni' : 'Görselleri ve metni';
    return `${ne} ver; Google'ın kalıbına biz yerleştiriyoruz.`;
  }
  return 'Görselleri ve metni ver.';
}

/** Ekrandaki metin: boş kutular kuralın asgarisi kadar (kayıttaki fazlası gizlenmez). */
export function metinKutusu(m: MetinSeti | undefined, k: Pick<MetinKurali, 'baslikKutu' | 'aciklamaKutu'>): MetinSeti {
  const pad = (a: string[], n: number) => (a.length >= n ? a : [...a, ...Array<string>(n - a.length).fill('')]);
  return {
    anaMetin: m?.anaMetin ?? '',
    basliklar: pad(m?.basliklar ?? [], k.baslikKutu),
    aciklamalar: pad(m?.aciklamalar ?? [], k.aciklamaKutu),
    // GÖRÜNEN YOL KORUNUR: kutu her yazımda bu fonksiyondan geçiyor; alanı
    // burada düşürmek, kullanıcı bir başlığa dokunduğu anda yolu silerdi.
    ...(m?.gorunenYol ? { gorunenYol: m.gorunenYol } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Görsele özel metin (Dalga 2)
// ─────────────────────────────────────────────────────────────────────────────

/** Set yuvaları → oranlı liste (shared `fikirMetni`/`setMetinSahibi` bunu okuyor). */
export function setOgeleri(st: SetYuvalari): Array<MedyaOgesi & { oran: GorselOrani }> {
  return (Object.entries(st) as Array<[GorselOrani, MedyaOgesi | undefined]>).filter((e): e is [GorselOrani, MedyaOgesi] => !!e[1]).map(([oran, m]) => ({ ...m, oran }));
}

/**
 * Bir fikrin (set ya da video) metin durumu: metni HANGİ görselde (sahip),
 * metin ne, ve öneri hangi görselle istenir. Derleyiciyle AYNI kural
 * (`fikirMetni`, `setMetinSahibi`, shared): ekranın "bu setin metni" dediği
 * metni derleyici başka görselden okumasın.
 */
export function fikirMetinDurumu(ogeler: ReadonlyArray<MedyaOgesi & { oran?: GorselOrani }>): { sahipId: string | null; metin: MedyaMetni | null; idler: string[] } {
  const metin = fikirMetni(ogeler);
  const sahip = ogeler.find((x) => x.metin) ?? setMetinSahibi(ogeler);
  return { sahipId: sahip?.varlikId ?? null, metin, idler: ogeler.map((x) => x.varlikId) };
}

/**
 * Fikrin metnini yazar: sahipte TEK kopya, setin öbür görsellerinden silinir
 * (iki kopya ayrışırsa derleyici hangisini okuduğunu ekran bilemez).
 * `metin: null` = ortak metne dön.
 */
export function fikirMetniYaz(medya: readonly MedyaOgesi[], idler: readonly string[], sahipId: string, metin: MedyaMetni | null): MedyaOgesi[] {
  return medya.map((x) => {
    if (x.varlikId === sahipId) {
      if (metin) return { ...x, metin };
      const { metin: _m, ...geri } = x;
      return geri;
    }
    if (idler.includes(x.varlikId) && x.metin) {
      const { metin: _m, ...geri } = x;
      return geri;
    }
    return x;
  });
}

/** Öneri → görselin metni (`derleyici` kaynağıyla; sınıra sığdırılmış). */
export function oneridenFikirMetni(o: MetinOnerisi, k: Pick<MetinKurali, 'baslikEnCok' | 'aciklamaEnCok'>): MedyaMetni {
  const sig = oneriyiSigdir(o, k);
  return { anaMetin: sig.anaMetin, basliklar: sig.basliklar, aciklamalar: sig.aciklamalar, kaynak: 'derleyici' };
}

/**
 * GÖRSEL BIRAKILINCA OTOMATİK METİN: yeni eklenen bir görseli taşıyan ve
 * henüz metni olmayan HER FİKİR için TEK istek (setin metin sahibiyle).
 * Bir setin dört boyutu için dört istek atmak aynı tasarıma dört kez para
 * ödemek olurdu. Metni olan fikre dokunulmaz: kullanıcının düzelttiği
 * metin, yeni bir boyut eklendi diye ezilmesin.
 */
export function otomatikMetinHedefleri(
  fikirler: ReadonlyArray<ReadonlyArray<MedyaOgesi & { oran?: GorselOrani }>>,
  eklenen: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  for (const f of fikirler) {
    if (!f.some((x) => eklenen.has(x.varlikId))) continue;
    const d = fikirMetinDurumu(f);
    if (d.metin || !d.sahipId) continue;
    out.push(d.sahipId);
  }
  return out;
}

/** "Tekrar etme" listesi: ekrandaki önceki önerinin ana metni ve başlıkları. */
export function tekrarEtmeListesi(o: Pick<MetinOnerisi, 'anaMetin' | 'basliklar'> | null | undefined): string[] {
  if (!o) return [];
  return [o.anaMetin, ...o.basliklar].map((x) => x.trim()).filter(Boolean).slice(0, 30);
}

/** Ortak metin boş mu (otomatik metin yalnız boş ortak metni doldurur). */
export function ortakMetinBos(m: MetinSeti | undefined): boolean {
  return !m || (!m.anaMetin.trim() && !m.basliklar.some((x) => x.trim()) && !m.aciklamalar.some((x) => x.trim()));
}

/**
 * METİN ÖNERİSİ SINIRA SIĞAR. Öneri servisi Google Arama'nın sayısıyla (9
 * başlık, 4 açıklama) dönüyor; Video/Erişim gibi amaçlarda sınır 5 başlık ve
 * "Kullan" dokuzunu da yazıyordu. Derleyici ilk 5'i kullanıp kalanını
 * SESSİZCE atıyordu (canlı, 2026-10-11). Kartta ve yazılan metinde aynı
 * kesim; dışarıda kalanın sayısı kartta söyleniyor.
 */
export function oneriyiSigdir<T extends { basliklar: string[]; aciklamalar: string[] }>(
  o: T,
  k: Pick<MetinKurali, 'baslikEnCok' | 'aciklamaEnCok'>,
): T & { disarida: number } {
  const basliklar = o.basliklar.slice(0, k.baslikEnCok);
  const aciklamalar = o.aciklamalar.slice(0, k.aciklamaEnCok);
  return { ...o, basliklar, aciklamalar, disarida: o.basliklar.length - basliklar.length + (o.aciklamalar.length - aciklamalar.length) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Onay penceresi ve son ekran
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Onay penceresindeki ilk adımın metni KURGUYA göre. "kelimeler" yalnız
 * Google Arama'da var; Talep Yaratma ve Maks. Performans'ta da yazması,
 * kurulmayacak bir şeyi vaat ediyordu.
 */
export function kurulumAdimlari(platform: RehberPlatformu, kurgu: GoogleKurgu | null): [string, string, string] {
  if (platform === 'meta') return ['Duraklatılmış kur (kampanya, set, reklam)', "Meta'dan geri oku ve karşılaştır", 'Yayına al'];
  const parca = kurgu === 'MAKS_PERFORMANS' ? 'kampanya, öğe grubu' : kurgu === 'ARAMA' ? 'kampanya, grup, reklam, kelimeler' : 'kampanya, grup, reklam';
  return [`Duraklatılmış kur (${parca})`, "Google'dan geri oku ve karşılaştır", 'Yayına al'];
}

const PLATFORM_ADLARI: Record<RehberPlatformu, string> = { meta: 'Meta', google: 'Google' };

export interface SonEkranOzeti {
  hal: 'tamam' | 'dur' | 'hata' | 'arsiv';
  baslik: string;
  metin: string;
}

/**
 * Son ekranın başlığı ve cümlesi. ARŞİVLENEN PLATFORM BAŞLIKTA YER ALIR:
 * canlı turda Meta "Vazgeç ve arşivle" ile arşivlendi, satır "Arşivlendi"
 * dedi, başlık "Duraklatılmış kuruldu" demeye devam etti (Google duraklatılmış
 * durduğu için). Kalan platformların hâli ayrıca söylenir; arşiv bir hata değil.
 */
export function sonEkranOzeti(platformlar: ReadonlyArray<{ platform: RehberPlatformu; sonuc: YayinSonucu }>, uyumDurdu: boolean): SonEkranOzeti {
  if (uyumDurdu) return { hal: 'hata', baslik: 'Kurulum tamamlanamadı', metin: 'Yayın, platforma hiçbir şey gönderilmeden durduruldu.' };
  if (platformlar.some((p) => p.sonuc === 'hata')) {
    return { hal: 'hata', baslik: 'Kurulum tamamlanamadı', metin: 'Aşağıda hangi platformda neyin durduğu yazıyor; diğer platform bundan etkilenmedi.' };
  }
  const arsiv = platformlar.filter((p) => p.sonuc === 'arsivlendi');
  const kalan = platformlar.filter((p) => p.sonuc !== 'arsivlendi');
  if (platformlar.length > 0 && kalan.length === 0) {
    // "Arşivlendi" yalnız Meta'nın sözü; Google'da geri alma KALDIRIR.
    return { hal: 'arsiv', baslik: 'Reklam geri alındı', metin: 'Kampanya platformda kapatıldı; harcama olmaz. Aynı içerikle yeni bir reklam açabilirsin.' };
  }
  const adlar = (xs: typeof platformlar) => xs.map((p) => PLATFORM_ADLARI[p.platform]).join(' ve ');
  const kalanDur = kalan.some((p) => p.sonuc === 'duraklatildi' || p.sonuc === 'suruyor');
  if (arsiv.length > 0) {
    return {
      hal: kalanDur ? 'dur' : 'tamam',
      baslik: `${adlar(arsiv)}'daki reklam geri alındı`,
      metin: kalanDur ? `${adlar(kalan)}'da duraklatılmış duruyor; başlatana kadar harcama olmaz.` : `${adlar(kalan)}'da yayında.`,
    };
  }
  if (kalanDur) {
    return {
      hal: 'dur',
      baslik: 'Duraklatılmış kuruldu',
      metin: "Kuruldu, geri okunup kontrol edildi ve açılmadı. Reklam Yöneticisi'nden başlatabilirsin; başlatana kadar harcama olmaz.",
    };
  }
  const tek = platformlar.length === 1 ? PLATFORM_ADLARI[platformlar[0]!.platform] : null;
  return { hal: 'tamam', baslik: 'Reklamın yayında', metin: `${tek ? `${tek}'da` : 'İki platformda da'} kuruldu, geri okunup kontrol edildi ve açıldı.` };
}

// ─────────────────────────────────────────────────────────────────────────────
// Giriş listesi
// ─────────────────────────────────────────────────────────────────────────────

/**
 * VİDEONUN EKRAN BİLGİSİ KAPAĞINDAN. Hazırlık yalnız görselleri listeliyor;
 * yüklenen videonun adı, önizlemesi ve ölçüsü yalnız yükleme anında bellekte
 * duruyordu. Sayfa yenilenince video "Varlık · Boyut bilinmiyor" görünüyor ve
 * oranı bilinmediği için yerleşim kararları da onsuz veriliyordu (canlı,
 * 2026-10-11). Kapak karesi videonun TAM çözünürlüğünde alınıyor
 * (`kapakKaresi`), yani ölçü ve önizleme kapaktan güvenle türetilir; ad,
 * kapağın adından `-kapak.jpg` atılarak. Bilgisi zaten olan videoya dokunulmaz.
 */
export function videoBilgisiKapaktan<T extends { ad: string; onizleme: string; en: number | null; boy: number | null }>(
  bilgi: ReadonlyMap<string, T>,
  medya: ReadonlyArray<{ varlikId: string; kapakVarlikId?: string }>,
): ReadonlyMap<string, T> {
  let sonuc: Map<string, T> | null = null;
  for (const m of medya) {
    if (!m.kapakVarlikId || bilgi.has(m.varlikId)) continue;
    const kapak = bilgi.get(m.kapakVarlikId);
    if (!kapak) continue;
    sonuc ??= new Map(bilgi);
    sonuc.set(m.varlikId, { ...kapak, ad: kapak.ad.replace(/-kapak\.jpg$/i, '') });
  }
  return sonuc ?? bilgi;
}

/**
 * ÖLÇÜM ENGELLERİ → Marka Merkezi › Ölçüm (2026-10-11). "Satın alma dönüşümü
 * etkin değil" kullanıcıyı Google Ads'e yolluyordu ve neyin eksik olduğunu
 * söylemiyordu; Ölçüm bölümü durumu nedeniyle gösterip kurulumu öneriyor.
 */
export const OLCUM_ENGEL_KODLARI: readonly string[] = ['G-DONUSUM', 'M-PIKSEL', 'M-PIKSEL-CALISMADI', 'M-PIKSEL-SESSIZ'];

/**
 * OTOMATİK PROVA (kullanıcı kararı, 2026-10-12): "kreatifi attığımızda
 * simülasyon tamamlansın". Kontrol adımına gelindiğinde engel yoksa ve bu
 * içerikle prova yapılmadıysa prova kendiliğinden başlar; kullanıcının işi
 * yalnız "Yayınla → Onayla". Düşen bir prova (`hata`) kendini TEKRAR
 * başlatmaz: döngüde platforma istek yağdırmak yerine sebep ekranda kalır ve
 * düğme durur. İçerik değişince yeni içerik için bir kez daha başlar.
 */
export function otomatikProvaGerekli(g: {
  ekran: EkranNo;
  durum: string;
  bekleyen: number;
  eksikler: readonly RehberEksigi[];
  acik: Record<RehberPlatformu, boolean>;
  prova: { sonuc: RehberProvaSonucu | null; suruyor: boolean; hata: string | null };
  icerikOzeti: string;
}): boolean {
  if (g.ekran !== 6 || g.durum !== 'taslak' || g.bekleyen > 0) return false;
  if (g.prova.suruyor || g.prova.hata) return false;
  if (!g.acik.meta && !g.acik.google) return false;
  if (g.eksikler.some((e) => e.seviye === 'engel')) return false;
  return !g.prova.sonuc || g.prova.sonuc.icerikOzeti !== g.icerikOzeti;
}

/**
 * OTOMATİK BOYUT PLANI (kullanıcı kararı, 2026-10-12). YALNIZ bu eylemde
 * EKLENEN bir görselin setinde eksik boyut üretilir: kullanıcının kaldırdığı
 * üretilmiş görsel bir sonraki eklemede geri gelmesin diye plan "şu an ne
 * eksik" değil "şu an ne eklendi"den başlıyor. Kaynak setin EN BÜYÜK
 * (piksel) üretilmemiş görseli: küçük olandan büyütmek bulanık görsel demek.
 * Üst sınır (en çok `enCok` medya) aşılmaz; sığmayan boyut sayısı söylenir.
 */
export function uretimPlani(g: {
  medya: readonly MedyaOgesi[];
  oranlar: ReadonlyMap<string, GorselOrani | null>;
  olculer: ReadonlyMap<string, { en: number | null; boy: number | null }>;
  eklenen: ReadonlySet<string>;
  niyet: NiyetKodu;
  enCok: number;
}): { isler: Array<{ setSira: number; kaynakVarlikId: string; oranlar: GorselOrani[] }>; sigmayan: number } {
  if (!bannerSetiDestekleniyor(g.niyet)) return { isler: [], sigmayan: 0 };
  const { setler } = setGorunumu(g.medya, g.oranlar, g.niyet);
  let yer = g.enCok - g.medya.length;
  let sigmayan = 0;
  const isler: Array<{ setSira: number; kaynakVarlikId: string; oranlar: GorselOrani[] }> = [];
  setler.slice(0, EKRAN_EN_COK_SET).forEach((st, setSira) => {
    const ogeler = Object.values(st).filter((x): x is MedyaOgesi => !!x);
    if (!ogeler.some((x) => g.eklenen.has(x.varlikId) && !x.uretildi)) return;
    const alan = (x: MedyaOgesi) => {
      const o = g.olculer.get(x.varlikId);
      return o?.en && o.boy ? o.en * o.boy : 0;
    };
    const kaynak = ogeler.filter((x) => !x.uretildi && alan(x) > 0).sort((a, b) => alan(b) - alan(a))[0];
    if (!kaynak) return;
    const mevcut = Object.keys(st) as GorselOrani[];
    const eksik = GORSEL_ORANLARI.filter((o) => !mevcut.includes(o));
    const sigan = eksik.slice(0, Math.max(0, yer));
    sigmayan += eksik.length - sigan.length;
    yer -= sigan.length;
    if (sigan.length) isler.push({ setSira, kaynakVarlikId: kaynak.varlikId, oranlar: sigan });
  });
  return { isler, sigmayan };
}
