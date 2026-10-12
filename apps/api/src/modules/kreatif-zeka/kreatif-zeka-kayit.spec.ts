import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ETIKETLENEMEZ_NEDENLERI,
  GECICI_NEDENLER,
  ICERIK_DURUMLARI,
  KESIN_ALANLAR,
  KREATIF_ZEKA_UCLARI,
  briefCevabiSchema,
} from '@advetics/shared';
import { HESABIN_KENDI_VERISI } from '../connections/hesap-verisi-tasima';
import { CASCADE_ILE_TASINANLAR, WORKSPACE_TABLOLARI } from '../manager-account/workspace-tasima';
import { briefJsonSemasi } from './istemler';

/**
 * ═══ KAYNAK TARAMALARI — derlemenin göremediği bağlar (Paket D) ═══
 *
 * 1. Uçlar ve izinler `KREATIF_ZEKA_UCLARI` ile BİREBİR.
 * 2. Nest modül kaydı AÇILIŞTA patlar, derlemede değil.
 * 3. CHECK listeleri = shared listeleri (ayrışırsa INSERT üretimde patlar).
 * 4. Enum değeri AYRI migration.
 * 5. Üç durak (TRUNCATE, RLS, taşıma kararı).
 * 6. Zincir ve süpürme bağlı; iş kota kapısından ÖNCE ayrılıyor.
 *
 * Taramalar YORUMSUZ kaynakta; her dilim bulunamazsa HATA FIRLATIYOR.
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
  it('KRİTİK: controller KREATIF_ZEKA_UCLARI ile eksiksiz ve fazlasız', () => {
    const src = oku('kreatif-zeka.controller.ts');
    expect(src).toContain(`@Controller('kreatif-zeka')`);
    const rotalar = [...src.matchAll(/@(Get|Post|Put|Patch|Delete)\(/g)].length;
    const bulunan: Record<string, string> = {};
    for (const m of src.matchAll(/@(Get|Post|Patch|Delete)\((?:'([^']*)')?\)\s*@RequirePermissions\('([^']+)'\)/g)) {
      bulunan[`${m[1]!.toUpperCase()} /kreatif-zeka${m[2] ? `/${m[2]}` : ''}`] = m[3]!;
    }
    expect(rotalar).toBe(KREATIF_ZEKA_UCLARI.length);
    expect(bulunan).toEqual(Object.fromEntries(KREATIF_ZEKA_UCLARI.map((u) => [`${u.yontem} ${u.yol}`, u.izin])));
  });
});

describe('Nest kaydı', () => {
  it('KRİTİK: KreatifZekaModule AppModule’de; iş modülü QueueModule’de; sağlayıcılar ve tazeleme çekirdeği kayıtlı', () => {
    const app = oku('../../app.module.ts');
    expect(app).toMatch(/import \{ KreatifZekaModule \} from '\.\/modules\/kreatif-zeka\/kreatif-zeka\.module'/);
    expect(app).toMatch(/\bKreatifZekaModule,/);
    expect(oku('../../queue/queue.module.ts')).toMatch(/imports:\s*\[[^\]]*\bKreatifZekaIsModule\b/);
    const modul = oku('kreatif-zeka.module.ts');
    expect(modul).toMatch(/controllers:\s*\[KreatifZekaController\]/);
    expect(modul).toMatch(/providers:\s*\[KreatifZekaService\]/);
    expect(modul).toMatch(/imports:\s*\[ReportsModule\]/);
    const is = oku('kreatif-zeka-is.module.ts');
    expect(is).toMatch(/providers:\s*\[KreatifEtiketService\]/);
    expect(is).toMatch(/exports:\s*\[KreatifEtiketService\]/);
    // Tazeleme çekirdeği ReportsModule'den DIŞA açık; yoksa iki modül de açılışta patlar.
    expect(dilim(oku('../reports/reports.module.ts'), 'exports: [', ']')).toContain('KreatifAdresiService');
  });
});

describe('CHECK listeleri = shared listeleri', () => {
  const sql = readFileSync(join(__dirname, '../../../prisma/migrations/20261014400000_kreatif_zeka/migration.sql'), 'utf8');
  const liste = (kisit: string): string[] => {
    const i = sql.indexOf(`"${kisit}" CHECK`);
    if (i < 0) throw new Error(`${kisit} bulunamadı`);
    const parca = sql.slice(i, sql.indexOf('),\n', i));
    return [...parca.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
  };

  it('KRİTİK: durum, neden (kalıcı + geçici), kısmi, biçim, en-boy iki yönlü aynı', () => {
    expect(liste('kreatif_icerikleri_durum_chk')).toEqual([...ICERIK_DURUMLARI]);
    expect(liste('kreatif_icerikleri_neden_chk')).toEqual([...ETIKETLENEMEZ_NEDENLERI, ...GECICI_NEDENLER]);
    expect(liste('kreatif_icerikleri_kismi_chk')).toEqual(['video_kapagi', 'ilk_kart']);
    expect(liste('kreatif_icerikleri_bicim_chk')).toEqual([...KESIN_ALANLAR.bicim]);
    expect(liste('kreatif_icerikleri_en_boy_chk')).toEqual([...KESIN_ALANLAR.en_boy]);
  });

  it('enum değeri AYRI migration’da ve o dosyada başka hiçbir şey yok', () => {
    const enumSql = yorumsuz(readFileSync(join(__dirname, '../../../prisma/migrations/20261014400100_kreatif_zeka_is_turleri/migration.sql'), 'utf8')).trim();
    expect(enumSql).toBe(`ALTER TYPE "SyncJobType" ADD VALUE IF NOT EXISTS 'creative_tags';`);
    expect(yorumsuz(sql)).not.toContain('creative_tags');
  });

  it('brief JSON şeması zod şemasıyla aynı alanları istiyor', () => {
    const js = briefJsonSemasi(['insan']) as { properties: Record<string, unknown>; required: string[] };
    expect(Object.keys(js.properties).sort()).toEqual(Object.keys(briefCevabiSchema.shape).sort());
    expect(js.required.sort()).toEqual(Object.keys(briefCevabiSchema.shape).sort());
  });
});

describe('üç durak', () => {
  const tablolar = ['kreatif_icerikleri', 'kreatif_etiketleri', 'kreatif_etiket_sayaci', 'kreatif_briefleri'];

  it('KRİTİK: TRUNCATE, RLS dizisi ve politikalar; workspace taşımada CASCADE', () => {
    const harness = readFileSync(join(__dirname, '../../../test/pglite-harness.ts'), 'utf8');
    const rls = yorumsuz(readFileSync(join(__dirname, '../../../prisma/sql/02_rls.sql'), 'utf8'));
    for (const t of tablolar) {
      expect(dilim(harness, 'TRUNCATE TABLE', 'CASCADE;'), t).toMatch(new RegExp(`\\b${t}\\b`));
      expect(rls, t).toMatch(new RegExp(`^\\s*'${t}',\\s*$`, 'm'));
      expect(CASCADE_ILE_TASINANLAR, t).toContain(t);
      expect(WORKSPACE_TABLOLARI.map((x) => x.tablo), t).not.toContain(t);
    }
  });

  it('KRİTİK: hesap taşımada içerik kaydı TAŞINIYOR (org_id ile), etiket KOPYALANIYOR ve kopya taşımadan ÖNCE', () => {
    expect(HESABIN_KENDI_VERISI).toContainEqual(expect.objectContaining({ tablo: 'kreatif_icerikleri', orgIdIle: true }));
    expect(HESABIN_KENDI_VERISI.map((t) => t.tablo)).not.toContain('kreatif_etiketleri');
    const src = oku('../connections/hesap-verisi-tasima.ts');
    const govde = dilim(src, 'export async function hesapVerisiniTasi(', 'const kalan: Record');
    const kopya = govde.indexOf('await etiketleriKopyala(tx, adAccountId, yeniClientId)');
    expect(kopya).toBeGreaterThan(0);
    expect(kopya).toBeLessThan(govde.indexOf('for (const t of HESABIN_KENDI_VERISI)'));
  });

  it('politikalar: içerik ve sayaç UPDATE’li (taşıma, brief ayırması), etiket ve brief yalnız SELECT + INSERT', () => {
    const rls = yorumsuz(readFileSync(join(__dirname, '../../../prisma/sql/02_rls.sql'), 'utf8'));
    const islemler = (t: string) => [...rls.matchAll(new RegExp(`CREATE POLICY \\w+ ON ${t}\\s+FOR (\\w+)`, 'g'))].map((m) => m[1]);
    expect(islemler('kreatif_icerikleri')).toEqual(['SELECT', 'INSERT', 'UPDATE']);
    expect(islemler('kreatif_etiket_sayaci')).toEqual(['SELECT', 'INSERT', 'UPDATE']);
    expect(islemler('kreatif_etiketleri')).toEqual(['SELECT', 'INSERT']);
    expect(islemler('kreatif_briefleri')).toEqual(['SELECT', 'INSERT']);
  });
});

describe('kuyruk bağları', () => {
  it('KRİTİK: creative_tags hesap işinin kota kapısından ÖNCE ayrılıyor; süpürme ve zamanlayıcı bağlı', () => {
    const proc = oku('../../queue/sync-processor.service.ts');
    const govde = dilim(proc, 'async process(payload: SyncJobPayload)', 'private async fanOut(');
    const is = govde.indexOf(`payload.jobType === 'creative_tags'`);
    expect(is).toBeGreaterThan(0);
    expect(is).toBeLessThan(govde.indexOf('this.processAccountJob(payload)'));
    expect(dilim(proc, 'private async fanOut(', 'const accounts = await')).toContain(
      `if (payload.jobType === 'creative_tags') return this.kreatifEtiketSupurmesi();`,
    );
    expect(oku('../../queue/sync-queue.service.ts')).toContain(
      `{ name: 'sweep:creative-tags', pattern: '15 10 * * *', jobType: 'creative_tags', tz: 'Europe/Istanbul' }`,
    );
  });

  it('KRİTİK: bekçi PARA harcayan adımdan önce: işte ayırma Gemini çağrısından, serviste brief ayırması Gemini’den önce', () => {
    const is = dilim(oku('etiket-isi.ts'), 'const ozet = sha256(ind.bytes)', 'girdiToken += sonuc.girdiToken');
    expect(is.indexOf('etiketAyir(')).toBeGreaterThan(0);
    expect(is.indexOf('etiketAyir(')).toBeLessThan(is.indexOf('goruCagrisi('));
    const brief = dilim(oku('kreatif-zeka.service.ts'), 'async brief(', 'async advcampaign(');
    expect(brief.indexOf('briefAyir(')).toBeGreaterThan(0);
    expect(brief.indexOf('briefAyir(')).toBeLessThan(brief.indexOf('metinIsteOlcumlu('));
  });

  it('$queryRaw sayı parametreleri ::int (PGlite bunu yakalayamıyor, CLAUDE.md)', () => {
    let sablon = 0;
    for (const f of ['sayac.ts', 'etiket-isi.ts', 'kreatif-zeka.service.ts']) {
      // Yalnız SQL şablonları: kullanıcı cümlesindeki `${ETIKET_SINIRI...}` sayı parametre değil.
      for (const m of oku(f).matchAll(/Prisma\.sql`[\s\S]*?`/g)) {
        sablon++;
        expect(m[0], f).not.toMatch(/ETIKET_SINIRI\.\w+\}(?!::int)/);
        expect(m[0], f).not.toMatch(/\$\{GUNCEL_SEMA\}(?!::int)/);
        expect(m[0], f).not.toMatch(/\$\{(girdiToken|ciktiToken|g\.basarili|g\.hata)\}(?!::)/);
      }
    }
    // Tarama boşa düşmesin: şablonlar gerçekten bulundu.
    expect(sablon).toBeGreaterThan(15);
  });

  it('arayüzde hata yutan .catch(() => []) deseni yok', () => {
    for (const f of ['kreatif-zeka.service.ts', 'etiket-isi.ts', 'kreatif-etiket.service.ts']) {
      expect(oku(f), f).not.toMatch(/\.catch\(\(\)\s*=>\s*(\[\]|null|undefined)\)/);
    }
  });
});
