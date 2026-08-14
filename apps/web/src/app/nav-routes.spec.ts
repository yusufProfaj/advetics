import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Kenar çubuğundaki her AKTİF bağlantının bir sayfası var mı — KAYNAK TARAMASI.
 *
 * NEDEN BU TEST VAR: menüde dokuz bağlantı vardı ve dokuzunun da sayfası
 * yoktu — hepsi 404 veriyordu. Üstelik tıklanabilir görünüyorlardı, çünkü
 * "hazır mı" kararı sayfanın varlığına değil MODÜL NUMARASINA bakıyordu:
 *
 *     const ready = item.ready ?? READY_MODULES.has(item.module);
 *
 * Bir modül birden çok ekran getiriyor ve hepsi aynı anda bitmiyor. Modül 6
 * "hazır" sayılıyordu çünkü Raporlar bitmişti; aynı modüldeki Reklam
 * Yorgunluğu ve A/B Test ise hiç yazılmamıştı ve ikisi de açık görünüyordu.
 *
 * nav.tsx içindeki yorum bu tuzağı zaten anlatıyor ("Kurallar linki 404
 * verirdi") — ama yalnızca Kurallar için `ready` konmuştu. Yorumla korunan
 * kural, korunmayan kuraldır.
 *
 * Test iki dosyayı birden okuyor: menü tanımı layout.tsx'te, hazır olma kuralı
 * nav.tsx'te. İkisi ayrı dosyada olduğu için biri değişince diğerinin
 * bozulduğu gözle görünmüyor.
 */
const APP_DIR = __dirname;
const LAYOUT = readFileSync(join(APP_DIR, '(dashboard)/layout.tsx'), 'utf8');
const NAV = readFileSync(join(APP_DIR, '../components/nav.tsx'), 'utf8');

/** nav.tsx'teki READY_MODULES kümesini kaynaktan okur — elle kopyalamıyoruz. */
function readyModules(): Set<number> {
  const match = NAV.match(/const READY_MODULES = new Set\(\[([^\]]*)\]\)/);
  if (!match) throw new Error('READY_MODULES bulunamadı — nav.tsx yeniden düzenlenmiş olabilir.');
  return new Set(
    match[1]
      .split(',')
      .map((n) => Number(n.trim()))
      .filter((n) => Number.isFinite(n)),
  );
}

interface NavEntry {
  href: string;
  module: number;
  ready?: boolean;
}

/** layout.tsx'teki menü girdilerini ayıklar. */
function navEntries(): NavEntry[] {
  const entries: NavEntry[] = [];
  // Girdiler tek satırda da çok satırda da yazılabiliyor; href'ten başlayıp
  // girdinin sonuna kadar okuyup alanları ayrı ayrı arıyoruz.
  const re = /\{\s*href:\s*'([^']+)'[\s\S]*?\}/g;
  for (const m of LAYOUT.matchAll(re)) {
    const block = m[0];
    const href = m[1];
    if (!href.startsWith('/')) continue;
    const moduleMatch = block.match(/module:\s*(\d+)/);
    if (!moduleMatch) continue;
    const readyMatch = block.match(/ready:\s*(true|false)/);
    entries.push({
      href,
      module: Number(moduleMatch[1]),
      ready: readyMatch ? readyMatch[1] === 'true' : undefined,
    });
  }
  return entries;
}

const READY = readyModules();
const ENTRIES = navEntries();

/** nav.tsx ile BİREBİR aynı kural. */
const isActive = (e: NavEntry): boolean => e.ready ?? READY.has(e.module);

describe('kenar çubuğu rotaları', () => {
  it('menü girdileri okunabildi — tarama boşa düşmüyor', () => {
    // Regex tutmazsa liste boşalır ve aşağıdaki testler sessizce geçerdi.
    // Boş taramanın yeşil yanması, testin olmamasından kötü.
    expect(ENTRIES.length).toBeGreaterThanOrEqual(15);
    expect(READY.size).toBeGreaterThan(0);
    expect(ENTRIES.map((e) => e.href)).toContain('/dashboard');
  });

  it('AKTİF her bağlantının sayfası var', () => {
    const active = ENTRIES.filter(isActive);
    expect(active.length).toBeGreaterThan(0);

    const missing = active.filter(
      (e) => !existsSync(join(APP_DIR, '(dashboard)', e.href, 'page.tsx')),
    );

    expect(
      missing.map((e) => e.href),
      'Bu bağlantılar menüde tıklanabilir ama sayfaları yok — 404 verirler',
    ).toEqual([]);
  });

  it('PASİF işaretlenenlerin sayfası gerçekten yok', () => {
    // Ters yön: sayfası yazıldığı hâlde `ready: false` kalmış bir bağlantı,
    // biten bir özelliğin kullanıcıya hiç görünmemesi demek. Sessiz kayıp.
    const inactive = ENTRIES.filter((e) => !isActive(e));
    const builtButHidden = inactive.filter((e) =>
      existsSync(join(APP_DIR, '(dashboard)', e.href, 'page.tsx')),
    );

    expect(
      builtButHidden.map((e) => e.href),
      'Bu sayfalar yazılmış ama menüde pasif görünüyor — ready bayrağını kaldır',
    ).toEqual([]);
  });
});
