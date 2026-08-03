import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import type { AuthedRequest } from '../types/request';

/**
 * Her isteğe izlenebilir bir kimlik atar.
 *
 * Bu kimlik hata gövdesine, log satırlarına ve audit_logs kaydına yazılır.
 * Müşteri "saat 14:30'da bütçem neden düştü" diye sorduğunda, tek bir
 * requestId ile HTTP isteğinden denetim kaydına kadar izlenebilmelidir.
 *
 * NestMiddleware yerine düz Express middleware'i olarak yazıldı ve main.ts'te
 * `app.use()` ile bağlandı. Sebep: Express 5'te `forRoutes('*')` artık geçersiz
 * (path-to-regexp v8 adlandırılmamış joker kabul etmiyor) ve bu middleware'in
 * gerçekten HER istekte çalışması gerekiyor — hata yollarında bile.
 */
export function requestIdMiddleware(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.headers['x-request-id'];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;

  req.requestId = candidate && candidate.length <= 64 ? candidate : randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
}
