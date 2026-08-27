import { Injectable } from '@nestjs/common';
import type { TenantContext, Uyari, UyariYaniti } from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  hesapUyarilari,
  hesapsizMusteriUyarisi,
  siralaUyarilari,
  type UyariHesabi,
} from './uyari-kurallari';

/**
 * Bir yanıtta taşınan en fazla uyarı.
 *
 * Kesme SESSİZ DEĞİL: `toplam` her zaman gerçek sayıyı taşıyor ve panel
 * "gösterilen 20, toplam 63" yazıyor. 481 hesaplı bir havuzda kesme
 * olmasaydı bant kullanılamaz hâle gelirdi.
 */
const LIMIT = 20;

/**
 * Uyarı üretici.
 *
 * KAPSAM RLS'TEN GELİYOR. Aktif müşteri seçiliyken yalnızca onun uyarıları,
 * "Tüm müşteriler" seçiliyken erişilen bütün müşterilerinki dönüyor —
 * `withTenant` zaten bunu yapıyor ve burada ikinci bir süzgeç yazmak, aynı
 * kuralı iki yerde tutmak olurdu.
 */
@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ctx: TenantContext): Promise<UyariYaniti> {
    const simdi = new Date();

    return this.prisma.withTenant(ctx, async (tx) => {
      /*
       * `select` AÇIKÇA YAZILIYOR, `include` DEĞİL.
       *
       * `include` ilişkinin BÜTÜN kolonlarını çekiyor ve `platform_connections`
       * içinde `access_token_enc` (şifreli token) ile `page_access_token_enc`
       * var. 481 hesaplı bir havuzda her sayfa yüklemesinde şifreli token'ları
       * belleğe almak, yanıtta hiç görünmeyen ama gerçek bir maliyet.
       * (`connections-select.spec.ts` aynı tuzağı orada kilitliyor.)
       *
       * `raw` BİLEREK ÇEKİLİYOR: ödeme uyarısının dayandığı sayısal
       * `account_status` yalnızca orada duruyor.
       */
      const hesaplar = await tx.adAccount.findMany({
        where: { clientId: { not: null } },
        select: {
          id: true,
          name: true,
          platform: true,
          status: true,
          syncEnabled: true,
          lastInsightsSyncAt: true,
          lastStructureSyncAt: true,
          updatedAt: true,
          raw: true,
          clientId: true,
          client: { select: { name: true } },
          connection: { select: { status: true, tokenExpiresAt: true } },
        },
      });

      const uyarilar: Uyari[] = [];

      for (const h of hesaplar) {
        const satir: UyariHesabi = {
          id: h.id,
          name: h.name,
          platform: h.platform,
          status: h.status,
          syncEnabled: h.syncEnabled,
          lastInsightsSyncAt: h.lastInsightsSyncAt,
          lastStructureSyncAt: h.lastStructureSyncAt,
          updatedAt: h.updatedAt,
          raw: h.raw,
          clientId: h.clientId,
          clientName: h.client?.name ?? null,
          connectionStatus: h.connection.status,
          connectionTokenExpiresAt: h.connection.tokenExpiresAt,
        };
        uyarilar.push(...hesapUyarilari(satir, simdi));
      }

      /*
       * HESABI OLMAYAN MÜŞTERİ HESAP SATIRINDAN ÜRETİLEMEZ.
       *
       * Yukarıdaki döngü hesapların üzerinde dönüyor; hiç hesabı olmayan
       * müşterinin hiç satırı yok ve o müşteri sessizce uyarısız kalırdı —
       * oysa "hiç veri görünmüyor" hâllerinin en yaygın sebebi tam bu.
       */
      const atanmisIdler = new Set(hesaplar.map((h) => h.clientId));
      const musteriler = await tx.client.findMany({
        where: { status: 'active' },
        select: { id: true, name: true },
      });
      for (const m of musteriler) {
        if (!atanmisIdler.has(m.id)) uyarilar.push(hesapsizMusteriUyarisi(m));
      }

      const sirali = siralaUyarilari(uyarilar);
      return {
        uyarilar: sirali.slice(0, LIMIT),
        toplam: sirali.length,
        uretildi: simdi.toISOString(),
      };
    });
  }
}
