import { describe, expect, it } from 'vitest';
import { googleButceUyarisi, type GoogleOdemeOkumasi } from '@advetics/shared';
import { googleOdemeOzeti } from '../connections/providers/google.provider';
import { hesapUyarilari, siralaUyarilari, type UyariHesabi } from './uyari-kurallari';

/**
 * ═══ HESAP BÜTÇESİ BİTMEK ÜZERE ═══
 *
 * `google_hesap_butcesi_bitti` reklam DURDUKTAN sonra doğuyor. Canlıda
 * (2026-10-19) Tınaztepe'nin bütçesi %99,2 doluydu ve panel susuyordu.
 * İki yönde sınanıyor: biterken SÖYLÜYOR, bol bütçede ve okunamayan
 * sayıda UYDURMUYOR.
 */
const SIMDI = new Date('2026-10-19T12:00:00Z');

function okuma(butceler: GoogleOdemeOkumasi['hesapButceleri']): GoogleOdemeOkumasi {
  return {
    okundu: '2026-10-19T11:30:00.000Z',
    hata: null,
    faturaKurulumlari: [{ durum: 'APPROVED', baslangic: '2025-01-01 00:00:00', bitis: null }],
    hesapButceleri: butceler,
  };
}

/** Süresiz, sınırlı bütçe: `gunOnce` gün önce başladı. Tutarlar TL (micros'a çevriliyor). */
function butce(limit: number, harcanan: number, gunOnce: number | null) {
  const bas = gunOnce === null ? null : new Date(SIMDI.getTime() - gunOnce * 86_400_000).toISOString().slice(0, 19).replace('T', ' ');
  return {
    durum: 'APPROVED',
    baslangic: bas,
    bitis: null,
    bitisSuresiz: true,
    limitMicros: String(limit * 1_000_000),
    limitSuresiz: false,
    harcananMicros: String(harcanan * 1_000_000),
  };
}

/** Canlıdan birebir (google-odeme.spec.ts ile aynı yanıt). */
function tinaztepe(harcanan: string): GoogleOdemeOkumasi {
  return googleOdemeOzeti(
    [{ billingSetup: { status: 'APPROVED', endTimeType: 'FOREVER', startDateTime: '2019-12-25 11:22:25' } }],
    [
      { accountBudget: { status: 'APPROVED', approvedEndTimeType: 'FOREVER', approvedStartDateTime: '2026-06-01 16:32:08', adjustedSpendingLimitMicros: '20545010000', amountServedMicros: harcanan } },
      { accountBudget: { status: 'APPROVED', approvedStartDateTime: '2026-04-29 10:33:43', approvedEndDateTime: '2026-06-01 16:32:08', adjustedSpendingLimitMicros: '20031840000', amountServedMicros: '20030890000' } },
    ],
    SIMDI,
  );
}

describe('googleButceUyarisi', () => {
  it('KRİTİK: Tınaztepe canlı yanıtı (%99,2 dolu) = uyarı, kalan ve gün doğru', () => {
    const u = googleButceUyarisi(tinaztepe('20375130000'), SIMDI);
    expect(u).not.toBeNull();
    // 169,88 / 20.545,01 = %0,83; ortalama 20.375 / ~139,8 gün ≈ 145,7 → ~1,17 gün.
    expect(u!.kalanYuzde).toBeCloseTo(0.827, 2);
    expect(u!.kalanGun).toBeCloseTo(1.166, 2);
  });

  it('bütçe doldu = bu uyarı DEĞİL (asıl uyarı error, "yayınlanmıyor")', () => {
    expect(googleButceUyarisi(tinaztepe('20545010000'), SIMDI)).toBeNull();
  });

  it('GÜN EŞİĞİ: %10 kalan ama 2 günlük harcama = uyarı; 4 günlük = yok', () => {
    // 900 TL / 18 gün = 50/gün; kalan 100 → 2 gün.
    expect(googleButceUyarisi(okuma([butce(1000, 900, 18)]), SIMDI)).toMatchObject({ kalanYuzde: 10, kalanGun: 2 });
    // 900 TL / 36 gün = 25/gün; kalan 100 → 4 gün.
    expect(googleButceUyarisi(okuma([butce(1000, 900, 36)]), SIMDI)).toBeNull();
  });

  it('YÜZDE EŞİĞİ: %4 kalan, ortalamaya göre haftalarca yetse de uyarı (ortalama son harcamayı görmüyor)', () => {
    const u = googleButceUyarisi(okuma([butce(1000, 960, 600)]), SIMDI);
    expect(u?.kalanGun).toBeGreaterThan(20);
    expect(u?.kalanYuzde).toBeCloseTo(4, 5);
    // %6 kalan, aynı uzun ömür → yok.
    expect(googleButceUyarisi(okuma([butce(1000, 940, 600)]), SIMDI)).toBeNull();
  });

  it('başlangıcı okunamayan bütçede gün yok, yalnız yüzde karar veriyor', () => {
    expect(googleButceUyarisi(okuma([butce(1000, 900, null)]), SIMDI)).toBeNull();
    expect(googleButceUyarisi(okuma([butce(1000, 990, null)]), SIMDI)).toEqual({ kalanYuzde: 1, kalanGun: null });
  });

  it('bol bütçe, sınırsız bütçe, okunamayan sayı = uyarı yok', () => {
    expect(googleButceUyarisi(okuma([butce(1000, 500, 30)]), SIMDI)).toBeNull();
    const sinirsiz = { ...butce(1000, 999, 30), limitMicros: null, limitSuresiz: true };
    expect(googleButceUyarisi(okuma([sinirsiz]), SIMDI)).toBeNull();
    expect(googleButceUyarisi(okuma([{ ...butce(1000, 999, 30), harcananMicros: null }]), SIMDI)).toBeNull();
  });

  it('biri dolmak üzere ama diğer geçerli bütçe sınırsız = uyarı yok (hesap harcayabiliyor)', () => {
    const sinirsiz = { ...butce(1, 0, 30), limitMicros: null, limitSuresiz: true };
    expect(googleButceUyarisi(okuma([butce(1000, 999, 30), sinirsiz]), SIMDI)).toBeNull();
  });

  it('okuma yok / düştü = tahminle uyarı yok', () => {
    expect(googleButceUyarisi(null, SIMDI)).toBeNull();
    expect(googleButceUyarisi({ ...okuma([butce(1000, 999, 30)]), hata: 'PERMISSION_DENIED' }, SIMDI)).toBeNull();
  });
});

describe('hesapUyarilari — bitmek üzere', () => {
  function hesap(odemeDurumu: unknown, over: Partial<UyariHesabi> = {}): UyariHesabi {
    return {
      id: 'g1',
      name: 'Tınaztepe Google',
      platform: 'google',
      status: 'active',
      syncEnabled: true,
      lastInsightsSyncAt: SIMDI,
      lastStructureSyncAt: SIMDI,
      updatedAt: new Date('2026-10-01T00:00:00Z'),
      raw: { status: 'ENABLED' },
      odemeDurumu,
      externalId: '5161746317',
      clientId: 'c1',
      clientName: 'Tınaztepe',
      connectionStatus: 'active',
      connectionTokenExpiresAt: null,
      ...over,
    };
  }

  it('KRİTİK: warn (bant değil zil), ödeme ekranı, hesap no ve sayılar; ödeme SORUNU değil (mail yok)', () => {
    const uyarilar = hesapUyarilari(hesap(tinaztepe('20375130000')), SIMDI);
    expect(uyarilar).toHaveLength(1);
    const u = uyarilar[0]!;
    expect(u).toMatchObject({
      kod: 'hesap_butcesi_bitmek_uzere',
      siddet: 'warn',
      odemeAdresi: 'https://ads.google.com/aw/billing/summary',
      odemeHesapNo: '516-174-6317',
      // Bayatlık ödeme okumasının anı, hesabın `updatedAt`i değil.
      veriZamani: SIMDI.toISOString(),
    });
    expect(u.odemeSebebi).toBeUndefined();
    expect(u.butce?.kalanYuzde).toBeCloseTo(0.827, 2);
    expect(u.detay).toContain('%0,8');
    expect(u.detay).toContain('yaklaşık 1 gün');
  });

  it('bütçe dolunca bitmek-üzere değil ödeme sorunu (error)', () => {
    const u = hesapUyarilari(hesap(tinaztepe('20545010000')), SIMDI)[0]!;
    expect(u).toMatchObject({ kod: 'hesap_odeme_sorunu', siddet: 'error', odemeSebebi: 'google_hesap_butcesi_bitti' });
  });

  it('kapalı hesapta bütçe konuşulmuyor', () => {
    const u = hesapUyarilari(hesap(tinaztepe('20375130000'), { status: 'closed' }), SIMDI)[0]!;
    expect(u.kod).toBe('hesap_platformda_kapali');
  });

  it('veri bayat olsa da önce bütçe (para kesilmek üzere)', () => {
    const u = hesapUyarilari(hesap(tinaztepe('20375130000'), { lastInsightsSyncAt: new Date('2026-10-10T00:00:00Z') }), SIMDI)[0]!;
    expect(u.kod).toBe('hesap_butcesi_bitmek_uzere');
  });

  it('Meta hesabı bu kurala hiç girmiyor', () => {
    const uyarilar = hesapUyarilari(hesap(tinaztepe('20375130000'), { platform: 'meta', raw: { account_status: 1 } }), SIMDI);
    expect(uyarilar.map((u) => u.kod)).not.toContain('hesap_butcesi_bitmek_uzere');
  });

  it('sıralamada uyarılar içinde yetki süresinden önce', () => {
    const b = hesapUyarilari(hesap(tinaztepe('20375130000')), SIMDI)[0]!;
    const token = { ...b, kod: 'baglanti_token_suresi' as const, clientName: 'A' };
    expect(siralaUyarilari([token, b]).map((u) => u.kod)).toEqual(['hesap_butcesi_bitmek_uzere', 'baglanti_token_suresi']);
  });
});
