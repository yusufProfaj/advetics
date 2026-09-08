import { ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import type { Prisma } from '@prisma/client';
import type {
  AiAssistantAction,
  AiAssistantSendResult,
  AiAssistantThread,
  AiAssistantThreadMessage,
  TenantContext,
} from '@advetics/shared';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { PrismaService, type TenantClient } from '../../prisma/prisma.service';
import { assertPermissions } from '../../common/guards/permissions.guard';
import { ClientsService } from '../tenancy/clients.service';
import { ConnectionsService } from '../connections/connections.service';
import { DraftTreeService } from '../draft-tree/draft-tree.service';
import { CreativeService } from '../draft-tree/creative.service';
import { CampaignActionsService, type CampaignAction } from '../campaign-actions/campaign-actions.service';
import { ANTHROPIC_CLIENT } from './anthropic-client.provider';
import { buildSystemPrompt } from './system-prompt';
import { buildTools } from './tools';
import type { ToolDefinition, ToolResult } from './tool-types';

/** `AiAssistantService`nin gerçekten kullandığı yüzey — testte sahte istemci kurmak için. */
export interface AnthropicLike {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
}

export interface SendMessageInput {
  conversationId?: string;
  clientId?: string;
  message: string;
  attachmentAssetIds?: string[];
}

/**
 * TİP `packages/shared`TAN GELİYOR, burada yeniden tanımlanmıyor.
 *
 * Panel bu yanıtı `@advetics/shared`tan okuyor; iki ayrı tanım, alan
 * eklendiğinde birinin güncellenmemesi demekti ve `apiFetch<T>` denetimsiz
 * bir dönüşüm olduğu için TypeScript hiçbir şey söylemezdi.
 */
export type SendMessageResult = AiAssistantSendResult;

/**
 * Bir sohbetteki onayların ÇÖZÜLMÜŞ/AÇIK durumu.
 *
 * TEK KARAR NOKTASI: hem `confirm()` (tek bir kimliği arıyor) hem
 * `getThread()` (açık olanları listeliyor) buradan besleniyor. İki ayrı
 * tarama yazmak, birinin `in_progress` satırını çözülmüş saymayı unutması
 * ve panelde çalışmayan bir onay düğmesi göstermesi demekti.
 */
interface OnayDurumu {
  confirmationId: string;
  toolName: string;
  summary: string;
  detail: unknown;
  /** Terminal ya da `in_progress` bir sonuç zaten yazılmış mı. */
  cozuldu: boolean;
}

function onaylariCikar(
  rows: Array<{ toolName: string | null; toolResult: unknown }>,
): OnayDurumu[] {
  const byId = new Map<string, OnayDurumu>();

  for (const row of rows) {
    const tr = row.toolResult as (ToolResult & { confirmationId?: string }) | null;
    if (!tr?.confirmationId) continue;

    const mevcut = byId.get(tr.confirmationId);
    if (tr.status === 'pending_confirmation') {
      byId.set(tr.confirmationId, {
        confirmationId: tr.confirmationId,
        toolName: row.toolName ?? '',
        summary: tr.summary,
        detail: tr.detail,
        cozuldu: mevcut?.cozuldu ?? false,
      });
      continue;
    }

    /*
     * TEKLİF SATIRINDAN ÖNCE GELEN BİR SONUÇ DA ÇÖZÜLMÜŞ SAYILIYOR.
     * `claimConfirmation` talep satırını `id = confirmationId` ile yazıyor ve
     * satırların sırası `createdAt`e bağlı; teklifi görmeden çözümü görmek
     * mümkün. Bayrağı ayrı tutmak, sıraya bağımlı olmayan tek doğru cevap.
     */
    if (mevcut) mevcut.cozuldu = true;
    else {
      byId.set(tr.confirmationId, {
        confirmationId: tr.confirmationId,
        toolName: row.toolName ?? '',
        summary: '',
        detail: null,
        cozuldu: true,
      });
    }
  }

  return [...byId.values()];
}

/**
 * Saklanan Anthropic blok dizisinden EKRANA YAZILACAK düz metni çıkarır.
 *
 * `ai_messages.content` denetim izi için ham blokları tutuyor (tool_use
 * girdileri, düşünme metni). Panelde gösterilecek olan yalnızca `text`
 * blokları; tool bloklarını basmak kullanıcıya JSON göstermek olurdu.
 */
export function blogaMetin(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter(
      (b): b is { type: 'text'; text: string } =>
        typeof b === 'object' && b !== null && (b as { type?: unknown }).type === 'text',
    )
    .map((b) => b.text)
    .join('\n')
    .trim();
}

/**
 * Panel içi AI kampanya asistanı — Claude tool-calling döngüsü.
 *
 * TAMAMEN SENKRON. Bu projede yazma uçları (taslak oluşturma, yayınlama)
 * BullMQ'ya girmiyor, HTTP isteği içinde tamamlanıyor — chat turu da aynı
 * deseni izliyor. Kuyruk yalnızca arka plan senkronizasyonu için.
 */
@Injectable()
export class AiAssistantService {
  private readonly model: string;
  private readonly tools: ToolDefinition[];
  private readonly toolMap: Map<string, ToolDefinition>;

  /** Tek tur içinde kaç kez tool çağrılabilir — kaçak bir döngüye karşı sınır. */
  private static readonly MAX_TOOL_TURNS = 8;

  /**
   * Tek bir model cevabının üst sınırı.
   *
   * 2048 TOOL DÖNGÜSÜ İÇİN DAR. Bir tur hem düşünme metnini hem birden çok
   * `tool_use` bloğunun JSON girdisini taşıyor (`create_draft_campaign` tek
   * başına targets/creativeIds dizileriyle yüzlerce token) ve sınır
   * dolduğunda cevap YARIM kesiliyor. Akışsız istekte 8192 hem Claude'un
   * varsayılan pencereleri içinde hem de bir turun makul üst sınırı;
   * daha büyük bir değer kesilmeyi engellemiyor, yalnızca kaçak bir cevabın
   * maliyetini artırıyor.
   */
  private static readonly MAX_TOKENS = 8192;

  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly anthropic: AnthropicLike | null,
    @Inject(CONFIG) config: AppConfig,
    private readonly prisma: PrismaService,
    clients: ClientsService,
    connections: ConnectionsService,
    draftTree: DraftTreeService,
    creatives: CreativeService,
    private readonly campaignActions: CampaignActionsService,
  ) {
    this.model = config.aiAssistant.model;
    this.tools = buildTools({ clients, connections, draftTree, creatives, campaignActions });
    this.toolMap = new Map(this.tools.map((t) => [t.name, t]));
  }

  async sendMessage(ctx: TenantContext, input: SendMessageInput): Promise<SendMessageResult> {
    if (!this.anthropic) {
      throw new ServiceUnavailableException('AI asistanı yapılandırılmamış — ANTHROPIC_API_KEY eksik.');
    }

    const conversationId = input.conversationId
      ? await this.assertOwnConversation(ctx, input.conversationId)
      : await this.createConversation(ctx, input);

    const history = await this.loadHistory(ctx, conversationId);

    const userText = input.attachmentAssetIds?.length
      ? `${input.message}\n\n[Sisteme eklenen görsel kimlikleri: ${input.attachmentAssetIds.join(', ')}]`
      : input.message;

    await this.appendMessage(ctx, conversationId, 'user', [{ type: 'text', text: userText }]);

    const messages: Anthropic.MessageParam[] = [...history, { role: 'user', content: userText }];
    const anthropicTools = this.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
    }));

    let reply = '';
    const actions: AiAssistantAction[] = [];
    for (let turn = 0; turn < AiAssistantService.MAX_TOOL_TURNS; turn++) {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: AiAssistantService.MAX_TOKENS,
        system: buildSystemPrompt(),
        tools: anthropicTools,
        messages,
      });

      // STOP_REASON OKUNUYOR — okunmazsa iki ayrı arıza SESSİZ kalıyor.
      //
      // (1) 'max_tokens': cevap sınırda KESİLDİ. Metin yarım kalmışsa
      //     kullanıcı onu tam cevap sanıyor; kesilme bir `tool_use` bloğunun
      //     ORTASINA denk geldiyse `input` JSON'u eksik oluyor ve o blok hem
      //     bu turun `messages` dizisine hem `ai_messages` geçmişine
      //     yazılırsa sohbet KALICI olarak bozuluyor (sonraki her tur aynı
      //     bozuk bloğu geri yükler).
      // (2) 'refusal': model isteği yanıtlamayı reddetti. Bu dal da tool'suz
      //     bir cevap gibi görünüyor ve `content` BOŞ olabiliyor — eski kod
      //     boş dizeyi "cevap" diye döndürüyordu, kullanıcı ekranda hiçbir
      //     şey görmüyordu.
      //
      // İkisinde de HAM içerik geçmişe yazılmıyor; yerine ne olduğunu
      // ANLATAN, tamamlanmış bir asistan turu yazılıyor.
      if (response.stop_reason === 'max_tokens' || response.stop_reason === 'refusal') {
        reply = AiAssistantService.stopReasonReply(response.stop_reason, response.content);
        await this.appendMessage(ctx, conversationId, 'assistant', [{ type: 'text', text: reply }]);
        break;
      }

      messages.push({ role: 'assistant', content: response.content });
      await this.appendMessage(ctx, conversationId, 'assistant', response.content);

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );

      if (toolUses.length === 0) {
        reply = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n');
        break;
      }

      const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        const result = await this.runTool(ctx, use.name, use.input as Record<string, unknown>);
        const block: Anthropic.ToolResultBlockParam = {
          type: 'tool_result',
          tool_use_id: use.id,
          content: JSON.stringify(result),
        };
        await this.appendMessage(ctx, conversationId, 'tool', block, use.name, result);
        toolResultBlocks.push(block);

        const action = AiAssistantService.toAction(use.name, result);
        if (action) actions.push(action);
      }
      messages.push({ role: 'user', content: toolResultBlocks });

      if (turn === AiAssistantService.MAX_TOOL_TURNS - 1) {
        reply = 'Bu istek çok fazla adım gerektirdi — daha küçük bir parçaya bölüp tekrar dener misin?';
      }
    }

    await this.touchConversation(ctx, conversationId);
    return { conversationId, reply, actions };
  }

  /**
   * TASLAK ÜRETEN TOOL'LAR — panelin "incele ve yayınla" bağlantısı bunlardan doğuyor.
   *
   * `create_creative` BİLEREK YOK: o da `targetId` dönüyor ama kimliği bir
   * KREATİF, taslak değil. Listeye almak, kullanıcıyı var olmayan bir taslak
   * sayfasına gönderirdi.
   */
  private static readonly TASLAK_URETEN_TOOLLAR = new Set([
    'create_draft_campaign',
    'duplicate_draft',
  ]);

  /** Tool sonucunu panelin çizeceği bir eyleme çevirir; çizilecek bir şey yoksa `null`. */
  private static toAction(toolName: string, result: ToolResult): AiAssistantAction | null {
    if (result.status === 'pending_confirmation') {
      return {
        kind: 'onay',
        confirmationId: result.confirmationId,
        summary: result.summary,
      };
    }
    if (
      result.status === 'success' &&
      result.targetId &&
      AiAssistantService.TASLAK_URETEN_TOOLLAR.has(toolName)
    ) {
      return { kind: 'taslak' };
    }
    return null;
  }

  /**
   * Sohbeti EKRANA ÇİZİLEBİLİR hâlde okur — sayfa yenilendiğinde geçmiş geri gelsin diye.
   *
   * Sohbet zaten `ai_messages`ta duruyordu ama onu okuyan bir uç yoktu: kullanıcı
   * sayfayı yenilediğinde konuşma ekrandan siliniyor, veritabanında duruyordu.
   * Daha kötüsü, açık bir ONAY KARTI da kayboluyordu — canlı mutasyon teklifi
   * ortada kalıyor ve kullanıcı onu bir daha göremiyordu.
   */
  async getThread(ctx: TenantContext, conversationId: string): Promise<AiAssistantThread> {
    await this.assertOwnConversation(ctx, conversationId);

    const { conv, rows } = await this.prisma.withTenant(ctx, async (tx) => ({
      conv: await tx.aiConversation.findUnique({
        where: { id: conversationId },
        select: { id: true, clientId: true, title: true },
      }),
      rows: await tx.aiMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        select: { role: true, content: true, createdAt: true, toolName: true, toolResult: true },
      }),
    }));

    if (!conv) throw new NotFoundException('Sohbet bulunamadı');

    const messages: AiAssistantThreadMessage[] = [];
    for (const row of rows) {
      if (row.role === 'tool') continue;
      const text = blogaMetin(row.content);
      // BOŞ TUR ÇİZİLMİYOR: yalnızca `tool_use` taşıyan bir asistan turunun
      // metni yok ve ekranda boş bir balon olarak görünürdü.
      if (!text) continue;
      messages.push({ role: row.role, text, createdAt: row.createdAt.toISOString() });
    }

    const actions: AiAssistantAction[] = onaylariCikar(rows)
      .filter((o) => !o.cozuldu)
      .map((o) => ({ kind: 'onay' as const, confirmationId: o.confirmationId, summary: o.summary }));

    return {
      conversationId: conv.id,
      clientId: conv.clientId,
      title: conv.title,
      messages,
      actions,
    };
  }

  /**
   * Bir `pending_confirmation` tool sonucunu GERÇEKTEN uygular.
   *
   * AYNI `CampaignActionsService.applyAction`'ı çağırıyor — panelin (ileride
   * yazılacak) manuel butonuyla birebir aynı kod yolu.
   *
   * TEK KULLANIMLIK VE BU GARANTİ VERİTABANINDA: platform çağrısından önce
   * `claimConfirmation` onayı tüketiyor, böylece eş zamanlı iki tıklama
   * platforma iki kez yazamıyor (aşağıdaki uzun gerekçeye bkz.).
   */
  async confirm(ctx: TenantContext, conversationId: string, confirmationId: string): Promise<ToolResult> {
    await this.assertOwnConversation(ctx, conversationId);

    const rows = await this.prisma.withTenant(ctx, (tx) =>
      tx.aiMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        select: { toolName: true, toolResult: true },
      }),
    );

    /*
     * TARAMA `onaylariCikar` İÇİNDE — `getThread` ile AYNI FONKSİYON.
     *
     * Burada ikinci bir tarama yazmak, panelin "hangi kart hâlâ açık"
     * cevabıyla sunucunun "bu onay işlenebilir mi" cevabının ayrışması
     * demekti: kullanıcı çalışmayan bir düğme görür ya da tersi.
     *
     * `alreadyResolved` YALNIZCA HIZLI YOL — sıradan bir ikinci tıklamayı
     * ucuza (platforma hiç gitmeden) eleyip anlaşılır bir mesaj veriyor.
     * GERÇEK kilit aşağıdaki `claimConfirmation`: iki istek AYNI ANDA buraya
     * geldiğinde ikisi de satırları `pending` görür ve bu kontrol ikisini de
     * geçirir.
     */
    const onay = onaylariCikar(rows).find((o) => o.confirmationId === confirmationId);

    /*
     * `detail` VERİTABANINDAN GELEN JSON, biçimi GARANTİ DEĞİL — denetimsiz
     * bir `as unknown as X` eksik/bozuk bir alanı sessizce geçirirdi
     * (CLAUDE.md: "eksik alan denetimini tamamen kapatıyor"). Bozuk kayıt
     * "bulunamadı" ile aynı sonuca düşüyor.
     */
    if (!onay || onay.cozuldu || !isPendingActionDetail(onay.detail)) {
      return { status: 'failed', reason: 'Bu onay bulunamadı ya da zaten işlendi.' };
    }
    const pending = { toolName: onay.toolName, detail: onay.detail };

    // ONAYI PLATFORM ÇAĞRISINDAN ÖNCE TÜKET.
    //
    // Yukarıdaki tarama TEK BAŞINA yarış durumuna açık: kullanıcı düğmeye iki
    // kez hızlı basınca iki istek de satırları `pending` görüyor, ikisi de
    // `applyAction`a giriyor ve PLATFORMA İKİ KEZ yazılıyor — para mutasyonu.
    // Terminal sonucu en sonda yazmak da kurtarmıyor; pencere tam olarak
    // okuma ile yazma arasında.
    //
    // Uygulama içi bir Set/Map YETMİYOR: pm2 altında API birden çok süreç ve
    // worker ayrı bir süreç — her sürecin kendi Set'i olur.
    //
    // KİLİT OLARAK `ai_messages.id` BİRİNCİL ANAHTARI KULLANILIYOR: talep
    // satırı `id = confirmationId` ile yazılıyor, yani ikinci istek AYNI
    // birincil anahtarı yazmaya çalışıp veritabanı seviyesinde reddediliyor.
    // Neden bu çözüm: `ai_messages` üzerinde UPDATE/DELETE `advetics_app`ten
    // GERİ ALINMIŞ (append-only, `02_rls.sql`), yani "satırı in_progress'e
    // çevir" tarzı koşullu bir UPDATE üretimde izin hatasıyla düşerdi; yeni
    // bir kilit tablosu ise migration ve RLS politikası isterdi. Var olan
    // birincil anahtar, hiçbir şema değişikliği olmadan tam olarak gereken
    // "yalnızca biri kazanır" garantisini veriyor.
    const claimed = await this.claimConfirmation(ctx, conversationId, confirmationId, pending.toolName);
    if (!claimed) {
      return {
        status: 'failed',
        reason: 'Bu onay şu anda işleniyor ya da az önce işlendi — çift tıklama engellendi.',
      };
    }

    let result: ToolResult;
    try {
      const applied = await this.campaignActions.applyAction(
        ctx,
        pending.detail.campaignId,
        toCampaignAction(pending.detail.action),
      );
      result = { status: 'success', data: applied };
    } catch (err) {
      result = { status: 'failed', reason: err instanceof Error ? err.message : String(err) };
    }

    await this.appendMessage(
      ctx,
      conversationId,
      'tool',
      { type: 'tool_result', tool_use_id: `confirm:${confirmationId}`, content: JSON.stringify(result) },
      pending.toolName,
      { ...result, confirmationId } as ToolResult & { confirmationId: string },
    );
    return result;
  }

  /**
   * Onayı TÜKETİLMİŞ olarak işaretler — platform çağrısından ÖNCE.
   *
   * `true` dönerse bu istek yarışı KAZANDI ve platforma yazabilir; `false`
   * dönerse başka bir istek (ya da bir önceki tıklama) onayı çoktan almış.
   *
   * HER HATA "KAZANAMADIM" SAYILIYOR, yalnızca birincil anahtar çakışması
   * değil. Kayıt yazılamadıysa ikinci tıklamayı da durduramayız demektir; o
   * durumda platforma DOKUNMAMAK, mükerrer bir para mutasyonu riskinden
   * ucuz. Hata sınıfını ayırt etmeye çalışmak (P2002 kodu) bu kararı
   * değiştirmiyor, yalnızca yanlış sınıflandırma ihtimali ekliyordu.
   *
   * Aksiyon BAŞARISIZ olsa bile talep satırı duruyor: aynı kart bir daha
   * çalışmıyor. Bilinçli — sonucu bilinmeyen bir para mutasyonunu aynı
   * kartla tekrar denemek, iki kez uygulamaktan daha kötü. Kullanıcı yeniden
   * sorar, yeni bir kart gelir.
   */
  private async claimConfirmation(
    ctx: TenantContext,
    conversationId: string,
    confirmationId: string,
    toolName: string,
  ): Promise<boolean> {
    try {
      await this.prisma.withTenant(ctx, (tx) =>
        tx.aiMessage.create({
          data: {
            // KİLİDİN KENDİSİ. Rastgele bir id verilseydi ikinci istek de
            // yazabilir ve ikisi de platforma giderdi.
            id: confirmationId,
            conversationId,
            role: 'tool',
            content: {
              type: 'tool_result',
              tool_use_id: `confirm-claim:${confirmationId}`,
              content: JSON.stringify({ status: 'in_progress' }),
            } as Prisma.InputJsonValue,
            toolName,
            // `confirm`in tarayıcısı `pending_confirmation` DIŞINDAKİ her
            // durumu "çözülmüş" sayıyor; 'in_progress' bu yüzden okuma
            // yolunu da kapatıyor.
            toolResult: { status: 'in_progress', confirmationId } as Prisma.InputJsonValue,
          },
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Kesilmiş/reddedilmiş bir model cevabını kullanıcıya AÇIKÇA anlatır.
   *
   * İki hâl AYRI cümle: "kesildi" ile "reddedildi" kullanıcıdan FARKLI şey
   * istiyor (birini bölmek çözüyor, diğerini yeniden ifade etmek). Tek bir
   * genel cümleye indirmek, CLAUDE.md'nin "Beklenmeyen bir hata oluştu"
   * olarak anlattığı bilgisiz mesajı üretirdi.
   */
  private static stopReasonReply(
    stopReason: 'max_tokens' | 'refusal',
    content: Anthropic.ContentBlock[],
  ): string {
    // "Bu adımda" — önceki turlarda çalışmış tool'lar VAR olabilir ve onların
    // etkisi duruyor. "Hiçbir işlem yapılmadı" demek yalan olurdu.
    if (stopReason === 'refusal') {
      return (
        'Model bu isteği yanıtlamayı REDDETTİ. Bu adımda hiçbir işlem çalıştırılmadı — ' +
        'önceki adımlarda yapılanlar geçerli. İsteği farklı biçimde ifade edip tekrar deneyebilirsin.'
      );
    }
    const uyari =
      'Cevap uzunluk sınırına takıldı ve YARIM kaldı. Bu adımda hiçbir işlem çalıştırılmadı — ' +
      'önceki adımlarda yapılanlar geçerli. İsteği daha küçük parçalara bölüp tekrar dener misin?';
    const kesik = content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    // Yarım metin GÖSTERİLİYOR ama ETİKETLİ: gizlemek kullanıcıyı bilgisiz
    // bırakır, etiketsiz göstermek onu tam cevap sanmasına yol açar.
    return kesik ? `${uyari}\n\nYarım kalan metin:\n${kesik}` : uyari;
  }

  private async runTool(
    ctx: TenantContext,
    name: string,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const tool = this.toolMap.get(name);
    if (!tool) return { status: 'failed', reason: `Bilinmeyen tool: ${name}` };
    try {
      assertPermissions(ctx, ...tool.permissions);
    } catch {
      return { status: 'failed', reason: 'Bu işlem için yetkin yok.' };
    }
    return tool.execute(ctx, input);
  }

  private async assertOwnConversation(ctx: TenantContext, conversationId: string): Promise<string> {
    const conv = await this.prisma.withTenant(ctx, (tx) =>
      tx.aiConversation.findUnique({ where: { id: conversationId }, select: { id: true, userId: true } }),
    );
    if (!conv) throw new NotFoundException('Sohbet bulunamadı');
    if (conv.userId !== ctx.userId) {
      throw new ForbiddenException('Bu sohbete yalnızca sahibi mesaj ekleyebilir');
    }
    return conv.id;
  }

  private async createConversation(ctx: TenantContext, input: SendMessageInput): Promise<string> {
    const conv = await this.prisma.withTenant(ctx, (tx) =>
      tx.aiConversation.create({
        data: {
          orgId: ctx.orgId,
          clientId: input.clientId ?? null,
          userId: ctx.userId,
          title: input.message.slice(0, 200),
        },
        select: { id: true },
      }),
    );
    return conv.id;
  }

  private async touchConversation(ctx: TenantContext, conversationId: string): Promise<void> {
    await this.prisma.withTenant(ctx, (tx) =>
      tx.aiConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
    );
  }

  private async appendMessage(
    ctx: TenantContext,
    conversationId: string,
    role: 'user' | 'assistant' | 'tool',
    content: unknown,
    toolName?: string,
    toolResult?: unknown,
  ): Promise<void> {
    await this.prisma.withTenant(ctx, (tx) =>
      tx.aiMessage.create({
        data: {
          conversationId,
          role,
          content: content as Prisma.InputJsonValue,
          toolName: toolName ?? null,
          toolResult: toolResult === undefined ? undefined : (toolResult as Prisma.InputJsonValue),
        },
      }),
    );
  }

  /**
   * Sakalanmış geçmişi Anthropic'in beklediği tur biçimine geri kurar.
   *
   * 'tool' satırları TEK TEK saklanıyor (her tool çağrısı kendi izini
   * bırakır — denetim amaçlı) ama Anthropic bir asistan turunun bütün
   * `tool_use` bloklarına karşılık gelen sonuçların TEK bir kullanıcı
   * mesajında gelmesini bekliyor. Ardışık 'tool' satırları burada tek
   * mesajda TOPLANIYOR.
   */
  private async loadHistory(ctx: TenantContext, conversationId: string): Promise<Anthropic.MessageParam[]> {
    const rows = await this.prisma.withTenant(ctx, (tx) =>
      tx.aiMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        select: { role: true, content: true },
      }),
    );

    const out: Anthropic.MessageParam[] = [];
    let pendingToolResults: Anthropic.ToolResultBlockParam[] = [];
    const flush = () => {
      if (pendingToolResults.length > 0) {
        out.push({ role: 'user', content: pendingToolResults });
        pendingToolResults = [];
      }
    };

    for (const row of rows) {
      if (row.role === 'tool') {
        pendingToolResults.push(row.content as unknown as Anthropic.ToolResultBlockParam);
        continue;
      }
      flush();
      out.push({
        role: row.role,
        content: row.content as unknown as Anthropic.MessageParam['content'],
      });
    }
    flush();
    return out;
  }
}

interface PendingActionDetail {
  campaignId: string;
  action:
    | { type: 'pause' }
    | { type: 'resume' }
    | { type: 'set_budget'; amountMicros: string; budgetMode: 'daily' | 'lifetime' };
}

function isPendingActionDetail(x: unknown): x is PendingActionDetail {
  if (typeof x !== 'object' || x === null) return false;
  const obj = x as Record<string, unknown>;
  if (typeof obj.campaignId !== 'string') return false;
  const action = obj.action as Record<string, unknown> | undefined;
  if (!action || typeof action.type !== 'string') return false;
  if (action.type === 'pause' || action.type === 'resume') return true;
  if (action.type === 'set_budget') {
    return (
      typeof action.amountMicros === 'string' &&
      (action.budgetMode === 'daily' || action.budgetMode === 'lifetime')
    );
  }
  return false;
}

function toCampaignAction(action: PendingActionDetail['action']): CampaignAction {
  if (action.type === 'set_budget') {
    return { type: 'set_budget', amountMicros: BigInt(action.amountMicros), budgetMode: action.budgetMode };
  }
  return { type: action.type };
}
