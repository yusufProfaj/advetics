import { beforeEach, describe, expect, it } from 'vitest';
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
        organization: { status: 'active' },
        managerMemberships: s.ustHesap
          ? [
              {
                id: 'mm-1',
                role: s.ustHesap.role,
                managerAccountId: s.ustHesap.id,
                managerAccount: {
                  id: s.ustHesap.id,
                  name: `${s.ustHesap.id} Danışmanlık`,
                  status: s.ustHesap.status ?? 'active',
                },
              },
            ]
          : [],
        memberships: (s.uyelikler ?? [{ clientId: null, role: 'owner' }]).map((u, i) => ({
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
    organization: {
      // SÜZGEÇ GERÇEKTEN UYGULANIYOR — hepsini döndürmek testi anlamsız kılardı.
      findMany: async (args: { where: { managerAccountId: string; status: string } }) =>
        ORGLAR.filter(
          (o) =>
            o.managerAccountId === args.where.managerAccountId && o.status === args.where.status,
        ).map((o) => ({ id: o.id, name: o.name, slug: o.slug })),
    },
    client: {
      findMany: async (args: { where: { orgId: string } }) =>
        WORKSPACELER.filter((c) => c.orgId === args.where.orgId).map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status,
        })),
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
  const ALTINDA: Senaryo = { ustHesap: { id: UST_A, role: 'owner' } };

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
    const r = await servis({ ustHesap: { id: UST_A, role: 'owner' } }).resolve(
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
      ustHesap: { id: UST_A, role: 'owner', status: 'suspended' },
    }).resolve('user-1', null, ORG_A2);
    expect(r.context.orgId).toBe(ORG_A1);
    expect(r.managerAccount).toBeNull();
  });

  it('KRİTİK: ORG GENELİ OLMAYAN üst hesap rolü geçiş açmıyor', async () => {
    /*
     * Kardeş şirkette kullanıcının hiç `memberships` satırı YOK. Org geneli
     * olmayan bir rol orada SIFIR workspace görürdü — "geçtim ama hiçbir şey
     * yok" gibi görünen, sebebi hiçbir ekranda yazmayan bir çıkmaz. Geçiş
     * baştan açılmıyor.
     */
    const r = await servis({ ustHesap: { id: UST_A, role: 'analyst' } }).resolve(
      'user-1',
      null,
      ORG_A2,
    );
    expect(r.context.orgId).toBe(ORG_A1);
    expect(r.managerAccount).toBeNull();
  });

  it('bilinmeyen bir kimlik geçiş açmıyor', async () => {
    const r = await servis({ ustHesap: { id: UST_A, role: 'owner' } }).resolve(
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
      ustHesap: { id: UST_A, role: 'owner' },
      uyelikler: [{ clientId: 'ws-a1', role: 'analyst' }],
      kardesUyelikler: [{ orgId: ORG_A2, clientId: 'ws-a2', role: 'analyst' }],
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
      ustHesap: { id: UST_A, role: 'owner' },
      kardesUyelikler: [{ orgId: ORG_A2, clientId: 'ws-a2', role: 'analyst' }],
    }).resolve('user-1', null, ORG_A2);

    expect(r.context.orgId).toBe(ORG_A2);
    expect(r.context.role).toBe('analyst');
    expect(r.context.isOrgAdmin).toBe(false);
  });
});

describe('kardeş şirkette YETKİ üst hesap rolünden geliyor', () => {
  it('sentetik üyelik org geneli — workspace listesi doluyor', async () => {
    // Ev şirketinde YALNIZCA bir workspace'e yetkisi olan kullanıcı bile,
    // üst hesap rolü `owner` olduğu için kardeş şirkette org geneli.
    const r = await servis({
      ustHesap: { id: UST_A, role: 'owner' },
      uyelikler: [{ clientId: 'ws-a1', role: 'analyst' }],
    }).resolve('user-1', null, ORG_A2);

    expect(r.context.orgId).toBe(ORG_A2);
    expect(r.context.isOrgAdmin).toBe(true);
    expect(r.context.role).toBe('owner');
    expect(r.availableClients.map((c) => c.id)).toEqual(['ws-a2']);
  });

  it('EV şirketinde kendi üyeliği geçerli — üst hesap rolü EZMİYOR', async () => {
    /*
     * Üst hesapta `owner` olmak, ev şirketindeki dar yetkiyi genişletmemeli:
     * ikisi ayrı sorulara cevap veriyor ve ev şirketinin kendi üyelik satırı
     * daha spesifik.
     */
    const r = await servis({
      ustHesap: { id: UST_A, role: 'owner' },
      uyelikler: [{ clientId: 'ws-a1', role: 'analyst' }],
    }).resolve('user-1', 'ws-a1');

    expect(r.context.orgId).toBe(ORG_A1);
    expect(r.context.role).toBe('analyst');
    expect(r.context.isOrgAdmin).toBe(false);
  });
});
