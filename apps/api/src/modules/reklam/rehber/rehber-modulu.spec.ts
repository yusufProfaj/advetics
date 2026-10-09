import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * NEST MODÜL KAYDI DERLEMEDE DEĞİL AÇILIŞTA PATLIYOR (CLAUDE.md). Depoda
 * grafiği ayağa kaldıran bir test yok; `nest build` geçer, deploy'un
 * ortasında "Nest can't resolve dependencies" düşer. Rehber modülünün kaydı,
 * servisin her bağımlılığının bir kaynağı olduğu ve uçların sözleşmedeki
 * listeyle aynı olduğu kaynak taramasıyla kilitleniyor. Tarama YORUMSUZ
 * kaynakta: kuralı anlatan yorum eşleşip testi yeşil tutmasın.
 */
const yorumsuz = (p: string) =>
  readFileSync(p, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const KOK = join(__dirname, '../../..');
const MODUL = yorumsuz(join(__dirname, 'rehber.module.ts'));
const SERVIS = yorumsuz(join(__dirname, 'rehber.service.ts'));
const CONTROLLER = yorumsuz(join(__dirname, 'rehber.controller.ts'));
const APP = yorumsuz(join(KOK, 'app.module.ts'));
const WORKER = yorumsuz(join(KOK, 'worker.ts'));
const ihracat = (p: string) => /exports:\s*\[([^\]]*)\]/.exec(yorumsuz(p))?.[1] ?? '';

describe('rehber modül kaydı', () => {
  it('KRİTİK: AppModule RehberModule’ü içe aktarıyor (worker da AppModule’den açılıyor)', () => {
    expect(APP).toMatch(/imports:\s*\[[\s\S]*\bRehberModule\b[\s\S]*\]/);
    expect(WORKER).toContain('createApplicationContext(AppModule)');
  });

  it('KRİTİK: modül controller’ı ve servisi kaydediyor; rehber/ altındaki her @Injectable kayıtlı', () => {
    const controllers = /controllers:\s*\[([^\]]*)\]/.exec(MODUL)![1]!;
    const providers = /providers:\s*\[([^\]]*)\]/.exec(MODUL)![1]!;
    expect(controllers).toContain('RehberController');
    const dosyalar = readdirSync(__dirname).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));
    const servisler = dosyalar.flatMap((f) => [...yorumsuz(join(__dirname, f)).matchAll(/@Injectable\(\)\s*export class (\w+)/g)].map((m) => m[1]!));
    expect(servisler).toEqual(['RehberService']);
    for (const s of servisler) expect(providers).toContain(s);
  });

  it('KRİTİK: servisin HER kurucu bağımlılığının bir kaynağı var (içe aktarılan modülün exports’u ya da global modül)', () => {
    const govde = /constructor\(([\s\S]*?)\)\s*\{/.exec(SERVIS)?.[1];
    if (!govde) throw new Error('kurucu bulunamadı');
    const tipler = [...govde.matchAll(/:\s*([A-Z]\w+)/g)].map((m) => m[1]!).filter((t) => t !== 'AppConfig' && t !== 'GeminiIstemcisi');
    const enjeksiyonlar = [...govde.matchAll(/@Inject\((\w+)\)/g)].map((m) => m[1]!);
    expect(tipler.length).toBeGreaterThanOrEqual(10);
    const imports = /imports:\s*\[([^\]]*)\]/.exec(MODUL)![1]!;
    const kaynak: Record<string, string> = {
      ReklamModule: ihracat(join(__dirname, '../reklam.module.ts')),
      ConnectionsModule: ihracat(join(KOK, 'modules/connections/connections.module.ts')),
      AutoBoostModule: ihracat(join(KOK, 'modules/autoboost/autoboost.module.ts')),
    };
    // @Global modüllerden gelenler (prisma, crypto, queue).
    const GLOBAL = ['PrismaService', 'CryptoService', 'QuotaGuardService'];
    for (const t of tipler) {
      const nereden = Object.entries(kaynak).find(([m, ex]) => imports.includes(m) && new RegExp(`\\b${t}\\b`).test(ex));
      expect(nereden || GLOBAL.includes(t), `${t} hiçbir modülden gelmiyor`).toBeTruthy();
    }
    expect(enjeksiyonlar.sort()).toEqual(['CONFIG', 'YAPAY_ZEKA']);
    expect(yorumsuz(join(KOK, 'queue/queue.module.ts'))).toMatch(/@Global\(\)[\s\S]*exports:\s*\[[\s\S]*QuotaGuardService/);
  });

  it('KRİTİK: ReklamModule hâlâ İŞ MODÜLÜ İÇE AKTARMIYOR (bağımlılık yönü rehber → reklam)', () => {
    const r = yorumsuz(join(__dirname, '../reklam.module.ts'));
    expect(r).not.toMatch(/imports:\s*\[/);
    expect(r).not.toContain('Rehber');
  });

  it('KRİTİK: worker Google yayın erişimini veriyor (yoksa Google işi fırlatır)', () => {
    const blok = WORKER.slice(WORKER.indexOf('const reklamWorker'), WORKER.indexOf('reklamWorker.on('));
    if (!blok.includes('reklamIsiniIsle')) throw new Error('reklam işçisi bloğu bulunamadı');
    for (const p of ['tokenAl', 'rehberMutate', 'rehberAra', 'rehberKampanyaAc']) expect(blok).toContain(p);
  });
});

describe('uçlar ↔ sözleşme (api.ts)', () => {
  const API = readFileSync(join(KOK, '../../../packages/shared/src/reklam/rehber/api.ts'), 'utf8');
  const sozlesme = [...API.matchAll(/^\s*\*\s+(GET|POST|PUT)\s+(\/reklam\/\S+?)(?:\?\S*)?\s+(?:\{[^}]*\}\s+)?→\s+.*?(bulk\.\w+)/gm)].map((m) => `${m[1]} ${m[2]} ${m[3]}`);
  const uclar = [...CONTROLLER.matchAll(/@(Get|Post|Put)\('([^']+)'\)\s*@RequirePermissions\('([^']+)'\)/g)].map(
    (m) => `${m[1]!.toUpperCase()} /reklam/${m[2]!.replace(/:id/g, ':id')} ${m[3]}`,
  );

  it('BOŞA DÜŞME BEKÇİSİ: iki taraf da uç buldu', () => {
    expect(sozlesme.length).toBeGreaterThanOrEqual(12);
    expect(uclar.length).toBe(sozlesme.length);
  });

  it('KRİTİK: her uç (yöntem, yol, izin) sözleşmeyle BİREBİR aynı', () => {
    expect([...uclar].sort()).toEqual([...sozlesme].sort());
  });
});
