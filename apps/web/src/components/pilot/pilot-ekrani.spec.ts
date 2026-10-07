import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ PİLOT EKRANLARI — KAYNAK TARAMALARI ═══
 *
 * Davranış `hesap.spec.ts`te ÇALIŞTIRILARAK sınanıyor. Buradakiler o
 * kararların ekranda GERÇEKTEN kullanıldığını kilitliyor: bir fonksiyonun
 * test edilmesi, çağrıldığının test edilmesi değil (CLAUDE.md mutasyon
 * dersi 1).
 *
 * TARAMA YORUMSUZ KAYNAKTA: kuralı anlatan yorum aynı dosyada duruyor ve
 * `toContain` ikisini ayırt etmiyor.
 */
const KOK = __dirname;
const STRATEJI = join(__dirname, '..', '..', 'app', '(dashboard)', 'strateji', 'page.tsx');
const REKLAM = join(__dirname, '..', '..', 'app', '(dashboard)', 'reklam', 'page.tsx');

function yorumsuz(yol: string): string {
  return readFileSync(yol, 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/(?<![:'"`\w])\/\/[^\n'"`]*$/gm, '');
}

const DOSYALAR = readdirSync(KOK).filter((f) => /\.tsx?$/.test(f) && !f.includes('.spec.'));
const KOD: Record<string, string> = Object.fromEntries(DOSYALAR.map((f) => [f, yorumsuz(join(KOK, f))]));
const kod = (ad: string): string => {
  const k = KOD[ad];
  if (k === undefined) throw new Error(`${ad} okunamadı — tarama boşa düştü`);
  return k;
};
const TSX = Object.entries(KOD).filter(([f]) => f.endsWith('.tsx'));

describe('tarama boşa düşmüyor', () => {
  it('bütün pilot dosyaları okundu', () => {
    expect(Object.keys(KOD).sort()).toEqual(
      [
        'butce-seridi.tsx',
        'degistir-kutusu.tsx',
        'hesap.ts',
        'kaynak-cipi.tsx',
        'kurulum-karti.tsx',
        'oneri-kartlari.tsx',
        'pilot-acilisi.tsx',
        'plan-belgesi.tsx',
        'plan-hazirla.tsx',
        'plan-sayfasi.tsx',
      ].sort(),
    );
    for (const [f, k] of Object.entries(KOD)) expect(k.length, f).toBeGreaterThan(500);
  });
});

describe('sessiz hata yok', () => {
  it('KRİTİK: hiçbir dosyada hatayı yutan `.catch(() =>` yok', () => {
    for (const [f, k] of Object.entries(KOD)) expect(k, f).not.toMatch(/\.catch\(\s*\(\s*\)\s*=>/);
  });

  it('KRİTİK: her yazma hatası ekrana çıkıyor (okumaHatasi ile state)', () => {
    expect(kod('plan-belgesi.tsx')).toContain("setIslem({ tur: 'hata', mesaj: okumaHatasi(e) })");
    expect(kod('degistir-kutusu.tsx')).toContain("setHal({ tur: 'hata', mesaj: okumaHatasi(e) })");
    expect(kod('plan-hazirla.tsx')).toContain("setHal({ tur: 'hata', mesaj: okumaHatasi(e) })");
    expect(kod('oneri-kartlari.tsx')).toContain('[k.id]: okumaHatasi(e)');
    expect(kod('kurulum-karti.tsx')).toContain("setHal({ tur: 'hata', mesaj: okumaHatasi(e) })");
  });

  it('KRİTİK: sunucu okumaları ayrı hata dallı; düşen bölüm kendi cümlesiyle', () => {
    const a = kod('pilot-acilisi.tsx');
    for (const b of ['Bugünün özeti alınamadı.', 'Öneriler alınamadı.', 'Planlar alınamadı.', 'Kurulum durumu alınamadı.']) expect(a).toContain(b);
    const s = kod('plan-sayfasi.tsx');
    expect(s).toContain('baslik="Planlar alınamadı."');
    expect(s).toContain('baslik="Plan alınamadı."');
  });

  it('boş öneri listesi nedeni olmadan "öneri yok" demiyor', () => {
    const a = kod('pilot-acilisi.tsx');
    expect(a).toContain('if (!neden) return');
    expect(a).toContain('ONERI_BOS_METNI[neden]');
  });

  it('panel metninde uzun tire yok', () => {
    for (const [f, k] of Object.entries(KOD)) expect(k, f).not.toMatch(/[—–]/);
  });
});

describe('uç ve adres sözleşmeden', () => {
  it('KRİTİK: hiçbir dosya `/pilot/...` yolunu elle kurmuyor', () => {
    for (const [f, k] of Object.entries(KOD)) {
      expect(k, f).not.toMatch(/(?<!pilotUcAdresi\()['`]\/pilot\//);
    }
    // Ve gerçekten kullanılıyor (aksi hâlde yukarıdaki iddia boşa geçer).
    expect(TSX.filter(([, k]) => k.includes('pilotUcAdresi(')).length).toBeGreaterThanOrEqual(6);
  });

  it('KRİTİK: sorgu dizgesi elle birleştirilmiyor (`baglanti` ile)', () => {
    for (const [f, k] of Object.entries(KOD)) expect(k, f).not.toMatch(/[?&](plan|musteri|eski|clientId|bolum)=/);
  });
});

describe('düğmeler ve onay', () => {
  it('KRİTİK: plan düğmeleri `altCubuk(detay)`tan, geçiş tablosundan değil', () => {
    expect(kod('plan-belgesi.tsx')).toContain('const cubuk = altCubuk(detay)');
    expect(kod('plan-belgesi.tsx')).toContain('cubuk.ikincil.map(');
    for (const [f, k] of Object.entries(KOD)) expect(k, f).not.toMatch(/PILOT_PLAN_GECISLERI|pilotGecisMumkunMu/);
  });

  it('KRİTİK: onay gövdesi `onayIstegi`nden; hiçbir bileşen içerik özetini elle koymuyor', () => {
    const b = kod('plan-belgesi.tsx');
    expect(b).toContain("pilotUcAdresi('/pilot/planlar/:id/onayla', plan.id), onayIstegi(plan))");
    expect(b).toContain("pilotUcAdresi('/pilot/planlar/:id/onayla', plan.id), onayIstegi(plan, g))");
    for (const [f, k] of TSX) expect(k, f).not.toMatch(/icerikOzeti\s*:/);
  });

  it('KRİTİK: ajans müşteri adına onayı gerekçe kutusundan geçiyor; düğme gerekçe eksikken kapalı', () => {
    const b = kod('plan-belgesi.tsx');
    expect(b).toContain("return setAcikKutu('adina_onay')");
    expect(b).toContain('disabled={eksik > 0}');
    expect(b).toContain('const eksik = gerekceEksigi(gerekce)');
  });

  it('KRİTİK: uyum ve yayın kipi notu müşteriye çizilmiyor', () => {
    const b = kod('plan-belgesi.tsx');
    expect(b).toContain('{!musteri && <AjansNotlari');
    // AjansNotlari dışında uyum alanına bakan bir çizim yok.
    expect(b.match(/detay\.uyum/g)?.length).toBe(1);
  });

  it('eylem gövdeleri `eylemIstegi`nden (plan sayfası ve kurulum kartı aynı)', () => {
    expect(kod('plan-belgesi.tsx')).toContain('eylemIstegi(plan.id, e, plan.surum)');
    expect(kod('kurulum-karti.tsx')).toContain("eylemIstegi(k.plan.id, 'yeniden_dene', k.plan.surum)");
  });

  it('"Şimdi kur" sunucunun listesinden', () => {
    expect(kod('kurulum-karti.tsx')).toContain("const kurabilir = k.yapilabilir.includes('yeniden_dene')");
  });
});

describe('sayfalar: yeni ekran varsayılan, eski ekran geri dönüş yolu', () => {
  const strateji = yorumsuz(STRATEJI);
  const reklam = yorumsuz(REKLAM);

  it('KRİTİK: AdvStrategy yeni belgeyi `?eski=1` yoksa açıyor ve kapı aynı izinden sonra', () => {
    const i = strateji.indexOf('if (!eskiEkranMi({ eski: first(params.eski) }))');
    expect(i).toBeGreaterThan(-1);
    expect(strateji.indexOf('hasPermission(session, STRATEJI_SAYFA_IZNI)')).toBeLessThan(i);
    expect(strateji.slice(i, i + 600)).toContain('<PilotPlanSayfasi');
  });

  it('KRİTİK: AdvCampaign Pilot\'u açıyor; `?oturum=` eski sohbete gidiyor; kapı aynı izinden sonra', () => {
    const i = reklam.indexOf('if (!eskiEkranMi({ eski: first(params.eski), oturum: first(params.oturum) }))');
    expect(i).toBeGreaterThan(-1);
    expect(reklam.indexOf("hasPermission(session, 'bulk.write')")).toBeLessThan(i);
    expect(reklam.slice(i, i + 400)).toContain('<PilotAcilisi');
  });
});

describe('panel kalıbı ve dar ekran', () => {
  it('kart kalıbı kullanılıyor, ekrana özel gölge yazılmıyor', () => {
    for (const [f, k] of TSX) expect(k, f).not.toMatch(/shadow-\[/);
    expect(TSX.filter(([, k]) => k.includes('rounded-xl border border-line bg-surface')).length).toBeGreaterThanOrEqual(5);
  });

  it('KRİTİK: her sabit kolonlu ızgara esneyen bir `minmax(0,1fr)` kolonu taşıyor (375 pikselde yatay kaydırma yok)', () => {
    const izgaralar = TSX.flatMap(([f, k]) => [...k.matchAll(/(?<![\w:])grid-cols-\[([^\]]+)\]/g)].map((m) => [f, m[1]!] as const));
    expect(izgaralar.length).toBeGreaterThan(3);
    for (const [f, iz] of izgaralar) expect(iz, f).toContain('minmax(0,1fr)');
  });

  it('dar ekranda sabit genişlik yok (önek almamış en az genişlik 10rem’i geçmiyor)', () => {
    for (const [f, k] of TSX) {
      for (const m of k.matchAll(/(?<![\w:])min-w-\[(\d+(?:\.\d+)?)rem\]/g)) expect(Number(m[1]), f).toBeLessThanOrEqual(10);
      expect(k, f).not.toMatch(/(?<![\w:-])w-\[\d{2,}rem\]/);
    }
  });
});
