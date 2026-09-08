import { z } from 'zod';

/**
 * AI kampanya asistanı — panel içi sohbet istek gövdeleri.
 *
 * `conversationId` YOKSA yeni sohbet açılır. `clientId` yalnızca yeni
 * sohbette anlamlı — devam eden bir sohbette müşteri zaten belirlenmiş.
 */
export const aiAssistantMessageInputSchema = z.object({
  conversationId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  message: z.string().trim().min(1, 'Mesaj boş olamaz').max(4000),
  /** Sohbete eklenen, önceden `/assets` ile yüklenmiş görsellerin kimlikleri. */
  attachmentAssetIds: z.array(z.string().uuid()).max(20).optional(),
});

export type AiAssistantMessageInput = z.infer<typeof aiAssistantMessageInputSchema>;

export const aiAssistantConfirmInputSchema = z.object({
  confirmationId: z.string().uuid(),
});

export type AiAssistantConfirmInput = z.infer<typeof aiAssistantConfirmInputSchema>;

// -----------------------------------------------------------------------------
// Arayüzün çizdiği yüzey
// -----------------------------------------------------------------------------

/**
 * Sohbetin ÇİZİLMESİ gereken sonuçları — düz metnin yanında.
 *
 * SINIFLANDIRMAYI SUNUCU YAPIYOR, ARAYÜZ DEĞİL. Panel "hangi tool adı taslak
 * üretir" bilgisini taşısaydı, o karar iki yerde durur ve yeni bir tool
 * eklendiğinde biri güncellenmeden kalırdı (CLAUDE.md: "aynı şeyi üreten
 * ikinci fonksiyon doğduğu anda ayrışır"). Panel yalnızca `kind`e bakıyor.
 */
export type AiAssistantAction =
  /**
   * Canlı mutasyon ONAY BEKLİYOR — platforma HENÜZ dokunulmadı.
   *
   * Kart tıklanana kadar hiçbir şey değişmiyor; `confirmationId` tek
   * kullanımlık ve sunucuda veritabanı birincil anahtarıyla kilitli.
   */
  | {
      kind: 'onay';
      confirmationId: string;
      /** Kullanıcıya gösterilecek tek cümlelik özet (eski → yeni değer). */
      summary: string;
    }
  /**
   * Taslak oluştu — panel inceleme listesine bağlanıyor.
   *
   * TASLAK KİMLİĞİ TAŞINMIYOR ve bu bilinçli: taslak BAŞINA bir rota yok,
   * inceleme tek yerde (`/reklam-olustur` listesi). Kimliği taşımak,
   * tüketicisi olmayan bir alan bırakmak olurdu (CLAUDE.md: "veride duran
   * alan, kullanılmıyorsa yoktur"). Taslak detay sayfası yazıldığında kimlik
   * buraya GERÇEK bir tüketiciyle birlikte geri gelir.
   */
  | { kind: 'taslak' };

export interface AiAssistantThreadMessage {
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
}

/**
 * Sohbetin okunabilir hâli — sayfa yenilendiğinde geçmişi geri yüklemek için.
 *
 * TOOL SATIRLARI DÖNMÜYOR: `ai_messages` ham Anthropic bloklarını da tutuyor
 * (denetim izi için) ama ekranda gösterilecek olan konuşmanın kendisi. Açık
 * onay kartları ayrıca `actions` içinde geliyor — çözülmüş olanlar gelmiyor,
 * yoksa kullanıcı çalışmayan bir düğme görürdü.
 */
export interface AiAssistantThread {
  conversationId: string;
  clientId: string | null;
  title: string | null;
  messages: AiAssistantThreadMessage[];
  actions: AiAssistantAction[];
}

export interface AiAssistantSendResult {
  conversationId: string;
  reply: string;
  /** YALNIZCA bu turda doğanlar. Geçmiş kartlar `AiAssistantThread`te. */
  actions: AiAssistantAction[];
}
