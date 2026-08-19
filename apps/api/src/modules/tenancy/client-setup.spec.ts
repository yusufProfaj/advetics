import { beforeEach, describe, expect, it } from 'vitest';
import type { ClientSetupInput, TenantContext } from '@advetics/shared';
import type { ConnectionsService } from '../connections/connections.service';
import { ClientSetupService } from './client-setup.service';
import type { ClientsService } from './clients.service';
import type { MembersService } from './members.service';

/**
 * KURULUM SİHİRBAZI — kararlar sınanıyor, SQL değil.
 *
 * Sihirbaz üç mevcut servisi sırayla çağırıyor ve kendi yazma yolu yok. O
 * yüzden sınanacak şey ORKESTRASYON: hangi bağlamla çağırıyor, hata olunca ne
 * yapıyor, ve rolü kim belirliyor.
 *
 * Üçü de sessiz hata üretebilecek yerler:
 *   1. Bağlam yeni müşteriyi taşımazsa her atama "Müşteri bulunamadı" verir.
 *   2. Kısmi başarı raporlanmazsa "kuruldu" denir ve veri gelmez.
 *   3. Rol istemciden alınırsa müşteriye teslim edilen hesap ajans yetkisi
 *      taşıyabilir.
 */
const ORG = '11111111-1111-1111-1111-111111111111';
const VAROLAN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const YENI = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ACC1 = '44444444-4444-4444-4444-444444444444';
const ACC2 = '55555555-5555-5555-5555-555555555555';
const PROFIL = '66666666-6666-6666-6666-666666666666';

const CTX: TenantContext = {
  orgId: ORG,
  userId: '22222222-2222-2222-2222-222222222222',
  clientIds: [VAROLAN],
  activeClientId: VAROLAN,
  isOrgAdmin: true,
} as TenantContext;

const META = { ip: null, userAgent: null, requestId: 'test' };

function girdi(over: Partial<ClientSetupInput> = {}): ClientSetupInput {
  return {
    name: 'Mia Yapı',
    timezone: 'Europe/Istanbul',
    reportingCurrency: 'TRY',
    specialAdCategories: [],
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    website: null,
    address: null,
    taxOffice: null,
    taxNumber: null,
    iban: null,
    notes: null,
    adAccountIds: [],
    socialProfileIds: [],
    ...over,
  } as ClientSetupInput;
}

interface Cagrilar {
  hesapAtama: Array<{ ctx: TenantContext; id: string; clientId: string | null }>;
  profilAtama: Array<{ id: string; clientId: string | null }>;
  uye: Array<Record<string, unknown>>;
}

let c: Cagrilar;
let svc: ClientSetupService;
/** Hangi hesap kimliklerinde atama patlayacak. */
let patlayan: Set<string>;
let uyePatlar: boolean;

beforeEach(() => {
  c = { hesapAtama: [], profilAtama: [], uye: [] };
  patlayan = new Set();
  uyePatlar = false;

  const clients = {
    create: async () => ({ id: YENI, name: 'Mia Yapı' }),
  } as unknown as ClientsService;

  const connections = {
    assignAdAccount: async (
      ctx: TenantContext,
      id: string,
      clientId: string | null,
    ) => {
      if (patlayan.has(id)) throw new Error(`"${id}" bir yönetici (MCC) hesabı`);
      c.hesapAtama.push({ ctx, id, clientId });
      return {};
    },
    assignSocialProfile: async (
      _ctx: TenantContext,
      id: string,
      clientId: string | null,
    ) => {
      c.profilAtama.push({ id, clientId });
      return {};
    },
  } as unknown as ConnectionsService;

  const members = {
    createMember: async (_ctx: TenantContext, input: Record<string, unknown>) => {
      if (uyePatlar) throw new Error('Bu e-posta zaten kullanılıyor');
      c.uye.push(input);
      return {};
    },
  } as unknown as MembersService;

  svc = new ClientSetupService(clients, connections, members);
});

describe('bağlam', () => {
  it('KRİTİK: yeni müşteri erişim listesine EKLENİYOR', async () => {
    /*
     * `ctx.clientIds` istek başında kuruldu; az önce oluşturulan müşteri
     * orada yok. Atama servisleri erişimi o listeye karşı doğruluyor, yani
     * genişletmeden çağırmak her atamada "Müşteri bulunamadı" verirdi.
     */
    await svc.setup(CTX, girdi({ adAccountIds: [ACC1] }), META);
    expect(c.hesapAtama[0]!.ctx.clientIds).toContain(YENI);
  });

  it('KRİTİK: aktif müşteri daraltması KAPATILIYOR', async () => {
    // Oturumda başka bir müşteri seçiliyse RLS yeni müşterinin satırlarını
    // gizler ve atama güncellemesi kendi görüş alanının dışına düşerdi.
    await svc.setup(CTX, girdi({ adAccountIds: [ACC1] }), META);
    expect(c.hesapAtama[0]!.ctx.activeClientId).toBeNull();
  });

  it('var olan erişim kaybolmuyor — liste eziliyor değil genişletiliyor', async () => {
    await svc.setup(CTX, girdi({ adAccountIds: [ACC1] }), META);
    expect(c.hesapAtama[0]!.ctx.clientIds).toContain(VAROLAN);
  });
});

describe('atamalar', () => {
  it('seçilen bütün hesaplar ve sayfalar YENİ müşteriye atanıyor', async () => {
    const r = await svc.setup(
      CTX,
      girdi({ adAccountIds: [ACC1, ACC2], socialProfileIds: [PROFIL] }),
      META,
    );
    expect(r.assignedAccounts).toBe(2);
    expect(r.assignedProfiles).toBe(1);
    expect(c.hesapAtama.every((a) => a.clientId === YENI)).toBe(true);
    expect(c.profilAtama[0]!.clientId).toBe(YENI);
  });

  it('hiç hesap seçilmezse atama yapılmıyor — müşteri yine açılıyor', async () => {
    const r = await svc.setup(CTX, girdi(), META);
    expect(r.clientId).toBe(YENI);
    expect(c.hesapAtama).toHaveLength(0);
  });
});

describe('KISMİ BAŞARI — sessiz kalmıyor', () => {
  it('KRİTİK: atanamayan hesap SEBEBİYLE dönüyor', async () => {
    /*
     * Sessiz atlama, "kuruldu" deyip eksik bırakmak olurdu ve kullanıcı
     * bunu ancak veri gelmediğinde fark ederdi — sebebin aranacağı yer de
     * gizlenmiş olurdu.
     */
    patlayan.add(ACC2);
    const r = await svc.setup(CTX, girdi({ adAccountIds: [ACC1, ACC2] }), META);

    expect(r.assignedAccounts).toBe(1);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]).toMatchObject({ kind: 'adAccount', id: ACC2 });
    expect(r.failures[0]!.reason).toContain('MCC');
  });

  it('KRİTİK: bir hesap patlayınca DİĞERLERİ yine atanıyor', async () => {
    // Geri almak, çalışan kurulumu tek bir hatalı hesap yüzünden çöpe atmak
    // ve kullanıcıya aynı formu baştan doldurtmak olurdu.
    patlayan.add(ACC1);
    const r = await svc.setup(
      CTX,
      girdi({ adAccountIds: [ACC1, ACC2], socialProfileIds: [PROFIL] }),
      META,
    );
    expect(r.assignedAccounts).toBe(1);
    expect(r.assignedProfiles).toBe(1);
    expect(r.clientId).toBe(YENI);
  });

  it('kullanıcı oluşturulamazsa müşteri ve atamalar DURUYOR', async () => {
    uyePatlar = true;
    const r = await svc.setup(
      CTX,
      girdi({
        adAccountIds: [ACC1],
        clientUser: { email: 'a@b.com', fullName: 'Müşteri', password: 'uzunParola12' },
      }),
      META,
    );
    expect(r.userCreated).toBe(false);
    expect(r.assignedAccounts).toBe(1);
    expect(r.failures[0]).toMatchObject({ kind: 'user' });
  });
});

describe('MÜŞTERİ HESABI', () => {
  it('KRİTİK: rol SABİT client_viewer — istemciden alınmıyor', async () => {
    /*
     * Bu hesap müşteriye TESLİM EDİLİYOR. Buradan rol seçilebilse müşteriye
     * ajans yetkisi verilebilirdi ve o hesap ajansın bütün müşterilerini
     * görebilirdi.
     */
    await svc.setup(
      CTX,
      girdi({
        clientUser: { email: 'a@b.com', fullName: 'Müşteri', password: 'uzunParola12' },
      }),
      META,
    );
    expect(c.uye[0]).toMatchObject({ role: 'client_viewer', clientId: YENI });
  });

  it('kullanıcı verilmezse oluşturulmuyor', async () => {
    const r = await svc.setup(CTX, girdi(), META);
    expect(r.userCreated).toBe(false);
    expect(c.uye).toHaveLength(0);
  });
});
