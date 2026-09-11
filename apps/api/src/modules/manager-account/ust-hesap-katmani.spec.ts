import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MANAGER_PAKETLERI, PAKET_SINIRLARI, paketAsildiMi } from '@advetics/shared';

/**
 * ═══ ÜST HESAP KATMANI — ÇOKLU ÜYELİK, PLATFORM SAHİBİ, PAKET ═══
 *
 * Advetics'i işleten taraf (Profaj) üst hesabı bir ÜRÜN olarak satıyor:
 * kendi reklam hesabını kendi bağlantısıyla bağlamak isteyen kişiye. Bu üç
 * şeyi birden getirdi ve ÜÇÜ DE SESSİZCE AÇILABİLİR:
 *
 *   · PAKET KISITI — kontrol düşerse hiçbir şey patlamıyor, müşteri
 *     ödemediği kadar şirket açıyor ve fark faturada görünüyor.
 *   · PLATFORM SAHİPLİĞİ — panelde bir düğmeye bağlansaydı, o düğmeyi
 *     görebilen herkes kendini yükseltirdi.
 *   · PAKET SEÇİMİ — satın alanın elinde olsaydı uca elle istek atan
 *     herkes kendini sınırsıza çıkarırdı.
 */
const KAYNAK = readFileSync(resolve(__dirname, 'manager-account.service.ts'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);
const BAGLAM = readFileSync(
  resolve(__dirname, '..', 'auth', 'tenant-context.service.ts'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');
const AUTH = readFileSync(resolve(__dirname, '..', 'auth', 'auth.service.ts'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);
const CONTROLLER_AUTH = readFileSync(
  resolve(__dirname, '..', 'auth', 'auth.controller.ts'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

describe('tarama boşa düşmüyor', () => {
  it('kaynaklar okundu', () => {
    expect(KAYNAK).toContain('async create(');
    expect(BAGLAM).toContain('async resolve(');
    expect(AUTH).toContain('assertManagerAccountAccess');
  });
});

describe('paket sınırları', () => {
  it('her paketin sınırı TANIMLI — elle yazılmış liste yok', () => {
    for (const p of MANAGER_PAKETLERI) {
      expect(PAKET_SINIRLARI[p], `${p} için sınır yok`).toBeDefined();
      expect(PAKET_SINIRLARI[p].etiket.length).toBeGreaterThan(0);
    }
  });

  it('KRİTİK: `null` sınır SINIRSIZ demek — sıfır DEĞİL', () => {
    /*
     * Sınırsızı `0` ya da `-1` ile ifade etmek, karşılaştırmayı okuyan
     * herkesin o sözleşmeyi hatırlamasını gerektirirdi; bir yerde unutulsa
     * sınırsız paket TAMAMEN KAPANIRDI.
     */
    expect(paketAsildiMi(null, 0)).toBe(false);
    expect(paketAsildiMi(null, 10_000)).toBe(false);
    expect(PAKET_SINIRLARI.ajans.maxSirket).toBeNull();
  });

  it('KRİTİK: sınıra EŞİTKEN de aşılmış sayılıyor', () => {
    /*
     * "En fazla 1 şirket" bir şirketi olan hesabın İKİNCİYİ açamaması
     * demek. `>` yazmak, her pakete bir fazla verirdi ve fark yalnızca
     * faturada görünürdü.
     */
    expect(paketAsildiMi(1, 0)).toBe(false);
    expect(paketAsildiMi(1, 1)).toBe(true);
    expect(paketAsildiMi(1, 2)).toBe(true);
  });

  it('başlangıç paketi kullanıcının verdiği örnekle uyuyor', () => {
    // Kullanıcının tarifi: *"2 reklam hesabı eklenebilir gibi kısıtlamalar."*
    expect(PAKET_SINIRLARI.baslangic.maxReklamHesabi).toBe(2);
    expect(PAKET_SINIRLARI.baslangic.maxSirket).toBe(1);
  });
});

describe('KRİTİK: şirket açarken paket sınanıyor', () => {
  it('sayım AKTİF şirketleri kapsıyor, arşivlileri değil', () => {
    /*
     * Arşivlenmiş bir şirket ekranda görünmüyor; kotayı yemesi kullanıcının
     * "sildim ama hâlâ dolu" demesi demekti.
     */
    const bas = KAYNAK.indexOf('async createOrganization(');
    expect(bas, 'gövde bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const dilim = KAYNAK.slice(bas, KAYNAK.indexOf('\n  }', bas));
    expect(dilim).toContain('paketAsildiMi(sinir, mevcutSirket)');
    expect(dilim).toContain("status: 'active'");
  });

  it('KRİTİK: sınır AŞILDIĞINDA neyin gerektiği yazılıyor', () => {
    // Kapalı bir düğme ya da çıplak bir 400, "neden" sorusunu ekranda
    // bırakır ve kullanıcı onu aramaya gider.
    expect(KAYNAK).toContain('Paketi yükseltmek gerekiyor');
  });
});

describe('KRİTİK: paketi SATIN ALAN seçemiyor', () => {
  it('yalnızca platform sahibi geçiriyor, diğerleri `baslangic`', () => {
    /*
     * Gönderilen paketi kabul etmek, satılan bir ürünün sınırını satın
     * alanın eline vermek demekti — uca elle istek atan herkes kendini
     * sınırsıza yükseltirdi.
     */
    expect(KAYNAK).toContain(
      "const paket: ManagerPaket = ctx.platformAdmin ? (input.paket ?? 'baslangic') : 'baslangic';",
    );
  });

  it('KRİTİK: platform sahibi kurarken EV ŞİRKETİ bağlanmıyor', () => {
    /*
     * Advetics'in kendi organizasyonunu müşterinin üst hesabına bağlamak,
     * Advetics'i o müşterinin portföyüne sokmak olurdu — ve kırk dokuz
     * şirketli kendi ajansını da oradan koparırdı.
     */
    /*
     * ═══ İDDİA KORUNAN SATIRA ÇAPALI ═══
     *
     * İlk yazımda `create()` gövdesinde `if (!ctx.platformAdmin) {` arıyordum
     * ve MUTASYONLA BOŞA DÜŞTÜ: aynı gövdede BAŞKA bir `!ctx.platformAdmin`
     * kontrolü daha var ("bu hesap zaten bir üst hesaba bağlı") ve koşulu
     * silsem bile o eşleşiyordu. "Yakınında geçiyor" bir iddia değil
     * (CLAUDE.md).
     *
     * Bugün iddia, KORUNAN ÇAĞRININ hemen öncesine bakıyor.
     */
    const guncelleme = KAYNAK.indexOf('tx.organization.update({');
    expect(guncelleme, 'ev şirketi bağlama bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const onceki = KAYNAK.slice(Math.max(0, guncelleme - 160), guncelleme);
    expect(onceki).toContain('if (!ctx.platformAdmin && evSirketi) {');
    expect(KAYNAK).toContain('data: { managerAccountId: hesap.id },');
  });

  it('KRİTİK: kurucu ÜYELİĞİ her hâlde yazılıyor', () => {
    // Platform yetkisi bir gün geri alınsa bile kurduğu hesaba erişimi
    // kalıyor ve o hesap sahipsiz kalmıyor.
    const bas = KAYNAK.indexOf('async create(');
    const dilim = KAYNAK.slice(bas, KAYNAK.indexOf('\n  }', bas));
    const uyelik = dilim.indexOf('tx.managerMembership.create(');
    const kosul = dilim.indexOf('if (!ctx.platformAdmin) {');
    expect(uyelik).toBeGreaterThan(-1);
    // Üyelik KOŞULUN DIŞINDA: koşulun içine girseydi platform sahibinin
    // kurduğu hesap sahipsiz doğardı.
    expect(uyelik).toBeGreaterThan(kosul);
    expect(dilim.slice(kosul, uyelik)).toContain('}');
  });
});

describe('KRİTİK: platform sahibi İKİNCİ hesabı gerçekten açabiliyor', () => {
  /*
   * Bir önceki turda yalnızca BAĞLAMA adımı atlanmıştı; ev şirketi
   * KONTROLÜ kalmıştı. Profaj'ın ev şirketi zaten Profaj'ın üst hesabına
   * bağlı olduğu için ikinci hesap "Bu şirket zaten bir üst hesaba bağlı"
   * ile düşerdi — yani satış için açılan özellik ilk kullanımda patlardı.
   * Yol testsizdi; artık değil.
   */
  it('ev şirketi kontrolü platform sahibinde ATLANIYOR', () => {
    const bas = KAYNAK.indexOf('async create(');
    const dilim = KAYNAK.slice(bas, KAYNAK.indexOf('\n  }', bas));
    expect(dilim).toContain('const evSirketi = ctx.platformAdmin\n      ? null');
    expect(dilim).toContain('if (evSirketi?.managerAccountId) {');
  });

  it('KRİTİK: create YENİ hesabın ağacını döndürüyor, aktif olanı değil', () => {
    /*
     * Bağlam bu istekte hâlâ ESKİ aktif hesabı taşıyor (çerez değişmedi).
     * `get(ctx)` platform sahibine az önce kurduğu değil içinde bulunduğu
     * hesabı döndürür ve ekran "kurulmadı" gibi görünürdü.
     */
    const bas = KAYNAK.indexOf('async create(');
    const dilim = KAYNAK.slice(bas, KAYNAK.indexOf('\n  }', bas));
    expect(dilim).toContain('this.agacOku(hesapId, ctx)');
    expect(dilim).not.toContain('await this.get(ctx)');
  });
});

describe('KRİTİK: paket DÜZENLEME', () => {
  const UPDATE = (() => {
    const bas = KAYNAK.indexOf('async update(');
    if (bas < 0) throw new Error('`update()` bulunamadı — tarama boşa düştü');
    return KAYNAK.slice(bas, KAYNAK.indexOf('\n  }', bas));
  })();

  it('paket değişikliği platform sahibi değilse REDDEDİLİYOR, yok sayılmıyor', () => {
    // Yok saymak, "paketi değiştirdim" sanan kullanıcıya 200 dönüp eski
    // paketi bırakmaktı — önizlemenin yalan söylemesi.
    expect(UPDATE).toContain('if (input.paket !== undefined && !ctx.platformAdmin) {');
    expect(UPDATE).toContain('Paketi yalnızca platform sahibi değiştirebilir');
  });

  it('KRİTİK: paket KÜÇÜLTÜLÜRKEN mevcut şirket sayısı sınanıyor', () => {
    /*
     * Beş şirketli hesabı Başlangıç'a (1 şirket) indirmek, dört şirketi
     * "fazla" bırakırdı ve hiçbir ekran o fazlalığı göstermiyor.
     */
    expect(UPDATE).toContain('if (sinir !== null && mevcutSirket > sinir) {');
    expect(UPDATE).toContain('Önce şirket sayısını düşürmek gerekiyor');
  });

  it('denetim kaydı ÖNCEKİ ve SONRAKİ paketi taşıyor', () => {
    expect(UPDATE).toContain("action: 'manager_account.update'");
    expect(UPDATE).toContain('before: onceki');
  });
});

describe('KRİTİK: aktif üst hesap ÇEREZDEN ve DOĞRULANIYOR', () => {
  it('çerez izin listesine karşı sınanıyor', () => {
    /*
     * Bu değer `app.current_manager_account_id()`yi sürüyor — üst hesap
     * tablolarının TEK sınırı. Doğrulamayı atlamak, çerez düzenleyerek
     * başka bir danışmanlığın ağacını okumak demekti.
     */
    expect(BAGLAM).toContain(
      'requestedManagerAccountId && secilebilirUstHesapIdler.has(requestedManagerAccountId)',
    );
  });

  it('KRİTİK: platform sahibi HER aktif hesaba geçebiliyor', () => {
    const bas = BAGLAM.indexOf('const platformHesaplari =');
    expect(bas, 'gövde bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const dilim = BAGLAM.slice(bas, BAGLAM.indexOf(';', bas));
    expect(dilim).toContain('user.platformAdmin');
    expect(dilim).toContain("status: 'active'");
  });

  it('KRİTİK: ÜYELİK yolu ROL şartını koruyor', () => {
    /*
     * Org geneli olmayan bir rol kardeş şirkette SIFIR workspace görür —
     * "geçtim ama hiçbir şey yok" gibi görünen, sebebi hiçbir ekranda
     * yazmayan bir çıkmaz. Askıya alınmış hesap da geçiş açmıyor.
     */
    const bas = BAGLAM.indexOf('const gecerliUyelikler =');
    const dilim = BAGLAM.slice(bas, BAGLAM.indexOf(';', bas));
    expect(dilim).toContain("m.managerAccount.status === 'active'");
    expect(dilim).toContain('isOrgScopedRole(m.role as Role)');
  });

  it('KRİTİK: geçiş ucu AYNI iki yolu uyguluyor', () => {
    /*
     * Bağlamdaki liste ile uçtaki kontrol ayrışırsa, seçicide görünen ama
     * tıklanınca reddedilen bir satır doğar — bu depoda bir kez yaşanmış
     * bir hâl.
     */
    const bas = AUTH.indexOf('async assertManagerAccountAccess(');
    const dilim = AUTH.slice(bas, AUTH.indexOf('\n  }', bas));
    expect(dilim.length, 'gövde bulunamadı — tarama boşa düştü').toBeGreaterThan(200);
    expect(dilim).toContain('if (ctx.platformAdmin) return;');
    expect(dilim).toContain('isOrgScopedRole(uyelik.role as Role)');
  });

  it('KRİTİK: üst hesap değişince ŞİRKET ve WORKSPACE seçimi sıfırlanıyor', () => {
    /*
     * Yeni üst hesabın altında eski şirket kimliği geçersiz; bırakılsaydı
     * `resolve` onu sessizce düşürürdü ama çerez ekranda bir şirket
     * seçiliymiş gibi durmaya devam ederdi — "başlık ≠ gövde".
     */
    const bas = CONTROLLER_AUTH.indexOf("@Post('switch-manager')");
    expect(bas, 'uç bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const dilim = CONTROLLER_AUTH.slice(bas, CONTROLLER_AUTH.indexOf('@Post(', bas + 10));
    expect(dilim).toContain('assertManagerAccountAccess(ctx, dto.managerAccountId)');
    expect(dilim).toContain('setActiveOrgCookie(res, this.config, null)');
    expect(dilim).toContain('setActiveClientCookie(res, this.config, null)');
  });
});

/** `data: { … }` bloklarının içini süslü parantez sayarak çıkarır. */
function dataBloklari(kaynak: string): string[] {
  const bloklar: string[] = [];
  const desen = /\bdata:\s*\{/g;
  let eslesme: RegExpExecArray | null;
  while ((eslesme = desen.exec(kaynak)) !== null) {
    let derinlik = 1;
    let i = eslesme.index + eslesme[0].length;
    while (i < kaynak.length && derinlik > 0) {
      if (kaynak[i] === '{') derinlik += 1;
      else if (kaynak[i] === '}') derinlik -= 1;
      i += 1;
    }
    bloklar.push(kaynak.slice(eslesme.index, i));
  }
  return bloklar;
}

describe('KRİTİK: platform sahipliği PANELDEN verilemiyor', () => {
  it('hiçbir uç `platform_admin` YAZMIYOR', () => {
    /*
     * Panelde bir düğme olsaydı, o düğmeyi görebilen herkes kendini
     * yükseltebilirdi. Yetkiyi veren şeyin kendisi o yetkiyle korunamaz:
     * bir açılış (bootstrap) sorunu ve tek dürüst çözümü sunucuya erişimi
     * olan birinin elle vermesi.
     *
     * ═══ TARAMA `data:` BLOKLARINA ÇAPALI ═══
     *
     * İlk yazımda `platformAdmin:\s*(true|false)` arıyordum ve BOŞA DÜŞTÜ —
     * aynı desen Prisma `select` bloğunda da geçiyor (`platformAdmin: true`
     * orada "bu kolonu OKU" demek). Okumayı yazma sanan bir iddia, gerçek
     * bir yazmayı da göremez.
     *
     * Bugün yalnızca YAZMA yüzeyi taranıyor: `data: { … }` bloklarının içi,
     * süslü parantez sayarak çıkarılıyor.
     */
    const API_SRC = join(__dirname, '..', '..');
    const yazanlar: string[] = [];
    const gez = (dizin: string) => {
      for (const giris of readdirSync(dizin, { withFileTypes: true })) {
        const yol = join(dizin, giris.name);
        if (giris.isDirectory()) {
          gez(yol);
          continue;
        }
        if (!giris.name.endsWith('.ts') || giris.name.includes('.spec.')) continue;
        const icerik = readFileSync(yol, 'utf8');
        for (const blok of dataBloklari(icerik)) {
          if (blok.includes('platformAdmin')) yazanlar.push(giris.name);
        }
      }
    };
    gez(API_SRC);
    expect(yazanlar).toEqual([]);
  });

  it('BOŞA DÜŞME BEKÇİSİ: tarayıcı GERÇEK bir yazmayı görüyor', () => {
    // Yukarıdaki `toEqual([])` iddiası, tarayıcı hiçbir şey bulamasa da
    // geçerdi. Bu test tarayıcının çalıştığını kanıtlıyor.
    const ornek = "await tx.user.update({ where: { id }, data: { platformAdmin: true } });";
    expect(dataBloklari(ornek).join('')).toContain('platformAdmin');
    expect(dataBloklari("select: { platformAdmin: true }").join('')).not.toContain('platformAdmin');
  });

  it('script VAR ve pnpm’den çağrılabiliyor', () => {
    const PAKET = readFileSync(join(__dirname, '..', '..', '..', 'package.json'), 'utf8');
    expect(PAKET).toContain('"db:platform-admin"');
  });
});
