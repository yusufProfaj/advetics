/**
 * "BÖLGEMDE ÇOK KİŞİ GÖRSÜN" (ERISIM) — ERİŞİM turu (2026-10-13, Ajan 2+3).
 *
 * Üç kural tek dosyada çünkü üç tüketicisi (rehber eksik listesi, karar
 * tablosu, derleyiciler) aynı cümleyi ve aynı hesabı okumak zorunda:
 *
 * 1. İŞLETME ADRESİNİN ÇEVRESİ (K4): Marka Merkezi'ndeki adresin harita
 *    konumu + yarıçap. Konum UYDURULMUYOR: koordinat Marka Merkezi'ne elle
 *    giriliyor (Google Haritalar'dan kopyalanan "enlem, boylam"); adres
 *    metnini koordinata çeviren bir servis bu depoda yok ve tahminle bir
 *    nokta seçmek bütçeyi başka bir mahalleye harcatırdı.
 * 2. BÜTÇE-KİTLE DOYGUNLUĞU (K5): haftada en çok 2 gösterim sözü küçük bir
 *    bölgede bütçeyi TAVANLIYOR. Meta harcayamadığı parayı hata vermeden
 *    harcamıyor; kullanıcı "neden yarısı harcandı" diye sorar. Uyarı, engel
 *    değil.
 * 3. Google'ın erişim teklifi yok (K3): söz tıklamaya göre.
 */
import { tutarGoster } from '../para';
import type { HedefKonum } from '../meta/hedefleme';

/**
 * Adres çevresi konumunun SABİT anahtarı. Ayırt edici: aynı `custom` türünü
 * eski bir harita noktası da taşıyabilir; birleşim kuralı (aşağıda) YALNIZ
 * bu anahtara bağlı, başka noktalara dokunmuyor.
 */
export const ISLETME_ADRESI_KONUM_ANAHTARI = 'isletme-adresi';

/**
 * Yarıçap sınırları, km. Meta `custom_locations` için 1-80 km kabul ediyor
 * (belgede mil karşılığıyla); şema zaten 80'i tavan tutuyor
 * (`hedefKonumSchema`). Varsayılan 10 km: bir ilçe merkezi ve çevresi.
 * Kısıtlı kategoride Meta'nın tabanı 17 km (`VARSAYILAN_YARICAP_TABANI_KM`).
 */
export const ERISIM_YARICAP = { enAz: 1, enCok: 80, varsayilan: 10 } as const;

export interface Koordinat {
  enlem: number;
  boylam: number;
}

/**
 * "38.4237, 27.1428" → koordinat. Google Haritalar'da bir noktaya sağ
 * tıklayınca kopyalanan biçim bu (ondalık NOKTA, virgülle ayrılmış).
 * Türkçe ondalık virgül ("38,4237 27,1428") KABUL EDİLMİYOR: "38,4237,
 * 27,1428" gibi bir girdide hangi virgülün ayırıcı olduğu belirsiz ve yanlış
 * bölmek noktayı başka bir ile taşır. Boş girdi `null` (alanı temizlemek);
 * bozuk girdi `'gecersiz'` (giriş anında söylenir, kaydedilmez).
 */
export function koordinatCoz(metin: string | null | undefined): Koordinat | null | 'gecersiz' {
  const t = (metin ?? '').trim();
  if (!t) return null;
  /*
   * İKİ SAYI DA ONDALIK NOKTALI (Ajan 4 kapısı). Nokta isteğe bağlıyken
   * Türkçe ondalık virgülle yazılmış TEK bir sayı ("38,42") enlem 38, boylam
   * 42 diye okunuyor ve Bitlis civarında geçerli bir nokta olarak
   * kaydediliyordu: hata yok, reklam başka bir ilde. Google Haritalar'ın
   * kopyaladığı biçim her zaman ondalıklı; tam sayı koordinat ~100 km
   * belirsizlik demek ve bir mahalle reklamı için zaten kullanılamaz.
   */
  const m = /^(-?\d{1,2}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)$/.exec(t);
  if (!m) return 'gecersiz';
  const enlem = Number(m[1]);
  const boylam = Number(m[2]);
  if (!Number.isFinite(enlem) || !Number.isFinite(boylam) || enlem < -90 || enlem > 90 || boylam < -180 || boylam > 180) return 'gecersiz';
  // Sıfır nokta (0, 0) Atlantik'te; boş bırakılmış bir alanın sayıya dönmüş hâli.
  if (enlem === 0 && boylam === 0) return 'gecersiz';
  return { enlem, boylam };
}

/** Ekranda ve formda AYNI biçim (Google Haritalar'ın kopyaladığı). */
export function koordinatYaz(k: Koordinat | null | undefined): string {
  return k ? `${ondalikYaz(k.enlem)}, ${ondalikYaz(k.boylam)}` : '';
}

/**
 * Her zaman ONDALIK NOKTALI: `koordinatCoz` noktasız sayıyı reddediyor ve
 * bu dizge şemada kanonik biçim olarak yeniden çözülüyor. `String(27)` =
 * "27" yazılsaydı tam sayı bir boylam (27.0 girilmişti) kaydı 500 ile
 * düşürürdü; `String(1e-7)` üstel gösterim üretir.
 */
function ondalikYaz(n: number): string {
  const t = String(n);
  return t.includes('.') && !t.includes('e') ? t : n.toFixed(Number.isInteger(n) ? 1 : 7);
}

export const KOORDINAT_BICIM_MESAJI = 'Harita konumu "38.4237, 27.1428" biçiminde olmalı (Google Haritalar\'da adrese sağ tıklayıp ilk satırı kopyala).';

/**
 * Adres çevresi konumu. Ülke kodu BİLİNMİYOR (`null`): koordinatı ülkeye
 * çeviren bir okuma yok ve sınır kutusuyla tahmin etmek (Türkiye'nin kutusu
 * Midilli'yi, Halep'i, Tiflis'i kapsıyor) yanlış ülke beyan etmek olurdu.
 * Sonucu: özel kategorili reklamda bu seçenek kurulamıyor (Meta kategori
 * ülkesini istiyor, `OZK-04`); eksik listesi bunu GİRİŞTE söylüyor.
 */
export function isletmeAdresiKonumu(k: Koordinat, yaricapKm: number, adres: string | null): HedefKonum {
  const kisa = adres?.trim() ? adres.trim().replace(/\s+/g, ' ').slice(0, 120) : null;
  return {
    tur: 'custom',
    key: ISLETME_ADRESI_KONUM_ANAHTARI,
    etiket: kisa ? `İşletme adresinin çevresi (${kisa})` : 'İşletme adresinin çevresi',
    ulkeKodu: null,
    yaricapKm,
    enlem: k.enlem,
    boylam: k.boylam,
  };
}

export function adresCevresiMi(k: Pick<HedefKonum, 'tur' | 'key'>): boolean {
  return k.tur === 'custom' && k.key === ISLETME_ADRESI_KONUM_ANAHTARI;
}

/**
 * BİRLEŞİM KURALI: Meta `geo_locations` kovaları BİRLEŞİM (CLAUDE.md). Adres
 * çevresi + "Türkiye" Türkiye geneli demek ve hiçbir hata vermiyor. Adres
 * çevresi seçildiyse YALNIZ o gider; ekran seçimi değiştirirken listeyi
 * zaten değiştiriyor, bu kural eski bir kayıt ya da ikinci sekme için kapı.
 * Derleyici, eksik listesi ve Google türetmesi bunu okuyor.
 */
export function adresCevresiKarisik(konumlar: ReadonlyArray<Pick<HedefKonum, 'tur' | 'key'>>): boolean {
  return konumlar.some(adresCevresiMi) && konumlar.length > 1;
}
export const ADRES_CEVRESI_KARISIK_MESAJI = 'İşletme adresinin çevresi başka konumlarla birlikte seçilemez: ülke ya da il eklemek reklamı oraya da yayar. Ya adres çevresini ya il/ilçe listesini seç.';

/**
 * Bölgenin insan dilinde adı (metin önerisi istemi ve karar tablosu). Adres
 * çevresi "X km" ile yazılıyor: yapay zekâ "İzmir'de" diye yazarsa reklam
 * İzmir geneline söz verir, oysa kurulan 10 km'lik bir daire.
 */
export function bolgeAdi(konumlar: ReadonlyArray<Pick<HedefKonum, 'tur' | 'key' | 'etiket' | 'yaricapKm'>>): string | null {
  if (konumlar.length === 0) return null;
  const adresli = konumlar.find(adresCevresiMi);
  if (adresli) return `işletme adresinin ${adresli.yaricapKm ?? '?'} km çevresi`;
  return konumlar.map((k) => (k.yaricapKm ? `${k.etiket} (+${k.yaricapKm} km)` : k.etiket)).join(', ');
}

// ── Google ────────────────────────────────────────────────────────────────

/** B5/K3: Talep Yaratma'da erişim (gösterim başına) teklifi API'de kurulamıyor. */
export const GOOGLE_ERISIM_TEKLIF_CUMLESI = 'Google erişime göre teklif vermiyor (API kısıtı); tıklamaya göre';

/**
 * GOOGLE'DA ADRES ÇEVRESİ KURULAMIYOR (Ajan 4 kapısı, v25 şemasından).
 *
 * Bu turda Talep Yaratma reklam grubuna `proximity` ölçütü yazılıyordu ve
 * "kabulü ölçülmedi" deniyordu. Ölçülecek bir şey yok: v25
 * `resources/ad_group_criterion.proto` ölçüt `oneof`unda `proximity` alanı
 * YOK (konum için yalnız `location`, LocationInfo). Kampanya düzeyinde
 * (`campaign_criterion.proximity`) var ama Talep Yaratma konumu kampanya
 * düzeyinde reddediyor (CLAUDE.md, `requestError=UNKNOWN`). Yani gövde her
 * seferinde "Unknown name proximity" ile düşerdi; giriş anında söylenir.
 * Arama ve Maks. Performans'ta kampanya düzeyi daire mümkün ama bu turda
 * yazılmadı ve geri okuması yok.
 */
export const GOOGLE_YARICAP_YOK_MESAJI = "Google'da işletme adresinin çevresi kurulamıyor (Talep Yaratma reklam grubu yarıçap kabul etmiyor); Google için il/ilçe seç";

/** Yarıçapı destekleyen Google kurguları: BOŞ (yukarıdaki gerekçe). */
export const GOOGLE_YARICAP_KURGULARI: readonly string[] = [];

// ── Bütçe-kitle doygunluğu (K5) ───────────────────────────────────────────

/**
 * Haftada en çok bu kadar gösterim (derle.ts `ERISIM_SIKLIK_SINIRI` ile AYNI
 * sayı; `erisim-turu.spec` ikisini karşılaştırıyor).
 */
export const ERISIM_HAFTALIK_GOSTERIM = 2;

/**
 * Doygunluk okumasının hâli (`RehberOnKosullari.erisimDoygunlugu`). ÜÇ AYRI
 * HÂL: okunamadı (Meta'nın kitle tahmini düştü), hesaplanamadı (kitle
 * okundu ama BGM yok: hesabın son 30 gününde yeterli gösterim yok), hesaplandı.
 * "0" hiçbirinin yerine geçmiyor: okunamayan kitle sıfır kişi değil.
 */
export type ErisimDoygunlugu =
  | { tur: 'okunamadi'; sebep: string }
  | { tur: 'hesaplanamadi'; sebep: string; kitleAlt: number; kitleUst: number }
  | {
      tur: 'hesaplandi';
      kitleAlt: number;
      kitleUst: number;
      /** 1.000 gösterimin bedeli, hesabın para biriminde micros (dizge: JSON'da BigInt yok). */
      bgmMicros: string;
      bgmKaynagi: 'erisim' | 'genel';
      /** Bu bölgede günde harcanabilecek tahmini en yüksek tutar, micros. */
      tavanGunlukMicros: string;
    };

/**
 * BGM için gereken en az gösterim (son 30 gün). Birkaç yüz gösterimin BGM'si
 * gürültü: tek bir pahalı gün tavanı ikiye katlar. Eşik ÖLÇÜLMEDİ; Meta'nın
 * kendi istatistik eşiği bilinmiyor, 1.000 = bir BGM biriminin kendisi.
 */
export const DOYGUNLUK_BGM_ESIK_GOSTERIM = 1000;

/**
 * Günlük tavan = (haftada 2 × kitle) / 7 gün × BGM / 1.000.
 *
 * KİTLENİN ÜST SINIRI: Meta aralık veriyor. Alt sınırla hesaplamak uyarıyı
 * daha sık verir; uyarı yalnız ÜST sınırla bile bütçe tavanı aşıyorsa
 * çıksın ki her küçük bölgede duran ve okunmayan bir cümle olmasın.
 * Tahmin ÜST SINIR, gerçek teslim kitlenin tamamına ulaşmaz: uyarı
 * iyimser tarafta duruyor, söz verdiğinden fazlasını iddia etmiyor.
 */
export function doygunlukTavani(kitleUst: number, bgmMicros: bigint): bigint {
  if (!Number.isInteger(kitleUst) || kitleUst < 0) throw new Error('Kitle tahmini tam sayı olmalı');
  return (BigInt(ERISIM_HAFTALIK_GOSTERIM) * BigInt(kitleUst) * bgmMicros) / (7n * 1000n);
}

/**
 * Uyarı cümlesi; `null` = uyarı yok (tavanın altında). Bütçe Meta'nın PAYI,
 * günlük eşdeğeri (toplam bütçe gün sayısına bölünmüş). Cümle kitleyi ve
 * tavanı söylüyor: "tam harcanamayabilir" tek başına neyi değiştireceğini
 * söylemezdi (bütçeyi düşür ya da bölgeyi büyüt).
 */
export function doygunlukUyarisi(d: Extract<ErisimDoygunlugu, { tur: 'hesaplandi' }>, gunlukMetaMicros: bigint, paraBirimi: string): string | null {
  const tavan = BigInt(d.tavanGunlukMicros);
  if (gunlukMetaMicros <= tavan) return null;
  return `Bu bütçe bu bölgede tam harcanamayabilir: bölgede yaklaşık ${sayiYaz(d.kitleAlt)}-${sayiYaz(d.kitleUst)} kişi var ve haftada en çok ${ERISIM_HAFTALIK_GOSTERIM} gösterimle günde yaklaşık ${tutarGoster(tavan, paraBirimi)} harcanabilir. Bütçeyi düşür ya da bölgeyi büyüt.`;
}

/** Karar tablosu ve eksik listesi için doygunluğun TEK cümlesi (uyarı dışındaki hâller). */
export function doygunlukDurumCumlesi(d: ErisimDoygunlugu | null | undefined, paraBirimi: string): string {
  if (!d) return 'Bölgedeki kişi sayısı henüz okunmadı; prova sırasında okunur';
  if (d.tur === 'okunamadi') return `Bölgedeki kişi sayısı Meta'dan okunamadı: ${d.sebep}`;
  if (d.tur === 'hesaplanamadi') return `Bölgede yaklaşık ${sayiYaz(d.kitleAlt)}-${sayiYaz(d.kitleUst)} kişi var; bütçe kontrolü yapılamadı: ${d.sebep}`;
  return `Bölgede yaklaşık ${sayiYaz(d.kitleAlt)}-${sayiYaz(d.kitleUst)} kişi var; haftada en çok ${ERISIM_HAFTALIK_GOSTERIM} gösterimle günde yaklaşık ${tutarGoster(BigInt(d.tavanGunlukMicros), paraBirimi)} harcanabilir (${d.bgmKaynagi === 'erisim' ? 'hesabın erişim reklamlarının' : 'hesabın'} son 30 günlük 1.000 gösterim bedeliyle)`;
}

function sayiYaz(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
