import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { CryptoService } from '../../crypto/crypto.service';
import { mailGonder } from '../email/mail-gonderici';
import { yeniIcerikMailiOlustur, type YeniIcerikKarti } from './yeni-icerik-maili';

/**
 * ONAY KUYRUĞUNU BESLEYEN SERVİS (Advetics 1.0).
 *
 * İki kaynaktan besleniyor ve ikisi de aynı kapıdan giriyor:
 *   · Instagram — mevcut organik gönderi SÜPÜRMESİ (webhook yok, bkz.
 *     `docs/ADVETICS-1.0.md` §1: Meta'da "yeni gönderi" webhook'u
 *     bulunmuyor)
 *   · YouTube   — WebSub bildirimi
 *
 * TEK KAPI OLMASI BİLİNÇLİ: mükerrer engelleme, ön ayar çözümlemesi ve
 * "ne zamandan itibaren izliyoruz" kuralı iki yerde ayrı yazılsaydı bir gün
 * ayrışırdı — ve ayrıştığı gün ortaya çıkan şey ya kart gelmemesi ya da aynı
 * içerik için iki reklam.
 *
 * WORKER BAĞLAMINDA ÇALIŞIYOR (`PrismaAdminService`, BYPASSRLS). Süpürme ve
 * webhook'un oturumu yok, dolayısıyla RLS politikaları eşleşemezdi ve kayıt
 * SESSİZCE kaybolurdu — `client_id` bağlamı olmayan bir satırı RLS kimseye
 * göstermiyor.
 */
@Injectable()
export class AutoBoostQueueService {
  private readonly logger = new Logger(AutoBoostQueueService.name);

  /**
   * Bildirim maili HER ZAMAN bu adresten gidiyor.
   *
   * `gonderenHesap()` (bkz. `hesap-durumu-kontrol.service.ts`) "en eski org
   * yöneticisi" gibi dolaylı bir kural kullanıyor çünkü hangi yöneticinin
   * SMTP kimliği kurulu olduğu değişebilir. Burada durum farklı: kullanıcı
   * bu adresi AÇIKÇA ajansın ortak bildirim kutusu olarak belirledi ve her
   * bildirimin buradan gitmesi + buraya da bir kopya düşmesi istendi —
   * dolaylı bir seçim bu isteği karşılamaz.
   */
  private static readonly AJANS_BILGILENDIRME_ADRESI = 'hello@profaj.com';

  constructor(
    private readonly db: PrismaAdminService,
    private readonly crypto: CryptoService,
  ) {}

  /**
   * Bir sosyal profil için yeni içerikleri kuyruğa yazar.
   *
   * ÜÇ FİLTRE VE ÜÇÜ DE GEREKLİ:
   *
   * 1. ÖN AYAR OLMALI. Ön ayarsız kart onaylanamaz — "onayla" düğmesi hangi
   *    bütçeyle, hangi hedeflemeyle yayınlayacağını bilmez. Kart göstermek,
   *    tıklanınca hata veren bir düğme göstermek olurdu.
   *
   * 2. GÖNDERİ ÖN AYARDAN SONRA YAYINLANMIŞ OLMALI. Aksi hâlde otomatik
   *    boost ilk kez açıldığında son 90 günün gönderileri kuyruğa dolardı.
   *    Kural açıklanabilir: "açtığın andan itibaren izlemeye başlar."
   *
   * 3. DAHA ÖNCE KUYRUĞA GİRMEMİŞ OLMALI. Bu filtre SQL'de değil KISITTA:
   *    `ON CONFLICT DO NOTHING` + tekil indeks. Sorguyla ayıklamak, iki
   *    süpürme aynı anda koştuğunda yarışı kaybederdi.
   */
  async enqueueForProfile(socialProfileId: string): Promise<{
    created: number;
    note: string;
  }> {
    const [profil] = await this.db.$queryRaw<
      Array<{
        org_id: string;
        client_id: string | null;
        profile_type: string;
        name: string;
      }>
    >(Prisma.sql`
      SELECT org_id::text AS org_id, client_id::text AS client_id,
             profile_type::text AS profile_type, name
      FROM social_profiles WHERE id = ${socialProfileId}::uuid
    `);

    if (!profil) return { created: 0, note: 'profil bulunamadı' };

    /*
     * ATANMAMIŞ PROFİL KUYRUĞA GİRMİYOR.
     *
     * `client_id` NULL = ajansın havuzunda, müşteriye atanmamış. O satır için
     * kayıt açmak, RLS'in kimseye göstermeyeceği bir kart üretmek demek —
     * kart var olur ama panelde hiç görünmez. Aynı gerekçe `assertAssigned()`
     * ile senkronizasyon kuyruğunda da uygulanıyor.
     */
    if (!profil.client_id) {
      return { created: 0, note: `${profil.name}: müşteriye atanmamış` };
    }

    const preset = await this.resolvePreset(
      profil.client_id,
      socialProfileId,
      profil.profile_type === 'youtube_channel' ? 'google' : 'meta',
    );

    if (!preset) {
      return { created: 0, note: `${profil.name}: otomatik boost ön ayarı yok` };
    }

    /*
     * KAYNAK TABLO PROFİL TÜRÜNE GÖRE DEĞİŞİYOR ama YouTube tarafı buradan
     * beslenmiyor: video bildirimi WebSub'dan tek tek geliyor ve
     * `enqueueOne` ile yazılıyor. Bu metot yalnızca süpürmeyle çalışan
     * Instagram/Facebook yolunu besliyor.
     */
    if (profil.profile_type === 'youtube_channel') {
      return { created: 0, note: `${profil.name}: YouTube kendi bildirim yolundan gelir` };
    }

    /*
     * `RETURNING` İLE YAZILIYOR, `$executeRaw` İLE DEĞİL.
     *
     * Yalnızca satır SAYISI yetmiyor: kullanıcı yeni içerik geldiğinde mail
     * almak istiyor ve mailin GÖNDERİYİ göstermesi gerekiyor (başlık, bağlantı).
     * `ON CONFLICT DO NOTHING` sayesinde `RETURNING` yalnızca GERÇEKTEN
     * yazılan satırları döndürüyor — mükerrer engeline takılanlar hiç
     * görünmüyor, yani mail asla eski bir gönderiyi "yeni" diye göstermez.
     */
    const yeniKartlar = await this.db.$queryRaw<
      Array<{ title: string | null; permalink: string | null }>
    >(Prisma.sql`
      INSERT INTO auto_boost_queue_items (
        id, org_id, client_id, platform, social_profile_id, external_id,
        title, thumbnail_url, permalink, media_type, published_at, updated_at
      )
      SELECT gen_random_uuid(), p.org_id, p.client_id, 'meta', p.social_profile_id,
             p.external_id, left(p.message, 2000), p.thumbnail_url, p.permalink,
             p.media_type::text, p.published_at, now()
      FROM organic_posts p
      WHERE p.social_profile_id = ${socialProfileId}::uuid
        -- ÖN AYARDAN SONRA YAYINLANANLAR. Bu koşul olmadan otomatik boost
        -- ilk açıldığında son 90 günün gönderileri kuyruğa dolardı.
        AND p.published_at > ${preset.createdAt}
      -- MÜKERRER ENGELLEME KISITTA, sorguda değil: iki süpürme aynı anda
      -- koşabiliyor ve "önce bak sonra yaz" yarışı kaybediyor.
      ON CONFLICT (social_profile_id, external_id) DO NOTHING
      RETURNING title, permalink
    `);

    const created = yeniKartlar.length;
    if (created > 0) {
      this.logger.log(
        `${profil.name}: ${created} yeni gönderi onay kuyruğuna eklendi`,
      );
      const mailNotu = await this.bildir(
        profil.org_id,
        profil.client_id,
        yeniKartlar.map((k) => ({ title: k.title, permalink: k.permalink, platform: 'meta' as const })),
      );
      return { created, note: `${profil.name}: ${created} yeni kart · ${mailNotu}` };
    }
    return { created, note: `${profil.name}: ${created} yeni kart` };
  }

  /**
   * Yeni kart(lar) için bildirim maili — HER İKİ KAYNAK (Instagram süpürmesi,
   * YouTube WebSub'ı) da aynı yoldan geçiyor. Aynı olayı iki yerde ayrı ayrı
   * bildirmek, doğdukları anda ayrışıp birinin bildirim göndermeyi unutması
   * demekti (CLAUDE.md: "aynı şeyi üreten ikinci fonksiyon").
   *
   * HATA MAİLİ YUTUYOR, SENKRONİZASYONU DEĞİL. Kart zaten yazıldı — mail
   * gönderilemedi diye kartı da kaybetmek, çalışan bir yazmayı SMTP arızası
   * yüzünden başarısız saymak olurdu. Sonuç NOT olarak dönüyor ve
   * `sync_jobs.note`'a düşüyor — sessiz kalmıyor.
   */
  private async bildir(
    orgId: string,
    clientId: string,
    kartlar: YeniIcerikKarti[],
  ): Promise<string> {
    const [musteri] = await this.db.$queryRaw<Array<{ name: string }>>(Prisma.sql`
      SELECT name FROM clients WHERE id = ${clientId}::uuid
    `);
    const clientName = musteri?.name ?? 'Müşteri';

    // HAM SQL — bu dosyanın geri kalanıyla AYNI desen (`db` worker
    // bağlamında BYPASSRLS ve Prisma model erişimi yerine burada hep
    // `$queryRaw` kullanılıyor).
    const [gonderen] = await this.db.$queryRaw<
      Array<{
        from_name: string;
        from_email: string;
        smtp_host: string;
        smtp_port: number;
        smtp_secure: boolean;
        smtp_user: string;
        smtp_pass_enc: Buffer;
      }>
    >(Prisma.sql`
      SELECT from_name, from_email, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass_enc
      FROM user_email_accounts
      WHERE from_email = ${AutoBoostQueueService.AJANS_BILGILENDIRME_ADRESI}
    `);
    if (!gonderen) {
      return `MAİL GÖNDERİLEMEDİ: ${AutoBoostQueueService.AJANS_BILGILENDIRME_ADRESI} için e-posta kimliği tanımlı değil`;
    }

    const danismanlar = await this.alicilar(orgId, clientId);
    // AJANS ADRESİ HER ZAMAN ALICI LİSTESİNDE — gönderen olması yeterli değil,
    // çoğu SMTP sağlayıcısı kendine giden maili "Gönderilenler"e koyar,
    // gelen kutusuna değil.
    const alicilar = [
      ...new Set([...danismanlar, AutoBoostQueueService.AJANS_BILGILENDIRME_ADRESI]),
    ];

    const panelUrl = `${process.env.APP_URL ?? 'https://advetics.com'}/auto-boost?musteri=${clientId}`;
    const { konu, html } = yeniIcerikMailiOlustur(clientName, kartlar, panelUrl);

    try {
      const sonuc = await mailGonder(
        {
          fromName: gonderen.from_name,
          fromEmail: gonderen.from_email,
          host: gonderen.smtp_host,
          port: gonderen.smtp_port,
          secure: gonderen.smtp_secure,
          user: gonderen.smtp_user,
          pass: this.crypto.decrypt(Buffer.from(gonderen.smtp_pass_enc)),
        },
        // DİZİ OLARAK VERİLİYOR. Eskiden burada `join(', ')` vardı: tip
        // "tek alıcı" diyor, kullanım "çok alıcı" yapıyordu. Ayırıcı seçimi
        // ve tekilleştirme artık `mailGonder` sözleşmesinin parçası.
        { to: alicilar, subject: konu, html },
      );
      /*
       * KISMİ RET SESSİZ KALMIYOR. nodemailer, alıcılardan bazıları
       * reddedilse bile FIRLATMIYOR (yalnızca hepsi reddedilirse) — yani
       * `catch` bu hâli görmüyor. Danışmanlardan birinin adresi bozuksa
       * bildirim ona gitmiyor ve kimse fark etmiyordu.
       */
      if (sonuc.ret.length > 0) {
        const detay = sonuc.ret.map((r) => `${r.adres} (${r.sebep})`).join(', ');
        this.logger.error(`Bildirim maili kısmen gitti — reddedilen: ${detay}`);
        return `mail gönderildi: ${sonuc.kabul.length} alıcı · REDDEDİLEN ${sonuc.ret.length}: ${detay}`;
      }
      return `mail gönderildi: ${sonuc.kabul.length} alıcı`;
    } catch (err) {
      const mesaj = err instanceof Error ? err.message : 'bilinmeyen hata';
      this.logger.error(`Yeni içerik bildirim maili gönderilemedi: ${mesaj}`);
      return `MAİL GÖNDERİLEMEDİ: ${mesaj}`;
    }
  }

  /**
   * Bu müşteriye atanmış danışmanların e-posta adresleri.
   *
   * `client_viewer` HARİÇ TUTULUYOR: bu rol müşterinin KENDİ giriş yaptığı
   * hesap. Onay kuyruğu ajansın iç iş akışı — müşteriye "gönderini
   * boostlamayı düşünüyoruz" maili atmak burada istenen şey değil.
   *
   * ORG GENELİ ERİŞİMİ OLANLAR (owner/admin/ad_manager, `clientId IS NULL`)
   * BU LİSTEDE YOK — onlar bu müşteriye ÖZEL atanmamış, tüm müşterileri
   * görüyor. "İlgili danışman" bu müşteriye AÇIKÇA atanmış kişi demek;
   * `danisman-atama.ts`'teki tanımın aynısı.
   */
  private async alicilar(orgId: string, clientId: string): Promise<string[]> {
    const rows = await this.db.$queryRaw<Array<{ email: string }>>(Prisma.sql`
      SELECT DISTINCT u.email
      FROM memberships m
      JOIN users u ON u.id = m.user_id
      WHERE m.org_id = ${orgId}::uuid
        AND m.client_id = ${clientId}::uuid
        AND m.role != 'client_viewer'::"Role"
    `);
    return rows.map((r) => r.email);
  }

  /**
   * Tek bir içeriği kuyruğa yazar — YouTube bildirimi bu yoldan giriyor.
   *
   * DÖNÜŞ DEĞERİ MÜKERRERİ AYIRT EDİYOR. `false` "hata" değil, "bu içerik
   * zaten kuyrukta" demek ve webhook'un buna 200 dönmesi gerekiyor: hub'a
   * hata bildirmek, aynı bildirimin tekrar tekrar gönderilmesine yol açar.
   */
  async enqueueOne(params: {
    orgId: string;
    clientId: string;
    socialProfileId: string;
    platform: 'meta' | 'google';
    externalId: string;
    title: string | null;
    thumbnailUrl: string | null;
    permalink: string | null;
    mediaType: string | null;
    publishedAt: Date | null;
  }): Promise<boolean> {
    const yazilan = await this.db.$executeRaw(Prisma.sql`
      INSERT INTO auto_boost_queue_items (
        id, org_id, client_id, platform, social_profile_id, external_id,
        title, thumbnail_url, permalink, media_type, published_at, updated_at
      ) VALUES (
        gen_random_uuid(), ${params.orgId}::uuid, ${params.clientId}::uuid,
        ${params.platform}::"Platform", ${params.socialProfileId}::uuid,
        ${params.externalId}, ${params.title?.slice(0, 2000) ?? null},
        ${params.thumbnailUrl}, ${params.permalink}, ${params.mediaType},
        ${params.publishedAt}, now()
      )
      ON CONFLICT (social_profile_id, external_id) DO NOTHING
    `);

    if (yazilan > 0) {
      // AYNI BİLDİRİM YOLU — Instagram süpürmesiyle (`enqueueForProfile`)
      // aynı `bildir()`. Hata olsa da yutuluyor: kart zaten yazıldı, webhook
      // hub'a 200 dönmek zorunda.
      const mailNotu = await this.bildir(params.orgId, params.clientId, [
        { title: params.title, permalink: params.permalink, platform: params.platform },
      ]);
      if (mailNotu.startsWith('MAİL GÖNDERİLEMEDİ')) {
        this.logger.warn(`YouTube bildirimi kuyruğa yazıldı ama ${mailNotu}`);
      }
    }
    return yazilan > 0;
  }

  /**
   * Bu profile hangi ön ayar uygulanacak?
   *
   * PROFİL BAZLI ÖN AYAR MÜŞTERİ VARSAYILANINI EZİYOR ve sıra AÇIKÇA
   * yazılıyor. Belirsiz bırakılsaydı hangi ayarla yayınlandığı satır sırasına
   * kalırdı — ve satır sırası bir gün değişir.
   *
   * KAPALI ÖN AYAR YOK SAYILMIYOR, "ön ayar yok" sayılıyor: kullanıcı
   * otomatik boost'u kapattığında kart üretilmemeli. Profil bazlı ön ayar
   * KAPALI ama müşteri varsayılanı AÇIK ise varsayılana düşmüyoruz — o
   * profil için verilmiş bilinçli bir "kapat" kararını geçersiz kılardı.
   */
  private async resolvePreset(
    clientId: string,
    socialProfileId: string,
    platform: 'meta' | 'google',
  ): Promise<{ id: string; createdAt: Date; enabled: boolean } | null> {
    const rows = await this.db.$queryRaw<
      Array<{
        id: string;
        created_at: Date;
        enabled: boolean;
        social_profile_id: string | null;
      }>
    >(Prisma.sql`
      SELECT id::text AS id, created_at, enabled,
             social_profile_id::text AS social_profile_id
      FROM auto_boost_presets
      WHERE client_id = ${clientId}::uuid
        AND platform = ${platform}::"Platform"
        AND (social_profile_id = ${socialProfileId}::uuid OR social_profile_id IS NULL)
      -- PROFİL BAZLI ÖNCE. NULLS LAST açıkça yazılıyor: Postgres'te NULL'lar
      -- varsayılan olarak ASC sıralamada SONDA ama bu davranışa güvenmek,
      -- sıralamayı okuyan herkesin o kuralı bilmesini gerektirir.
      ORDER BY social_profile_id NULLS LAST
      LIMIT 1
    `);

    const p = rows[0];
    if (!p || !p.enabled) return null;
    return { id: p.id, createdAt: p.created_at, enabled: p.enabled };
  }
}
