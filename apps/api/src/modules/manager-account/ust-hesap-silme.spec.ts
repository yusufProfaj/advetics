import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../../test/pglite-harness';

/**
 * ═══ ÜST HESAP SİLMEK — ŞİRKETLERİ YETİM BIRAKMANIN EN KOLAY YOLU ═══
 *
 * Kullanıcının isteği: *"üst hesapları da silebilir halde olmam lazım."*
 *
 * Ama `manager_accounts` satırını silmek altındaki şirketleri SİLMİYOR:
 * `organizations.manager_account_id` `ON DELETE SET NULL` taşıyor. Yani
 * naif bir "hesabı sil" şirketleri hiçbir üst hesabın altında OLMAYAN —
 * seçicide görünmeyen, kimsenin geçemediği — kayıtlara çeviriyor. Veri
 * duruyor, kimse göremiyor: bu depodaki sessiz hatanın tarifi.
 *
 * Bu paket o davranışı ÖLÇÜYOR (şema yorumuna güvenmiyor: `onDelete` bir
 * satır değişikliğiyle sessizce değişebilir) ve servisin doğru sırayı
 * uyguladığını kaynaktan doğruluyor.
 */
let h: Harness;

const MGR = 'aaaaaaaa-0000-0000-0000-00000000000f';
const MGR_B = 'bbbbbbbb-0000-0000-0000-00000000000f';
const ORG = '11111111-1111-1111-1111-111111111111';
const ORG2 = '11111111-1111-1111-1111-111111111112';
const ORG_B = '11111111-1111-1111-1111-11111111111b';
const CLIENT = '22222222-2222-2222-2222-222222222222';
const USER = '55555555-5555-5555-5555-555555555555';

beforeAll(async () => {
  h = await createHarness();
}, 180_000);
afterAll(() => h.close());

beforeEach(async () => {
  await h.reset();
  for (const [id, ad, slug] of [
    [MGR, 'Yılmaz Mobilya', 'yilmaz'],
    [MGR_B, 'Profaj', 'profaj'],
  ] as const) {
    await h.q(
      `INSERT INTO manager_accounts (id, name, slug, updated_at) VALUES ($1,$2,$3,now())`,
      [id, ad, slug],
    );
  }
  for (const [id, ad, slug, mgr] of [
    [ORG, 'Yılmaz', 'yilmaz-sirket', MGR],
    [ORG2, 'Yılmaz İkinci', 'yilmaz-ikinci', MGR],
    [ORG_B, 'Advetics', 'advetics', MGR_B],
  ] as const) {
    await h.q(
      `INSERT INTO organizations (id, name, slug, manager_account_id, updated_at)
       VALUES ($1,$2,$3,$4,now())`,
      [id, ad, slug, mgr],
    );
  }
  await h.q(
    `INSERT INTO users (id, org_id, email, password_hash, full_name, updated_at)
     VALUES ($1,$2,'a@b.c','x','A',now())`,
    [USER, ORG],
  );
  await h.q(
    `INSERT INTO manager_memberships (id, manager_account_id, user_id, role, updated_at)
     VALUES (gen_random_uuid(),$1,$2,'admin',now())`,
    [MGR, USER],
  );
  await h.q(
    `INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1,$2,'Workspace','ws',now())`,
    [CLIENT, ORG],
  );
  /*
   * REKLAM HESABI SATIRI YOK, YALNIZCA METRİK. `insights_daily` HİÇBİR
   * yabancı anahtar taşımıyor (partition'lı tabloya Prisma FK kuramıyor) —
   * test etmek istediğimiz şey de tam olarak bu: cascade'in ona
   * ULAŞAMAMASI. `ad_accounts` eklemek bir bağlantı satırı da ister
   * (`connection_id` NOT NULL) ve fixture'ı sınananın dışına genişletirdi.
   */
  await h.q(
    `INSERT INTO insights_daily
       (date, entity_level, entity_id, breakdown_key, client_id, ad_account_id, platform,
        entity_external_id, impressions, clicks, spend_micros, conversions,
        conversion_value_micros, currency)
     VALUES ('2026-08-02','campaign',gen_random_uuid(),'',$1,gen_random_uuid(),'meta','x',1,1,1,0,0,'TRY')`,
    [CLIENT],
  );
});

async function say(sql: string, params: unknown[] = []): Promise<number> {
  const [r] = await h.q<{ n: string }>(sql, params);
  return Number(r?.n ?? 0);
}

describe('veritabanı GERÇEĞİ', () => {
  it('fixture dolu — yoksa aşağıdaki iddialar boş kümede geçerdi', async () => {
    expect(await say(`SELECT count(*)::text AS n FROM organizations WHERE manager_account_id = $1`, [MGR])).toBe(2);
    expect(await say(`SELECT count(*)::text AS n FROM insights_daily WHERE client_id = $1`, [CLIENT])).toBe(1);
    expect(await say(`SELECT count(*)::text AS n FROM manager_memberships WHERE manager_account_id = $1`, [MGR])).toBe(1);
  });

  it('KRİTİK: hesabı TEK BAŞINA silmek şirketleri YETİM bırakıyor — silmiyor', async () => {
    /*
     * Bu testin tamamı servisin neden iki adımlı olduğunu anlatıyor. Naif
     * `DELETE FROM manager_accounts` sonrası şirketler duruyor ve
     * `manager_account_id` NULL: hiçbir seçicide görünmüyorlar, kimse
     * geçemiyor, ama bütün verileriyle tabloda duruyorlar.
     */
    await h.q(`DELETE FROM manager_accounts WHERE id = $1`, [MGR]);

    expect(await say(`SELECT count(*)::text AS n FROM organizations WHERE id IN ($1,$2)`, [ORG, ORG2])).toBe(2);
    expect(
      await say(`SELECT count(*)::text AS n FROM organizations WHERE id IN ($1,$2) AND manager_account_id IS NULL`, [ORG, ORG2]),
    ).toBe(2);
  });

  it('üyelikler CASCADE ile gidiyor — onlar hesaba bağlı', async () => {
    await h.q(`DELETE FROM manager_accounts WHERE id = $1`, [MGR]);
    expect(await say(`SELECT count(*)::text AS n FROM manager_memberships WHERE manager_account_id = $1`, [MGR])).toBe(0);
  });

  it('KRİTİK: DOĞRU SIRA — önce şirketler, sonra hesap: yetim kalmıyor', async () => {
    // Servisin yaptığının aynısı. `insights_daily` FK taşımadığı için
    // (partition'lı tabloya Prisma FK kuramıyor) elle siliniyor.
    await h.q(`DELETE FROM insights_daily WHERE client_id = ANY($1::uuid[])`, [[CLIENT]]);
    await h.q(`DELETE FROM organizations WHERE manager_account_id = $1`, [MGR]);
    await h.q(`DELETE FROM manager_accounts WHERE id = $1`, [MGR]);

    expect(await say(`SELECT count(*)::text AS n FROM organizations WHERE id IN ($1,$2)`, [ORG, ORG2])).toBe(0);
    expect(await say(`SELECT count(*)::text AS n FROM clients WHERE id = $1`, [CLIENT])).toBe(0);
    expect(await say(`SELECT count(*)::text AS n FROM users WHERE id = $1`, [USER])).toBe(0);
    expect(await say(`SELECT count(*)::text AS n FROM insights_daily WHERE client_id = $1`, [CLIENT])).toBe(0);
  });

  it('KRİTİK: BAŞKA üst hesabın şirketine dokunulmuyor', async () => {
    await h.q(`DELETE FROM organizations WHERE manager_account_id = $1`, [MGR]);
    await h.q(`DELETE FROM manager_accounts WHERE id = $1`, [MGR]);
    expect(await say(`SELECT count(*)::text AS n FROM organizations WHERE id = $1`, [ORG_B])).toBe(1);
    expect(await say(`SELECT count(*)::text AS n FROM manager_accounts WHERE id = $1`, [MGR_B])).toBe(1);
  });
});

describe('servis kaynağı — kapılar ve sıra', () => {
  const KAYNAK = readFileSync(resolve(__dirname, 'manager-account.service.ts'), 'utf8');
  const govde = (ad: string): string => {
    const bas = KAYNAK.indexOf(`async ${ad}(`);
    if (bas === -1) throw new Error(`${ad} bulunamadı — tarama boşa düştü`);
    // Bir sonraki metot tanımına kadar; sabit uzunluklu dilim komşuyu yakalar.
    const sonraki = KAYNAK.indexOf('\n  async ', bas + 1);
    return KAYNAK.slice(bas, sonraki === -1 ? undefined : sonraki);
  };

  it('BOŞA DÜŞME BEKÇİSİ: gövdeler okundu', () => {
    expect(govde('ustHesapSil').length).toBeGreaterThan(800);
    expect(govde('ustHesapSilmeOzeti').length).toBeGreaterThan(800);
  });

  it('KRİTİK: silme YALNIZCA platform sahibinde', () => {
    /*
     * Müşterinin kendi Yöneticisine bu düğmeyi vermek, satın aldığı her
     * şeyi tek tıkla yok edebilmesi demekti — altındaki şirketlerin
     * kullanıcıları dâhil.
     */
    const g = govde('ustHesapSilmeOzeti');
    expect(g).toContain('if (!ctx.platformAdmin) {');
    expect(g).toContain('ForbiddenException');
  });

  it('KRİTİK: KENDİ hesabın silinemiyor — giriş hesabı oraya bağlı', () => {
    /*
     * `organizations` silinince `users` cascade ile gidiyor. Kendi hesabını
     * silmek, kendi giriş hesabını da götürür: panelden geri dönüşü olmayan
     * tek hata bu olurdu.
     */
    const g = govde('ustHesapSilmeOzeti');
    expect(g).toContain('orgIdler.includes(evKullanici?.orgId');
    expect(g).toContain('Kendi üst hesabın silinemez');
  });

  it('KRİTİK: veri varsa AD ONAYI isteniyor — SUNUCUDA', () => {
    // Paneldeki kontrol bir kolaylık, kapı değil: uca elle istek atan biri
    // onu atlar.
    const g = govde('ustHesapSil');
    expect(g).toContain('ozet.adOnayiGerekli && (input.onayAdi ?? \'\').trim() !== ozet.name');
  });

  it('KRİTİK: engel varsa silme REDDEDİLİYOR — özet yalnızca ekran için değil', () => {
    expect(govde('ustHesapSil')).toContain('if (ozet.engel !== null) throw new BadRequestException(ozet.engel);');
  });

  it('KRİTİK: denetim kaydı SİLMEDEN ÖNCE ve ÇAĞIRANIN şirketine', () => {
    /*
     * `audit_logs.org_id` silinen şirketlerden birine bakarsa o satır da
     * cascade ile giderdi — kimin sildiği kayıtla birlikte yok olurdu.
     */
    const g = govde('ustHesapSil');
    const audit = g.indexOf('recordUnauthenticated(ctx.orgId');
    const silme = g.indexOf('$transaction');
    expect(audit).toBeGreaterThan(-1);
    expect(silme).toBeGreaterThan(audit);
  });

  it('KRİTİK: ŞİRKETLER ÖNCE, HESAP SONRA — ters sıra yetim bırakıyor', () => {
    /*
     * Yukarıdaki veritabanı testi bunun NEDEN önemli olduğunu ölçüyor:
     * hesap önce silinirse `SET NULL` işliyor ve ikinci adım şirketleri
     * `managerAccountId` ile ARTIK BULAMIYOR.
     */
    const g = govde('ustHesapSil');
    const orglar = g.indexOf('tx.organization.deleteMany');
    const hesap = g.indexOf('tx.managerAccount.delete');
    expect(orglar).toBeGreaterThan(-1);
    expect(hesap).toBeGreaterThan(orglar);
  });

  it('KRİTİK: FK’siz tablolar ELLE ve AYNI transaction’da siliniyor', () => {
    /*
     * `insights_daily` ve `api_usage_log` cascade'den SAĞ ÇIKIYOR (yukarıda
     * ölçülü). Ayrı transaction'da silmek, `reset-clients`in yarım kalıp
     * metrik verisini götürmesiyle aynı sınıf hata olurdu.
     */
    const g = govde('ustHesapSil');
    const tx = g.indexOf('$transaction');
    const dilim = g.slice(tx);
    expect(dilim).toContain('DELETE FROM insights_daily');
    expect(dilim).toContain('DELETE FROM api_usage_log');
    expect(g).toContain('timeout: 120_000');
  });

  it('KRİTİK: kimlikler SİLMEDEN ÖNCE toplanıyor', () => {
    // Şirketler silindikten sonra `clients` de gitmiş oluyor ve o satırları
    // bulmanın yolu kalmıyor.
    const g = govde('ustHesapSil');
    const topla = g.indexOf('const clientIdler');
    const tx = g.indexOf('$transaction');
    expect(topla).toBeGreaterThan(-1);
    expect(tx).toBeGreaterThan(topla);
  });

  it('özet HİÇBİR ŞEY SİLMİYOR', () => {
    // Ekran özeti silmeden ÖNCE gösteriyor; bu uç bir yazma yolu değil.
    const g = govde('ustHesapSilmeOzeti');
    expect(g).not.toContain('delete');
    expect(g).not.toContain('$transaction');
  });

  it('KRİTİK: düzenleme kapısı `isOrgAdmin` DEĞİL, üst hesap üyeliğinin rolü', () => {
    /*
     * `isOrgAdmin` TEK BİR ŞİRKETİN yöneticisinde de açık. Kapıyı ona
     * bağlamak, bir şirket yöneticisinin BAŞKA bir üst hesabın adını ve
     * paketini değiştirebilmesi demekti — kimliği istekte kendisi yazarak.
     */
    const g = KAYNAK.slice(KAYNAK.indexOf('private async yonetilebilirHesap('));
    expect(g).toContain('if (ctx.platformAdmin) return hesap;');
    expect(g).toContain('isOrgAdminRole(uyelik.role)');
    // Üye olmayana "bulunamadı" — 403 o kimlikte bir hesabın VAR olduğunu
    // sızdırırdı.
    expect(g).toContain("if (!uyelik) throw new NotFoundException('Üst hesap bulunamadı');");
  });
});

describe('controller — aktif hesap silinince çerezler', () => {
  const KAYNAK = readFileSync(resolve(__dirname, 'manager-account.controller.ts'), 'utf8');

  it('KRİTİK: çerez EV hesabına taşınıyor, şirket ve workspace sıfırlanıyor', () => {
    /*
     * `adv_mgr` silinmiş bir kimliği gösterirse `TenantContextService` onu
     * doğrulayamayıp SESSİZCE varsayılana düşer — doğru sonuç ama sessiz,
     * ve bu depoda sessiz düşüş bir hata türü.
     */
    const bas = KAYNAK.indexOf('async ustHesapSil(');
    expect(bas, 'uç bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const g = KAYNAK.slice(bas, bas + 700);
    expect(g).toContain('if (sonuc.aktifti) {');
    expect(g).toContain('setActiveManagerCookie(res, this.config, await this.service.evUstHesabi(ctx))');
    expect(g).toContain('setActiveOrgCookie(res, this.config, null)');
    expect(g).toContain('setActiveClientCookie(res, this.config, null)');
  });
});
