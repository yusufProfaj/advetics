import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ ÖLÇÜM ARACI ÜRETİMDEKİ BAĞLAMI TAKLİT ETMEK ZORUNDA ═══
 *
 * `olcum-metrik.ts` RLS oturum değişkenlerini `PrismaService.withTenant`
 * ile aynı şekilde kuruyor. Biri yeni bir değişken eklediğinde diğeri
 * güncellenmezse hiçbir şey patlamıyor: script çalışır, plan üretir ve o
 * plan ÜRETİMDEKİNDEN BAŞKA olur — çünkü eksik GUC yüzünden politikalar
 * başka bir dala düşer. Sonuç, yanlış yeri optimize etmek.
 *
 * CLAUDE.md: "AYNI SÜZGECİ İKİ YERDE YAZMA." Burada ikiye yazmak
 * kaçınılmazdı (biri uygulama yolu, biri ölçüm aracı); o zaman ayrışmayı
 * test yakalamak zorunda.
 */
const yorumsuz = (yol: string) =>
  readFileSync(resolve(__dirname, yol), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const OLCUM = yorumsuz('../../prisma/olcum-metrik.ts');
const PRISMA = yorumsuz('prisma.service.ts');

/** `set_config('app.X'` geçen her yerden X'i toplar. */
function gucAdlari(kaynak: string): string[] {
  const bulunan = [...kaynak.matchAll(/set_config\(\s*'(app\.[a-z_]+)'/g)].map((m) => m[1]!);
  return [...new Set(bulunan)].sort();
}

describe('tarama boşa düşmüyor', () => {
  it('iki kaynak da okundu ve GUC taşıyor', () => {
    expect(gucAdlari(PRISMA).length).toBeGreaterThan(5);
    expect(gucAdlari(OLCUM).length).toBeGreaterThan(5);
  });
});

describe('KRİTİK: bağlam BİREBİR aynı', () => {
  it('ölçüm aracı `withTenant` ile AYNI oturum değişkenlerini kuruyor', () => {
    expect(gucAdlari(OLCUM)).toEqual(gucAdlari(PRISMA));
  });
});

describe('KRİTİK: ölçüm UYGULAMANIN ROLÜYLE koşuyor', () => {
  it('plan `DATABASE_URL` üzerinden alınıyor, migrator ile DEĞİL', () => {
    /*
     * `DIRECT_DATABASE_URL` tablo sahibi ve BYPASSRLS: onunla alınan plan
     * politikaların eklediği yüklemleri HİÇ taşımaz, yani üretimde yavaş
     * olan sorgunun planı değildir. Kimlik çözümü için admin istemcisi
     * gerekli (yumurta-tavuk), ÖLÇÜM için değil.
     */
    expect(OLCUM).toContain("const uygulama = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })");
    const bas = OLCUM.indexOf('for (const o of olcumler)');
    expect(bas).toBeGreaterThan(-1);
    const dilim = OLCUM.slice(bas, OLCUM.indexOf('\n      }', bas));
    expect(dilim.length, 'gövde bulunamadı — tarama boşa düştü').toBeGreaterThan(100);
    expect(dilim).toContain('EXPLAIN (ANALYZE, BUFFERS, TIMING)');
    expect(dilim).toContain('tx.$queryRawUnsafe');
  });

  it('KRİTİK: hiçbir şey KALICI olmuyor — transaction geri alınıyor', () => {
    /*
     * Araç `--aday` ile DENEME İNDEKSİ kurabiliyor, yani "hiçbir yazma
     * yok" demek artık doğru değil. Doğru olan şu: yazılan her şey aynı
     * transaction'ın içinde ve sonunda geri alınıyor.
     */
    expect(OLCUM).toContain('throw new GeriAl();');
    // Veri yazan bir çağrı YOK — yalnızca indeks kuruluyor.
    expect(OLCUM).not.toMatch(/\$executeRawUnsafe\(\s*`?\s*(INSERT|UPDATE|DELETE)/i);
  });

  it('KRİTİK: aday denemesi OPT-IN ve kilidi tek partition’la sınırlı', () => {
    /*
     * `CREATE INDEX` ACCESS EXCLUSIVE kilidi alıyor. Partition'lı EBEVEYNE
     * kurulsaydı kilit BÜTÜN aylara yayılırdı ve üretimdeki worker'ı
     * bekletirdi; tek partition ~46 bin satır, saniyenin altında.
     *
     * Varsayılan açık olsaydı "sadece plan bakayım" diyen biri farkında
     * olmadan üretimde kilit alırdı.
     */
    expect(OLCUM).toContain("const ADAY = ARGV.includes('--aday');");
    expect(OLCUM).toContain('if (ADAY) {');
    // Hedef `pg_inherits` ile seçilen bir PARTITION adı; ebeveyn adı değil.
    expect(OLCUM).toContain('CREATE INDEX aday_kapsayan ON ${hedef.relname}');
    expect(OLCUM).not.toContain('CREATE INDEX aday_kapsayan ON insights_daily ');
  });

  it('KRİTİK: ölçülen sorgular ÜRETİMDEKİ süzgeci taşıyor', () => {
    /*
     * `filters()` her metrik sorgusuna `ad_account_id IN (SELECT id FROM
     * ad_accounts WHERE sync_enabled = true)` ekliyor. Ölçümden düşmüş
     * olsaydı plan üretimdekinden BAŞKA bir sorgunun planı olurdu — ve
     * yanlış yeri optimize etmeye götürürdü.
     */
    const adet = OLCUM.split('sync_enabled = true').length - 1;
    expect(adet).toBeGreaterThanOrEqual(4);
  });
});
