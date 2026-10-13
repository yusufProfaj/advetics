import { describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import type { TenantContext } from '@advetics/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import { SyncController } from './sync.controller';

/**
 * ═══ GET /sync/status?clientId= — ADRESTEKİ WORKSPACE (MIMARI Ç-12) ═══
 *
 * Veri durumu ekranı Marka Merkezi'ne taşındı ve o sayfa workspace'i
 * ADRESTEN okuyor; uç oturumdaki aktif seçimi okuyordu. İki iddia:
 *   1. Erişilemeyen bir workspace istenirse 404 ve VERİTABANINA HİÇ
 *      GİDİLMİYOR (kapsam daraltılmadan sorgu koşsaydı aktif workspace'in
 *      verisi "B'nin verisi" diye dönerdi).
 *   2. İzinli workspace istenirse sorgular O workspace'e daraltılmış
 *      kapsamla koşuyor (RLS'in kendi mekanizması: `activeClientId`).
 */
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const YABANCI = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const CTX = {
  orgId: '11111111-1111-1111-1111-111111111111',
  userId: '22222222-2222-2222-2222-222222222222',
  clientIds: [A, B],
  activeClientId: A,
  isOrgAdmin: true,
} as TenantContext;

function kur() {
  const kapsamlar: Array<string | null> = [];
  const tx = {
    adAccount: { findMany: async () => [] },
    platformConnection: { findMany: async () => [] },
    syncJob: { findMany: async () => [] },
    $queryRaw: async (q: { sql: string }) => (q.sql.includes('COUNT(*) FILTER') ? [{ toplam: 0, dusen: 0, bos: 0, kosan: 0 }] : []),
  };
  const prisma = {
    withTenant: async <T>(c: TenantContext, fn: (t: unknown) => Promise<T>) => {
      kapsamlar.push(c.activeClientId);
      return fn(tx);
    },
  } as unknown as PrismaService;
  return { ctrl: new SyncController(prisma, null as never, null as never), kapsamlar };
}

describe('GET /sync/status?clientId=', () => {
  it('KRİTİK: erişilemeyen workspace 404; veritabanına gidilmiyor', async () => {
    const { ctrl, kapsamlar } = kur();
    await expect(ctrl.status(CTX, YABANCI)).rejects.toBeInstanceOf(NotFoundException);
    expect(kapsamlar).toEqual([]);
  });

  it('KRİTİK: adresteki workspace oturumdakinden farklıysa sorgu ADRESTEKİNE daraltılıyor', async () => {
    const { ctrl, kapsamlar } = kur();
    await ctrl.status(CTX, B);
    expect(kapsamlar).toEqual([B]);
  });

  it('parametresiz çağrı eskisi gibi oturumdaki seçimi okuyor (geriye uyum)', async () => {
    const { ctrl, kapsamlar } = kur();
    await ctrl.status(CTX);
    expect(kapsamlar).toEqual([A]);
  });

  it('"tüm workspace\'ler" modunda (aktif seçim yok) da adres kapsamı daraltıyor', async () => {
    const { ctrl, kapsamlar } = kur();
    await ctrl.status({ ...CTX, activeClientId: null } as TenantContext, B);
    expect(kapsamlar).toEqual([B]);
  });
});
