import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TUM_SIRKETLER, orgSecimi } from '@advetics/shared';
import type { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { TenantContextService } from './tenant-context.service';

/**
 * ═══ ÜST HESAP (MCC) — ŞİRKET GEÇİŞİNİN GÜVENLİĞİ ═══
 *
 * `ust-hesap-rls.spec.ts` politikanın GUC'a doğru baktığını ölçüyor. Bu paket
 * zincirin diğer yarısı: O GUC'U KİM YAZIYOR.
 *
 * `context.orgId` bütün RLS politikalarının okuduğu `app.current_org_id()`yi
 * sürüyor ve artık kullanıcının SEÇİMİNE açık (cookie: `adv_org`). Yani bu
 * fonksiyon, ürünün tamamındaki izolasyonun tek kapısı. Doğrulamayı atlamak,
 * cookie düzenleyerek başka bir şirketin bütün verisini okumak demek.
 *
 * SÜZGEÇLER SAHTE VERİTABANINDA GERÇEKTEN UYGULANIYOR. `findMany` her şeyi
 * döndürseydi "kardeş şirkete geçebiliyor" testi de "geçemiyor" testi de
 * geçerdi ve paket hiçbir şey ölçmezdi.
 */

const UST_A = 'ust-a';
const UST_B = 'ust-b';
/** ŞİRKETSİZ üst hesap — ziyaret edilemez, çerez bayat sayılır. */
const UST_C = 'ust-c';

const ORG_A1 = 'org-a1';
const ORG_A2 = 'org-a2';
const ORG_B1 = 'org-b1';

interface SahteOrg {
  id: string;
  name: string;
  slug: string;
  status: string;
  managerAccountId: string | null;
}
interface SahteClient {
  id: string;
  orgId: string;
  name: string;
  status: string;
}

const ORGLAR: SahteOrg[] = [
  { id: ORG_A1, name: 'A1 Şirketi', slug: 'a1', status: 'active', managerAccountId: UST_A },
  { id: ORG_A2, name: 'A2 Şirketi', slug: 'a2', status: 'active', managerAccountId: UST_A },
  { id: ORG_B1, name: 'B1 Şirketi', slug: 'b1', status: 'active', managerAccountId: UST_B },
];

const WORKSPACELER: SahteClient[] = [
  { id: 'ws-a1', orgId: ORG_A1, name: 'A1 Workspace', status: 'active' },
  { id: 'ws-a2', orgId: ORG_A2, name: 'A2 Workspace', status: 'active' },
  { id: 'ws-b1', orgId: ORG_B1, name: 'B1 Workspace', status: 'active' },
];

interface Senaryo {
  /** Üst hesap üyeliği — yoksa bağımsız şirket hâli. */
  ustHesap?: { id: string; role: string; status?: string };
  /** Ev şirketindeki üyelikler. */
  uyelikler?: Array<{ clientId: string | null; role: string }>;
  /** KARDEŞ şirketteki gerçek üyelikler — şirketi açan kişi orada owner olur. */
  kardesUyelikler?: Array<{ orgId: string; clientId: string | null; role: string }>;
  /** Advetics'i işleten taraf mı — varsayılan HAYIR (bkz. fikstür). */
  platformAdmin?: boolean;
  /** `ustHesap`tan ÖNCE listelenen ek üyelikler — veritabanı sırasını taklit ediyor. */
  onceUyelikler?: Array<{ id: string; role: string }>;
  /**
   * EV ŞİRKETİNİN bağlı olduğu üst hesap. Varsayılan `ustHesap.id`
   * (kendi ajansı). Farklı bir değer ZİYARET hâlini kuruyor: platform
   * sahibi, ev şirketinin bağlı OLMADIĞI bir hesapta.
   */
  evUstHesabi?: string | null;
}

function servis(s: Senaryo) {
  const db = {
    user: {
      findUnique: async () => ({
        id: 'user-1',
        orgId: ORG_A1,
        email: 'a@x.com',
        fullName: 'A',
        status: 'active',
        /*
         * PLATFORM SAHİBİ DEĞİL. Bu paketin konusu ÜYELİKTEN gelen erişim.
         * Varsayılanı `true` yapmak, buradaki bütün izolasyon iddialarını
         * sessizce geçirirdi — platform sahibi zaten her hesaba geçebiliyor.
         */
        platformAdmin: s.platformAdmin ?? false,
        organization: {
          status: 'active',
          managerAccountId: s.evUstHesabi === undefined ? (s.ustHesap?.id ?? null) : s.evUstHesabi,
        },
        managerMemberships: s.ustHesap
          ? [
              ...(s.onceUyelikler ?? []).map((u, i) => ({
                id: `mm-once-${i}`,
                role: u.role,
                managerAccountId: u.id,
                managerAccount: {
                  id: u.id,
                  name: `${u.id} Danışmanlık`,
                  slug: u.id,
                  status: 'active',
                  paket: 'ajans' as const,
                },
              })),
              {
                id: 'mm-1',
                role: s.ustHesap.role,
                managerAccountId: s.ustHesap.id,
                managerAccount: {
                  id: s.ustHesap.id,
                  name: `${s.ustHesap.id} Danışmanlık`,
                  slug: s.ustHesap.id,
                  status: s.ustHesap.status ?? 'active',
                  paket: 'ajans' as const,
                },
              },
            ]
          : [],
        memberships: (s.uyelikler ?? [{ clientId: null, role: 'admin' }]).map((u, i) => ({
          id: `m-${i}`,
          /*
           * `orgId` FİKSTÜRDE — gerçek satırda da var ve bağlam artık
           * üyelikleri AKTİF şirkete süzüyor. Alanı vermemek, testin
           * üretimden farklı bir dünyada koşması demekti.
           */
          orgId: ORG_A1,
          clientId: u.clientId,
          role: u.role,
          permissions: null,
          client: u.clientId
            ? { id: u.clientId, name: u.clientId, status: 'active' }
            : null,
        })).concat(
          (s.kardesUyelikler ?? []).map((u, i) => ({
            id: `k-${i}`,
            orgId: u.orgId,
            clientId: u.clientId,
            role: u.role,
            permissions: null,
            client: u.clientId
              ? { id: u.clientId, name: u.clientId, status: 'active' }
              : null,
          })),
        ),
      }),
    },
    /*
     * ÜST HESAP TABLOSU — seçicinin listesi ve platform sahibinin yolu.
     *
     * `findMany` iki yerden çağrılıyor: platform sahibinin geçebileceği
     * hesaplar ve seçici listesi. Fikstürde olmaması, bağlam çözümünün
     * `undefined.findMany` ile patlaması demekti.
     */
    managerAccount: {
      findMany: async (args: { where?: { id?: { in: string[] } } } = {}) => {
        const hepsi = [UST_A, UST_B, UST_C].map((id) => ({
          id,
          name: `${id} Danışmanlık`,
          slug: id,
          paket: 'ajans' as const,
          _count: { organizations: ORGLAR.filter((o) => o.managerAccountId === id).length },
        }));
        const idler = args.where?.id?.in;
        return idler ? hepsi.filter((h) => idler.includes(h.id)) : hepsi;
      },
    },
    organization: {
      /*
       * İKİ SORGU ŞEKLİ: kardeşler (`managerAccountId`) ve seçici listesi
       * (`id: { in }`). İkincisi uzun süre mock'ta YOKTU ve süzgeç
       * `undefined === managerAccountId` ile boş dönüyordu — hiçbir test
       * `erisilebilirSirketler`i sormadığı için boşluk görünmedi. Ziyaret
       * testleri sorunca çıktı. Bilinmeyen şekil PATLIYOR, boş dönmüyor.
       */
      findMany: async (args: {
        where: { managerAccountId?: string; id?: { in: string[] }; status: string };
      }) => {
        const w = args.where;
        const aday = w.managerAccountId !== undefined
          ? ORGLAR.filter((o) => o.managerAccountId === w.managerAccountId)
          : w.id !== undefined
            ? ORGLAR.filter((o) => w.id!.in.includes(o.id))
            : (() => {
                throw new Error(`organization.findMany: tanınmayan where ${JSON.stringify(w)}`);
              })();
        return aday
          .filter((o) => o.status === w.status)
          .map((o) => ({ id: o.id, name: o.name, slug: o.slug }));
      },
    },
    client: {
      /*
       * İKİ SORGU ŞEKLİ DE TANINIYOR ve BİLİNMEYEN ŞEKİL PATLIYOR.
       *
       * Kod "tüm şirketler" modunda `{ orgId: { in: [...] } }` gönderiyor.
       * Taklit yalnızca düz dizeyi biliyordu ve karşılaştırma sessizce
       * false dönüp BOŞ LİSTE üretiyordu — yani test, çalışmayan bir
       * özelliği "çalışıyor" gösterecek kadar yakın geçti. `pglite-harness`
       * aynı sebeple bilinmeyen alanda açıkça patlıyor.
       */
      findMany: async (args: { where: { orgId: string | { in: string[] } } }) => {
        const o = args.where.orgId;
        const eslesir =
          typeof o === 'string'
            ? (c: SahteClient) => c.orgId === o
            : Array.isArray(o?.in)
              ? (c: SahteClient) => o.in.includes(c.orgId)
              : null;
        if (!eslesir) {
          throw new Error(
            `sahte client.findMany bu orgId şeklini tanımıyor: ${JSON.stringify(o)}`,
          );
        }
        return WORKSPACELER.filter(eslesir).map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status,
        }));
      },
    },
  } as unknown as PrismaAdminService;

  return new TenantContextService(db);
}

// ---------------------------------------------------------------------------

describe('üst hesabı OLMAYAN kullanıcı — davranış değişmedi', () => {
  it('aktif şirket her zaman ev şirketi', async () => {
    const r = await servis({}).resolve('user-1', null, ORG_A2);
    expect(r.context.orgId).toBe(ORG_A1);
    expect(r.managerAccount).toBeNull();
    expect(r.context.managerAccountId).toBeNull();
  });

  it('kendi workspace\'lerini görüyor', async () => {
    const r = await servis({}).resolve('user-1');
    expect(r.availableClients.map((c) => c.id)).toEqual(['ws-a1']);
  });
});

describe('üst hesap altında ŞİRKET GEÇİŞİ', () => {
  const ALTINDA: Senaryo = { ustHesap: { id: UST_A, role: 'admin' } };

  it('kardeş şirketler listeleniyor', async () => {
    const r = await servis(ALTINDA).resolve('user-1');
    expect(r.managerAccount?.organizations.map((o) => o.id).sort()).toEqual([ORG_A1, ORG_A2]);
  });

  it('KRİTİK: kardeş şirkete geçince O ŞİRKETİN workspace\'leri geliyor', async () => {
    const r = await servis(ALTINDA).resolve('user-1', null, ORG_A2);
    expect(r.context.orgId).toBe(ORG_A2);
    expect(r.availableClients.map((c) => c.id)).toEqual(['ws-a2']);
  });

  it('KRİTİK: `actor.orgId` EV şirketi kalıyor — token kontrolü kırılmasın', async () => {
    /*
     * `JwtAuthGuard` token'daki org'u `actor.orgId` ile karşılaştırıyor.
     * Buraya aktif şirketi yazmak, geçiş yapan kullanıcının HER isteğini
     * "Oturum geçersiz" ile düşürürdü — özellik hiç çalışmazdı.
     */
    const r = await servis(ALTINDA).resolve('user-1', null, ORG_A2);
    expect(r.actor.orgId).toBe(ORG_A1);
    expect(r.context.orgId).toBe(ORG_A2);
  });

  it('seçim yoksa ev şirketinde kalıyor', async () => {
    const r = await servis(ALTINDA).resolve('user-1');
    expect(r.context.orgId).toBe(ORG_A1);
  });
});

describe('YETKİ YÜKSELTME KAPALI', () => {
  it('KRİTİK: BAŞKA danışmanlığın şirketine geçilemiyor — sessizce eve düşüyor', async () => {
    /*
     * En pahalı senaryo: cookie'ye başka bir şirketin kimliğini yazmak.
     * Geçebilseydi o şirketin bütün kampanya, harcama ve müşteri verisi
     * açılırdı — RLS de izin verirdi, çünkü RLS bu değere GÜVENİYOR.
     */
    const r = await servis({ ustHesap: { id: UST_A, role: 'admin' } }).resolve(
      'user-1',
      null,
      ORG_B1,
    );
    expect(r.context.orgId).toBe(ORG_A1);
    expect(r.availableClients.map((c) => c.id)).toEqual(['ws-a1']);
  });

  it('KRİTİK: üst hesabı olmayan kullanıcı hiçbir şirkete geçemiyor', async () => {
    const r = await servis({}).resolve('user-1', null, ORG_A2);
    expect(r.context.orgId).toBe(ORG_A1);
  });

  it('KRİTİK: ASKIYA ALINMIŞ üst hesap geçiş açmıyor', async () => {
    const r = await servis({
      ustHesap: { id: UST_A, role: 'admin', status: 'suspended' },
    }).resolve('user-1', null, ORG_A2);
    expect(r.context.orgId).toBe(ORG_A1);
    expect(r.managerAccount).toBeNull();
  });

  it('KRİTİK: MÜŞTERİ HESABI rolü üst hesapta geçiş açmıyor', async () => {
    /*
     * Kardeş şirkette kullanıcının hiç `memberships` satırı YOK; şirket
     * geneli OLAMAYAN bir rol orada SIFIR workspace görürdü — "geçtim ama
     * hiçbir şey yok" gibi görünen, sebebi hiçbir ekranda yazmayan bir
     * çıkmaz.
     *
     * DIŞARIDA KALAN TEK ROL `client_viewer` (danışman rolleri şirket
     * seviyesine çıktı) ve o, kuralın var oluş sebebi: müşterinin kendi
     * giriş hesabı hiçbir koşulda şirketler arasında gezinemez.
     */
    const r = await servis({ ustHesap: { id: UST_A, role: 'client_viewer' } }).resolve(
      'user-1',
      null,
      ORG_A2,
    );
    expect(r.context.orgId).toBe(ORG_A1);
    expect(r.managerAccount).toBeNull();
  });

  it('bilinmeyen bir kimlik geçiş açmıyor', async () => {
    const r = await servis({ ustHesap: { id: UST_A, role: 'admin' } }).resolve(
      'user-1',
      null,
      'uydurma-kimlik',
    );
    expect(r.context.orgId).toBe(ORG_A1);
  });
});

describe('ÜYELİK AKTİF ŞİRKETE SÜZÜLÜYOR', () => {
  it('KRİTİK: başka şirketin workspace kimlikleri bağlama SIZMIYOR', () => {
    /*
     * `clientIds` doğrudan `app.current_client_ids()`e yazılıyor ve
     * `can_access_client()` onu okuyor. Süzgeç olmasa, A şirketindeyken
     * B'nin workspace kimlikleri bağlamda dolaşırdı.
     *
     * Tek org varsayımında bu mümkün DEĞİLDİ (bir kullanıcı = bir org);
     * üst hesap katmanı o varsayımı bozdu.
     */
    return servis({
      ustHesap: { id: UST_A, role: 'admin' },
      uyelikler: [{ clientId: 'ws-a1', role: 'client_viewer' }],
      kardesUyelikler: [{ orgId: ORG_A2, clientId: 'ws-a2', role: 'client_viewer' }],
    })
      .resolve('user-1', null, null)
      .then((r) => {
        expect(r.context.orgId).toBe(ORG_A1);
        expect(r.context.clientIds).toEqual(['ws-a1']);
        expect(r.context.clientIds).not.toContain('ws-a2');
      });
  });

  it('KRİTİK: kardeş şirketteki GERÇEK üyelik, üst hesap rolünü EZİYOR', async () => {
    /*
     * Şirketi AÇAN kişi orada gerçek bir `owner` üyeliği alıyor. Ama başka
     * biri ona o şirkette DAR bir rol vermiş olabilir; üst hesaptaki geniş
     * rolün onu ezmesi, kullanıcının o şirkette beklemediği bir yetki
     * bulması demekti.
     */
    const r = await servis({
      ustHesap: { id: UST_A, role: 'admin' },
      kardesUyelikler: [{ orgId: ORG_A2, clientId: 'ws-a2', role: 'client_viewer' }],
    }).resolve('user-1', null, ORG_A2);

    expect(r.context.orgId).toBe(ORG_A2);
    expect(r.context.role).toBe('client_viewer');
    expect(r.context.isOrgAdmin).toBe(false);
  });
});

describe('kardeş şirkette YETKİ üst hesap rolünden geliyor', () => {
  it('sentetik üyelik org geneli — workspace listesi doluyor', async () => {
    // Ev şirketinde YALNIZCA bir workspace'e yetkisi olan kullanıcı bile,
    // üst hesap rolü `owner` olduğu için kardeş şirkette org geneli.
    const r = await servis({
      ustHesap: { id: UST_A, role: 'admin' },
      uyelikler: [{ clientId: 'ws-a1', role: 'client_viewer' }],
    }).resolve('user-1', null, ORG_A2);

    expect(r.context.orgId).toBe(ORG_A2);
    expect(r.context.isOrgAdmin).toBe(true);
    expect(r.context.role).toBe('admin');
    expect(r.availableClients.map((c) => c.id)).toEqual(['ws-a2']);
  });

  it('EV şirketinde kendi üyeliği geçerli — üst hesap rolü EZMİYOR', async () => {
    /*
     * Üst hesapta `owner` olmak, ev şirketindeki dar yetkiyi genişletmemeli:
     * ikisi ayrı sorulara cevap veriyor ve ev şirketinin kendi üyelik satırı
     * daha spesifik.
     */
    const r = await servis({
      ustHesap: { id: UST_A, role: 'admin' },
      uyelikler: [{ clientId: 'ws-a1', role: 'client_viewer' }],
    }).resolve('user-1', 'ws-a1');

    expect(r.context.orgId).toBe(ORG_A1);
    expect(r.context.role).toBe('client_viewer');
    expect(r.context.isOrgAdmin).toBe(false);
  });
});

describe('"TÜM ŞİRKETLER" MODU', () => {
  const ALTINDA: Senaryo = { ustHesap: { id: UST_A, role: 'admin' } };

  it('KRİTİK: bayrak açılıyor ve workspace listesi BÜTÜN ajansı kapsıyor', async () => {
    const r = await servis(ALTINDA).resolve('user-1', null, TUM_SIRKETLER);
    expect(r.context.tumSirketler).toBe(true);
    expect(r.availableClients.map((c) => c.id).sort()).toEqual(['ws-a1', 'ws-a2']);
  });

  it('KRİTİK: `orgId` EV ŞİRKETİ kalıyor — yazma yolları tek şirkete çivili', async () => {
    /*
     * `ctx.orgId` yalnızca RLS'i sürmüyor; uygulama kodunda 21 yerde
     * `orgId: ctx.orgId` olarak YAZMA yollarını da besliyor. Moda özel bir
     * değer koymak, o yazmaların nereye gideceğini belirsiz yapardı.
     */
    const r = await servis(ALTINDA).resolve('user-1', null, TUM_SIRKETLER);
    expect(r.context.orgId).toBe(ORG_A1);
  });

  it('KRİTİK: modda WORKSPACE SEÇİMİ yok', async () => {
    /*
     * Mod bir GENEL BAKIŞ. Seçimi geçerli saymak, `ctx.orgId` (ev şirketi)
     * ile seçili workspace'in şirketi farklı olduğunda yazma yollarını iki
     * dünyaya birden bakan bir hâle sokardı.
     */
    const r = await servis(ALTINDA).resolve('user-1', 'ws-a2', TUM_SIRKETLER);
    expect(r.context.activeClientId).toBeNull();
  });

  it('KRİTİK: ÜST HESABI OLMAYAN kullanıcıda mod AÇILMIYOR', async () => {
    // Sentinel doğrulanmasaydı cookie'ye `all` yazan herkes modu açardı.
    const r = await servis({}).resolve('user-1', null, TUM_SIRKETLER);
    expect(r.context.tumSirketler).toBe(false);
    expect(r.availableClients.map((c) => c.id)).toEqual(['ws-a1']);
  });

  it('KRİTİK: ASKIYA ALINMIŞ üst hesapta mod AÇILMIYOR', async () => {
    const r = await servis({
      ustHesap: { id: UST_A, role: 'admin', status: 'suspended' },
    }).resolve('user-1', null, TUM_SIRKETLER);
    expect(r.context.tumSirketler).toBe(false);
  });

  it('normal şirket seçiminde bayrak KAPALI', async () => {
    const r = await servis(ALTINDA).resolve('user-1', null, ORG_A2);
    expect(r.context.tumSirketler).toBe(false);
    expect(r.context.orgId).toBe(ORG_A2);
  });
});

describe('MOD OTURUM YANITINDA KAYBOLMUYOR', () => {
  /*
   * CANLIDA GÖRÜLDÜ: "Tüm şirketler"e tıklanıyor, cookie `all` yazılıyor,
   * guard bağlamı DOĞRU kuruyor (veri ajans geneli geliyor) — ama panel
   * "Advetics" yazmaya devam ediyordu.
   *
   * Sebep: `/auth/session` `ctx.orgId`yi geri gönderiyordu ve o değer modda
   * EV şirketi (yazma yolları oraya çivili). `buildSession` onu bir SEÇİM
   * sanıp modu düşürüyordu.
   *
   * Belirtisi başlık ile gövdenin ayrışması — bu depoda bir kez "kritik
   * veri güvenliği ihlali" olarak bildirilen hâlin aynısı.
   */
  const CONTROLLER = readFileSync(join(__dirname, 'auth.controller.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  /**
   * `desen`den başlayan metot GÖVDESİNİ çıkarır.
   *
   * PARAMETRE LİSTESİ PARANTEZ SAYARAK ATLANIYOR. İlk `)`e kadar gitmek
   * YETMİYOR: NestJS dekoratörleri parametrelerin içinde parantez taşıyor
   * (`@CurrentTenant() ctx`) ve ilk `)` orada kapanıyor; sonraki `{` de
   * gövde değil `@Res({ passthrough: true })` oluyordu. İlk yazımda tam
   * olarak öyleydi ve dilim `{ passthrough: true }` çıktı.
   */
  function metot(kaynak: string, desen: string): string {
    const bas = kaynak.indexOf(desen);
    if (bas === -1) throw new Error(`Metot bulunamadı: ${desen}`);
    const parBas = kaynak.indexOf('(', bas);
    let par = 0;
    let parSon = -1;
    for (let i = parBas; i < kaynak.length; i++) {
      if (kaynak[i] === '(') par++;
      else if (kaynak[i] === ')' && --par === 0) {
        parSon = i;
        break;
      }
    }
    const acilis = kaynak.indexOf('{', parSon);
    let d = 0;
    for (let i = acilis; i < kaynak.length; i++) {
      if (kaynak[i] === '{') d++;
      else if (kaynak[i] === '}' && --d === 0) return kaynak.slice(acilis, i + 1);
    }
    throw new Error(`Metot kapanmıyor: ${desen}`);
  }

  it('BOŞA DÜŞME BEKÇİSİ: controller okundu', () => {
    expect(CONTROLLER).toContain('buildSession');
    expect(CONTROLLER).toContain('switch-org');
  });

  it('KRİTİK: `orgSecimi` modu SENTINEL olarak geri veriyor', () => {
    expect(orgSecimi({ orgId: ORG_A1, tumSirketler: true })).toBe(TUM_SIRKETLER);
    expect(orgSecimi({ orgId: ORG_A1, tumSirketler: false })).toBe(ORG_A1);
  });

  it('KRİTİK: `/auth/session` `ctx.orgId` DEĞİL `orgSecimi(ctx)` gönderiyor', () => {
    const govde = metot(CONTROLLER, 'async session(');
    expect(govde).toContain('orgSecimi(ctx)');
    expect(govde).not.toContain('ctx.activeClientId, ctx.orgId');
  });

  it('KRİTİK: workspace seçmek MODDAN ÇIKARIYOR — cookie `all` kalmıyor', () => {
    /*
     * Modda workspace seçimi YOK (`resolve` onu null'a düşürüyor). Cookie
     * `all` kalsaydı seçim her istekte sessizce atılırdı: kullanıcı tıklar,
     * hiçbir şey olmaz ve sebebi hiçbir ekranda yazmaz.
     */
    const govde = metot(CONTROLLER, 'async switchClient(');
    expect(govde).toContain('workspaceKapsami(ctx, dto.clientId)');
    expect(govde).toContain('setActiveOrgCookie(res, this.config, yeniSecim)');
  });

  it('workspace seçimi KALKINCA mod korunuyor', () => {
    // "Şirket geneli" bir daraltmayı kaldırma eylemi, moddan çıkma değil.
    const govde = metot(CONTROLLER, 'async switchClient(');
    expect(govde).toContain('dto.clientId === null');
    expect(govde).toContain('orgSecimi(ctx)');
  });
});

describe('ZİYARET — platform sahibi ev şirketinin bağlı OLMADIĞI hesapta', () => {
  /*
   * ═══ ÜRETİMDE YAŞANAN ARIZA ═══
   *
   * Platform sahibi yeni üst hesap kurup içine geçti; bağlam ev şirketini
   * (Advetics) hem izinli hem varsayılan saydı. Oturum `{üst hesap: YENİ,
   * şirket: ADVETICS}` gibi tutarsız bir hâle geldi ve `/connections`
   * `ctx.orgId` ile listelediği için Profaj'ın platform bağlantıları yeni
   * hesapta göründü. Kullanıcının cümlesi: *"profaj reklamcılıkta bulunan
   * platform bağlantısı yeni üst hesaba geçiyor."*
   */
  const ZIYARET: Senaryo = {
    platformAdmin: true,
    ustHesap: { id: UST_A, role: 'admin' },
    evUstHesabi: UST_A,
  };

  it('KRİTİK: aktif şirket EV DEĞİL, ziyaret edilen hesabın kardeşi', async () => {
    const r = await servis(ZIYARET).resolve('user-1', null, null, UST_B);
    expect(r.context.managerAccountId).toBe(UST_B);
    expect(r.context.orgId).toBe(ORG_B1);
    expect(r.availableClients.map((c) => c.id)).toEqual(['ws-b1']);
  });

  it('KRİTİK: ziyarette ev şirketi İSTENSE de açılmıyor', async () => {
    // Çerezde `adv_org=ADVETICS` kalmış olabilir; ziyarette o kimlik izinli
    // değil ve kardeşe düşmeli — ev şirketine değil.
    const r = await servis(ZIYARET).resolve('user-1', null, ORG_A1, UST_B);
    expect(r.context.orgId).toBe(ORG_B1);
  });

  it('KRİTİK: seçici de yalnızca kardeşleri listeliyor', async () => {
    // Ekranda görünen = geçilebilen. Ev şirketi seçicide dursaydı tıklanınca
    // ya reddedilir ya da sızıntı yeniden açılırdı.
    const r = await servis(ZIYARET).resolve('user-1', null, null, UST_B);
    expect(r.erisilebilirSirketler.map((o) => o.id)).toEqual([ORG_B1]);
  });

  it('KRİTİK: ŞİRKETSİZ hesaba ziyaret bayat çerez sayılıyor — üyeliğe düşüyor', async () => {
    /*
     * Girilecek şirket yokken ev şirketini aktif yapmak sızıntının ta
     * kendisi. `switch-manager` böyle hesaba girerken ilk şirketi açıyor;
     * burası elle yazılmış/bayat çerezin son çaresi ve SESSİZ DEĞİL —
     * `managerAccountId` yanıtta üyeliktekini gösteriyor.
     */
    const r = await servis(ZIYARET).resolve('user-1', null, null, UST_C);
    expect(r.context.managerAccountId).toBe(UST_A);
    expect(r.context.orgId).toBe(ORG_A1);
  });

  it('BOŞA DÜŞME BEKÇİSİ: KENDİ hesabında davranış DEĞİŞMEDİ', async () => {
    // Ziyaret dalı yanlışlıkla herkese uygulansaydı ajans sahibi kendi ev
    // şirketine düşemezdi. Kendi hesabında ev şirketi hâlâ varsayılan.
    const r = await servis(ZIYARET).resolve('user-1', null, null, UST_A);
    expect(r.context.orgId).toBe(ORG_A1);
    expect(r.erisilebilirSirketler.map((o) => o.id)).toEqual([ORG_A1, ORG_A2]);
  });
});

describe('VARSAYILAN ÜST HESAP — çerez yokken', () => {
  it('KRİTİK: ev şirketinin hesabına düşüyor, veritabanının İLK satırına değil', async () => {
    /*
     * İki hesaba üye platform sahibi; üyelik listesinde UST_B ÖNCE geliyor
     * (veritabanı böyle döndürebilir). Ev şirketi UST_A'nın altında.
     * Eski davranış `[0]` = UST_B'ye düşüyordu — girişte yanlış hesapta
     * uyanmak.
     */
    const r = await servis({
      platformAdmin: true,
      onceUyelikler: [{ id: UST_B, role: 'admin' }],
      ustHesap: { id: UST_A, role: 'admin' },
      evUstHesabi: UST_A,
    }).resolve('user-1', null, null, null);
    expect(r.context.managerAccountId).toBe(UST_A);
    expect(r.context.orgId).toBe(ORG_A1);
  });

  it('KRİTİK: üyelik listesi TARİHE göre sıralı — "ilki" veritabanının keyfine bırakılmıyor', () => {
    /*
     * Mock üyelikleri zaten sıralı verdiği için `orderBy`nin kalkması burada
     * davranışla YAKALANAMAZ; kaynak taramasıyla kilitleniyor. Sırasız bir
     * ilişki seçiminde `[0]` her sorguda farklı satır olabilir.
     */
    const KAYNAK = readFileSync(join(__dirname, 'tenant-context.service.ts'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    const bas = KAYNAK.indexOf('managerMemberships: {');
    expect(bas, 'seçim bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const dilim = KAYNAK.slice(bas, KAYNAK.indexOf('select: {', bas));
    expect(dilim).toContain("orderBy: { createdAt: 'asc' }");
  });

  it('BOŞA DÜŞME BEKÇİSİ: ev şirketinin hesabında üyelik YOKSA ilk üyelik', async () => {
    // Tercih kuralı yalnızca ev hesabı üyeliği varken devreye giriyor;
    // yoksa yine belirli bir sıraya (tarih) göre ilki.
    const r = await servis({
      platformAdmin: true,
      onceUyelikler: [{ id: UST_B, role: 'admin' }],
      ustHesap: { id: UST_A, role: 'admin' },
      evUstHesabi: UST_C,
    }).resolve('user-1', null, null, null);
    expect(r.context.managerAccountId).toBe(UST_B);
  });
});

describe('ÜST HESAPTAKİ ROL ve yönetebilir — oturum yanıtı', () => {
  /*
   * Ekip ekranı "üst hesaba kişi ekle" düğmesini `managerAccount.yonetebilir`
   * ile açıyor. `isOrgAdmin` YETMİYOR: tek bir şirketin yöneticisi de o
   * bayrağı taşıyor ve onu üst hesap ekibini yönetebilir saymak, kendini
   * bütün şirketlerin yöneticisi yapabilmesi demekti. Bu paket ayrımı
   * kilitliyor.
   */
  it('KRİTİK: üst hesapta ad_manager → yonetebilir FALSE, isOrgAdmin ev şirketinde TRUE olsa bile', async () => {
    const r = await servis({
      ustHesap: { id: UST_A, role: 'ad_manager' },
      // Ev şirketinde GERÇEK yönetici üyeliği — isOrgAdmin bundan açılıyor.
      uyelikler: [{ clientId: null, role: 'admin' }],
    }).resolve('user-1');
    expect(r.context.isOrgAdmin).toBe(true);
    expect(r.managerAccount?.rol).toBe('ad_manager');
    expect(r.managerAccount?.yonetebilir).toBe(false);
  });

  it('üst hesapta admin → yonetebilir TRUE', async () => {
    const r = await servis({ ustHesap: { id: UST_A, role: 'admin' } }).resolve('user-1');
    expect(r.managerAccount?.rol).toBe('admin');
    expect(r.managerAccount?.yonetebilir).toBe(true);
  });

  it('platform sahibi üyesi olmadığı hesapta admin sayılıyor ve yönetebiliyor', async () => {
    // UST_B'ye ÜYELİK YOK (fikstür yalnızca UST_A'ya üyelik yazıyor); geçiş
    // platform bayrağından. UST_C şirketsiz — oraya ziyaret bayat çerez
    // sayılıp üyeliğe düşüyor, bu yüzden burada B.
    const r = await servis({
      platformAdmin: true,
      ustHesap: { id: UST_A, role: 'ad_manager' },
      evUstHesabi: UST_A,
    }).resolve('user-1', null, null, UST_B);
    expect(r.managerAccount?.id).toBe(UST_B);
    expect(r.managerAccount?.rol).toBe('admin');
    expect(r.managerAccount?.yonetebilir).toBe(true);
  });
});
