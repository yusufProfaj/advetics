import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SOHBET_SINIRI } from '@advetics/shared';

/**
 * ═══ ÜÇ SOHBET, PLATFORMA GÖRE AYRI ═══
 *
 * Sohbet bugüne kadar yalnızca adres çubuğunda yaşıyordu: sayfayı kapatan ya
 * da workspace değiştiren kullanıcı ona bir daha ulaşamıyordu. Kayıt
 * veritabanındaydı, listeleyen bir ekran yoktu.
 *
 * Buradaki iddialar üç kararı kilitliyor ve üçü de yanlış olduğunda sessiz:
 * sınırın SUNUCUDA olması, sohbetlerin SAHİBİNE özel kalması ve listelerin
 * PLATFORMA göre ayrılması.
 */
const yorumsuz = (m: string): string =>
  m.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SERVIS = yorumsuz(readFileSync(join(__dirname, 'ai-assistant.service.ts'), 'utf8'));
const ARACLAR = yorumsuz(readFileSync(join(__dirname, 'tools.ts'), 'utf8'));

/**
 * Bir aracın GÖVDESİ — bir sonraki aracın adına kadar.
 *
 * SABİT UZUNLUKLU DİLİM YA DA İLK `},` KULLANILAMAZ: `inputSchema` da `},`
 * ile bitiyor ve dilim `execute`a hiç ulaşmadan kapanıyordu — iddia boş
 * metinde aranıp yanlış kırmızı veriyordu.
 */
function aracGovdesi(ad: string): string {
  const bas = ARACLAR.indexOf(`name: '${ad}'`);
  if (bas === -1) throw new Error(`${ad} bulunamadı — tarama boşa düştü`);
  const sonraki = ARACLAR.indexOf("name: '", bas + ad.length + 10);
  return ARACLAR.slice(bas, sonraki === -1 ? undefined : sonraki);
}

describe('tarama boşa düşmüyor', () => {
  it('kaynaklar okundu', () => {
    expect(SERVIS).toContain('async listConversations');
    expect(ARACLAR).toContain("name: 'campaign_performance'");
  });
});

describe('sınır', () => {
  it('KRİTİK: sınır SUNUCUDA kontrol ediliyor', () => {
    /*
     * Kontrolü arayüze bırakmak, ucun doğrudan çağrılmasıyla sınırsız sohbet
     * açılabilmesi demekti.
     */
    const i = SERVIS.indexOf('private async createConversation');
    expect(i, 'oluşturma bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const dilim = SERVIS.slice(i, SERVIS.indexOf('\n  private ', i + 10));
    expect(dilim).toContain('SOHBET_SINIRI');
    expect(dilim).toContain('BadRequestException');
  });

  it('KRİTİK: sayım SAHİBİ + WORKSPACE + PLATFORM kapsamında', () => {
    // Kullanıcının Meta sohbetleri Google'ınkileri kısıtlamamalı: iki ayrı
    // asistanın iki ayrı işi var.
    const i = SERVIS.indexOf('aiConversation.count');
    expect(i, 'sayım yok').toBeGreaterThan(-1);
    const dilim = SERVIS.slice(i, i + 200);
    for (const alan of ['clientId', 'platform', 'userId']) {
      expect(dilim, `sayımda eksik: ${alan}`).toContain(alan);
    }
  });

  it('sınır ÜÇ ve tek yerden geliyor', () => {
    // Panel de aynı sabiti okuyor; iki yerde yazmak, birinin değişip
    // diğerinin kalması demekti.
    expect(SOHBET_SINIRI).toBe(3);
  });
});

describe('liste ve silme', () => {
  it('KRİTİK: liste SAHİBİNE özel', () => {
    // `assertOwnConversation` zaten başkasının sohbetine yazmayı reddediyor;
    // listede göstermek, kullanıcıya açamayacağı satırlar göstermek olurdu.
    const i = SERVIS.indexOf('async listConversations');
    const dilim = SERVIS.slice(i, i + 700);
    expect(dilim).toContain('userId: ctx.userId');
    expect(dilim).toContain('platform');
  });

  it('KRİTİK: silme sahiplik kontrolünden GEÇİYOR', () => {
    const i = SERVIS.indexOf('async deleteConversation');
    expect(i, 'silme yok').toBeGreaterThan(-1);
    expect(SERVIS.slice(i, i + 400)).toContain('assertOwnConversation');
  });

  it('mesajlar ÖNCE siliniyor', () => {
    // `ai_messages` sohbete FK ile bağlı; ters sıra kısıt hatası veriyor.
    const i = SERVIS.indexOf('async deleteConversation');
    const dilim = SERVIS.slice(i, i + 600);
    expect(dilim.indexOf('aiMessage.deleteMany')).toBeLessThan(
      dilim.indexOf('aiConversation.delete'),
    );
  });
});

describe('platform süzgeci — asistan kendi platformunu görüyor', () => {
  it('KRİTİK: yayındaki kampanyalar platforma göre süzülüyor', () => {
    /*
     * Süzülmeden önce Meta asistanı Google kampanyalarını da listeliyor ve
     * her cevabında "onlar için diğer asistana geç" cümlesi taşımak zorunda
     * kalıyordu — kullanıcının ekranda gördüğü hâl birebir buydu.
     */
    expect(aracGovdesi('list_live_campaigns')).toContain('r.platform === platform');
  });

  it('KRİTİK: taslaklarda GRUBUN İÇİ süzülüyor, grup atılmıyor', () => {
    // Bir grup iki platformun kampanyasını birden taşıyabiliyor; grubu
    // tamamen atmak, Meta kampanyası da olan bir niyeti gizlerdi.
    expect(aracGovdesi('list_draft_campaigns')).toContain(
      'campaigns: g.campaigns.filter((c) => c.platform === platform)',
    );
  });
});

describe('performans aracı', () => {
  it('KRİTİK: veri yoksa SIFIR değil `null` dönüyor', () => {
    /*
     * "Harcamadı" ile "veri gelmedi" aynı şey değil ve modelin bunu ayırt
     * etmesi gerekiyor: ilkinde kampanyaya, ikincisinde senkronizasyona
     * bakılır.
     */
    const dilim = aracGovdesi('campaign_performance');
    expect(dilim).toContain('m === null');
    expect(dilim).toContain('veri:');
  });

  it('KRİTİK: dönüşüm yokken edinme maliyeti HESAPLANMIYOR', () => {
    // Sıfıra bölmek yerine `null`: "dönüşüm yok" zaten ayrı ve daha önemli
    // bir bilgi.
    const dilim = aracGovdesi('campaign_performance');
    expect(dilim).toContain('m.conversions > 0');
    expect(dilim).toContain('edinmeMaliyeti');
  });

  it('araç KENDİ platformunu süzüyor', () => {
    expect(aracGovdesi('campaign_performance')).toContain('platform,');
  });
});
