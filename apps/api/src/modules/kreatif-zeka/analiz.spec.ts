import { describe, expect, it } from 'vitest';
import { harcamaEsigiMicros, type GoruEtiketleri, type KreatifEtiketleri } from '@advetics/shared';
import { analiz, type AnalizGirdisi, type IcerikBilgisi } from './analiz';
import type { PencereSatiri } from './pencere';

/**
 * ═══ PUAN, KOVA, FARKLAR — ÇALIŞTIRILARAK ═══
 *
 * Sayıların kendisi shared'da sınandı (`sozlesme.spec.ts`); burada KİMİN
 * KİMİNLE karşılaştırıldığı: kendisi hariç benzer, yalnız eşiği geçmiş,
 * yalnız aynı küme, yalnız etiketli; iki değerli alanda daha iyi olanın
 * "değer" tarafına geçmesi; brief'e yalnız daha iyi giden anlamlı farkın
 * girmesi.
 */

const BUGUN = '2026-10-12';
const ESKI = '2026-07-01';
const YENI = '2026-10-08';
const ESIK = harcamaEsigiMicros('TRY', null);

const TEMEL: GoruEtiketleri = {
  insan: 'yok',
  urun_gorunur: 'var',
  metin_yogunlugu: 'az',
  baskin_renk: 'notr',
  eylem_cagrisi_gorselde: 'yok',
  fiyat_veya_indirim: 'yok',
  logo_gorunur: 'var',
  gorsel_turu: 'fotograf',
};

let n = 0;
function satir(o: Partial<PencereSatiri> & { tiklama: number }): PencereSatiri {
  n++;
  return {
    creativeId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    platform: 'meta',
    adAccountId: 'h',
    adId: `ad-${n}`,
    adAdi: `Reklam ${n}`,
    kampanyaAdi: 'K',
    objective: 'OUTCOME_SALES',
    gosterim: 10_000,
    donusum: 0,
    harcamaMicros: 2_000_000_000n,
    kurEksik: false,
    ...o,
  };
}

function girdi(pencere: PencereSatiri[], etiket: Record<string, Partial<GoruEtiketleri>>, ek: Partial<AnalizGirdisi> = {}): AnalizGirdisi {
  const icerik = new Map<string, IcerikBilgisi>();
  for (const p of pencere) {
    const e = etiket[p.creativeId];
    icerik.set(p.creativeId, {
      durum: e ? 'etiketlendi' : 'bekliyor',
      neden: null,
      etiketler: e ? ({ ...TEMEL, ...e, bicim: 'gorsel', en_boy: 'kare' } as KreatifEtiketleri) : null,
      kismi: null,
    });
  }
  return {
    pencere,
    ilkGosterim: new Map(pencere.map((p) => [p.creativeId, ESKI])),
    icerik,
    esikMicros: ESIK,
    paraBirimi: 'TRY',
    yorgunReklamlar: new Set(),
    bugun: BUGUN,
    ...ek,
  };
}

/** İnsanlı 6 kreatif ~%3 tıklama oranı, insansız 6 kreatif ~%1. */
function insanliKume(insanIyi = true) {
  const p: PencereSatiri[] = [];
  const e: Record<string, Partial<GoruEtiketleri>> = {};
  for (let i = 0; i < 6; i++) {
    const a = satir({ tiklama: (insanIyi ? 300 : 100) + i * 3 });
    const b = satir({ tiklama: (insanIyi ? 100 : 300) + i * 3 });
    p.push(a, b);
    e[a.creativeId] = { insan: 'var' };
    e[b.creativeId] = { insan: 'yok' };
  }
  return { p, e };
}

describe('etiket farkları', () => {
  it('KRİTİK: anlamlı fark bulunuyor, cümle şablondan, brief bulgusuna giriyor', () => {
    const { p, e } = insanliKume();
    const { kumeler } = analiz(girdi(p, e));
    const k = kumeler[0]!;
    expect(k.ozet).toMatchObject({ anahtar: 'meta:satis', anaMetrik: 'tiklama_orani', metrikDusus: true });
    const insan = k.farklar.find((f) => f.alan === 'insan')!;
    expect(insan.fark.karar).toBe('anlamli');
    expect(insan).toMatchObject({ deger: 'var', karsi: 'yok' });
    expect(insan.cumle).toMatch(/^İnsan var: tıklama oranı %\d+ ile %\d+ arası daha yüksek \(6 ve 6 kreatif\)$/);
    expect(k.bulgular.map((b) => b.alan)).toEqual(['insan']);
  });

  it('KRİTİK: iki değerli alanda DAHA İYİ olan "değer" tarafına geçiyor (brief daha iyi gideni istiyor)', () => {
    const { p, e } = insanliKume(false);
    const insan = analiz(girdi(p, e)).kumeler[0]!.farklar.find((f) => f.alan === 'insan')!;
    expect(insan).toMatchObject({ deger: 'yok', karsi: 'var' });
    expect(insan.fark.goreliFark!).toBeGreaterThan(0);
  });

  it('etiketsiz ya da eşiği geçmemiş kreatif gruba GİRMİYOR', () => {
    const { p, e } = insanliKume();
    // Birinin etiketi silinir, birinin harcaması eşiğin altına iner: gruplar 5'e düşer.
    delete e[p[0]!.creativeId];
    p[2] = { ...p[2]!, harcamaMicros: 500_000_000n };
    const insan = analiz(girdi(p, e)).kumeler[0]!.farklar.find((f) => f.alan === 'insan')!;
    expect(insan.fark.a!.kreatif + insan.fark.b!.kreatif).toBe(10);
  });

  it('KRİTİK (Ö-4): AYNI görseli taşıyan 5 kreatif TEK örnek; "en az 5" eşiğini GEÇMİYOR', () => {
    const { p, e } = insanliKume();
    const g = girdi(p, e);
    // İnsanlı altı kreatiften beşi aynı görsel (Meta N-12), altıncısı ayrı.
    const insanli = p.filter((x) => e[x.creativeId]!.insan === 'var');
    insanli.forEach((x, i) => ((g.icerik.get(x.creativeId) as IcerikBilgisi).icerikOzeti = i < 5 ? 'a'.repeat(64) : 'b'.repeat(64)));
    const insan = analiz(g).kumeler[0]!.farklar.find((f) => f.alan === 'insan')!;
    expect(insan.fark.karar).toBe('yetersiz');
    expect(insan.fark.a!.kreatif + insan.fark.b!.kreatif).toBe(2 + 6);
    // Kontrol: özetler farklıysa aynı veri anlamlı.
    insanli.forEach((x, i) => ((g.icerik.get(x.creativeId) as IcerikBilgisi).icerikOzeti = String(i).repeat(64)));
    expect(analiz(g).kumeler[0]!.farklar.find((f) => f.alan === 'insan')!.fark.karar).toBe('anlamli');
  });

  it('aynı görselin harcaması ÖZET başına toplanıyor: tek başına eşik altı kreatifler birlikte eşiği geçiyor', () => {
    const { p, e } = insanliKume();
    // İki insansız kreatif eşiğin altında (300 ₺) ama aynı görsel: toplam 600 ₺ yine altında, 4 tanesi 1.200 ₺.
    const insansiz = p.filter((x) => e[x.creativeId]!.insan === 'yok');
    const g = girdi(
      p.map((x) => (insansiz.includes(x) ? { ...x, harcamaMicros: 300_000_000n } : x)),
      e,
    );
    insansiz.forEach((x, i) => ((g.icerik.get(x.creativeId) as IcerikBilgisi).icerikOzeti = i < 4 ? 'c'.repeat(64) : `${i}`.repeat(64)));
    const insan = analiz(g).kumeler[0]!.farklar.find((f) => f.alan === 'insan')!;
    // Dört kreatiflik görsel tek örnek ve eşiği geçiyor; tekil iki kreatif eşik altında kalıyor.
    expect(insan.fark.b?.kreatif ?? insan.fark.a?.kreatif).toBe(1);
  });

  it('üç değerli alanda her değer geri kalanların BİRLEŞİMİYLE; tek değerli kümede veri yetersiz', () => {
    const { p, e } = insanliKume();
    const yazi = analiz(girdi(p, e)).kumeler[0]!.farklar.filter((f) => f.alan === 'metin_yogunlugu');
    expect(yazi.map((f) => f.karsi).sort()).toEqual(['az,cok', 'yok,az', 'yok,cok'].sort());
    expect(yazi.every((f) => f.fark.karar === 'yetersiz')).toBe(true);
  });
});

describe('puan', () => {
  it('KRİTİK: puan KENDİSİ HARİÇ benzerlere göre; en iyisi 100, en kötüsü 0', () => {
    const p = [1, 2, 3, 4, 5, 6, 7].map((i) => satir({ tiklama: i * 100 }));
    const s = analiz(girdi(p, {})).kumeler[0]!.satirlar;
    const enIyi = s.find((x) => x.creativeId === p[6]!.creativeId)!;
    const enKotu = s.find((x) => x.creativeId === p[0]!.creativeId)!;
    expect(enIyi.puan).toMatchObject({ puan: 100, benzer: 6 });
    expect(enKotu.puan).toMatchObject({ puan: 0, benzer: 6 });
  });

  it('başka kümenin kreatifi benzer sayılmıyor', () => {
    const p = [1, 2, 3, 4, 5].map((i) => satir({ tiklama: i * 100 }));
    p.push(...[1, 2, 3].map((i) => satir({ tiklama: i * 100, objective: 'OUTCOME_TRAFFIC' })));
    const satis = analiz(girdi(p, {})).kumeler.find((k) => k.ozet.anahtar === 'meta:satis')!;
    expect(satis.satirlar[0]!.puan).toMatchObject({ puan: null, neden: 'benzer_az', benzer: 4 });
  });
});

describe('yeni kreatif kovaları', () => {
  it('yalnız ilk gösterimi son 14 günde olana kova; eşik altı "harcama_az"; kur bilinmiyorsa "kur_yok"', () => {
    const p = [1, 2, 3, 4, 5, 6].map((i) => satir({ tiklama: i * 100 }));
    const yeni = satir({ tiklama: 900, harcamaMicros: 300_000_000n });
    p.push(yeni);
    const g = girdi(p, {});
    (g.ilkGosterim as Map<string, string>).set(yeni.creativeId, YENI);
    const s = analiz(g).kumeler[0]!.satirlar;
    expect(s.filter((x) => x.kova !== null).map((x) => x.creativeId)).toEqual([yeni.creativeId]);
    expect(s.find((x) => x.creativeId === yeni.creativeId)!.kova).toMatchObject({ kova: 'veri_yetersiz', neden: 'harcama_az' });

    const kursuz = analiz({ ...g, esikMicros: null }).kumeler[0]!.satirlar.find((x) => x.creativeId === yeni.creativeId)!;
    expect(kursuz.kova).toMatchObject({ kova: 'veri_yetersiz', neden: 'kur_yok' });
  });

  it('yorgunluk önerisi olan reklamın kovası korunuyor, öneriye bağlanıyor', () => {
    const p = [1, 2, 3, 4, 5, 6].map((i) => satir({ tiklama: i * 100 }));
    const yeni = satir({ tiklama: 10 });
    p.push(yeni);
    const g = girdi(p, {}, { yorgunReklamlar: new Set([yeni.adId]) });
    (g.ilkGosterim as Map<string, string>).set(yeni.creativeId, YENI);
    const k = analiz(g).kumeler[0]!.satirlar.find((x) => x.creativeId === yeni.creativeId)!.kova!;
    expect(k).toMatchObject({ kova: 'dikkat', yorgunlukOnerisi: true });
  });

  it('kur eksik (çevrilemeyen harcama) kreatif eşik bilinmiyor sayılıyor', () => {
    const p = [1, 2, 3, 4, 5, 6].map((i) => satir({ tiklama: i * 100 }));
    const yeni = satir({ tiklama: 900, kurEksik: true });
    p.push(yeni);
    const g = girdi(p, {});
    (g.ilkGosterim as Map<string, string>).set(yeni.creativeId, YENI);
    expect(analiz(g).kumeler[0]!.satirlar.find((x) => x.creativeId === yeni.creativeId)!.kova).toMatchObject({ neden: 'kur_yok' });
  });
});

describe('küme dışı', () => {
  it('Google arama kampanyası kümesiz (sayılır, karşılaştırılmaz)', () => {
    const p = [satir({ tiklama: 1, platform: 'google', objective: 'SEARCH' })];
    const r = analiz(girdi(p, {}));
    expect(r.kumeler).toHaveLength(0);
    expect(r.kumesiz).toHaveLength(1);
  });
});
