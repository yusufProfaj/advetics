import { Injectable } from '@nestjs/common';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { CryptoService } from '../../crypto/crypto.service';
import { mailGonder } from '../email/mail-gonderici';

/**
 * ÖDEME MAİLİNİ GÖNDEREN TEK YER — özet de anlık uyarı da buradan geçiyor.
 *
 * İkisi ayrı yazılsaydı biri bir gün alıcıyı ya da gönderen kimliğini
 * değiştirir, diğeri eski adrese gitmeye devam ederdi; "özet geliyor ama
 * anlık uyarı gelmiyor" hâli hiçbir hata üretmezdi.
 */
@Injectable()
export class OdemeMailiGonderici {
  constructor(
    private readonly admin: PrismaAdminService,
    private readonly crypto: CryptoService,
  ) {}

  /**
   * Maili gönderir. Kimlik yoksa ya da SMTP reddederse FIRLATIYOR; ne
   * yapılacağına çağıran karar veriyor (özet notuna yazıyor, anlık tetik
   * damgayı geri alıp bir sonraki kontrolde yeniden deniyor).
   */
  async gonder(konu: string, html: string): Promise<{ alici: string }> {
    const hesap = await this.gonderenHesap();
    if (!hesap) {
      throw new Error('yönetici hesabında e-posta kimliği tanımlı değil');
    }
    await mailGonder(
      {
        fromName: hesap.fromName,
        fromEmail: hesap.fromEmail,
        host: hesap.smtpHost,
        port: hesap.smtpPort,
        secure: hesap.smtpSecure,
        user: hesap.smtpUser,
        pass: this.crypto.decrypt(Buffer.from(hesap.smtpPassEnc)),
      },
      {
        /*
         * ALICI GÖNDERENİN KENDİSİ. Uyarı ajansın iç bilgisi — hangi
         * müşterinin ödemesi alınmadığı müşteriye gönderilecek bir şey
         * değil. Ayrı bir alıcı alanı eklemek, o alanın bir gün yanlış
         * doldurulup müşteri listesinin dışarı gitmesi riski.
         */
        // TEK ALICI AMA LİSTE OLARAK: `mailGonder` sözleşmesi çoğul.
        to: [hesap.fromEmail],
        subject: konu,
        html,
      },
    );
    return { alici: hesap.fromEmail };
  }

  /**
   * Maili gönderecek e-posta kimliği.
   *
   * ORG YÖNETİCİSİNİN hesabı seçiliyor ve seçim DETERMİNİSTİK (en eski
   * oluşturulan). Adres koda gömülmüyor: hangi adresin kullanılacağı ajansın
   * kararı ve panelden değiştirilebilir olmalı; koda yazmak, adres
   * değiştiğinde deploy gerektirirdi.
   */
  private async gonderenHesap() {
    return this.admin.userEmailAccount.findFirst({
      where: {
        user: {
          memberships: {
            some: { clientId: null, role: 'admin' },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        fromName: true,
        fromEmail: true,
        smtpHost: true,
        smtpPort: true,
        smtpSecure: true,
        smtpUser: true,
        smtpPassEnc: true,
      },
    });
  }
}
