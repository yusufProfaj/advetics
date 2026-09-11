import { Injectable } from '@nestjs/common';
import type { BaglantiDurumu, TenantContext, Uyari, UyariYaniti } from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  baglantiUyarilari,
  hesapUyarilari,
  hesapsizMusteriUyarisi,
  siralaUyarilari,
  type UyariBaglantisi,
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
          connection: {
            select: {
              id: true,
              platform: true,
              status: true,
              tokenExpiresAt: true,
              accountLabel: true,
              updatedAt: true,
            },
          },
        },
      });

      const uyarilar: Uyari[] = [];

      /*
       * BAĞLANTI UYARILARI BAĞLANTI BAŞINA BİR KEZ.
       *
       * Önce hesap kurallarının içindeydiler ve her atanmış hesap için bir
       * kopya üretiyorlardı: ajansın TEK Meta bağlantısı onlarca hesaba
       * hizmet ediyor, yani tek bir süre uyarısı onlarca birebir aynı satır
       * demekti. `LIMIT` 20 olduğu için kopyalar GERÇEK uyarıları listenin
       * dışına itiyordu ve gizleme anahtarı hesap bazlı olduğu için biri
       * kapatılınca diğerleri kalıyordu. Kullanıcının gördüğü hâl: *"sürekli
       * şimdi yetkilendir bildirimi gözüküp duruyor."*
       *
       * SAYIM ATANMIŞ HESAPLAR ÜZERİNDEN: sorgu zaten `clientId: { not:
       * null }` ile süzülü. Hiçbir hesabı atanmamış bir bağlantı buradan
       * uyarı üretmiyor — müşteri tarafında duran bir şey yok ve o bağlantı
       * Platform Bağlantıları ekranında zaten kendi durumunu gösteriyor.
       */
      const baglantilar = new Map<string, UyariBaglantisi>();
      for (const h of hesaplar) {
        const mevcut = baglantilar.get(h.connection.id);
        if (mevcut) {
          mevcut.etkilenenHesap += 1;
          continue;
        }
        baglantilar.set(h.connection.id, {
          id: h.connection.id,
          platform: h.connection.platform,
          status: h.connection.status,
          tokenExpiresAt: h.connection.tokenExpiresAt,
          accountLabel: h.connection.accountLabel,
          etkilenenHesap: 1,
          veriZamani: h.connection.updatedAt,
        });
      }
      for (const b of baglantilar.values()) {
        uyarilar.push(...baglantiUyarilari(b, simdi));
      }

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

      /*
       * DURUM SATIRLARI UYARIDAN AYRI.
       *
       * Yetkinin kaç gün sonra dolacağı bir SORUN değil; sorun hâline
       * gelmeden önce bakılabilen bir bilgi. Uyarı listesine koymak her gün
       * "yeniden yetkilendir" diye dürtmek demekti.
       *
       * KESİLMİYOR (`LIMIT` uygulanmıyor): bağlantı sayısı avuç içi kadar
       * ve bu bölüm bir liste değil, bir tablo — yarısını göstermek
       * "hangileri eksik" sorusunu doğururdu.
       */
      const baglantiDurumlari: BaglantiDurumu[] = [...baglantilar.values()].map((b) => ({
        id: b.id,
        platform: b.platform,
        etiket: b.accountLabel,
        durum: b.status,
        kalanGun:
          b.tokenExpiresAt === null
            ? null
            : Math.floor((b.tokenExpiresAt.getTime() - simdi.getTime()) / 86_400_000),
        etkilenenHesap: b.etkilenenHesap,
      }));

      const sirali = siralaUyarilari(uyarilar);
      return {
        baglantilar: baglantiDurumlari,
        uyarilar: sirali.slice(0, LIMIT),
        toplam: sirali.length,
        uretildi: simdi.toISOString(),
      };
    });
  }
}
