import { Controller, Get, Header, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators';
import { YouTubeWebSubService } from './youtube-websub.service';

/**
 * YOUTUBE BİLDİRİM UCU (WebSub).
 *
 * `@Public()` — GLOBAL GUARD VARSAYILAN OLARAK KİLİTLİ ve bu rotayı açmak
 * bilinçli bir eylem. Hub'ın oturumu yok; kimlik doğrulaması üç katmanla
 * sağlanıyor ve hiçbiri JWT değil:
 *
 *   1. Adresteki TAHMİN EDİLEMEZ belirteç (ana anahtardan türetiliyor)
 *   2. İMZA + öğren-ve-kilitle (ilk geçerli imzadan sonra imzasız reddediliyor)
 *   3. Videonun YouTube Data API'den DOĞRULANMASI (asıl savunma)
 *
 * Üçü de güvenlik incelemesinin sonucu; ilk tasarım üçünden ikisinde düştü.
 *
 * ═══ HER YOLDA 200 ═══
 *
 * Reddedilen bildirimlerde bile 200 dönülüyor. Sebep hub'ın davranışı: 2xx
 * dışı yanıt "teslim başarısız" sayılıyor ve bildirim tekrarlanıyor; ısrarlı
 * başarısızlık aboneliği tamamen düşürebiliyor. Yani sahte bir isteğe 403
 * dönmek, saldırganın ABONELİĞİ ÖLDÜRMESİNE imkân verirdi — reddetmenin
 * kendisi bir hizmet dışı bırakma aracına dönüşürdü.
 *
 * Tek istisna bilinmeyen belirteç (404): hub bizim aboneliğimiz olmayan bir
 * uca zaten bildirim göndermiyor, dolayısıyla orada tekrar riski yok.
 */
@Controller('webhooks/youtube')
export class YouTubeWebSubController {
  constructor(private readonly websub: YouTubeWebSubService) {}

  /**
   * Hub'ın abonelik doğrulaması.
   *
   * CEVAP DÜZ METİN VE `hub.challenge` BİREBİR. Nest varsayılan olarak JSON
   * seri hâle getiriyor; challenge tırnak içinde dönerse hub aboneliği
   * kurmuyor ve hata da vermiyor — sessiz arıza.
   */
  @Public()
  @Get(':token')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async verify(
    @Param('token') token: string,
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.topic') topic: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Query('hub.lease_seconds') leaseSeconds: string | undefined,
    @Query('hub.reason') reason: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const sonuc = await this.websub.verifySubscription({
      token,
      mode,
      topic,
      challenge,
      leaseSeconds,
      reason,
    });
    res.status(sonuc.status).send(sonuc.body);
  }

  /**
   * Hub'ın bildirim gönderisi.
   *
   * HAM GÖVDE `req.body`'DEN OKUNUYOR ve orada bir Buffer.
   *
   * NestJS'in `rawBody: true` seçeneği bu uçta ÇALIŞMIYOR: kanca yalnızca
   * `json` ve `urlencoded` parser'lara takılı, YouTube ise `application/
   * atom+xml` gönderiyor. İmza ham baytlar üzerinden hesaplandığı için
   * ayrıştırılmış bir gövdeden geri üretilemiyor — bu yüzden `main.ts` bu yol
   * için `express.raw` kaydediyor ve `req.body` doğrudan Buffer geliyor.
   *
   * Bu tuzak kod yazılmadan önce araştırmada tespit edildi; edilmeseydi imza
   * her zaman geçersiz çıkar ve sebebi hiç görünmezdi.
   */
  @Public()
  @Post(':token')
  @HttpCode(200)
  async notify(
    @Param('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

    const sonuc = await this.websub.handleNotification({
      token,
      rawBody,
      // Başlık adı Meta'nınkinden FARKLI: WebSub 0.4 `X-Hub-Signature`,
      // Meta `X-Hub-Signature-256`. Tek bir ortak okuma sessiz düşüş üretirdi.
      signatureHeader: req.get('x-hub-signature') ?? undefined,
      // Beyaz liste İÇİN DEĞİL — App Engine çıkış IP'leri bütün Google Cloud
      // kiracılarıyla ortak. Yalnızca olay sonrası inceleme için.
      sourceIp: req.ip ?? null,
    });

    res.status(sonuc.status).send(sonuc.body);
  }
}
