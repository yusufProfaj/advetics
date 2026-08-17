import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { PlatformApiError } from '../../modules/connections/provider.types';
import type { AuthedRequest } from '../types/request';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  requestId: string;
  errors?: unknown;
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

    if (body.statusCode >= 500) {
      this.logger.error(
        `${req.method} ${req.originalUrl} → ${body.statusCode} [${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${req.method} ${req.originalUrl} → ${body.statusCode} ${body.code} [${requestId}]`,
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
      const platform = exception.platform === 'meta' ? 'Meta' : 'Google';
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
        case 'P2003':
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            code: 'INVALID_REFERENCE',
            message: 'İlişkili kayıt geçersiz',
            requestId,
          };
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
