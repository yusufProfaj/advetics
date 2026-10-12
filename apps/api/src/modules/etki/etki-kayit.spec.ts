import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEGISIKLIK_KAYNAKLARI,
  DEGISIKLIK_TURLERI,
  DEGISIKLIK_YOLLARI,
  ETKI_DURUMLARI,
  ETKI_METRIKLERI,
  ETKI_NEDENLERI,
  ETKI_SONUCLARI,
  ETKI_UCLARI,
} from '@advetics/shared';
import { HESABIN_KENDI_VERISI } from '../connections/hesap-verisi-tasima';
import { CASCADE_ILE_TASINANLAR, WORKSPACE_TABLOLARI } from '../manager-account/workspace-tasima';

/**
 * ═══ KAYNAK TARAMALARI — derlemenin göremediği bağlar (Paket C) ═══
 *
 * 1. Uçlar ve izinler `ETKI_UCLARI` ile BİREBİR.
 * 2. Nest modül kaydı AÇILIŞTA patlar, derlemede değil.
 * 3. CHECK listeleri = shared listeleri (ayrışırsa INSERT üretimde patlar).
 * 4. RLS'te yalnız SELECT; okuma servisi hiçbir şey yazmıyor.
 * 5. İş kota kapısından ÖNCE ayrılıyor; zamanlayıcı ve süpürme bağlı.
 * 6. Hesap taşımada etki satırı KALIYOR, workspace taşımada gidiyor.
 *
 * Taramalar YORUMSUZ kaynakta: kuralı anlatan yorum eşleşip testi yeşil
 * bırakmasın (CLAUDE.md). Her dilim bulunamazsa HATA FIRLATIYOR.
 */
const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*--.*$/gm, '');
const oku = (yol: string) => yorumsuz(readFileSync(join(__dirname, yol), 'utf8'));
function dilim(src: string, bas: string, son: string): string {
  const i = src.indexOf(bas);
  if (i < 0) throw new Error(`${bas} bulunamadı — tarama boşa düşerdi`);
  const j = src.indexOf(son, i + bas.length);
  if (j < 0) throw new Error(`${son} bulunamadı — tarama boşa düşerdi`);
  return src.slice(i, j);
}

describe('uçlar ve izinler', () => {
  it('KRİTİK: controller ETKI_UCLARI ile eksiksiz ve fazlasız', () => {
    const src = oku('etki.controller.ts');
    expect(src).toContain(`@Controller('etki')`);
    const rotalar = [...src.matchAll(/@(Get|Post|Put|Patch|Delete)\(/g)].length;
    const bulunan: Record<string, string> = {};
    for (const m of src.matchAll(/@(Get|Post|Patch|Delete)\((?:'([^']*)')?\)\s*@RequirePermissions\('([^']+)'\)/g)) {
      bulunan[`${m[1]!.toUpperCase()} /etki${m[2] ? `/${m[2]}` : ''}`] = m[3]!;
    }
    expect(rotalar).toBe(ETKI_UCLARI.length);
    expect(bulunan).toEqual(Object.fromEntries(ETKI_UCLARI.map((u) => [`${u.yontem} ${u.yol}`, u.izin])));
  });
});

describe('Nest kaydı', () => {
  it('KRİTİK: EtkiModule AppModule’de; EtkiIsModule QueueModule’de; sağlayıcılar kayıtlı', () => {
    const app = oku('../../app.module.ts');
    expect(app).toMatch(/import \{ EtkiModule \} from '\.\/modules\/etki\/etki\.module'/);
    expect(app).toMatch(/\bEtkiModule,/);
    const kuyruk = oku('../../queue/queue.module.ts');
    expect(kuyruk).toMatch(/imports:\s*\[[^\]]*\bEtkiIsModule\b/);
    const modul = oku('etki.module.ts');
    expect(modul).toMatch(/controllers:\s*\[EtkiController\]/);
    expect(modul).toMatch(/providers:\s*\[EtkiService\]/);
    const is = oku('etki-is.module.ts');
    expect(is).toMatch(/providers:\s*\[EtkiHesapService\]/);
    expect(is).toMatch(/exports:\s*\[EtkiHesapService\]/);
    // İş modülü hiçbir modülü içe almıyor (QueueModule ile döngü olurdu).
    expect(is).not.toMatch(/imports:/);
  });
});

describe('CHECK listeleri = shared listeleri', () => {
  const sql = readFileSync(join(__dirname, '../../../prisma/migrations/20261014100000_etki/migration.sql'), 'utf8');
  const liste = (kisit: string): string[] => {
    const i = sql.indexOf(`"${kisit}" CHECK`);
    if (i < 0) throw new Error(`${kisit} bulunamadı`);
    const parca = sql.slice(i, sql.indexOf('\n', i));
    return [...parca.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
  };

  it('KRİTİK: her durum/tür kısıtı shared listesiyle iki yönlü aynı', () => {
    expect(liste('degisiklik_etkileri_kaynak_chk')).toEqual([...DEGISIKLIK_KAYNAKLARI]);
    expect(liste('degisiklik_etkileri_yol_chk')).toEqual([...DEGISIKLIK_YOLLARI]);
    expect(liste('degisiklik_etkileri_tur_chk')).toEqual([...DEGISIKLIK_TURLERI]);
    expect(liste('degisiklik_etkileri_durum_chk')).toEqual([...ETKI_DURUMLARI]);
    expect(liste('degisiklik_etkileri_sonuc_chk')).toEqual([...ETKI_SONUCLARI]);
    expect(liste('degisiklik_etkileri_neden_chk')).toEqual([...ETKI_NEDENLERI]);
    expect(liste('degisiklik_etkileri_metrik_chk')).toEqual([...ETKI_METRIKLERI]);
  });

  it('enum değeri AYRI migration’da ve o dosyada başka hiçbir şey yok', () => {
    const enumSql = yorumsuz(readFileSync(join(__dirname, '../../../prisma/migrations/20261014100100_etki_is_turleri/migration.sql'), 'utf8')).trim();
    expect(enumSql).toBe(`ALTER TYPE "SyncJobType" ADD VALUE IF NOT EXISTS 'impact_evaluate';`);
    expect(yorumsuz(sql)).not.toContain('impact_evaluate');
  });
});

describe('yazma yalnız işte', () => {
  it('KRİTİK: RLS’te degisiklik_etkileri için YALNIZ SELECT politikası var', () => {
    const rls = yorumsuz(readFileSync(join(__dirname, '../../../prisma/sql/02_rls.sql'), 'utf8'));
    const politikalar = [...rls.matchAll(/CREATE POLICY \w+ ON degisiklik_etkileri\s+FOR (\w+)/g)].map((m) => m[1]);
    expect(politikalar).toEqual(['SELECT']);
    expect(rls).toMatch(/^\s*'degisiklik_etkileri',\s*$/m);
  });

  it('KRİTİK: okuma servisi ve controller hiçbir şey yazmıyor', () => {
    for (const f of ['etki.service.ts', 'etki.controller.ts', 'etki-metni.ts']) {
      expect(oku(f), f).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b|\$executeRaw/);
    }
    // Ve satırı yazan TEK dosya iş.
    const yazanlar = readdirSync(__dirname)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
      .filter((f) => /INSERT INTO degisiklik_etkileri|UPDATE degisiklik_etkileri/.test(oku(f)));
    expect(yazanlar).toEqual(['etki-hesap.ts']);
  });
});

describe('kuyruk bağları', () => {
  it('KRİTİK: impact_evaluate kota kapısından ve hesap işinden ÖNCE ayrılıyor; süpürme ve zamanlayıcı bağlı', () => {
    const proc = oku('../../queue/sync-processor.service.ts');
    const govde = dilim(proc, 'async process(payload: SyncJobPayload)', 'private async fanOut(');
    const etki = govde.indexOf(`payload.jobType === 'impact_evaluate'`);
    expect(etki).toBeGreaterThan(0);
    expect(etki).toBeLessThan(govde.indexOf('this.processAccountJob(payload)'));
    const fan = dilim(proc, 'private async fanOut(', 'const accounts = await');
    expect(fan).toContain(`if (payload.jobType === 'impact_evaluate') return this.etkiSupurmesi();`);
    const kuyruk = oku('../../queue/sync-queue.service.ts');
    expect(kuyruk).toContain(`{ name: 'sweep:impact', pattern: '20 7 * * *', jobType: 'impact_evaluate', tz: 'Europe/Istanbul' }`);
  });

  it('süpürme açık satırı olan hesabı da alıyor (havuza dönen hesabın satırı sonsuza kadar açık kalmasın)', () => {
    const proc = oku('../../queue/sync-processor.service.ts');
    const govde = dilim(proc, 'private async etkiSupurmesi()', 'async markSucceeded(');
    expect(govde).toMatch(/OR EXISTS \(SELECT 1 FROM degisiklik_etkileri e\s+WHERE e\.ad_account_id = a\.id AND e\.durum IN \('bekliyor', 'olcumde'\)\)/);
  });
});

describe('taşıma kararları', () => {
  it('KRİTİK: hesap taşımada etki satırı KALIYOR (karar kaydı), workspace taşımada CASCADE ile gidiyor', () => {
    expect(HESABIN_KENDI_VERISI.map((t) => t.tablo)).not.toContain('degisiklik_etkileri');
    expect(CASCADE_ILE_TASINANLAR).toContain('degisiklik_etkileri');
    expect(WORKSPACE_TABLOLARI.map((t) => t.tablo)).not.toContain('degisiklik_etkileri');
  });

  it('pglite TRUNCATE listesinde (testler arası sızıntı yok)', () => {
    const harness = readFileSync(join(__dirname, '../../../test/pglite-harness.ts'), 'utf8');
    expect(dilim(harness, 'TRUNCATE TABLE', ';')).toContain('degisiklik_etkileri');
  });
});

describe('iz', () => {
  it('KRİTİK: İyileştir, Sinyal ve Reklam Yöneticisi yazma yolları iz gönderiyor', () => {
    expect(dilim(oku('../iyilestir/iyilestir.service.ts'), 'this.actions.uygula(', 'if (r.prova)')).toMatch(/iz: \{ yol: 'iyilestir', ref: anahtar \}/);
    expect(dilim(oku('../sinyal/sinyal.service.ts'), 'this.actions.uygula(', 'const dogrulama')).toMatch(/iz: \{ yol: 'sinyal', ref: id \}/);
    expect(dilim(oku('../campaign-actions/campaign-actions.controller.ts'), 'async varlikEylemi(', 'return {')).toMatch(
      /iz: \{ yol: 'reklam_yoneticisi', ref: null \}/,
    );
  });
});
