import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { anahtarOzeti } from './okuma-anahtari';

/** `son_kullanim` en çok bu aralıkla yazılıyor — her MCP çağrısında UPDATE atmamak için. */
export const SON_KULLANIM_ARALIGI_MS = 60_000;

/**
 * Okuma anahtarını kullanıcıya çeviren tek yer.
 *
 * BYPASSRLS istemci kullanıyor: bağlamı kurmak için gereken okuma bağlamın
 * kendisinden önce geliyor (`TenantContextService` ile aynı tavuk-yumurta).
 * Satır yalnızca ÖZETLE aranıyor; düz anahtar hiçbir yere yazılmıyor ve
 * log'a da düşmüyor.
 *
 * PLATFORM SAHİPLİĞİ HER İSTEKTE yeniden okunuyor. Anahtar oluşturulduğu
 * anda sahip olan biri bayrağı kaybederse (`db:platform-admin` ile geri
 * alınırsa) anahtarı da anında ölmeli; bayrağı anahtar satırına kopyalamak,
 * yetkisi alınmış kişiye çalışan bir kapı bırakırdı.
 */
@Injectable()
export class OkumaAnahtariDogrulayici {
  private readonly logger = new Logger(OkumaAnahtariDogrulayici.name);

  constructor(private readonly db: PrismaAdminService) {}

  async dogrula(anahtar: string, ip: string | null): Promise<{ userId: string; anahtarId: string }> {
    const satir = await this.db.okumaAnahtari.findUnique({
      where: { anahtarOzeti: anahtarOzeti(anahtar) },
      select: {
        id: true,
        userId: true,
        bitis: true,
        iptal: true,
        sonKullanim: true,
        user: { select: { platformAdmin: true, status: true } },
      },
    });

    /*
     * AYRI CÜMLELER. "Geçersiz anahtar" tek cümlesi, iptal edilmiş, süresi
     * dolmuş ve yanlış kopyalanmış anahtarı aynı hataya çeviriyordu; üçünün
     * yapılacak işi farklı (yenisini al / panelden süreyi gör / tekrar
     * kopyala). Var olmayan anahtar ile iptal edilmiş anahtarı ayırmak bir
     * saldırgana bilgi vermiyor: iptal edilmiş anahtarı bilen zaten onu
     * bir kez elinde tutmuş.
     */
    if (!satir) throw new UnauthorizedException('Okuma anahtarı tanınmadı (yanlış ya da eksik kopyalanmış olabilir)');
    if (satir.iptal) throw new UnauthorizedException('Okuma anahtarı iptal edilmiş');
    if (satir.bitis && satir.bitis.getTime() <= Date.now()) {
      throw new UnauthorizedException('Okuma anahtarının süresi dolmuş');
    }
    if (!satir.user.platformAdmin) {
      throw new UnauthorizedException('Okuma anahtarının sahibi artık platform sahibi değil');
    }
    if (satir.user.status !== 'active') throw new UnauthorizedException('Hesabınız devre dışı');

    if (!satir.sonKullanim || Date.now() - satir.sonKullanim.getTime() > SON_KULLANIM_ARALIGI_MS) {
      /*
       * İSTEĞİ BEKLETMİYOR AMA YUTMUYOR DA: damga yazılamazsa çağrı yine
       * geçiyor (asıl iş okuma), hata log'a düşüyor. Panelde "son kullanım"
       * bayat görünürse sebebi orada.
       */
      void this.db.okumaAnahtari
        .update({ where: { id: satir.id }, data: { sonKullanim: new Date(), sonKullanimIp: ip?.slice(0, 64) ?? null } })
        .catch((err: unknown) =>
          this.logger.warn(`Okuma anahtarı son kullanım damgası yazılamadı: ${String(err)}`),
        );
    }

    return { userId: satir.userId, anahtarId: satir.id };
  }
}
