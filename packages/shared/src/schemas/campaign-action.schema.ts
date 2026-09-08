import { z } from 'zod';

/**
 * Yayınlanmış bir kampanyada elle tetiklenen aksiyon — panel butonu ya da
 * AI asistanı onay kartı AYNI şemayı gönderiyor.
 *
 * `amountMicros` STRING: para BigInt olarak taşınıyor ve BigInt JSON'a hiç
 * girmiyor (`draft-tree.schema.ts`teki `budgetAmountMicros` ile aynı kural).
 */
export const campaignActionInputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('pause') }),
  z.object({ type: z.literal('resume') }),
  z.object({
    type: z.literal('set_budget'),
    amountMicros: z
      .string()
      .regex(/^\d+$/, 'amountMicros yalnızca rakam olmalı')
      .refine((v) => BigInt(v) > 0n, 'Bütçe sıfırdan büyük olmalı'),
    budgetMode: z.enum(['daily', 'lifetime']),
  }),
]);

export type CampaignActionInput = z.infer<typeof campaignActionInputSchema>;
