import { gunlukEsdeger, paraOndaligi, type GoogleDerlemeGirdisi } from '@advetics/shared';
import { aramaAtomikIstek, nameStamp } from '../../connections/providers/google-write';
import { demandGenAtomikIstek } from '../../connections/providers/google-demandgen';

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
}

/** Geri okumada beklenen değerler — `google-geri-okuma.ts` bunlarla karşılaştırır. */
export interface GoogleBeklenen {
  kanal: 'SEARCH' | 'DEMAND_GEN';
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
}

export type GoogleDerleme =
  | {
      tur: 'govde';
      kurgu: GoogleDerlemeGirdisi['kurgu'];
      govde: { mutateOperations: Array<Record<string, unknown>>; partialFailure: false; validateOnly: boolean };
      sira: { kampanya: number; reklamGrubu: number; reklam: number; logo: number | null };
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
    if (g.ulasma !== 'site') {
      // Form uzantısı (LeadFormAsset) ve arama uzantısı (CallAsset) Dalga 2:
      // kurucuları yazılmadı. Sessizce yalnız site reklamı kurmak, kullanıcının
      // istediği "form doldursunlar"ı hiç kurmamak demekti.
      retler.push({ kod: 'G-KURGU-KAPALI', mesaj: `Google'da ${g.ulasma === 'form' ? 'form' : 'arama'} uzantılı reklam henüz kurulamıyor.` });
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
      validateOnly: b.validateOnly,
    });
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
      sira,
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
      },
      atif: GOOGLE_ATIF,
      notlar,
    };
  }

  // TALEP_YARATMA_GORSEL (Erişim) ve MAKS_PERFORMANS (Satış) Dalga 3:
  // sözleşmede var, derleyicide yok. Açılış tablosu onları zaten kapalı
  // tutuyor; buraya gelmeleri bir programlama hatası ve SESLİ reddediliyor.
  return { tur: 'ret', retler: [{ kod: 'G-KURGU-KAPALI', mesaj: `Google kurgusu henüz derlenmiyor: ${g.kurgu}` }] };
}

function kampanyaAdi(op: Record<string, unknown> | undefined): string {
  const c = (op?.campaignOperation as { create?: { name?: unknown } } | undefined)?.create;
  if (typeof c?.name !== 'string') throw new Error('Derlenmiş gövdede kampanya adı yok.');
  return c.name;
}
