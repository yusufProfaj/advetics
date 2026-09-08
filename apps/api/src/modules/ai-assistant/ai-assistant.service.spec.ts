import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ClientsService } from '../tenancy/clients.service';
import type { ConnectionsService } from '../connections/connections.service';
import type { DraftTreeService } from '../draft-tree/draft-tree.service';
import type { CreativeService } from '../draft-tree/creative.service';
import type { CampaignActionsService } from '../campaign-actions/campaign-actions.service';
import { AiAssistantService, type AnthropicLike } from './ai-assistant.service';
import { buildTools } from './tools';
import type { ToolResult } from './tool-types';

/**
 * `AiAssistantService` — ORKESTRASYON katmanı test ediliyor, tool'ların
 * kendi iş mantığı DEĞİL (o zaten `draft-tree`/`campaign-actions` kendi
 * PGlite paketlerinde sınanıyor — burada ikinci kez sınamak taklidi test
 * etmek olurdu, bkz. `clients-list-scope.spec.ts`).
 *
 * EN KRİTİK İDDİALAR:
 *   1. `status: 'success'` GÖRMEDEN Claude'a başarı SÖYLETİLMİYOR — bu
 *      testte doğrudan sınanamıyor (LLM'in kendisi yok) ama tool sonucunun
 *      HAM olarak, yorumlanmadan mesaj geçmişine yazıldığı sınanıyor.
 *   2. Onay kartı TEK KULLANIMLIK — aynı confirmationId ikinci kez
 *      platforma HİÇ dokunmuyor.
 *   3. Yetkisiz bir tool çağrısı SERVİSE hiç ulaşmıyor.
 *   4. Kaçak tool döngüsü MAX_TOOL_TURNS'te duruyor.
 */

const CTX: TenantContext = {
  orgId: 'org-1',
  userId: 'user-1',
  clientIds: ['client-1'],
  isOrgAdmin: true,
  permissions: ['bulk.read', 'bulk.write', 'client.read', 'connection.read', 'budget.write'],
} as TenantContext;

function pick<T extends Record<string, unknown>>(obj: T, select?: Record<string, boolean>): Partial<T> {
  if (!select) return obj;
  const out: Partial<T> = {};
  for (const k of Object.keys(select)) if (select[k]) (out as Record<string, unknown>)[k] = obj[k as keyof T];
  return out;
}

/** Gerçek Postgres yerine minik, deterministik bir bellek-içi model. */
function makeInMemoryPrisma() {
  const conversations = new Map<string, Record<string, unknown>>();
  const messages: Array<Record<string, unknown>> = [];
  let seq = 0;

  const tx = {
    aiConversation: {
      create: async ({ data, select }: { data: Record<string, unknown>; select?: Record<string, boolean> }) => {
        const id = `conv-${++seq}`;
        const row = { id, createdAt: new Date(seq), updatedAt: new Date(seq), title: null, ...data };
        conversations.set(id, row);
        return pick(row, select);
      },
      findUnique: async ({ where, select }: { where: { id: string }; select?: Record<string, boolean> }) => {
        const row = conversations.get(where.id);
        return row ? pick(row, select) : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = conversations.get(where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
    aiMessage: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        // BİRİNCİL ANAHTAR TAKLİT EDİLİYOR. `ai_messages.id` gerçek şemada
        // PRIMARY KEY ve `confirm`in çift tıklama kilidi TAM OLARAK buna
        // dayanıyor (aynı `confirmationId` ile ikinci INSERT reddediliyor).
        // Bellek-içi model mükerrer id'yi kabul etseydi kilit burada HİÇ
        // sınanamazdı; "aynı id ile ikinci INSERT gerçekten reddediliyor mu"
        // sorusu ayrıca PGlite'a karşı da soruluyor (dosyanın sonu).
        const id = (data.id as string | undefined) ?? `msg-${++seq}`;
        if (messages.some((m) => m.id === id)) {
          throw new Error('Unique constraint failed on the fields: (`id`)');
        }
        const row = { createdAt: new Date(++seq), ...data, id };
        messages.push(row);
        return row;
      },
      findMany: async ({
        where,
        select,
      }: {
        where: { conversationId: string };
        orderBy?: unknown;
        select?: Record<string, boolean>;
      }) => {
        return messages
          .filter((m) => m.conversationId === where.conversationId)
          .sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime())
          .map((m) => pick(m, select));
      },
    },
  };

  const prisma = {
    withTenant: async <T>(_ctx: TenantContext, fn: (t: typeof tx) => Promise<T>) => fn(tx),
  } as unknown as PrismaService;

  return { prisma, conversations, messages };
}

function textResponse(text: string) {
  return { content: [{ type: 'text', text }], stop_reason: 'end_turn' } as never;
}

function toolUseResponse(name: string, input: Record<string, unknown>, id = 'tu-1') {
  return { content: [{ type: 'tool_use', id, name, input }], stop_reason: 'tool_use' } as never;
}

function scriptedAnthropic(responses: unknown[]): {
  client: AnthropicLike;
  create: ReturnType<typeof vi.fn>;
  /** Her çağrıda GÖNDERİLEN `messages`in ANLIK KOPYASI — referans mutasyonundan etkilenmiyor. */
  sentMessagesByCall: Array<{ role: string; content: unknown }[]>;
} {
  let i = 0;
  const sentMessagesByCall: Array<{ role: string; content: unknown }[]> = [];
  const create = vi.fn(async (params: { messages: Array<{ role: string; content: unknown }> }) => {
    // MESSAGES DİZİSİ ÇAĞRIDAN SONRA DA MUTASYONA UĞRUYOR (servis asistan
    // cevabını aynı diziye push ediyor) — burada ÇAĞRI ANINDAKİ hâli
    // ayrıca kopyalanmazsa test, sonradan eklenen elemanı da görür.
    sentMessagesByCall.push(params.messages.map((m) => ({ role: m.role, content: m.content })));
    return responses[Math.min(i++, responses.length - 1)];
  });
  return { client: { messages: { create } } as unknown as AnthropicLike, create, sentMessagesByCall };
}

function makeService(opts: {
  anthropic: AnthropicLike | null;
  prisma?: ReturnType<typeof makeInMemoryPrisma>;
  campaignActions?: Partial<CampaignActionsService>;
}) {
  const mem = opts.prisma ?? makeInMemoryPrisma();
  const config = { aiAssistant: { model: 'test-model' } } as never;
  const clients = { list: vi.fn().mockResolvedValue([{ id: 'client-1', name: 'Sabancı İnşaat' }]) } as unknown as ClientsService;
  const connections = { list: vi.fn().mockResolvedValue([]) } as unknown as ConnectionsService;
  const draftTree = {
    list: vi.fn(),
    createFromSimple: vi.fn(),
    duplicate: vi.fn(),
  } as unknown as DraftTreeService;
  const creatives = { create: vi.fn() } as unknown as CreativeService;
  const campaignActions = {
    list: vi.fn(),
    getSummary: vi.fn(),
    applyAction: vi.fn(),
    ...opts.campaignActions,
  } as unknown as CampaignActionsService;

  const svc = new AiAssistantService(
    opts.anthropic,
    config,
    mem.prisma,
    clients,
    connections,
    draftTree,
    creatives,
    campaignActions,
  );
  return { svc, mem, campaignActions };
}

describe('sendMessage', () => {
  it('ANTHROPIC_API_KEY yoksa 503', async () => {
    const { svc } = makeService({ anthropic: null });
    await expect(svc.sendMessage(CTX, { message: 'merhaba' })).rejects.toThrow(/yapılandırılmamış/);
  });

  it('tool çağrısı olmadan düz metin cevabı — kullanıcı ve asistan mesajı kaydediliyor', async () => {
    const { client } = scriptedAnthropic([textResponse('Merhaba, nasıl yardımcı olabilirim?')]);
    const { svc, mem } = makeService({ anthropic: client });

    const result = await svc.sendMessage(CTX, { message: 'merhaba' });

    expect(result.reply).toBe('Merhaba, nasıl yardımcı olabilirim?');
    expect(mem.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('YENİ sohbet başlığı ilk mesajdan türetiliyor', async () => {
    const { client } = scriptedAnthropic([textResponse('tamam')]);
    const { svc, mem } = makeService({ anthropic: client });

    const result = await svc.sendMessage(CTX, { message: 'Sabancı İnşaat için form kampanyası aç' });
    const conv = mem.conversations.get(result.conversationId)!;
    expect(conv.title).toBe('Sabancı İnşaat için form kampanyası aç');
    expect(conv.userId).toBe(CTX.userId);
    expect(conv.clientId).toBeNull();
  });

  it('tool çağrısı yapılıp SONUCU HAM olarak kaydediliyor — yorumlanmadan', async () => {
    const { client } = scriptedAnthropic([
      toolUseResponse('resolve_client', { query: 'Sabancı' }),
      textResponse('Bulundu: Sabancı İnşaat.'),
    ]);
    const { svc, mem } = makeService({ anthropic: client });

    await svc.sendMessage(CTX, { message: "Sabancı İnşaat'a kampanya aç" });

    const toolMsg = mem.messages.find((m) => m.role === 'tool')!;
    const stored = JSON.parse((toolMsg.content as { content: string }).content);
    expect(stored).toEqual({ status: 'success', data: [{ id: 'client-1', name: 'Sabancı İnşaat' }] });
    expect(toolMsg.toolName).toBe('resolve_client');
  });

  it('KRİTİK: yetkisiz tool çağrısı SERVİSE hiç ulaşmıyor', async () => {
    const { client } = scriptedAnthropic([
      toolUseResponse('resolve_client', { query: 'X' }),
      textResponse('tamam'),
    ]);
    const noPermsCtx = { ...CTX, permissions: [] } as TenantContext;
    const { svc, mem } = makeService({ anthropic: client });

    await svc.sendMessage(noPermsCtx, { message: 'X' });

    const toolMsg = mem.messages.find((m) => m.role === 'tool')!;
    const stored = JSON.parse((toolMsg.content as { content: string }).content);
    expect(stored).toEqual({ status: 'failed', reason: 'Bu işlem için yetkin yok.' });
  });

  it('KAÇAK DÖNGÜ: MAX_TOOL_TURNS turunda duruyor, sonsuza kadar dönmüyor', async () => {
    const alwaysToolUse = toolUseResponse('resolve_client', { query: 'x' });
    const { client, create } = scriptedAnthropic([alwaysToolUse]); // her seferinde AYNI tool_use
    const { svc } = makeService({ anthropic: client });

    const result = await svc.sendMessage(CTX, { message: 'sürekli tool çağır' });

    expect(create).toHaveBeenCalledTimes(8); // MAX_TOOL_TURNS
    expect(result.reply).toContain('çok fazla adım');
  });

  it('KRİTİK: cevap uzunluk sınırında KESİLDİYSE kullanıcıya AÇIKÇA söyleniyor', async () => {
    // Sessiz kesme yok: `stop_reason` okunmazsa yarım bir metin TAM cevap
    // gibi dönüyor ve kullanıcı eksik olduğunu HİÇBİR yerden anlamıyor.
    const { client, create } = scriptedAnthropic([
      { content: [{ type: 'text', text: 'Bütçeyi 500 TL yapmak için önce' }], stop_reason: 'max_tokens' },
    ]);
    const { svc } = makeService({ anthropic: client });

    const result = await svc.sendMessage(CTX, { message: 'çok uzun bir şey anlat' });

    expect(result.reply).toContain('YARIM kaldı');
    // Yarım metin GİZLENMİYOR, etiketleniyor.
    expect(result.reply).toContain('Bütçeyi 500 TL yapmak için önce');
    // max_tokens tool döngüsü için 2048'de dardı — tek turda birden çok
    // tool_use girdisi bu sınırı aşıyordu.
    expect((create.mock.calls[0]![0] as { max_tokens: number }).max_tokens).toBe(8192);
  });

  it('KRİTİK: kesilen turdaki YARIM tool_use bloğu geçmişe HİÇ yazılmıyor', async () => {
    // Sınır bir `tool_use` bloğunun ortasında dolarsa `input` JSON'u eksik
    // kalıyor. O blok `ai_messages`e yazılırsa sohbet KALICI olarak bozulur:
    // sonraki her tur aynı bozuk bloğu geçmişten geri yükler.
    const { client } = scriptedAnthropic([
      {
        content: [{ type: 'tool_use', id: 'tu-yarim', name: 'update_budget', input: { campaignId: 'c' } }],
        stop_reason: 'max_tokens',
      },
    ]);
    const { svc, mem } = makeService({ anthropic: client });

    await svc.sendMessage(CTX, { message: 'x' });

    expect(JSON.stringify(mem.messages.map((m) => m.content))).not.toContain('tool_use');
    expect(mem.messages.some((m) => m.role === 'tool')).toBe(false);
  });

  it('KRİTİK: model REDDEDERSE boş dize dönmüyor, red AÇIKÇA söyleniyor', async () => {
    // 'refusal' turunda `content` BOŞ gelebiliyor; eski kod bunu "cevap"
    // sanıp boş dize döndürüyordu ve ekranda hiçbir şey yazmıyordu.
    const { client } = scriptedAnthropic([{ content: [], stop_reason: 'refusal' }]);
    const { svc } = makeService({ anthropic: client });

    const result = await svc.sendMessage(CTX, { message: 'yapılmaması gereken bir şey' });

    expect(result.reply).toContain('REDDETTİ');
    // Kesilme ile red AYRI cümleler: biri isteği bölmeyi, diğeri yeniden
    // ifade etmeyi gerektiriyor.
    expect(result.reply).not.toContain('YARIM kaldı');
  });

  it('geçmiş İKİNCİ istekte doğru sırayla geri kuruluyor (tool sonuçları TEK mesajda toplanıyor)', async () => {
    const mem = makeInMemoryPrisma();
    const { client: client1 } = scriptedAnthropic([
      toolUseResponse('resolve_client', { query: 'a' }, 'tu-a'),
      textResponse('ilk tur bitti'),
    ]);
    const { svc: svc1 } = makeService({ anthropic: client1, prisma: mem });
    const first = await svc1.sendMessage(CTX, { message: 'ilk mesaj' });

    const { client: client2, sentMessagesByCall } = scriptedAnthropic([textResponse('ikinci tur cevabı')]);
    const { svc: svc2 } = makeService({ anthropic: client2, prisma: mem });
    await svc2.sendMessage(CTX, { conversationId: first.conversationId, message: 'ikinci mesaj' });

    const sentMessages = sentMessagesByCall[0]!;
    // user(ilk) -> assistant(tool_use) -> user(tool_result, TEK mesaj) -> assistant(metin) -> user(ikinci)
    expect(sentMessages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user']);
    expect(Array.isArray(sentMessages[2]!.content)).toBe(true);
  });
});

describe('confirm', () => {
  async function seedPendingConfirmation(
    prisma: ReturnType<typeof makeInMemoryPrisma>,
    confirmationId: string,
  ): Promise<string> {
    const conv = await prisma.prisma.withTenant(CTX, (tx) =>
      tx.aiConversation.create({ data: { orgId: CTX.orgId, clientId: null, userId: CTX.userId }, select: { id: true } }),
    );
    await prisma.prisma.withTenant(CTX, (tx) =>
      tx.aiMessage.create({
        data: {
          conversationId: conv.id,
          role: 'tool',
          content: { type: 'tool_result', tool_use_id: 'tu-1', content: '{}' },
          toolName: 'pause_campaign',
          toolResult: {
            status: 'pending_confirmation',
            confirmationId,
            summary: '"Yaz Kampanyası" kampanyasını durdur.',
            detail: { campaignId: 'camp-1', action: { type: 'pause' } },
          },
        },
      }),
    );
    return conv.id as string;
  }

  it('mutlu yol: applyAction AYNI servis çağrısıyla tetikleniyor, sonuç kaydediliyor', async () => {
    const mem = makeInMemoryPrisma();
    const applyAction = vi.fn().mockResolvedValue({ campaignId: 'camp-1', before: {}, after: { status: 'PAUSED' } });
    const { svc } = makeService({ anthropic: null, prisma: mem, campaignActions: { applyAction } });
    const conversationId = await seedPendingConfirmation(mem, 'conf-1');

    const result = await svc.confirm(CTX, conversationId, 'conf-1');

    expect(applyAction).toHaveBeenCalledWith(CTX, 'camp-1', { type: 'pause' });
    expect(result.status).toBe('success');
  });

  it('KRİTİK: İKİNCİ tıklama platforma HİÇ dokunmuyor — tek kullanımlık', async () => {
    const mem = makeInMemoryPrisma();
    const applyAction = vi.fn().mockResolvedValue({ campaignId: 'camp-1', before: {}, after: {} });
    const { svc } = makeService({ anthropic: null, prisma: mem, campaignActions: { applyAction } });
    const conversationId = await seedPendingConfirmation(mem, 'conf-2');

    await svc.confirm(CTX, conversationId, 'conf-2');
    const second = await svc.confirm(CTX, conversationId, 'conf-2');

    expect(applyAction).toHaveBeenCalledTimes(1);
    expect(second).toEqual({ status: 'failed', reason: 'Bu onay bulunamadı ya da zaten işlendi.' });
  });

  it('KRİTİK: EŞ ZAMANLI iki tıklama — platforma YALNIZCA BİR çağrı gidiyor', async () => {
    // Yukarıdaki "ikinci tıklama" testi SIRAYLA çağırıyor ve okuma yolu onu
    // zaten eliyordu. ASIL tehlike bu: iki istek aynı anda gelirse ikisi de
    // satırları `pending` görüyor, ikisi de `applyAction`a giriyor ve
    // PLATFORMA İKİ KEZ yazılıyor — para mutasyonu, tek bir hata mesajı yok.
    const mem = makeInMemoryPrisma();
    let esZamanli = 0;
    let enYuksekEsZamanli = 0;
    const applyAction = vi.fn(async () => {
      esZamanli++;
      enYuksekEsZamanli = Math.max(enYuksekEsZamanli, esZamanli);
      await new Promise((r) => setTimeout(r, 10));
      esZamanli--;
      return {
        campaignId: 'camp-1',
        campaignName: 'Yaz Kampanyası',
        platform: 'meta' as const,
        before: { status: 'active', budgetMode: 'daily', budgetAmountMicros: '200000000' },
        after: { status: 'PAUSED' },
      };
    });
    const { svc } = makeService({ anthropic: null, prisma: mem, campaignActions: { applyAction } });
    const conversationId = await seedPendingConfirmation(mem, 'conf-yaris');

    const sonuclar = await Promise.all([
      svc.confirm(CTX, conversationId, 'conf-yaris'),
      svc.confirm(CTX, conversationId, 'conf-yaris'),
    ]);

    expect(applyAction).toHaveBeenCalledTimes(1);
    expect(enYuksekEsZamanli).toBe(1);
    // KAYBEDEN TARAF SESSİZ DEĞİL: ne olduğunu söyleyen bir cevap alıyor.
    expect(sonuclar.map((s) => s.status).sort()).toEqual(['failed', 'success']);
    const kaybeden = sonuclar.find((s) => s.status === 'failed')!;
    expect(kaybeden).toMatchObject({ reason: expect.stringContaining('çift tıklama') });
  });

  it('bilinmeyen confirmationId reddediliyor', async () => {
    const mem = makeInMemoryPrisma();
    const { svc } = makeService({ anthropic: null, prisma: mem });
    const conversationId = await seedPendingConfirmation(mem, 'conf-3');

    const result = await svc.confirm(CTX, conversationId, 'baska-bir-id');
    expect(result.status).toBe('failed');
  });

  it('BAŞKASININ sohbetine onay gönderilemiyor', async () => {
    const mem = makeInMemoryPrisma();
    const { svc } = makeService({ anthropic: null, prisma: mem });
    const conversationId = await seedPendingConfirmation(mem, 'conf-4');

    const otherUser = { ...CTX, userId: 'baska-kullanici' } as TenantContext;
    await expect(svc.confirm(otherUser, conversationId, 'conf-4')).rejects.toThrow(/yalnızca sahibi/);
  });

  it('platform çağrısı BAŞARISIZ olursa reason OLDUĞU GİBİ aktarılıyor', async () => {
    const mem = makeInMemoryPrisma();
    const applyAction = vi.fn().mockRejectedValue(new Error('Yazma izni yok: ads_management'));
    const { svc } = makeService({ anthropic: null, prisma: mem, campaignActions: { applyAction } });
    const conversationId = await seedPendingConfirmation(mem, 'conf-5');

    const result = await svc.confirm(CTX, conversationId, 'conf-5');
    expect(result).toEqual({ status: 'failed', reason: 'Yazma izni yok: ads_management' });
  });
});

/**
 * ÇİFT TIKLAMA KİLİDİNİN DAYANDIĞI VARSAYIM — GERÇEK MOTORA KARŞI.
 *
 * Yukarıdaki yarış testi bellek-içi modele karşı koşuyor ve o modelin
 * mükerrer id'yi reddetmesi BİZİM YAZDIĞIMIZ bir kural. Kilit gerçekte
 * `ai_messages` birincil anahtarına dayanıyor; o kısıt olmasaydı üretimde iki
 * istek de yazar ve ikisi de platforma giderdi. Varsayım burada Postgres'e
 * SORULUYOR — "taklidi test etmek" tam olarak bundan kaçınmak için ayrılıyor.
 */
describe('ai_messages birincil anahtarı — kilidin kaynağı', () => {
  let h: Harness;
  const CONV = '11111111-2222-3333-4444-555555555555';
  const ONAY = '66666666-7777-8888-9999-aaaaaaaaaaaa';

  beforeAll(async () => {
    h = await createHarness();
    await seedTenant(h);
    await h.q(
      `INSERT INTO ai_conversations (id, org_id, client_id, user_id, updated_at)
       VALUES ($1, $2, $3, $4, now())`,
      [CONV, IDS.org, IDS.client, IDS.user],
    );
  });

  afterAll(async () => {
    await h.close();
  });

  it('KRİTİK: aynı id ile ikinci INSERT veritabanı tarafından REDDEDİLİYOR', async () => {
    const yaz = () =>
      h.q(
        `INSERT INTO ai_messages (id, conversation_id, role, content, tool_name, tool_result)
         VALUES ($1, $2, 'tool', '{}'::jsonb, 'pause_campaign', $3::jsonb)`,
        [ONAY, CONV, JSON.stringify({ status: 'in_progress', confirmationId: ONAY })],
      );

    await yaz();
    await expect(yaz()).rejects.toThrow(/duplicate key|ai_messages_pkey/i);

    const satirlar = await h.q<{ n: string }>(`SELECT count(*)::text AS n FROM ai_messages WHERE id = $1`, [
      ONAY,
    ]);
    expect(satirlar[0]!.n).toBe('1');
  });
});

/**
 * `update_budget` tool'u — AI YOLUNUN GİRDİ SÜZGECİ.
 *
 * Bu tool `AiAssistantService` üzerinden değil DOĞRUDAN çağrılıyor: sınanan
 * şey orkestrasyon değil, LLM'in ürettiği girdinin doğrulamadan geçip
 * geçmediği. Panel yolu (`campaign-actions.controller.ts`) aynı gövdeyi
 * `campaignActionInputSchema` ile süzüyor; bu testler iki yolun AYNI süzgeci
 * paylaştığını kilitliyor.
 */
describe('update_budget tool — girdi doğrulama ve para birimi', () => {
  function budgetTool(getSummary: ReturnType<typeof vi.fn>) {
    const tools = buildTools({
      clients: {} as never,
      connections: {} as never,
      draftTree: {} as never,
      creatives: {} as never,
      campaignActions: { getSummary } as unknown as CampaignActionsService,
    });
    return tools.find((t) => t.name === 'update_budget')!;
  }

  const USD_OZET = {
    id: 'camp-1',
    name: 'ABD Kampanyası',
    platform: 'meta',
    status: 'active',
    budgetMode: 'daily',
    budgetAmountMicros: 1_000_000_000n,
    currency: 'USD',
  };

  function beklenenOnay(res: ToolResult): Extract<ToolResult, { status: 'pending_confirmation' }> {
    if (res.status !== 'pending_confirmation') {
      throw new Error(`pending_confirmation bekleniyordu, gelen: ${JSON.stringify(res)}`);
    }
    return res;
  }

  it('KRİTİK: NEGATİF bütçe reddediliyor — kampanya özeti bile çekilmiyor', async () => {
    // "-100" GEÇERLİ bir BigInt: doğrulama olmadan negatif bütçe onay
    // kartına, oradan da platforma gidiyordu.
    const getSummary = vi.fn().mockResolvedValue(USD_OZET);
    const res = await budgetTool(getSummary).execute(CTX, {
      campaignId: 'camp-1',
      amountMicros: '-100',
      budgetMode: 'daily',
    });

    expect(res.status).toBe('failed');
    expect(getSummary).not.toHaveBeenCalled();
  });

  it('KRİTİK: ONDALIKLI bütçe ham SyntaxError değil, anlaşılır bir ret üretiyor', async () => {
    // `BigInt("500.5")` çalışma anında ham `SyntaxError` fırlatıyordu.
    const getSummary = vi.fn().mockResolvedValue(USD_OZET);
    const res = await budgetTool(getSummary).execute(CTX, {
      campaignId: 'camp-1',
      amountMicros: '500.5',
      budgetMode: 'daily',
    });

    expect(res.status).toBe('failed');
    // LLM'e HAM Zod/JS hatası değil, ne yapması gerektiğini söyleyen bir
    // cümle gidiyor.
    expect((res as { reason: string }).reason).toContain('micros');
    expect((res as { reason: string }).reason).not.toMatch(/SyntaxError|Cannot convert|invalid_string/);
  });

  it('SIFIR bütçe reddediliyor', async () => {
    const getSummary = vi.fn().mockResolvedValue(USD_OZET);
    const res = await budgetTool(getSummary).execute(CTX, {
      campaignId: 'camp-1',
      amountMicros: '0',
      budgetMode: 'daily',
    });
    expect(res.status).toBe('failed');
  });

  it('GEÇERSİZ budgetMode reddediliyor', async () => {
    const getSummary = vi.fn().mockResolvedValue(USD_OZET);
    const res = await budgetTool(getSummary).execute(CTX, {
      campaignId: 'camp-1',
      amountMicros: '500000000',
      budgetMode: 'weekly',
    });
    expect(res.status).toBe('failed');
    expect(getSummary).not.toHaveBeenCalled();
  });

  it('LLM SAYI ürettiğinde de doğrulama uygulanıyor (tür dönüşümü kapı açmıyor)', async () => {
    const getSummary = vi.fn().mockResolvedValue(USD_OZET);
    const kotu = await budgetTool(getSummary).execute(CTX, {
      campaignId: 'camp-1',
      amountMicros: -100,
      budgetMode: 'daily',
    });
    expect(kotu.status).toBe('failed');

    const iyi = await budgetTool(getSummary).execute(CTX, {
      campaignId: 'camp-1',
      amountMicros: 2_000_000_000,
      budgetMode: 'daily',
    });
    expect(iyi.status).toBe('pending_confirmation');
  });

  it('KRİTİK: onay kartı HESABIN para birimini gösteriyor, sabit ₺ değil', async () => {
    // USD hesapta "2.000,00 ₺" yazan bir kart onaylanınca platformda 2000 USD
    // uygulanıyordu — kart canlı para mutasyonundan önceki TEK insan kontrolü.
    const getSummary = vi.fn().mockResolvedValue(USD_OZET);
    const res = beklenenOnay(
      await budgetTool(getSummary).execute(CTX, {
        campaignId: 'camp-1',
        amountMicros: '2000000000',
        budgetMode: 'daily',
      }),
    );

    expect(res.summary).toContain('1.000,00 $');
    expect(res.summary).toContain('2.000,00 $');
    expect(res.summary).not.toContain('₺');
  });

  it('TRY hesapta ₺ gösteriliyor — para birimi gerçekten özetten okunuyor', async () => {
    const getSummary = vi.fn().mockResolvedValue({ ...USD_OZET, currency: 'TRY' });
    const res = beklenenOnay(
      await budgetTool(getSummary).execute(CTX, {
        campaignId: 'camp-1',
        amountMicros: '2000000000',
        budgetMode: 'daily',
      }),
    );

    expect(res.summary).toContain('2.000,00 ₺');
    expect(res.summary).not.toContain('$');
  });

  it('geçerli girdide detail ŞEMADAN GEÇMİŞ değerleri taşıyor', async () => {
    const getSummary = vi.fn().mockResolvedValue(USD_OZET);
    const res = beklenenOnay(
      await budgetTool(getSummary).execute(CTX, {
        campaignId: 'camp-1',
        amountMicros: '2000000000',
        budgetMode: 'lifetime',
      }),
    );

    expect(res.detail).toMatchObject({
      campaignId: 'camp-1',
      action: { type: 'set_budget', amountMicros: '2000000000', budgetMode: 'lifetime' },
    });
  });
});
