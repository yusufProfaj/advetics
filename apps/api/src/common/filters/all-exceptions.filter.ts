import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { YapayZekaHatasi } from '../../yapay-zeka/gemini';
import { platformKisaAdi } from '@advetics/shared';
import type { Response } from 'express';
import { PlatformApiError } from '../../modules/connections/provider.types';
import { maskPath } from '../mask-path';
import type { AuthedRequest } from '../types/request';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  requestId: string;
  errors?: unknown;
  retler?: Array<{ kod: string; mesaj: string }>;
}

/**
 * KAPI RETLERİ (`retler`) — Pilot uçlarının 409 gövdesi ("plan neden
 * onaylanamaz", "neden müşteriye gönderilemez"). Bu alan yokken panel
 * yalnız başlığı görüyordu ve sebep sunucuda kalıyordu: "Beklenmeyen bir
 * hata" sınıfının sessiz hâli.
 *
 * GENEL BİR "EK ALANLAR" DELİĞİ DEĞİL: yalnız bu ad, yalnız `{kod, mesaj}`
 * dizgeleri ve en çok 20 öğe geçer. Gövdeyi olduğu gibi geçirmek, bir
 * gün istisnaya konan iç bir nesnenin (sorgu, satır, token) istemciye
 * akması demekti — Prisma dalının sadeleştirme gerekçesiyle aynı.
 */
export function retleriAyikla(v: unknown): Array<{ kod: string; mesaj: string }> | null {
  if (!Array.isArray(v)) return null;
  const r = v
    .filter((x): x is { kod: string; mesaj: string } => !!x && typeof x === 'object' && typeof (x as { kod?: unknown }).kod === 'string' && typeof (x as { mesaj?: unknown }).mesaj === 'string')
    .slice(0, 20)
    .map((x) => ({ kod: x.kod.slice(0, 64), mesaj: x.mesaj.slice(0, 500) }));
  return r.length > 0 ? r : null;
}

/**
 * Tek tip hata gövdesi.
 *
 * Prisma hataları KASITLI olarak sadeleştirilir: ham Prisma mesajları tablo ve
 * kolon adlarını sızdırır. İstemciye ne olduğunu söyleriz, şemayı değil.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<AuthedRequest>();
    const requestId = req.requestId ?? '-';

    const body = this.toErrorBody(exception, requestId);

    /*
     * YOL MASKELENEREK YAZILIYOR. Adresinde sır taşıyan uçlar var (YouTube
     * bildirim geri çağrısı) ve ham `originalUrl` o sırrı pm2 log dosyasına
     * döküyordu — sunucu 11+ üretim sitesiyle paylaşımlı ve DEPLOYMENT.md
     * operatöre `pm2 logs` çalıştırmasını söylüyor.
     */

    if (body.statusCode >= 500) {
      this.logger.error(
        `${req.method} ${maskPath(req.originalUrl)} → ${body.statusCode} [${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${req.method} ${maskPath(req.originalUrl)} → ${body.statusCode} ${body.code} [${requestId}]`,
      );
    }

    res.status(body.statusCode).json(body);
  }

  private toErrorBody(exception: unknown, requestId: string): ErrorBody {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();

      if (typeof response === 'object' && response !== null) {
        const r = response as Record<string, unknown>;
        return {
          statusCode: status,
          code: typeof r.code === 'string' ? r.code : this.defaultCode(status),
          message: typeof r.message === 'string' ? r.message : exception.message,
          requestId,
          ...(r.errors ? { errors: r.errors } : {}),
          ...(retleriAyikla(r.retler) ? { retler: retleriAyikla(r.retler)! } : {}),
        };
      }

      return {
        statusCode: status,
        code: this.defaultCode(status),
        message: String(response),
        requestId,
      };
    }

    /**
     * PLATFORM HATASI — bu dal olmadan Meta'nın söylediği HİÇBİR ŞEY panele
     * ulaşmıyordu.
     *
     * `PlatformApiError` bir `HttpException` DEĞİL, dolayısıyla yukarıdaki
     * dallara takılmıyor ve son dala düşüyordu: 500 "Beklenmeyen bir hata
     * oluştu". Yani "izin yok", "kota doldu", "hesap bulunamadı" ve "geçersiz
     * alan" panelde AYNI cümleye dönüşüyordu.
     *
     * Bunun bedeli ölçüldü: elle boost ekranında lokasyon araması boş döndü ve
     * sebebi koddan bulunamadı çünkü kullanıcıya giden mesajda hiçbir bilgi
     * yoktu. Aynı cümle boost yayınında da görülmüştü (2026-08-17).
     *
     * MESAJ OLDUĞU GİBİ GEÇİYOR ama `detail.raw` GEÇMİYOR: ham gövde
     * platformun döndürdüğü her şeyi taşıyor ve istemciye ne olduğunu
     * söylemek gerekiyor, platformun tüm yanıtını değil — Prisma dalıyla aynı
     * gerekçe. Alt kod (subcode) EKLENİYOR: Meta'nın hata kataloğunda arama
     * ancak onunla yapılabiliyor ve bu iş boyunca en çok işe yarayan ipucu o
     * oldu.
     */
    if (exception instanceof PlatformApiError) {
      const subcode = exception.detail?.platformSubcode;
      /*
       * AD LİSTEDEN. Burada `meta ? 'Meta' : 'Google'` yazıyordu: LinkedIn'in
       * her hatası panelde "Google: ..." diye görünüyordu ve kullanıcı sebebi
       * yanlış platformda arıyordu (canlı tur, 2026-10-05).
       */
      const platform = platformKisaAdi(exception.platform);
      return {
        // KOTA 429, DİĞERLERİ 502. 429 istemcinin geri çekilmesi gereken tek
        // durum; kalanlar yukarı akış hatası ve 502 tam olarak bunu söylüyor.
        // 403 KULLANILMIYOR: bu uygulamada 403 "kullanıcının yetkisi yok"
        // demek ve platform izni eksikliğini oraya koymak, panel yetkilerinde
        // sorun varmış gibi okunurdu.
        statusCode:
          exception.kind === 'rate_limited'
            ? HttpStatus.TOO_MANY_REQUESTS
            : HttpStatus.BAD_GATEWAY,
        code: `PLATFORM_${exception.kind.toUpperCase()}`,
        message: `${platform}: ${exception.message}${
          subcode ? ` (alt kod ${subcode})` : ''
        }`,
        requestId,
      };
    }

    /*
     * ═══ YAPAY ZEKÂ SERVİSİNİN HATASI SON DALA DÜŞMÜYOR ═══
     *
     * Yapay zekâ hatası (`YapayZekaHatasi`, Gemini) bir `HttpException` değil; dalı yokken "kitleyi
     * tarif et" canlıda yalnızca "Beklenmeyen bir hata oluştu" dedi ve
     * sebebi (şema reddi, kota, bağlantı) yalnızca sunucu logundaydı —
     * `PlatformApiError` için bir kez yaşanmış hatanın aynısı. Servisin KENDİ
     * cümlesi ekrana gidiyor; anahtar ya da istek gövdesi içermiyor.
     *
     * 429 istemcinin geri çekilmesi gereken tek durum; kalanlar yukarı akış
     * hatası, 502.
     */
    if (exception instanceof YapayZekaHatasi) {
      return {
        statusCode: exception.durum === 429 ? HttpStatus.TOO_MANY_REQUESTS : HttpStatus.BAD_GATEWAY,
        code: exception.durum === 429 ? 'AI_RATE_LIMITED' : 'AI_ERROR',
        message: `Yapay zekâ servisi isteği tamamlayamadı: ${exception.message}`.slice(0, 500),
        requestId,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return {
            statusCode: HttpStatus.CONFLICT,
            code: 'ALREADY_EXISTS',
            message: 'Bu kayıt zaten mevcut',
            requestId,
          };
        case 'P2025':
          return {
            statusCode: HttpStatus.NOT_FOUND,
            code: 'NOT_FOUND',
            message: 'Kayıt bulunamadı',
            requestId,
          };
        /*
         * P2028 — ETKİLEŞİMLİ TRANSACTION SÜRESİ DOLDU. Raporlar canlıda 5
         * saniyelik varsayılan sınırı 40 saniyeye kadar aşıyordu ve bu da son
         * dala düşüp "Beklenmeyen bir hata" diyordu (2026-10-05). İstemciye
         * ne olduğu ve ne yapılacağı söyleniyor; sebep loga yığın iziyle
         * yazılmaya devam ediyor (503 >= 500).
         */
        case 'P2028':
          return {
            statusCode: HttpStatus.SERVICE_UNAVAILABLE,
            code: 'TIMEOUT',
            message: 'İşlem zaman sınırını aştı. Biraz sonra tekrar dene; sürerse hata kodunu bize ilet.',
            requestId,
          };
        case 'P2003':
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            code: 'INVALID_REFERENCE',
            message: 'İlişkili kayıt geçersiz',
            requestId,
          };
        /**
         * HAM SQL HATASI — `$queryRaw` / `$executeRaw`.
         *
         * ═══ BU DAL OLMADAN HER ŞEY "Beklenmeyen bir hata oluştu" ═══
         *
         * Prisma yalnızca ORM yollarında P2002/P2003/P2025 üretiyor; ham
         * SQL'de kısıt ihlali `P2010` olarak geliyor ve PostgreSQL'in
         * SQLSTATE'i `meta` içinde kalıyor. Bu depoda sorguların büyük
         * kısmı ham SQL (RLS join'siz yazılabilsin diye) — yani en sık
         * karşılaşılan kısıt hatası tam da mesajı KAYBOLAN dala düşüyordu.
         *
         * Canlıda görüldü: e-posta ayarı kaydedilirken benzersizlik ihlali
         * oluştu ve kullanıcının gördüğü tek şey "Beklenmeyen bir hata
         * oluştu" oldu — hangi alanın, neden. CLAUDE.md: "Bu cümle bu
         * projede bir turu tamamen kaybettirdi."
         */
        case 'P2010': {
          const sqlstate = pgKodu(exception.meta);
          const eslesen = sqlstate ? SQLSTATE_MESAJLARI[sqlstate] : undefined;
          /*
           * `requestId` BURADA EKLENİYOR, tabloda DEĞİL. Tabloya sabit bir
           * değer yazmak, her yanıtın aynı (ve yanlış) istek kimliğini
           * taşıması demekti — log ile ekranı eşleştirmek imkânsızlaşırdı.
           */
          return (
            (eslesen && { ...eslesen, requestId }) ?? {
              /*
               * BİLİNMEYEN KODDA VERİTABANI MESAJI YAZILMIYOR, KODU
               * YAZILIYOR. Ham mesaj tablo ve kolon adlarını taşıyor ve
               * panelde göstermek şema bilgisini dışarı vermek olurdu;
               * SQLSTATE ise teşhis için yeterli ve anlamsız bir dize
               * değil.
               */
              statusCode: HttpStatus.BAD_REQUEST,
              code: 'DB_ERROR',
              message: `Veritabanı isteği reddedildi${sqlstate ? ` (kod ${sqlstate})` : ''}`,
              requestId,
            }
          );
        }
        default:
          break;
      }
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Beklenmeyen bir hata oluştu',
      requestId,
    };
  }

  private defaultCode(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE',
      429: 'RATE_LIMITED',
    };
    return map[status] ?? 'ERROR';
  }
}

/**
 * PostgreSQL SQLSTATE → kullanıcıya söylenecek cümle.
 *
 * ORM dallarıyla AYNI mesajlar kullanılıyor (`P2002` → "Bu kayıt zaten
 * mevcut"): aynı arıza, hangi yoldan geldiğine göre farklı cümle
 * göstermemeli — kullanıcı iki ayrı sorun olduğunu sanır.
 */
const SQLSTATE_MESAJLARI: Record<
  string,
  { statusCode: number; code: string; message: string }
> = {
  // unique_violation
  '23505': {
    statusCode: HttpStatus.CONFLICT,
    code: 'ALREADY_EXISTS',
    message: 'Bu kayıt zaten mevcut',
  },
  // foreign_key_violation
  '23503': {
    statusCode: HttpStatus.BAD_REQUEST,
    code: 'INVALID_REFERENCE',
    message: 'İlişkili kayıt geçersiz',
  },
  // not_null_violation
  '23502': {
    statusCode: HttpStatus.BAD_REQUEST,
    code: 'MISSING_FIELD',
    message: 'Zorunlu bir alan boş bırakıldı',
  },
  // check_violation
  '23514': {
    statusCode: HttpStatus.BAD_REQUEST,
    code: 'INVALID_VALUE',
    message: 'Girilen değer bu alanın kısıtını karşılamıyor',
  },
  /*
   * insufficient_privilege — RLS reddi de buraya düşüyor.
   * "Yetkiniz yok" demek doğru cevap: satır var ama bu bağlamda
   * erişilemiyor ve kullanıcıya bunu söylemek, sessizce boş dönmekten iyi.
   */
  '42501': {
    statusCode: HttpStatus.FORBIDDEN,
    code: 'FORBIDDEN',
    message: 'Bu kayda erişim yetkiniz yok',
  },
};

/**
 * Prisma'nın `meta` nesnesinden PostgreSQL SQLSTATE'ini okur.
 *
 * `meta` DENETİMSİZ (`unknown`): Prisma sürümleri arasında şekli değişiyor
 * ve `as` ile susturmak, bir gün alan kaybolduğunda çalışma anında
 * patlamak demekti. Bulunamazsa `null` — çağıran o hâli zaten yazıyor.
 */
function pgKodu(meta: unknown): string | null {
  if (typeof meta !== 'object' || meta === null) return null;
  const kod = (meta as Record<string, unknown>).code;
  return typeof kod === 'string' && kod.length > 0 ? kod : null;
}
