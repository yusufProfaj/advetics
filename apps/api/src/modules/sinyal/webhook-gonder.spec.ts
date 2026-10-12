import { describe, expect, it, vi } from 'vitest';
import { webhookGonder, WEBHOOK_GOVDE_EN_COK, type WebhookBagimliliklari } from './webhook-gonder';

/**
 * DIŞ İSTEK GÜVENLİĞİ (MIMARI § 8). İddialar SEBEBE çapalı: "reddedildi"
 * demek yetmiyor, neden reddedildiği ve isteğin HİÇ atılmadığı da sınanıyor
 * (`kreatif-gorseli.spec.ts` dersi: IP kontrolü silinince de geçen test).
 */

const SLACK = 'https://hooks.slack.com/services/T000/B000/XXXX';

function bag(adresler: string[], cevap: () => Promise<Response> = async () => new Response('ok', { status: 200 })) {
  const fetchMock = vi.fn(cevap);
  const b: WebhookBagimliliklari = {
    lookup: async () => adresler.map((address) => ({ address, family: 4 })),
    fetch: fetchMock as unknown as typeof fetch,
  };
  return { b, fetchMock };
}

describe('webhook gönderimi', () => {
  it('beyaz listedeki adres gönderiliyor; yönlendirme izlenmiyor ve zaman aşımı sinyali var', async () => {
    const { b, fetchMock } = bag(['3.3.3.3']);
    const r = await webhookGonder('slack', SLACK, { text: 'x' }, b);
    expect(r).toEqual({ httpDurum: 200, reddedildi: false, hata: null });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.redirect).toBe('manual');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('KRİTİK: iç ağa çözülen ad REDDEDİLİYOR ve istek HİÇ atılmıyor (bulut metadata)', async () => {
    const { b, fetchMock } = bag(['3.3.3.3', '169.254.169.254']);
    const r = await webhookGonder('slack', SLACK, { text: 'x' }, b);
    expect(r.reddedildi).toBe(true);
    expect(r.hata).toMatch(/iç ağa/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('KRİTİK: 3xx yönlendirme KALICI hata, izlenmiyor', async () => {
    const { b, fetchMock } = bag(['3.3.3.3'], async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }));
    const r = await webhookGonder('teams', 'https://x.webhook.office.com/abc', {}, b);
    expect(r).toMatchObject({ httpDurum: 302, reddedildi: true });
    expect(r.hata).toMatch(/yönlendirme/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('beyaz liste dışı adres DNS bile çözülmeden reddediliyor (endsWith, includes değil)', async () => {
    const lookup = vi.fn(async () => [{ address: '3.3.3.3', family: 4 }]);
    const fetchMock = vi.fn();
    const r = await webhookGonder('teams', 'https://x.webhook.office.com.evil.com/a', {}, {
      lookup,
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(r.reddedildi).toBe(true);
    expect(r.hata).toMatch(/webhook\.office\.com/);
    expect(lookup).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('platformun hata gövdesi aynen dönüyor (Slack 404 no_service)', async () => {
    const { b } = bag(['3.3.3.3'], async () => new Response('no_service', { status: 404 }));
    expect(await webhookGonder('slack', SLACK, {}, b)).toEqual({ httpDurum: 404, reddedildi: false, hata: 'no_service' });
  });

  it('ağ hatası GEÇİCİ (httpDurum null, reddedildi false)', async () => {
    const { b } = bag(['3.3.3.3'], async () => {
      throw new Error('ECONNRESET');
    });
    const r = await webhookGonder('slack', SLACK, {}, b);
    expect(r).toMatchObject({ httpDurum: null, reddedildi: false });
    expect(r.hata).toContain('ECONNRESET');
  });

  it('gövde sınırı aşılırsa gönderilmiyor', async () => {
    const { b, fetchMock } = bag(['3.3.3.3']);
    const r = await webhookGonder('slack', SLACK, { text: 'x'.repeat(WEBHOOK_GOVDE_EN_COK + 1) }, b);
    expect(r.reddedildi).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
