import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import type { TenantContext } from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { AutoBoostQueueList } from '@advetics/shared';
import {
  autoBoostDecisionSchema,
  type AutoBoostDecisionInput,
  autoBoostPresetInputSchema,
  type AutoBoostPresetInput,
  type AutoBoostPresetRecord,
  type AutoBoostSubscriptionHealth,
} from '@advetics/shared';
import { AutoBoostPresetService } from './autoboost-preset.service';
import { AutoBoostLaunchService } from './autoboost-launch.service';
import { AutoBoostReadService } from './autoboost-read.service';
import { BoostKontrolService } from './boost-kontrol.service';
import { GecmisIcerikService } from './gecmis-icerik.service';
import { YouTubeSubscribeService } from './youtube-subscribe.service';
import { ConnectionsService } from '../connections/connections.service';
import type { AuthedRequest } from '../../common/types/request';

/**
 * Tek tıkla yayın gövdesi — SADECE müşteri kimliği.
 *
 * `strict()` KASITLI: gövdeye bütçe ya da hedefleme sızarsa istek REDDEDİLİR.
 * Sessizce yok saymak, "ön ayar uygulandı" sanılan ama aslında istemcinin
 * gönderdiği bir alanın uygulandığı bir gelecek bırakırdı.
 */
const presetLaunchSchema = z.object({ clientId: z.string().uuid() }).strict();

/**
 * Advetics 1.0 — otomatik boost yönetimi.
 *
 * WEBHOOK UCU AYRI BİR CONTROLLER'DA (`YouTubeWebSubController`) ve bu
 * bilinçli: orası `@Public()`, burası değil. İkisini aynı sınıfta tutmak,
 * `@Public()`'in yanlışlıkla sınıf seviyesine kayması ve BÜTÜN uçların
 * açılması riskini taşırdı.
 */

const gecmisIcerikSchema = z.object({ clientId: z.string().uuid() });

/**
 * Bütçe girdisi — ön ayar formundaki `autoBoostBudgetSchema.amount` ile AYNI
 * kural. Alt sınır 20 ₺: daha küçük bütçe Meta'da dağıtım almıyor ve
 * kullanıcı "yayında ama gösterim yok" hâlini teşhis edemiyor.
 */
const butceSchema = z.object({
  amount: z
    .string()
    .regex(/^\d+([.,]\d{1,2})?$/, 'Geçerli bir tutar gir')
    .refine((v) => Number(v.replace(',', '.')) >= 20, {
      message: 'En az 20 ₺ — daha küçük bütçe dağıtım almıyor',
    }),
});

const kanalAtaSchema = z.object({
  /** NULL = workspace'ten çıkar, havuza geri koy. */
  clientId: z.string().uuid().nullable(),
});

const kanalEkleSchema = z.object({
  /**
   * NULL = HAVUZA EKLE, henüz bir workspace'e atama.
   *
   * Kanal bağlamak bir kurulum işi ve bağlantı ekranında yapılıyor; hangi
   * workspace'e ait olduğu ORADA, atama listesinde seçiliyor — Instagram
   * hesabıyla birebir aynı akış. Alanı zorunlu tutmak, kanalı ekleyen kişiyi
   * o anda bir workspace seçmeye zorlar ve seçim yanlışsa kanal yanlış
   * müşteride abone olurdu.
   */
  clientId: z.string().uuid().nullable().default(null),
  /**
   * Kullanıcının yapıştırdığı şey — kanal kimliği, @tanıtıcı ya da adres.
   * Hangi biçim olduğu sunucuda çözülüyor; kullanıcıya "kanal kimliğini gir"
   * demek, o kavramı bilmesini beklemek olurdu.
   */
  channelInput: z.string().min(1).max(500),
});

@Controller('autoboost')
export class AutoBoostController {
  constructor(
    private readonly subscribe: YouTubeSubscribeService,
    private readonly read: AutoBoostReadService,
    private readonly launch: AutoBoostLaunchService,
    private readonly presets: AutoBoostPresetService,
    private readonly gecmis: GecmisIcerikService,
    private readonly kontrol: BoostKontrolService,
    /**
     * SAHİPLİK DEĞİŞİMİ MEVCUT KAPIDAN GEÇİYOR.
     *
     * `assignSocialProfile` denetim kaydını, `org_id` taşımasını ve eski
     * müşteride kalan form sayısını zaten yazıyor. İkinci bir atama yolu
     * yazmak, bunların birini unutup sessizce yarım bir satır üretmekti.
     */
    private readonly connections: ConnectionsService,
  ) {}

  /**
   * YouTube aboneliklerinin sağlığı — ölü adam düğmesi.
   *
   * `boost.read` yetiyor: yalnızca okuyor.
   */
  @Get('subscriptions/health')
  @RequirePermissions('boost.read')
  health(
    @CurrentTenant() ctx: TenantContext,
    @Query('clientId', ParseUUIDPipe) clientId: string,
  ): Promise<AutoBoostSubscriptionHealth[]> {
    return this.read.subscriptionHealth(ctx, clientId);
  }

  /** "Boost ön ayarı" modalı — bu müşterinin ön ayarları. */
  @Get('presets')
  @RequirePermissions('boost.read')
  listPresets(
    @CurrentTenant() ctx: TenantContext,
    @Query('clientId', ParseUUIDPipe) clientId: string,
  ): Promise<AutoBoostPresetRecord[]> {
    return this.presets.list(ctx, clientId);
  }

  /**
   * Ön ayarı kaydeder.
   *
   * `boost.write` İSTİYOR, `boost.approve` DEĞİL. Ön ayar yazmak para
   * harcamıyor — harcamayı başlatan şey kartın onaylanması ve o ayrı bir
   * yetkide. Modül 7'nin baştan beri taşıdığı ayrım.
   */
  @Put('presets')
  @RequirePermissions('boost.write')
  savePreset(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(autoBoostPresetInputSchema)) input: AutoBoostPresetInput,
  ): Promise<AutoBoostPresetRecord> {
    return this.presets.upsert(ctx, input);
  }

  /**
   * "ONAYLA VE BOOSTLA" — kartı yayına alır ya da reddeder.
   *
   * `boost.approve` İSTİYOR, `boost.read` DEĞİL. Bu uç ara onay adımı olmadan
   * PARA TAAHHÜT EDİYOR; okuma yetkisiyle aynı kefeye koymak, kartları
   * görebilen herkesin harcama başlatabilmesi demekti. Modül 7'nin baştan
   * beri taşıdığı ayrım.
   */
  @Post('queue/:id/decision')
  @RequirePermissions('boost.approve')
  decide(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(autoBoostDecisionSchema)) body: AutoBoostDecisionInput,
  ): Promise<{ status: string; message: string }> {
    /*
     * ÖZELLEŞTİRME BURADAN GEÇİYOR ve ön ayarı DEĞİŞTİRMİYOR. Kaydeden bir
     * uç değil: kullanıcı "sadece bu gönderi için" dediğinde sonraki
     * gönderilerin sessizce etkilenmesi, istediğinin tam tersi olurdu.
     */
    return this.launch.decide(ctx, id, body.approve, body.override);
  }

  /**
   * ═══ YAYINDAKİ BOOST'UN KONTROLÜ ═══
   *
   * Üçü de `boost.approve` istiyor: ikisi harcamayı durduruyor, biri yeniden
   * başlatıyor ve üçü de CANLI BİR KAMPANYANIN parasını yönetiyor. Okuma
   * yetkisiyle aynı kefeye koymak, kartları görebilen herkesin yayını
   * durdurabilmesi demekti.
   */
  @Post('queue/:id/duraklat')
  @RequirePermissions('boost.approve')
  duraklat(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ status: string; message: string }> {
    return this.kontrol.duraklat(ctx, id);
  }

  @Post('queue/:id/surdur')
  @RequirePermissions('boost.approve')
  surdur(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ status: string; message: string }> {
    return this.kontrol.surdur(ctx, id);
  }

  /**
   * YAYINDAKİ BOOST'UN BÜTÇESİ.
   *
   * Tutar ANA PARA BİRİMİNDE geliyor ("300" = 300 ₺) ve micros'a burada
   * çevriliyor — ön ayar formuyla aynı sözleşme. İstemcinin micros
   * göndermesi, bir sıfır fazlasında bütçeyi bin katına çıkarırdı.
   */
  @Post('queue/:id/butce')
  @RequirePermissions('boost.approve')
  async butce(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(butceSchema)) body: { amount: string },
  ): Promise<{ status: string; message: string }> {
    const micros = BigInt(Math.round(Number(body.amount.replace(',', '.')) * 1_000_000));
    return this.kontrol.butceGuncelle(ctx, id, micros);
  }

  @Post('queue/:id/iptal')
  @RequirePermissions('boost.approve')
  iptal(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ status: string; message: string }> {
    return this.kontrol.iptal(ctx, id);
  }

  /**
   * ═══ TEKRAR BOOSTLA ═══
   *
   * Yayınlanmış, reddedilmiş ya da düşmüş bir kartı KARARA geri açıyor.
   *
   * `boost.write` İSTİYOR, `boost.approve` DEĞİL: bu uç para harcamıyor,
   * yalnızca kartı yeniden onaylanabilir yapıyor. Harcama kararı "Onayla"da
   * ve o ayrı bir yetki — geçmiş içerik çekimiyle aynı ayrım.
   */
  @Post('queue/:id/tekrar')
  @RequirePermissions('boost.write')
  tekrar(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ status: string; message: string }> {
    return this.launch.tekrarBoostla(ctx, id);
  }

  /**
   * KARTI KAPAT — "bir daha yayınlama".
   *
   * `boost.write` İSTİYOR: para harcamıyor ve yayındaki bir reklama
   * dokunmuyor; yalnızca kartın durumunu değiştiriyor.
   */
  @Post('queue/:id/kapat')
  @RequirePermissions('boost.write')
  kapat(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ status: string; message: string }> {
    return this.launch.kapat(ctx, id);
  }

  /**
   * TEK TIKLA YAYIN — gönderi listesindeki "Yayınla" düğmesi.
   *
   * GÖVDE YALNIZCA MÜŞTERİ KİMLİĞİ TAŞIYOR: bütçe, süre, hedefleme ve ad
   * boost ön ayarından geliyor. İstemcinin gönderebileceği bir bütçe
   * alanı OLMAMASI kasıtlı — olsaydı "kullanıcı hiçbir şey girmiyor" iddiası
   * yalnızca arayüzde doğru olurdu ve API'yi doğrudan çağıran biri ön ayarı
   * atlayabilirdi.
   *
   * `boost.approve` İSTİYOR: bu uç ara onay adımı olmadan PARA TAAHHÜT
   * EDİYOR. `boost.read` ile aynı kefeye koymak, gönderileri görebilen
   * herkesin harcama başlatabilmesi demekti.
   */
  @Post('posts/:postId/launch')
  @RequirePermissions('boost.approve')
  launchPost(
    @CurrentTenant() ctx: TenantContext,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Body(zodBody(presetLaunchSchema)) body: { clientId: string },
  ): Promise<{ status: string; message: string }> {
    return this.launch.gonderiyiYayinla(ctx, body.clientId, postId);
  }

  /**
   * BİLDİRİM HAVUZU — onay bekleyen kartlar.
   *
   * `boost.read` yetiyor: yalnızca okuyor. Onaylamak ayrı bir yetki ve ayrı
   * bir uç nokta — Modül 7'nin baştan beri taşıdığı ayrım.
   */
  @Get('queue')
  @RequirePermissions('boost.read')
  queue(
    @CurrentTenant() ctx: TenantContext,
    @Query('clientId', ParseUUIDPipe) clientId: string,
  ): Promise<AutoBoostQueueList> {
    return this.read.listQueue(ctx, clientId);
  }

  /**
   * GEÇMİŞ İÇERİĞİ KUYRUĞA ÇEKER — kullanıcının bastığı düğme.
   *
   * ═══ NEDEN BİR UÇ NOKTA GEREKTİ ═══
   *
   * Kart üretiminin iki otomatik yolu da TEK SEFERLİKTİ (ön ayarın tohum
   * damgası, kanalın atanma anı). Koşullardan biri o an yerinde değilse
   * fırsat harcanıyor ve kullanıcının elinde hiçbir düğme kalmıyordu.
   *
   * `boost.write` İSTİYOR, `boost.approve` DEĞİL: bu uç PARA HARCAMIYOR,
   * yalnızca onay bekleyen kart üretiyor. Harcama kararı kartın kendi
   * düğmesinde ve o ayrı bir yetki.
   */
  @Post('gecmis-icerik')
  @RequirePermissions('boost.write')
  gecmisIcerik(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(gecmisIcerikSchema)) body: { clientId: string },
  ): Promise<{ kartlar: number; notlar: string[] }> {
    return this.gecmis.cek(ctx, body.clientId);
  }

  /**
   * YouTube kanalı ekler ve bildirim aboneliğini başlatır.
   *
   * `connection.write` İSTİYOR: kanal eklemek bir bağlantı kurulumu işi ve
   * CLAUDE.md'ye göre bağlantı kurmak/kaldırmak org yöneticisi işi. Boost
   * yetkileriyle karıştırmak, kart onaylayabilen herkesin yeni kanal
   * bağlayabilmesi demekti.
   */
  @Post('youtube/channels')
  @RequirePermissions('connection.write')
  addYouTubeChannel(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(kanalEkleSchema)) input: z.infer<typeof kanalEkleSchema>,
  ): Promise<{ socialProfileId: string; channelId: string; title: string }> {
    return this.subscribe.addChannel(ctx, input);
  }

  /**
   * YouTube kanalını bir workspace'e atar ya da havuza geri koyar.
   *
   * ═══ NEDEN AYRI BİR UÇ ═══
   *
   * Instagram sayfası için atama SAHİPLİK değişiminden ibaret; YouTube'da
   * aynı hareket üç iş birden yapıyor: sahiplik, hub aboneliği ve kanalın
   * son videolarının kuyruğa düşmesi. Bunları panelin iki ayrı çağrısına
   * bölmek, birincisi başarıp ikincisi düştüğünde "kanal atandı ama kart
   * gelmiyor" hâlini üretirdi — bu projenin klasik yarım satırı.
   *
   * `connection.write` — kanal eklemekle aynı yetki ve aynı gerekçe.
   */
  @Patch('youtube/channels/:socialProfileId/client')
  @RequirePermissions('connection.write')
  async setYouTubeChannelClient(
    @CurrentTenant() ctx: TenantContext,
    @Param('socialProfileId', ParseUUIDPipe) socialProfileId: string,
    @Body(zodBody(kanalAtaSchema)) input: z.infer<typeof kanalAtaSchema>,
    @Req() req: AuthedRequest,
  ): Promise<{ clientId: string | null; kartlar: number; note: string }> {
    const atama = await this.connections.assignSocialProfile(
      ctx,
      socialProfileId,
      input.clientId,
      { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null, requestId: req.requestId },
    );

    if (input.clientId === null) {
      await this.subscribe.kanaliCoz(ctx, socialProfileId);
      return {
        clientId: null,
        kartlar: 0,
        note: 'Kanal havuza geri kondu, bildirim aboneliği kapatıldı.',
      };
    }

    const sonuc = await this.subscribe.kanaliBagla(ctx, socialProfileId, input.clientId);
    return { clientId: atama.clientId, kartlar: sonuc.kartlar, note: sonuc.note };
  }
}
