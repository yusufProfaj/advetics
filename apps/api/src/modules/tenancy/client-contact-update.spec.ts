import { beforeEach, describe, expect, it } from 'vitest';
import type { TenantContext, UpdateClientInput } from '@advetics/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { ClientsService } from './clients.service';

/**
 * ═══ İLETİŞİM ALANLARI SESSİZCE DÜŞÜYORDU ═══
 *
 * Şema bunları KABUL EDİYOR, `GET /clients/:id` DÖNDÜRÜYOR — ama `update()`
 * hiçbirini yazmıyordu. Panelden gönderilen iletişim bilgisi 200 dönüp
 * kayboluyor, kullanıcı kaydettiğini sanıyordu. Alanların tek giriş noktası
 * "Yeni müşteri" sihirbazıydı; müşteri açıldıktan sonra iletişim bilgisi HİÇ
 * düzenlenemiyordu.
 *
 * `contact_email` rapor gönderiminin okuyacağı alan — bu boşluk kapanmadan
 * mail gönderimi kurulamıyordu.
 *
 * Veritabanına gitmiyor: sınanan şey UPDATE'e HANGİ ALANLARIN geçtiği.
 */
const CTX: TenantContext = {
  orgId: '11111111-1111-1111-1111-111111111111',
  userId: '22222222-2222-2222-2222-222222222222',
  clientIds: ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'],
  activeClientId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  isOrgAdmin: true,
} as TenantContext;

const META = { ip: null, userAgent: null, requestId: 'test' };

let yazilan: Record<string, unknown> | null = null;
let svc: ClientsService;

beforeEach(() => {
  yazilan = null;
  const tx = {
    client: {
      findUnique: async () => ({ id: 'c1', name: 'Eski', timezone: 'Europe/Istanbul' }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        yazilan = data;
        return { id: 'c1', ...data };
      },
    },
  };
  const prisma = {
    withTenant: async <T>(_c: TenantContext, fn: (t: unknown) => Promise<T>) => fn(tx),
  } as unknown as PrismaService;
  svc = new ClientsService(prisma, { record: async () => undefined } as unknown as AuditService);
});

describe('müşteri iletişim bilgisi güncelleme', () => {
  it('KRİTİK: iletişim alanları UPDATE’e geçiyor', async () => {
    await svc.update(
      CTX,
      'c1',
      {
        contactName: 'Ayşe Yılmaz',
        contactEmails: ['ayse@musteri.com'],
        contactPhone: '+90 555 111 22 33',
      } as UpdateClientInput,
      META,
    );
    expect(yazilan).toMatchObject({
      contactName: 'Ayşe Yılmaz',
      contactEmails: ['ayse@musteri.com'],
      contactPhone: '+90 555 111 22 33',
    });
  });

  it('KRİTİK: `contact_emails` rapor gönderiminin alanı — yazılmazsa mail atılamaz', async () => {
    await svc.update(
      CTX,
      'c1',
      { contactEmails: ['rapor@musteri.com'] } as UpdateClientInput,
      META,
    );
    expect(yazilan!.contactEmails).toEqual(['rapor@musteri.com']);
  });

  it('KRİTİK: BİRDEN ÇOK alıcı yazılıyor — liste kırpılmıyor', async () => {
    /*
     * Alanın çoğullaşmasının tek sebebi bu: müşteride birden çok yetkilinin
     * rapor alması kural, istisna değil. Servis listeyi ilk elemana indirseydi
     * kalan alıcılar SESSİZCE düşerdi ve bunu ancak "bana rapor gelmiyor"
     * diyen kişi fark ederdi.
     */
    await svc.update(
      CTX,
      'c1',
      { contactEmails: ['a@x.com', 'b@x.com', 'c@x.com'] } as UpdateClientInput,
      META,
    );
    expect(yazilan!.contactEmails).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
  });

  it('faturalama alanları da yazılıyor', async () => {
    await svc.update(
      CTX,
      'c1',
      {
        website: 'https://musteri.com',
        address: 'İzmir',
        taxOffice: 'Bornova',
        taxNumber: '1234567890',
        iban: 'TR000000000000000000000000',
        notes: 'Aylık rapor 1’inde gidiyor.',
      } as UpdateClientInput,
      META,
    );
    expect(Object.keys(yazilan!)).toEqual(
      expect.arrayContaining(['website', 'address', 'taxOffice', 'taxNumber', 'iban', 'notes']),
    );
  });

  it('KRİTİK: BOŞ DİZİ geçerli bir değer — listeyi temizlemek de bir düzenleme', async () => {
    /*
     * `??` ile yazılsaydı temizleme çalışmaz, kullanıcı yanlış bir adresi
     * silemezdi ve rapor oraya gitmeye devam ederdi.
     *
     * LİSTEDE `null` YOK, BOŞ DİZİ VAR: "temizlendi" ile "hiç girilmedi"
     * aynı şeyi anlatıyor ve iki hâli ayırt etmek hiçbir soruyu
     * cevaplamıyordu.
     */
    await svc.update(CTX, 'c1', { contactEmails: [] } as UpdateClientInput, META);
    expect(yazilan).toHaveProperty('contactEmails', []);
  });

  it('GÖNDERİLMEYEN alan UPDATE’e GİRMİYOR — kısmi güncelleme diğerlerini silmemeli', async () => {
    await svc.update(CTX, 'c1', { contactEmails: ['a@b.com'] } as UpdateClientInput, META);
    expect(yazilan).not.toHaveProperty('contactName');
    expect(yazilan).not.toHaveProperty('iban');
  });
});
