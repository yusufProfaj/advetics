import { z } from 'zod';
import { ALICI_UST_SINIRI, gecerliAdres } from '../alici-listesi';
import type { TeslimDurumu } from './durum';

/*
 * `URL` Node'da da tarayıcıda da global (WHATWG), ama shared `lib: ES2023`
 * ile derleniyor ve DOM tipi yok. Kullanılan alanlar kadar yerel bildirim;
 * dışa aktarılmıyor. Adresi elle düzenli ifadeyle ayrıştırmak, tam da
 * beyaz listeyi atlatan biçimleri (kullanıcı adı, IDN, ters bölü) kaçırırdı.
 */
interface AdresParcalari {
  protocol: string;
  username: string;
  password: string;
  port: string;
  hostname: string;
  pathname: string;
  toString(): string;
}
declare const URL: new (girdi: string) => AdresParcalari;

/**
 * ═══ BİLDİRİM KANALLARI (B-2) ═══
 *
 * Workspace başına kanal listesi. Sinyaller ve kural motorunun `notify`
 * eylemi AYNI kanallara gider; ikinci bir gönderim yolu doğduğu anda
 * ayrışır ("özet geliyor ama anlık uyarı gelmiyor", OdemeMailiGonderici
 * dersi). Gerekçeler `docs/sinyal/MIMARI.md` § 7-8.
 */

/** KAPALI LİSTE. WhatsApp bilinçli olarak YOK: `KANAL_DISARIDA`. */
export const KANAL_TURLERI = ['eposta', 'slack', 'teams'] as const;
export type KanalTuru = (typeof KANAL_TURLERI)[number];

export const KANAL_TURU_ADI: Record<KanalTuru, string> = {
  eposta: 'E-posta',
  slack: 'Slack',
  teams: 'Microsoft Teams',
};

/** Ekranda gri ve seçilemez görünür; neden yazılı. Sessizce yok sayılmaz. */
export const KANAL_DISARIDA = [
  {
    kod: 'whatsapp',
    ad: 'WhatsApp',
    neden: 'İlk sürümde yok. WhatsApp Business API ayrı onay, onaylı mesaj şablonu ve mesaj başı ücret istiyor.',
  },
] as const;

/**
 * Kanala giden olay türleri. Kanal hangilerini alacağını seçer
 * (`olaylar`); kural ayrıca hangi kanala gideceğini seçer (`kanalIdleri`,
 * rule.schema). İkisi de doğruysa gider.
 *
 * - `sinyal`: yeni açılan ya da yeniden açılan sinyaller (günlük özet).
 * - `kural`: `notify` eylemli kuralın eşleşmesi VE canlı kuralın
 *   platformda BAŞARISIZ olan eylemi (anında). İkincisi sessiz hata
 *   kapısı: bugün başarısız kural eylemi yalnız kural geçmişinde duruyor.
 */
export const BILDIRIM_OLAYLARI = ['sinyal', 'kural'] as const;
export type BildirimOlayi = (typeof BILDIRIM_OLAYLARI)[number];

export const BILDIRIM_OLAYI_ADI: Record<BildirimOlayi, string> = {
  sinyal: 'Sinyaller (her sabah özet)',
  kural: 'Kural bildirimleri (anında)',
};

/**
 * Sinyal özetinin gönderim saati: AJANSIN saati (İstanbul), UTC değil
 * (sync-queue "insanın okuduğu işler" istisnası). Sinyaller gece, hesabın
 * kendi gün dönümünden sonra hesaplanıyor; 03:00'te düşen bir Slack mesajı
 * sabah diğer mesajların altında kalır.
 */
export const SINYAL_OZET_SAATI = { saat: 9, dakika: 0, tz: 'Europe/Istanbul' } as const;

// ─── Webhook adresi: GİRİŞTE doğrulama + beyaz liste ─────────────────────────

/**
 * İzin verilen ana makineler. `tam` birebir, `sonek` noktalı sonek
 * (`endsWith('.' + sonek)`, `includes` DEĞİL: `x.webhook.office.com.evil.com`
 * `includes` ile geçerdi, CLAUDE.md "sunucudan dışarı giden her istek").
 *
 * TEAMS İKİ AİLE: eski "Gelen Web Kancası" (Office 365 Connector,
 * `*.webhook.office.com`) Microsoft'un emekliye ayırdığı yol; yerini Teams
 * "Workflows" (Power Automate) aldı ve adresi `*.logic.azure.com`. Hangisinin
 * bugün çalıştığı ÖLÇÜLMEDİ (MIMARI Ç-5); ikisi de kabul ediliyor, gövde
 * biçimi aileye göre seçiliyor (`teamsAilesi`).
 *
 * Adres kontrolü YETMEZ: sunucu tarafı DNS'i çözüp iç ağ aralıklarını
 * reddeder (tenancy/site-oku.ts#ozelAdres), yönlendirme izlenmez.
 */
export const WEBHOOK_IZINLI: Record<'slack' | 'teams', { tam: readonly string[]; sonek: readonly string[]; yolOnek: string | null }> = {
  slack: { tam: ['hooks.slack.com'], sonek: [], yolOnek: '/services/' },
  teams: { tam: [], sonek: ['webhook.office.com', 'logic.azure.com'], yolOnek: null },
};

export const WEBHOOK_EN_UZUN = 1024;

export type WebhookDenetimi = { gecerli: true; adres: string } | { gecerli: false; neden: string };

/**
 * Kullanıcının yapıştırdığı webhook adresi kabul edilebilir mi? SAF: panel
 * alan BIRAKILINCA çağırır (doğrulama giriş anında, CLAUDE.md), sunucu
 * kaydetmeden önce AYNI fonksiyonu çağırır. Neden cümlesi kullanıcıya
 * aynen gösterilir.
 */
export function webhookDenetle(tur: 'slack' | 'teams', ham: string): WebhookDenetimi {
  const deger = ham.trim();
  if (deger === '') return { gecerli: false, neden: 'Adres boş.' };
  if (deger.length > WEBHOOK_EN_UZUN) return { gecerli: false, neden: 'Adres çok uzun.' };
  let u: AdresParcalari;
  try {
    u = new URL(deger);
  } catch {
    return { gecerli: false, neden: 'Bu bir web adresi değil. Adresi kanal ayarlarından yeniden kopyalayın.' };
  }
  if (u.protocol !== 'https:') return { gecerli: false, neden: 'Adres https:// ile başlamalı.' };
  if (u.username || u.password) return { gecerli: false, neden: 'Adreste kullanıcı adı ya da parola olamaz.' };
  if (u.port !== '' && u.port !== '443') return { gecerli: false, neden: 'Adreste özel bir bağlantı noktası olamaz.' };
  const host = u.hostname.toLowerCase();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':') || host.startsWith('[')) {
    return { gecerli: false, neden: 'Adres bir IP olamaz.' };
  }
  const kural = WEBHOOK_IZINLI[tur];
  const izinli = kural.tam.includes(host) || kural.sonek.some((s) => host.endsWith(`.${s}`));
  if (!izinli) {
    return {
      gecerli: false,
      neden:
        tur === 'slack'
          ? 'Slack adresi hooks.slack.com ile başlamalı. Slack\'te "Incoming Webhooks" uygulamasından kopyalayın.'
          : 'Teams adresi webhook.office.com ya da logic.azure.com üzerinde olmalı. Teams kanalında "Workflows" ile oluşturun.',
    };
  }
  if (kural.yolOnek && !u.pathname.startsWith(kural.yolOnek)) {
    return { gecerli: false, neden: 'Adres eksik kopyalanmış görünüyor.' };
  }
  return { gecerli: true, adres: u.toString() };
}

/** Teams adresinin ailesi: gövde biçimi buna göre (eski bağlayıcı MessageCard, Workflows Adaptive Card). */
export function teamsAilesi(adres: string): 'baglayici' | 'workflows' | null {
  try {
    const h = new URL(adres).hostname.toLowerCase();
    if (h.endsWith('.webhook.office.com')) return 'baglayici';
    if (h.endsWith('.logic.azure.com')) return 'workflows';
    return null;
  } catch {
    return null;
  }
}

/**
 * Ekranda gösterilen ipucu. Webhook adresi bir PAROLA gibi: bilen herkes
 * kanala mesaj atabilir. Şifreli saklanır (`hedef_enc`), listede yalnız
 * ana makine ve son dört karakter görünür, yanıtta TAM ADRES HİÇ DÖNMEZ.
 */
export function webhookIpucu(adres: string): string {
  try {
    const u = new URL(adres);
    return `${u.hostname} … ${adres.slice(-4)}`;
  } catch {
    return '…';
  }
}

// ─── Girdi şemaları ─────────────────────────────────────────────────────────

const ad = z.string().trim().min(1).max(80);
const olaylar = z.array(z.enum(BILDIRIM_OLAYLARI)).min(1, 'En az bir bildirim türü seçin').max(BILDIRIM_OLAYLARI.length);

const webhookAlani = (tur: 'slack' | 'teams') =>
  z
    .string()
    .max(WEBHOOK_EN_UZUN)
    .superRefine((v, ctx) => {
      const d = webhookDenetle(tur, v);
      if (!d.gecerli) ctx.addIssue({ code: z.ZodIssueCode.custom, message: d.neden });
    });

/**
 * E-posta alıcıları LİSTE. Sınır rapor alıcılarıyla aynı
 * (`ALICI_UST_SINIRI`): aynı sağlayıcı, aynı spam riski.
 */
const alicilar = z
  .array(z.string().trim().refine(gecerliAdres, 'Geçersiz e-posta adresi'))
  .min(1, 'En az bir alıcı yazın')
  .max(ALICI_UST_SINIRI);

export const kanalOlusturSchema = z.discriminatedUnion('tur', [
  z.object({ tur: z.literal('eposta'), clientId: z.string().uuid(), ad, olaylar, alicilar }),
  z.object({ tur: z.literal('slack'), clientId: z.string().uuid(), ad, olaylar, adres: webhookAlani('slack') }),
  z.object({ tur: z.literal('teams'), clientId: z.string().uuid(), ad, olaylar, adres: webhookAlani('teams') }),
]);
export type KanalOlusturGirdisi = z.infer<typeof kanalOlusturSchema>;

/**
 * Güncelleme: tür DEĞİŞMEZ (Slack kanalını e-postaya çevirmek yeni kanal).
 * `adres` verilmezse saklanan şifreli adres korunur; boş dize = değişiklik
 * yok DEĞİL, reddedilir (yanlışlıkla adresi silmek kanalı sessizce öldürür).
 */
export const kanalGuncelleSchema = z.object({
  ad: ad.optional(),
  olaylar: olaylar.optional(),
  etkin: z.boolean().optional(),
  alicilar: alicilar.optional(),
  adres: z.string().min(1).max(WEBHOOK_EN_UZUN).optional(),
});
export type KanalGuncelleGirdisi = z.infer<typeof kanalGuncelleSchema>;

/** "Deneme mesajı geldi mi?" cevabı. 200 döndü doğrulama değil (CLAUDE.md). */
export const kanalDogrulaSchema = z.object({ geldi: z.boolean() });
export type KanalDogrulaGirdisi = z.infer<typeof kanalDogrulaSchema>;

export const kanalListeSorgusuSchema = z.object({ clientId: z.string().uuid() });

// ─── Yanıt tipleri ──────────────────────────────────────────────────────────

/**
 * Kanal durumu SAKLANMAZ, alanlardan türetilir (`kanalDurumu`). Dört hâl
 * ekranda ayrı yazılır: kapalı (kullanıcı kapattı), hata (son teslim kalıcı
 * ya da tükenmiş hatayla düştü), doğrulanmadı (hiç "geldi" denmedi),
 * çalışıyor.
 */
export const KANAL_DURUMLARI = ['kapali', 'hata', 'dogrulanmadi', 'calisiyor'] as const;
export type KanalDurumu = (typeof KANAL_DURUMLARI)[number];

export const KANAL_DURUM_ADI: Record<KanalDurumu, string> = {
  kapali: 'Kapalı',
  hata: 'Gönderilemiyor',
  dogrulanmadi: 'Doğrulanmadı',
  calisiyor: 'Çalışıyor',
};

export interface KanalTeslimOzeti {
  zaman: string;
  durum: TeslimDurumu;
  /** Platformun ya da SMTP'nin cümlesi, kesilmeden. */
  hata: string | null;
}

export interface BildirimKanali {
  id: string;
  clientId: string;
  tur: KanalTuru;
  ad: string;
  /** Webhook için `webhookIpucu`; e-postada alıcı sayısı. Tam adres YOK. */
  hedefIpucu: string;
  /** Yalnız e-postada dolu. */
  alicilar: string[] | null;
  olaylar: BildirimOlayi[];
  etkin: boolean;
  /** Kullanıcının "geldi" dediği an; `null` = hiç doğrulanmadı. */
  dogrulandi: string | null;
  sonTeslim: KanalTeslimOzeti | null;
  durum: KanalDurumu;
  olusturan: string | null;
  olusturuldu: string;
}

export function kanalDurumu(k: { etkin: boolean; dogrulandi: string | null; sonTeslim: KanalTeslimOzeti | null }): KanalDurumu {
  if (!k.etkin) return 'kapali';
  if (k.sonTeslim && k.sonTeslim.durum === 'vazgecildi') return 'hata';
  if (!k.dogrulandi) return 'dogrulanmadi';
  return 'calisiyor';
}

/** Boş kanal listesi NEDENİ (`emptyReason` deseni). */
export type KanalBosNedeni = 'kanal_yok' | null;

export interface BildirimKanallariYaniti {
  kanallar: BildirimKanali[];
  toplam: number;
  emptyReason: KanalBosNedeni;
  /**
   * E-posta kanalının gönderen kimliği (org yöneticisinin SMTP kimliği,
   * OdemeMailiGonderici deseni). Yoksa e-posta kanalı EKLENEBİLİR ama
   * gönderemez; ekran bunu kanal eklenirken söyler, ilk sabah değil.
   */
  epostaGonderen: { tanimli: true; adres: string } | { tanimli: false; neden: string };
}

/** Teslim geçmişi satırı (Bildirimler bölümündeki "Son gönderimler"). */
export interface BildirimGonderimi {
  id: string;
  kanalId: string | null;
  kanalAdi: string | null;
  olay: BildirimOlayi | 'deneme';
  /** Tek satır özet: "4 yeni sinyal", "Kural: Yüksek maliyet, 2 kampanya". */
  ozet: string;
  durum: TeslimDurumu;
  deneme: number;
  httpDurum: number | null;
  hata: string | null;
  olusturuldu: string;
  gonderildi: string | null;
}

export interface BildirimGonderimleriYaniti {
  gonderimler: BildirimGonderimi[];
  toplam: number;
}
