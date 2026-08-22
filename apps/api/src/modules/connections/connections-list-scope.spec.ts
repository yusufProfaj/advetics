import { beforeEach, describe, expect, it } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import { ConnectionsService } from './connections.service';

/**
 * BAĞLANTI LİSTESİNİN KAPSAMI — hangi bağlam, hangi süzgeç.
 *
 * Bu paket veritabanına gitmiyor ve gitmemeli: sınanan şey KARARIN kendisi —
 * hangi `activeClientId` ile bağlam kuruluyor ve sorguya hangi süzgeç
 * konuyor. Prisma'nın `select` semantiğini taklit etmek, taklidi test etmek
 * olurdu.
 *
 * Karar üç yerde birden sessiz hata üretebiliyor:
 *
 *   1. Platform Bağlantıları ekranı (parametresiz) bir müşteri seçiliyken
 *      HAVUZU göremezse atama ekranı hesapların bir kısmını hiç göstermez.
 *   2. `?clientId=X` çağrısı, oturumda başka müşteri seçiliyken RLS yüzünden
 *      BOŞ döner — ekran "hesap yok" der, sebebi hiçbir yerde yazmaz.
 *   3. Süzgeç sosyal profillere uygulanmazsa, bağlantı org geneline çıktığı
 *      için formlar ekranı BAŞKA müşterilerin Facebook sayfalarını listeler.
 */
const ORG = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const CLIENT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLIENT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const CTX: TenantContext = {
  orgId: ORG,
  userId: USER,
  clientIds: [CLIENT_A, CLIENT_B],
  // Oturumda A SEÇİLİ — bütün tuzakların kaynağı bu.
  activeClientId: CLIENT_A,
  isOrgAdmin: true,
} as TenantContext;

interface FindManyArgs {
  select: {
    adAccounts: { where?: { clientId?: string } };
    socialProfiles: { where?: { clientId?: string } };
  };
}

let seenContext: TenantContext | null = null;
let seenArgs: FindManyArgs | null = null;
let svc: ConnectionsService;

beforeEach(() => {
  seenContext = null;
  seenArgs = null;

  const tx = {
    platformConnection: {
      findMany: async (args: FindManyArgs) => {
        seenArgs = args;
        return [];
      },
    },
  };

  const prisma = {
    withTenant: async <T>(ctx: TenantContext, fn: (t: unknown) => Promise<T>) => {
      seenContext = ctx;
      return fn(tx);
    },
  } as unknown as PrismaService;

  svc = new ConnectionsService(
    prisma,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
      // KUYRUK — yalnızca `ilkVeriCekimi` kullanıyor ve bu testlerde o yol
    // koşmuyor. Çağrılırsa SESSİZCE geçmesin diye fırlatan bir yerine koyma.
    { enqueue: () => { throw new Error('kuyruk bu testte beklenmiyor'); } } as never,
  );
});

describe('list — kapsam', () => {
  it('PARAMETRESİZ çağrı seçim daraltmasını KAPATIYOR', async () => {
    // Aksi hâlde A seçiliyken B'ye atanmış hesaplar RLS tarafından gizlenir ve
    // atama ekranı eksik bir liste gösterir.
    await svc.list(CTX, null);

    expect(seenContext!.activeClientId).toBeNull();
    expect(seenArgs!.select.adAccounts.where).toBeUndefined();
    expect(seenArgs!.select.socialProfiles.where).toBeUndefined();
  });

  it('AÇIK clientId, oturumdaki seçimi EZİYOR', async () => {
    // Kurallar ekranı adres çubuğundan gelen müşteriyle çalışıyor; oturumdaki
    // seçim başka bir müşteri olabilir. Bağlam isteğin kendisinden kurulmazsa
    // RLS istenen müşterinin satırlarını gizler.
    await svc.list(CTX, CLIENT_B);

    expect(seenContext!.activeClientId).toBe(CLIENT_B);
    expect(seenArgs!.select.adAccounts.where).toEqual({ clientId: CLIENT_B });
  });

  it('SOSYAL PROFİLLER de süzülüyor', async () => {
    // Bağlantı org geneline çıkınca "bağlantı müşteriye ait" örtük daraltması
    // kayboldu; süzgeç olmadan formlar ekranı başka müşterilerin sayfalarını
    // listeler.
    await svc.list(CTX, CLIENT_B);
    expect(seenArgs!.select.socialProfiles.where).toEqual({ clientId: CLIENT_B });
  });

  it('ERİŞİLEMEYEN müşteri için sorgu HİÇ çalışmıyor', async () => {
    // Yetki kontrolü RLS'e bırakılsaydı sonuç boş bir liste olurdu ve
    // "erişimin yok" ile "hesap yok" ayırt edilemezdi.
    await expect(svc.list(CTX, 'ffffffff-ffff-ffff-ffff-ffffffffffff')).rejects.toThrow(
      /Müşteri bulunamadı/,
    );
    expect(seenArgs).toBeNull();
  });

  it('MÜŞTERİ SEÇİLMEDEN de çalışıyor — bağlantı ajansa ait', async () => {
    // Eskiden bu çağrı "Bağlantılar müşteri bazlıdır. Önce bir müşteri seçin."
    // ile düşüyordu ve o model bağlantıların kopmasının sebebiydi.
    const withoutSelection = { ...CTX, activeClientId: null };
    await expect(svc.list(withoutSelection, null)).resolves.toEqual([]);
  });
});
