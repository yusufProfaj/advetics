import type { Request } from 'express';
import type { TenantContext } from '@advetics/shared';

export interface RequestActor {
  id: string;
  orgId: string;
  email: string;
  fullName: string;
}

/**
 * Kimliği doğrulanmış istek.
 *
 * `tenant` yalnızca JwtAuthGuard'dan geçmiş isteklerde doludur. Guard'ın
 * atlandığı (@Public) rotalarda undefined'dır — bu yüzden opsiyonel.
 */
export interface AuthedRequest extends Request {
  requestId: string;
  tenant?: TenantContext;
  actor?: RequestActor;
  /**
   * İstek bir OKUMA ANAHTARIYLA geldiyse anahtarın kimliği (JWT ile gelince
   * tanımsız). Okuma uçları buna bakarak çerezli oturumu reddediyor.
   */
  okumaAnahtariId?: string;
}
