import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GERI_BESLEME_ASAMALARI,
  GERI_BESLEME_BEKLEYEN_IS,
  GERI_BESLEME_OLAY_DURUMLARI,
  GERI_BESLEME_PLATFORMLARI,
  GERI_BESLEME_UCLARI,
  GERI_BESLEME_UYARI_KODU,
  BEKLEYEN_IS_TURLERI,
  BEKLEYEN_IS_YETKISI,
  LEAD_STATUSES,
  UYARI_KODLARI,
} from '@advetics/shared';

/**
 * ═══ KAYNAK TARAMALARI — derlemenin göremediği bağlar (Paket E) ═══
 *
 * 1. Uçlar ve izinler `GERI_BESLEME_UCLARI` ile BİREBİR (izin düz dize).
 * 2. Nest modül kaydı AÇILIŞTA patlar, derlemede değil.
 * 3. CHECK listeleri = shared listeleri (ayrışırsa INSERT üretimde patlar).
 * 4. `test_event_code` YOK (Meta test olaylarını üretime işliyor) ve
 *    gövdeye kişisel veri giren bir yol yok.
 * 5. Yeni lead'in geçmiş + ham lead satırı lead INSERT'üyle AYNI deyimde.
 *
 * Taramalar YORUMSUZ kaynakta: kuralı anlatan yorum eşleşip testi yeşil
 * bırakmasın (CLAUDE.md).
 */
const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*--.*$/gm, '');
const oku = (yol: string) => yorumsuz(readFileSync(join(__dirname, yol), 'utf8'));

describe('uçlar ve izinler', () => {
  it('KRİTİK: controller GERI_BESLEME_UCLARI ile eksiksiz ve fazlasız', () => {
    const src = oku('geri-besleme.controller.ts');
    expect(src).toContain(`@Controller('geri-besleme')`);
    const rotalar = [...src.matchAll(/@(Get|Post|Put|Patch|Delete)\(/g)];
    const bulunan: Record<string, string> = {};
    for (const m of src.matchAll(/@(Get|Post|Put|Patch|Delete)\('([^']*)'\)\s*@RequirePermissions\('([^']+)'\)/g)) {
      bulunan[`${m[1]!.toUpperCase()} /geri-besleme/${m[2]}`] = m[3]!;
    }
    expect(rotalar.length).toBe(GERI_BESLEME_UCLARI.length);
    expect(bulunan).toEqual(Object.fromEntries(GERI_BESLEME_UCLARI.map((u) => [`${u.yontem} ${u.yol}`, u.izin])));
  });

  it('kalite işareti için ikinci uç YOK: lead güncellemesi geçmiş + plan yazıyor', () => {
    const src = oku('../leads/leads.service.ts');
    const bas = src.indexOf('async update(');
    if (bas < 0) throw new Error('update gövdesi bulunamadı — tarama boşa düşerdi');
    const govde = src.slice(bas, src.indexOf('async exportCsv(', bas));
    // Çağrı withTenant'ın İÇİNDE (aynı transaction), FOR UPDATE ile okunan önceki durumla.
    expect(govde).toMatch(/withTenant\(ctx, async \(tx\) => \{[\s\S]*FOR UPDATE[\s\S]*await durumDegisti\(tx, \{[\s\S]*onceki: once\.status/);
  });
});

describe('Nest kaydı', () => {
  it('KRİTİK: GeriBeslemeModule AppModule’de; gönderim servisi QueueModule’de ve işleyiciye bağlı', () => {
    const app = oku('../../app.module.ts');
    expect(app).toMatch(/import \{ GeriBeslemeModule \} from '\.\/modules\/geri-besleme\/geri-besleme\.module'/);
    expect(app).toMatch(/\bGeriBeslemeModule,/);
    const modul = oku('geri-besleme.module.ts');
    expect(modul).toMatch(/imports:\s*\[ConnectionsModule\]/);
    expect(modul).toMatch(/controllers:\s*\[GeriBeslemeController\]/);
    expect(modul).toMatch(/providers:\s*\[GeriBeslemeService\]/);
    const kuyruk = oku('../../queue/queue.module.ts');
    expect(kuyruk).toMatch(/providers:\s*\[[^\]]*\bGeriBeslemeGonderimService\b/);
    expect(kuyruk).toMatch(/imports:\s*\[[^\]]*\bConnectionsModule\b/);
    const islem = oku('../../queue/sync-processor.service.ts');
    expect(islem).toContain('private readonly geriBesleme: GeriBeslemeGonderimService');
    expect(islem).toContain(`if (payload.jobType === 'lead_feedback_send') return this.processGeriBeslemeJob(payload);`);
    expect(islem).toContain(`if (payload.jobType === 'lead_feedback_send') return this.geriBeslemeSupurmesi();`);
    const zaman = oku('../../queue/sync-queue.service.ts');
    expect(zaman).toMatch(/name: 'sweep:lead-feedback', pattern: '[^']+', jobType: 'lead_feedback_send'/);
  });

  it('uyarı kodu ve bekleyen iş türü shared listelerinde (sözleşmenin Ç-9 maddesi)', () => {
    expect(UYARI_KODLARI).toContain(GERI_BESLEME_UYARI_KODU);
    expect(BEKLEYEN_IS_TURLERI).toContain(GERI_BESLEME_BEKLEYEN_IS.tur);
    expect(BEKLEYEN_IS_YETKISI[GERI_BESLEME_BEKLEYEN_IS.tur]).toBe(GERI_BESLEME_BEKLEYEN_IS.izin);
  });
});

describe('Meta isteği', () => {
  const kaynaklar = readdirSync(__dirname).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));

  it('BOŞA DÜŞME BEKÇİSİ: tarama gönderim kodunu gerçekten okudu', () => {
    expect(kaynaklar).toContain('meta-crm-istemcisi.ts');
    expect(kaynaklar).toContain('geri-besleme-gonderim.service.ts');
    expect(oku('geri-besleme-gonderim.service.ts')).toContain('metaGovdeMetni(');
  });

  it('KRİTİK: modülün hiçbir kaynağında test_event_code yok (Meta test olaylarını üretime işliyor)', () => {
    for (const f of kaynaklar) expect(oku(f), f).not.toMatch(/test_event_code/);
  });

  it('KRİTİK: gövde YALNIZ sözleşmenin metaGovdeMetni ile kuruluyor; istemci gövdeyi yeniden serileştirmiyor', () => {
    const istemci = oku('meta-crm-istemcisi.ts');
    const bas = istemci.indexOf('async olayGonder(');
    if (bas < 0) throw new Error('olayGonder bulunamadı — tarama boşa düşerdi');
    const govde = istemci.slice(bas, istemci.indexOf('async veriKumesiOku(', bas));
    expect(govde).toContain('body: govdeMetni');
    // 17 haneli kimliği bozacak bir JSON.parse/stringify ya da Number() yok.
    expect(govde).not.toMatch(/JSON\.(parse|stringify)|Number\(/);
    // Gönderim servisi kişi alanlarını (ad, e-posta, telefon) hiç seçmiyor.
    const servis = oku('geri-besleme-gonderim.service.ts');
    expect(servis).not.toMatch(/full_name|\bemail\b|\bphone\b|"em"|"ph"/);
  });

  it('KRİTİK: ön koşul (ayar, bağlantı) token ve platform çağrısından ÖNCE', () => {
    const src = oku('geri-besleme-gonderim.service.ts');
    const bas = src.indexOf('async calistir(');
    if (bas < 0) throw new Error('calistir bulunamadı — tarama boşa düşerdi');
    const govde = src.slice(bas, src.indexOf('private async parti(', bas));
    const kosul = govde.indexOf(`ayar.baglanti_durumu !== 'active'`);
    const token = govde.indexOf('this.kasa.getAccessToken(');
    const pencere = govde.indexOf('metaPenceredeMi(');
    const parti = govde.indexOf('this.parti(');
    expect(kosul).toBeGreaterThan(0);
    expect(token).toBeGreaterThan(kosul);
    expect(pencere).toBeGreaterThan(kosul);
    expect(parti).toBeGreaterThan(pencere);
  });
});

describe('yeni lead tek deyimde', () => {
  it('KRİTİK: lead INSERT’ü, geçmiş satırı ve ham lead olayı AYNI $queryRaw’da', () => {
    const src = oku('../../queue/lead-sync.service.ts');
    const bas = src.indexOf('WITH yeni AS (');
    if (bas < 0) throw new Error('lead INSERT CTE’si bulunamadı — tarama boşa düşerdi');
    const deyim = src.slice(bas, src.indexOf('`);', bas));
    expect(deyim).toContain('INSERT INTO leads');
    expect(deyim).toContain('ON CONFLICT (external_lead_id) DO NOTHING');
    expect(deyim).toMatch(/INSERT INTO lead_durum_gecmisi[\s\S]*FROM yeni/);
    expect(deyim).toMatch(/INSERT INTO geri_besleme_olaylari[\s\S]*FROM yeni y[\s\S]*a\.etkin[\s\S]*WHERE \$\{ham\.pencerede\}/);
  });
});

describe('CHECK listeleri = shared listeleri', () => {
  const sql = readFileSync(join(__dirname, '../../../prisma/migrations/20261014300000_geri_besleme/migration.sql'), 'utf8');
  const liste = (kisit: string): string[] => {
    const i = sql.indexOf(`"${kisit}" CHECK`);
    if (i < 0) throw new Error(`${kisit} bulunamadı`);
    const parca = sql.slice(i, sql.indexOf('),\n', i) > 0 ? sql.indexOf('),\n', i) + 1 : sql.indexOf(');', i));
    return [...parca.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
  };

  it('KRİTİK: olay durumu, aşama ve platform iki yönlü aynı', () => {
    expect(new Set(liste('geri_besleme_olaylari_durum_chk'))).toEqual(new Set(GERI_BESLEME_OLAY_DURUMLARI));
    expect(new Set(liste('geri_besleme_olaylari_asama_chk'))).toEqual(new Set(GERI_BESLEME_ASAMALARI));
    expect(new Set(liste('geri_besleme_olaylari_platform_chk'))).toEqual(new Set(GERI_BESLEME_PLATFORMLARI));
    expect(new Set(liste('geri_besleme_ayarlari_platform_chk'))).toEqual(new Set(GERI_BESLEME_PLATFORMLARI));
  });

  it('KRİTİK: geçmişin durum listesi LEAD_STATUSES ile aynı', () => {
    expect(new Set(liste('lead_durum_gecmisi_yeni_chk'))).toEqual(new Set(LEAD_STATUSES));
  });

  it('enum değeri AYRI migration’da ve o dosyada başka bir şey yok', () => {
    const enumSql = yorumsuz(
      readFileSync(join(__dirname, '../../../prisma/migrations/20261014300100_geri_besleme_is_turleri/migration.sql'), 'utf8'),
    ).trim();
    expect(enumSql).toBe(`ALTER TYPE "SyncJobType" ADD VALUE IF NOT EXISTS 'lead_feedback_send';`);
    expect(sql).not.toContain('lead_feedback_send');
  });
});
