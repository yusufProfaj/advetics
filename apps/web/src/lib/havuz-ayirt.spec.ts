import { describe, expect, it } from 'vitest';
import type { ConnectionSummary } from '@advetics/shared';

import { havuzlariCikar } from './havuz';

/**
 * AYNI ADI TAŞIYAN İKİ HAVUZ SATIRI AYIRT EDİLEBİLİYOR MU.
 *
 * `ad_accounts` tekil anahtarı `[platform, externalId, orgId]`, yani aynı
 * reklam hesabı iki farklı şirket altında İKİ SATIR açabiliyor ve havuz
 * penceresi ikisini de listeliyor. Üretimde iki "Biltaş · 3421122929" yan
 * yana çıktı ve ekranda ad da kimlik de aynıydı.
 *
 * Yanlışını atamak sessiz: hesap geçmişsiz açılıyor, sonraki senkronizasyon
 * yeni satıra yazıyor, eski veri eski satırda kalıyor ve geçmiş ikiye
 * bölünüyor. Üç belirti de yok.
 */

function baglanti(over: Partial<ConnectionSummary>): ConnectionSummary {
  return {
    id: 'c1',
    platform: 'google',
    accountLabel: null,
    status: 'active',
    missingScopes: [],
    missingOptionalScopes: [],
    tokenExpiresAt: null,
    lastVerifiedAt: null,
    lastErrorCode: null,
    connectedAt: '2026-09-23T00:00:00.000Z',
    adAccounts: [],
    socialProfiles: [],
    ...over,
  } as ConnectionSummary;
}

function hesap(over: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    platform: 'google',
    externalId: '3421122929',
    name: 'Biltaş',
    currency: 'TRY',
    timezone: 'Europe/Istanbul',
    status: 'active',
    syncEnabled: false,
    isManager: false,
    clientId: null,
    lastInsightsSyncAt: null,
    ...over,
  };
}

describe('havuzda mükerrer görünen satırlar', () => {
  it('KRİTİK: adı ve dış kimliği AYNI olan iki satır bağlantısıyla ayrılıyor', () => {
    const havuz = havuzlariCikar([
      baglanti({
        id: 'eski',
        accountLabel: 'Eski Google bağlantısı',
        adAccounts: [hesap({ id: 'a1' })] as never,
      }),
      baglanti({
        id: 'yeni',
        accountLabel: 'Yeni Google bağlantısı',
        adAccounts: [hesap({ id: 'a2' })] as never,
      }),
    ]);

    const satirlar = havuz.google_ads;
    expect(satirlar).toHaveLength(2);

    // Ad ve kimlik ayırt ETMİYOR — ekranda görünen buydu ve yetmiyordu.
    expect(satirlar[0].name).toBe(satirlar[1].name);
    expect(satirlar[0].externalId).toBe(satirlar[1].externalId);

    // Ayıran bilgi taşınıyor.
    expect(satirlar[0].baglanti.etiket).toBe('Eski Google bağlantısı');
    expect(satirlar[1].baglanti.etiket).toBe('Yeni Google bağlantısı');
  });

  it('kaldırılmış bağlantının satırı durumunu taşıyor', () => {
    /*
      `revoked` bir bağlantının token'ı silinmiş: satır atanabilir ama veri
      çekmez. Arayüz bunu ancak durumu görürse söyleyebilir.
    */
    const havuz = havuzlariCikar([
      baglanti({ id: 'eski', status: 'revoked', adAccounts: [hesap()] as never }),
    ]);
    expect(havuz.google_ads[0].baglanti.durum).toBe('revoked');
  });

  it('atanmış satır havuza HİÇ girmiyor — ayrım onu geri getirmedi', () => {
    // Bağlantı bilgisini eklerken süzgecin düşmediğini de sabitliyoruz:
    // atanmış bir hesabı havuzda göstermek ikinci kez atamaya davet ederdi.
    const havuz = havuzlariCikar([
      baglanti({ adAccounts: [hesap({ clientId: 'musteri-1' })] as never }),
    ]);
    expect(havuz.google_ads).toHaveLength(0);
  });
});
