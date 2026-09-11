import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../../test/pglite-harness';

/**
 * ═══ ŞİRKET SİLMEK OTUZ TABLOYU GÖTÜRÜYOR ═══
 *
 * Kullanıcının isteği açıktı: *"ürettiğim şirketi silemiyorum … şirketi
 * silerken içerisinde workspace varsa içindeki workspace'i de sil ama
 * 'workspace'iniz de silinecek' tarzında bir bildirim çıkart."*
 *
 * Ama `organizations` satırını silmek yalnızca workspace'leri götürmüyor:
 * reklam hesapları, KULLANICILAR, kampanyalar ve bütün metrik geçmişi de
 * cascade ile gidiyor. Meta 37 aylık sınıra takılıyor ve Google'da yeniden
 * çekmek kota harcıyor — geri alma yolu YOK.
 *
 * Bu paket cascade'in GERÇEKTEN nereye kadar gittiğini ölçüyor. Şema
 * yorumuna güvenmek yetmez: `onDelete` kuralı bir satır değişikliğiyle
 * sessizce `Restrict`e dönebilir ve o zaman silme üretimde patlar, ya da
 * `SetNull`a dönüp yetim satır bırakır.
 */
let h: Harness;

const MGR = 'aaaaaaaa-0000-0000-0000-00000000000f';
const ORG = '11111111-1111-1111-1111-111111111111';
const SILINECEK = '11111111-1111-1111-1111-111111111112';
const CLIENT = '22222222-2222-2222-2222-222222222222';
const USER = '55555555-5555-5555-5555-555555555555';
const CONN = '33333333-3333-3333-3333-333333333333';
const ADACC = '44444444-4444-4444-4444-444444444444';

beforeAll(async () => {
  h = await createHarness();
}, 180_000);
afterAll(() => h.close());

beforeEach(async () => {
  await h.reset();
  await h.q(
    `INSERT INTO manager_accounts (id, name, slug, updated_at) VALUES ($1,'Profaj','profaj',now())`,
    [MGR],
  );
  for (const [id, ad, slug] of [
    [ORG, 'Ajans', 'ajans'],
    [SILINECEK, 'Çizgi Medikal', 'cizgi-medikal'],
  ] as const) {
    await h.q(
      `INSERT INTO organizations (id, name, slug, manager_account_id, updated_at)
       VALUES ($1,$2,$3,$4,now())`,
      [id, ad, slug, MGR],
    );
  }
  await h.q(
    `INSERT INTO users (id, org_id, email, password_hash, full_name, updated_at)
     VALUES ($1,$2,'a@b.c','x','A',now())`,
    [USER, ORG],
  );
  await h.q(
    `INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1,$2,'Workspace','ws',now())`,
    [CLIENT, SILINECEK],
  );
  await h.q(
    `INSERT INTO platform_connections
       (id, org_id, client_id, platform, status, external_user_id, account_label,
        access_token_enc, granted_scopes, connected_by_user_id, updated_at)
     VALUES ($1,$2,$3,'meta','active','u1','T','\\x00','{}',$4,now())`,
    [CONN, SILINECEK, CLIENT, USER],
  );
  await h.q(
    `INSERT INTO ad_accounts
       (id, org_id, client_id, connection_id, platform, external_id, name, currency,
        timezone, sync_enabled, updated_at)
     VALUES ($1,$2,$3,$4,'meta','act_1','H','TRY','Europe/Istanbul',true,now())`,
    [ADACC, SILINECEK, CLIENT, CONN],
  );
  await h.q(`SELECT app.ensure_insights_partition('2026-08-01'::date)`);
  await h.q(
    `INSERT INTO insights_daily
       (date, entity_level, entity_id, breakdown_key, client_id, ad_account_id, platform,
        entity_external_id, impressions, clicks, spend_micros, conversions,
        conversion_value_micros, currency)
     VALUES ('2026-08-02','campaign',gen_random_uuid(),'',$1,$2,'meta','x',1,1,1,0,0,'TRY')`,
    [CLIENT, ADACC],
  );
});

async function sayim(sql: string, params: unknown[] = []): Promise<number> {
  const [r] = await h.q<{ n: string }>(sql, params);
  return Number(r?.n ?? 0);
}

describe('tarama boşa düşmüyor', () => {
  it('fixture GERÇEKTEN dolu — yoksa cascade iddiaları boş kümede geçerdi', async () => {
    expect(await sayim('SELECT count(*)::text AS n FROM clients WHERE org_id = $1', [SILINECEK])).toBe(1);
    expect(await sayim('SELECT count(*)::text AS n FROM ad_accounts WHERE org_id = $1', [SILINECEK])).toBe(1);
    expect(await sayim('SELECT count(*)::text AS n FROM insights_daily')).toBe(1);
  });
});

describe('KRİTİK: cascade nereye kadar gidiyor', () => {
  it('workspace, hesap ve bağlantı cascade ile gidiyor', async () => {
    await h.q('DELETE FROM organizations WHERE id = $1', [SILINECEK]);
    expect(await sayim('SELECT count(*)::text AS n FROM clients WHERE org_id = $1', [SILINECEK])).toBe(0);
    expect(await sayim('SELECT count(*)::text AS n FROM ad_accounts WHERE org_id = $1', [SILINECEK])).toBe(0);
    expect(
      await sayim('SELECT count(*)::text AS n FROM platform_connections WHERE org_id = $1', [SILINECEK]),
    ).toBe(0);
  });

  it('KRİTİK: `insights_daily` CASCADE ETMİYOR — yetim kalıyor', async () => {
    /*
     * ═══ BU BİR BULGU, VARSAYIM DEĞİL ═══
     *
     * Testi "metrikler de gider" diye yazmıştım ve DÜŞTÜ: satır duruyordu.
     * Sebep şemada: `insights_daily` partition'lı ve Prisma partition'lı bir
     * tabloya yabancı anahtar kuramıyor — `client_id` düz bir uuid kolonu.
     * `org_id` de taşımıyor, yani organizasyondan da cascade almıyor.
     *
     * Yetim satırlar hiçbir ekranda GÖRÜNMÜYOR (RLS artık var olmayan bir
     * `client_id`yi kimseye açmıyor) ama tabloda KALIYORLAR — ve o tablo bu
     * depoda ölçülerek düzeltilen yavaşlığın tam merkezinde.
     *
     * Bu test bulguyu kilitliyor: bir gün gerçek bir FK eklenirse test
     * düşer ve servisteki elle silmenin gereksizleştiğini söyler.
     */
    await h.q('DELETE FROM organizations WHERE id = $1', [SILINECEK]);
    expect(await sayim('SELECT count(*)::text AS n FROM insights_daily')).toBe(1);
  });

  it('KRİTİK: servisin ELLE SİLMESİ yetimleri temizliyor', async () => {
    // Servisin koştuğu SQL'in ta kendisi. Sonuç kümesi ölçülüyor, iddia
    // koda değil DAVRANIŞA çapalı.
    await h.q('DELETE FROM insights_daily WHERE client_id = ANY($1::uuid[])', [[CLIENT]]);
    await h.q('DELETE FROM api_usage_log WHERE client_id = ANY($1::uuid[])', [[CLIENT]]);
    await h.q('DELETE FROM organizations WHERE id = $1', [SILINECEK]);
    expect(await sayim('SELECT count(*)::text AS n FROM insights_daily')).toBe(0);
  });

  it('KRİTİK: BAŞKA şirketin verisine dokunmuyor', async () => {
    // Cascade'in kapsamı `org_id`; bir gün bir ilişki yanlış tanımlanırsa
    // silme komşu şirketi de götürürdü ve belirtisi yalnızca eksik veri
    // olurdu.
    await h.q('DELETE FROM organizations WHERE id = $1', [SILINECEK]);
    expect(await sayim('SELECT count(*)::text AS n FROM users WHERE org_id = $1', [ORG])).toBe(1);
    expect(await sayim('SELECT count(*)::text AS n FROM organizations WHERE id = $1', [ORG])).toBe(1);
  });

  it('KRİTİK: ÜST HESAP silinmiyor — şirket ondan KOPUYOR', async () => {
    /*
     * `manager_account_id` `SetNull` DEĞİL `Cascade` olsaydı, bir şirketi
     * silmek bütün ajansı silerdi. Yön önemli: şirket üst hesaba bakıyor,
     * tersi değil.
     */
    await h.q('DELETE FROM organizations WHERE id = $1', [SILINECEK]);
    expect(await sayim('SELECT count(*)::text AS n FROM manager_accounts WHERE id = $1', [MGR])).toBe(1);
  });
});

describe('KRİTİK: silme kapıları KODDA', () => {
  const KAYNAK = readFileSync(resolve(__dirname, 'manager-account.service.ts'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

  /*
   * İDDİALAR `sil()` GÖVDESİNE ÇAPALI. Dosya genelinde aramak, `create` ve
   * `createOrganization` içindeki BAŞKA `$transaction` çağrılarına
   * eşleşiyordu ve sıra iddiaları anlamsız çıkıyordu — "yakınında geçiyor"
   * bir iddia değil (CLAUDE.md).
   */
  const SIL = (() => {
    const bas = KAYNAK.indexOf('async sil(');
    if (bas < 0) throw new Error('`sil()` gövdesi bulunamadı — tarama boşa düştü');
    return KAYNAK.slice(bas, KAYNAK.indexOf('\n  /** Silinecek şirketi', bas));
  })();

  it('BOŞA DÜŞME BEKÇİSİ: gövde okundu', () => {
    expect(KAYNAK).toContain('async silmeOzeti(');
    expect(SIL.length, '`sil()` gövdesi boş — tarama boşa düştü').toBeGreaterThan(500);
  });

  it('KRİTİK: EV şirketi silinemiyor', () => {
    /*
     * Ev şirketini silmek giriş hesabını da siler (cascade) ve kullanıcıyı
     * kendi hesabından KİLİTLER — geri dönüşü yok. `users.org_id`ye
     * bakılıyor, `ctx.orgId`ye DEĞİL: ikincisi ŞU AN bakılan şirket ve üst
     * hesap altında ikisi farklı oluyor.
     */
    const bas = KAYNAK.indexOf('private async silmeEngeli(');
    expect(bas, 'gövde bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const dilim = KAYNAK.slice(bas, KAYNAK.indexOf('\n  }', bas));
    expect(dilim).toContain('kullanici?.orgId === organizationId');
  });

  it('KRİTİK: AKTİF şirket kapısı YOK — özellik kullanılamaz oluyordu', () => {
    /*
     * ═══ BU BİR GERİ ALMA VE SEBEBİ KULLANICIDAN GELDİ ═══
     *
     * Kapı önce vardı: aktif şirketin silinmesini reddediyordu. Gerekçesi
     * gerçekti (silinen şirkette kalmak, var olmayan bir kapsama bakmak
     * demek) ama ÖZELLİĞİ KULLANILAMAZ YAPIYORDU: şirketi düzenlemek için
     * önce ona geçmek gerekiyor (`/organization` RLS ile aktif şirkete
     * çivili), geçince de silme reddediliyordu. Kullanıcının gördüğü hâl
     * birebir buydu: *"düzenlemek istediğim şirkete geçtiğimde de bu
     * şirkettesin şirketi silemezsin hatası veriyor."*
     *
     * Çözüm reddetmek değil, SİLDİKTEN SONRA KAPSAMI TAŞIMAK — aşağıdaki
     * test onu kilitliyor. Bu iddia kapının geri gelmesini engelliyor.
     */
    const bas = KAYNAK.indexOf('private async silmeEngeli(');
    const dilim = KAYNAK.slice(bas, KAYNAK.indexOf('\n  }', bas));
    expect(dilim).not.toContain('organizationId === ctx.orgId');
  });

  it('KRİTİK: YALNIZCA kendi üst hesabının şirketi', () => {
    /*
     * `PrismaAdminService` RLS'i atlıyor, yani kapsam kontrolü BURADA
     * yapılmak zorunda. Olmasaydı uca elle istek atarak başka bir ajansın
     * şirketi silinebilirdi.
     */
    const bas = KAYNAK.indexOf('private async silinecekSirket(');
    const dilim = KAYNAK.slice(bas, KAYNAK.indexOf('\n  }', bas));
    expect(dilim.length).toBeGreaterThan(200);
    expect(dilim).toContain('managerAccountId: uyelik.managerAccountId');
  });

  it('KRİTİK: veri varsa AD ONAYI isteniyor — sunucuda', () => {
    // Paneldeki kontrol bir kolaylık, kapı değil: uca elle istek atmak
    // kolaylığı atlamak olurdu.
    expect(KAYNAK).toContain("(input.onayAdi ?? '').trim() !== ozet.name");
    expect(KAYNAK).toContain('if (ozet.engel !== null) throw new BadRequestException(ozet.engel);');
  });

  it('KRİTİK: denetim kaydı SİLMEDEN ÖNCE yazılıyor', () => {
    /*
     * Sonra yazmak imkânsız: `audit_logs.org_id` silinen şirkete bakıyor ve
     * o satır cascade ile birlikte giderdi.
     */
    const kayit = SIL.indexOf("action: 'manager_account.organization_delete'");
    const silme = SIL.indexOf('tx.organization.delete(');
    expect(kayit, 'denetim kaydı bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    expect(silme, 'silme bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    expect(kayit).toBeLessThan(silme);
  });

  it('KRİTİK: FK’siz tablolar ELLE ve AYNI transaction’da siliniyor', () => {
    /*
     * `reset-clients` bir kez metrikleri silip müşterileri silemeden düştü:
     * pahalı yarısı yapıldı, işe yarayan yarısı yapılmadı. Burada ikisi
     * aynı transaction'da — org silme bir `Restrict` engeline takılırsa
     * metrikler de geri geliyor.
     */
    const bas = SIL.indexOf('const clientIdler = (');
    expect(bas, 'elle silme bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const dilim = SIL.slice(bas, SIL.indexOf('this.logger.warn(', bas));
    expect(dilim).toContain('this.admin.$transaction(');
    expect(dilim).toContain('DELETE FROM insights_daily WHERE client_id = ANY(');
    expect(dilim).toContain('DELETE FROM api_usage_log WHERE client_id = ANY(');
    expect(dilim).toContain('tx.organization.delete(');
  });

  it('KRİTİK: kimlikler SİLMEDEN ÖNCE toplanıyor', () => {
    // Org silindikten sonra `clients` de gitmiş oluyor ve o satırları
    // bulmanın yolu kalmıyor.
    const topla = SIL.indexOf('const clientIdler = (');
    const transaction = SIL.indexOf('this.admin.$transaction(');
    expect(topla, 'toplama bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    expect(transaction).toBeGreaterThan(-1);
    expect(topla).toBeLessThan(transaction);
  });

  it('KRİTİK: aktif şirket silinince KAPSAM TAŞINIYOR', () => {
    /*
     * Çerez AÇIKÇA yazılıyor. Yazılmasaydı silinmiş kimliği taşıyan çerez
     * kalırdı; `TenantContextService` onu izin listesinde bulamayıp
     * SESSİZCE eve düşerdi — doğru sonuç ama sessiz, ve sessiz düşüş bu
     * depoda bir hata türü: kullanıcı hangi şirkette olduğunu ekrandan
     * okuyamaz.
     *
     * WORKSPACE SEÇİMİ DE SIFIRLANIYOR: silinen şirketin workspace'i yeni
     * kapsamda geçersiz ve bırakılsaydı `resolve` onu sessizce düşürürdü.
     */
    const CONTROLLER = readFileSync(
      resolve(__dirname, 'manager-account.controller.ts'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');
    const bas = CONTROLLER.indexOf('async silOrganization(');
    expect(bas, 'uç bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const dilim = CONTROLLER.slice(bas, CONTROLLER.indexOf('\n  }', bas));
    expect(dilim).toContain('if (id === ctx.orgId) {');
    expect(dilim).toContain('setActiveOrgCookie(res, this.config, ev)');
    expect(dilim).toContain('setActiveClientCookie(res, this.config, null)');
    // SİLME BAŞARILI OLMADAN çerez yazılmıyor: sıra önemli.
    expect(dilim.indexOf('await this.service.sil(')).toBeLessThan(
      dilim.indexOf('setActiveOrgCookie('),
    );
  });

  it('özet HİÇBİR ŞEY SİLMİYOR', () => {
    const bas = KAYNAK.indexOf('async silmeOzeti(');
    const dilim = KAYNAK.slice(bas, KAYNAK.indexOf('async sil(', bas));
    expect(dilim.length, 'özet gövdesi bulunamadı — tarama boşa düştü').toBeGreaterThan(500);
    expect(dilim).not.toContain('.delete(');
    expect(dilim).not.toContain('DELETE FROM');
  });
});
