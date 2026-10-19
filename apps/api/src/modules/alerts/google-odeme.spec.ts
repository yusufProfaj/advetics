import { describe, expect, it } from 'vitest';
import {
  googleOdemeKarari,
  hesapOdemeKarari,
  teslimatDurumu,
  type GoogleOdemeOkumasi,
} from '@advetics/shared';
import { googleOdemeOzeti } from '../connections/providers/google.provider';
import { hesapUyarilari, type UyariHesabi } from './uyari-kurallari';

/**
 * ═══ GOOGLE ÖDEME SORUNU — PANELE YANSIMIYORDU ═══
 *
 * Eski kural yalnız `customer.status = SUSPENDED`a bakıyordu. Kartı
 * reddedilen, ödeme yöntemi olmayan ya da hesap bütçesi biten Google
 * hesabı ENABLED kalıyor (v25 enum'u) ve panel "sorun yok" diyordu.
 *
 * İki yönde sınanıyor: sorun varken SÖYLÜYOR, okuma yokken/düşmüşken
 * "sorun yok" DEMİYOR ve sağlam okumada uydurmuyor.
 */
const SIMDI = new Date('2026-10-19T12:00:00Z');

function okuma(over: Partial<GoogleOdemeOkumasi> = {}): GoogleOdemeOkumasi {
  return {
    okundu: '2026-10-19T11:30:00.000Z',
    hata: null,
    faturaKurulumlari: [{ durum: 'APPROVED', baslangic: '2025-01-01 00:00:00', bitis: null }],
    hesapButceleri: [
      {
        durum: 'APPROVED',
        baslangic: '2025-01-01 00:00:00',
        bitis: null,
        bitisSuresiz: true,
        limitMicros: null,
        limitSuresiz: true,
        harcananMicros: '120000000',
      },
    ],
    ...over,
  };
}

const butce = (o: Partial<GoogleOdemeOkumasi['hesapButceleri'][number]>) => ({
  durum: 'APPROVED',
  baslangic: '2026-10-01 00:00:00',
  bitis: '2026-10-31 23:59:59',
  bitisSuresiz: false,
  limitMicros: '1000000000',
  limitSuresiz: false,
  harcananMicros: '400000000',
  ...o,
});

describe('googleOdemeKarari — sorun yok', () => {
  it('onaylı kurulum + sınırsız süresiz bütçe = sorun_yok', () => {
    expect(googleOdemeKarari(okuma(), SIMDI)).toEqual({ durum: 'sorun_yok' });
  });

  it('kalanı olan, süresi geçmemiş sınırlı bütçe = sorun_yok', () => {
    expect(googleOdemeKarari(okuma({ hesapButceleri: [butce({})] }), SIMDI).durum).toBe('sorun_yok');
  });
});

describe('googleOdemeKarari — SORUN', () => {
  it('KRİTİK: hiç kurulum ve bütçe yok = ödeme yöntemi yok', () => {
    expect(googleOdemeKarari(okuma({ faturaKurulumlari: [], hesapButceleri: [] }), SIMDI)).toEqual({
      durum: 'sorun',
      sebep: 'google_odeme_yontemi_yok',
    });
  });

  it('yalnız iptal edilmiş kurulum = ödeme yöntemi yok', () => {
    const o = okuma({ faturaKurulumlari: [{ durum: 'CANCELLED', baslangic: null, bitis: null }] });
    expect(googleOdemeKarari(o, SIMDI)).toEqual({ durum: 'sorun', sebep: 'google_odeme_yontemi_yok' });
  });

  it('bitişi geçmiş onaylı kurulum = ödeme yöntemi yok', () => {
    const o = okuma({
      faturaKurulumlari: [{ durum: 'APPROVED', baslangic: '2025-01-01 00:00:00', bitis: '2026-09-30 23:59:59' }],
    });
    expect(googleOdemeKarari(o, SIMDI)).toEqual({ durum: 'sorun', sebep: 'google_odeme_yontemi_yok' });
  });

  it.each(['PENDING', 'APPROVED_HELD'])('%s kurulum = onay bekliyor (yöntem yok DEĞİL)', (durum) => {
    const o = okuma({ faturaKurulumlari: [{ durum, baslangic: null, bitis: null }] });
    expect(googleOdemeKarari(o, SIMDI)).toEqual({ durum: 'sorun', sebep: 'google_fatura_onay_bekliyor' });
  });

  it('KRİTİK: harcanan sınıra ulaştı = hesap bütçesi doldu', () => {
    const o = okuma({ hesapButceleri: [butce({ harcananMicros: '1000000000' })] });
    expect(googleOdemeKarari(o, SIMDI)).toEqual({ durum: 'sorun', sebep: 'google_hesap_butcesi_bitti' });
  });

  it('sınır 2^53 üstünde de doğru karşılaştırılıyor (BigInt)', () => {
    const o = okuma({
      hesapButceleri: [butce({ limitMicros: '9007199254740993', harcananMicros: '9007199254740992' })],
    });
    expect(googleOdemeKarari(o, SIMDI).durum).toBe('sorun_yok');
  });

  it('KRİTİK: bitişi geçmiş tek bütçe = süresi doldu', () => {
    const o = okuma({
      hesapButceleri: [butce({ baslangic: '2026-09-01 00:00:00', bitis: '2026-09-30 23:59:59' })],
    });
    expect(googleOdemeKarari(o, SIMDI)).toEqual({ durum: 'sorun', sebep: 'google_hesap_butcesi_suresi_doldu' });
  });

  it('eski bütçe bitmiş ama yenisi geçerli = sorun_yok', () => {
    const o = okuma({
      hesapButceleri: [
        butce({ baslangic: '2026-09-01 00:00:00', bitis: '2026-09-30 23:59:59' }),
        butce({}),
      ],
    });
    expect(googleOdemeKarari(o, SIMDI).durum).toBe('sorun_yok');
  });

  it('yalnız onay bekleyen bütçe = onay bekliyor', () => {
    const o = okuma({ hesapButceleri: [butce({ durum: 'PENDING' })] });
    expect(googleOdemeKarari(o, SIMDI)).toEqual({ durum: 'sorun', sebep: 'google_fatura_onay_bekliyor' });
  });
});

describe('googleOdemeKarari — BİLİNMİYOR, "sorun yok" değil', () => {
  it('KRİTİK: okuma hiç yapılmadı', () => {
    expect(googleOdemeKarari(null, SIMDI)).toEqual({ durum: 'bilinmiyor', neden: 'okunmadi' });
    expect(googleOdemeKarari({}, SIMDI)).toEqual({ durum: 'bilinmiyor', neden: 'okunmadi' });
  });

  it('KRİTİK: okuma düştü — boş listeler "yöntem yok" diye okunmuyor', () => {
    const o = okuma({ hata: 'PERMISSION_DENIED', faturaKurulumlari: [], hesapButceleri: [] });
    expect(googleOdemeKarari(o, SIMDI)).toEqual({ durum: 'bilinmiyor', neden: 'okunamadi', hata: 'PERMISSION_DENIED' });
  });

  it('bütçe var ama kurulum dönmedi (toplu faturalama olabilir) = tahmin yok', () => {
    const o = okuma({ faturaKurulumlari: [], hesapButceleri: [butce({})] });
    expect(googleOdemeKarari(o, SIMDI)).toEqual({ durum: 'bilinmiyor', neden: 'kurulum_yok' });
  });

  it('kurulum onaylı ama hiç bütçe yok = tahmin yok', () => {
    expect(googleOdemeKarari(okuma({ hesapButceleri: [] }), SIMDI)).toEqual({ durum: 'bilinmiyor', neden: 'butce_yok' });
  });

  it('harcanan okunamıyorsa bütçe dolmuş SAYILMIYOR', () => {
    const o = okuma({ hesapButceleri: [butce({ harcananMicros: null })] });
    expect(googleOdemeKarari(o, SIMDI).durum).toBe('sorun_yok');
  });
});

describe('hesapOdemeKarari — platform ayrımı', () => {
  it('Google SUSPENDED, okuma sağlam olsa da önce gelir', () => {
    expect(hesapOdemeKarari({ platform: 'google', raw: { status: 'SUSPENDED' }, odemeDurumu: okuma() }, SIMDI)).toEqual({
      durum: 'sorun',
      sebep: 'google_hesap_askida',
    });
  });

  it('Meta 3 / 9 / 1 / okunamayan', () => {
    const m = (raw: unknown) => hesapOdemeKarari({ platform: 'meta', raw, odemeDurumu: null }, SIMDI);
    expect(m({ account_status: 3 })).toEqual({ durum: 'sorun', sebep: 'meta_bakiye_odenmemis' });
    expect(m({ account_status: 9 })).toEqual({ durum: 'sorun', sebep: 'meta_odeme_bekliyor' });
    expect(m({ account_status: 1 })).toEqual({ durum: 'sorun_yok' });
    expect(m({})).toEqual({ durum: 'bilinmiyor', neden: 'okunmadi' });
  });
});

describe('googleOdemeOzeti — REST yanıtının indirgenmesi', () => {
  it('camelCase alanlar, metin int64 ve oneof sınır', () => {
    const o = googleOdemeOzeti(
      [{ billingSetup: { status: 'APPROVED', startDateTime: '2025-01-01 00:00:00', endTimeType: 'FOREVER' } }],
      [
        {
          accountBudget: {
            status: 'APPROVED',
            approvedStartDateTime: '2026-10-01 00:00:00',
            approvedEndTimeType: 'FOREVER',
            approvedSpendingLimitMicros: '500000000',
            adjustedSpendingLimitMicros: '450000000',
            amountServedMicros: '450000000',
          },
        },
        { accountBudget: { status: 'APPROVED', approvedSpendingLimitType: 'INFINITE', amountServedMicros: '1' } },
      ],
      SIMDI,
    );
    expect(o.faturaKurulumlari).toEqual([{ durum: 'APPROVED', baslangic: '2025-01-01 00:00:00', bitis: null }]);
    // Ayarlanmış sınır (düzeltmeler dahil) onaylıdan önce geliyor.
    expect(o.hesapButceleri[0]).toMatchObject({ limitMicros: '450000000', limitSuresiz: false, bitisSuresiz: true });
    expect(o.hesapButceleri[1]).toMatchObject({ limitMicros: null, limitSuresiz: true });
    // Biri dolmuş, biri sınırsız: hesap hâlâ harcayabiliyor.
    expect(googleOdemeKarari(o, SIMDI).durum).toBe('sorun_yok');
  });
});

describe('uyarı ve teslimat aynı kararı söylüyor', () => {
  function hesap(odemeDurumu: unknown): UyariHesabi {
    return {
      id: 'g1',
      name: 'Ege Birlik Google',
      platform: 'google',
      status: 'active',
      syncEnabled: true,
      lastInsightsSyncAt: SIMDI,
      lastStructureSyncAt: SIMDI,
      updatedAt: SIMDI,
      raw: { status: 'ENABLED' },
      odemeDurumu,
      externalId: '5161746317',
      clientId: 'c1',
      clientName: 'Ege Birlik',
      connectionStatus: 'active',
      connectionTokenExpiresAt: null,
    };
  }

  it('KRİTİK: ENABLED + ödeme yöntemi yok → bantta error, sebep kodu ve ödeme ekranı adresi', () => {
    const [u] = hesapUyarilari(hesap(okuma({ faturaKurulumlari: [], hesapButceleri: [] })), SIMDI);
    expect(u).toMatchObject({
      kod: 'hesap_odeme_sorunu',
      siddet: 'error',
      odemeSebebi: 'google_odeme_yontemi_yok',
      odemeAdresi: 'https://ads.google.com/aw/billing/summary',
      // Verinin anı ödeme okumasının anı, hesabın updatedAt'i değil.
      veriZamani: '2026-10-19T11:30:00.000Z',
    });
    // Mail Türkçe metni okuyor: hesap numarası ekranda biçimli.
    expect(u!.detay).toContain('516-174-6317');
  });

  it('sağlam okumada ve okumasız hesapta uyarı YOK', () => {
    expect(hesapUyarilari(hesap(okuma()), SIMDI)).toEqual([]);
    expect(hesapUyarilari(hesap(null), SIMDI)).toEqual([]);
  });

  it('KRİTİK: hesapta ödeme sorunu varsa açık kampanya "Yayında" değil', () => {
    const t = teslimatDurumu({
      status: 'active',
      effectiveStatus: 'SERVING',
      ustDurum: null,
      kokDurum: null,
      seviye: 'campaign',
      hesapOdemeSorunu: true,
    });
    expect(t).toEqual({ yayinda: false, ad: 'Durdu: hesapta ödeme sorunu', kod: 'hesap_odeme' });
  });

  it('kullanıcının kendi durdurduğu kampanya kendi durumunu gösteriyor', () => {
    const t = teslimatDurumu({
      status: 'paused',
      effectiveStatus: null,
      ustDurum: null,
      kokDurum: null,
      seviye: 'campaign',
      hesapOdemeSorunu: true,
    });
    expect(t.ad).toBe('Duraklatıldı');
  });
});

describe('CANLIDAN ÖLÇÜLMÜŞ yanıtlar (2026-10-19, v25, 57 atanmış hesap)', () => {
  /*
   * 57 hesabın 57'sinde iki sorgu da hatasız döndü (alt hesapta yöneticinin
   * login-customer-id'siyle). 43'ü tek onaylı kurulum + süresiz sınırsız
   * bütçe; 14'ünde geçmiş kurulum/bütçe satırları var (bitişi geçmiş
   * APPROVED, CANCELLED, PENDING). Hiçbirinde "kurulum yok, bütçe var"
   * görülmedi. Aşağıdaki yanıtlar birebir canlıdan.
   */
  it('Yalı Spor: geçmiş bitmiş bütçeler + güncel süresiz bütçe = sorun_yok', () => {
    const o = googleOdemeOzeti(
      [
        { billingSetup: { status: 'APPROVED', endTimeType: 'FOREVER', startDateTime: '2025-09-02 08:55:26' } },
        { billingSetup: { status: 'APPROVED', startDateTime: '2021-08-13 14:08:18', endDateTime: '2025-09-02 08:54:46' } },
        { billingSetup: { status: 'CANCELLED', endTimeType: 'FOREVER', startDateTime: '2020-08-10 17:35:41' } },
      ],
      [
        { accountBudget: { status: 'APPROVED', approvedEndTimeType: 'FOREVER', adjustedSpendingLimitType: 'INFINITE', approvedStartDateTime: '2025-09-02 08:55:26', amountServedMicros: '11988652470000' } },
        { accountBudget: { status: 'APPROVED', adjustedSpendingLimitType: 'INFINITE', approvedStartDateTime: '2021-08-13 14:08:18', approvedEndDateTime: '2025-09-02 08:54:46', amountServedMicros: '23784897190000' } },
        { accountBudget: { status: 'APPROVED', approvedEndDateTime: '2019-09-01 00:33:24', adjustedSpendingLimitMicros: '145650510000', amountServedMicros: '145544920000' } },
      ],
      SIMDI,
    );
    expect(googleOdemeKarari(o, SIMDI)).toEqual({ durum: 'sorun_yok' });
  });

  it('Tınaztepe: sınırlı süresiz bütçe %99,2 dolu = henüz sorun DEĞİL; sınıra ulaşınca doldu', () => {
    const kurulum = [{ billingSetup: { status: 'APPROVED', endTimeType: 'FOREVER', startDateTime: '2019-12-25 11:22:25' } }];
    const butce = (harcanan: string) => [
      { accountBudget: { status: 'APPROVED', approvedEndTimeType: 'FOREVER', approvedStartDateTime: '2026-06-01 16:32:08', adjustedSpendingLimitMicros: '20545010000', amountServedMicros: harcanan } },
      { accountBudget: { status: 'APPROVED', approvedStartDateTime: '2026-04-29 10:33:43', approvedEndDateTime: '2026-06-01 16:32:08', adjustedSpendingLimitMicros: '20031840000', amountServedMicros: '20030890000' } },
    ];
    expect(googleOdemeKarari(googleOdemeOzeti(kurulum, butce('20375130000'), SIMDI), SIMDI).durum).toBe('sorun_yok');
    expect(googleOdemeKarari(googleOdemeOzeti(kurulum, butce('20545010000'), SIMDI), SIMDI)).toEqual({
      durum: 'sorun',
      sebep: 'google_hesap_butcesi_bitti',
    });
  });

  it('MySun: onaylı kurulumun yanında PENDING olan = sorun_yok (geçerli kurulum yeter)', () => {
    const o = googleOdemeOzeti(
      [{ billingSetup: { status: 'APPROVED' } }, { billingSetup: { status: 'PENDING' } }],
      [{ accountBudget: { status: 'APPROVED', approvedEndTimeType: 'FOREVER', adjustedSpendingLimitType: 'INFINITE', amountServedMicros: '1543526450000' } }],
      SIMDI,
    );
    expect(googleOdemeKarari(o, SIMDI)).toEqual({ durum: 'sorun_yok' });
  });
});
