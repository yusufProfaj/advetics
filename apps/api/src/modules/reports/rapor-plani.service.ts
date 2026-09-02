import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  bugunUtc,
  raporPenceresi,
  siradakiCalisma,
  type PlanSikligi,
  type PlanSonucu,
  type RaporPlaniInput,
  type RaporPlaniOzeti,
  type TenantContext,
} from '@advetics/shared';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RaporGonderService } from './rapor-gonder.service';

/**
 * ═══ ZAMANLANMIŞ RAPOR — KURULUM VE ÇALIŞTIRMA ═══
 *
 * İki ayrı dünya tek serviste:
 *
 *   · CRUD, kullanıcının oturumuyla (`PrismaService.withTenant`, RLS açık)
 *   · Çalıştırma, worker'da (`PrismaAdminService`, BYPASSRLS) — oturum yok
 *
 * Ayrı servislere bölmek, planın nasıl kurulduğu ile nasıl koştuğu
 * arasındaki bağı görünmez yapardı; en kritik alan (`next_run_at`) ikisinde
 * de yazılıyor ve aynı fonksiyondan (`siradakiCalisma`) geliyor.
 */
@Injectable()
export class RaporPlaniService {
  private readonly logger = new Logger(RaporPlaniService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: PrismaAdminService,
    private readonly gonderici: RaporGonderService,
  ) {}

  // ---------------------------------------------------------------------------
  // Kurulum (oturumlu)
  // ---------------------------------------------------------------------------

  async listele(ctx: TenantContext, clientId: string): Promise<RaporPlaniOzeti[]> {
    const scoped = { ...ctx, activeClientId: clientId };
    const rows = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT s.id::text, s.client_id::text AS client_id, c.name AS client_name,
               s.frequency::text, s.day_of_week, s.day_of_month, s.hour,
               s.range_key, s.template_id::text AS template_id,
               s.to_email, c.contact_email, s.attach_pdf, s.enabled,
               s.next_run_at, s.last_run_at, s.last_status, s.last_error, s.last_sent_to,
               u.full_name AS created_by_name, u.email AS created_by_email,
               -- GÖNDERENİN KİMLİĞİ HAZIR MI: kayıtlı VE doğrulanmış.
               -- Plan kurulurken kontrol ediliyor ama sonradan bozulabiliyor;
               -- panel bunu göstermezse plan "açık" görünüp hiç göndermez.
               (ea.id IS NOT NULL AND ea.verified_at IS NOT NULL) AS sender_ready
          FROM report_schedules s
          JOIN clients c ON c.id = s.client_id
          JOIN users u ON u.id = s.created_by_user_id
          LEFT JOIN user_email_accounts ea ON ea.user_id = s.created_by_user_id
         WHERE s.client_id = ${clientId}::uuid
         ORDER BY s.created_at DESC
      `),
    );

    return rows.map((r) => ({
      id: r.id as string,
      clientId: r.client_id as string,
      clientName: (r.client_name as string) ?? null,
      frequency: r.frequency as PlanSikligi,
      dayOfWeek: (r.day_of_week as number) ?? null,
      dayOfMonth: (r.day_of_month as number) ?? null,
      hour: r.hour as number,
      rangeKey: r.range_key as string,
      templateId: (r.template_id as string) ?? null,
      toEmail: (r.to_email as string) ?? null,
      // Alıcı boşsa müşterinin kayıtlı adresi gösteriliyor: kullanıcı mailin
      // NEREYE gideceğini planı açmadan görmeli.
      cozulenAlici: ((r.to_email ?? r.contact_email) as string) ?? null,
      attachPdf: r.attach_pdf as boolean,
      enabled: r.enabled as boolean,
      nextRunAt: r.next_run_at ? (r.next_run_at as Date).toISOString() : null,
      lastRunAt: r.last_run_at ? (r.last_run_at as Date).toISOString() : null,
      lastStatus: (r.last_status as PlanSonucu) ?? null,
      lastError: (r.last_error as string) ?? null,
      lastSentTo: (r.last_sent_to as string) ?? null,
      createdByName: (r.created_by_name as string) ?? null,
      createdByEmail: (r.created_by_email as string) ?? null,
      senderReady: r.sender_ready === true,
    }));
  }

  async olustur(ctx: TenantContext, input: RaporPlaniInput): Promise<{ id: string }> {
    await this.onKosullar(ctx, input.clientId);

    const next = siradakiCalisma(
      {
        frequency: input.frequency,
        dayOfWeek: input.dayOfWeek ?? null,
        dayOfMonth: input.dayOfMonth ?? null,
        hour: input.hour,
      },
      new Date(),
    );

    const scoped = { ...ctx, activeClientId: input.clientId };
    const rows = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO report_schedules (
          id, org_id, client_id, created_by_user_id, template_id,
          frequency, day_of_week, day_of_month, hour, range_key,
          to_email, attach_pdf, enabled, next_run_at, updated_at
        ) VALUES (
          gen_random_uuid(), ${ctx.orgId}::uuid, ${input.clientId}::uuid,
          ${ctx.userId}::uuid, ${input.templateId ?? null}::uuid,
          ${input.frequency}::"ReportScheduleFrequency",
          ${input.frequency === 'weekly' ? (input.dayOfWeek ?? null) : null},
          ${input.frequency === 'monthly' ? (input.dayOfMonth ?? null) : null},
          ${input.hour}, ${input.rangeKey},
          ${input.toEmail ?? null}, ${input.attachPdf}, ${input.enabled},
          ${next}, now()
        )
        RETURNING id::text
      `),
    );
    return { id: rows[0]!.id };
  }

  async guncelle(
    ctx: TenantContext,
    id: string,
    input: RaporPlaniInput,
  ): Promise<{ id: string }> {
    await this.onKosullar(ctx, input.clientId);

    const next = siradakiCalisma(
      {
        frequency: input.frequency,
        dayOfWeek: input.dayOfWeek ?? null,
        dayOfMonth: input.dayOfMonth ?? null,
        hour: input.hour,
      },
      new Date(),
    );

    const scoped = { ...ctx, activeClientId: input.clientId };
    const rows = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE report_schedules SET
          template_id  = ${input.templateId ?? null}::uuid,
          frequency    = ${input.frequency}::"ReportScheduleFrequency",
          day_of_week  = ${input.frequency === 'weekly' ? (input.dayOfWeek ?? null) : null},
          day_of_month = ${input.frequency === 'monthly' ? (input.dayOfMonth ?? null) : null},
          hour         = ${input.hour},
          range_key    = ${input.rangeKey},
          to_email     = ${input.toEmail ?? null},
          attach_pdf   = ${input.attachPdf},
          enabled      = ${input.enabled},
          -- ZAMANLAMA DEGISTIYSE SIRADAKI CALISMA YENIDEN HESAPLANIYOR.
          -- Eski next_run_at degerini birakmak, "Sali'ya aldim ama Pazartesi
          -- gitti" demek olurdu. (Backtick YOK: sablonu ortasindan kapatiyor.)
          next_run_at  = ${next},
          updated_at   = now()
        WHERE id = ${id}::uuid
        RETURNING id::text
      `),
    );
    // SIFIR SATIR = RLS reddetti ya da satır yok. Sessizce "başarılı"
    // dönmek, kullanıcının kaydettiğini sanması demek olurdu.
    if (rows.length === 0) throw new NotFoundException('Planlama bulunamadı.');
    return { id: rows[0]!.id };
  }

  async sil(ctx: TenantContext, id: string, clientId: string): Promise<{ silindi: true }> {
    const scoped = { ...ctx, activeClientId: clientId };
    const rows = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        DELETE FROM report_schedules WHERE id = ${id}::uuid RETURNING id::text
      `),
    );
    if (rows.length === 0) throw new NotFoundException('Planlama bulunamadı.');
    return { silindi: true };
  }

  /**
   * KURULUM ANINDA DOĞRULAMA — kullanım anında değil.
   *
   * CLAUDE.md: "Doğrulama kullanım anında değil, giriş anında. Kullanıcı
   * yüklediği görselin kullanılamayacağını tıkladığında değil bıraktığında
   * öğrenmeli." Buradaki karşılığı: e-posta kimliği doğrulanmamışsa plan
   * KURULMUYOR. Aksi hâlde plan sessizce kurulur, ilk gönderim gecenin
   * bir yarısı düşer ve kullanıcı haftalar sonra fark eder.
   */
  private async onKosullar(ctx: TenantContext, clientId: string): Promise<void> {
    const [gonderen] = await this.prisma.withTenant(ctx, (tx) =>
      tx.$queryRaw<Array<{ verified_at: Date | null }>>(Prisma.sql`
        SELECT verified_at FROM user_email_accounts WHERE user_id = ${ctx.userId}::uuid
      `),
    );
    if (!gonderen) {
      throw new BadRequestException(
        'Önce kendi e-posta ayarlarını kaydet (Ayarlar → E-posta Ayarları). ' +
          'Planlanan rapor senin adresinden gidiyor.',
      );
    }
    if (gonderen.verified_at === null) {
      throw new BadRequestException(
        'E-posta ayarların doğrulanmadı. Ayarlar ekranından kendine test maili gönder — ' +
          'doğrulanmamış bir hesapla kurulan plan gecenin bir yarısı sessizce düşerdi.',
      );
    }

    const [musteri] = await this.prisma.withTenant({ ...ctx, activeClientId: clientId }, (tx) =>
      tx.$queryRaw<Array<{ contact_email: string | null }>>(Prisma.sql`
        SELECT contact_email FROM clients WHERE id = ${clientId}::uuid
      `),
    );
    if (!musteri) throw new NotFoundException('Müşteri bulunamadı.');
  }

  // ---------------------------------------------------------------------------
  // Çalıştırma (worker, oturumsuz)
  // ---------------------------------------------------------------------------

  /**
   * Zamanı gelmiş planlamaları çalıştırır. Süpürme bunu çağırıyor.
   *
   * ═══ MÜKERRER GÖNDERİM BU METODUN ASIL DERDİ ═══
   *
   * Worker `concurrency: 4` ile koşuyor ve pm2 sık yeniden başlatıyor
   * (üretimde restart sayacı 160'ın üstünde). İki koruma birlikte çalışıyor:
   *
   * 1. KOŞULLU UPDATE (karşılaştır-ve-yaz). `next_run_at`i ileri atan
   *    UPDATE, `next_run_at <= now()` koşulunu da taşıyor. İki worker aynı
   *    satırı görürse ikincisinin UPDATE'i SIFIR satır etkiliyor ve o tur
   *    atlanıyor. `SELECT ... FOR UPDATE` da olurdu ama uzun süren mail
   *    gönderimi boyunca satırı kilitli tutardı.
   *
   * 2. ÖNCE İLERİ AT, SONRA GÖNDER. Sıra tersine olsaydı, gönderimle
   *    güncelleme arasında ölen bir worker'dan sonraki tur AYNI raporu
   *    tekrar gönderirdi. Bu sırayla ise en kötü ihtimalle bir dönem
   *    ATLANIYOR — ve atlanan rapor kurtarılabilir (kullanıcı elle
   *    gönderir, `last_status` ekranda görünür), mükerrer olan
   *    kurtarılamaz.
   *
   * OTOMATİK TEKRAR DENEME YOK. Aynı gerekçe: başarısız bir gönderimi beş
   * kez denemek, SMTP yanıtı geciken bir turda müşteriye beş mail gitmesi
   * riski demek.
   */
  async calistir(): Promise<{ rows: number; note: string }> {
    const zamaniGelenler = await this.admin.$queryRaw<
      Array<{
        id: string;
        org_id: string;
        client_id: string;
        created_by_user_id: string;
        template_id: string | null;
        frequency: PlanSikligi;
        day_of_week: number | null;
        day_of_month: number | null;
        hour: number;
        range_key: string;
        to_email: string | null;
        attach_pdf: boolean;
        client_name: string;
      }>
    >(Prisma.sql`
      SELECT s.id::text, s.org_id::text, s.client_id::text,
             s.created_by_user_id::text, s.template_id::text,
             s.frequency::text AS frequency, s.day_of_week, s.day_of_month,
             s.hour, s.range_key, s.to_email, s.attach_pdf, c.name AS client_name
        FROM report_schedules s
        JOIN clients c ON c.id = s.client_id
       WHERE s.enabled = true
         AND s.next_run_at <= now()
         -- Arşivlenmiş müşteriye rapor gitmiyor.
         AND c.status = 'active'
       ORDER BY s.next_run_at
       LIMIT 100
    `);

    if (zamaniGelenler.length === 0) {
      return { rows: 0, note: 'zamanı gelen planlama yok' };
    }

    let gonderilen = 0;
    let atlanan = 0;
    let dusen = 0;
    const notlar: string[] = [];

    for (const plan of zamaniGelenler) {
      const next = siradakiCalisma(
        {
          frequency: plan.frequency,
          dayOfWeek: plan.day_of_week,
          dayOfMonth: plan.day_of_month,
          hour: plan.hour,
        },
        new Date(),
      );

      // ① KOŞULLU CLAIM — gönderimden ÖNCE.
      const claim = await this.admin.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE report_schedules
           SET next_run_at = ${next}, last_run_at = now()
         WHERE id = ${plan.id}::uuid
           AND enabled = true
           AND next_run_at <= now()
        RETURNING id::text
      `);
      if (claim.length === 0) {
        // Başka bir worker aldı. Hata değil; sayılıyor ki "neden bir tur
        // eksik göründü" sorusu cevapsız kalmasın.
        continue;
      }

      // ② GÖNDER
      try {
        const pencere = raporPenceresi(plan.range_key, bugunUtc());
        if (pencere === null) {
          await this.sonucYaz(plan.id, 'skipped', 'Dönem henüz başlamadı (pencere boş).', null);
          atlanan++;
          continue;
        }

        /*
         * SENTETİK KİRACI BAĞLAMI — PLANI KURAN KULLANICI ADINA.
         *
         * `permissions` DOLU. CLAUDE.md'de kayıtlı bir hata: "share.service.ts
         * bağlamı `permissions` taşımıyordu — her paylaşılan rapor bağlantısı
         * çalışma anında düşecekti; `as TenantContext` cast'i denetimsiz."
         * Burada aynı tuzak var ve rapor kurma yolu yetki okuyor.
         */
        const ctx = {
          userId: plan.created_by_user_id,
          orgId: plan.org_id,
          clientIds: [plan.client_id],
          activeClientId: plan.client_id,
          role: 'admin',
          isOrgAdmin: true,
          permissions: ['report.read', 'report.share'],
        } as unknown as TenantContext;

        const sonuc = await this.gonderici.zamanlanmisGonder(ctx, {
          clientId: plan.client_id,
          from: pencere.from,
          to: pencere.to,
          templateId: plan.template_id,
          toEmail: plan.to_email,
          attachPdf: plan.attach_pdf,
        });

        if (sonuc.bosDonem) {
          await this.sonucYaz(
            plan.id,
            'skipped',
            `${pencere.from} – ${pencere.to} döneminde harcama kaydı yok; boş rapor gönderilmedi.`,
            null,
          );
          atlanan++;
          notlar.push(`${plan.client_name}: veri yok`);
        } else {
          await this.sonucYaz(plan.id, 'sent', null, sonuc.to);
          gonderilen++;
          notlar.push(`${plan.client_name} → ${sonuc.to}`);
        }
      } catch (err) {
        const mesaj = err instanceof Error ? err.message : String(err);
        /*
         * HATA YUTULMUYOR AMA DÖNGÜ DE KESİLMİYOR. Bir müşterinin SMTP'si
         * bozuksa diğer sekiz planlamanın da durması, tek bir arızayı
         * hepsine yaymak olurdu.
         */
        this.logger.error(`Planlı rapor gönderilemedi (${plan.client_name}): ${mesaj}`);
        await this.sonucYaz(plan.id, 'failed', mesaj, null);
        dusen++;
        notlar.push(`${plan.client_name}: HATA — ${mesaj.slice(0, 80)}`);
      }
    }

    const ozet =
      `${gonderilen} gönderildi · ${atlanan} atlandı · ${dusen} başarısız` +
      (notlar.length > 0 ? ` · ${notlar.join('; ')}` : '');
    this.logger.log(`Planlı rapor turu: ${ozet}`);
    // `rows` GÖNDERİLEN sayısı: "succeeded + rows = 0" teşhis ekranında
    // "hiçbir rapor gitmedi" diye okunabilmeli.
    return { rows: gonderilen, note: ozet.slice(0, 500) };
  }

  private async sonucYaz(
    id: string,
    durum: PlanSonucu,
    hata: string | null,
    alici: string | null,
  ): Promise<void> {
    await this.admin.$executeRaw(Prisma.sql`
      UPDATE report_schedules
         SET last_status = ${durum},
             last_error = ${hata ? hata.slice(0, 500) : null},
             -- BAŞARILI TURDA ALICI YAZILIYOR, BAŞARISIZDA ESKİSİ SİLİNİYOR:
             -- "en son 3 Eylül'de x@y.com adresine gitti" bilgisi ancak
             -- gerçekten gittiyse doğru.
             last_sent_to = ${alici},
             updated_at = now()
       WHERE id = ${id}::uuid
    `);
  }
}
