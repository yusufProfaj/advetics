import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RANGE,
  MAX_GUN,
  RANGE_PRESETS,
  gunEkle,
  gunSayisi,
  karsilastirmaPenceresi,
  rangeParams,
  resolveRange,
  today,
} from './date-range';

/**
 * Tarih aralığı çözümlemesi.
 *
 * NEDEN BU TEST VAR: bir günlük kayma HİÇBİR HATA ÜRETMİYOR. Panel çalışır,
 * sayılar görünür, yalnızca yanlış günün verisidir — ve kimse fark etmez.
 * Bu projede daha önce tam olarak bu oldu: panel bugünü dışlarken rapor içine
 * alıyordu ve iki ekran farklı rakam gösteriyordu.
 */
describe('resolveRange — ön ayarlar', () => {
  it('Google Ads listesindeki ön ayarların HEPSİ tanımlı ve SIRASI aynı', () => {
    // Sıra testte yazılı çünkü ekrandaki liste bundan üretiliyor; biri
    // silinirse panelde sessizce kaybolur.
    expect(RANGE_PRESETS.map((p) => p.key)).toEqual([
      'bugun',
      'dun',
      'bu_hafta',
      '7g',
      'gecen_hafta',
      '14g',
      'bu_ay',
      '30g',
      'gecen_ay',
      '90g',
      'tum_zamanlar',
    ]);
  });

  it('her ön ayar geçerli bir pencere üretiyor (from <= to)', () => {
    for (const p of RANGE_PRESETS) {
      const r = resolveRange({ aralik: p.key });
      expect(r.from <= r.to, `${p.key} ters pencere`).toBe(true);
    }
  });

  it('sabit gün sayılı ön ayarlar TAM o kadar gün kapsıyor', () => {
    // Eksi bir hatası burada en kolay yapılan hata.
    for (const [key, gun] of [
      ['dun', 1],
      ['7g', 7],
      ['14g', 14],
      ['30g', 30],
      ['90g', 90],
    ] as const) {
      const r = resolveRange({ aralik: key });
      expect(gunSayisi(r.from, r.to), key).toBe(gun);
    }
  });

  it('bilinmeyen değer sessizce varsayılana düşüyor', () => {
    // URL elle düzenlenebiliyor; hata sayfası yerine çalışan panel.
    expect(resolveRange('hoyratbirdeger').key).toBe(DEFAULT_RANGE);
    expect(resolveRange(undefined).key).toBe(DEFAULT_RANGE);
  });

  it('BUGÜN ve BU HAFTA/BU AY bugünü içeriyor ve tamamlanmamış işaretleniyor', () => {
    for (const key of ['bugun', 'bu_hafta', 'bu_ay'] as const) {
      const r = resolveRange({ aralik: key });
      expect(r.to, key).toBe(today());
      expect(r.incomplete, key).toBe(true);
    }
  });

  it('KRİTİK: geriye dönük ön ayarların hiçbiri bugünü içermiyor', () => {
    // Tamamlanmamış bir günü çok günlük ortalamaya katmak bütün oranları
    // aşağı çekiyor ve "CPA düştü" yanılsaması üretiyor.
    for (const p of RANGE_PRESETS.filter((x) => !x.bugunDahil)) {
      const r = resolveRange({ aralik: p.key });
      expect(r.to < today(), `${p.key} bugünü içeriyor`).toBe(true);
      expect(r.incomplete, p.key).toBe(false);
    }
  });

  it('BU HAFTA pazartesiden başlıyor', () => {
    const r = resolveRange({ aralik: 'bu_hafta' });
    const gun = new Date(`${r.from}T00:00:00Z`).getUTCDay();
    expect(gun).toBe(1);
  });

  it('GEÇEN HAFTA tam 7 gün ve pazartesi–pazar', () => {
    const r = resolveRange({ aralik: 'gecen_hafta' });
    expect(gunSayisi(r.from, r.to)).toBe(7);
    expect(new Date(`${r.from}T00:00:00Z`).getUTCDay()).toBe(1);
    expect(new Date(`${r.to}T00:00:00Z`).getUTCDay()).toBe(0);
  });

  it('BU AY ayın 1’inden başlıyor, GEÇEN AY tam bir takvim ayı', () => {
    expect(resolveRange({ aralik: 'bu_ay' }).from.slice(8)).toBe('01');
    const g = resolveRange({ aralik: 'gecen_ay' });
    expect(g.from.slice(8)).toBe('01');
    // Bitiş ayın son günü: bir gün sonrası yeni aya geçmeli.
    expect(gunEkle(g.to, 1).slice(8)).toBe('01');
    expect(g.from.slice(0, 7)).toBe(g.to.slice(0, 7));
  });
});

describe('tüm zamanlar', () => {
  it('EN ESKİ GÜNDEN başlıyor — sabit bir yıldan değil', () => {
    const enEski = gunEkle(today(), -200);
    const r = resolveRange({ aralik: 'tum_zamanlar', enEskiGun: enEski });
    expect(r.from).toBe(enEski);
  });

  it('en eski gün bilinmiyorsa 90 güne düşüyor — uydurma başlangıç YOK', () => {
    const r = resolveRange({ aralik: 'tum_zamanlar' });
    expect(gunSayisi(r.from, r.to)).toBe(90);
  });

  it('KRİTİK: 400 günü aşarsa KIRPILIYOR ve kırpıldığı SÖYLENİYOR', () => {
    // Sunucu 400 günden uzun aralığı reddediyor; kırpmasak kullanıcı boş bir
    // hata sayfası görürdü. Sessizce kırpsak da "tüm zamanlar" diye bakıp
    // eksik veriye bakardı.
    const r = resolveRange({ aralik: 'tum_zamanlar', enEskiGun: gunEkle(today(), -1500) });
    expect(gunSayisi(r.from, r.to)).toBe(MAX_GUN);
    expect(r.kirpildi).toBe(true);
  });

  it('kırpma gerekmiyorsa bayrak KAPALI', () => {
    expect(resolveRange({ aralik: '30g' }).kirpildi).toBe(false);
  });
});

describe('özel aralık', () => {
  it('geçerli özel aralık aynen kullanılıyor', () => {
    const r = resolveRange({ aralik: 'ozel', baslangic: '2026-07-01', bitis: '2026-07-31' });
    expect([r.from, r.to]).toEqual(['2026-07-01', '2026-07-31']);
    expect(r.days).toBe(31);
    expect(r.hata).toBeNull();
  });

  it('KRİTİK: geçersiz tarih SESSİZCE YUTULMUYOR', () => {
    /*
     * Eski sürüm bilinmeyen her değeri 30 güne düşürüyordu. Özel aralık
     * eklenince bu bir sessiz hataya dönüşürdü: kullanıcı 30 günlük veriye
     * bakıp doğru aralığa baktığını sanardı — CLAUDE.md'nin yasakladığı
     * hata türü.
     */
    const r = resolveRange({ aralik: 'ozel', baslangic: '2026-13-01', bitis: '2026-07-31' });
    expect(r.hata).not.toBeNull();
    expect(r.key).toBe(DEFAULT_RANGE);
  });

  it('takvimde olmayan gün (31 Şubat) geçersiz sayılıyor', () => {
    // ISO biçimine uyuyor ama böyle bir gün yok; `new Date` sessizce
    // 3 Mart'a kaydırıyor.
    expect(resolveRange({ aralik: 'ozel', baslangic: '2026-02-31', bitis: '2026-03-01' }).hata)
      .not.toBeNull();
  });

  it('ters aralık DÜZELTİLİYOR ve söyleniyor', () => {
    const r = resolveRange({ aralik: 'ozel', baslangic: '2026-07-31', bitis: '2026-07-01' });
    expect([r.from, r.to]).toEqual(['2026-07-01', '2026-07-31']);
    expect(r.hata).not.toBeNull();
  });

  it('özel aralık da 400 güne kırpılıyor', () => {
    const r = resolveRange({ aralik: 'ozel', baslangic: '2020-01-01', bitis: '2026-01-01' });
    expect(gunSayisi(r.from, r.to)).toBe(MAX_GUN);
    expect(r.kirpildi).toBe(true);
  });
});

describe('karşılaştırma penceresi', () => {
  it('varsayılan KAPALI — her sorguda ikinci bir tarama bedava değil', () => {
    const r = resolveRange({ aralik: '30g' });
    expect(r.karsilastirma).toBe('yok');
    expect(r.compareFrom).toBeNull();
  });

  it('ÖNCEKİ DÖNEM aynı uzunlukta ve hemen öncesi', () => {
    // 7 günlük bakışı 30 günlük dönemle karşılaştırmak yüzdeyi anlamsız kılar.
    const k = karsilastirmaPenceresi('2026-08-01', '2026-08-07', 'onceki_donem');
    expect(k).toEqual({ from: '2026-07-25', to: '2026-07-31' });
  });

  it('önceki dönem cari dönemle ÖRTÜŞMÜYOR', () => {
    const r = resolveRange({ aralik: '30g', karsilastir: 'onceki_donem' });
    expect(r.compareTo! < r.from).toBe(true);
    expect(gunSayisi(r.compareFrom!, r.compareTo!)).toBe(r.days);
  });

  it('ÖNCEKİ YIL 364 gün geriye — 365 DEĞİL, haftanın günleri hizalansın', () => {
    // 52 tam hafta. Perşembeyi Perşembeyle karşılaştırmak, hafta sonu etkisi
    // olan hesaplarda tek başına büyük fark üretiyor.
    const k = karsilastirmaPenceresi('2026-08-06', '2026-08-12', 'onceki_yil')!;
    expect(new Date(`${k.from}T00:00:00Z`).getUTCDay()).toBe(
      new Date('2026-08-06T00:00:00Z').getUTCDay(),
    );
    expect(k.from).toBe('2025-08-07');
  });

  it('bilinmeyen karşılaştırma değeri KAPALI sayılıyor', () => {
    expect(resolveRange({ aralik: '30g', karsilastir: 'zart' }).karsilastirma).toBe('yok');
  });
});

describe('rangeParams', () => {
  it('ön ayarda yalnızca anahtar taşınıyor', () => {
    expect(rangeParams(resolveRange({ aralik: '7g' }))).toEqual({
      aralik: '7g',
      baslangic: undefined,
      bitis: undefined,
      karsilastir: undefined,
    });
  });

  it('KRİTİK: özel aralıkta tarihler de taşınıyor', () => {
    // Taşınmazsa kullanıcı özel tarih seçip bir süzgece bastığında aralık
    // sessizce 30 güne döner — "aralık bazen kayboluyor" belirtisi.
    expect(rangeParams(resolveRange({ aralik: 'ozel', baslangic: '2026-07-01', bitis: '2026-07-31' })))
      .toEqual({
        aralik: 'ozel',
        baslangic: '2026-07-01',
        bitis: '2026-07-31',
        karsilastir: undefined,
      });
  });

  it('karşılaştırma açıkken o da taşınıyor', () => {
    expect(rangeParams(resolveRange({ aralik: '7g', karsilastir: 'onceki_yil' })).karsilastir).toBe(
      'onceki_yil',
    );
  });
});
