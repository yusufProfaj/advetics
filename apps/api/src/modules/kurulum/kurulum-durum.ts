import {
  KURULUM_ADIM_ADI,
  PANEL_YERLERI,
  KURULUM_ADIM_GRUBU,
  KURULUM_ADIM_KODLARI,
  type DonusumTetigi,
  type HesapSahibi,
  type KurulumAdimDurumu,
  type KurulumAdimKodu,
  type KurulumAdimi,
  type KurulumEylemi,
} from '@advetics/shared';

/**
 * ÇEREZ ONAYI (pazar araştırması 2026-10-15, docs/pazar/kurulum.md).
 * Kurulum etiketi ve site kodunu kuruyor ama rıza hakkında hiçbir şey
 * söylemiyordu. Türkiye'de reklam çerezleri açık rıza istiyor (KVKK 2022
 * çerez rehberi) ve Consent Mode v2 sinyali (`ad_user_data`) yoksa Google
 * gelişmiş dönüşümleri HATA VERMEDEN çalışmıyor. Yalnız bilgi; onay aracını
 * biz kurmuyoruz ve hukuki tavsiye vermiyoruz.
 */
export const CEREZ_ONAYI_NOTU =
  "Sitede Consent Mode v2 destekli bir çerez onayı aracı olmalı: Türkiye'de reklam çerezleri açık rıza ister ve onay sinyali yoksa Google gelişmiş dönüşümleri çalışmaz.";

/**
 * ═══ KURULUM ADIMLARININ DURUMU — SAF (docs/kurulum/MIMARI.md) ═══
 *
 * Durum SAKLANMIYOR, her okumada buradan türetiliyor: saklanan durum biri
 * platformda elle değiştirdiğinde yalan söylerdi. Girdi veritabanından
 * (hesap satırları, kurulum satırı, hazırlık satırı); platforma gitmiyor,
 * yani sayfa açılışı ucuz. Canlı kontroller ("Kontrol et") sonucunu
 * `adimNotlari`/`siteKodu`/`sonDogrulama`ya yazar, buradan okunur.
 */

export interface AdimNotu {
  durum: 'tamam' | 'eksik' | 'hata' | 'bilgi';
  mesaj: string;
  zaman: string;
}

export interface GtmYayin {
  surumId: string;
  zaman: string;
  etiketler: string[];
  atlananlar: string[];
  /** Hangi tetik/kimlik setiyle yayınlandı; değişince "yeniden yayınla". */
  imza: string;
}

export interface AdsDonusumKaydi {
  /** customers/…/conversionActions/… ; yoksa atlandı (nedeni `not`). */
  kaynak: string | null;
  gonder: { conversionId: string; conversionLabel: string } | null;
  not: string;
}

export interface KurulumSatiri {
  hesapSahibi: HesapSahibi | null;
  /** Açılmış ama henüz atanmamış hesap: yeniden denemede yalnız "bul ve ata". */
  metaAcilanHesap: string | null;
  googleAcilanHesap: string | null;
  gtmKonteynerYolu: string | null;
  gtmKimligi: string | null;
  gtmYayin: GtmYayin | null;
  ga4MulkId: string | null;
  ga4OlcumKimligi: string | null;
  ga4AdsBagli: boolean;
  adsDonusumleri: Partial<Record<'form' | 'telefon' | 'whatsapp', AdsDonusumKaydi>>;
  donusumTetigi: DonusumTetigi | null;
  adimNotlari: Partial<Record<KurulumAdimKodu, AdimNotu>>;
  sonDogrulama: { zaman: string; ga4: Record<string, number> | null; ga4Hata: string | null; meta: Record<string, number> | null; metaHata: string | null } | null;
  siteKodu: { zaman: string; gorundu: boolean; hata: string | null } | null;
}

export interface KurulumAnlik {
  meta: { externalId: string; ad: string; accountStatus: number | null } | null;
  google: { externalId: string; ad: string } | null;
  sayfa: { ad: string; instagram: string | null } | null;
  /** Workspace'te atanmamış (havuzda) seçilebilecek sayfa sayısı. */
  havuzSayfaSayisi: number;
  googleBaglanti: { id: string; olcumIzni: boolean } | null;
  metaBaglanti: { id: string } | null;
  site: string | null;
  pikselId: string | null;
  satir: KurulumSatiri | null;
  hazirlama: { durum: string; soruSayisi: number } | null;
}

/** Tetik + kimliklerin imzası: değişince etiketler yeniden yazılmalı. */
export function etiketImzasi(a: { ga4: string | null; piksel: string | null; tetik: DonusumTetigi | null; ads: KurulumSatiri['adsDonusumleri'] }): string {
  const ads = (['form', 'telefon', 'whatsapp'] as const).map((t) => a.ads[t]?.gonder?.conversionLabel ?? '-').join(',');
  return JSON.stringify([a.ga4 ?? '', a.piksel ?? '', a.tetik ?? null, ads]);
}

type Hucre = Omit<KurulumAdimi, 'kod' | 'grup'>;

const metaOdemeAdresi = (act: string) => `https://business.facebook.com/billing_hub/accounts/details?asset_id=${act.replace(/^act_/, '')}`;
const googleFaturaAdresi = (no: string) => `https://ads.google.com/aw/billing/summary?__e=${no.replace(/-/g, '')}`;

/*
 * TAMAMLANMIŞ ÖLÇÜM SEÇİMİ DEĞİŞTİRİLEBİLİR (kullanıcı, 2026-10-14: *"bunu
 * ben değiştiremiyorum, değiştirebileceğim yer neresi"*). Konteyner, mülk ve
 * piksel "tamam" olunca eylem `null` dönüyordu ve yanlış seçilen bir
 * konteyneri düzeltmenin panelde hiçbir yolu yoktu. Sunucu yolu zaten üzerine
 * yazıyor ve bağımlıları düşürüyor: konteyner `gtm_yayin` + `site_kodu`yu
 * sıfırlıyor, mülk/piksel etiket imzasını bozup "Ölçüm etiketleri"ni
 * "Güncellenmeli"ye çeviriyor, mülk `ga4_ads_bagli`yı kapatıyor.
 * Hesap ve sayfa BİLEREK yok: hesabı değiştirmek veri taşıma ve atama
 * demek, onun evi Platform bağlantıları'ndaki atama.
 * Konteyner ve mülk listesi ölçüm izni istiyor; izin yoksa düğme çıkmıyor
 * (tıklayınca "seçenekler alınamadı" görmek yerine).
 */
const DEGISTIR = { tur: 'secim', etiket: 'Değiştir' } as const;

export function kurulumAdimlari(a: KurulumAnlik): KurulumAdimi[] {
  const s = a.satir;
  const not = (k: KurulumAdimKodu) => s?.adimNotlari[k];
  const izinVar = a.googleBaglanti?.olcumIzni === true;
  const izinYok: Hucre = { durum: 'atlandi', baslik: 'Önce izin', neden: 'Tag Manager ve Analytics izni verilmeden yapılamıyor.', eylem: null, otomatik: false };
  const imzaSimdi = etiketImzasi({ ga4: s?.ga4OlcumKimligi ?? null, piksel: a.pikselId, tetik: s?.donusumTetigi ?? null, ads: s?.adsDonusumleri ?? {} });

  const h: Record<KurulumAdimKodu, () => Hucre> = {
    meta_hesap: () =>
      a.meta
        ? { durum: 'tamam', baslik: `${a.meta.ad} · ${a.meta.externalId}`, neden: 'Bu projenin Meta reklam hesabı.', eylem: null, otomatik: false }
        : ({
            durum: 'eksik',
            baslik: 'Atanmadı',
            neden: a.metaBaglanti ? 'Mevcut bir hesabı seç ya da Business Manager altında yeni hesap aç.' : `Önce Meta bağlantısı kurulmalı (${PANEL_YERLERI.platformBaglantilari}).`,
            eylem: a.metaBaglanti ? { tur: 'secim', etiket: 'Hesap seç ya da aç' } : null,
            otomatik: false,
          }),
    meta_odeme: () => {
      if (!a.meta) return { durum: 'atlandi', baslik: 'Hesap yok', neden: 'Önce Meta reklam hesabı.', eylem: null, otomatik: false };
      const n = not('meta_odeme');
      if (a.meta.accountStatus !== null && [2, 3, 9, 100, 101].includes(a.meta.accountStatus))
        return { durum: 'kullanicida', baslik: 'Ödeme ya da hesap sorunu', neden: `Meta hesap durumu ${a.meta.accountStatus}; Faturalandırma sayfasından çöz.`, eylem: { tur: 'dis', etiket: 'Meta Faturalandırma', adres: metaOdemeAdresi(a.meta.externalId) }, otomatik: false };
      if (n?.durum === 'tamam') return { durum: 'tamam', baslik: 'Ödeme yöntemi tanımlı', neden: `Kontrol: ${tarih(n.zaman)}.`, eylem: null, otomatik: false };
      return {
        durum: 'kullanicida',
        baslik: n ? 'Ödeme yöntemi yok' : 'Kontrol edilmedi',
        neden: n ? n.mesaj : 'Ödeme yöntemini şirket ekliyor; ekledikten sonra "Kontrol et".',
        eylem: { tur: 'dis', etiket: 'Meta Faturalandırma', adres: metaOdemeAdresi(a.meta.externalId) },
        otomatik: false,
      };
    },
    sayfa: () =>
      a.sayfa
        ? { durum: 'tamam', baslik: a.sayfa.instagram ? `${a.sayfa.ad} · Instagram: ${a.sayfa.instagram}` : a.sayfa.ad, neden: a.sayfa.instagram ? 'Reklamlar bu sayfa ve Instagram hesabıyla yayınlanır.' : 'Instagram hesabı bu sayfaya bağlı değil; Instagram reklamları sayfa adına çıkar.', eylem: null, otomatik: false }
        : {
            durum: 'eksik',
            baslik: 'Atanmadı',
            neden: a.havuzSayfaSayisi > 0 ? `Bağlantıda ${a.havuzSayfaSayisi} sayfa var; bu projeninkini seç.` : `Sayfa API ile açılamıyor: sayfayı Facebook’ta açıp Business Manager’a ekle, sonra ${PANEL_YERLERI.platformBaglantilari}’ndan hesapları yenile.`,
            eylem: a.havuzSayfaSayisi > 0 ? { tur: 'secim', etiket: 'Sayfa seç' } : null,
            // ASLA OTOMATİK: havuzdaki tek sayfa büyük olasılıkla BAŞKA bir
            // müşterinin; atamak reklamı başka markanın sayfasından çıkarırdı
            // (Ajan 4, Ö5 — tahmin etmektense kısıtla).
            otomatik: false,
          },
    google_hesap: () =>
      a.google
        ? { durum: 'tamam', baslik: `${a.google.ad} · ${musteriNo(a.google.externalId)}`, neden: 'Bu projenin Google Ads hesabı.', eylem: null, otomatik: false }
        : ({
            durum: 'eksik',
            baslik: 'Atanmadı',
            neden: a.googleBaglanti ? 'Mevcut hesabı seç, yönetici hesap altında yeni aç ya da şirketin hesabına bağlantı daveti gönder.' : `Önce Google bağlantısı kurulmalı (${PANEL_YERLERI.platformBaglantilari}).`,
            eylem: a.googleBaglanti ? { tur: 'secim', etiket: 'Hesap seç ya da aç' } : null,
            otomatik: false,
          }),
    google_odeme: () => {
      if (!a.google) return { durum: 'atlandi', baslik: 'Hesap yok', neden: 'Önce Google Ads hesabı.', eylem: null, otomatik: false };
      const n = not('google_odeme');
      if (n?.durum === 'tamam') return { durum: 'tamam', baslik: 'Faturalandırma onaylı', neden: `Kontrol: ${tarih(n.zaman)}.`, eylem: null, otomatik: false };
      return {
        durum: 'kullanicida',
        baslik: n ? 'Faturalandırma yok' : 'Kontrol edilmedi',
        neden: n ? n.mesaj : 'Ödeme yöntemini şirket ekliyor; ekledikten sonra "Kontrol et".',
        eylem: { tur: 'dis', etiket: 'Google Ads Faturalandırma', adres: googleFaturaAdresi(a.google.externalId) },
        otomatik: false,
      };
    },
    google_izin: () => {
      if (!a.googleBaglanti) return { durum: 'eksik', baslik: 'Google bağlantısı yok', neden: `Önce Google bağlantısı kurulmalı (${PANEL_YERLERI.platformBaglantilari}).`, eylem: null, otomatik: false };
      return izinVar
        ? { durum: 'tamam', baslik: 'İzin verildi', neden: 'Tag Manager ve Analytics’e yazılabiliyor.', eylem: null, otomatik: false }
        : {
            durum: 'eksik',
            baslik: 'İzin yok',
            neden: 'Google bağlantısının yalnız Google Ads izni var. Konteyner açmak, etiket yayınlamak ve Analytics kurmak için bir kez onay gerekiyor.',
            eylem: { tur: 'izin', etiket: 'Ölçüm izinlerini ver', baglantiId: a.googleBaglanti.id },
            otomatik: false,
          };
    },
    gtm_konteyner: () => {
      if (s?.gtmKimligi) return { durum: 'tamam', baslik: s.gtmKimligi, neden: 'Bu projenin Tag Manager konteyneri.', eylem: izinVar ? DEGISTIR : null, otomatik: false };
      if (!izinVar) return izinYok;
      return { durum: 'eksik', baslik: 'Kurulmadı', neden: 'Sitede erişebildiğimiz bir konteyner varsa o kullanılır, yoksa yeni açılır.', eylem: { tur: 'secim', etiket: 'Konteyner seç ya da aç' }, otomatik: true };
    },
    ga4_mulk: () => {
      if (s?.ga4OlcumKimligi) return { durum: 'tamam', baslik: `${s.ga4OlcumKimligi} · mülk ${s.ga4MulkId ?? '?'}`, neden: 'Bu projenin Analytics mülkü ve web akışı.', eylem: izinVar && a.site ? DEGISTIR : null, otomatik: false };
      if (!izinVar) return izinYok;
      if (!a.site) return { durum: 'eksik', baslik: 'Site adresi yok', neden: `Web akışı site adresi istiyor; ${PANEL_YERLERI.workspaceBilgileri}’nden gir.`, eylem: null, otomatik: false };
      return { durum: 'eksik', baslik: 'Kurulmadı', neden: 'Sitede erişebildiğimiz bir mülk varsa o kullanılır, yoksa yeni açılır.', eylem: { tur: 'secim', etiket: 'Mülk seç ya da aç' }, otomatik: true };
    },
    meta_piksel: () => {
      if (!a.meta) return { durum: 'atlandi', baslik: 'Hesap yok', neden: 'Önce Meta reklam hesabı.', eylem: null, otomatik: false };
      if (a.pikselId) return { durum: 'tamam', baslik: `Piksel ${a.pikselId}`, neden: 'Reklamlar ve etiketler bu pikseli kullanır.', eylem: DEGISTIR, otomatik: false };
      return { durum: 'eksik', baslik: 'Seçilmedi', neden: 'Hesaptaki pikseli seç ya da yeni piksel aç.', eylem: { tur: 'secim', etiket: 'Piksel seç ya da aç' }, otomatik: true };
    },
    ads_donusum: () => {
      if (!a.google) return { durum: 'atlandi', baslik: 'Hesap yok', neden: 'Önce Google Ads hesabı.', eylem: null, otomatik: false };
      if (!s?.donusumTetigi) return { durum: 'eksik', baslik: 'Tetikler seçilmedi', neden: 'Hangi hareketin dönüşüm sayılacağını seç (Ölçüm etiketleri adımında).', eylem: null, otomatik: false };
      const gerek = gerekenDonusumler(s.donusumTetigi);
      // "TAMAM" = her tür ya etiket kimliğiyle hazır ya da BİLEREK atlandı
      // (hesapta birincil işlem var, `kaynak: null`). Açılmış ama kimliği
      // okunamamış işlem tamam DEĞİL: etiketi yazılamıyor (Ajan 4, Ö3).
      const kayitli = gerek.filter((t) => {
        const k = s.adsDonusumleri[t];
        return k && (k.gonder !== null || k.kaynak === null);
      });
      if (gerek.length > 0 && kayitli.length === gerek.length) {
        const notlar = gerek.map((t) => s.adsDonusumleri[t]!.not).join(' ');
        return { durum: 'tamam', baslik: `${gerek.length} dönüşüm`, neden: notlar, eylem: null, otomatik: false };
      }
      return { durum: 'eksik', baslik: 'Kurulmadı', neden: 'Form, telefon ve WhatsApp için birincil dönüşüm işlemi açılır; aynı türde birincil işlem varsa açılmaz. Harcaması olan hesapta yeni birincil hedef teklif stratejisini etkiler, o yüzden orada yalnız bu düğmeyle kurulur.', eylem: { tur: 'otomatik', etiket: 'Dönüşümleri kur' }, otomatik: true };
    },
    ga4_ads_bag: () => {
      if (!a.google || !s?.ga4MulkId) return { durum: 'atlandi', baslik: 'Önce mülk ve hesap', neden: 'Analytics mülkü ve Google Ads hesabı gerekiyor.', eylem: null, otomatik: false };
      if (s.ga4AdsBagli) return { durum: 'tamam', baslik: 'Bağlı', neden: 'Analytics kitleleri ve hedefleri Google Ads’te görünür.', eylem: null, otomatik: false };
      if (!izinVar) return izinYok;
      return { durum: 'eksik', baslik: 'Bağlı değil', neden: 'Analytics mülkü Google Ads hesabına bağlanır, form olayı anahtar etkinlik yapılır.', eylem: { tur: 'otomatik', etiket: 'Bağla' }, otomatik: true };
    },
    gtm_etiket: () => {
      if (!s?.gtmKonteynerYolu) return { durum: 'atlandi', baslik: 'Önce konteyner', neden: 'Etiketler Tag Manager konteynerine yazılıyor.', eylem: null, otomatik: false };
      if (!s.donusumTetigi) return { durum: 'eksik', baslik: 'Tetikler seçilmedi', neden: 'Form gönderilince hangi sayfa açılıyor, telefon ve WhatsApp tıklamaları sayılsın mı?', eylem: { tur: 'girdi', etiket: 'Tetikleri seç' }, otomatik: false };
      if (s.gtmYayin && s.gtmYayin.imza === imzaSimdi)
        return {
          durum: 'tamam',
          baslik: `Yayında · sürüm ${s.gtmYayin.surumId}`,
          neden: [`${s.gtmYayin.etiketler.length} etiket.`, ...s.gtmYayin.atlananlar].join(' '),
          eylem: { tur: 'girdi', etiket: 'Tetikleri değiştir' },
          otomatik: false,
        };
      if (!izinVar) return izinYok;
      return (
        {
          durum: 'eksik',
          baslik: s.gtmYayin ? 'Güncellenmeli' : 'Yayınlanmadı',
          neden: s.gtmYayin ? 'Piksel, mülk, dönüşüm ya da tetik değişti; etiketler yeniden yazılıp yayınlanmalı.' : 'Etiketler yazılıp yayınlanacak.',
          eylem: { tur: 'otomatik', etiket: 'Yaz ve yayınla' },
          otomatik: true,
        }
      );
    },
    site_kodu: () => {
      if (!s?.gtmKimligi) return { durum: 'atlandi', baslik: 'Önce konteyner', neden: 'Siteye eklenecek kod konteynerden geliyor.', eylem: null, otomatik: false };
      if (!a.site) return { durum: 'eksik', baslik: 'Site adresi yok', neden: `${PANEL_YERLERI.workspaceBilgileri}’nden site adresini gir.`, eylem: null, otomatik: false };
      const k = s.siteKodu;
      if (k?.gorundu) return { durum: 'tamam', baslik: `Sitede görüldü`, neden: `${s.gtmKimligi} sitede yükleniyor (kontrol: ${tarih(k.zaman)}). ${CEREZ_ONAYI_NOTU}`, eylem: null, otomatik: false };
      return {
        durum: 'kullanicida',
        baslik: k ? 'Sitede görülmedi' : 'Kontrol edilmedi',
        neden: k?.hata ? `Site okunamadı: ${k.hata}` : `Kodu sitenin <head> ve <body> bölümüne ekle (ya da geliştiriciye gönder), sonra "Kontrol et". ${CEREZ_ONAYI_NOTU}`,
        eylem: { tur: 'otomatik', etiket: 'Kontrol et' },
        otomatik: false,
      };
    },
    dogrulama: () => {
      if (!s?.siteKodu?.gorundu || !s.gtmYayin) return { durum: 'atlandi', baslik: 'Önce kod ve etiketler', neden: 'Doğrulama etiketler yayında ve kod sitede olunca yapılır.', eylem: null, otomatik: false };
      const d = s.sonDogrulama;
      const bekleneler = dogrulamaBeklenenleri({ ga4: Boolean(s.ga4OlcumKimligi), piksel: Boolean(a.pikselId), tetik: s.donusumTetigi });
      if (!d) return { durum: 'kullanicida', baslik: 'Yapılmadı', neden: dogrulamaTalimati(s.donusumTetigi), eylem: { tur: 'otomatik', etiket: 'Kontrol et' }, otomatik: false };
      const sonuc = dogrulamaSonucu(bekleneler, d);
      return {
        durum: sonuc.eksik.length === 0 ? 'tamam' : 'kullanicida',
        baslik: sonuc.eksik.length === 0 ? 'Veriler doğru geliyor' : `${sonuc.gorulen.length}/${bekleneler.length} doğrulandı`,
        neden: sonuc.eksik.length === 0 ? `${sonuc.gorulen.join(', ')} görüldü (${tarih(d.zaman)}). Google Ads dönüşümleri 3-24 saat içinde görünür.` : `Görülmedi: ${sonuc.eksik.join(', ')}. ${dogrulamaTalimati(s.donusumTetigi)}${d.ga4Hata ? ` Analytics: ${d.ga4Hata}` : ''}${d.metaHata ? ` Meta: ${d.metaHata}` : ''}`,
        eylem: { tur: 'otomatik', etiket: 'Yeniden kontrol et' },
        otomatik: false,
      };
    },
    marka: () => {
      const z = a.hazirlama;
      if (!z) return { durum: 'eksik', baslik: 'Hazırlık koşmadı', neden: 'Reklam hesabı atanınca kendiliğinden başlar.', eylem: null, otomatik: false };
      if (z.durum === 'hazir') return { durum: 'tamam', baslik: 'Hazır', neden: 'Marka bilgileri, kategori, bölge ve bütçe hazır.', eylem: null, otomatik: false };
      return { durum: 'eksik', baslik: z.soruSayisi > 0 ? `${z.soruSayisi} soru bekliyor` : 'Eksik var', neden: 'Soruları Reklam varsayılanları adımında cevapla.', eylem: null, otomatik: false };
    },
  };

  return KURULUM_ADIM_KODLARI.map((kod) => {
    const hucre = h[kod]();
    const n = not(kod);
    // SON DENEME DÜŞTÜYSE ADIM KİLİTLENMEZ (Ajan 4, B2): eylemi ve otomatikliği
    // korunur, platformun mesajı nedene yazılır. Eskiden hata hücresi eylemsizdi;
    // not yalnız başarıda temizlendiği için tek bir 5xx adımı KALICI kapatıyordu.
    if (n?.durum === 'hata' && hucre.durum !== 'tamam' && hucre.durum !== 'atlandi') {
      return { kod, grup: KURULUM_ADIM_GRUBU[kod], ...hucre, durum: 'hata' as const, baslik: `Son deneme başarısız (${tarih(n.zaman)})`, neden: `${n.mesaj} · ${hucre.neden}` };
    }
    return { kod, grup: KURULUM_ADIM_GRUBU[kod], ...hucre };
  });
}

export function gerekenDonusumler(t: DonusumTetigi): Array<'form' | 'telefon' | 'whatsapp'> {
  return [...(t.formYolu ? (['form'] as const) : []), ...(t.telefon ? (['telefon'] as const) : []), ...(t.whatsapp ? (['whatsapp'] as const) : [])];
}

export interface Beklenen {
  ad: string;
  kaynak: 'ga4' | 'meta';
  olay: string;
}

/** "Kesin bilgi" için görülmesi gerekenler: sayfa görüntüleme + seçilen her dönüşüm olayı. */
export function dogrulamaBeklenenleri(a: { ga4: boolean; piksel: boolean; tetik: DonusumTetigi | null }): Beklenen[] {
  const b: Beklenen[] = [];
  if (a.ga4) b.push({ ad: 'Analytics sayfa görüntüleme', kaynak: 'ga4', olay: 'page_view' });
  if (a.piksel) b.push({ ad: 'Meta PageView', kaynak: 'meta', olay: 'PageView' });
  if (a.tetik?.formYolu) {
    if (a.ga4) b.push({ ad: 'Analytics form (generate_lead)', kaynak: 'ga4', olay: 'generate_lead' });
    if (a.piksel) b.push({ ad: 'Meta Lead', kaynak: 'meta', olay: 'Lead' });
  }
  return b;
}

export function dogrulamaSonucu(b: readonly Beklenen[], d: NonNullable<KurulumSatiri['sonDogrulama']>): { gorulen: string[]; eksik: string[] } {
  const gorulen: string[] = [];
  const eksik: string[] = [];
  for (const x of b) {
    const kaynak = x.kaynak === 'ga4' ? d.ga4 : d.meta;
    ((kaynak?.[x.olay] ?? 0) > 0 ? gorulen : eksik).push(x.ad);
  }
  return { gorulen, eksik };
}

function dogrulamaTalimati(t: DonusumTetigi | null): string {
  return t?.formYolu
    ? `Siteyi aç, formu bir kez doldur (teşekkür sayfası ${t.formYolu} açılmalı), 1-2 dakika sonra "Kontrol et".`
    : 'Siteyi bir kez aç, 1-2 dakika sonra "Kontrol et".';
}

function musteriNo(no: string): string {
  const d = no.replace(/-/g, '');
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : no;
}

function tarih(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' });
}

export type { KurulumAdimDurumu, KurulumEylemi };
