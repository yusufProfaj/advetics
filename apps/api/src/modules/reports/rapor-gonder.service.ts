import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  imzaTemizle,
  nihaiAlicilar,
  raporDosyaAdi,
  type ReportMailDraft,
  type ReportQuery,
  type ReportSendInput,
  type TenantContext,
} from '@advetics/shared';
import { CryptoService } from '../../crypto/crypto.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { mailGonder } from '../email/mail-gonderici';
import { raporMailTaslagi } from './rapor-mail';
import { RaporPdfService } from './rapor-pdf.service';
import { ReportsService } from './reports.service';
import { FaturaService } from './fatura.service';

interface Meta {
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/**
 * ═══ RAPORU MÜŞTERİYE GÖNDER ═══
 *
 * SENKRON, KUYRUKTA DEĞİL — ve bu karar ÖLÇÜLEREK verildi.
 *
 * İlk plan işi worker'a taşımaktı; gerekçe pm2'nin API sürecine koyduğu 512M
 * tavanıydı. O gerekçe PUPPETEER varsayımından geliyordu (200-300 MB
 * Chromium). `pdf-lib` ile ölçüm bambaşka: 600 kampanya ve 200 anahtar
 * kelimeli bir raporda 1 saniye, 35 KB belge, 10 MB heap artışı. Tavanın
 * yanına yaklaşmıyor.
 *
 * Buna karşılık kuyruk gerçek bir bedel getiriyordu: kullanıcı "gönder"e
 * basıp sonucu göremiyor. Müşteriye mail giden bir işlemde "gitti mi?"
 * sorusunu cevapsız bırakmak, bu projede tekrar eden hata türünün ta kendisi.
 */
@Injectable()
export class RaporGonderService {
  private readonly logger = new Logger(RaporGonderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly pdf: RaporPdfService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly faturalar: FaturaService,
  ) {}

  /** Taslak: sayılar rapordan, anlatı şablondan. Ekranda düzenleniyor. */
  async taslak(ctx: TenantContext, query: ReportQuery): Promise<ReportMailDraft> {
    const data = await this.reports.build(ctx, query);
    const gonderen = await this.gonderen(ctx);

    // TASLAK DA AYNI ÇÖZÜCÜDEN GEÇİYOR: ekranda önerilen liste ile gönderim
    // anında kullanılan liste aynı olmak zorunda, yoksa kullanıcı gördüğünden
    // farklı bir adrese göndermiş olur.
    const musteriAdresleri = await this.musteriEpostalari(ctx, query.clientId);

    const t = raporMailTaslagi(data, gonderen?.from_name ?? '');
    return {
      subject: t.subject,
      html: t.html,
      defaultTo: nihaiAlicilar({ secilen: [], musteriAdresleri }),
      /*
       * DOĞRULANMAMIŞ HESAPLA GÖNDERİM KAPALI. "Kaydedildi" doğrulama değil:
       * SMTP kimliği yanlışsa hata ilk gerçek gönderimde çıkar ve o gönderim
       * müşteriye gidecek olandır.
       */
      senderReady: gonderen !== null && gonderen.verified_at !== null,
      senderEmail: gonderen?.from_email ?? null,
    };
  }

  async gonder(
    ctx: TenantContext,
    input: ReportSendInput,
    meta: Meta,
  ): Promise<{ sent: true; to: string[]; reddedilen: Array<{ adres: string; sebep: string }> }> {
    const gonderen = await this.gonderen(ctx);
    if (!gonderen) {
      throw new BadRequestException(
        'Önce kendi e-posta ayarlarını kaydet (Ayarlar → E-posta Ayarları).',
      );
    }
    if (gonderen.verified_at === null) {
      throw new BadRequestException(
        'E-posta ayarların doğrulanmadı. Ayarlar ekranından kendine test maili gönder — ' +
          'doğrulanmamış bir hesapla müşteriye mail atmak, ilk hatanın müşteriye gitmesi demek.',
      );
    }

    /*
     * ALICI ÇÖZÜMÜ TEK YERDE (`nihaiAlicilar`). Kural — "form doluysa o,
     * boşsa müşterinin kayıtlı listesi" — elle gönderim ve planlı gönderimde
     * AYRI AYRI yazılıydı ve hata mesajları bile farklıydı. Çoğullaşınca
     * ayrışacak karar sayısı arttı (tekilleştirme, boş liste, üst sınır);
     * ikiye bölünmüş bir kural burada sessizce farklı adrese gönderirdi.
     */
    const alicilar = nihaiAlicilar({
      secilen: input.to_emails ?? [],
      musteriAdresleri: await this.musteriEpostalari(ctx, input.clientId),
    });
    if (alicilar.length === 0) {
      throw new BadRequestException(
        'Alıcı yok: forma adres girilmedi ve müşterinin kayıtlı rapor alıcısı tanımlı değil. ' +
          'Müşteriler ekranından ekleyebilirsin.',
      );
    }

    const query: ReportQuery = {
      clientId: input.clientId,
      from: input.from,
      to: input.to,
      ...(input.templateId ? { templateId: input.templateId } : {}),
      /*
       * ÖN AYAR DA TAŞINIYOR. Yalnızca `templateId` aktarılıyordu ve ekranda
       * "Google Ads Şablonu" seçen kullanıcının müşterisine GENEL rapor
       * gidiyordu — sessizce, çünkü şablonsuz istek de geçerli. Giden belge
       * ile ekranda görülen aynı olmak zorunda.
       */
      ...(input.sablon ? { sablon: input.sablon } : {}),
    };
    const data = await this.reports.build(ctx, query);

    /*
     * GÖVDE TEMİZLENİYOR. Kullanıcı taslağı ekranda düzenliyor ve sonuç
     * alıcının istemcisinde açılıyor — imza ile aynı yüzey. Temizlik
     * gönderimden ÖNCE, çünkü giden şey ile denetime yazılan şey aynı olmalı.
     */
    const govde = imzaTemizle(input.html).html;
    const imza = gonderen.signature_html ? `<br /><br />${gonderen.signature_html}` : '';

    const ekler = input.attachPdf
      ? [
          {
            /*
             * EK ADI MÜŞTERİNİN GÖRDÜĞÜ ŞEY. Burada müşterinin UUID'si
             * yazıyordu ve gelen kutusunda ad yerine rastgele bir dizeye
             * dönüşüyordu. Üretici TEK — indirme ucu da aynı adı veriyor.
             */
            filename: raporDosyaAdi({
              musteriAdi: data.client.name,
              baslik: data.title,
              from: input.from,
              to: input.to,
            }),
            content: await this.pdf.uret(data),
            contentType: 'application/pdf',
          },
        ]
      : [];

    /*
     * ═══ PLATFORM FATURALARI DA AYNI MAİLDE ═══
     *
     * İstek birebir şuydu: "müşteri her şeyi tek pakette görsün."
     * Rapor PDF'ine BİRLEŞTİRİLMİYOR, AYRI ek olarak gidiyor — faturanın
     * kendi biçimi resmi bir belge ve onu başka bir belgenin arkasına
     * eklemek bütünlüğünü tartışmalı hâle getirirdi.
     *
     * Fatura EKLENEMEDİYSE gönderim DURMUYOR ama sessiz de kalmıyor:
     * eksik dönemler denetim kaydına yazılıyor.
     */
    /*
     * PDF'İN BOYUTU BÜTÇEYE GİRİYOR. Eskiden fatura bütçesi PDF'i saymıyordu
     * ve iki ek birlikte sağlayıcının sınırını aşabiliyordu; mail SUNUCUDA
     * reddediliyor ve kullanıcı sebebini SMTP hatasından okumak zorunda
     * kalıyordu.
     */
    const kullanilan = ekler.reduce((t, e) => t + e.content.byteLength, 0);
    const fatura = await this.faturalar.raporEkleri(
      input.clientId,
      input.from,
      input.to,
      kullanilan,
    );
    ekler.push(...fatura.ekler);

    const parola = this.crypto.decrypt(Buffer.from(gonderen.smtp_pass_enc));
    let sonuc: Awaited<ReturnType<typeof mailGonder>>;
    try {
      sonuc = await mailGonder(
        {
          fromName: gonderen.from_name,
          fromEmail: gonderen.from_email,
          host: gonderen.smtp_host,
          port: Number(gonderen.smtp_port),
          secure: gonderen.smtp_secure,
          user: gonderen.smtp_user,
          pass: parola,
        },
        {
          to: alicilar,
          subject: input.subject,
          html: `${govde}${imza}`,
          ...(ekler.length > 0 ? { attachments: ekler } : {}),
        },
      );
    } catch (err) {
      const mesaj = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Rapor maili gönderilemedi (${ctx.userId} → ${alicilar.join(', ')}): ${mesaj}`,
      );
      /*
       * PLATFORMUN KENDİ MESAJI YUKARI TAŞINIYOR. "Gönderilemedi" demek,
       * "kimlik doğrulanamadı" ile "alıcı reddedildi"yi aynı cümleye
       * çevirirdi ve ikisinin yapılacak işi farklı.
       */
      throw new BadRequestException(`Mail gönderilemedi — ${mesaj}`);
    }

    await this.prisma.withTenant(ctx, (tx) =>
      this.audit.record(tx, ctx, {
        action: 'report.emailed',
        targetType: 'client',
        targetId: input.clientId,
        clientId: input.clientId,
        after: {
          /*
           * KABUL EDİLEN adresler yazılıyor, İSTENEN değil. "Kime gönderdim"
           * sorusunun aylar sonraki cevabı, sunucunun teslim için kabul
           * ettiği liste olmalı; reddedilenler ayrı alanda duruyor.
           */
          to: sonuc.kabul,
          reddedilen: sonuc.ret,
          from: gonderen.from_email,
          subject: input.subject,
          range: `${input.from}..${input.to}`,
          attachedPdf: input.attachPdf,
          // FATURA İZİ DENETİM KAYDINDA: "faturayı gönderdim mi" sorusunun
          // aylar sonra cevaplanabilmesi için.
          faturaEki: fatura.bulunan,
          faturasizDonemler: fatura.eksikDonemler,
          // Eklenemeyen fatura da iz bırakıyor: boyut sınırına takılan bir
          // belge, yüklenmemiş bir belgeyle aynı şey değil.
          faturaAtlanan: fatura.atlanan,
        },
        ...meta,
      }),
    );

    /*
     * KISMİ RET YUKARI TAŞINIYOR. nodemailer alıcılardan bazıları
     * reddedilse bile fırlatmıyor (yalnızca hepsi reddedilirse) — yani
     * yukarıdaki `catch` bu hâli GÖRMÜYOR. Ekran "gönderildi" yazıp
     * reddedileni saklarsa, kullanıcının müşterisinin raporu almadığını
     * günler sonra öğrenmesi demek olurdu.
     */
    if (sonuc.ret.length > 0) {
      this.logger.warn(
        `Rapor maili kısmen gitti — reddedilen: ` +
          sonuc.ret.map((r) => `${r.adres} (${r.sebep})`).join(', '),
      );
    }

    return { sent: true, to: sonuc.kabul, reddedilen: sonuc.ret };
  }

  /**
   * ═══ ZAMANLANMIŞ GÖNDERİM — AYNI ÇEKİRDEK, OTURUMSUZ ═══
   *
   * `gonder()` ile aynı sınıfta ve aynı yardımcıları kullanıyor. Ayrı bir
   * servise koymak cazipti; koymadım çünkü ikisi de MÜŞTERİYE mail atıyor ve
   * CLAUDE.md'nin dersi net: "AYNI ŞEYİ ÜRETEN İKİNCİ FONKSİYON, DOĞDUĞU AN
   * AYRIŞIR." Ayrışacak şeyler somut: imza temizliği, imzanın eklenmesi,
   * PDF ekinin adı, doğrulanmamış kimliğin reddi.
   *
   * FARKI TEK: gövdeyi kullanıcı yazmıyor, `raporMailTaslagi` üretiyor.
   * Elle gönderimde danışman metni okuyup düzenliyor (değerlendirme
   * cümlesini veriden çıkarmak mümkün değil); burada o adım yok ve şablonun
   * ürettiği nötr metin gidiyor.
   *
   * RAPOR BİR KEZ KURULUYOR. `taslak()` + `gonder()` ardışık çağrılsaydı
   * `reports.build()` iki kez koşardı — aylık raporda ağır bir sorgu.
   */
  async zamanlanmisGonder(
    ctx: TenantContext,
    params: {
      clientId: string;
      from: string;
      to: string;
      templateId: string | null;
      toEmails: readonly string[];
      attachPdf: boolean;
    },
  ): Promise<{
    to: string[];
    bosDonem: boolean;
    faturasizDonemler: string[];
    reddedilen: Array<{ adres: string; sebep: string }>;
  }> {
    const gonderen = await this.gonderen(ctx);
    if (!gonderen) {
      throw new BadRequestException(
        'Planı kuran kullanıcının e-posta kimliği tanımlı değil. ' +
          'Ayarlar → E-posta Ayarları ekranından kurulmalı.',
      );
    }
    if (gonderen.verified_at === null) {
      /*
       * BAŞKA BİR GÖNDERİCİYE DÜŞÜLMÜYOR. Müşteriye tanımadığı bir kişiden
       * mail gitmesi, hiç gitmemesinden kötü — ve fark hiçbir ekranda
       * görünmezdi. Plan `failed` işaretlenip panelde gösteriliyor.
       */
      throw new BadRequestException(
        `${gonderen.from_email} adresinin doğrulaması düşmüş. ` +
          'Ayarlar → E-posta Ayarları ekranından kendine test maili gönder.',
      );
    }

    // ELLE GÖNDERİMLE AYNI ÇÖZÜCÜ. Kural iki yerde yazılsaydı biri
    // güncellenmediğinde planlı raporlar sessizce başka adrese giderdi.
    const alicilar = nihaiAlicilar({
      secilen: params.toEmails,
      musteriAdresleri: await this.musteriEpostalari(ctx, params.clientId),
    });
    if (alicilar.length === 0) {
      throw new BadRequestException(
        'Alıcı yok: planda adres girilmemiş ve müşterinin kayıtlı rapor alıcısı tanımlı değil.',
      );
    }

    const query: ReportQuery = {
      clientId: params.clientId,
      from: params.from,
      to: params.to,
      ...(params.templateId ? { templateId: params.templateId } : {}),
    };
    const data = await this.reports.build(ctx, query);

    /*
     * VERİ YOKSA GÖNDERİLMİYOR — ve bu bir karar, sessiz bir düşme değil.
     *
     * Sıfırlarla dolu otomatik bir mail müşteriye "sistem bozulmuş" diye
     * okunuyor ve ajansın işini kötü gösteriyor. Ama atlamak da sessiz
     * kalmamalı: çağıran bunu `last_status = 'skipped'` olarak yazıyor ve
     * panelde sebebiyle görünüyor (CLAUDE.md: "Boş liste NEDENİNİ söylesin").
     */
    if (data.platforms.length === 0) {
      return { to: alicilar, bosDonem: true, faturasizDonemler: [], reddedilen: [] };
    }

    const t = raporMailTaslagi(data, gonderen.from_name);
    const govde = imzaTemizle(t.html).html;
    const imza = gonderen.signature_html ? `<br /><br />${gonderen.signature_html}` : '';

    const ekler = params.attachPdf
      ? [
          {
            // Elle gönderimle AYNI üretici: iki yol farklı ad verirse aynı
            // rapor iki farklı belge gibi görünürdü.
            filename: raporDosyaAdi({
              musteriAdi: data.client.name,
              baslik: data.title,
              from: params.from,
              to: params.to,
            }),
            content: await this.pdf.uret(data),
            contentType: 'application/pdf',
          },
        ]
      : [];

    // Planlı gönderimde de faturalar ekleniyor — elle gönderimle aynı yol.
    // Elle gönderimle aynı: PDF'in payı bütçeye giriyor.
    const kullanilan = ekler.reduce((t, e) => t + e.content.byteLength, 0);
    const fatura = await this.faturalar.raporEkleri(
      params.clientId,
      params.from,
      params.to,
      kullanilan,
    );
    ekler.push(...fatura.ekler);

    const sonuc = await mailGonder(
      {
        fromName: gonderen.from_name,
        fromEmail: gonderen.from_email,
        host: gonderen.smtp_host,
        port: Number(gonderen.smtp_port),
        secure: gonderen.smtp_secure,
        user: gonderen.smtp_user,
        pass: this.crypto.decrypt(Buffer.from(gonderen.smtp_pass_enc)),
      },
      {
        to: alicilar,
        subject: t.subject,
        html: `${govde}${imza}`,
        ...(ekler.length > 0 ? { attachments: ekler } : {}),
      },
    );

    /*
     * PLANLI YOLDA KISMİ RET DAHA TEHLİKELİ: ekranda bekleyen kimse yok ve
     * hata yalnızca plan kaydına bakılırsa görülüyor. Çağıran bunu
     * `last_status`a yazıyor.
     */
    if (sonuc.ret.length > 0) {
      this.logger.warn(
        `Planlı rapor kısmen gitti (${params.clientId}) — reddedilen: ` +
          sonuc.ret.map((r) => `${r.adres} (${r.sebep})`).join(', '),
      );
    }

    return {
      to: sonuc.kabul,
      bosDonem: false,
      faturasizDonemler: fatura.eksikDonemler,
      reddedilen: sonuc.ret,
    };
  }

  /**
   * Müşterinin kayıtlı rapor alıcıları.
   *
   * DİZİ DÖNÜYOR ve boş dizi "tanımlı değil" demek. Eskiden tek bir
   * `contact_email` vardı; müşteride birden çok yetkili olması kural, istisna
   * değil ve tek adres her gönderimde elle adres yazmak demekti.
   */
  private async musteriEpostalari(ctx: TenantContext, clientId: string): Promise<string[]> {
    const rows = await this.prisma.withTenant(ctx, (tx) =>
      tx.$queryRaw<Array<{ contact_emails: string[] | null }>>(Prisma.sql`
        SELECT contact_emails FROM clients WHERE id = ${clientId}::uuid
      `),
    );
    return rows[0]?.contact_emails ?? [];
  }

  /** Gönderenin kendi e-posta kimliği. RLS zaten yalnızca kendi satırını veriyor. */
  private async gonderen(ctx: TenantContext) {
    const rows = await this.prisma.withTenant(ctx, (tx) =>
      tx.$queryRaw<
        Array<{
          from_name: string;
          from_email: string;
          smtp_host: string;
          smtp_port: number;
          smtp_secure: boolean;
          smtp_user: string;
          smtp_pass_enc: Uint8Array;
          signature_html: string | null;
          verified_at: Date | null;
        }>
      >(Prisma.sql`
        SELECT from_name, from_email, smtp_host, smtp_port, smtp_secure, smtp_user,
               smtp_pass_enc, signature_html, verified_at
          FROM user_email_accounts
         WHERE user_id = ${ctx.userId}::uuid
      `),
    );
    return rows[0] ?? null;
  }
}
