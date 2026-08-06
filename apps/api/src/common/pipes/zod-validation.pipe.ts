import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodError, type ZodSchema } from 'zod';

/**
 * Zod ile gövde/sorgu doğrulaması.
 *
 * Şemalar @advetics/shared içinde yaşar ve frontend tarafından da kullanılır.
 * Böylece istemci ve sunucu aynı kuralı iki kez, iki farklı şekilde
 * yazmak zorunda kalmaz — bu ikilik, en sık görülen "formda geçti ama API
 * reddetti" hatasının kaynağıdır.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    try {
      return this.schema.parse(value);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestException({
          message: 'Doğrulama hatası',
          code: 'VALIDATION_ERROR',
          errors: err.issues.map((i) => ({
            field: i.path.join('.') || '_',
            message: i.message,
          })),
        });
      }
      throw err;
    }
  }
}

/** Kısayol: `@Body(zodBody(loginSchema)) dto: LoginInput` */
export function zodBody<T>(schema: ZodSchema<T>): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}

/**
 * Kısayol: `@Query(zodQuery(metricsQuerySchema)) q: MetricsQuery`
 *
 * `zodBody` ile aynı doğrulayıcı ama niyeti okunur kılıyor: query string'ten
 * gelen her değer STRING, bu yüzden sayısal alanların şemada `z.coerce`
 * kullanması zorunlu. `zodBody` ile aynı adı paylaşmak bu farkı gizlerdi.
 */
export function zodQuery<T>(schema: ZodSchema<T>): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}
