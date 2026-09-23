import { describe, expect, it } from 'vitest';
import { workspaceAcilacaklar, workspaceAdi, type HavuzOgesi } from './havuz';

/**
 * "HER BİRİNE WORKSPACE AÇ" — HANGİ HESAPLAR, HANGİ ADLA.
 *
 * Çalıştırılarak sınanıyor: karar bir süzgeç ve yanlışı sessiz. Ajansın
 * havuzu yüzlerce hesap taşıyor; süzgeç bir koşulu kaçırırsa tek tık
 * yüzlerce yanlış workspace açar.
 */
function oge(over: Partial<HavuzOgesi> & { sahip?: 'ajans' | 'sirket'; durum?: HavuzOgesi['baglanti']['durum'] } = {}): HavuzOgesi {
  const { sahip = 'sirket', durum = 'active', ...geri } = over;
  return {
    id: 'acc',
    name: '3A Makina Kurumsal',
    externalId: 'act_1',
    isManager: false,
    reklamHesabi: true,
    atamaYolu: '/connections/ad-accounts/acc/client',
    baglanti: { etiket: '3A Meta', durum, sahip },
    ...geri,
  };
}

describe('workspaceAcilacaklar', () => {
  it('şirketin kendi bağlantısındaki reklam hesabı aday', () => {
    expect(workspaceAcilacaklar([oge()])).toHaveLength(1);
  });

  it('KRİTİK: AJANSIN hesabı aday DEĞİL — ajans havuzunda düğme yüzlerce workspace açardı', () => {
    expect(workspaceAcilacaklar([oge({ sahip: 'ajans' })])).toEqual([]);
  });

  it('KRİTİK: kaldırılmış bağlantının satırı aday değil — veri çekmeyen boş workspace açılmasın', () => {
    expect(workspaceAcilacaklar([oge({ durum: 'revoked' })])).toEqual([]);
  });

  it('yönetici (MCC) hesabı ve sayfa aday değil', () => {
    expect(workspaceAcilacaklar([oge({ isManager: true }), oge({ reklamHesabi: false })])).toEqual([]);
  });
});

describe('workspaceAdi', () => {
  it('hesabın adı kullanılıyor', () => {
    expect(workspaceAdi({ name: '  3A Makina Kurumsal ', externalId: 'act_1' })).toBe('3A Makina Kurumsal');
  });

  it('KRİTİK: ad boş ya da tek harfse dış kimlik — sunucu 2 karakterden kısayı reddediyor', () => {
    expect(workspaceAdi({ name: 'x', externalId: 'act_1' })).toBe('act_1');
    expect(workspaceAdi({ name: '', externalId: 'act_1' })).toBe('act_1');
  });

  it('120 karakterde kesiliyor — sunucunun sınırı', () => {
    expect(workspaceAdi({ name: 'a'.repeat(200), externalId: 'x' })).toHaveLength(120);
  });
});
