import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PILOT_UCLARI } from '@advetics/shared';

/**
 * ═══ KAYNAK TARAMALARI — derlemenin göremediği bağlar ═══
 *
 * 1. Controller ↔ `PILOT_UCLARI`: rota ve izin düz dize; biri listede
 *    `strategy.read`, controller'da `strategy.write` olursa müşteri ekranı
 *    açar ama veri alamaz. TypeScript susar (J-06).
 * 2. Nest modül kaydı: eksik sağlayıcı DERLEMEDE değil AÇILIŞTA patlar (J-07).
 * 3. Modül sınırı: Pilot eski reklam modülünün yalnız ADLI altyapı
 *    dosyalarını içe aktarır (J-08'in bu turdaki hâli, aşağıda gerekçe).
 * 4. Model çağrısı transaction İÇİNDE değil (F-20, `withTenant` 5 sn).
 *
 * Tarama YORUMSUZ kaynakta: kuralı anlatan yorum aynı dosyada duruyor.
 */
const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const oku = (yol: string) => yorumsuz(readFileSync(join(__dirname, yol), 'utf8'));
const CONTROLLER = oku('pilot.controller.ts');
const MODUL = oku('pilot.module.ts');
const APP = oku('../../app.module.ts');
const WORKER = oku('../../worker.ts');

/** Listede duran ama bu turda AÇILMAYAN uçlar — adıyla (Tur 2: platforma yazan öneri işleri). */
const BEKLEYEN = new Set(['POST /pilot/oneriler/:id/uygula', 'POST /pilot/oneriler/:id/geri-al']);

function controllerUclari(): Array<{ anahtar: string; izin: string }> {
  const onek = /@Controller\('([^']+)'\)/.exec(CONTROLLER)?.[1];
  if (!onek) throw new Error('@Controller öneki bulunamadı — tarama boşa düşerdi');
  const desen = /@(Get|Post|Put|Patch|Delete)\('([^']*)'\)\s*@RequirePermissions\('([^']+)'\)/g;
  return [...CONTROLLER.matchAll(desen)].map((m) => ({ anahtar: `${m[1]!.toUpperCase()} /${onek}/${m[2]}`, izin: m[3]! }));
}

describe('controller ↔ PILOT_UCLARI', () => {
  it('BOŞA DÜŞME BEKÇİSİ: her rota dekoratörünün izni var ve tarama uç buldu', () => {
    const rota = [...CONTROLLER.matchAll(/@(Get|Post|Put|Patch|Delete)\(/g)].length;
    expect(rota).toBeGreaterThan(10);
    expect(controllerUclari()).toHaveLength(rota);
  });

  it('KRİTİK: her uç (yöntem, yol, izin) listeyle BİREBİR aynı', () => {
    const liste = new Map(PILOT_UCLARI.map((u) => [`${u.yontem} ${u.yol}`, u.izin as string]));
    for (const u of controllerUclari()) {
      expect(liste.has(u.anahtar), `listede olmayan uç: ${u.anahtar}`).toBe(true);
      expect(u.izin, u.anahtar).toBe(liste.get(u.anahtar));
    }
  });

  it('KRİTİK: listedeki her uç controller’da var — bekleyenler hariç, ADIYLA', () => {
    const var_ = new Set(controllerUclari().map((u) => u.anahtar));
    const eksik = PILOT_UCLARI.map((u) => `${u.yontem} ${u.yol}`).filter((a) => !var_.has(a));
    expect(eksik.sort()).toEqual([...BEKLEYEN].sort());
  });
});

describe('Nest modül kaydı', () => {
  const dosyalar = readdirSync(__dirname).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));

  it('KRİTİK: AppModule PilotModule’ü içe aktarıyor', () => {
    const bas = APP.indexOf('imports: [');
    const son = APP.indexOf('controllers:', bas);
    if (bas < 0 || son < 0) throw new Error('AppModule imports listesi bulunamadı');
    expect(APP.slice(bas, son)).toMatch(/\bPilotModule\b/);
    expect(APP).toMatch(/import \{ PilotModule \} from '\.\/modules\/pilot\/pilot\.module'/);
  });

  it('KRİTİK: her @Injectable modülün providers listesinde, her @Controller controllers listesinde', () => {
    const providers = /providers:\s*\[([^\]]*)\]/.exec(MODUL)![1]!;
    const controllers = /controllers:\s*\[([^\]]*)\]/.exec(MODUL)![1]!;
    const servisler = dosyalar.flatMap((f) => [...oku(f).matchAll(/@Injectable\(\)\s*export class (\w+)/g)].map((m) => m[1]!));
    const denetleyiciler = dosyalar.flatMap((f) => [...oku(f).matchAll(/@Controller\([^)]*\)\s*export class (\w+)/g)].map((m) => m[1]!));
    expect(servisler.length).toBeGreaterThanOrEqual(3);
    for (const s of servisler) expect(providers, s).toContain(s);
    for (const c of denetleyiciler) expect(controllers, c).toContain(c);
  });

  it('KRİTİK: worker pilot kuyruğunu dinliyor ve süpürmeyi kuruyor', () => {
    expect(WORKER).toMatch(/new Worker<PilotKurulumIsi>\(\s*PILOT_KURULUM_KUYRUGU/);
    expect(WORKER).toMatch(/pilotIsiniIsle\(/);
    expect(WORKER).toMatch(/pilotSupurmesi\(/);
  });
});

describe('modül sınırı', () => {
  /*
   * KABUL LİSTESİ J-08 "pilot modules/reklam'ı içe aktarmaz" diyor; aynı
   * liste F-13…F-17, G-04, E-08'de Graph istemcisini, Meta erişimini, yazma
   * kesicisini ve kapsama kuralını "YENİDEN KULLANILIR" sayıyor ve onlar
   * bugün modules/reklam altında. Çözüm: yalnız bu ALTYAPI dosyaları, adıyla.
   * Eski modülün servisleri, Nest modülü, tabloları ve sohbeti YASAK; eski
   * modül silinirken bu dosyalar ortak bir yere taşınmalı (devir notu).
   */
  const IZINLI = new Set(['../reklam/meta-erisim', '../reklam/meta-graf', '../reklam/yayin-motoru', '../reklam/yazma-kapisi', '../reklam/prova-isleyici', '../reklam/yayin-baslat']);
  const YASAK = ['ad-builder', 'draft-tree', '/bulk/', 'campaign-actions', 'ai-assistant', '/connections/', '/assets/', 'reklam.module', 'reklam/sohbet', 'taslak.service', 'yayin.service'];
  const dosyalar = readdirSync(__dirname).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));

  it('KRİTİK: modules/reklam’dan yalnız izinli altyapı dosyaları; eski iş modülleri hiç', () => {
    let reklamIthalati = 0;
    for (const f of dosyalar) {
      for (const m of oku(f).matchAll(/from '([^']+)'/g)) {
        const yol = m[1]!;
        for (const y of YASAK) expect(yol, `${f} → ${yol}`).not.toContain(y);
        if (yol.startsWith('../reklam/')) {
          reklamIthalati++;
          expect(IZINLI.has(yol), `${f} → ${yol} izinli listede değil`).toBe(true);
        }
      }
    }
    expect(reklamIthalati).toBeGreaterThan(0);
  });
});

/** `ac`taki parantezle eşleşen kapanışa kadar dilim (komşu çağrıyı yakalamasın diye sayarak). */
function cagriGovdeleri(kaynak: string, ac: string): string[] {
  const sonuc: string[] = [];
  let i = kaynak.indexOf(ac);
  while (i >= 0) {
    let derinlik = 0;
    let j = i + ac.length - 1;
    for (; j < kaynak.length; j++) {
      if (kaynak[j] === '(') derinlik++;
      else if (kaynak[j] === ')' && --derinlik === 0) break;
    }
    sonuc.push(kaynak.slice(i, j + 1));
    i = kaynak.indexOf(ac, j);
  }
  return sonuc;
}

describe('transaction içinde dış çağrı yok (F-20)', () => {
  it('KRİTİK: plan servisinde model çağrısı hiçbir withTenant gövdesinde değil', () => {
    const govdeler = cagriGovdeleri(oku('plan.service.ts'), 'this.tx(');
    expect(govdeler.length).toBeGreaterThan(8);
    for (const g of govdeler) {
      for (const yasak of ['gerekceEkle(', 'cumleyiCevir(', 'metinIste(', 'this.yz']) expect(g, yasak).not.toContain(yasak);
    }
  });
});
