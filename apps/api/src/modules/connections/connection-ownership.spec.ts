import { describe, expect, it } from 'vitest';
import { decideConnectionOwnership } from './connection-ownership';

/**
 * Aynı platform hesabının ikinci bir workspace'e bağlanması REDDEDİLİYOR.
 *
 * Kontrol edilmeseydi olan şey sessizdi: tekillik
 * `orgId_platform_externalUserId` üzerinde, `upsert`'ün `update` dalı
 * `client_id`'ye dokunmuyor ve keşif bağlantının `client_id`'sini okuyor —
 * yani "Fenbay" için yapılan yetkilendirme, hesapları "Ege Birlik Yapı"nın
 * altına doldururdu. Ekran "bağlandı" derdi.
 */
const EGE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const FENBAY = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('ilk bağlantı serbest', () => {
  it('satır yoksa workspace’e bağlanabiliyor', () => {
    expect(
      decideConnectionOwnership({
        platform: 'meta',
        existingClientId: undefined,
        requestedClientId: EGE,
      }),
    ).toEqual({ ok: true });
  });

  it('satır yoksa havuza da bağlanabiliyor', () => {
    expect(
      decideConnectionOwnership({
        platform: 'meta',
        existingClientId: undefined,
        requestedClientId: null,
      }).ok,
    ).toBe(true);
  });
});

describe('aynı sahiple tekrar yetkilendirme — token tazeleme', () => {
  it('aynı workspace’e yeniden bağlanmak serbest', () => {
    // needs_reauth sonrası yeniden yetkilendirme bu yoldan geçiyor;
    // engellemek bağlantıyı onarılamaz yapardı.
    expect(
      decideConnectionOwnership({
        platform: 'meta',
        existingClientId: EGE,
        requestedClientId: EGE,
      }).ok,
    ).toBe(true);
  });

  it('havuz bağlantısını havuz olarak tazelemek serbest', () => {
    expect(
      decideConnectionOwnership({
        platform: 'google',
        existingClientId: null,
        requestedClientId: null,
      }).ok,
    ).toBe(true);
  });
});

describe('SAHİPLİK DEĞİŞTİRME — hepsi reddediliyor', () => {
  it('KRİTİK: başka workspace’e taşımak reddediliyor', () => {
    const k = decideConnectionOwnership({
      platform: 'meta',
      existingClientId: EGE,
      existingClientName: 'Ege Birlik Yapı',
      requestedClientId: FENBAY,
    });
    expect(k.ok).toBe(false);
  });

  it('KRİTİK: mesaj HANGİ workspace’te olduğunu söylüyor', () => {
    // "Bağlanamadı" demek yetmez: kullanıcının yapacağı iş, hesabın nerede
    // olduğunu bilmesine bağlı.
    const k = decideConnectionOwnership({
      platform: 'meta',
      existingClientId: EGE,
      existingClientName: 'Ege Birlik Yapı',
      requestedClientId: FENBAY,
    });
    expect(k.ok).toBe(false);
    if (k.ok) return;
    expect(k.message).toContain('Ege Birlik Yapı');
    expect(k.message).toContain('Meta');
    // NE YAPILACAĞI da yazılı.
    expect(k.message).toMatch(/farklı bir Meta hesabı|mevcut bağlantıyı kaldır/);
  });

  it('KRİTİK: HAVUZDAN workspace’e taşımak da reddediliyor', () => {
    /*
     * Havuzdaki bağlantının altında 157 hesap var ve çoğu BAŞKA müşterilere
     * ait. Bağlantıyı tek bir workspace'e işaretlemek, sonraki bütün
     * keşifleri oraya yazdırırdı.
     */
    const k = decideConnectionOwnership({
      platform: 'meta',
      existingClientId: null,
      requestedClientId: EGE,
    });
    expect(k.ok).toBe(false);
    if (k.ok) return;
    expect(k.message).toContain('ajans havuzuna');
  });

  it('workspace’ten havuza taşımak da reddediliyor', () => {
    const k = decideConnectionOwnership({
      platform: 'google',
      existingClientId: EGE,
      existingClientName: 'Ege Birlik Yapı',
      requestedClientId: null,
    });
    expect(k.ok).toBe(false);
    if (k.ok) return;
    expect(k.message).toContain('Google');
  });

  it('adı bilinmeyen workspace’te bile anlaşılır bir mesaj çıkıyor', () => {
    const k = decideConnectionOwnership({
      platform: 'meta',
      existingClientId: EGE,
      existingClientName: null,
      requestedClientId: FENBAY,
    });
    expect(k.ok).toBe(false);
    if (k.ok) return;
    expect(k.message).toContain('başka bir workspace');
  });
});
