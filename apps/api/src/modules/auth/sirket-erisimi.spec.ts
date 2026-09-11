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
    /*
     * VARSAYILAN DEĞİŞTİ (`user.orgId` → `varsayilanOrg`) ama DOĞRULAMA
     * AYNI: istekten gelen şirket hâlâ izin listesine karşı sınanıyor.
     * Değişen şey yalnızca listede bulunmadığında nereye düşüleceği.
     */
    expect(KAYNAK).toContain(
      'requestedOrgId && izinliOrgIdler.has(requestedOrgId) ? requestedOrgId : varsayilanOrg',
    );
  });
});

describe('KRİTİK: giriş ÜYELİĞİN OLDUĞU şirkete düşüyor', () => {
  it('ev şirketinde üyelik yoksa üyeliğin olduğu şirkete düşülüyor', () => {
    /*
     * `user.orgId` kullanıcının AÇILDIĞI şirket; orada bir üyeliği olduğu
     * GARANTİ DEĞİL. Danışmana yalnızca bir MÜŞTERİ ŞİRKETİNDE yetki
     * verildiğinde ev şirketinde hiç satırı kalmıyor ve giriş şu hatayla
     * düşüyordu: "Bu şirkete erişim yetkiniz tanımlı değil". Kullanıcı
     * yetkilendirilmiş ama İÇERİ GİREMİYOR.
     */
    expect(KAYNAK).toContain(
      'const evdeUyelikVar = user.memberships.some((m) => m.orgId === user.orgId)',
    );
    expect(KAYNAK).toContain('izinliOrgIdler.has(m.orgId)');
    expect(KAYNAK).toContain(
      "evdeUyelikVar || ustHesap !== null ? user.orgId : (uyelikliOrg ?? user.orgId)",
    );
  });

  it('KRİTİK: ÜST HESABI OLAN için ev şirketi öncelikli kalıyor', () => {
    /*
     * Ajans yöneticisi kendi şirketinde üyelik satırı taşımayabiliyor
     * (sentetik üyelik üst hesap rolünden türüyor). Onu kardeş bir şirkete
     * atmak, her girişte başka bir yerde uyanması demekti.
     */
    const bas = KAYNAK.indexOf('const varsayilanOrg');
    expect(bas).toBeGreaterThan(-1);
    const dilim = KAYNAK.slice(bas, KAYNAK.indexOf(';', bas));
    expect(dilim).toContain('ustHesap !== null');
  });

  it('KRİTİK: istekten gelen şirket YİNE doğrulanıyor', () => {
    // Varsayılanı değiştirmek, doğrulamayı gevşetmek DEĞİL: cookie'yi elle
    // düzenleyerek başka bir şirkete geçmek hâlâ imkânsız.
    expect(KAYNAK).toContain(
      'requestedOrgId && izinliOrgIdler.has(requestedOrgId) ? requestedOrgId : varsayilanOrg',
    );
  });

  it('erişim hatası ŞİRKETİN ADINI söylüyor', () => {
    /*
     * "Bu şirkete erişim yetkiniz tanımlı değil" hangi şirketten
     * bahsettiğini söylemiyordu ve kullanıcı giriş ekranında kaldı:
     * yetkisi vardı, başka bir şirketteydi.
     */
    expect(KAYNAK).toContain('şirketine erişim yetkiniz tanımlı değil');
    expect(KAYNAK).toContain('const aktifSirketAdi =');
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
