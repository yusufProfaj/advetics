import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { youtubeHesabiEngeli, youtubeHesabiSec } from './youtube-hesabi';

/**
 * ═══ YOUTUBE REKLAMI HANGİ GOOGLE ADS HESABINDAN ═══
 *
 * Canlıda görülen hâl: kanalda eski bir META bağı duruyordu, kart "doğru
 * hesabı seç" diyordu ve o seçim hiçbir ekranda yoktu. Karar çalıştırılarak
 * sınanıyor; tüketicilerin (kart uyarısı, yayın) aynı kararı kullandığı
 * kaynak taramasıyla kilitli.
 */
const WS = 'ws-1';

describe('youtubeHesabiSec', () => {
  it('kanala bu workspace’in Google hesabı bağlıysa o', () => {
    expect(youtubeHesabiSec({ id: 'g1', platform: 'google', clientId: WS }, WS, ['g1', 'g2'])).toEqual({
      durum: 'kanal',
      hesapId: 'g1',
    });
  });

  it('KRİTİK: kanaldaki META bağı yok sayılıyor — tek Google hesabı kullanılıyor', () => {
    // Canlıdaki hâl birebir: bağ Meta'yı gösteriyor, workspace'te tek Google hesabı var.
    expect(youtubeHesabiSec({ id: 'm1', platform: 'meta', clientId: WS }, WS, ['g1'])).toEqual({
      durum: 'tek-hesap',
      hesapId: 'g1',
    });
  });

  it('KRİTİK: BAŞKA workspace’in Google hesabı yok sayılıyor', () => {
    expect(youtubeHesabiSec({ id: 'gx', platform: 'google', clientId: 'baska' }, WS, [])).toEqual({
      durum: 'yok',
    });
  });

  it('bağ yok, tek hesap → o', () => {
    expect(youtubeHesabiSec(null, WS, ['g1'])).toEqual({ durum: 'tek-hesap', hesapId: 'g1' });
  });

  it('KRİTİK: birden çok hesapta TAHMİN YOK', () => {
    expect(youtubeHesabiSec(null, WS, ['g1', 'g2'])).toEqual({ durum: 'birden-cok', adet: 2 });
  });

  it('engel cümleleri yeri söylüyor; çözülen hâllerde engel yok', () => {
    expect(youtubeHesabiEngeli({ durum: 'yok' })).toContain('Google Ads hesabını ata');
    expect(youtubeHesabiEngeli({ durum: 'birden-cok', adet: 2 })).toContain('YouTube kanalının satırından');
    expect(youtubeHesabiEngeli({ durum: 'kanal', hesapId: 'g' })).toBeNull();
    expect(youtubeHesabiEngeli({ durum: 'tek-hesap', hesapId: 'g' })).toBeNull();
  });
});

const oku = (d: string): string =>
  readFileSync(resolve(__dirname, d), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('üç tüketici AYNI kararı kullanıyor', () => {
  const yayin = oku('autoboost-launch.service.ts');
  const g = yayin.slice(yayin.indexOf('private async launchGoogle('));
  const okuma = oku('autoboost-read.service.ts');

  it('KRİTİK: yayın kararı kullanıyor ve eski Meta reddini taşımıyor', () => {
    expect(g).toContain('this.youtubeOtomatik.reklamHesabi(');
    expect(g).toContain('youtubeHesabiEngeli(karar)');
    expect(yayin).not.toContain('Bu kanala bağlı hesap bir Google Ads hesabı değil');
  });

  it('KRİTİK: tek hesap seçimi kanala YAZILIYOR — mevcut kapıdan', () => {
    expect(g).toMatch(/if \(karar\.durum === 'tek-hesap'\) \{\s*await this\.youtubeOtomatik\.kanalaBagla\(/);
    expect(oku('youtube-otomatik.service.ts')).toContain('this.connections.setProfileAdAccount(');
  });

  it('yayın ÇÖZÜLEN hesabı kullanıyor — kanaldaki ham bağı değil', () => {
    const son = g.indexOf('\n  }\n');
    const govde = g.slice(0, son);
    expect(govde).toContain('WHERE id = ${reklamHesabiId}::uuid');
    expect(govde).toContain('adAccountId: reklamHesabiId,');
    expect(govde).not.toContain('kayit.linked_ad_account_id');
  });

  it('KRİTİK: kart uyarısı yayınla AYNI karardan', () => {
    expect(okuma).toContain('youtubeHesabiEngeli(');
    expect(okuma).toContain('youtubeHesabiSec(');
    expect(okuma).toContain('${Prisma.raw(YOUTUBE_HESAP_KOSULU)}');
  });
});
