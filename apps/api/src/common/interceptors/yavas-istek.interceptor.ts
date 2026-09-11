import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, finalize, tap } from 'rxjs';
import { maskPath } from '../mask-path';

/**
 * ═══ YAVAŞ İSTEK LOG'U — "YAVAŞ" BİR ÖLÇÜM DEĞİL ═══
 *
 * Ajans genel bakışının yavaşlığı üç turdur kapatılmaya çalışılıyor ve her
 * turda ELİMDE BİR SAYI YOKTU: RLS yüklemi düzeltildi, sorgu süzgeci
 * sorgunun içine indi, yine "hâlâ çok yavaş" geldi. Tahminle optimizasyon,
 * bu depoda yasaklanmış olan "tahmin etmektense kısıtla" kuralının ta
 * kendisi — önce ÖLÇÜLMESİ gerekiyordu.
 *
 * ÖLÇÜM NEDEN BURADA: panel bir ekranı çizerken ALTI ayrı uca istek
 * atıyor (`summary`, `timeseries`, `breakdown`, `clients`, `organizations`,
 * kapsam). Kullanıcının gördüğü "yavaş" bunların TOPLAMI ve hangisinin
 * yavaş olduğu tarayıcıdan da anlaşılmıyor (hepsi tek bir sunucu
 * render'ının içinde). Uç başına süre, sorunun hangi sorguda olduğunu tek
 * bakışta söylüyor.
 *
 * ┌─ NEDEN HER İSTEK DEĞİL ───────────────────────────────────────────────┐
 * │ Sunucu 11+ üretim sitesiyle PAYLAŞIMLI ve pm2 log'ları diske yazıyor. │
 * │ Her isteği yazmak, teşhis için açılan bir kaydın diski doldurması     │
 * │ demekti. Eşiğin ÜSTÜ yazılıyor; altı sessiz.                          │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * YOL MASKELENİYOR (`maskPath`): adresinde belirteç taşıyan uçlar var ve
 * bu satırlar `pm2 logs` çıktısına, oradan da sohbete yapıştırılıyor.
 * Sorgu dizesi de maskeleyiciden geçiyor; tarih aralığı teşhis için
 * gerekli ama sırrı olan bir parametre eklendiği gün burada sızardı.
 *
 * ═══ NEDEN `finalize`, `tap({ complete })` DEĞİL ═══
 *
 * İki hâl `complete` üretmiyor ve İKİSİ DE tam olarak aradığımız vaka:
 *
 *   · HATA — en yavaş istek çoğu zaman zaman aşımına düşüp hata veren
 *     istek oluyor (20 saniyelik transaction tavanına çarpan sorgu).
 *     Yalnızca başarıyı ölçen bir sayaç onu kaçırırdı.
 *   · ABONELİĞİN ERKEN KAPANMASI — istemci beklemekten vazgeçip bağlantıyı
 *     kesince akış `complete` etmeden sonlanıyor. Kullanıcının "çok
 *     bekletiyor" dediği an bu olabilir ve log'da hiç görünmezdi.
 *
 * `finalize` üçünü de kapsıyor; başarı/hata ayrımı `tap`teki bayrakta
 * tutuluyor. (İlk yazımda `tap({ complete })` vardı ve testte `of()`
 * akışında hiç tetiklenmedi — aynı sebep.)
 */
@Injectable()
export class YavasIstekInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Süre');

  constructor(private readonly esikMs: number) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const baslangic = process.hrtime.bigint();

    const yaz = (sonuc: string) => {
      // NANOSANİYE → MİLİSANİYE tam sayı aritmetiğiyle: `Date.now()` farkı
      // 1 ms çözünürlükte ve hızlı uçları hep 0 gösteriyor.
      const ms = Number((process.hrtime.bigint() - baslangic) / 1_000_000n);
      if (ms < this.esikMs) return;
      const durum = http.getResponse<Response>().statusCode;
      this.logger.warn(
        `YAVAŞ ${ms}ms · ${req.method} ${maskPath(req.originalUrl)} · ${sonuc} ${durum}`,
      );
    };

    let sonuc = 'ok';
    return next.handle().pipe(
      tap({ error: () => (sonuc = 'hata') }),
      finalize(() => yaz(sonuc)),
    );
  }
}
