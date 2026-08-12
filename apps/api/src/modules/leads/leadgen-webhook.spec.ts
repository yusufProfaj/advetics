import { createHmac } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeadgenWebhookService, type LeadgenPayload } from './leadgen-webhook.service';

/**
 * Leadgen webhook testleri.
 *
 * BU UÇ NOKTA OTURUM OLMADAN AÇIK. Tek kimlik doğrulaması imza; imza
 * doğrulaması bozulursa herkes uydurma müşteri kaydı enjekte edebilir ve
 * ajans var olmayan kişileri arar.
 *
 * İkinci kritik iddia: tanınmayan sayfa HATA FIRLATMAMALI. Hata dönmek
 * Meta'ya "tekrar gönder" demek; tekrar da aynı sonucu verir ve sonunda
 * abonelik kapanır — bildirimler sessizce durur.
 */

const SECRET = 'test-app-secret';
const VERIFY = 'test-verify-token';

let svc: LeadgenWebhookService;
const findFirst = vi.fn();
const enqueue = vi.fn();

function sign(body: string): string {
  return 'sha256=' + createHmac('sha256', SECRET).update(Buffer.from(body)).digest('hex');
}

function payload(over: Partial<LeadgenPayload> = {}): LeadgenPayload {
  return {
    object: 'page',
    entry: [
      {
        id: 'page-1',
        changes: [
          {
            field: 'leadgen',
            value: {
              leadgen_id: 'lead-1',
              page_id: 'page-1',
              form_id: 'form-1',
              ad_id: 'ad-1',
              created_time: 1_770_000_000,
            },
          },
        ],
      },
    ],
    ...over,
  };
}

beforeEach(() => {
  findFirst.mockReset();
  enqueue.mockReset();
  findFirst.mockResolvedValue({ id: 'profile-1', clientId: 'client-1' });
  enqueue.mockResolvedValue({ enqueued: true, syncJobId: '1' });

  svc = new LeadgenWebhookService(
    {
      platforms: { meta: { appSecret: SECRET, webhookVerifyToken: VERIFY } },
    } as never,
    { socialProfile: { findFirst } } as never,
    { enqueue } as never,
  );
});

// -----------------------------------------------------------------------------

describe('abonelik el sıkışması', () => {
  it('doğru anahtarla challenge geri dönüyor', () => {
    expect(
      svc.verifySubscription({ mode: 'subscribe', token: VERIFY, challenge: '12345' }),
    ).toBe('12345');
  });

  it('yanlış anahtar reddediliyor', () => {
    expect(() =>
      svc.verifySubscription({ mode: 'subscribe', token: 'yanlis', challenge: 'x' }),
    ).toThrow(UnauthorizedException);
  });

  it('yanlış mod reddediliyor', () => {
    expect(() =>
      svc.verifySubscription({ mode: 'unsubscribe', token: VERIFY, challenge: 'x' }),
    ).toThrow(UnauthorizedException);
  });

  it('anahtar yapılandırılmamışsa GEÇMİYOR, reddediyor', () => {
    // Boş anahtarı "kontrol yok" diye yorumlamak, herkesin uç noktayı kendi
    // uygulamasına bağlayabilmesi demek olurdu.
    const bare = new LeadgenWebhookService(
      { platforms: { meta: { appSecret: SECRET } } } as never,
      {} as never,
      {} as never,
    );
    expect(() =>
      bare.verifySubscription({ mode: 'subscribe', token: '', challenge: 'x' }),
    ).toThrow(UnauthorizedException);
  });
});

describe('imza doğrulaması', () => {
  it('doğru imza geçiyor', () => {
    const body = JSON.stringify(payload());
    expect(() => svc.verifySignature(Buffer.from(body), sign(body))).not.toThrow();
  });

  it('yanlış imza reddediliyor', () => {
    const body = JSON.stringify(payload());
    expect(() => svc.verifySignature(Buffer.from(body), sign('baska-govde'))).toThrow(
      UnauthorizedException,
    );
  });

  it('imza başlığı yoksa reddediliyor', () => {
    expect(() => svc.verifySignature(Buffer.from('{}'), undefined)).toThrow(
      UnauthorizedException,
    );
  });

  it('sha256= öneki olmayan başlık reddediliyor', () => {
    const body = '{}';
    const raw = createHmac('sha256', SECRET).update(body).digest('hex');
    expect(() => svc.verifySignature(Buffer.from(body), raw)).toThrow(UnauthorizedException);
  });

  it('HAM GÖVDE YOKSA reddediliyor — doğrulama atlanmıyor', () => {
    // Ham gövde olmadan imza hesaplanamaz. "Gövde boş, geçelim" demek
    // imzayı isteğe bağlı kılardı ve tek korumamız o.
    expect(() => svc.verifySignature(undefined, sign('{}'))).toThrow(UnauthorizedException);
    expect(() => svc.verifySignature(Buffer.alloc(0), sign(''))).toThrow(UnauthorizedException);
  });

  it('YENİDEN SERİLEŞTİRİLMİŞ gövde imzayı BOZUYOR', () => {
    /**
     * Bu testin varlık sebebi bir tuzağı kilitlemek.
     *
     * `JSON.parse` sonrası `JSON.stringify` etmek boşlukları ve anahtar
     * sırasını değiştiriyor; imza tutmuyor ve "webhook hiç çalışmıyor" diye
     * saatler harcanıyor. Ham gövdenin şart olduğunun kanıtı.
     */
    const original = '{"object":"page", "entry":[]}'; // boşluklu
    const reserialized = JSON.stringify(JSON.parse(original));
    expect(reserialized).not.toBe(original);
    expect(() => svc.verifySignature(Buffer.from(reserialized), sign(original))).toThrow(
      UnauthorizedException,
    );
  });
});

describe('bildirim işleme', () => {
  it('kayıt kuyruğa alınıyor — GRAPH ÇAĞRISI YOK', async () => {
    const res = await svc.handle(payload());
    expect(res.queued).toBe(1);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: 'lead_fetch',
        externalLeadId: 'lead-1',
        socialProfileId: 'profile-1',
        clientId: 'client-1',
      }),
    );
  });

  it('tanınmayan sayfa ATLANIYOR, hata FIRLATMIYOR', async () => {
    // Hata dönmek Meta'ya "tekrar gönder" demek; tekrar da aynı sonucu verir
    // ve sonunda abonelik kapanır.
    findFirst.mockResolvedValue(null);
    const res = await svc.handle(payload());
    expect(res.queued).toBe(0);
    expect(res.skipped).toBe(1);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('leadgen_id olmayan değişiklik atlanıyor', async () => {
    const res = await svc.handle({
      entry: [{ id: 'page-1', changes: [{ field: 'feed', value: {} }] }],
    });
    expect(res.queued).toBe(0);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('tek istekte birden çok kayıt — HEPSİ kuyruğa giriyor', async () => {
    // Aynı sayfadan saniyeler içinde birden çok kayıt gelebiliyor. İş kimliği
    // lead kimliğini taşımasaydı hepsi tek kimliğe düşer ve BullMQ'nun
    // mükerrer engeli fazlasını SESSİZCE atardı.
    const res = await svc.handle({
      entry: [
        {
          id: 'page-1',
          changes: [
            { value: { leadgen_id: 'lead-1', page_id: 'page-1' } },
            { value: { leadgen_id: 'lead-2', page_id: 'page-1' } },
            { value: { leadgen_id: 'lead-3', page_id: 'page-1' } },
          ],
        },
      ],
    });
    expect(res.queued).toBe(3);
    expect(enqueue).toHaveBeenCalledTimes(3);
    const ids = enqueue.mock.calls.map((c) => (c[0] as { externalLeadId: string }).externalLeadId);
    expect(new Set(ids).size).toBe(3);
  });

  it('page_id yoksa entry.id kullanılıyor', async () => {
    // Meta bazı sürümlerde `page_id` göndermiyor; sayfa `entry.id` içinde.
    // Bunu karşılamamak, o isteklerin tamamının sessizce atlanması demek.
    await svc.handle({
      entry: [{ id: 'page-9', changes: [{ value: { leadgen_id: 'lead-9' } }] }],
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ externalId: 'page-9' }) }),
    );
  });
});
