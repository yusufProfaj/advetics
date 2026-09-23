import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { TenantContext } from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ProviderRegistry } from '../connections/provider.registry';
import { TokenVaultService } from '../connections/token-vault.service';

/**
 * ═══ YAYINDAKİ BOOST'UN KONTROLÜ ═══
 *
 * Kart yayına girdikten sonra panelde yapılacak hiçbir şey kalmıyordu: reklam
 * Meta'da harcamaya devam ediyor, kullanıcı onu durdurmak için Ads Manager'a
 * gidiyordu. Bu ekranın vaadi "reklamcılık bilmeyen biri de kullanabilsin" ve
 * o vaat, başlatabilip durduramadığın bir üründe tutmuyor.
 *
 * ÜÇ EYLEM, ÜÇ AYRI NİYET:
 *
 *   · DURAKLAT — harcama dursun, karar sonra verilsin. Geri alınabilir.
 *   · SÜRDÜR   — duraklatılmış kampanya yayına dönsün.
 *   · İPTAL    — bu boost bitti. Kampanya Meta'da duruyor ve gönderi yeniden
 *                boostlanabilir hâle geliyor.
 *
 * ═══ İPTAL KAMPANYAYI SİLMİYOR ═══
 *
 * Meta'da silinen kampanyanın metrikleri de gidiyor: harcanan para raporlardan
 * kayboluyor ve geçmiş rapor kendiliğinden değişiyor. İptal, kampanyayı
 * DURDURUYOR ve bizim kaydımızı bitmiş sayıyor; harcama muhasebesi yerinde
 * kalıyor.
 *
 * ═══ SIRA: ÖNCE PLATFORM, SONRA VERİTABANI ═══
 *
 * Ters sırada yazılsaydı, platform çağrısı düştüğünde panel "duraklatıldı"
 * yazarken Meta harcamaya devam ederdi — bu üründeki en pahalı sessiz hata
 * türü. Bu sırada ise kötü hâl "Meta'da durdu, bizde aktif görünüyor" oluyor:
 * kullanıcı tekrar basıyor, Meta aynı durumu ikinci kez kabul ediyor ve kayıt
 * düzeliyor.
 */
@Injectable()
export class BoostKontrolService {
  private readonly logger = new Logger(BoostKontrolService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ProviderRegistry,
    private readonly vault: TokenVaultService,
  ) {}

  async duraklat(ctx: TenantContext, queueItemId: string): Promise<KontrolSonucu> {
    return this.calistir(ctx, queueItemId, {
      izinliDurumlar: ['active'],
      aksiyon: 'pause',
      yeniDurum: 'paused',
      basarisizMesaj: 'Yalnızca yayındaki bir boost duraklatılabilir.',
      mesaj: 'Yayın duraklatıldı. Harcama durdu.',
    });
  }

  async surdur(ctx: TenantContext, queueItemId: string): Promise<KontrolSonucu> {
    return this.calistir(ctx, queueItemId, {
      izinliDurumlar: ['paused'],
      aksiyon: 'resume',
      yeniDurum: 'active',
      basarisizMesaj: 'Yalnızca duraklatılmış bir boost sürdürülebilir.',
      /*
       * ÜST SEVİYE DURAKLATMA UYARISI. Meta ACTIVE'i kabul ediyor ama reklam
       * hesabı ya da kampanya üst seviyede duraklatılmışsa yine yayına
       * çıkmıyor; `effective_status` farklı kalıyor. Bunu söylememek,
       * kullanıcıya yayına döndü sanan bir ekran göstermek olurdu.
       */
      mesaj:
        'Yayın sürdürüldü. Hesap ya da kampanya üst seviyede duraklatılmışsa ' +
        'Meta reklamı yine göstermez; birkaç dakika sonra durumu kontrol et.',
    });
  }

  async iptal(ctx: TenantContext, queueItemId: string): Promise<KontrolSonucu> {
    return this.calistir(ctx, queueItemId, {
      // DURAKLATILMIŞ BOOST DA İPTAL EDİLEBİLİR: kullanıcı önce durdurup
      // sonra karar veriyor ve o akışın sonu burası.
      izinliDurumlar: ['active', 'paused'],
      aksiyon: 'pause',
      yeniDurum: 'completed',
      basarisizMesaj: 'Bu boost zaten bitmiş.',
      mesaj: 'Boost iptal edildi. Kampanya durdu, gönderi yeniden boostlanabilir.',
    });
  }

  /**
   * ═══ YAYINDAKİ BOOST'UN BÜTÇESİNİ DEĞİŞTİR ═══
   *
   * Yayına girmiş bir reklamda panelden değiştirilebilen TEK şey bütçe.
   * Hedefleme ve süre için platformda karşılığı olan bir güncelleme yolumuz
   * yok; "düzenledim" deyip uygulamamak, kullanıcıya uygulanmamış bir ayarı
   * uygulanmış göstermek olurdu ve bu üründeki en pahalı hata türü.
   *
   * BÜTÇE AD SET SEVİYESİNDE. Meta boost'unda bütçe kampanyada değil ad
   * set'te duruyor; kampanyaya yazmak Meta tarafında sessizce yok sayılıyor.
   */
  async butceGuncelle(
    ctx: TenantContext,
    queueItemId: string,
    amountMicros: bigint,
  ): Promise<KontrolSonucu> {
    const scoped: TenantContext = { ...ctx, activeClientId: null };

    const [satir] = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<ButceSatiri[]>(Prisma.sql`
        SELECT q.platform::text AS platform, q.boost_id::text AS boost_id,
               b.status AS boost_status, b.budget_mode,
               b.external_ad_set_id,
               aa.external_id AS account_external_id,
               aa.connection_id::text AS connection_id,
               aa.currency
        FROM auto_boost_queue_items q
        LEFT JOIN boosts b ON b.id = q.boost_id
        LEFT JOIN ad_accounts aa ON aa.id = b.ad_account_id
        WHERE q.id = ${queueItemId}::uuid
      `),
    );

    if (!satir) throw new NotFoundException('Kart bulunamadı');
    if (satir.platform !== 'meta' || !satir.boost_status) {
      throw new BadRequestException(
        'Bu kartın bütçesi panelden değiştirilemiyor.',
      );
    }
    if (!['active', 'paused'].includes(satir.boost_status)) {
      throw new BadRequestException('Yalnızca yayındaki bir boost’un bütçesi değiştirilebilir.');
    }
    if (
      !satir.external_ad_set_id ||
      !satir.account_external_id ||
      !satir.connection_id ||
      !satir.currency
    ) {
      throw new BadRequestException('Kampanya kimlikleri eksik; bütçe güncellenemiyor.');
    }

    const provider = this.providers.get('meta');
    const accessToken = await this.vault.getAccessToken(satir.connection_id, provider);

    await provider.applyAction(
      { accessToken, accountExternalId: satir.account_external_id },
      {
        type: 'set_budget',
        level: 'ad_group',
        externalId: satir.external_ad_set_id,
        amountMicros,
        // KİP KAYITTAN OKUNUYOR, VARSAYILMIYOR. Günlük bütçeli bir ad set'e
        // `lifetime_budget` yazmak Meta'da reddediliyor ve mesaj hangi alanın
        // yanlış olduğunu söylemiyor.
        budgetMode: satir.budget_mode === 'lifetime' ? 'lifetime' : 'daily',
        currency: satir.currency,
      },
    );

    /*
     * KENDİ KAYDIMIZ DA GÜNCELLENİYOR. Yalnızca platformda değiştirmek,
     * panelde eski tutarı göstermek demek olurdu ve harcama muhasebesi
     * (toplam taahhüt) bu kolondan okunuyor.
     */
    await this.prisma.withTenant(scoped, (tx) =>
      tx.$executeRaw(Prisma.sql`
        UPDATE boosts
        SET daily_budget_micros = CASE WHEN budget_mode = 'daily'
                                       THEN ${amountMicros} ELSE daily_budget_micros END,
            total_budget_micros = CASE WHEN budget_mode = 'lifetime'
                                       THEN ${amountMicros} ELSE total_budget_micros END,
            updated_at = now()
        WHERE id = ${satir.boost_id}::uuid
      `),
    );

    return { status: 'ok', message: 'Bütçe güncellendi.' };
  }

  private async calistir(
    ctx: TenantContext,
    queueItemId: string,
    plan: {
      izinliDurumlar: string[];
      aksiyon: 'pause' | 'resume';
      yeniDurum: string;
      basarisizMesaj: string;
      mesaj: string;
    },
  ): Promise<KontrolSonucu> {
    /*
     * BAĞLAM DARALTMASI KAPATILIYOR. Karar yolundaki gerekçenin aynısı:
     * `app.can_access_client` aktif müşteriye göre süzüyor ve kart başka bir
     * müşteriye aitse UPDATE sonrası satır kendi görüş alanının dışına düşüp
     * reddediliyor.
     */
    const scoped: TenantContext = { ...ctx, activeClientId: null };

    const [satir] = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<BoostSatiri[]>(Prisma.sql`
        SELECT q.platform::text AS platform, q.boost_id::text AS boost_id,
               b.status AS boost_status,
               b.external_campaign_id,
               aa.external_id AS account_external_id,
               aa.connection_id::text AS connection_id
        FROM auto_boost_queue_items q
        -- DIŞ BİRLEŞİM: eksik olan parçayı SÖYLEMEK için. İç birleşimde satır
        -- hiç dönmez ve "kart bulunamadı" ile "boost kaydı yok" aynı cümleye
        -- düşerdi; ikisinin yapılacak işi farklı.
        LEFT JOIN boosts b ON b.id = q.boost_id
        LEFT JOIN ad_accounts aa ON aa.id = b.ad_account_id
        WHERE q.id = ${queueItemId}::uuid
      `),
    );

    if (!satir) throw new NotFoundException('Kart bulunamadı');

    if (satir.platform !== 'meta') {
      /*
       * GOOGLE YOLUNDA `boosts` SATIRI YOK ve kampanya zaten DURAKLATILMIŞ
       * açılıyor (canlıda doğrulanmamış yazma yolu). Panelden duraklatma
       * sunmak, olmayan bir kaydın durumunu değiştirmeye çalışmak olurdu.
       */
      throw new BadRequestException(
        'YouTube kampanyaları Google Ads üzerinden yönetiliyor; bu kart panelden duraklatılamıyor.',
      );
    }
    if (!satir.boost_id || !satir.boost_status) {
      throw new BadRequestException(
        'Bu kartın boost kaydı yok. Kampanya panel dışında oluşturulmuş olabilir.',
      );
    }
    if (!plan.izinliDurumlar.includes(satir.boost_status)) {
      throw new BadRequestException(plan.basarisizMesaj);
    }
    if (!satir.external_campaign_id || !satir.account_external_id || !satir.connection_id) {
      // Kısıt bunu zaten engelliyor; buraya düşmek kaydın elle bozulduğu
      // anlamına geliyor ve sessizce geçmek yanlış bir "başarılı" üretirdi.
      throw new BadRequestException(
        'Kampanya kimlikleri eksik; bu boost platformdan kontrol edilemiyor.',
      );
    }

    const provider = this.providers.get('meta');
    const accessToken = await this.vault.getAccessToken(satir.connection_id, provider);

    /*
     * PLATFORM ÇAĞRISI TRANSACTION'IN DIŞINDA. `withTenant` etkileşimli bir
     * transaction açıyor ve Prisma'nın sınırı 5 saniye; Meta'ya yapılan
     * çağrılar üretimde bunun üstüne çıktı ve transaction ölünce hata bile
     * kaydedilemedi.
     */
    await provider.applyAction(
      { accessToken, accountExternalId: satir.account_external_id },
      { type: plan.aksiyon, level: 'campaign', externalId: satir.external_campaign_id },
    );

    const n = await this.prisma.withTenant(scoped, (tx) =>
      tx.$executeRaw(Prisma.sql`
        UPDATE boosts SET status = ${plan.yeniDurum}, updated_at = now()
        WHERE id = ${satir.boost_id}::uuid
          AND status IN (${Prisma.join(plan.izinliDurumlar)})
      `),
    );

    if (n === 0) {
      /*
       * PLATFORMDA UYGULANDI, KAYIT GÜNCELLENMEDİ — başka bir oturum araya
       * girmiş demek. Sessizce "başarılı" demek, panelin Meta'dan farklı bir
       * durum göstermesi olurdu.
       */
      this.logger.warn(
        `Boost ${satir.boost_id}: ${plan.aksiyon} platformda uygulandı ama kayıt güncellenmedi`,
      );
      throw new BadRequestException(
        'İşlem Meta’da uygulandı ama kaydın durumu bu arada değişti. Sayfayı yenile.',
      );
    }

    return { status: plan.yeniDurum, message: plan.mesaj };
  }
}

export interface KontrolSonucu {
  status: string;
  message: string;
}

interface ButceSatiri {
  platform: string;
  boost_id: string | null;
  boost_status: string | null;
  budget_mode: string | null;
  external_ad_set_id: string | null;
  account_external_id: string | null;
  connection_id: string | null;
  currency: string | null;
}

interface BoostSatiri {
  platform: string;
  boost_id: string | null;
  boost_status: string | null;
  external_campaign_id: string | null;
  account_external_id: string | null;
  connection_id: string | null;
}
