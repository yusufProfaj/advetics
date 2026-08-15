import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { LeadsService } from './leads.service';

/**
 * LeadsService — GERÇEK Postgres motoruna (PGlite) karşı.
 *
 * EN KRİTİK İDDİALAR:
 *
 *   1. Mükerrer kayıt SESSİZCE DÜŞÜYOR — webhook ile tarama örtüşüyor ve bu
 *      örtüşme tasarımın parçası; hata üretirse her mutabakat turu kırmızı olur.
 *   2. Toplam AYRI sayılıyor — sayfa boyutu kadar satır dönüp "toplam bu"
 *      demek, 51. kaydın var olmadığını sandırırdı.
 *   3. Durum sayımları DURUM FİLTRESİNDEN bağımsız — aksi hâlde hat rozetleri
 *      seçili durum dışında hep sıfır görünürdü.
 *   4. Mutabakat oranı webhook sağlığını gösteriyor.
 *   5. CSV formül enjeksiyonuna karşı korunuyor.
 */

let h: Harness;
let svc: LeadsService;

const PROFILE = '66666666-6666-6666-6666-666666666666';

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  isOrgAdmin: true,
} as TenantContext;

beforeAll(async () => {
  h = await createHarness();
  svc = new LeadsService(
    {
      withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
    } as unknown as PrismaService,
    // Denetim kaydı ayrı test ediliyor; burada yazma yolunu engellemesin.
    { record: async () => {} } as never,
  );
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await h.q(
    `INSERT INTO social_profiles
       (id, org_id, client_id, connection_id, profile_type, external_id, name, updated_at)
     VALUES ($1, $2, $3, $4, 'facebook_page', 'page-1', 'Örnek Sayfa', now())`,
    [PROFILE, IDS.org, IDS.client, IDS.connection],
  );
});

/** Doğrudan SQL ile kayıt — yazma yolu worker'a ait. */
async function insertLead(over: Record<string, unknown> = {}): Promise<void> {
  const v = {
    externalLeadId: `lead-${Math.round(Math.random() * 1e9)}`,
    fullName: 'Ayşe Yılmaz',
    email: 'ayse@ornek.com',
    phone: '905551112233',
    status: 'new',
    source: 'webhook',
    submittedAt: '2026-08-10T12:00:00Z',
    ...over,
  };
  await h.q(
    `INSERT INTO leads (
       id, org_id, client_id, external_lead_id, social_profile_id,
       full_name, email, phone, fields, status, source, submitted_at, updated_at
     ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, now())
     ON CONFLICT (external_lead_id) DO NOTHING`,
    [
      IDS.org,
      IDS.client,
      v.externalLeadId,
      PROFILE,
      v.fullName,
      v.email,
      v.phone,
      JSON.stringify([{ name: 'full_name', label: 'Ad Soyad', value: v.fullName }]),
      v.status,
      v.source,
      v.submittedAt,
    ],
  );
}

const QUERY = { clientId: IDS.client, limit: 50, offset: 0 } as const;

// -----------------------------------------------------------------------------

describe('mükerrer engeli', () => {
  it('aynı dış kimlik İKİNCİ KEZ yazılmıyor', async () => {
    // Webhook ile tarama aynı kaydı görüyor. Örtüşmeyi ENGELLEMİYORUZ —
    // birinin sessizce ölmesine karşı tek korumamız o.
    await insertLead({ externalLeadId: 'lead-x' });
    await insertLead({ externalLeadId: 'lead-x', source: 'reconcile', fullName: 'Başka' });

    const res = await svc.list(CTX, QUERY);
    expect(res.total).toBe(1);
    // İLK GELEN KAZANIYOR: güncelleme yapmak ajansın girdiği durumu ve notu
    // ezerdi.
    expect(res.rows[0]?.fullName).toBe('Ayşe Yılmaz');
    expect(res.rows[0]?.source).toBe('webhook');
  });

  it('iletişim bilgisi olmayan kayıt veritabanınca reddediliyor', async () => {
    // Üçü de boşsa ulaşılamayan bir kayıt var demektir — çekme çağrısının
    // boş döndüğü ama hatanın yutulduğu durumun imzası.
    await expect(
      h.q(
        `INSERT INTO leads (id, org_id, client_id, external_lead_id, fields, source, submitted_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'bos', '[]'::jsonb, 'webhook', now(), now())`,
        [IDS.org, IDS.client],
      ),
    ).rejects.toThrow();
  });
});

describe('sayfalama ve toplam', () => {
  it('toplam SAYFA BOYUTUNDAN bağımsız', async () => {
    for (let i = 0; i < 7; i++) await insertLead({ externalLeadId: `l-${i}` });

    const res = await svc.list(CTX, { ...QUERY, limit: 3 });
    expect(res.rows).toHaveLength(3);
    // Sessiz kesme yok: kullanıcı 4.–7. kayıtların var olduğunu biliyor.
    expect(res.total).toBe(7);
  });

  it('en yeni kayıt üstte', async () => {
    await insertLead({ externalLeadId: 'eski', submittedAt: '2026-08-01T00:00:00Z' });
    await insertLead({ externalLeadId: 'yeni', submittedAt: '2026-08-11T00:00:00Z' });

    const res = await svc.list(CTX, QUERY);
    expect(res.rows[0]?.externalLeadId).toBe('yeni');
  });
});

describe('durum hattı', () => {
  it('sayımlar DURUM FİLTRESİNDEN bağımsız', async () => {
    await insertLead({ externalLeadId: 'a', status: 'new' });
    await insertLead({ externalLeadId: 'b', status: 'new' });
    await insertLead({ externalLeadId: 'c', status: 'won' });

    const res = await svc.list(CTX, { ...QUERY, status: 'won' });
    expect(res.rows).toHaveLength(1);
    // Rozetler diğer durumları GÖSTERMEYE DEVAM EDİYOR; aksi hâlde hat
    // seçili durum dışında hep sıfır görünürdü.
    expect(res.byStatus.new).toBe(2);
    expect(res.byStatus.won).toBe(1);
  });

  it('her durum anahtarı var — eksik olan sıfır', async () => {
    await insertLead({ externalLeadId: 'a' });
    const res = await svc.list(CTX, QUERY);
    expect(res.byStatus.lost).toBe(0);
    expect(res.byStatus.qualified).toBe(0);
  });

  it('durum güncellenirken NOT KORUNUYOR', async () => {
    await insertLead({ externalLeadId: 'a' });
    const [row] = await svc.list(CTX, QUERY).then((r) => r.rows);

    await svc.update(CTX, row!.id, { status: 'contacted', note: 'Aradım, meşguldü' });
    // Not göndermeden durum ilerletmek notu SİLMEMELİ.
    const after = await svc.update(CTX, row!.id, { status: 'qualified' });
    expect(after.note).toBe('Aradım, meşguldü');
    expect(after.status).toBe('qualified');
  });
});

describe('webhook sağlık göstergesi', () => {
  it('mutabakat oranı hesaplanıyor', async () => {
    // Tarama bir YEDEK yol; her şey düzgünse hiçbir şey bulmaması gerekir.
    // Oran yüksekse webhook o sayfa için sessizce ölmüş demektir.
    await insertLead({ externalLeadId: 'a', source: 'webhook' });
    await insertLead({ externalLeadId: 'b', source: 'reconcile' });
    await insertLead({ externalLeadId: 'c', source: 'reconcile' });

    const res = await svc.list(CTX, QUERY);
    expect(res.reconciledRatio).toBeCloseTo(2 / 3, 5);
  });

  it('kayıt yokken oran sıfır — NaN değil', async () => {
    // Sıfıra bölüm NaN üretirdi ve arayüzde "NaN%" görünürdü.
    const res = await svc.list(CTX, QUERY);
    expect(res.reconciledRatio).toBe(0);
  });
});

describe('filtreler', () => {
  it('arama ad, e-posta ve telefonda çalışıyor', async () => {
    await insertLead({ externalLeadId: 'a', fullName: 'Mehmet Kaya', email: 'm@x.com' });
    await insertLead({ externalLeadId: 'b', fullName: 'Ayşe Yılmaz', email: 'a@y.com' });

    expect((await svc.list(CTX, { ...QUERY, search: 'Mehmet' })).total).toBe(1);
    expect((await svc.list(CTX, { ...QUERY, search: 'a@y' })).total).toBe(1);
    expect((await svc.list(CTX, { ...QUERY, search: '90555' })).total).toBe(2);
  });

  it('bitiş tarihi GÜN SONUNU kapsıyor', async () => {
    // `<= tarih` yazmak o günün 00:00'ından sonrasını dışarıda bırakır ve
    // kullanıcı "bugünü seçtim ama bugünkü kayıtlar yok" der.
    await insertLead({ externalLeadId: 'a', submittedAt: '2026-08-10T23:30:00Z' });
    const res = await svc.list(CTX, { ...QUERY, dateFrom: '2026-08-10', dateTo: '2026-08-10' });
    expect(res.total).toBe(1);
  });
});

describe('CSV dışa aktarma', () => {
  it('BOM ile başlıyor — Excel Türkçe karakterleri bozmasın', async () => {
    await insertLead({ externalLeadId: 'a', fullName: 'Şükrü Çağlar' });
    const csv = await svc.exportCsv(CTX, QUERY);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('Şükrü Çağlar');
  });

  it('FORMÜL ENJEKSİYONU etkisizleştiriliyor', async () => {
    /**
     * Ad alanı reklamla gelen bir yabancının yazdığı metin. Excel `=` ile
     * başlayan hücreyi formül olarak çalıştırıyor ve `=cmd|...` gibi bir ad,
     * dosyayı açan kişinin makinesinde komut çalıştırabiliyor.
     */
    await insertLead({ externalLeadId: 'a', fullName: '=1+1' });
    const csv = await svc.exportCsv(CTX, QUERY);
    expect(csv).toContain(`"'=1+1"`);
    expect(csv).not.toContain('"=1+1"');
  });

  it('tırnak kaçırılıyor', async () => {
    await insertLead({ externalLeadId: 'a', fullName: 'Ali "Reis" Veli' });
    const csv = await svc.exportCsv(CTX, QUERY);
    expect(csv).toContain('"Ali ""Reis"" Veli"');
  });

  it('SAYFA BOYUTUNU AŞAN kayıtların TAMAMI çıkıyor', async () => {
    // Ekranda 50 satır görüp "dışa aktar" diyen kişi 50 satır değil,
    // filtreye uyan her şeyi bekliyor.
    for (let i = 0; i < 205; i++) await insertLead({ externalLeadId: `l-${i}` });
    const csv = await svc.exportCsv(CTX, QUERY);
    // Başlık + 205 satır.
    expect(csv.split('\r\n')).toHaveLength(206);
  });
});
