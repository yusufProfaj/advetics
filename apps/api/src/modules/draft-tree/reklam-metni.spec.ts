import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../config/configuration';
import type { TenantContext } from '@advetics/shared';
import { ReklamMetniService, type AnthropicLike } from './reklam-metni.service';

/**
 * ═══ REKLAM METNİNİ YAPAY ZEKÂ YAZIYOR ═══
 *
 * Kullanıcının isteği: "metinleri oluşturmak istersem de yapay zeka ile
 * doldur diyeyim doldursun bütün metinleri".
 *
 * ÇÖZÜMLEME ETİKETLİ SATIRLARDAN, JSON'DAN DEĞİL. JSON daha temiz görünüyordu
 * ama model bazen kod bloğu bazen açıklama cümlesi ekliyor ve `JSON.parse`
 * düşüyor; düştüğünde kullanıcıya gösterilecek hiçbir şey kalmıyor. Etiketli
 * satırlar kısmen bozuk bir cevapta bile işe yarıyor.
 */
const CTX = { orgId: 'o', userId: 'u', clientIds: ['c'] } as unknown as TenantContext;

const config = { aiAssistant: { model: 'test-model' } } as unknown as AppConfig;

/**
 * Bağlam kurucusu ağ/DB istiyor; burada sınanan şey ÇÖZÜMLEME.
 *
 * Taklit BOŞ DÖNÜYOR, FIRLATMIYOR: `musteriBaglamiKur` hatayı yutup bağlamsız
 * devam ediyor ve o davranış ayrı bir testin konusu. Burada fırlatan bir
 * taklit, çözümleme testlerini bağlam kurucusunun testine çevirirdi.
 */
const clients = { list: async () => [] } as never;
const clientProfile = { get: async () => null } as never;
const connections = { list: async () => [] } as never;
/** Görsel okuma taklidi — testlerin çoğu görselsiz çağırıyor. */
const assets = { bytes: async () => ({ buffer: Buffer.from('x'), mimeType: 'image/png' }) } as never;

function servis(metin: string | null): ReklamMetniService {
  const anthropic: AnthropicLike | null =
    metin === null
      ? null
      : {
          messages: {
            create: vi.fn(async () => ({
              content: [{ type: 'text', text: metin }],
            })) as never,
          },
        };
  return new ReklamMetniService(config, anthropic, clients, clientProfile, connections, assets);
}

const GIRDI = { clientId: 'c', goal: 'whatsapp' as const };

describe('etiketli cevabı çözme', () => {
  it('KRİTİK: üç alan da okunuyor', async () => {
    const r = await servis(
      'ANA METIN: Aracını 20 dakikada pırıl pırıl teslim alıyorsun.\n' +
        'BASLIK: Randevusuz yıkama\n' +
        'ACIKLAMA: Şehir merkezinde, her gün açık',
    ).yaz(CTX, GIRDI);

    expect(r.primaryText).toBe('Aracını 20 dakikada pırıl pırıl teslim alıyorsun.');
    expect(r.headline).toBe('Randevusuz yıkama');
    expect(r.description).toBe('Şehir merkezinde, her gün açık');
  });

  it('KRİTİK: TÜRKÇE KARAKTERLİ etiketler de okunuyor', async () => {
    /*
     * Sistem talimatı ASCII etiket istiyor ama model Türkçe yazmaya
     * programlanmış ve "BAŞLIK" yazması beklenen bir sapma. Yalnızca ASCII
     * aramak, düğmenin rastgele çalışmaması demekti.
     */
    const r = await servis(
      'ANA METİN: Bugün başla.\nBAŞLIK: Hemen yaz\nAÇIKLAMA: WhatsApp’tan',
    ).yaz(CTX, GIRDI);

    expect(r.primaryText).toBe('Bugün başla.');
    expect(r.headline).toBe('Hemen yaz');
    expect(r.description).toBe('WhatsApp’tan');
  });

  it('modelin eklediği açıklama cümlesi metni bozmuyor', async () => {
    // JSON beklenseydi bu cevapta `JSON.parse` düşerdi.
    const r = await servis(
      'Tabii, işte metinler:\n\nANA METIN: Kısa ve net.\nBASLIK: Başlık\n\nUmarım işine yarar.',
    ).yaz(CTX, GIRDI);

    expect(r.primaryText).toBe('Kısa ve net.');
    expect(r.headline).toBe('Başlık');
  });

  it('başlık ve açıklama boşsa BOŞ dönüyor — fırlatmıyor', async () => {
    /*
     * Reklam ana metin olmadan yayınlanamıyor ama başlıksız yayınlanabiliyor.
     * Eksik bir alan yüzünden hiçbir şey döndürmemek, elde olan metni de
     * atmak olurdu.
     */
    const r = await servis('ANA METIN: Sadece ana metin var.').yaz(CTX, GIRDI);
    expect(r.primaryText).toBe('Sadece ana metin var.');
    expect(r.headline).toBe('');
    expect(r.description).toBe('');
  });

  it('KRİTİK: ANA METİN YOKSA HATA — sessizce boş kutu bırakılmıyor', async () => {
    /*
     * Üç boş kutu, düğmenin çalışmadığı izlenimi verir ve kullanıcı tekrar
     * tekrar basar.
     */
    await expect(servis('Bir şeyler yazdım ama biçimsiz.').yaz(CTX, GIRDI)).rejects.toThrow(
      /beklenen biçimde/,
    );
  });
});

describe('model kapalıyken', () => {
  it('KRİTİK: SEBEBİ SÖYLENİYOR — düğme sessizce ölmüyor', async () => {
    // Anahtar tanımlı değilse kullanıcı "bozuk" der ve sebebi hiçbir yerde
    // yazmaz.
    await expect(servis(null).yaz(CTX, GIRDI)).rejects.toThrow(/AI anahtarı tanımlı değil/);
  });
});

describe('modele giden istek', () => {
  it('KRİTİK: kampanya tipi DÜZ TÜRKÇEYLE anlatılıyor', async () => {
    /*
     * `OUTCOME_LEADS` gibi bir kod göndermek, modelin Meta
     * terminolojisinden doğru çağrıyı çıkarmasına bel bağlamak olurdu;
     * metnin ne yapması gerektiği teknik bir ayar değil.
     */
    const anthropic = {
      messages: {
        create: vi.fn(async () => ({ content: [{ type: 'text', text: 'ANA METIN: x' }] })),
      },
    } as unknown as AnthropicLike;
    const svc = new ReklamMetniService(
      config,
      anthropic,
      clients,
      clientProfile,
      connections,
      assets,
    );

    await svc.yaz(CTX, { clientId: 'c', goal: 'form' });

    const cagri = (anthropic.messages.create as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0]![0] as {
      messages: Array<{ content: Array<{ type: string; text?: string }> }>;
    };
    const metin = cagri.messages[0]!.content.map((b) => b.text ?? '').join(' ');
    expect(metin).toContain('Anlık form');
    expect(metin).not.toContain('OUTCOME_LEADS');
  });

  it('KRİTİK: OKUNABİLİRLİK SINIRLARI talimatta', () => {
    /*
     * Meta ana metni 125 karakterden sonra "devamını gör" ile kırpıyor ve
     * başlığı mobilde ~40 karakterde kesiyor. Sınır yazılmazsa teknik olarak
     * geçerli ama ekranda yarısı görünmeyen bir reklam çıkar.
     */
    const kaynak = readFileSync(join(__dirname, 'reklam-metni.service.ts'), 'utf8');
    expect(kaynak).toContain('125 karakter');
    expect(kaynak).toContain('40 karakter');
    // UYDURMA YASAĞI: fiyat ve "garanti" gibi kanıtlanamayan iddialar.
    expect(kaynak).toContain('UYDURMA');
  });
});
