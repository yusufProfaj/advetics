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
import type { AlanKaynagi } from '../taslak';
import { REHBER_AMACLARI, platformGorunurMu, type RehberAmacKodu, type RehberPlatformu } from './amaclar';
import { REHBER_IZINLI_KAYNAKLAR, VARSAYILAN_META_PAYI, type RehberAlanAdi, type RehberAlanlari } from './alanlar';
import { METIN_SINIRLARI, karakterSayisi } from './metin';
import { META_EN_COK_GORSEL } from './turet';
import { butceBol, gunlukEsdeger } from './butce';
import type { RehberOnKosullari } from './hazirlik';
import { googleGorselBulgulari, googleGorselKurgusuMu, googleMetinBulgulari, type GorselOlcusu } from './google-gorsel';
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
}

const ADIM: Record<RehberAlanAdi, RehberAdimi> = {
  amac: 1,
  platformlar: 2, metaHesabiId: 2, googleHesabiId: 2, sayfaId: 2, instagramId: 2, youtubeKanaliId: 2, pikselId: 2,
  konumlar: 3, enDusukYas: 3, yasAraligi: 3, ekKategoriler: 3,
  hedefAdres: 4, telefon: 4, whatsappNumarasi: 4, formSablonuId: 4, medya: 4, youtubeVideo: 4, metin: 4, anahtarKelimeler: 4,
  butce: 5, metaPayiYuzde: 5, takvim: 5,
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
 *   izlenme, erişim): adres varsa düğme oraya, yoksa Facebook sayfasına gider
 *   (derle.ts `BAGLANTISI_ISTEGE_BAGLI_NIYETLER`).
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
      ekle(ad, null, 'KAYNAK', d.kaynak === 'ai_onerisi' ? 'Önerilen metni gözden geçirip onayla' : 'Bu alanı kendin seç');
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
    if (amac === 'SATIS') onKosul(ok?.googleSatisOlcumu, 'google', 'G-DONUSUM', "Google Ads'te satın alma dönüşümü etkin değil", "Google Ads'teki satın alma dönüşümü kontrol edilemedi");
    // Maks. Performans da logo ve işletme adı istiyor (marka kuralları açık:
    // kampanya düzeyinde, `google-pmax.ts`).
    if (tanim.google.kurgu === 'TALEP_YARATMA_VIDEO' || googleGorselKurgusuMu(tanim.google.kurgu)) {
      if (ok && !ok.googleLogoVeAd) ekle('googleHesabiId', 'google', 'G-LOGO', "Marka Merkezi'nde logo ve işletme adı yok");
    }
    if (tanim.google.kurgu === 'TALEP_YARATMA_VIDEO' && !a.youtubeKanaliId?.deger) {
      ekle('youtubeKanaliId', 'google', 'G-KANAL', 'YouTube kanalı bağlı değil');
    }
  }
  if (acik.meta && acik.google && !b.paraBirimleriAyni) {
    ekle('metaPayiYuzde', null, 'PARA-BIRIMI', 'İki hesabın para birimi farklı; tek tutar bölünemiyor', 'engel', 5);
  }

  // ── 3 Kime ──
  const konumlar = a.konumlar?.deger ?? [];
  if (konumlar.length === 0) ekle('konumlar', null, 'KNM-01', 'Konum seçilmedi');
  if (acik.google && konumlar.some((k) => !k.google)) {
    ekle('konumlar', 'google', 'G-KONUM', "Bazı konumlar Google'da eşlenemedi");
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
      const plan = reklamSetiPlani(ayrim.setler.map((st) => st.map((x) => x.oran)));
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
    // Zorunlu yasal uyarı: Meta'da ana metinde; Google'da en az bir açıklamada
    // (Google'ın açıklamaları dönüşümlü gösterdiğini UYARI olarak yazıyoruz).
    if (b.yasalUyari) {
      if (acik.meta && !metinUyariIceriyor(m.anaMetin, b.yasalUyari)) ekle('metin', 'meta', 'YASAL-UYARI', 'Zorunlu yasal uyarı ana metinde yok');
      if (acik.google && !aciklamalar.some((s) => metinUyariIceriyor(s, b.yasalUyari as string))) {
        ekle('metin', 'google', 'G-YASAL-UYARI', 'Zorunlu yasal uyarı hiçbir Google açıklamasında yok');
      }
    }
  }
  if (googleArama) {
    const kelimeler = a.anahtarKelimeler?.deger ?? [];
    // Anahtar kelimesiz Arama kampanyası hiç harcamaz ve hata vermez (SENTEZ S-03).
    if (kelimeler.length === 0) ekle('anahtarKelimeler', 'google', 'G-KELIME', 'En az bir anahtar kelime seç');
    else if (kelimeler.length < 5) ekle('anahtarKelimeler', 'google', 'G-KELIME-AZ', '5 ile 20 arası kelime en iyi sonucu verir', 'uyari');
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
    const ty = tanim.google.kurgu === 'TALEP_YARATMA_VIDEO' || tanim.google.kurgu === 'TALEP_YARATMA_GORSEL';
    if (acik.google && ty && b.asgariGunluk.googleTalepYaratma !== null) {
      const g = gunluk(pay.google);
      if (g !== null && g < b.asgariGunluk.googleTalepYaratma) ekle('butce', 'google', 'G-ASGARI', `Google Talep Yaratma reklamı için Google'ın günlük asgarisinin altında.${sonEk}`);
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
    if (p.satinAlma7Gun === false) ekle('pikselId', 'meta', 'M-PIKSEL', 'Piksel son 7 günde satın alma saymadı; satışlar ölçülmüyor olabilir', 'uyari');
    else if (p.satinAlma7Gun === null) ekle('pikselId', 'meta', 'M-PIKSEL-SATIS-BILINMIYOR', 'Son 7 günün satın almaları kontrol edilemedi', 'uyari');
  }
}

/** Yayın kapısı: engel seviyesinde eksik var mı. */
export function yayinaEngelVarMi(eksikler: readonly RehberEksigi[]): boolean {
  return eksikler.some((x) => x.seviye === 'engel');
}
