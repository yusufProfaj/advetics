import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OLCULMEYEN_DEGISIKLIKLER, type Etki, type EtkiListesi } from '@advetics/shared';
import {
  aralikMetni,
  ayrintiVar,
  bosMetni,
  dipnot,
  ekCumleler,
  etkiAdresi,
  etkiGrafikYollari,
  etkiKutuHali,
  etkiListeYolu,
  etkiOzeti,
  kanitKutulari,
  kartEtkiSatiri,
  satirBasligi,
  satirYolu,
  sonucRozeti,
} from './etki';
import { SEKMELER, SEKME_ETIKETI, sekmeCoz } from './iyilestir';

/**
 * İYİLEŞTİR › ETKİSİ — saf kararlar ÇALIŞTIRILARAK, bağlar yorumsuz kaynak
 * taramasıyla (bileşen render altyapısı yok, vitest.config.ts).
 */

function etki(ek: Partial<Etki> = {}): Etki {
  return {
    id: 'e1',
    clientId: 'c1',
    platform: 'meta',
    adAccountId: 'a1',
    adAccountAdi: 'Hesap',
    kaynak: 'kampanya_eylemi',
    yol: 'iyilestir',
    yolRef: 'butce:k1',
    kim: 'Ayşe Kaya',
    tur: 'butce_azalt',
    degisiklikMetni: 'Bütçe 800 ₺ → 640 ₺',
    varlik: { seviye: 'campaign', id: 'k1', ad: 'Yeniden Pazarlama', ustAd: 'Hesap' },
    kapsam: { seviye: 'campaign', id: 'k1', ad: 'Yeniden Pazarlama' },
    kontrolMetni: 'Aynı hesaptaki 6 kampanya',
    birlikteOlculen: 0,
    zaman: '2026-09-29T09:00:00.000Z',
    gun: '2026-09-29',
    durum: 'sonuclandi',
    sonuc: 'iyilesti',
    neden: null,
    metrik: 'donusum_basi_maliyet',
    etkiOrani: -0.21,
    noktaGun: 7,
    sonrakiOlcum: null,
    once: { aralik: { bas: '2026-09-15', son: '2026-09-28' }, deger: '126,00 ₺', tiklama: 3410, donusum: 61 },
    sonra: { aralik: { bas: '2026-09-30', son: '2026-10-06' }, deger: '96,00 ₺', tiklama: 1520, donusum: 27 },
    kontrolDegisimi: -0.04,
    gozlem: null,
    cumle: 'Değişiklikten sonra dönüşüm başı maliyet, aynı hesapta değişmeyenlere göre %21 düştü.',
    ...ek,
  };
}

function liste(etkiler: Etki[], ek: Partial<EtkiListesi> = {}): EtkiListesi {
  return {
    etkiler,
    toplam: etkiler.length,
    sayilar: { bekliyor: 0, olcumde: 0, sonuclandi: etkiler.length, olculemedi: 0 },
    emptyReason: etkiler.length ? null : 'degisiklik_yok',
    sonHesaplama: '2026-10-12T04:21:00.000Z',
    olculmeyen: OLCULMEYEN_DEGISIKLIKLER,
    hatalar: [],
    uretildi: '2026-10-12T05:00:00.000Z',
    ...ek,
  };
}

describe('adresler', () => {
  it('liste ucu üreticiden; "hepsi" ve ilk sayfa adrese yazılmıyor', () => {
    expect(etkiListeYolu({ clientId: 'c1', durum: 'hepsi', sayfa: 1 })).toBe('/etki?clientId=c1');
    expect(etkiListeYolu({ clientId: 'c1', durum: 'kapali', yol: 'iyilestir', varlikId: 'v', sayfa: 2 })).toBe(
      '/etki?clientId=c1&durum=kapali&varlikId=v&yol=iyilestir&sayfa=2',
    );
    expect(etkiAdresi('c1')).toBe('/iyilestir?musteri=c1&sekme=etki');
  });

  it('KRİTİK: sekme Sinyaller’den sonra, adı "Etkisi", adresten çözülüyor', () => {
    expect(SEKMELER.slice(0, 3)).toEqual(['oneriler', 'sinyaller', 'etki']);
    expect(SEKME_ETIKETI.etki).toBe('Etkisi');
    expect(sekmeCoz('etki')).toBe('etki');
  });
});

describe('dört hâl ve boş nedeni', () => {
  it('KRİTİK: yükleniyor, hata, boş, dolu AYRI', () => {
    expect(etkiKutuHali(null)).toBe('yukleniyor');
    expect(etkiKutuHali({ durum: 'hata', mesaj: 'x' })).toBe('hata');
    expect(etkiKutuHali({ durum: 'tamam', liste: liste([]) })).toBe('bos');
    expect(etkiKutuHali({ durum: 'tamam', liste: liste([etki()]) })).toBe('dolu');
  });

  it('KRİTİK: üç boş nedeni üç ayrı cümle; neden bilinmiyorsa "değişiklik yok" DEMİYOR', () => {
    const b = ['kesif_kosmadi', 'degisiklik_yok', 'suzgec_bos'].map((n) => bosMetni(n as never).baslik);
    expect(new Set(b).size).toBe(3);
    expect(bosMetni('suzgec_bos').suzgec).toBe(true);
    expect(bosMetni(null).baslik).not.toMatch(/değişiklik yok/i);
  });
});

describe('satır', () => {
  it('KRİTİK: yeşil YALNIZ iyileşti; kırmızı kötüleşti; bekleyen içi boş', () => {
    expect(sonucRozeti({ durum: 'sonuclandi', sonuc: 'iyilesti' })).toEqual({ nokta: 'yesil', metin: 'İyileşti' });
    expect(sonucRozeti({ durum: 'sonuclandi', sonuc: 'kotulesti' }).nokta).toBe('kirmizi');
    expect(sonucRozeti({ durum: 'sonuclandi', sonuc: 'fark_yok' }).nokta).toBe('gri');
    expect(sonucRozeti({ durum: 'bekliyor', sonuc: null })).toEqual({ nokta: 'bos', metin: 'Ölçüm bekleniyor' });
    expect(sonucRozeti({ durum: 'olcumde', sonuc: 'henuz_belli_degil' })).toEqual({ nokta: 'gri', metin: 'Henüz belli değil' });
    expect(sonucRozeti({ durum: 'olculemedi', sonuc: null })).toEqual({ nokta: 'gri', metin: 'Ölçülemedi' });
  });

  it('başlık ve yol taslaktaki gibi', () => {
    expect(satirBasligi(etki())).toBe('Yeniden Pazarlama · Bütçe 800 ₺ → 640 ₺');
    expect(satirYolu(etki())).toBe('29 Eylül · İyileştir önerisi · Ayşe Kaya · Meta Ads');
  });

  it('KRİTİK: durdurmada ölçülen ÜST varlık ve birlikte ölçülenler yolda yazıyor; kuralda kural adı', () => {
    const e = etki({
      yol: 'kural',
      kim: 'Yorgun kreatif',
      tur: 'durdur',
      gun: '2026-10-08',
      varlik: { seviye: 'ad', id: 'r1', ad: 'Sonbahar görseli B', ustAd: 'Sonbahar Seti' },
      kapsam: { seviye: 'ad_group', id: 's1', ad: 'Sonbahar Seti' },
      birlikteOlculen: 1,
    });
    expect(satirYolu(e)).toBe('8 Ekim · Kural: Yorgun kreatif · ölçülen: Sonbahar Seti (reklam seti) · 2 değişiklik birlikte ölçüldü · Meta Ads');
    expect(satirYolu({ ...e, platform: 'google' })).toContain('(reklam grubu)');
  });

  it('gözlem ve tıklama maliyetine düşme cümleye ekleniyor', () => {
    expect(ekCumleler(etki({ gozlem: { onceGunlukHarcama: '420 ₺', sonraGunlukHarcama: '0 ₺', onceGunlukDonusum: 3, sonraGunlukDonusum: 0 } }))).toEqual([
      'Durmadan önce günde 420 ₺, sonra 0 ₺.',
    ]);
    expect(ekCumleler(etki({ metrik: 'tiklama_basi_maliyet', durum: 'olcumde' }))).toEqual(['Dönüşüm az olduğu için tıklama maliyetine bakılıyor.']);
  });

  it('kanıt kutuları ve dipnot; değer yoksa "ölçülemedi" (uydurma yok)', () => {
    expect(kanitKutulari(etki())).toEqual([
      { baslik: 'Önce (15-28 Eylül)', deger: '126,00 ₺', alt: '3.410 tık · 61 dönüşüm' },
      { baslik: 'Sonra (30 Eylül - 6 Ekim)', deger: '96,00 ₺', alt: '1.520 tık · 27 dönüşüm' },
      { baslik: 'Aynı hesaptaki 6 kampanya', deger: '%-4', alt: 'aynı dönemde değişim' },
    ]);
    expect(kanitKutulari(etki({ kontrolDegisimi: null }))[2]!.deger).toBe('ölçülemedi');
    expect(dipnot(etki())).toContain('Meta ya da Google arayüzünden aynı dönemde değişiklik yaptıysanız sonuç onu da içerir.');
    expect(ayrintiVar(etki({ once: null }))).toBe(false);
    expect(aralikMetni({ bas: '2026-12-29', son: '2027-01-04' })).toBe('29 Aralık - 4 Ocak');
  });
});

describe('özet şeridi', () => {
  it('KRİTİK: iyileşen/kötüleşen yalnız liste EKSİKSİZSE sayılıyor (sayfalı listeden sayım yalan söylerdi)', () => {
    const tam = liste([etki(), etki({ id: 'e2', sonuc: 'kotulesti' }), etki({ id: 'e3', durum: 'bekliyor', sonuc: null, sonrakiOlcum: '2026-10-15' })]);
    expect(etkiOzeti(tam, 'hepsi')).toMatchObject({ iyilesen: 1, kotulesen: 1, siradaki: '2026-10-15' });
    expect(etkiOzeti({ ...tam, toplam: 120 }, 'hepsi')).toMatchObject({ iyilesen: null, kotulesen: null });
    expect(etkiOzeti(tam, 'kapali').iyilesen).toBeNull();
  });
});

describe('grafik', () => {
  it('boş gün çizgiyi kesiyor (uydurma ara nokta yok); değişiklik günü işaretli', () => {
    const y = etkiGrafikYollari({ gunler: ['a', 'b', 'c', 'd'], deney: [10, null, 20, 30], kontrol: [null, null, null, null], degisiklikGunu: 'c' })!;
    expect(y.deney.match(/M/g)).toHaveLength(2);
    expect(y.kontrol).toBeNull();
    expect(y.degisiklikX).toBe(200);
    expect(etkiGrafikYollari({ gunler: ['a'], deney: [null], kontrol: [null], degisiklikGunu: 'a' })).toBeNull();
  });
});

describe('öneri kartının altı', () => {
  it('KRİTİK: dört hâl; eşleşme ÖNERİ ANAHTARIYLA (aynı varlığa başka yoldan gelen değişiklik değil)', () => {
    expect(kartEtkiSatiri(null, 'butce:k1').metin).toMatch(/yükleniyor/);
    expect(kartEtkiSatiri({ durum: 'hata', mesaj: 'Workspace bulunamadı.' }, 'butce:k1').metin).toBe('Etki bilgisi alınamadı: Workspace bulunamadı.');
    const l = liste([etki({ yol: 'reklam_yoneticisi', yolRef: null }), etki({ id: 'e2', durum: 'bekliyor', sonuc: null, cumle: 'Etki 18 Ekim tarihinde ölçülecek.' })]);
    expect(kartEtkiSatiri({ durum: 'tamam', liste: l }, 'butce:k1')).toEqual({ nokta: 'bos', metin: 'Etki 18 Ekim tarihinde ölçülecek.', bagli: true });
    expect(kartEtkiSatiri({ durum: 'tamam', liste: l }, 'baska').bagli).toBe(false);
  });
});

/* ── Kaynak: bağlar (yorumsuz) ── */
const yorumsuz = (yol: string) =>
  readFileSync(join(__dirname, '..', yol), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('kaynak: bağlar', () => {
  const SEKME = yorumsuz('components/iyilestir/etki-sekmesi.tsx');
  const SAYFA = yorumsuz('app/(dashboard)/iyilestir/page.tsx');
  const ONERILER = yorumsuz('components/iyilestir/oneriler-sekmesi.tsx');
  const KART = yorumsuz('components/iyilestir/oneri-karti.tsx');
  const LIB = yorumsuz('lib/etki.ts');

  it('KRİTİK: hata boş listeye çevrilmiyor; dört hâl de çiziliyor', () => {
    expect(SEKME).not.toMatch(/\.catch\(\s*\(\)\s*=>\s*set\w+\(\s*\[\s*\]\s*\)/);
    for (const h of ["hal === 'yukleniyor'", "sonuc?.durum === 'hata'", "hal === 'bos'", "hal === 'dolu'"]) expect(SEKME).toContain(h);
    expect(SEKME).toContain('Sunucunun cevabı: {sonuc.mesaj}');
  });

  it('KRİTİK: ayrıntı DOM’dan ÇIKMIYOR (görünürlük data-acik ile), ölçülmeyenler her zaman', () => {
    // 2026-10-14 birleşik tasarım: modül sınıfı (`i.eAyrinti`) yerine
    // `AYRINTI_KAP` (grid-rows geçişi). İddia aynı: kap koşulsuz çiziliyor,
    // açıklık yalnız `data-acik` ile ve kapalıyken `inert`.
    const i = SEKME.indexOf('className={AYRINTI_KAP}');
    expect(i).toBeGreaterThan(-1);
    const etiket = SEKME.slice(i, SEKME.indexOf('>', i));
    expect(etiket).toContain('data-acik={acik}');
    expect(etiket).toContain('inert={!acik}');
    expect(SEKME).toMatch(/const AYRINTI_KAP =\s*'[^']*data-\[acik=true\]:grid-rows-\[1fr\]/);
    expect(SEKME).not.toMatch(/\{acik && \(/);
    expect(SEKME).toContain('sonListe.olculmeyen.map(');
  });

  it('KRİTİK: sayfa sekmeyi çiziyor ve Öneriler’e etki sonucunu veriyor; kart satırı yalnız UYGULANMIŞ kartta', () => {
    expect(SAYFA).toContain("{sekme === 'etki' && etkiSonucu && <EtkiSekmesi clientId={clientId} ilk={etkiSonucu} />}");
    expect(SAYFA).toContain('etki={etkiSonucu}');
    expect(SAYFA).toContain("yol: sekme === 'oneriler' ? 'iyilestir' : undefined");
    expect(ONERILER).toContain("etkiSatiri={o.durum === 'uygulandi' ? kartEtkiSatiri(etki, o.anahtar) : null}");
    expect(KART).toContain('{etkiSatiri && (');
  });

  it('kullanıcıya görünen metinde uzun tire yok (panel metin dili)', () => {
    for (const k of [SEKME, LIB]) expect(k).not.toContain('—');
  });
});
