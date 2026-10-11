import {
  GOOGLE_ISLETME_ADI_EN_COK,
  GOOGLE_KISA_ACIKLAMA,
  googleGorselOraniMi,
  googleGorselSorunu,
  gunlukEsdeger,
  karakterSayisi,
  paraOndaligi,
  type GoogleDerlemeGirdisi,
  type GorselOlcusu,
} from '@advetics/shared';
import { aramaAtomikIstek, aramaOgesiTelefonu, nameStamp } from '../../connections/providers/google-write';
import {
  DEMAND_GEN_GORSEL_KANALLARI,
  DEMAND_GEN_GORSEL_OTOMASYONU,
  demandGenAtomikIstek,
  demandGenGorselAtomikIstek,
  type GoogleGorselKaynagi,
} from '../../connections/providers/google-demandgen';
import { PMAX_OTOMASYONU, pmaxAlanSayilari, pmaxAtomikIstek, type PmaxAlani } from '../../connections/providers/google-pmax';

/**
 * ═══ GOOGLE DERLEYİCİSİ (AdvCampaign rehberi) ═══
 *
 * `GoogleDerlemeGirdisi` (shared, `rehberdenGoogle`) → tek atomik
 * `googleAds:mutate` gövdesi + geri okumada beklenecek değerler.
 *
 * YENİ GÖVDE KURUCUSU YOK. Gövdeler `google-write.ts#aramaAtomikIstek` ve
 * `google-demandgen.ts#demandGenAtomikIstek`ten; burada yalnız rehberin
 * girdisi o kuruculara çevriliyor. "Aynı şeyi üreten ikinci fonksiyon doğduğu
 * anda ayrışır" (CLAUDE.md, Meta hedefleme dersi).
 *
 * PROVA VE YAYIN AYNI FONKSİYONDAN: tek fark `validateOnly`. Ayrı bir prova
 * gövdesi, provanın yayının sınamadığı bir şeyi sınaması demek olurdu.
 *
 * SAF: saat dışarıdan (`simdi`), logo dışarıdan (servis önbellekten ya da
 * arşivden okuyor). Platform çağrısı yok.
 */

/** Derlenmiş gövdenin sürümü; prova ve yayın buna bağlanıyor (`prova.derleyici_surumu`). */
// Telefon ulaşması (CallAsset) eklendiğinde sürüm ARTIRILMADI: site
// gövdesi bayt bayt aynı kaldı ve telefon gövdesi daha önce hiç 'gecti'
// provası alamazdı (derleyici yerelde reddediyordu). Artırmak bekleyen bütün
// site provalarını boşuna geçersiz kılardı.
export const GOOGLE_DERLEYICI_SURUMU = 'g-1.0.0';

/**
 * Google yayınında `yayin.atif_standardi`. Karar tablosunun "Ölçüm"
 * satırı "Google'ın saydığı" diyor: Google'ın kendi dönüşüm penceresini
 * kullanıyoruz, Meta'nın ajans standardını (tik7_gor1 …) değil. Kolon
 * NOT NULL ve CHECK'siz (MIMARI-REHBER § 2.2).
 */
export const GOOGLE_ATIF = 'platform';

export type GoogleLogo = { resource: string } | { yeniGorsel: { name: string; bytes: Buffer } };

export interface GoogleDerlemeBaglami {
  /** Yayın (ya da prova) kimliği: kampanya adına kısa hâli girer, tekillik araması onu arar. */
  kimlik: string;
  workspaceKisaAdi: string;
  amacEkranAdi: string;
  simdi: Date;
  validateOnly: boolean;
  /** Talep Yaratma için zorunlu; Arama'da kullanılmaz. */
  logo: GoogleLogo | null;
  youtubeVideoBasligi: string | null;
  /**
   * GÖRSEL KURGULARI (Dalga 3): her görselin Google kaynağı (hesapta kayıtlı
   * kaynak adı ya da yüklenecek bayt) ve ÖLÇÜSÜ. Servis veritabanından
   * okuyor; derleyici saf kalıyor. Girdideki bir görsel burada yoksa RET
   * (sessizce eksik görselle kurmak yok).
   */
  gorselKaynaklari?: ReadonlyMap<string, { kaynak: GoogleGorselKaynagi; olcu: GorselOlcusu }>;
}

/** Talep Yaratma görsel reklamının geri okumada beklenen hâli. */
export interface GoogleGorselReklamBeklentisi {
  reklamSayisi: number;
  yatay: number;
  kare: number;
  dik45: number;
  logo: number;
  kanallar: Record<keyof typeof DEMAND_GEN_GORSEL_KANALLARI, boolean>;
  otomasyon: Record<string, string>;
}

/** Maks. Performans varlık grubunun geri okumada beklenen hâli. */
export interface GoogleVarlikGrubuBeklentisi {
  grupSayisi: number;
  adresler: string[];
  alanlar: Record<PmaxAlani, number>;
  /** Kampanya düzeyinde marka bağları (marka kuralları açık). */
  marka: { BUSINESS_NAME: number; LOGO: number };
  markaKurallari: boolean;
  otomasyon: Record<string, string>;
}

/** Geri okumada beklenen değerler — `google-geri-okuma.ts` bunlarla karşılaştırır. */
export interface GoogleBeklenen {
  kanal: 'SEARCH' | 'DEMAND_GEN' | 'PERFORMANCE_MAX';
  kampanyaAdi: string;
  durum: 'PAUSED';
  gunlukButceMicros: string;
  /** Arama: dört ağ bayrağı; Talep Yaratma: null (ağ bayrağı yok, kanallar grupta). */
  aglar: { googleSearch: boolean; searchNetwork: boolean; contentNetwork: boolean; partnerSearchNetwork: boolean } | null;
  konumTuru: 'PRESENCE';
  konumSayisi: number;
  /** Arama: öbek eşleme kelime sayısı; Talep Yaratma: null. */
  anahtarKelimeSayisi: number | null;
  negatifSayisi: number | null;
  /**
   * Arama öğesi (telefon ulaşması): kampanyaya CALL olarak bağlı TEK öğe ve
   * numarası. Yoksa null. Eski yayın satırlarının `beklenen_yanki` JSON'unda
   * bu alan HİÇ yok (undefined); okuyan taraf onu null sayıyor.
   */
  aramaOgesi?: { countryCode: string; phoneNumber: string } | null;
  /**
   * Dalga 3 (yalnız yeni kurgularda yazılır; eski satırlarda yok = bakılmaz):
   * teklif stratejisi (`campaign.bidding_strategy_type`), Talep Yaratma görsel
   * reklamı ve Maks. Performans varlık grubu.
   */
  teklif?: 'TARGET_SPEND' | 'MAXIMIZE_CONVERSIONS';
  gorselReklam?: GoogleGorselReklamBeklentisi;
  varlikGrubu?: GoogleVarlikGrubuBeklentisi;
}

export type GoogleDerleme =
  | {
      tur: 'govde';
      kurgu: GoogleDerlemeGirdisi['kurgu'];
      govde: { mutateOperations: Array<Record<string, unknown>>; partialFailure: false; validateOnly: boolean };
      /**
       * `reklam: null` = Maks. Performans (reklam nesnesi yok, `reklamGrubu`
       * varlık grubu). `gorseller`: bu istekte YENİ yüklenen görseller
       * (yayın sonrası `asset_platform_refs` önbelleğine yazılır).
       */
      sira: {
        kampanya: number;
        reklamGrubu: number;
        reklam: number | null;
        logo: number | null;
        aramaOgesi: number | null;
        gorseller?: Array<{ varlikId: string; sira: number }>;
      };
      beklenen: GoogleBeklenen;
      atif: typeof GOOGLE_ATIF;
      /** Kullanıcıya söylenecek kısıt (sessiz değişiklik yok): ör. yaş kovası yuvarlandı. */
      notlar: string[];
    }
  | { tur: 'ret'; retler: Array<{ kod: string; mesaj: string }> };

/**
 * Google'ın yaş kovaları 18-24, 25-34 …; "en düşük yaş 21" diye bir kova
 * YOK. Tahmin etmektense KISITLA: kovanın altına düşen yaş bir üst kovaya
 * yuvarlanır (25), yani reklam en düşük yaşın altındakine HİÇ çıkmaz; bedeli
 * 21-24 arasının dışarıda kalması ve bu notla söyleniyor.
 */
export function googleYasKovalari(enDusukYas: number): { kovalar: string[]; not: string | null } {
  if (enDusukYas <= 18) return { kovalar: [], not: null };
  const tum = ['AGE_RANGE_25_34', 'AGE_RANGE_35_44', 'AGE_RANGE_45_54', 'AGE_RANGE_55_64', 'AGE_RANGE_65_UP'];
  return {
    kovalar: tum,
    not: enDusukYas < 25 ? `Google'da yaş ${enDusukYas}'ten değil 25'ten başlıyor (Google'ın yaş grupları 18-24, 25-34 …).` : null,
  };
}

/** Hesabın saat diliminde bugün, `YYYY-MM-DD`. */
function bugun(simdi: Date, saatDilimi: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: saatDilimi, year: 'numeric', month: '2-digit', day: '2-digit' }).format(simdi);
}

export function derleGoogle(g: GoogleDerlemeGirdisi, b: GoogleDerlemeBaglami): GoogleDerleme {
  const retler: Array<{ kod: string; mesaj: string }> = [];
  const notlar: string[] = [];

  // ── Bütçe: Google'a GÜNLÜK tutar gidiyor ─────────────────────────────────
  // Toplam bütçe dönem gün sayısına bölünüyor. Google'ın "kampanya toplam
  // bütçesi" bu kurgularda API'den ÖLÇÜLMEDİ; bilinen yola düşüp kısıtı
  // söylüyoruz (CLAUDE.md "tahmin etmektense kısıtla").
  const gunluk = gunlukEsdeger(g.butce.micros, g.butce.tip, g.takvim);
  if (gunluk === null) retler.push({ kod: 'BTC-02', mesaj: 'Toplam bütçede bitiş tarihi gerekli.' });
  // Para biriminin en küçük biriminin katı olmalı: Google "minimum para
  // birimi katı değil" diye reddediyor. Aşağı yuvarlanıyor; artan kuruş
  // harcanmıyor, fazlası harcanmıyor.
  const birim = 10n ** BigInt(6 - paraOndaligi(g.paraBirimi));
  const gunlukMicros = gunluk === null ? 0n : gunluk - (gunluk % birim);
  if (gunluk !== null && gunlukMicros <= 0n) retler.push({ kod: 'BTC-01', mesaj: "Google'a düşen günlük tutar sıfır." });
  if (g.butce.tip === 'toplam') notlar.push("Google'da toplam bütçe günlük tutara bölündü; Google bir günde günlük tutarın iki katına kadar harcayabilir, dönem toplamını aşmaz.");

  // ── Takvim ───────────────────────────────────────────────────────────────
  const bu = bugun(b.simdi, g.saatDilimi);
  if (g.takvim.baslangic < bu) retler.push({ kod: 'TKV-GECMIS', mesaj: 'Başlangıç tarihi geçmişte kaldı; yeni bir tarih seç.' });
  if (g.takvim.bitis !== null && g.takvim.bitis < bu) retler.push({ kod: 'TKV-GECMIS', mesaj: 'Bitiş tarihi geçmişte kaldı.' });
  // Bugün başlıyorsa tarih GÖNDERİLMİYOR: "bugün 00:00" geçmişte kalır ve
  // Google reddeder; tarih yokken kampanya açıldığı anda başlar.
  const startDate = g.takvim.baslangic > bu ? g.takvim.baslangic : undefined;

  if (g.konumlar.length === 0) retler.push({ kod: 'KNM-01', mesaj: 'Konum yok: kampanya bütün ülkelere açılırdı.' });
  if (g.basliklar.length === 0) retler.push({ kod: 'METIN-BASLIK', mesaj: 'Başlık yok.' });

  const kisa = b.kimlik.replace(/-/g, '').slice(0, 8);
  const ad = `${b.workspaceKisaAdi.slice(0, 40)} · ${b.amacEkranAdi} · adv-${kisa}`;
  const stamp = nameStamp(b.simdi);

  if (g.kurgu === 'ARAMA') {
    if (g.ulasma === 'form') {
      // Form öğesi (LeadFormAsset) KENDİ İÇERİĞİNİ istiyor: form başlığı,
      // işletme adı, sorulacak alanlar, gizlilik politikası adresi, gönderim
      // sonrası metin. Rehberde bunların Google için bir kaynağı yok (Meta
      // formu Meta'da duruyor, Google'a taşınmıyor). Sessizce yalnız site
      // reklamı kurmak, kullanıcının istediği "form doldursunlar"ı hiç
      // kurmamak demekti; içeriği uydurmak ise müşteri adına söz vermek.
      retler.push({
        kod: 'G-KURGU-KAPALI',
        mesaj: "Google'da form reklamı henüz kurulamıyor: Google formunun içeriği (sorular, gizlilik adresi) için bir kaynak yok.",
      });
    } else if (g.ulasma !== 'site' && g.ulasma !== 'telefon') {
      // Arama kurgusunda ulaşma null ya da bilinmeyen bir değer: tür
      // sisteminin dışından gelmiş bir girdi. Tahminle site reklamı KURULMAZ.
      retler.push({ kod: 'G-KURGU-KAPALI', mesaj: `Google Arama'da bu ulaşma türü kurulamıyor: ${String(g.ulasma)}` });
    }
    let tel: ReturnType<typeof aramaOgesiTelefonu> | null = null;
    if (g.ulasma === 'telefon') {
      // Numara derleyicide bir kez daha çözülüyor: eksikler +90 diyor ama
      // E.164 deseni daha geniş; bilinmeyen önek burada ret oluyor (kurucu
      // da patlardı, ama ret kullanıcıya CÜMLE olarak dönüyor, istisna değil).
      if (!g.telefon) retler.push({ kod: 'G-TELEFON', mesaj: 'Telefon numarası yok: arama reklamı numarasız kurulamaz.' });
      else {
        try {
          tel = aramaOgesiTelefonu(g.telefon);
        } catch (e) {
          retler.push({ kod: 'G-TELEFON', mesaj: (e as Error).message });
        }
      }
    }
    if (g.anahtarKelimeler.length === 0) retler.push({ kod: 'G-KELIME', mesaj: 'Anahtar kelime yok: arama kampanyası hiç gösterilmezdi.' });
    if (g.aciklamalar.length < 2) retler.push({ kod: 'G-ACIKLAMA-SAYI', mesaj: 'Google için en az 2 açıklama gerekiyor.' });
    if (g.basliklar.length < 3) retler.push({ kod: 'G-BASLIK-SAYI', mesaj: 'Google için en az 3 başlık gerekiyor.' });
    if (retler.length) return { tur: 'ret', retler };
    const { govde, sira } = aramaAtomikIstek({
      customerId: g.musteriId,
      name: ad,
      stamp,
      gunlukButceMicros: gunlukMicros,
      ...(startDate ? { startDate } : {}),
      endDate: g.takvim.bitis,
      teklif: g.teklif === 'MAKS_DONUSUM' ? 'maximizeConversions' : 'targetSpend',
      konumlar: g.konumlar,
      dil: g.dil,
      negatifler: g.negatifler,
      anahtarKelimeler: g.anahtarKelimeler,
      finalUrl: g.hedefAdres,
      basliklar: g.basliklar,
      aciklamalar: g.aciklamalar,
      telefon: tel ? g.telefon : null,
      validateOnly: b.validateOnly,
    });
    if (tel) {
      // Sessiz kalmasın: iki kısıt da kullanıcının göreceği yerde.
      notlar.push(
        "Google arama öğesini numara doğrulanınca gösterir: numara sitende yazı olarak (görsel değil) görünmeli; Google'ın algılaması 3 güne kadar sürebilir.",
      );
      notlar.push('Telefon her saatte görünür: açık olduğun saatler henüz sorulmuyor.');
    }
    return {
      tur: 'govde',
      kurgu: g.kurgu,
      govde,
      sira: { ...sira, logo: null },
      beklenen: {
        kanal: 'SEARCH',
        kampanyaAdi: kampanyaAdi(govde.mutateOperations[sira.kampanya]),
        durum: 'PAUSED',
        gunlukButceMicros: gunlukMicros.toString(),
        aglar: { googleSearch: true, searchNetwork: false, contentNetwork: false, partnerSearchNetwork: false },
        konumTuru: 'PRESENCE',
        konumSayisi: g.konumlar.length,
        anahtarKelimeSayisi: g.anahtarKelimeler.length,
        negatifSayisi: g.negatifler.length,
        aramaOgesi: tel ? { countryCode: tel.countryCode, phoneNumber: tel.phoneNumber } : null,
      },
      atif: GOOGLE_ATIF,
      notlar,
    };
  }

  if (g.kurgu === 'TALEP_YARATMA_VIDEO') {
    if (!g.youtubeVideoId) retler.push({ kod: 'G-VIDEO', mesaj: "YouTube'dan video seç." });
    if (!g.isletmeAdi) retler.push({ kod: 'G-LOGO', mesaj: "Marka Merkezi'nde işletme adı yok." });
    if (!b.logo) retler.push({ kod: 'G-LOGO', mesaj: "Marka Merkezi'nde logo yok." });
    if (g.aciklamalar.length === 0) retler.push({ kod: 'G-ACIKLAMA-SAYI', mesaj: 'YouTube reklamı için en az 1 açıklama gerekiyor.' });
    if (retler.length || !g.youtubeVideoId || !g.isletmeAdi || !b.logo) return { tur: 'ret', retler };
    const yas = googleYasKovalari(g.enDusukYas);
    if (yas.not) notlar.push(yas.not);
    const { govde, sira } = demandGenAtomikIstek({
      customerId: g.musteriId,
      name: ad,
      stamp,
      dailyBudgetMicros: gunlukMicros,
      endDate: g.takvim.bitis,
      ...(startDate ? { startDate } : {}),
      yalnizBulunanlar: true,
      // DURAKLATILMIŞ KURULUR: rehberin üç adımı (kur → geri oku → aç) Meta
      // motoruyla aynı. Atomik istek yarım hâl bırakmıyor ama geri okuma
      // "kurulan şey istenen mi" sorusunu cevaplıyor ve o soru açmadan önce.
      acilis: 'PAUSED',
      konumlar: g.konumlar,
      yaslar: yas.kovalar,
      videoId: g.youtubeVideoId,
      videoTitle: b.youtubeVideoBasligi ?? ad,
      logo: b.logo,
      businessName: g.isletmeAdi,
      finalUrl: g.hedefAdres,
      // Talep Yaratma video reklamı: başlık ≤ 40, uzun başlık ve açıklama
      // ≤ 90 (rehber başlığı zaten ≤ 30, açıklaması ≤ 90). Uzun başlık
      // açıklamalardan: başka bir metin UYDURULMUYOR.
      headlines: g.basliklar.slice(0, 5),
      longHeadlines: g.aciklamalar.slice(0, 5),
      descriptions: g.aciklamalar.slice(0, 5),
      validateOnly: b.validateOnly,
    });
    return {
      tur: 'govde',
      kurgu: g.kurgu,
      govde,
      sira: { ...sira, aramaOgesi: null },
      beklenen: {
        kanal: 'DEMAND_GEN',
        kampanyaAdi: kampanyaAdi(govde.mutateOperations[sira.kampanya]),
        durum: 'PAUSED',
        gunlukButceMicros: gunlukMicros.toString(),
        aglar: null,
        konumTuru: 'PRESENCE',
        konumSayisi: g.konumlar.length,
        anahtarKelimeSayisi: null,
        negatifSayisi: null,
        aramaOgesi: null,
      },
      atif: GOOGLE_ATIF,
      notlar,
    };
  }

  if (g.kurgu === 'TALEP_YARATMA_GORSEL' || g.kurgu === 'MAKS_PERFORMANS') {
    // ── Ortak: marka, görseller ─────────────────────────────────────────
    if (!g.isletmeAdi) retler.push({ kod: 'G-LOGO', mesaj: "Marka Merkezi'nde işletme adı yok." });
    else if (karakterSayisi(g.isletmeAdi) > GOOGLE_ISLETME_ADI_EN_COK) {
      // Kırpmak yok: yarım kalan ad markanın adı değil.
      retler.push({ kod: 'G-ISLETME-ADI', mesaj: `Google'da işletme adı en çok ${GOOGLE_ISLETME_ADI_EN_COK} karakter; Marka Merkezi'ndeki marka adını kısalt.` });
    }
    if (!b.logo) retler.push({ kod: 'G-LOGO', mesaj: "Marka Merkezi'nde logo yok." });
    const gorseller = gorselleriCoz(g, b, retler, notlar);
    const say = (o: 'yatay' | 'kare' | 'dik45') => gorseller.filter((x) => x.oran === o).length;
    if (g.kurgu === 'TALEP_YARATMA_GORSEL') {
      if (say('yatay') + say('kare') === 0) retler.push({ kod: 'G-GORSEL-YOK', mesaj: 'Google görsel reklamı için en az bir yatay (1.91:1) ya da kare (1:1) görsel gerekli.' });
      if (g.aciklamalar.length === 0) retler.push({ kod: 'G-ACIKLAMA-SAYI', mesaj: 'Google görsel reklamı için en az 1 açıklama gerekiyor.' });
      if (retler.length || !g.isletmeAdi || !b.logo) return { tur: 'ret', retler };
      const yas = googleYasKovalari(g.enDusukYas);
      if (yas.not) notlar.push(yas.not);
      const { govde, sira } = demandGenGorselAtomikIstek({
        customerId: g.musteriId,
        name: ad,
        stamp,
        dailyBudgetMicros: gunlukMicros,
        endDate: g.takvim.bitis,
        ...(startDate ? { startDate } : {}),
        acilis: 'PAUSED',
        konumlar: g.konumlar,
        yaslar: yas.kovalar,
        logo: b.logo,
        gorseller,
        businessName: g.isletmeAdi,
        finalUrl: g.hedefAdres,
        // En çok 5 başlık / 5 açıklama (v25); rehber başlığı zaten ≤ 30.
        headlines: g.basliklar.slice(0, 5),
        descriptions: g.aciklamalar.slice(0, 5),
        validateOnly: b.validateOnly,
      });
      if (g.basliklar.length > 5) notlar.push(`Google görsel reklamı en çok 5 başlık alıyor; ilk 5 başlığın gitti (${g.basliklar.length} yazdın).`);
      return {
        tur: 'govde',
        kurgu: g.kurgu,
        govde,
        sira: { ...sira, aramaOgesi: null },
        beklenen: {
          kanal: 'DEMAND_GEN',
          kampanyaAdi: kampanyaAdi(govde.mutateOperations[sira.kampanya]),
          durum: 'PAUSED',
          gunlukButceMicros: gunlukMicros.toString(),
          aglar: null,
          konumTuru: 'PRESENCE',
          konumSayisi: g.konumlar.length,
          anahtarKelimeSayisi: null,
          negatifSayisi: null,
          aramaOgesi: null,
          teklif: 'TARGET_SPEND',
          gorselReklam: {
            reklamSayisi: 1,
            yatay: say('yatay'),
            kare: say('kare'),
            dik45: say('dik45'),
            logo: 1,
            kanallar: { ...DEMAND_GEN_GORSEL_KANALLARI },
            otomasyon: Object.fromEntries(DEMAND_GEN_GORSEL_OTOMASYONU.map((x) => [x.assetAutomationType, x.assetAutomationStatus])),
          },
        },
        atif: GOOGLE_ATIF,
        notlar,
      };
    }

    // ── MAKS_PERFORMANS ─────────────────────────────────────────────────
    // Teklif girdide dönüşüm olmalı (`googleTeklifi`); değilse girdi başka
    // bir kuraldan gelmiş demektir ve tıklama teklifiyle Maks. Performans
    // KURULAMAZ (Google reddeder) — burada cümleyle durur.
    if (g.teklif !== 'MAKS_DONUSUM') retler.push({ kod: 'G-DONUSUM', mesaj: "Maks. Performans yalnız dönüşüm teklifiyle kurulur; Google Ads'te satın alma dönüşümü etkin olmalı." });
    if (g.enDusukYas !== 18) retler.push({ kod: 'G-PMAX-YAS', mesaj: "Maks. Performans'ta yaş sınırı kurulmuyor; en düşük yaşı 18 yap." });
    if (say('yatay') === 0) retler.push({ kod: 'G-GORSEL-YATAY', mesaj: 'Maks. Performans için en az bir yatay (1.91:1) görsel gerekli.' });
    if (say('kare') === 0) retler.push({ kod: 'G-GORSEL-KARE', mesaj: 'Maks. Performans için en az bir kare (1:1) görsel gerekli.' });
    const uzun = g.uzunBasliklar ?? [];
    if (uzun.length === 0) retler.push({ kod: 'G-UZUN-BASLIK', mesaj: 'Maks. Performans uzun başlık istiyor: ana metni 90 karaktere indir ya da üçüncü bir açıklama ekle.' });
    if (g.basliklar.length < 3) retler.push({ kod: 'G-BASLIK-SAYI', mesaj: 'Maks. Performans için en az 3 başlık gerekiyor.' });
    if (g.aciklamalar.length < 2) retler.push({ kod: 'G-ACIKLAMA-SAYI', mesaj: 'Maks. Performans için en az 2 açıklama gerekiyor.' });
    else if (!g.aciklamalar.some((x) => karakterSayisi(x) <= GOOGLE_KISA_ACIKLAMA)) {
      retler.push({ kod: 'G-KISA-ACIKLAMA', mesaj: `Maks. Performans için en az bir açıklama ${GOOGLE_KISA_ACIKLAMA} karakteri geçmemeli.` });
    }
    if (retler.length || !g.isletmeAdi || !b.logo) return { tur: 'ret', retler };
    const pIstek = {
      basliklar: g.basliklar.slice(0, 15),
      uzunBasliklar: uzun.slice(0, 5),
      aciklamalar: g.aciklamalar.slice(0, 5),
      gorseller,
      youtubeVideo: g.youtubeVideoId ? { id: g.youtubeVideoId, baslik: b.youtubeVideoBasligi ?? ad } : null,
    };
    const { govde, sira } = pmaxAtomikIstek({
      customerId: g.musteriId,
      name: ad,
      stamp,
      dailyBudgetMicros: gunlukMicros,
      endDate: g.takvim.bitis,
      ...(startDate ? { startDate } : {}),
      acilis: 'PAUSED',
      konumlar: g.konumlar,
      dil: g.dil,
      finalUrl: g.hedefAdres,
      businessName: g.isletmeAdi,
      logo: b.logo,
      ...pIstek,
      validateOnly: b.validateOnly,
    });
    if (!pIstek.youtubeVideo) notlar.push("YouTube videosu seçmedin: Google görsellerinden kendi videosunu üretip YouTube'da gösterebilir.");
    notlar.push('Maks. Performans, Google hesabındaki bütün birincil dönüşümlerden öğrenir; yalnız satın almadan değil.');
    return {
      tur: 'govde',
      kurgu: g.kurgu,
      govde,
      sira: { ...sira, aramaOgesi: null },
      beklenen: {
        kanal: 'PERFORMANCE_MAX',
        kampanyaAdi: kampanyaAdi(govde.mutateOperations[sira.kampanya]),
        durum: 'PAUSED',
        gunlukButceMicros: gunlukMicros.toString(),
        aglar: null,
        konumTuru: 'PRESENCE',
        konumSayisi: g.konumlar.length,
        anahtarKelimeSayisi: null,
        negatifSayisi: null,
        aramaOgesi: null,
        teklif: 'MAXIMIZE_CONVERSIONS',
        varlikGrubu: {
          grupSayisi: 1,
          adresler: [g.hedefAdres],
          alanlar: pmaxAlanSayilari(pIstek),
          marka: { BUSINESS_NAME: 1, LOGO: 1 },
          markaKurallari: true,
          otomasyon: Object.fromEntries(PMAX_OTOMASYONU.map((x) => [x.assetAutomationType, x.assetAutomationStatus])),
        },
      },
      atif: GOOGLE_ATIF,
      notlar,
    };
  }

  // Tür sisteminin dışından gelen bir kurgu: SESLİ ret.
  return { tur: 'ret', retler: [{ kod: 'G-KURGU-KAPALI', mesaj: `Google kurgusu henüz derlenmiyor: ${String((g as { kurgu: unknown }).kurgu)}` }] };
}

/**
 * Girdinin görsellerini Google'a gidecek hâle çevirir: 9:16 NOTLA dışarıda
 * (Google'da alanı ölçülmedi / yok), kaynağı ya da ölçüsü bilinmeyen RET,
 * Google'ın ±%1 oran ve en az boyut kuralına uymayan RET (`google-gorsel.ts`
 * — eksik listesiyle AYNI fonksiyon).
 */
function gorselleriCoz(
  g: GoogleDerlemeGirdisi,
  b: GoogleDerlemeBaglami,
  retler: Array<{ kod: string; mesaj: string }>,
  notlar: string[],
): Array<{ varlikId: string; oran: 'yatay' | 'kare' | 'dik45'; kaynak: GoogleGorselKaynagi }> {
  const cikti: Array<{ varlikId: string; oran: 'yatay' | 'kare' | 'dik45'; kaynak: GoogleGorselKaynagi }> = [];
  let dikey = 0;
  for (const x of g.gorseller ?? []) {
    if (!googleGorselOraniMi(x.oran)) {
      dikey++;
      continue;
    }
    const k = b.gorselKaynaklari?.get(x.varlikId);
    if (!k) {
      retler.push({ kod: 'G-GORSEL-KAYNAK', mesaj: 'Bir görsel arşivde bulunamadı; görseli yeniden ekle.' });
      continue;
    }
    const sorun = googleGorselSorunu(x.oran, k.olcu);
    if (sorun) {
      retler.push({ kod: 'G-GORSEL-OLCU', mesaj: `${sorun}.` });
      continue;
    }
    cikti.push({ varlikId: x.varlikId, oran: x.oran, kaynak: k.kaynak });
  }
  if (dikey) notlar.push(`${dikey} dikey (9:16) görsel Google'a gönderilmedi.`);
  return cikti;
}

function kampanyaAdi(op: Record<string, unknown> | undefined): string {
  const c = (op?.campaignOperation as { create?: { name?: unknown } } | undefined)?.create;
  if (typeof c?.name !== 'string') throw new Error('Derlenmiş gövdede kampanya adı yok.');
  return c.name;
}
