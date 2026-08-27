import { createTransport } from 'nodemailer';

/**
 * ═══ SMTP GÖNDERİMİ — TEK YER ═══
 *
 * Gönderim `rapor-gonder.service.ts` içinde gömülüydü. İkinci bir gönderen
 * (ödeme uyarısı maili) eklenirken taşıma kararlarının kopyalanması
 * gerekecekti: `replyTo`nun açıkça yazılması, parolanın çözülmesi, hatanın
 * nasıl sarılacağı. Kopyalanan bu kararlar doğdukları anda ayrışır — biri
 * `replyTo` eklerken diğeri eklemez ve fark yalnızca alıcının istemcisinde
 * görünür.
 */

export interface SmtpKimligi {
  fromName: string;
  fromEmail: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  /** ÇÖZÜLMÜŞ parola. Şifre çözme çağıranın işi — anahtar bu katmana girmiyor. */
  pass: string;
}

export interface GonderilecekMail {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
}

/**
 * Maili gönderir. Hata OLDUĞU GİBİ yukarı çıkıyor.
 *
 * Yutmak bu projede en pahalı hata türü: gönderilmediği hâlde
 * "gönderildi" yazan bir akış, kullanıcının müşterisinin raporu almadığını
 * günler sonra öğrenmesi demek. Çağıran hatayı kaydetmek ve göstermekle
 * yükümlü.
 */
export async function mailGonder(kimlik: SmtpKimligi, mail: GonderilecekMail): Promise<void> {
  const transport = createTransport({
    host: kimlik.host,
    port: kimlik.port,
    secure: kimlik.secure,
    auth: { user: kimlik.user, pass: kimlik.pass },
  });

  await transport.sendMail({
    from: { name: kimlik.fromName, address: kimlik.fromEmail },
    to: mail.to,
    /*
     * YANITLAR GÖNDERENE GİTSİN. `from` zaten onun adresi ama bazı kurumsal
     * sunucular gönderen adresini yeniden yazıyor; `replyTo` açıkça
     * yazılınca "yanıtla" her hâlükârda doğru yere gidiyor.
     */
    replyTo: kimlik.fromEmail,
    subject: mail.subject,
    html: mail.html,
    ...(mail.attachments ? { attachments: mail.attachments } : {}),
  });
}
