import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ ÜST HESAP KATMANININ SESSİZCE KAYBOLACAĞI YERLER ═══
 *
 * TypeScript'in GÖRMEDİĞİ dört yer var ve dördü de yalnızca ÜRETİMDE
 * belirti veriyor:
 *
 *  1. NEST MODÜL KAYDI — modül `app.module.ts` listesinde yoksa DERLEME
 *     GEÇİYOR, hata AÇILIŞTA geliyor ve deploy'un ortasında görünüyor.
 *  2. RLS POLİTİKASI — `02_rls.sql` Prisma migration'ının parçası DEĞİL;
 *     tablo eklenip politikası yazılmazsa satır ya hiç görünmez ya da
 *     HERKESE görünür.
 *  3. GUC YAZIMI — `app.current_manager_account_id()` politikaların tek
 *     sınırı; `withTenant` onu yazmazsa üst hesap tabloları KÖR kalıyor.
 *  4. TRUNCATE LİSTESİ — yeni tablo eklenmezse testler arası veri sızıyor,
 *     ki bu bu depodaki en yanıltıcı test hatası türü.
 */
const MODUL_DIZINI = __dirname;
const API_SRC = join(MODUL_DIZINI, '..', '..');
const PRISMA = join(API_SRC, '..', 'prisma');

/** Yorumsuz kaynak — iddia açıklamaya değil KODA çapalanmalı (CLAUDE.md). */
function kod(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const APP_MODULE = kod(readFileSync(join(API_SRC, 'app.module.ts'), 'utf8'));
const MODULE = kod(readFileSync(join(MODUL_DIZINI, 'manager-account.module.ts'), 'utf8'));
const PRISMA_SERVICE = kod(readFileSync(join(API_SRC, 'prisma/prisma.service.ts'), 'utf8'));
const RLS = readFileSync(join(PRISMA, 'sql/02_rls.sql'), 'utf8');
const HARNESS = readFileSync(join(API_SRC, '..', 'test/pglite-harness.ts'), 'utf8');

/**
 * `@Module({ imports: [...] })` dizisini PARANTEZ SAYARAK çıkarır.
 *
 * İlk `]`e kadar dilimlemek YETMİYOR: dizinin içinde iç içe bir dizi var
 * (`ConfigModule.forRoot({ envFilePath: [...] })`) ve dilim orada kapanıyor.
 * Bu tam olarak CLAUDE.md'deki "sabit uzunluklu dilim komşuyu yakalıyor"
 * tuzağının kardeşi; ilk yazımda düşüldü ve boşa-düşme bekçisi yakaladı.
 */
function importsListesi(kaynak: string): string {
  const bas = kaynak.indexOf('imports: [');
  if (bas === -1) throw new Error('app.module.ts içinde `imports: [` bulunamadı');
  let derinlik = 0;
  for (let i = bas + 'imports: '.length; i < kaynak.length; i++) {
    if (kaynak[i] === '[') derinlik++;
    else if (kaynak[i] === ']') {
      derinlik--;
      if (derinlik === 0) return kaynak.slice(bas, i);
    }
  }
  throw new Error('`imports` dizisi kapanmıyor — app.module.ts bozuk mu?');
}

describe('üst hesap modülü kayıtlı', () => {
  it('BOŞA DÜŞME BEKÇİSİ: dosyalar gerçekten okundu', () => {
    // Dosya taşınırsa aşağıdaki iddialar BOŞ metinde doğru olurdu.
    expect(APP_MODULE).toContain('ReportsModule');
    expect(MODULE).toContain('ManagerAccountService');
    expect(PRISMA_SERVICE).toContain('set_config');
  });

  it('KRİTİK: modül `imports` LİSTESİNDE — import satırında değil', () => {
    /*
     * İDDİA LİSTEYE ÇAPALI, DOSYANIN TAMAMINA DEĞİL. İlk yazımda
     * `expect(APP_MODULE).toContain('ManagerAccountModule')` yazmıştım ve
     * mutasyon testinde BOŞA DÜŞTÜ: modülü `imports` dizisinden silmek
     * testi kırmıyordu, çünkü dosyanın başındaki `import` satırı hâlâ aynı
     * adı taşıyor. Kayıt eksikse `nest build` geçer, uygulama AÇILIŞTA
     * patlar — yani tam olarak bu testin yakalaması gereken hâl.
     */
    const liste = importsListesi(APP_MODULE);
    expect(liste).toContain('ReportsModule'); // boşa düşme bekçisi
    expect(liste).toContain('ManagerAccountModule');

    // Import satırı da olmalı; yoksa liste derlenmez.
    expect(APP_MODULE).toContain("from './modules/manager-account/manager-account.module'");
  });

  it('modül controller ve service\'i kaydediyor', () => {
    expect(MODULE).toContain('ManagerAccountController');
    expect(MODULE).toContain('providers: [ManagerAccountService]');
  });
});

describe('RLS kurulumu eksiksiz', () => {
  it('KRİTİK: iki tablo da ENABLE/FORCE listesinde', () => {
    /*
     * Liste dışında kalan bir tabloda RLS HİÇ AÇILMIYOR: politika yazılsa
     * bile devreye girmiyor ve satırlar herkese görünüyor.
     * `rls-coverage.spec.ts` de ayrıca tarıyor.
     */
    expect(RLS).toContain("'manager_accounts', 'manager_memberships'");
  });

  it('KRİTİK: SELECT politikaları üst hesap kimliğine çapalı', () => {
    expect(RLS).toContain('CREATE POLICY adv_manager_accounts_select');
    expect(RLS).toContain('CREATE POLICY adv_manager_memberships_select');
    expect(RLS).toContain('id = app.current_manager_account_id()');
    expect(RLS).toContain('manager_account_id = app.current_manager_account_id()');
  });

  it('KRİTİK: yazma uygulama rolüne KAPALI', () => {
    // Bu satırlar olmadan yanlış yazılmış tek bir servis metodu, kullanıcının
    // erişebildiği organizasyon kümesini büyütebilirdi.
    expect(RLS).toContain('REVOKE INSERT, UPDATE, DELETE ON manager_accounts FROM advetics_app');
    expect(RLS).toContain('REVOKE INSERT, UPDATE, DELETE ON manager_memberships FROM advetics_app');
  });

  it('KRİTİK: bağlam okuyucu fonksiyon tanımlı', () => {
    expect(RLS).toContain('CREATE OR REPLACE FUNCTION app.current_manager_account_id()');
  });

  it('KRİTİK: withTenant GUC\'u yazıyor', () => {
    /*
     * Politikaların TEK sınırı bu değer. `withTenant` onu yazmazsa
     * `current_setting` NULL döner, karşılaştırma NULL üretir ve üst hesap
     * ekranı sessizce BOŞ kalır — hata yok, log yok.
     */
    expect(PRISMA_SERVICE).toContain("set_config('app.current_manager_account_id'");
    expect(PRISMA_SERVICE).toContain('ctx.managerAccountId');
  });
});

describe('havuz ajans genelinde — RLS kurulumu', () => {
  it('KRİTİK: iki yardımcı fonksiyon da tanımlı', () => {
    expect(RLS).toContain('CREATE OR REPLACE FUNCTION app.ajansa_ait_org(');
    expect(RLS).toContain('CREATE OR REPLACE FUNCTION app.ajans_org_idleri()');
  });

  it('KRİTİK: fonksiyon SIRASI doğru — `current_manager_account_id` ÖNCE', () => {
    /*
     * Postgres `LANGUAGE sql` gövdelerini CREATE ANINDA çözümlüyor. Dosya
     * yukarıdan aşağı uygulandığı için, `ajansa_ait_org` içinde çağrılan
     * `app.current_manager_account_id()` ondan ÖNCE tanımlı olmak zorunda.
     *
     * BU CANLIDA DEĞİL TESTTE YAKALANDI ama üretimde de aynı şekilde
     * patlardı: `db:rls` "function app.current_manager_account_id() does
     * not exist" ile düşer ve deploy yarıda kalırdı.
     */
    const once = RLS.indexOf('CREATE OR REPLACE FUNCTION app.current_manager_account_id()');
    const sonra = RLS.indexOf('CREATE OR REPLACE FUNCTION app.ajansa_ait_org(');
    expect(once).toBeGreaterThan(-1);
    expect(sonra).toBeGreaterThan(once);
  });

  it('KRİTİK: HAVUZ ajans geneli, ATANMIŞ satır kendi şirketinde', () => {
    /*
     * Bu ayrım bir güvenlik sınırı ve testte yakalandı: `can_access_client()`
     * org yöneticisine HER workspace için true dönüyor ve workspace'in
     * ORG'una hiç bakmıyor. Dıştaki `org_id = current_org_id()` koşulunu
     * ajans geneline gevşetmek, kardeş şirketin ATANMIŞ hesaplarını
     * açıyordu.
     */
    expect(RLS).toContain('THEN org_id = ANY (app.ajans_org_idleri()) AND app.can_manage_pool()');
    expect(RLS).toContain(
      'ELSE org_id = app.current_org_id() AND app.can_access_client(client_id)',
    );
    // ATANMIŞ dal ajans genelini KULLANMAMALI.
    expect(RLS).not.toContain(
      'ELSE org_id = ANY (app.ajans_org_idleri()) AND app.can_access_client(client_id)',
    );
  });

  it('KRİTİK: organizations politikası aynı fonksiyonu kullanıyor', () => {
    // Koşulu iki yerde yazmak, doğdukları anda ayrışan iki kopya demekti.
    expect(RLS).toContain(
      'CREATE POLICY adv_organizations_select ON organizations\n  FOR SELECT USING (app.ajansa_ait_org(id, manager_account_id));',
    );
  });
});

describe('koşum ortamı', () => {
  it('KRİTİK: TRUNCATE listesinde iki tablo da var', () => {
    // Eksikse testler arası üyelik satırı sızar ve bir sonraki test
    // "neden bu kullanıcının üst hesabı var" diye sorar.
    expect(HARNESS).toContain('manager_memberships');
    expect(HARNESS).toContain('manager_accounts');
  });

  it('migration dosyası duruyor', () => {
    /*
     * Şemaya yazmak veritabanını DEĞİŞTİRMİYOR (CLAUDE.md). Koşum ortamı
     * şemayı üretim migration'larından kuruyor; dosya yoksa testler tabloyu
     * hiç görmez ve hata "relation does not exist" olurdu.
     */
    const dizinler = readdirSync(join(PRISMA, 'migrations'));
    const ustHesap = dizinler.filter((d) => d.includes('ust_hesap'));
    expect(ustHesap).toHaveLength(1);
    const dizin = ustHesap[0];
    // `!` YERİNE AÇIK KONTROL: `noUncheckedIndexedAccess` altında `[0]`
    // `undefined` olabiliyor ve `!` o bilgiyi susturur — testin kendisi
    // sessizce `undefined` bir yola bakabilirdi.
    if (!dizin) throw new Error('migration dizini bulunamadı');
    const sql = readFileSync(join(PRISMA, 'migrations', dizin, 'migration.sql'), 'utf8');
    expect(sql).toContain('CREATE TABLE "manager_accounts"');
    expect(sql).toContain('CREATE TABLE "manager_memberships"');
    // Şirket bağı SET NULL olmak zorunda — cascade, bir danışmanlık kaydını
    // silmenin bütün müşterilerin verisini götürmesi demekti.
    expect(sql).toContain('ON DELETE SET NULL');
  });
});
