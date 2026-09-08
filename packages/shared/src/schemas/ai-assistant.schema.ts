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
