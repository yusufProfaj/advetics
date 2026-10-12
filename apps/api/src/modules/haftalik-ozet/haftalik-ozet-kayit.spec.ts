import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BILDIRIM_OLAYI_ADI,
  OZET_BILDIRIM_OLAYI,
  OZET_UCLARI,
  RAPOR_PLANI_TURLERI,
  YORUM_DURUMLARI,
  isoHaftaKodu,
} from '@advetics/shared';
import { CASCADE_ILE_TASINANLAR } from '../manager-account/workspace-tasima';
import { isoHafta } from '../iyilestir/oneri-hesap';

/**
 * ═══ KAYNAK TARAMALARI — derlemenin göremediği bağlar (Paket B) ═══
 *
 * 1. Uçlar ve izinler `OZET_UCLARI` ile BİREBİR.
 * 2. Nest kaydı AÇILIŞTA patlar: çekirdek modül hiçbir şeyi içe almıyor,
 *    rapor ve teslim modülleri çekirdeği içe alıyor, API modülü AppModule'de.
 * 3. CHECK listeleri = shared listeleri.
 * 4. Müşteri gönderim yolu süzülmüş görünümle çağrılıyor.
 *
 * Taramalar YORUMSUZ kaynakta (kuralı anlatan yorum eşleşmesin).
 */
const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*--.*$/gm, '');
const oku = (yol: string) => yorumsuz(readFileSync(join(__dirname, yol), 'utf8'));

describe('uçlar ve izinler', () => {
  it('KRİTİK: controller OZET_UCLARI ile eksiksiz ve fazlasız', () => {
    const src = oku('haftalik-ozet.controller.ts');
    expect(src).toContain("@Controller('haftalik-ozet')");
    const bulunan: Record<string, string> = {};
    for (const m of src.matchAll(/@(Get|Post|Put|Patch|Delete)\('([^']*)'\)\s*@RequirePermissions\('([^']+)'\)/g)) {
      bulunan[`${m[1]!.toUpperCase()} /haftalik-ozet/${m[2]}`] = m[3]!;
    }
    expect([...src.matchAll(/@(Get|Post|Put|Patch|Delete)\(/g)]).toHaveLength(OZET_UCLARI.length);
    expect(bulunan).toEqual(Object.fromEntries(OZET_UCLARI.map((u) => [`${u.yontem} ${u.yol}`, u.izin])));
  });

  it('KRİTİK: kitle=ajans ek izni SERVİSTE ve sayı üretmeden ÖNCE', () => {
    const src = oku('haftalik-ozet.service.ts');
    const i = src.indexOf('async onizleme(');
    if (i < 0) throw new Error('onizleme bulunamadı');
    const govde = src.slice(i, src.indexOf('this.ozet.getir', i));
    expect(govde).toContain('this.kapi(ctx, sorgu.clientId, sorgu.kitle)');
    expect(src).toMatch(/kitle === 'ajans' && !ctx\.permissions\.includes\(OZET_AJANS_IZNI\)/);
  });
});

describe('Nest kaydı', () => {
  it('KRİTİK: çekirdek hiçbir modülü içe almıyor; Reports ve SinyalIs onu içe alıyor; API modülü AppModule’de', () => {
    const cekirdek = oku('haftalik-ozet-is.module.ts');
    expect(cekirdek).not.toMatch(/imports:/);
    expect(cekirdek).toMatch(/providers:\s*\[OzetService, GenelBakisService\]/);
    expect(cekirdek).toMatch(/exports:\s*\[OzetService\]/);
    expect(oku('../reports/reports.module.ts')).toMatch(/imports:\s*\[ConnectionsModule, HaftalikOzetIsModule\]/);
    expect(oku('../sinyal/sinyal-is.module.ts')).toMatch(/imports:\s*\[HaftalikOzetIsModule\]/);
    const api = oku('haftalik-ozet.module.ts');
    expect(api).toMatch(/imports:\s*\[HaftalikOzetIsModule, ReportsModule\]/);
    expect(api).toMatch(/controllers:\s*\[HaftalikOzetController\]/);
    expect(api).toMatch(/providers:\s*\[HaftalikOzetService\]/);
    const app = oku('../../app.module.ts');
    expect(app).toMatch(/import \{ HaftalikOzetModule \} from '\.\/modules\/haftalik-ozet\/haftalik-ozet\.module'/);
    expect(app).toMatch(/\bHaftalikOzetModule,/);
    // İyileştir modülü İÇE ALINMIYOR (döngü); servis ModuleRef ile çözülüyor.
    expect(oku('ozet.service.ts')).not.toMatch(/IyilestirModule/);
  });
});

describe('veritabanı sözleşmesi', () => {
  const sql = yorumsuz(readFileSync(join(__dirname, '../../../prisma/migrations/20261014500000_haftalik_ozet/migration.sql'), 'utf8'));
  const liste = (kisit: string): string[] => {
    const i = sql.indexOf(`"${kisit}" CHECK`);
    if (i < 0) throw new Error(`${kisit} bulunamadı`);
    return [...sql.slice(i, sql.indexOf(');', i)).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
  };

  it('KRİTİK: CHECK listeleri shared listeleriyle iki yönlü aynı', () => {
    expect(liste('haftalik_ozetler_yorum_durumu_chk')).toEqual([...YORUM_DURUMLARI]);
    expect(liste('report_schedules_tur_chk')).toEqual([...RAPOR_PLANI_TURLERI]);
  });

  it('KRİTİK: bildirim olayı shared’da, adı sözleşmedekiyle aynı; olay kolonu 13 karakteri taşıyor', () => {
    expect(BILDIRIM_OLAYI_ADI[OZET_BILDIRIM_OLAYI.olay]).toBe(OZET_BILDIRIM_OLAYI.ad);
    expect(sql).toMatch(/ALTER COLUMN "olay" TYPE VARCHAR\(20\)/);
    expect(OZET_BILDIRIM_OLAYI.olay.length).toBeGreaterThan(10);
  });

  it('KRİTİK: üç durak — CASCADE listesi, 02_rls tablo dizisi + politikalar, TRUNCATE', () => {
    expect(CASCADE_ILE_TASINANLAR as readonly string[]).toContain('haftalik_ozetler');
    const rls = readFileSync(join(__dirname, '../../../prisma/sql/02_rls.sql'), 'utf8');
    expect(rls).toMatch(/^\s*'haftalik_ozetler',\s*$/m);
    expect(rls).toMatch(/CREATE POLICY adv_haftalik_ozetler_select ON haftalik_ozetler/);
    expect(rls).toMatch(/CREATE POLICY adv_haftalik_ozetler_insert ON haftalik_ozetler/);
    expect(rls).not.toMatch(/CREATE POLICY \w+ ON haftalik_ozetler\s+FOR (UPDATE|DELETE)/);
    expect(readFileSync(join(__dirname, '../../../test/pglite-harness.ts'), 'utf8')).toMatch(/\bhaftalik_ozetler,/);
  });

  it('İSO hafta TEK tanım: İyileştir’in isoHafta’sı shared’daki fonksiyonun KENDİSİ', () => {
    expect(isoHafta).toBe(isoHaftaKodu);
  });
});

describe('müşteriye giden mail yolu', () => {
  it('KRİTİK: planlı mail müşteri görünümüyle kuruluyor; ajans kanalı ajans görünümüyle', () => {
    const plan = oku('../reports/rapor-plani.service.ts');
    const i = plan.indexOf('private async ozetCalistir(');
    if (i < 0) throw new Error('ozetCalistir bulunamadı');
    const govde = plan.slice(i, plan.indexOf('async ozetPlani(', i));
    expect(govde).toMatch(/ozetEpostasi\(ozet, 'musteri'/);
    expect(govde).not.toMatch(/'ajans'/);
    expect(oku('../sinyal/bildirim-teslim.service.ts')).toMatch(/ozetEpostasi\(ozet, 'ajans'/);
    // Oluşturucunun ilk işi süzgeç.
    const mail = oku('ozet-mail.ts');
    const j = mail.indexOf('export function ozetEpostasi(');
    expect(mail.slice(j, j + 300)).toMatch(/const o = ozetKitleyeGore\(ham, kitle\);/);
  });
});
