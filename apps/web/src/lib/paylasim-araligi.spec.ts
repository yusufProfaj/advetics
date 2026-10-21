import { describe, expect, it } from 'vitest';
import { gunEkle, paylasimSiniri } from '@advetics/shared';
import { onAyarEtiketi, resolveRange, today } from './date-range';
import { PAYLASIM_ON_AYARLARI, paylasimSecimiCoz } from './paylasim-araligi';

/**
 * Rapor linkinin adresteki aralığı (`/r/[token]?aralik=…`). Sunucu sınırı
 * zaten uyguluyor (`apps/api/.../paylasim-araligi.spec.ts`); buradaki iş
 * kişiye NEDENİ kendi dilinde yazmak ve hiçbir hâlde sessizce başka döneme
 * düşmemek.
 */
const BUGUN = today();

describe('paylasimSecimiCoz', () => {
  it('adreste aralık yoksa paylaşılan dönem', () => {
    expect(paylasimSecimiCoz({}, BUGUN, 'tr')).toEqual({ tur: 'varsayilan' });
  });

  it('linkte sunulan dört ön ayar güne çevrilir', () => {
    for (const k of PAYLASIM_ON_AYARLARI) {
      const s = paylasimSecimiCoz({ aralik: k }, BUGUN, 'tr');
      const r = resolveRange({ aralik: k });
      expect(s).toMatchObject({ tur: 'secim', aralik: { key: k, from: r.from, to: r.to, karsilastirma: 'yok' } });
    }
  });

  it('özel aralık OLDUĞU GİBİ uygulanır', () => {
    const s = paylasimSecimiCoz({ aralik: 'ozel', baslangic: '2026-08-01', bitis: '2026-08-15' }, BUGUN, 'tr');
    expect(s).toMatchObject({ tur: 'secim', aralik: { from: '2026-08-01', to: '2026-08-15' } });
  });

  it('KRİTİK: sunulmayan ön ayar ("Tüm zamanlar" oturum ister) ve bilinmeyen değer hata, varsayılana sessiz düşüş YOK', () => {
    for (const aralik of ['tum_zamanlar', '90g', 'saçma']) {
      expect(paylasimSecimiCoz({ aralik }, BUGUN, 'tr').tur).toBe('hata');
    }
  });

  it('KRİTİK: bozuk özel tarih hata (panelin `resolveRange`i gibi 30 güne DÜŞMEZ)', () => {
    const s = paylasimSecimiCoz({ aralik: 'ozel', baslangic: '2026-02-31', bitis: '2026-03-05' }, BUGUN, 'tr');
    expect(s.tur).toBe('hata');
  });

  it('KRİTİK: sınırın öncesi hata ve neden ekranın dilinde', () => {
    const erken = paylasimSiniri(BUGUN).enErken;
    const q = { aralik: 'ozel', baslangic: gunEkle(erken, -1), bitis: gunEkle(erken, 5) };
    const tr = paylasimSecimiCoz(q, BUGUN, 'tr');
    const en = paylasimSecimiCoz(q, BUGUN, 'en');
    expect(tr).toMatchObject({ tur: 'hata', neden: expect.stringContaining('en erken') });
    expect(en).toMatchObject({ tur: 'hata', neden: expect.stringContaining('onwards') });
    // Sınırın kendisi açılır.
    expect(paylasimSecimiCoz({ ...q, baslangic: erken }, BUGUN, 'tr').tur).toBe('secim');
  });

  it('KRİTİK: 400 günü aşan özel aralık KIRPILMAZ, reddedilir', () => {
    const s = paylasimSecimiCoz({ aralik: 'ozel', baslangic: gunEkle(BUGUN, -400), bitis: BUGUN }, BUGUN, 'tr');
    expect(s).toMatchObject({ tur: 'hata', neden: expect.stringContaining('400') });
  });

  it('gelecek gün hata', () => {
    const s = paylasimSecimiCoz({ aralik: 'ozel', baslangic: BUGUN, bitis: gunEkle(BUGUN, 1) }, BUGUN, 'tr');
    expect(s.tur).toBe('hata');
  });
});

describe('"Paylaşılan aralık" etiketi', () => {
  it('KRİTİK: anahtarın kendi adı var (bilinmeyen anahtar "Son 30 gün"e düşüyordu)', () => {
    expect(onAyarEtiketi('paylasilan', 'tr')).toBe('Paylaşılan aralık');
    expect(onAyarEtiketi('paylasilan', 'en')).toBe('Shared period');
  });
});
