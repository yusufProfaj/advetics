import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ClientProfileService } from './client-profile.service';

/**
 * `ClientProfileService` — GERÇEK Postgres motoruna (PGlite) karşı.
 *
 * EN KRİTİK İDDİA: kısmi güncelleme. `UpsertClientProfileInput`teki bir alan
 * `undefined` ise (istekte hiç gönderilmemiş) o alana DOKUNULMUYOR; `null`
 * ise BİLEREK temizleniyor. İkisini karıştırmak — `BrandingService`'in de
 * uyduğu kural — "sadece hedef kitleyi güncelle" isteğinin marka bilgilerini
 * sessizce silmesi demek olurdu.
 */

let h: Harness;
let svc: ClientProfileService;

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  isOrgAdmin: true,
} as TenantContext;

beforeAll(async () => {
  h = await createHarness();
  const prisma = {
    withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
  } as unknown as PrismaService;
  svc = new ClientProfileService(prisma, new AuditService({} as never));
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
});

/** Başka bir müşteri — "logo başkasının varlığı olamaz" iddiası için. */
const CLIENT_OTHER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ASSET_OWN = 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1';
const ASSET_OTHER = 'e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2';

async function seedLogolar(): Promise<void> {
  await h.q(
    `INSERT INTO clients (id, org_id, name, slug, updated_at)
     VALUES ($1, $2, 'Başka Müşteri', 'baska-musteri', now())`,
    [CLIENT_OTHER, IDS.org],
  );
  await h.q(
    `INSERT INTO assets
       (id, org_id, client_id, kind, name, file_name, mime_type, byte_size,
        width, height, storage_key, content_hash, updated_at)
     VALUES ($1, $3, $4, 'logo', 'Kendi logosu', 'a.png', 'image/png', 10, 1, 1, 'k/a', $6, now()),
            ($2, $3, $5, 'logo', 'Başkasının logosu', 'b.png', 'image/png', 10, 1, 1, 'k/b', $7, now())`,
    // `assets_hash_chk` en az 16 karakter dayatıyor — kısa bir yer tutucu
    // fixture'ı check constraint'e takıyor ve hata testin konusuyla hiç
    // ilgisiz görünüyor.
    [ASSET_OWN, ASSET_OTHER, IDS.org, IDS.client, CLIENT_OTHER, 'a'.repeat(64), 'b'.repeat(64)],
  );
}

describe('get', () => {
  it('profil hiç kurulmamışsa BOŞ kayıt döner, hata fırlatmaz', async () => {
    const result = await svc.get(CTX, IDS.client);
    expect(result).toEqual({
      id: '',
      clientId: IDS.client,
      hedefKitle: null,
      markaBilgileri: null,
      bilgiBankasi: null,
      logoAssetId: null,
      updatedAt: '',
    });
  });
});

describe('upsert', () => {
  it('yeni profil oluşturuluyor ve audit_logs\'a yazılıyor', async () => {
    const result = await svc.upsert(
      CTX,
      { clientId: IDS.client, hedefKitle: '25-45 yaş, İzmir', markaBilgileri: null, logoAssetId: null },
      {},
    );

    expect(result.hedefKitle).toBe('25-45 yaş, İzmir');
    expect(result.id).not.toBe('');

    const logs = await h.q<{ action: string; target_type: string }>(
      `SELECT action, target_type FROM audit_logs`,
    );
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: 'client_profile.updated', target_type: 'client_profile' });
  });

  it('KRİTİK: undefined alan DOKUNULMADAN kalıyor, null alan TEMİZLENİYOR', async () => {
    await svc.upsert(
      CTX,
      { clientId: IDS.client, hedefKitle: 'İlk hedef kitle', markaBilgileri: 'İlk marka notu' },
      {},
    );

    // İkinci çağrıda yalnızca hedefKitle gönderiliyor (markaBilgileri hiç
    // yazılmıyor — undefined). markaBilgileri AYNEN kalmalı.
    const afterPartial = await svc.upsert(CTX, { clientId: IDS.client, hedefKitle: 'Güncellendi' }, {});
    expect(afterPartial.hedefKitle).toBe('Güncellendi');
    expect(afterPartial.markaBilgileri).toBe('İlk marka notu');

    // Üçüncü çağrıda markaBilgileri AÇIKÇA null gönderiliyor — bu kez silinmeli.
    const afterNull = await svc.upsert(CTX, { clientId: IDS.client, markaBilgileri: null }, {});
    expect(afterNull.markaBilgileri).toBeNull();
    expect(afterNull.hedefKitle).toBe('Güncellendi'); // dokunulmadı
  });

  it('KRİTİK: bilgiBankasi da aynı kısmi güncelleme desenine uyuyor', async () => {
    // BİLGİ BANKASI `clients.notes` DEĞİL — o alan ajans içi ("ekip içi") ve
    // `client.read` yetkisiyle müşterinin kendi hesabına da açık. Sekmenin
    // metni müşteri profilinin parçası olarak BURADA saklanıyor; alanın
    // varlığı kadar diğer alanlarla aynı desende davranması da gerekiyor,
    // yoksa "sadece bilgi bankasını güncelle" isteği hedef kitleyi silerdi.
    const ilk = await svc.upsert(
      CTX,
      { clientId: IDS.client, hedefKitle: 'H', bilgiBankasi: 'Sık sorulan sorular' },
      {},
    );
    expect(ilk.bilgiBankasi).toBe('Sık sorulan sorular');

    // undefined — dokunulmamalı.
    const kismi = await svc.upsert(CTX, { clientId: IDS.client, hedefKitle: 'H2' }, {});
    expect(kismi.bilgiBankasi).toBe('Sık sorulan sorular');

    // null — temizlenmeli, hedefKitle'ye dokunulmadan.
    const temiz = await svc.upsert(CTX, { clientId: IDS.client, bilgiBankasi: null }, {});
    expect(temiz.bilgiBankasi).toBeNull();
    expect(temiz.hedefKitle).toBe('H2');

    // Kolon GERÇEKTEN yazılıyor mu — servis dönüşü değil, veritabanı satırı.
    await svc.upsert(CTX, { clientId: IDS.client, bilgiBankasi: 'Diskte' }, {});
    const rows = await h.q<{ bilgi_bankasi: string }>(
      `SELECT bilgi_bankasi FROM client_profiles WHERE client_id = $1`,
      [IDS.client],
    );
    expect(rows[0]?.bilgi_bankasi).toBe('Diskte');
  });

  it('var olan profil GÜNCELLENİYOR, ikinci bir satır açılmıyor', async () => {
    const first = await svc.upsert(CTX, { clientId: IDS.client, hedefKitle: 'A' }, {});
    const second = await svc.upsert(CTX, { clientId: IDS.client, hedefKitle: 'B' }, {});

    expect(second.id).toBe(first.id);
    const rows = await h.q(`SELECT id FROM client_profiles WHERE client_id = $1`, [IDS.client]);
    expect(rows).toHaveLength(1);
  });

  it('bulunamayan müşteri için reddediliyor', async () => {
    await expect(
      svc.upsert(CTX, { clientId: '00000000-0000-0000-0000-000000000000', hedefKitle: 'x' }, {}),
    ).rejects.toThrow(/bulunamadı/i);
  });
});

/**
 * LOGO KİRACILIK DOĞRULAMASI — gerçek veritabanına karşı.
 *
 * `logoAssetId` gövdeden geliyor ve Zod yalnızca BİÇİMİNE bakıyor; migration
 * yabancı anahtarı da "böyle bir varlık var" diyor, "bu müşterinin" demiyor.
 * Kontrol olmadan başka bir müşterinin varlık kimliği profile YAZILIYOR ve
 * hiçbir katman itiraz etmiyor.
 */
describe('upsert — logo varlığı MÜŞTERİYE ait olmak zorunda', () => {
  beforeEach(seedLogolar);

  it('KRİTİK: BAŞKA MÜŞTERİNİN varlığı REDDEDİLİYOR ve satır YAZILMIYOR', async () => {
    await expect(
      svc.upsert(CTX, { clientId: IDS.client, logoAssetId: ASSET_OTHER }, {}),
    ).rejects.toThrow(/görsel arşivinde bulunamadı/i);

    // Reddin yarım bir kayıt bırakmadığı ayrıca kanıtlanıyor: kontrol
    // yazmadan ÖNCE koşmazsa profil satırı açılmış olurdu.
    const rows = await h.q(`SELECT id FROM client_profiles WHERE client_id = $1`, [IDS.client]);
    expect(rows).toHaveLength(0);
  });

  it('KENDİ müşterisinin varlığı KABUL EDİLİYOR', async () => {
    const saved = await svc.upsert(CTX, { clientId: IDS.client, logoAssetId: ASSET_OWN }, {});
    expect(saved.logoAssetId).toBe(ASSET_OWN);
  });

  it('HİÇ VAR OLMAYAN varlık kimliği de reddediliyor', async () => {
    await expect(
      svc.upsert(
        CTX,
        { clientId: IDS.client, logoAssetId: '99999999-9999-9999-9999-999999999999' },
        {},
      ),
    ).rejects.toThrow(/görsel arşivinde bulunamadı/i);
  });

  it('null LOGO KALDIRMA — kontrol devreye girmiyor', async () => {
    // Kontrolü `!== undefined` ile yazmak burayı kırardı: logoyu kaldırmak
    // meşru bir işlem ve `null` hiçbir varlığa eşleşmediği için her seferinde
    // reddedilirdi.
    await svc.upsert(CTX, { clientId: IDS.client, logoAssetId: ASSET_OWN }, {});
    const temiz = await svc.upsert(CTX, { clientId: IDS.client, logoAssetId: null }, {});
    expect(temiz.logoAssetId).toBeNull();
  });
});
