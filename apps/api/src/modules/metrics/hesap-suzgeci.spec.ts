import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ İZLENEN HESAP SÜZGECİ ALT SORGU OLARAK YAZILAMAZ ═══
 *
 * `filters()` uzun süre şunu üretiyordu:
 *
 *     AND ad_account_id IN (SELECT id FROM ad_accounts WHERE sync_enabled)
 *
 * Doğru sonucu veriyordu ve ÜRETİMDEKİ YAVAŞLIĞIN TAMAMI buydu. Ajans
 * kapsamında alınan plan:
 *
 *     Nested Loop  (actual time=1.234..1691.171 rows=8014)
 *       ->  Append  … rows=8054   Buffers: hit=287 read=3060     (59 ms)
 *       ->  Index Scan using ad_accounts_pkey  (loops=8054)
 *             Buffers: shared hit=32216
 *
 * `insights_daily` taraması 59 MİLİSANİYE; kalan 1.630 ms sekiz bin kez
 * `ad_accounts`a gidip gelmek. `timeseries`te 16.313 döngü ve 2.475 ms.
 * Üç yavaş ucun da zamanının ~%95'i buradaydı — ve üç tur boyunca
 * `insights_daily` indeksleriyle uğraştım, çünkü ölçüm oraya bakmıyordu.
 *
 * ═══ BU TEST NEDEN KAYNAK TARAMASI ═══
 *
 * Alt sorgu geri geldiğinde HİÇBİR ŞEY PATLAMIYOR: sonuçlar birebir aynı,
 * bütün davranış testleri yeşil kalıyor, yalnızca panel yeniden saniyelerce
 * bekletiyor. Davranışla yakalanamayan bir regresyon.
 */
const KAYNAK = readFileSync(resolve(__dirname, 'metrics.service.ts'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

describe('tarama boşa düşmüyor', () => {
  it('kaynak okundu ve süzgeç üreticisini taşıyor', () => {
    expect(KAYNAK).toContain('private filters(');
    expect(KAYNAK).toContain('private async izlenenHesapIdleri(');
    expect(KAYNAK.length).toBeGreaterThan(5000);
  });
});

describe('KRİTİK: hesap süzgeci ALT SORGU değil', () => {
  it('`IN (SELECT … ad_accounts …)` deseni KALMADI', () => {
    expect(KAYNAK).not.toMatch(/IN \(\s*SELECT id FROM ad_accounts/);
  });

  it('süzgeç ÖNCEDEN ÇEKİLMİŞ diziye karşı kuruluyor', () => {
    const bas = KAYNAK.indexOf('private filters(');
    const dilim = KAYNAK.slice(bas, KAYNAK.indexOf('\n  }', bas));
    expect(dilim.length, 'gövde bulunamadı — tarama boşa düştü').toBeGreaterThan(300);
    expect(dilim).toContain('ad_account_id`)} = ANY(${hesaplar}::uuid[])');
  });

  it('KRİTİK: liste TEK sorguyla ve AYNI transaction’dan okunuyor', () => {
    /*
     * `tx` üzerinden okunmak ZORUNDA: `PrismaAdminService` ya da yeni bir
     * bağlantı RLS'i atlar ve süzgeç, kullanıcının GÖREMEDİĞİ hesapları da
     * kapsardı — izolasyonu sorgunun içinden delmek olurdu.
     */
    const bas = KAYNAK.indexOf('private async izlenenHesapIdleri(');
    const dilim = KAYNAK.slice(bas, KAYNAK.indexOf('\n  }', bas));
    expect(dilim.length, 'gövde bulunamadı — tarama boşa düştü').toBeGreaterThan(100);
    expect(dilim).toContain('tx.$queryRaw');
    expect(dilim).toContain('SELECT id FROM ad_accounts WHERE sync_enabled = true');
    expect(dilim).not.toContain('this.admin');
  });
});

describe('KRİTİK: HER metrik sorgusu süzgeci alıyor', () => {
  it('`insights_daily` OKUYAN her gövde süzgeci kuruyor', () => {
    /*
     * Bir gövdenin süzgeci unutması, o ucun izlemesi KAPALI hesapların
     * harcamasını panele taşıması demek — sessiz ve yanlış bir sayı.
     *
     * İDDİA "HER GÖVDE" DEĞİL, "METRİK OKUYAN HER GÖVDE".
     *
     * Eskiden iki sayı eşitleniyordu (`withTenant` gövdesi = `filters`
     * çağrısı) ve ekmek kırıntısının isimlerini okuyan uç eklendiğinde
     * KIRMIZI verdi: o uç `campaigns`/`ad_groups` satırını birincil
     * anahtarla okuyor, `insights_daily`ye hiç dokunmuyor ve orada süzgeç
     * anlamsız — izolasyonu RLS yapıyor. Sayıyı bir artırmak kuralı
     * gevşetirdi; iddia artık gövdenin NE OKUDUĞUNA bakıyor.
     */
    const govdeler = KAYNAK.split('this.prisma.withTenant(ctx, async (tx) => {').slice(1);
    const metrikOkuyan = govdeler.filter((g) => g.includes('FROM insights_daily'));
    expect(metrikOkuyan.length, 'tarama boşa düştü').toBeGreaterThan(4);
    for (const g of metrikOkuyan) {
      expect(
        g.includes('const filters = this.filters(ctx, query,'),
        'insights_daily okuyan bir gövde süzgeç kurmuyor',
      ).toBe(true);
    }
  });

  it('KRİTİK: her çağrı listeyi GERÇEKTEN geçiriyor', () => {
    // Parametre zorunlu olduğu için derleme de koruyor; ama biri boş dizi
    // geçirseydi süzgeç sessizce HİÇBİR SATIR döndürürdü.
    const cagrilar = KAYNAK.match(/const filters = this\.filters\([^;]+;/g) ?? [];
    expect(cagrilar.length).toBeGreaterThan(4);
    for (const c of cagrilar) {
      expect(c, `süzgeç listesiz kurulmuş: ${c}`).toContain('await this.izlenenHesapIdleri(tx)');
    }
  });

  it('KRİTİK: JOIN taşıyan sorgularda ALIAS düşmüyor', () => {
    /*
     * `breakdown`, `byClient` ve `byOrganization` `insights_daily i` ile
     * yazılmış ve `ad_accounts`/`clients` JOIN'liyor. Alias düşerse
     * niteliksiz `client_id` BELİRSİZ olur ya da yanlış tabloya bağlanır.
     * (Bu tam olarak bu değişiklikte bir kez yapıldı; mevcut kırılım
     * testleri yakaladı.)
     */
    const aliasli = KAYNAK.split("await this.izlenenHesapIdleri(tx), 'i')").length - 1;
    const aliasliSorgu = KAYNAK.split('FROM insights_daily i\n').length - 1;
    expect(aliasliSorgu).toBeGreaterThan(2);
    expect(aliasli).toBe(aliasliSorgu);
  });
});
