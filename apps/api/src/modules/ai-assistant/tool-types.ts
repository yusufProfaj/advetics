import type { Permission, TenantContext } from '@advetics/shared';

/**
 * Her yazma tool'unun döndürdüğü YAPILANDIRILMIŞ sonuç.
 *
 * SERBEST METİN DEĞİL: sistem promptu Claude'a yalnızca `status: 'success'`
 * görünce başarı iddia etmesini söylüyor. Bir tool serbest bir cümle
 * dönseydi, LLM iyimser bir yorumla "muhtemelen oldu" diyebilirdi —
 * "'200 döndü' doğrulama değil" ilkesinin LLM'e karşı uygulanmış hâli.
 */
export type ToolResult =
  | { status: 'success'; data?: unknown; targetId?: string }
  | { status: 'failed'; reason: string }
  | { status: 'partial'; reason: string; data?: unknown }
  /**
   * CANLI MUTASYON HENÜZ ÇALIŞMADI — chat içi onay kartı bekliyor.
   *
   * `confirmationId` tek kullanımlık: `AiAssistantService.confirm()` bu
   * kimliği taşıyan, henüz çözülmemiş bir tool sonucu arıyor ve bulamazsa
   * (yanlış kimlik ya da zaten onaylanmış) reddediyor.
   */
  | {
      status: 'pending_confirmation';
      confirmationId: string;
      summary: string;
      detail: Record<string, unknown>;
    };

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Bu tool çalıştırılmadan önce `assertPermissions` ile kontrol edilir. */
  permissions: Permission[];
  execute(ctx: TenantContext, input: Record<string, unknown>): Promise<ToolResult>;
}
