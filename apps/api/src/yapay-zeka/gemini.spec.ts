import { describe, expect, it } from 'vitest';
import { GeminiIstemcisi, YapayZekaHatasi, metinIste, sonucCoz } from './gemini';

/**
 * Gemini istemcisi: istek biçimi, akış ayrıştırma, bitiş sebepleri, token
 * hesabı. Anahtar ADRESTE DEĞİL başlıkta gitmeli; parçalar dönüştürülmeden
 * dönmeli (düşünce imzaları).
 */

type Kayit = { adres: string; basliklar: Record<string, string>; govde: Record<string, unknown> };

function sahteFetch(cevap: (k: Kayit) => Response) {
  const kayitlar: Kayit[] = [];
  const fn = (async (adres: string, init: RequestInit) => {
    const k = { adres: String(adres), basliklar: init.headers as Record<string, string>, govde: JSON.parse(String(init.body)) };
    kayitlar.push(k);
    return cevap(k);
  }) as unknown as typeof fetch;
  return { fn, kayitlar };
}

const sse = (...olaylar: unknown[]) =>
  new Response(
    new ReadableStream({
      start(c) {
        // Bilerek olay ortasından bölünmüş ve CRLF ile.
        const metin = olaylar.map((o) => `data: ${JSON.stringify(o)}\r\n\r\n`).join('');
        const orta = Math.floor(metin.length / 2);
        c.enqueue(new TextEncoder().encode(metin.slice(0, orta)));
        c.enqueue(new TextEncoder().encode(metin.slice(orta)));
        c.close();
      },
    }),
    { status: 200 },
  );

describe('istek', () => {
  it('KRİTİK: anahtar başlıkta, adreste YOK; model adı adreste; düşünme düzeyi açıkça yazılı', async () => {
    const f = sahteFetch(() => Response.json({ candidates: [{ content: { parts: [{ text: 'merhaba' }] }, finishReason: 'STOP' }] }));
    const g = new GeminiIstemcisi({ apiKey: 'GIZLI', model: 'gemini-3.8-flash', fetchFn: f.fn });
    await g.uret({ sistem: 's', mesajlar: [{ role: 'user', parts: [{ text: 'a' }] }], enCokCikti: 100 });
    const k = f.kayitlar[0]!;
    expect(k.adres).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
    expect(k.adres).not.toContain('GIZLI');
    expect(k.basliklar['x-goog-api-key']).toBe('GIZLI');
    expect(k.govde.generationConfig).toMatchObject({ maxOutputTokens: 100, thinkingConfig: { thinkingLevel: 'medium' } });
    expect(k.govde.systemInstruction).toEqual({ parts: [{ text: 's' }] });
  });

  it('araç tanımları functionDeclarations altında; JSON şeması verilirse JSON çıktı istenir', async () => {
    const f = sahteFetch(() => Response.json({ candidates: [{ content: { parts: [{ text: '{}' }] }, finishReason: 'STOP' }] }));
    const g = new GeminiIstemcisi({ apiKey: 'k', model: 'm', fetchFn: f.fn });
    await g.uret({ sistem: 's', mesajlar: [], enCokCikti: 1, araclar: [{ name: 'x', description: 'd', parametersJsonSchema: { type: 'object' } }], jsonSemasi: { type: 'object' } });
    expect(f.kayitlar[0]!.govde.tools).toEqual([{ functionDeclarations: [{ name: 'x', description: 'd', parametersJsonSchema: { type: 'object' } }] }]);
    expect(f.kayitlar[0]!.govde.generationConfig).toMatchObject({ responseMimeType: 'application/json', responseJsonSchema: { type: 'object' } });
  });

  it('KRİTİK: HTTP hatası Gemini’nin mesajıyla ve durum koduyla fırlar (yutulmaz)', async () => {
    const f = sahteFetch(() => Response.json({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' } }, { status: 429 }));
    const g = new GeminiIstemcisi({ apiKey: 'k', model: 'm', fetchFn: f.fn });
    const h = await g.uret({ sistem: 's', mesajlar: [], enCokCikti: 1 }).catch((e) => e);
    expect(h).toBeInstanceOf(YapayZekaHatasi);
    expect(h).toMatchObject({ durum: 429 });
    expect(h.message).toContain('Quota exceeded');
  });
});

describe('akış', () => {
  it('KRİTİK: bölünmüş olaylar birleşir; metin parçaları sırayla; araç çağrısı ve imza tam hâliyle döner', async () => {
    const f = sahteFetch(() =>
      sse(
        { candidates: [{ content: { parts: [{ text: 'Mer' }] } }] },
        { candidates: [{ content: { parts: [{ text: 'haba', thought: false }] } }] },
        { candidates: [{ content: { parts: [{ text: 'gizli düşünce', thought: true }] } }] },
        {
          candidates: [{ content: { parts: [{ functionCall: { id: 'c1', name: 'konum_ara', args: { metin: 'İzmir' } }, thoughtSignature: 'IMZA' }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 100, cachedContentTokenCount: 40, candidatesTokenCount: 10, thoughtsTokenCount: 5 },
        },
      ),
    );
    const g = new GeminiIstemcisi({ apiKey: 'k', model: 'm', fetchFn: f.fn });
    const gelen: string[] = [];
    const r = await g.akis({ sistem: 's', mesajlar: [], enCokCikti: 10 }, (p) => gelen.push(p));
    expect(f.kayitlar[0]!.adres).toContain(':streamGenerateContent?alt=sse');
    // Düşünce metni ekrana gitmez.
    expect(gelen).toEqual(['Mer', 'haba']);
    expect(r.sebep).toBe('arac');
    expect(r.parcalar.at(-1)).toEqual({ functionCall: { id: 'c1', name: 'konum_ara', args: { metin: 'İzmir' } }, thoughtSignature: 'IMZA' });
    // Girdi önbellek dışı; düşünme çıktıya dahil.
    expect(r).toMatchObject({ girdiToken: 60, onbellekToken: 40, ciktiToken: 15 });
  });
});

describe('bitiş sebepleri', () => {
  const c = (o: Record<string, unknown>) => sonucCoz([o as never]);
  it('ret, kesilme, boş ve bitti AYRI', () => {
    expect(c({ promptFeedback: { blockReason: 'SAFETY' } }).sebep).toBe('ret');
    expect(c({ candidates: [{ content: { parts: [] }, finishReason: 'PROHIBITED_CONTENT' }] }).sebep).toBe('ret');
    expect(c({ candidates: [{ content: { parts: [{ text: 'yarı' }] }, finishReason: 'MAX_TOKENS' }] }).sebep).toBe('kesildi');
    expect(c({ candidates: [{ content: { parts: [{ text: '  ' }] }, finishReason: 'STOP' }] }).sebep).toBe('bos');
    expect(c({ candidates: [{ content: { parts: [{ text: 'düşünce', thought: true }] }, finishReason: 'STOP' }] }).sebep).toBe('bos');
    expect(c({ candidates: [{ content: { parts: [{ text: 'tamam' }] }, finishReason: 'STOP' }] }).sebep).toBe('bitti');
  });

  it('metinIste: ret ve boş cevap ayrı mesajla döner', async () => {
    const u = (sebep: 'ret' | 'bos' | 'bitti', text = '') => ({
      model: 'm',
      uret: async () => ({ parcalar: [{ text }], sebep, aciklama: sebep === 'ret' ? 'Gemini cevabı engelledi (SAFETY).' : null, girdiToken: 0, ciktiToken: 0, onbellekToken: 0 }),
    });
    expect(await metinIste(u('ret'), { sistem: 's', metin: 'm', enCokCikti: 1 })).toEqual({ tur: 'ret', mesaj: 'Gemini cevabı engelledi (SAFETY).' });
    expect((await metinIste(u('bos'), { sistem: 's', metin: 'm', enCokCikti: 1 })).tur).toBe('bos');
    expect(await metinIste(u('bitti', 'ok'), { sistem: 's', metin: 'm', enCokCikti: 1 })).toEqual({ tur: 'tamam', metin: 'ok' });
  });
});
