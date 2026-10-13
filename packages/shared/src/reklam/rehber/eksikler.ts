/**
 * Rehberin "yayından önce" listesi — TEK KAYNAK.
 *
 * Sağdaki kart, adım rayındaki işaretler, Yayınla düğmesinin kilidi ve
 * sunucunun yayın kapısı bu listeyi okuyor. İkinci bir liste yazılırsa biri
 * "hazır" derken öbürü düğmeyi kilitli tutar (`taslakEksikleri` ile aynı ders).
 *
 * İKİ SEVİYE: `engel` yayını durdurur; `uyari` durdurmaz ama ekranda
 * kalır. Bilinmeyen ön koşul (`null`) uyarı: kontrol edemediğimiz şeyi "yok"
 * sayıp sağlam bir kurulumu kilitlemek de, "var" sayıp yayında patlamak da
 * yanlış.
 *
 * Prova (adım 6) bu listede DEĞİL: alanlardan türemiyor, sunucunun prova
 * kaydından geliyor ve kullanıcının hiçbir cevabı onu kapatmıyor
 * (`SISTEM_EKSIK_KODLARI` dersi). Sunucu yayın kapısında ayrıca bakar.
 */
import { TELEFON_E164, metinUyariIceriyor } from '../taslak-alanlari';
import { telefonUlkeMesaji, telefonUlkesiDisindakiKonumlar } from '../meta/derle';
import type { AlanKaynagi } from '../taslak';
import { REHBER_AMACLARI, platformGorunurMu, type RehberAmacKodu, type RehberPlatformu } from './amaclar';
import { REHBER_IZINLI_KAYNAKLAR, VARSAYILAN_META_PAYI, type RehberAlanAdi, type RehberAlanlari } from './alanlar';
import { METIN_SINIRLARI, karakterSayisi } from './metin';
import { GOOGLE_PMAX_SATIS_ESIGI, META_EN_COK_GORSEL } from './turet';
import { butceBol, gunlukEsdeger } from './butce';
import { youtubeVideoEngeli, type RehberOnKosullari } from './hazirlik';
import { MEDYA_SINIRLARI } from '../medya';
import { GOOGLE_KARE_LOGO_KURGULARI } from './google-kanallar';
import { googleGorselBulgulari, googleGorselKurgusuMu, googleMetinBulgulari, type GorselOlcusu } from './google-gorsel';
import { fiyatSorunu, promosyonSorunu } from './google-ogeler';
import { ACIKLAMA_METNI_SINIRI } from './google-uzanti';
import { ADRES_CEVRESI_KARISIK_MESAJI, ERISIM_YARICAP, GOOGLE_YARICAP_KURGULARI, GOOGLE_YARICAP_YOK_MESAJI, adresCevresiKarisik, adresCevresiMi, doygunlukUyarisi } from './erisim';
import { ORAN_ETIKETI, YERLESIM_GRUPLARI, bannerSetiDestekleniyor, reklamSetiPlani, setlereAyir, type GorselOrani } from '../banner-seti';

export type RehberAdimi = 1 | 2 | 3 | 4 | 5 | 6;

export const REHBER_ADIMLARI: ReadonlyArray<{ no: RehberAdimi; ad: string; alt: string }> = [
  { no: 1, ad: 'Amaç', alt: 'Ne bekliyorsun' },
  { no: 2, ad: 'Nerede', alt: 'Meta, Google' },
  { no: 3, ad: 'Kime', alt: 'Konum, yaş' },
  { no: 4, ad: 'Reklam', alt: 'Görsel, metin' },
  { no: 5, ad: 'Bütçe', alt: 'Tutar, süre' },
  { no: 6, ad: 'Kontrol', alt: 'Önizleme, prova' },
];

export interface RehberEksigi {
  adim: RehberAdimi;
  alan: RehberAlanAdi | null;
  /** Hangi platformu ilgilendiriyor; ikisini de ise `null`. */
  platform: RehberPlatformu | null;
  kod: string;
  seviye: 'engel' | 'uyari';
  metin: string;
}

export interface RehberEksikBaglami {
  ajansYoneticisi: boolean;
  onKosullar: RehberOnKosullari | null;
  yasalUyari: string | null;
  /** Platform asgarisi, micros; `null` = okunamadı (uyarı) ya da sınır yok. */
  asgariGunluk: { meta: bigint | null; googleTalepYaratma: bigint | null };
  /** Bütçenin para birimi (Meta hesabınınki; iki hesap farklıysa ayrı eksik). */
  paraBirimi: string;
  /** İki platform hesabının para birimi aynı mı; değilse tek tutar bölünemez. */
  paraBirimleriAyni: boolean;
  /**
   * Medyadaki görsellerin oranı (sunucuda, varlığın ölçüsünden). Verilmezse
   * set kontrolleri koşmaz — "bilinmiyor" bir uyarı üretmez; türetme yine de
   * oranı bilinmeyen görselde durur.
   */
  medyaOranlari?: ReadonlyMap<string, GorselOrani | null> | null;
  /**
   * GOOGLE (Dalga 3): görsellerin piksel ölçüsü ve dosya boyutu. Google'ın
   * oran payı ±%1 (Meta'nınki %3) ve en az boyutu var; ölçü verilirse
   * uymayan görsel GİRİŞ ANINDA söylenir, verilmezse derleyici söyler.
   */
  googleGorselOlculeri?: ReadonlyMap<string, GorselOlcusu | null> | null;
  /**
   * Bugün (YYYY-MM-DD, hesabın saat diliminde). Verilirse geçmiş tarihli
   * promosyon bitişi GİRİŞTE engel (Ajan 4, N-1). Sunucu veriyor; saat
   * shared'da okunmuyor (saf).
   */
  bugun?: string;
}

const ADIM: Record<RehberAlanAdi, RehberAdimi> = {
  amac: 1,
  platformlar: 2, metaHesabiId: 2, googleHesabiId: 2, sayfaId: 2, instagramId: 2, youtubeKanaliId: 2, pikselId: 2, satissizPikselOnayi: 2,
  konumlar: 3, enDusukYas: 3, yasAraligi: 3, ekKategoriler: 3,
  hedefAdres: 4, telefon: 4, whatsappNumarasi: 4, whatsappKarsilama: 4, formSablonuId: 4, medya: 4, youtubeVideo: 4, metin: 4, anahtarKelimeler: 4,
  butce: 5, metaPayiYuzde: 5, takvim: 5,
  googlePromosyon: 4, googleFiyatListesi: 4,
};

/**
 * Alanın ekran adı: KAYNAK eksiği hangi alan olduğunu söylemeli ("Bu alanı
 * kendin seç" tek başına kullanıcıyı bütün adımları gezmeye gönderiyordu).
 * Taslağın karşılığı `TASLAK_ALAN_ETIKETI`; `Record`, yeni alanda derlemeyi kırar.
 */
export const REHBER_ALAN_ETIKETI: Record<RehberAlanAdi, string> = {
  amac: 'Amaç',
  platformlar: 'Platformlar',
  metaHesabiId: 'Meta reklam hesabı',
  googleHesabiId: 'Google Ads hesabı',
  sayfaId: 'Facebook sayfası',
  instagramId: 'Instagram hesabı',
  youtubeKanaliId: 'YouTube kanalı',
  pikselId: 'Meta pikseli',
  satissizPikselOnayi: 'Satışsız piksel onayı',
  konumlar: 'Konum',
  enDusukYas: 'En düşük yaş',
  yasAraligi: 'Yaş aralığı',
  ekKategoriler: 'Özel reklam kategorisi',
  hedefAdres: 'Site adresi',
  telefon: 'Telefon numarası',
  whatsappNumarasi: 'WhatsApp numarası',
  whatsappKarsilama: 'WhatsApp karşılama mesajı',
  formSablonuId: 'Form',
  medya: 'Görseller',
  youtubeVideo: 'YouTube videosu',
  metin: 'Reklam metni',
  anahtarKelimeler: 'Anahtar kelimeler',
  butce: 'Bütçe',
  metaPayiYuzde: 'Meta payı',
  takvim: 'Tarih',
  googlePromosyon: 'Kampanya (indirim)',
  googleFiyatListesi: 'Fiyat listesi',
};

const HTTPS = /^https:\/\/[^\s/]+\.[^\s]+/;

/**
 * SİTE ADRESİ ALANI — TEK KURAL (panel ve eksik listesi okuyor). Panel bir
 * süre kendi listesini yazıyordu (`SITE, SATIS, VIDEO, ERISIM`) ve eksik
 * listesi başka bir kural okuyordu: Meta'da video amacında alan "gerekli"
 * görünüyor, boş geçince hiçbir eksik çıkmıyordu.
 *
 * - `zorunlu`: siteye gönderen Meta amaçları (SITE, SATIS) ya da Google açık
 *   (Google'ın her kurgusu nihai adres istiyor).
 * - `istege_bagli`: Meta'da tıklamanın sonuç OLMADIĞI amaçlar (video
 *   izlenme, erişim): adres varsa düğme oraya gider; yoksa erişimde
 *   Facebook sayfasına, video izlenmede düğme HİÇ kurulmaz (S3,
 *   `videoDugmesiVar`; derle.ts `BAGLANTISI_ISTEGE_BAGLI_NIYETLER`).
 * - `null`: alan sorulmaz (form, arama, WhatsApp yalnız Meta'da).
 */
export type AdresAlani = 'zorunlu' | 'istege_bagli' | null;
export function adresAlani(amac: RehberAmacKodu, acik: Record<RehberPlatformu, boolean>): AdresAlani {
  if (acik.google || (acik.meta && (amac === 'SITE' || amac === 'SATIS'))) return 'zorunlu';
  if (acik.meta && (amac === 'VIDEO' || amac === 'ERISIM')) return 'istege_bagli';
  return null;
}
export function adresGerekliMi(amac: RehberAmacKodu, acik: Record<RehberPlatformu, boolean>): boolean {
  return adresAlani(amac, acik) === 'zorunlu';
}

/** Rehberin AÇIK platformları: kullanıcı seçimi ∩ görünürlük. */
export function acikPlatformlar(a: RehberAlanlari, ajansYoneticisi: boolean): Record<RehberPlatformu, boolean> {
  const amac = a.amac?.deger;
  const p = a.platformlar?.deger ?? { meta: false, google: false };
  if (!amac) return { meta: false, google: false };
  return {
    meta: p.meta && platformGorunurMu(amac, 'meta', ajansYoneticisi),
    google: p.google && platformGorunurMu(amac, 'google', ajansYoneticisi),
  };
}

export function rehberEksikleri(a: RehberAlanlari, b: RehberEksikBaglami): RehberEksigi[] {
  const e: RehberEksigi[] = [];
  const ekle = (alan: RehberAlanAdi | null, platform: RehberPlatformu | null, kod: string, metin: string, seviye: 'engel' | 'uyari' = 'engel', adim?: RehberAdimi) =>
    e.push({ adim: adim ?? (alan ? ADIM[alan] : 2), alan, platform, kod, seviye, metin });

  // KAYNAK KİLİDİ önce: "Metin öner"in yazdığı metin dolu görünür ama karar değil.
  for (const [ad, izinli] of Object.entries(REHBER_IZINLI_KAYNAKLAR) as Array<[RehberAlanAdi, readonly AlanKaynagi[]]>) {
    const d = a[ad];
    if (d && !izinli.includes(d.kaynak)) {
      const etiket = REHBER_ALAN_ETIKETI[ad];
      ekle(ad, null, 'KAYNAK', d.kaynak === 'ai_onerisi' ? `${etiket}: öneriyi gözden geçirip onayla` : `${etiket}: bu alanı kendin seç`);
    }
  }

  // ── 1 Amaç ──
  const amac = a.amac?.deger;
  if (!amac) {
    ekle('amac', null, 'AMAC', 'Amaç seçilmedi');
    return e; // Amaçsız geri kalan her kontrol anlamsız (hangi platform, hangi alan).
  }
  const tanim = REHBER_AMACLARI[amac];

  // ── 2 Nerede ──
  const acik = acikPlatformlar(a, b.ajansYoneticisi);
  if (!acik.meta && !acik.google) ekle('platformlar', null, 'PLT-YOK', 'En az bir platform açık olmalı');
  const ok = b.onKosullar;
  if (acik.meta) {
    if (!a.metaHesabiId) ekle('metaHesabiId', 'meta', 'M-HESAP', 'Meta reklam hesabı seçilmedi');
    // Sayfa ASLA platform varsayılanına bırakılmaz: panel turunda Meta başka
    // bir müşterinin sayfasını kendiliğinden seçti (A4 § 4.1).
    if (!a.sayfaId) ekle('sayfaId', 'meta', 'M-SAYFA', 'Facebook sayfası seçilmedi');
    if (amac === 'FORM') {
      onKosul(ok?.metaFormKosullari, 'meta', 'M-FORM-KOSUL', 'Sayfada potansiyel müşteri koşulları kabul edilmemiş', 'Sayfanın potansiyel müşteri koşulları kontrol edilemedi');
    }
    if (amac === 'WHATSAPP') {
      /*
       * HAT ARTIK SORULUYOR (Dalga 3): sayfanın `whatsapp_number` alanı
       * ölçümde boş döndü, yani "okunamadı" çoğu sayfada normal hâl. Numara
       * yazıldıysa uyarı GÖSTERİLMEZ: hattı Meta provada doğruluyor ve her
       * rehberde duran bir uyarı okunmaz hâle gelir. `false` bugün hiç
       * üretilmiyor (`whatsappHali`); üretilirse engel.
       */
      const n = a.whatsappNumarasi?.deger ?? null;
      if (ok?.metaWhatsapp === false) ekle('platformlar', 'meta', 'M-WHATSAPP', 'Sayfaya bağlı WhatsApp Business hattı yok', 'engel', 2);
      else if (ok?.metaWhatsapp !== true && !(n && TELEFON_E164.test(n))) {
        ekle('platformlar', 'meta', 'M-WHATSAPP-BILINMIYOR', "Sayfaya bağlı WhatsApp hattı Meta'dan okunamadı; numarayı kendin yaz", 'uyari', 2);
      }
    }
    if (amac === 'SATIS') pikselEksikleri();
  }
  if (acik.google) {
    if (!a.googleHesabiId) ekle('googleHesabiId', 'google', 'G-HESAP', 'Google Ads hesabı seçilmedi');
    if (amac === 'SATIS') {
      onKosul(ok?.googleSatisOlcumu, 'google', 'G-DONUSUM', "Google Ads'te satın alma dönüşümü etkin değil", "Google Ads'teki satın alma dönüşümü kontrol edilemedi");
      /*
       * SATIŞ HACMİ (yönetici kararı, 2026-10-13): kapı (birincil + etkin +
       * satın alma) değişmedi; ölçüm VARSA son 30 günün satış sayısı UYARI.
       * Ölçüm yoksa sayı sorulmuyor (G-DONUSUM zaten engel). Okunamayan
       * sayı "0 satış" DEĞİL: kendi cümlesi var. Alan hiç yoksa (eski
       * önbellek) susar: sorulmamış soru "okunamadı" değil.
       */
      if (ok?.googleSatisOlcumu === true && ok.googleSatis30Gun !== undefined) {
        const n = ok.googleSatis30Gun;
        if (n === null) ekle('platformlar', 'google', 'G-SATIS-SAYI-BILINMIYOR', "Son 30 günün satış sayısı Google Ads'ten okunamadı", 'uyari', 2);
        else if (n < GOOGLE_PMAX_SATIS_ESIGI) ekle('platformlar', 'google', 'G-SATIS-AZ', googleSatisAzCumlesi(n), 'uyari', 2);
      }
    }
    // LOGO KURALI (Google belgesi: 1:1, en az 128×128): giriş anında,
    // Yayınla'da değil. Ölçü bilinmiyorsa susar (derleyici ve prova söyler).
    // B17: Talep Yaratma video ve görsel reklamının `logoImages`ı da AYNI
    // kuralı taşıyor (proto: 1:1, en az 128); önce yalnız Maks. Performans'ta
    // soruluyordu ve kare olmayan logo Talep Yaratma'da ancak provada düşüyordu.
    if (tanim.google.kurgu && GOOGLE_KARE_LOGO_KURGULARI.includes(tanim.google.kurgu) && ok?.googleLogoKare === false) {
      ekle('googleHesabiId', 'google', 'G-LOGO-KARE', "Marka Merkezi'ndeki logo kare (1:1) ve en az 128×128 olmalı");
    }
    // Maks. Performans da logo ve işletme adı istiyor (marka kuralları açık:
    // kampanya düzeyinde, `google-pmax.ts`).
    if (tanim.google.kurgu === 'TALEP_YARATMA_VIDEO' || googleGorselKurgusuMu(tanim.google.kurgu)) {
      if (ok && !ok.googleLogoVeAd) ekle('googleHesabiId', 'google', 'G-LOGO', "Marka Merkezi'nde logo ve işletme adı yok");
    }
    /*
     * G-KANAL KALDIRILDI (VIDEO denetimi B16). Kanal yalnız video LİSTESİNİ
     * okumak için gerekiyor; derleyici video kimliğiyle kuruyor ve bağlantı
     * yapıştırma yolu kanalsız da çalışıyor (video herkese açık API'den
     * okunuyor, B15). Kanalı olmayan işletmeyi engelde tutmak, ekranın
     * sunduğu yolu kullanıcıya kapatmaktı. Video yoksa `G-VIDEO` zaten engel.
     */
  }
  if (acik.meta && acik.google && !b.paraBirimleriAyni) {
    ekle('metaPayiYuzde', null, 'PARA-BIRIMI', 'İki hesabın para birimi farklı; tek tutar bölünemiyor', 'engel', 5);
  }

  // ── 3 Kime ──
  const konumlar = a.konumlar?.deger ?? [];
  if (konumlar.length === 0) ekle('konumlar', null, 'KNM-01', 'Konum seçilmedi');
  // Adres çevresi Google'a `proximity` olarak gidiyor (eşleme gerekmiyor).
  if (acik.google && konumlar.some((k) => !k.google && !adresCevresiMi(k))) {
    ekle('konumlar', 'google', 'G-KONUM', "Bazı konumlar Google'da eşlenemedi");
  }
  /*
   * İŞLETME ADRESİNİN ÇEVRESİ (ERİŞİM K4) — GİRİŞ ANINDA. Derleyiciler aynı
   * kuralları ikinci kapı olarak tutuyor (`KNM-ADRES`, `OZK-04`, `OZK-06`);
   * burada kullanıcı Kime adımındayken öğreniyor.
   */
  const adresCevresi = konumlar.find(adresCevresiMi);
  if (adresCevresi) {
    if (adresCevresiKarisik(konumlar)) ekle('konumlar', null, 'KNM-ADRES', ADRES_CEVRESI_KARISIK_MESAJI);
    const r = adresCevresi.yaricapKm;
    if (r === undefined || !Number.isInteger(r) || r < ERISIM_YARICAP.enAz || r > ERISIM_YARICAP.enCok) {
      ekle('konumlar', null, 'KNM-YARICAP', `Yarıçap ${ERISIM_YARICAP.enAz} ile ${ERISIM_YARICAP.enCok} km arasında tam sayı olmalı`);
    }
    if (adresCevresi.enlem === undefined || adresCevresi.boylam === undefined) ekle('konumlar', null, 'KNM-ADRES-KONUM', "İşletme adresinin harita konumu yok; Marka Merkezi'nde gir ya da il/ilçe seç");
    // Özel kategoride Meta noktanın ÜLKESİNİ istiyor (kategori ülkesi) ve
    // koordinattan ülke okumuyoruz (`isletmeAdresiKonumu`): kurulamaz,
    // sebebiyle söylenir. Bu yüzden 17 km tabanı (OZK-06) buraya hiç düşmez.
    if (acik.meta && (a.ekKategoriler?.deger ?? []).length > 0) {
      ekle('konumlar', 'meta', 'OZK-04', 'Konut, iş ilanı ve kredi reklamında adres çevresi kullanılamıyor: Meta noktanın ülkesini istiyor. İl/ilçe seç');
    }
    if (acik.google && (!tanim.google.kurgu || !GOOGLE_YARICAP_KURGULARI.includes(tanim.google.kurgu))) {
      ekle('konumlar', 'google', 'G-YARICAP-KURGU', GOOGLE_YARICAP_YOK_MESAJI);
    }
  }
  const yas = a.enDusukYas?.deger ?? 18;
  if (yas < 18 || yas > 25) ekle('enDusukYas', null, 'KTL-01', 'En düşük yaş 18 ile 25 arasında olmalı');
  const ar = a.yasAraligi?.deger;
  if (ar && (ar.min < 18 || ar.max > 65 || ar.min > ar.max)) ekle('yasAraligi', null, 'KTL-02', 'Yaş aralığı 18 ile 65 arasında olmalı');
  if (!a.ekKategoriler) ekle('ekKategoriler', null, 'OZK-SORU', 'Reklam kategorisi sorusu cevaplanmadı');
  // Kısıtlı kategoride yaş daraltılamaz (uyum denetçisinin 3. kuralı); eksik
  // listesinde de duruyor ki kullanıcı Yayınla'da değil Kime adımında öğrensin.
  const kisitli = (a.ekKategoriler?.deger ?? []).some((k) => k !== 'ISSUES_ELECTIONS_POLITICS');
  if (kisitli && (yas !== 18 || (ar && (ar.min !== 18 || ar.max < 65)))) {
    ekle('yasAraligi', null, 'KTL-KISITLI', 'Konut, iş ilanı ve kredi reklamında yaş daraltılamaz');
  }
  if (a.ekKategoriler?.deger.includes('ISSUES_ELECTIONS_POLITICS')) {
    ekle('ekKategoriler', null, 'OZK-SIYASI', "Siyasi ve toplumsal konulu reklamlar Advetics'ten yayınlanamıyor");
  }

  // ── 4 Reklam ──
  const googleArama = acik.google && tanim.google.kurgu === 'ARAMA';
  // Kural tek yerde (`adresAlani`): panel aynı fonksiyonu okuyor. İsteğe
  // bağlı alanda yazılmış adres yine geçerli olmalı (derleyici de reddeder).
  const adresHali = adresAlani(amac, acik);
  const adres = a.hedefAdres?.deger ?? null;
  if ((adresHali === 'zorunlu' && !(adres && HTTPS.test(adres))) || (adresHali === 'istege_bagli' && adres && !HTTPS.test(adres))) {
    ekle('hedefAdres', null, 'SITE-ADRES', 'Site adresi https:// ile başlamalı');
  }
  if (amac === 'WHATSAPP' && acik.meta) {
    const n = a.whatsappNumarasi?.deger ?? null;
    if (!(n && TELEFON_E164.test(n))) ekle('whatsappNumarasi', 'meta', 'WHATSAPP-NUMARA', 'WhatsApp numarası +90 ile başlamalı');
    /*
     * NUMARA KULLANICI ONAYIYLA (Ajan 4, Dalga 3 F5). Marka Merkezi'ndeki
     * telefon WhatsApp hattı olmayabilir ve Meta'nın sayfaya bağlı olmayan
     * numarayı reddettiği HENÜZ ölçülmedi: kabul ederse reklam yanlış hatta
     * gider, hata vermeden. Başka kaynaktan gelen numara onaylanana kadar
     * engel; ekran tek tıkla onaylatıyor.
     */
    else if (a.whatsappNumarasi?.kaynak !== 'kullanici') ekle('whatsappNumarasi', 'meta', 'WHATSAPP-ONAY', 'WhatsApp numarasını onayla: mesajlar bu numaraya gelecek');
  }
  if (amac === 'TELEFON') {
    const tel = a.telefon?.deger ?? null;
    if (!(tel && TELEFON_E164.test(tel))) ekle('telefon', null, 'TELEFON', 'Telefon numarası +90 ile başlamalı');
    /*
     * ÜLKE KURALI GİRİŞ ANINDA (yönetici kararı, 2026-10-12): +90 numaralı
     * arama reklamı Türkiye dışına gösterilirse para gider, arama gelmez.
     * Derleyici aynı kuralı ikinci kapı olarak tutuyor (`TEL-ULKE`). Ülkesi
     * bilinmeyen nokta engel değil UYARI: Türkiye'deki bir harita noktasını
     * kilitlemek sağlam bir kurulumu bozardı.
     */
    // Platform AYRIMI YOK: Google arama öğesi de aynı numarayı gösteriyor ve
    // yalnız Google açıkken de yurt dışındaki kişi uluslararası aramaya düşer.
    if ((acik.meta || acik.google) && tel && TELEFON_E164.test(tel)) {
      const yabanci = telefonUlkesiDisindakiKonumlar(tel, konumlar);
      if (yabanci.length) ekle('konumlar', null, 'TEL-ULKE', telefonUlkeMesaji(yabanci));
      else if (tel.startsWith('+90') && konumlar.some((k) => k.tur !== 'country' && !k.ulkeKodu)) {
        ekle('konumlar', null, 'TEL-ULKE-BILINMIYOR', 'Bazı konumların ülkesi okunamadı; Türkiye dışındaysa reklam aranamayan bir yerde gösterilir', 'uyari');
      }
    }
  }
  if (amac === 'FORM' && acik.meta && !a.formSablonuId?.deger) ekle('formSablonuId', 'meta', 'FORM-YOK', 'Form seçilmedi');
  if (amac === 'FORM' && acik.meta && a.formSablonuId?.deger) {
    /*
     * SEÇİLİ FORM META'DA KONTROL EDİLİYOR (Ç-2, Ç-3). Yalnız Meta: Google
     * formu bu dalgada kapalı (`G-KURGU-KAPALI`) ve kendi içeriğini isteyecek.
     * Bilinmeyen hâl UYARI: liste henüz okunmadıysa formu "yok" saymak sağlam
     * bir kurulumu kilitler. Sunucu provadan önce listeyi TAZE okuyor, yani
     * provaya giden hâl bilinen hâl.
     */
    const f = ok?.seciliForm ?? null;
    if (!f) ekle('formSablonuId', 'meta', 'FORM-BILINMIYOR', "Seçilen form Meta'da kontrol edilemedi", 'uyari');
    else if (!f.sayfadaYayinda) ekle('formSablonuId', 'meta', 'FORM-SAYFA', 'Seçilen form bu sayfada yayında değil; listeden yeniden seç');
    else if (!f.gizlilikAdresi) ekle('formSablonuId', 'meta', 'FORM-GIZLILIK', `"${f.ad ?? 'Seçilen'}" formunda gizlilik politikası adresi yok; başka bir form seç`);
  }

  const medya = a.medya?.deger ?? [];
  const gorselGerekli = acik.meta || (acik.google && googleGorselKurgusuMu(tanim.google.kurgu));
  if (gorselGerekli && medya.length === 0) ekle('medya', null, 'MEDYA', amac === 'VIDEO' ? 'Video ekle' : 'En az bir görsel ekle');
  // VİDEO İZLENME yalnız video ile: görsel fikri derleyicide KRT-VIDEO-ZORUNLU
  // ile durur; burada BIRAKILDIĞI adımda söyleniyor.
  const gorselSayisi = medya.filter((x) => !x.kapakVarlikId).length;
  if (acik.meta && amac === 'VIDEO' && gorselSayisi > 0) {
    ekle('medya', 'meta', 'M-VIDEO-YALNIZ', `Bu amaçta yalnız video kullanılır; ${gorselSayisi} görseli kaldır`);
  }
  if (acik.meta && b.medyaOranlari) {
    // BANNER SETİ (`banner-seti.ts`): doğrulama yükleme anında. Türetmedeki
    // retler (GORSEL-ORAN, -CAKISMA, -SAYI) burada kullanıcının diliyle.
    const ayrim = setlereAyir(medya.filter((x) => !x.kapakVarlikId), b.medyaOranlari, tanim.meta.niyet);
    if (ayrim.taninmayan.length) {
      ekle('medya', 'meta', 'M-GORSEL-ORAN', `${ayrim.taninmayan.length} görselin boyutu kullanılamıyor; 9:16, 4:5, 1:1 ya da 1.91:1 olmalı`);
    }
    if (ayrim.cakisan.length) ekle('medya', 'meta', 'M-SET-CAKISMA', 'Aynı sette aynı boyuttan iki görsel var; birini başka sete taşı');
    const fikir = ayrim.setler.length + medya.filter((x) => x.kapakVarlikId).length;
    if (fikir > META_EN_COK_GORSEL) ekle('medya', 'meta', 'M-SET-SAYI', `Meta'da en çok ${META_EN_COK_GORSEL} fikir olur; şu an ${fikir}`);
    // Video varken yerleşim otomatik kalıyor (derleyici); kapanan yerleşim
    // yalnız görsel setlerinde söylenir.
    if (ayrim.setler.length && !medya.some((x) => x.kapakVarlikId)) {
      const plan = reklamSetiPlani(ayrim.setler.map((st) => st.map((x) => x.oran)), tanim.meta.niyet);
      for (const g of plan.kapanan) {
        const t = YERLESIM_GRUPLARI[g];
        ekle('medya', 'meta', 'M-YERLESIM-KAPALI', `${t.etiket} kapalı kalacak: ${t.oranlar.map((o) => ORAN_ETIKETI[o]).join(' ya da ')} görsel yok`, 'uyari');
      }
    }
  }
  // ── Google görsel kurguları (Dalga 3, `google-gorsel.ts`): kural orada,
  // burada yalnız kullanıcının listesine taşınıyor. Medya boşken MEDYA
  // engeli zaten yukarıda; tekrarlanmasın.
  const gGorselKurgu = acik.google && googleGorselKurgusuMu(tanim.google.kurgu) ? tanim.google.kurgu : null;
  if (gGorselKurgu && medya.length > 0 && b.medyaOranlari) {
    for (const x of googleGorselBulgulari(gGorselKurgu, medya, b.medyaOranlari, b.googleGorselOlculeri)) ekle('medya', 'google', x.kod, x.metin, x.seviye);
  }
  if (gGorselKurgu === 'MAKS_PERFORMANS' && (a.enDusukYas?.deger ?? 18) !== 18) {
    // Maks. Performans gövdesi yaş ölçütü TAŞIMIYOR (yaş dışlamasının bu
    // kurguda API'den kabulü ÖLÇÜLMEDİ): "21 ve üstü" sözünü tutamayacağımız
    // bir kampanyayı kurmak yerine söylüyoruz.
    ekle('enDusukYas', 'google', 'G-PMAX-YAS', "Maks. Performans'ta yaş sınırı kurulmuyor; en düşük yaşı 18 yap ya da Google'ı kapat");
  }
  if (acik.google && tanim.google.kurgu === 'TALEP_YARATMA_VIDEO' && !a.youtubeVideo?.deger) {
    ekle('youtubeVideo', 'google', 'G-VIDEO', "YouTube'dan video seç");
  }
  // B15 İKİNCİ KAPI: panel seçim anında reddediyor; kayıtta gizli ya da
  // yerleştirilemez işaretli bir video kalmışsa (eski sekme) burada da durur.
  const ytVideo = acik.google && tanim.google.kurgu === 'TALEP_YARATMA_VIDEO' ? a.youtubeVideo?.deger ?? null : null;
  const ytEngel = ytVideo ? youtubeVideoEngeli(ytVideo) : null;
  if (ytEngel) ekle('youtubeVideo', 'google', 'G-VIDEO-GIZLI', ytEngel);
  // B8 İKİNCİ KAPI: süre girişte ölçülüyor (`medyaKontrol`); kayıtta 1
  // saniyenin altında bir video kalmışsa Meta reddeder.
  if (acik.meta && amac === 'VIDEO') {
    const kisa = medya.filter((x) => x.kapakVarlikId && typeof x.sureSn === 'number' && x.sureSn < MEDYA_SINIRLARI.videoEnAzSaniye).length;
    if (kisa) ekle('medya', 'meta', 'M-VIDEO-KISA', `${kisa} video ${MEDYA_SINIRLARI.videoEnAzSaniye} saniyeden kısa; Meta en az ${MEDYA_SINIRLARI.videoEnAzSaniye} saniye istiyor`);
  }

  const m = a.metin?.deger;
  if (!m) {
    ekle('metin', null, 'METIN', 'Reklam metni yazılmadı');
  } else {
    const basliklar = m.basliklar.map((s) => s.trim()).filter(Boolean);
    const aciklamalar = m.aciklamalar.map((s) => s.trim()).filter(Boolean);
    if (acik.meta && !m.anaMetin.trim()) ekle('metin', 'meta', 'METIN-ANA', 'Ana metin boş');
    if (karakterSayisi(m.anaMetin) > METIN_SINIRLARI.anaMetinEnCok) ekle('metin', 'meta', 'METIN-ANA-UZUN', `Ana metin en çok ${METIN_SINIRLARI.anaMetinEnCok} karakter`);
    else if (acik.meta && karakterSayisi(m.anaMetin) > METIN_SINIRLARI.anaMetinOnerilen) {
      ekle('metin', 'meta', 'METIN-ANA-KESILIR', `Ana metnin ${METIN_SINIRLARI.anaMetinOnerilen} karakterden sonrası "devamını gör" arkasında kalır`, 'uyari');
    }
    if (basliklar.length === 0) ekle('metin', null, 'METIN-BASLIK', 'En az bir başlık yaz');
    basliklar.forEach((s, i) => {
      if (karakterSayisi(s) > METIN_SINIRLARI.baslik) ekle('metin', null, 'METIN-BASLIK-UZUN', `Başlık ${i + 1}: en çok ${METIN_SINIRLARI.baslik} karakter`);
    });
    aciklamalar.forEach((s, i) => {
      if (karakterSayisi(s) > METIN_SINIRLARI.aciklama) ekle('metin', null, 'METIN-ACIKLAMA-UZUN', `Açıklama ${i + 1}: en çok ${METIN_SINIRLARI.aciklama} karakter`);
    });
    if (gGorselKurgu) {
      for (const x of googleMetinBulgulari(gGorselKurgu, m)) ekle('metin', 'google', x.kod, x.metin, x.seviye);
    }
    if (googleArama) {
      if (basliklar.length < METIN_SINIRLARI.basliklarEnAz) ekle('metin', 'google', 'G-BASLIK-SAYI', `Google için en az ${METIN_SINIRLARI.basliklarEnAz} başlık gerekiyor`);
      if (aciklamalar.length < METIN_SINIRLARI.aciklamalarEnAz) ekle('metin', 'google', 'G-ACIKLAMA-SAYI', `Google için en az ${METIN_SINIRLARI.aciklamalarEnAz} açıklama gerekiyor`);
    }
    // Açıklama metni (CalloutAsset): sınırı aşan ya da sayı/fiyat taşıyan
    // metin derleyicide ATILIR (`aciklamaMetniSec`); burada GİRİŞ ANINDA
    // söyleniyor, yoksa kullanıcı yazdığının reklamda olmadığını görmezdi.
    if (googleArama) {
      (m.aciklamaMetinleri ?? []).forEach((s, i) => {
        const t = s.trim();
        if (!t) return;
        if (karakterSayisi(t) > ACIKLAMA_METNI_SINIRI) ekle('metin', 'google', 'G-ACIKLAMA-METNI-UZUN', `Açıklama metni ${i + 1}: en çok ${ACIKLAMA_METNI_SINIRI} karakter`);
        else if (/\d/.test(t)) ekle('metin', 'google', 'G-ACIKLAMA-METNI-SAYI', `Açıklama metni ${i + 1}: sayı içeren metin eklenmez (süresiz durur, bayatlar)`, 'uyari');
      });
    }
    // Görünen yol (Google Arama): parça başına sınır KESİN; boşsa gönderilmiyor.
    (m.gorunenYol ?? []).forEach((s, i) => {
      if (karakterSayisi(s.trim()) > METIN_SINIRLARI.gorunenYol) {
        ekle('metin', 'google', 'G-YOL-UZUN', `Görünen yol ${i + 1}: en çok ${METIN_SINIRLARI.gorunenYol} karakter`);
      }
    });
    // Zorunlu yasal uyarı: Meta'da ana metinde; Google'da en az bir açıklamada
    // (Google'ın açıklamaları dönüşümlü gösterdiğini UYARI olarak yazıyoruz).
    if (b.yasalUyari) {
      if (acik.meta && !metinUyariIceriyor(m.anaMetin, b.yasalUyari)) ekle('metin', 'meta', 'YASAL-UYARI', 'Zorunlu yasal uyarı ana metinde yok');
      if (acik.google && !aciklamalar.some((s) => metinUyariIceriyor(s, b.yasalUyari as string))) {
        ekle('metin', 'google', 'G-YASAL-UYARI', 'Zorunlu yasal uyarı hiçbir Google açıklamasında yok');
      }
    }
  }
  // ── GÖRSELE ÖZEL METİN (Dalga 2) ──
  // Fikrin kendi metni Meta'ya ORTAK METNİN YERİNE gidiyor; ortak metne
  // uygulanan sınır ve yasal uyarı kuralı ona da uygulanmazsa yasal uyarısız
  // bir reklam, ortak metin kusursuzken yayına çıkardı.
  (a.medya?.deger ?? []).forEach((x, i) => {
    const k = x.metin;
    if (!k) return;
    const no = `Görsel ${i + 1}`;
    const ana = k.anaMetin ?? '';
    if (karakterSayisi(ana) > METIN_SINIRLARI.anaMetinEnCok) ekle('medya', 'meta', 'GORSEL-METIN-ANA-UZUN', `${no}: ana metin en çok ${METIN_SINIRLARI.anaMetinEnCok} karakter`);
    (k.basliklar ?? []).forEach((s) => {
      if (karakterSayisi(s.trim()) > METIN_SINIRLARI.baslik) ekle('medya', null, 'GORSEL-METIN-BASLIK-UZUN', `${no}: başlık en çok ${METIN_SINIRLARI.baslik} karakter`);
    });
    (k.aciklamalar ?? []).forEach((s) => {
      if (karakterSayisi(s.trim()) > METIN_SINIRLARI.aciklama) ekle('medya', null, 'GORSEL-METIN-ACIKLAMA-UZUN', `${no}: açıklama en çok ${METIN_SINIRLARI.aciklama} karakter`);
    });
    if (b.yasalUyari && acik.meta && ana.trim() && !metinUyariIceriyor(ana, b.yasalUyari)) {
      ekle('medya', 'meta', 'GORSEL-YASAL-UYARI', `${no}: zorunlu yasal uyarı bu görselin metninde yok`);
    }
  });
  if (googleArama) {
    const kelimeler = a.anahtarKelimeler?.deger ?? [];
    // Anahtar kelimesiz Arama kampanyası hiç harcamaz ve hata vermez (SENTEZ S-03).
    if (kelimeler.length === 0) ekle('anahtarKelimeler', 'google', 'G-KELIME', 'En az bir anahtar kelime seç');
    else if (kelimeler.length < 5) ekle('anahtarKelimeler', 'google', 'G-KELIME-AZ', '5 ile 20 arası kelime en iyi sonucu verir', 'uyari');
  }

  // İSTEĞE BAĞLI ÖĞELER (`google-ogeler.ts`): kural öğe seçimiyle AYNI
  // fonksiyondan. Yazılmış ama hatalı promosyon ENGEL: derleyici onu atar ve
  // kullanıcı "kampanyamı ekledim" sanırdı.
  if (googleArama) {
    const p = a.googlePromosyon?.deger;
    const ps = p ? promosyonSorunu(p, b.bugun) : null;
    if (ps) ekle('googlePromosyon', 'google', 'G-PROMOSYON', ps);
    const f = a.googleFiyatListesi?.deger;
    const fs = f ? fiyatSorunu(f) : null;
    if (fs) ekle('googleFiyatListesi', 'google', 'G-FIYAT', fs);
  }

  // ── 5 Bütçe ──
  const butce = a.butce?.deger;
  const takvim = a.takvim?.deger ?? null;
  if (!butce || BigInt(butce.micros) === 0n) ekle('butce', null, 'BTC-01', 'Bütçe girilmedi');
  if (!takvim) ekle('takvim', null, 'TKV', 'Başlangıç tarihi seçilmedi');
  else if (takvim.bitis !== null && takvim.bitis < takvim.baslangic) ekle('takvim', null, 'TKV', 'Bitiş başlangıçtan önce');
  if (butce?.tip === 'toplam' && takvim && takvim.bitis === null) ekle('takvim', null, 'BTC-02', 'Toplam bütçede bitiş tarihi gerekli');

  if (butce && BigInt(butce.micros) > 0n && (acik.meta || acik.google) && (!takvim || takvim.bitis === null || takvim.bitis >= takvim.baslangic)) {
    const pay = butceBol(BigInt(butce.micros), acik, a.metaPayiYuzde?.deger ?? VARSAYILAN_META_PAYI, b.paraBirimi);
    const gunluk = (v: bigint) => gunlukEsdeger(v, butce.tip, takvim);
    const ikisi = acik.meta && acik.google;
    const sonEk = ikisi ? ' Tutarı artır ya da tek platformla başla.' : ' Tutarı artır.';
    if (acik.meta) {
      const g = gunluk(pay.meta);
      if (b.asgariGunluk.meta === null) ekle('butce', 'meta', 'M-ASGARI-BILINMIYOR', "Meta'nın bu hesaptaki asgari bütçesi okunamadı", 'uyari');
      else if (g !== null && g < b.asgariGunluk.meta) ekle('butce', 'meta', 'M-ASGARI', `Meta'ya düşen günlük tutar hesabın asgarisinin altında.${sonEk}`);
    }
    /*
     * ERİŞİMDE BÜTÇE-KİTLE DOYGUNLUĞU (K5) — UYARI, ENGEL DEĞİL. Hesap yalnız
     * okuma ve BGM varsa (`hesaplandi`); okunamadı/hesaplanamadı hâlleri karar
     * tablosunda kendi cümlesiyle (sayı uydurulmaz, "0 kişi" yazılmaz).
     */
    const doy = ok?.erisimDoygunlugu;
    if (acik.meta && amac === 'ERISIM' && doy?.tur === 'hesaplandi') {
      const g = gunluk(pay.meta);
      const u = g === null ? null : doygunlukUyarisi(doy, g, b.paraBirimi);
      if (u) ekle('butce', 'meta', 'M-ERISIM-DOYGUN', u, 'uyari');
    }
    const ty = tanim.google.kurgu === 'TALEP_YARATMA_VIDEO' || tanim.google.kurgu === 'TALEP_YARATMA_GORSEL';
    if (acik.google && ty && b.asgariGunluk.googleTalepYaratma !== null) {
      const g = gunluk(pay.google);
      if (g !== null && g < b.asgariGunluk.googleTalepYaratma) ekle('butce', 'google', 'G-ASGARI', `Google Talep Yaratma reklamı için Google'ın günlük asgarisinin altında.${sonEk}`);
    } else if (acik.google && ty) {
      /*
       * B19: asgari yalnız TRY'de biliniyor (5 USD karşılığı, ölçülen değer
       * TRY). Başka para biriminde kontrol KOŞMUYORDU ve sessizdi: düşük
       * bütçe ancak provada `BUDGET_BELOW_PER_DAY_MINIMUM` ile düşüyordu.
       * Kur uydurulmuyor; bilinmediği söyleniyor.
       */
      ekle('butce', 'google', 'G-ASGARI-BILINMIYOR', `Google Talep Yaratma'nın günlük asgarisi (5 USD karşılığı) ${b.paraBirimi} için bilinmiyor; düşük tutar provada reddedilir`, 'uyari');
    }
  }

  return e;

  /*
   * Bilinmeyen hâlin KENDİ CÜMLESİ var: "Kontrol edilemedi: sayfaya bağlı
   * hat yok" hem "yok" hem "bilmiyoruz" diyordu ve kullanıcıyı sağlam bir
   * kurulumu düzeltmeye gönderiyordu.
   */
  function onKosul(hal: boolean | null | undefined, platform: RehberPlatformu, kod: string, metin: string, bilinmiyorMetni: string) {
    if (hal === false) ekle('platformlar', platform, kod, metin, 'engel', 2);
    else if (hal === null || hal === undefined) ekle('platformlar', platform, `${kod}-BILINMIYOR`, bilinmiyorMetni, 'uyari', 2);
  }

  /*
   * SATIŞ ÖLÇÜMÜ (Dalga 3). Engel yalnız KESİN bilgide: piksel seçilmedi,
   * hesapta yok, Meta kullanılamaz demiş ya da hiç çalışmamış (satın alma
   * için optimize edecek veri yok, Meta reklamı öğrenemez). Son 7 günde
   * satın alma sayılmaması UYARI: yeni açılmış bir mağazada satış henüz
   * olmayabilir ve onu kilitlemek sağlam bir kurulumu durdurur.
   */
  function pikselEksikleri() {
    if (!a.pikselId?.deger) return ekle('pikselId', 'meta', 'M-PIKSEL-SEC', 'Meta pikseli seçilmedi');
    const p = ok?.seciliPiksel ?? null;
    if (!p) return ekle('pikselId', 'meta', 'M-PIKSEL-BILINMIYOR', "Seçilen piksel Meta'da kontrol edilemedi", 'uyari');
    if (!p.hesaptaVar) return ekle('pikselId', 'meta', 'M-PIKSEL-HESAP', 'Seçilen piksel bu reklam hesabında yok; listeden yeniden seç');
    if (p.kullanilamaz) return ekle('pikselId', 'meta', 'M-PIKSEL-KULLANILAMAZ', "Bu piksel Meta'da kullanılamıyor; başka bir piksel seç");
    if (p.hicCalismadi) return ekle('pikselId', 'meta', 'M-PIKSEL-CALISMADI', 'Piksel sitende hiç çalışmamış; önce pikseli sitene kur');
    if (!p.son7GundeCalisti) ekle('pikselId', 'meta', 'M-PIKSEL-SESSIZ', 'Piksel son 7 günde sitenden hiç veri almadı', 'uyari');
    /*
     * SATIŞ SAYMAYAN PİKSEL ARTIK ONAY İSTİYOR (yönetici kararı, 2026-10-13;
     * önceki karar "uyarı, yeni mağaza kilitlenmez"di). Satın alma olayı
     * gelmeyen pikselde Meta'nın optimize edeceği sinyal YOK: reklam yayına
     * girer, para harcar ve satış yerine rastgele kişilere gider — hata yok.
     * Yeni mağazayı kilitlememek için engel KULLANICININ AÇIK ONAYIYLA
     * kalkıyor; onay seçili PİKSELE bağlı. YALNIZ okunabilen sıfırda:
     * okunamayan (`null`) hâl uyarı (biçim ölçülmedi, `pikselSatinAlmaCoz`).
     */
    if (p.satinAlma7Gun === false) {
      const onayli = a.satissizPikselOnayi?.deger?.pikselId === a.pikselId.deger;
      if (onayli) ekle('satissizPikselOnayi', 'meta', 'M-PIKSEL-ONAYLI', 'Piksel son 7 günde satın alma saymadı; onayınla kuruluyor', 'uyari', 2);
      else ekle('satissizPikselOnayi', 'meta', 'M-PIKSEL', 'Piksel son 7 günde satın alma saymadı; yayın için onay gerekiyor', 'engel', 2);
    }
    else if (p.satinAlma7Gun === null) ekle('pikselId', 'meta', 'M-PIKSEL-SATIS-BILINMIYOR', 'Son 7 günün satın almaları kontrol edilemedi', 'uyari');
  }
}

/** Onay kutusunun metni (panel ve test aynı cümle). */
export const SATISSIZ_PIKSEL_ONAY_METNI = 'Pikselim satış olayı göndermiyor; reklam satış yerine rastgele kişilere optimize olabilir. Yine de kur';

/** Google satış hacmi uyarısı (tek cümle; sayı ondalıklı gelebilir, aşağı yuvarlanır). */
export function googleSatisAzCumlesi(n: number): string {
  return `Son 30 günde ${Math.floor(n)} satış; Maks. Performans az satışla yavaş öğrenir`;
}

/** Yayın kapısı: engel seviyesinde eksik var mı. */
export function yayinaEngelVarMi(eksikler: readonly RehberEksigi[]): boolean {
  return eksikler.some((x) => x.seviye === 'engel');
}
