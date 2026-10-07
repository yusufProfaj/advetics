import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NIYET_KODLARI, STRATEJI_UCLARI } from '@advetics/shared';

/**
 * ═══ KAYNAK TARAMALARI — derlemenin göremediği üç bağ ═══
 *
 * 1. Controller ↔ `STRATEJI_UCLARI`: rota ve izin düz dize; biri listede
 *    `strategy.read`, controller'da `strategy.write` olursa müşteri
 *    (yalnız okuyan) ekranı açar ama veri alamaz. TypeScript susar.
 * 2. Nest modül kaydı: eksik sağlayıcı DERLEMEDE değil AÇILIŞTA patlar
 *    (CLAUDE.md). Depoda grafiği ayağa kaldıran test yok.
 * 3. Migration'daki niyet CHECK'i ↔ `NIYET_KODLARI`: liste büyür, CHECK
 *    büyümezse yeni niyetli matris satırı üretimde INSERT'te düşer.
 *
 * Tarama YORUMSUZ kaynakta: kuralı ANLATAN yorum aynı dosyada duruyor ve
 * `toContain` ikisini ayırt etmiyor.
 */
const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const oku = (yol: string) => yorumsuz(readFileSync(join(__dirname, yol), 'utf8'));

const CONTROLLER = oku('strateji.controller.ts');
const MODUL = oku('strateji.module.ts');
const APP = oku('../../app.module.ts');
const WORKER = oku('../../worker.ts');
const MIGRATION = readFileSync(join(__dirname, '../../../prisma/migrations/20261008120000_advstrategy/migration.sql'), 'utf8');

/** Bu turda kurulmayan uçlar — listede duruyorlar, controller'da YOK. Bilinçli ve adıyla. */
const BEKLEYEN = new Set(['GET /strateji/planlar/:id/sezon', 'GET /strateji/planlar/:id/pdf']);

function controllerUclari(): Array<{ anahtar: string; izin: string }> {
  const onek = /@Controller\('([^']+)'\)/.exec(CONTROLLER)?.[1];
  if (!onek) throw new Error('@Controller öneki bulunamadı — tarama boşa düşerdi');
  const uclar: Array<{ anahtar: string; izin: string }> = [];
  const desen = /@(Get|Post|Put|Patch|Delete)\('([^']*)'\)\s*@RequirePermissions\('([^']+)'\)/g;
  for (const m of CONTROLLER.matchAll(desen)) {
    uclar.push({ anahtar: `${m[1]!.toUpperCase()} /${onek}/${m[2]}`, izin: m[3]! });
  }
  return uclar;
}

describe('controller ↔ STRATEJI_UCLARI', () => {
  it('BOŞA DÜŞME BEKÇİSİ: tarama uç buldu ve her rota dekoratörünün izni var', () => {
    const rotaSayisi = [...CONTROLLER.matchAll(/@(Get|Post|Put|Patch|Delete)\(/g)].length;
    expect(rotaSayisi).toBeGreaterThan(5);
    // İzinsiz rota taramaya HİÇ girmezdi; sayıların eşitliği onu yakalıyor.
    expect(controllerUclari()).toHaveLength(rotaSayisi);
  });

  it('KRİTİK: her uç (yöntem, yol, izin) listeyle BİREBİR aynı', () => {
    const liste = new Map(STRATEJI_UCLARI.map((u) => [`${u.yontem} ${u.yol}`, u.izin as string]));
    for (const u of controllerUclari()) {
      expect(liste.has(u.anahtar), `listede olmayan uç: ${u.anahtar}`).toBe(true);
      expect(u.izin, u.anahtar).toBe(liste.get(u.anahtar));
    }
  });

  it('KRİTİK: listedeki her uç controller’da var — bekleyen ikisi hariç, ADIYLA', () => {
    const var_ = new Set(controllerUclari().map((u) => u.anahtar));
    const eksik = STRATEJI_UCLARI.map((u) => `${u.yontem} ${u.yol}`).filter((a) => !var_.has(a));
    expect(eksik.sort()).toEqual([...BEKLEYEN].sort());
    // Bekleyen uç sessizce eklenirse istisna listesi de daralmalı.
    for (const b of BEKLEYEN) expect(var_.has(b), b).toBe(false);
  });
});

describe('Nest modül kaydı', () => {
  it('KRİTİK: AppModule StratejiModule’ü içe aktarıyor', () => {
    // Dilim gerçek sınırla: `imports: [` ile `controllers:` arası. İlk `]`e
    // kadar almak `envFilePath` dizisinde dururdu.
    const bas = APP.indexOf('imports: [');
    const son = APP.indexOf('controllers:', bas);
    if (bas < 0 || son < 0) throw new Error('AppModule imports listesi bulunamadı');
    const imports = APP.slice(bas, son);
    expect(imports).toMatch(/\bStratejiModule\b/);
    expect(APP).toMatch(/import \{ StratejiModule \} from '\.\/modules\/strateji\/strateji\.module'/);
  });

  it('KRİTİK: modül controller’ı ve servisin bütün bağımlılıklarını sağlıyor', () => {
    const providers = /providers:\s*\[([^\]]*)\]/.exec(MODUL)?.[1] ?? '';
    const controllers = /controllers:\s*\[([^\]]*)\]/.exec(MODUL)?.[1] ?? '';
    expect(controllers).toMatch(/\bStratejiController\b/);
    expect(providers).toMatch(/\bStratejiService\b/);
    const servis = oku('strateji.service.ts');
    const kurucu = /constructor\(([\s\S]*?)\)\s*\{\}/.exec(servis)?.[1];
    if (!kurucu) throw new Error('StratejiService kurucusu bulunamadı');
    const bagimliliklar = [...kurucu.matchAll(/:\s*(\w+)/g)].map((m) => m[1]!);
    expect(bagimliliklar).toEqual(['PrismaService', 'StratejiKelimeKuyrugu']);
    // PrismaService global modülden; kuyruk BU modülün sağlayıcısı olmalı.
    expect(providers).toMatch(/\bStratejiKelimeKuyrugu\b/);
    // Başka bir iş modülüne bağımlılık yok (açılışta grafik kırılmasın).
    expect(MODUL).not.toMatch(/imports:/);
  });

  it('KRİTİK: worker kelime kuyruğunu dinliyor, 1 QPS sınırıyla', () => {
    const i = WORKER.indexOf('new Worker<KelimeAramaIsi>(');
    const j = WORKER.indexOf('kelimeWorker.on(', i);
    if (i < 0 || j < 0) throw new Error('worker kelime kuyruğunu kurmuyor');
    const govde = WORKER.slice(i, j);
    expect(govde).toMatch(/^new Worker<KelimeAramaIsi>\(\s*STRATEJI_KELIME_KUYRUGU,/);
    expect(govde).toMatch(/kelimeIsiniIsle\(/);
    expect(govde).toMatch(/limiter:\s*\{\s*max:\s*1,\s*duration:\s*1000\s*\}/);
    expect(govde).toMatch(/concurrency:\s*1\b/);
    expect(WORKER).toMatch(/kelimeWorker\.close\(\)/);
  });
});

describe('migration ↔ sözleşme', () => {
  it('KRİTİK: matris niyet CHECK’i NIYET_KODLARI ile aynı küme', () => {
    const blok = /strateji_matrisi_niyet_chk" CHECK \("niyet" IN \(([\s\S]*?)\)\)/.exec(MIGRATION)?.[1];
    if (!blok) throw new Error('niyet CHECK’i bulunamadı');
    const kume = [...blok.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]).sort();
    expect(kume).toEqual([...NIYET_KODLARI].sort());
  });
});
