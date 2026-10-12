import type { LeadStatus } from '../schemas/lead.schema';

/**
 * ═══ LEAD KALİTESİ → PLATFORM AŞAMALARI (Paket E, Ajan 1 · Mimar, 2026-10-12) ═══
 *
 * Gerekçeler `docs/geri-besleme/MIMARI.md` § 0 (Ç-1, Ç-6) ve § 4.
 *
 * YENİ BİR "KALİTE" KOLONU YOK. Potansiyel Müşteriler ekranındaki durum hattı
 * (`LEAD_STATUSES`: Yeni · Arandı · Nitelikli · Kazanıldı · Kaybedildi) zaten
 * bir kalite işareti. Yanına ikinci bir alan koymak, ajansın aynı kişiyi iki
 * yerde işaretlemesi demekti: biri "Kazanıldı", diğeri boş kalır ve Meta'ya
 * HANGİSİNİN gittiği ekrandan anlaşılmaz. Aşama, durumdan TÜRETİLİYOR.
 *
 * `Record<LeadStatus, ...>`: lead durumuna yeni bir değer eklenince derleme
 * kırılsın. Eşlemesi olmayan bir durum Meta'ya hiç gitmeyen bir işaret olurdu
 * ve ekranda hiçbir şey bunu söylemezdi.
 */
export const GERI_BESLEME_ASAMALARI = ['ham_lead', 'ulasildi', 'nitelikli', 'satisa_dondu', 'uygun_degil'] as const;
export type GeriBeslemeAsamasi = (typeof GERI_BESLEME_ASAMALARI)[number];

export const LEAD_DURUMU_ASAMASI: Record<LeadStatus, GeriBeslemeAsamasi> = {
  new: 'ham_lead',
  contacted: 'ulasildi',
  qualified: 'nitelikli',
  won: 'satisa_dondu',
  lost: 'uygun_degil',
};

/**
 * Meta'ya giden `event_name`. BELGE: CRM aşamasının adı SERBEST metin
 * (conversion-leads-integration/payload-specification).
 *
 * BU ADLAR BİR KEZ YAYINA ÇIKTIKTAN SONRA DEĞİŞMEZ. Meta'nın Conversion
 * Leads modeli huniyi olay ADLARIYLA öğreniyor ve reklamveren Events
 * Manager'da optimize edilecek aşamayı bu adlardan seçiyor; ad değişirse
 * eski aşama "veri gelmiyor"a düşer, yeni aşama sıfırdan öğrenir ve hiçbir
 * yerde hata görünmez. Testte kilitli. Türkçe ve ASCII: Events Manager'da
 * ajansın okuyacağı ad bu, boşluk ve aksan Meta'nın ad sınırlarıyla
 * çatışmasın diye yok.
 */
export const META_ASAMA_OLAY_ADI: Record<GeriBeslemeAsamasi, string> = {
  ham_lead: 'ham_lead',
  ulasildi: 'ulasildi',
  nitelikli: 'nitelikli',
  satisa_dondu: 'satisa_dondu',
  uygun_degil: 'uygun_degil',
};

/** Ekranda (rozet, geçmiş) kullanılan sade adlar. */
export const GERI_BESLEME_ASAMA_ADI: Record<GeriBeslemeAsamasi, string> = {
  ham_lead: 'Form dolduruldu',
  ulasildi: 'Ulaşıldı',
  nitelikli: 'İlgili',
  satisa_dondu: 'Müşteri oldu',
  uygun_degil: 'Uygun değil',
};

/**
 * Olumlu huni, sırasıyla. `uygun_degil` hunin DIŞINDA bir dal: "uygun değil"
 * işaretlenen kişi bir önceki aşamaları geçmiş sayılmaz (ulaşılamamış da
 * olabilir), yani dal yalnız ham lead'i ima eder.
 */
export const GERI_BESLEME_HUNI: readonly GeriBeslemeAsamasi[] = ['ham_lead', 'ulasildi', 'nitelikli', 'satisa_dondu'];

/** Bir durumun İMA ETTİĞİ aşamalar (kendisi dahil, hunideki öncekiler). */
export function imaEdilenAsamalar(durum: LeadStatus): GeriBeslemeAsamasi[] {
  const hedef = LEAD_DURUMU_ASAMASI[durum];
  if (hedef === 'uygun_degil') return ['ham_lead', 'uygun_degil'];
  const i = GERI_BESLEME_HUNI.indexOf(hedef);
  return GERI_BESLEME_HUNI.slice(0, i + 1);
}

/** Planlayıcının bir aşama satırı hakkında bilmesi gereken. */
export interface MevcutAsama {
  asama: GeriBeslemeAsamasi;
  /** `olay.ts#GERI_BESLEME_OLAY_DURUMLARI`. Burada dize: döngüsel import yok. */
  durum: string;
}

export interface AsamaPlani {
  /** Hiç satırı olmayan, ima edilen aşamalar: yeni `bekliyor` satırı. */
  olustur: GeriBeslemeAsamasi[];
  /** Henüz gönderilmemiş ama yeni durumun ima ETMEDİĞİ aşamalar: `iptal`. */
  iptal: GeriBeslemeAsamasi[];
  /** Daha önce iptal edilmiş ama yeni durumun yeniden ima ettiği: `bekliyor`a döner. */
  yenidenAc: GeriBeslemeAsamasi[];
}

/** Platforma HENÜZ gitmemiş, geri alınabilecek durumlar. */
const GERI_ALINABILIR = new Set(['bekliyor', 'basarisiz']);

/**
 * ═══ DURUM DEĞİŞİNCE HANGİ OLAYLAR ═══
 *
 * Üç kural, üçü de canlıda pahalı bir hatanın karşılığı:
 *
 * 1. ATLANAN AŞAMA DOLDURULUR. Ajans "Yeni"den doğrudan "Kazanıldı"ya
 *    geçebiliyor. Meta "kişi son aşamaya ulaştıysa önceki aşamalar ondan
 *    önce gönderilmiş olmalı" diyor; yalnız `satisa_dondu` göndermek huniyi
 *    deler ve model ara aşamaları hiç görmeden öğrenmeye çalışır.
 *
 * 2. PLATFORMA GİDEN GERİ ALINMAZ. CAPI'de olay silme yok. Ajans yanlışlıkla
 *    "Kazanıldı"ya basıp geri alırsa ve olay gitmişse, o olay Meta'da kalır.
 *    Bu yüzden kullanıcı işareti `GERI_BESLEME_BEKLEME_DK` bekletiliyor ve o
 *    pencerede geri alınan aşama İPTAL ediliyor (`iptal`, gönderilmeden).
 *
 * 3. AYNI AŞAMA BİR LEAD İÇİN BİR KEZ. Veritabanında `(lead_id, platform,
 *    asama)` tekil; durum ileri-geri oynasa da aynı aşama ikinci kez
 *    gitmiyor. İptal edilmiş bir aşama yeniden ima edilirse satır YENİDEN
 *    AÇILIYOR, ikinci satır açılmıyor.
 */
export function asamaPlani(yeniDurum: LeadStatus, mevcut: readonly MevcutAsama[]): AsamaPlani {
  const ima = new Set(imaEdilenAsamalar(yeniDurum));
  const satir = new Map(mevcut.map((m) => [m.asama, m.durum]));
  const plan: AsamaPlani = { olustur: [], iptal: [], yenidenAc: [] };

  for (const asama of GERI_BESLEME_ASAMALARI) {
    const d = satir.get(asama);
    if (ima.has(asama)) {
      if (d === undefined) plan.olustur.push(asama);
      else if (d === 'iptal') plan.yenidenAc.push(asama);
    } else if (d !== undefined && GERI_ALINABILIR.has(d) && asama !== 'ham_lead') {
      // `ham_lead` hiçbir zaman iptal edilmez: form gerçekten dolduruldu.
      plan.iptal.push(asama);
    }
  }
  return plan;
}

/**
 * Kullanıcı işaretinin platforma gitmeden önce beklediği süre (dakika).
 * Yanlış tıklamayı geri alma penceresi (kural 2). Meta tazeliği "1 saat içi
 * iyi" diyor; 15 dakika o sınırın rahat içinde. `ham_lead` BEKLEMEZ: geri
 * alınacak bir kullanıcı kararı yok.
 */
export const GERI_BESLEME_BEKLEME_DK = 15;

/**
 * Olayın platformdaki zamanı (Unix SANİYE). Meta: aşama olayı lead
 * oluşturma zamanından SONRA olmalı, yoksa "atılabilir" — hata vermeden.
 * Saat kayması ya da elle girilmiş eski bir `submitted_at` yüzünden eşit
 * ya da önce düşen zaman bir saniye ileri itiliyor.
 */
export function asamaOlayZamani(asama: GeriBeslemeAsamasi, p: { leadZamaniMs: number; degisimZamaniMs: number }): number {
  const leadSn = Math.floor(p.leadZamaniMs / 1000);
  if (asama === 'ham_lead') return leadSn;
  const degisimSn = Math.floor(p.degisimZamaniMs / 1000);
  return degisimSn > leadSn ? degisimSn : leadSn + 1;
}
