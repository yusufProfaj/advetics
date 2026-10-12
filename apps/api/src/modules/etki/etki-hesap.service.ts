import { Injectable } from '@nestjs/common';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { etkiIsi, type EtkiIsSonucu, type TxLike } from './etki-hesap';

/**
 * Worker girişi (`impact_evaluate`). BYPASSRLS istemcisi: iş bütün
 * workspace'lerin denetim kaydını ve metriğini okuyor ve satırı yazan TEK
 * yol bu (RLS'te INSERT/UPDATE politikası yok, `02_rls.sql`).
 */
@Injectable()
export class EtkiHesapService {
  constructor(private readonly admin: PrismaAdminService) {}

  calistir(adAccountId: string, bugun: string, simdi = new Date()): Promise<EtkiIsSonucu> {
    return etkiIsi(this.admin as unknown as TxLike, adAccountId, bugun, simdi);
  }
}
