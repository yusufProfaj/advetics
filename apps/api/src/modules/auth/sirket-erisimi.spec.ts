import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ ŞİRKET SEVİYESİ YETKİ GERÇEKTEN ERİŞİM AÇIYOR MU ═══
 *
 * Danışmana "şu şirketin tamamına yetki" verildiğinde üyelik satırı O
 * ŞİRKETTE açılıyor (`baskaSirketeYetki`). Ama danışmanın üst hesap
 * üyeliği YOK ve `users.org_id` hâlâ ajans. `izinliOrgIdler` yalnızca ev
 * şirketi + üst hesabın kardeşlerinden kuruluyorsa:
 *
 *   · `activeOrgId` eve düşüyor,
 *   · üyelikler aktif şirkete süzülüyor,
 *   · yeni verilen satır ELENİYOR,
 *   · danışman ya hiçbir şey görüyor ya da 401 alıyor.
 *
 * Yetki veriliyor, hiçbir işe yaramıyor — ve hiçbir ekranda sebebi
 * yazmıyor. Kullanıcının bildirdiği hâl birebir buydu.
 *
 * Bağlam çözümü gerçek bir veritabanı ve oturum zinciri istiyor; karar
 * kaynak taramasıyla kilitleniyor ve iddialar TEK TEK satırlara çapalı.
 */
const KAYNAK = readFileSync(resolve(__dirname, 'tenant-context.service.ts'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

describe('tarama boşa düşmüyor', () => {
  it('kaynak okundu ve beklenen gövdeyi taşıyor', () => {
    expect(KAYNAK).toContain('const izinliOrgIdler');
    expect(KAYNAK.length).toBeGreaterThan(2000);
  });
});

describe('KRİTİK: üyeliğin olduğu şirket erişilebilir', () => {
  it('izin listesi ÜYELİK org’larını da içeriyor', () => {
    /*
     * İddia dilime çapalı: `izinliOrgIdler` tanımının kendisi. Dosyanın
     * başka bir yerinde geçen `memberships` referansına takılan bir iddia
     * bu kural silindiğinde de geçerdi.
     */
    const bas = KAYNAK.indexOf('const izinliOrgIdler');
    expect(bas).toBeGreaterThan(-1);
    const dilim = KAYNAK.slice(bas, KAYNAK.indexOf(';', bas));
    expect(dilim).toContain('uyelikOrgIdleri');
    expect(dilim).toContain('user.orgId');
    expect(dilim).toContain('kardesSirketler');
  });

  it('üyelik org listesi kullanıcının KENDİ satırlarından türüyor', () => {
    expect(KAYNAK).toContain('const uyelikOrgIdleri = user.memberships.map((m) => m.orgId)');
  });

  it('KRİTİK: liste VERİTABANINDAN, istekten DEĞİL', () => {
    /*
     * `activeOrgId` bütün RLS politikalarının okuduğu `app.current_org_id()`
     * değerini sürüyor; doğrulanmamış bir değer, cookie düzenleyerek başka
     * bir şirketin verisini okumak demekti.
     */
    expect(KAYNAK).toContain(
      'requestedOrgId && izinliOrgIdler.has(requestedOrgId) ? requestedOrgId : user.orgId',
    );
  });
});

describe('KRİTİK: seçici erişilebilir şirketleri görüyor', () => {
  it('oturum `erisilebilirSirketler` döndürüyor', () => {
    /*
     * `managerAccount` tek başına yetmiyor: danışmanda `null` ve o zaman
     * seçici yalnızca bulunduğu şirketi listeliyordu — yetkisi olan yere
     * GEÇEMİYORDU.
     */
    expect(KAYNAK).toContain('const erisilebilirSirketler = await this.db.organization.findMany');
    expect(KAYNAK).toContain('erisilebilirSirketler,');
  });

  it('liste izin listesinden süzülüyor — daha genişinden değil', () => {
    const bas = KAYNAK.indexOf('const erisilebilirSirketler');
    const dilim = KAYNAK.slice(bas, KAYNAK.indexOf('});', bas));
    expect(dilim).toContain('id: { in: [...izinliOrgIdler] }');
    expect(dilim).toContain("status: 'active'");
  });

  it('oturum yanıtı alanı TAŞIYOR', () => {
    const auth = readFileSync(resolve(__dirname, 'auth.service.ts'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    expect(auth).toContain('erisilebilirSirketler: identity.erisilebilirSirketler');
  });
});
