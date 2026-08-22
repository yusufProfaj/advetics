import { z } from 'zod';

/**
 * DANIŞMAN BAŞINA E-POSTA KİMLİĞİ.
 *
 * Rapor müşteriye danışmanın KENDİ adresinden gidiyor: müşteri "yanıtla"
 * dediğinde ona ulaşmalı ve mail onun imzasını taşımalı. Org seviyesinde tek
 * bir ayar olsaydı bu bir `.env` değişkeni olurdu.
 *
 * PAROLA HİÇBİR OKUMA YOLUNDAN GERİ DÖNMÜYOR. Yanıt tipinde yalnızca
 * "kurulu mu" bilgisi var.
 */
export const emailAccountInputSchema = z.object({
  fromName: z.string().trim().min(1).max(160),
  fromEmail: z.string().trim().email().max(255),
  smtpHost: z.string().trim().min(1).max(255),
  /**
   * 465 (SSL) ya da 587 (STARTTLS) tipik. Serbest bırakıldı: kurumsal
   * sunucular başka port kullanabiliyor.
   */
  smtpPort: z.number().int().min(1).max(65535),
  smtpSecure: z.boolean(),
  smtpUser: z.string().trim().min(1).max(255),
  /**
   * Uygulama parolası.
   *
   * BOŞ BIRAKMAK "değiştirme" demek — kayıtlı parola korunuyor. Zorunlu
   * yapmak, imzasını güncellemek isteyen kullanıcıya parolasını yeniden
   * yazdırmak olurdu ve o parola bir daha okunamıyor (şifreli saklanıyor).
   */
  smtpPass: z.string().min(1).max(512).optional(),
  /** İmza HTML'i. Sunucuda TEMİZLENİYOR ve temizlenmiş hâli saklanıyor. */
  signatureHtml: z.string().max(60_000).optional(),
});
export type EmailAccountInput = z.infer<typeof emailAccountInputSchema>;

/** Okuma yanıtı — PAROLA YOK. */
export interface EmailAccountSummary {
  fromName: string;
  fromEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  /** Parolanın kendisi DEĞİL, yalnızca kurulu olup olmadığı. */
  hasPassword: boolean;
  signatureHtml: string | null;
  /**
   * Kendine test maili gönderilerek doğrulanmış mı.
   *
   * "Kaydedildi" doğrulama DEĞİL: SMTP kimliği yanlışsa hata ancak ilk
   * gerçek gönderimde çıkar ve o gönderim müşteriye gidecek olandır.
   */
  verifiedAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

/** İmza temizliğinde neyin atıldığı — kullanıcıya SÖYLENİYOR. */
export interface SignatureCleanReport {
  removedTags: string[];
  removedAttributes: string[];
  /** Gmail proxy adresleri gerçek kaynağına çevrildi mi. */
  rewrittenImages: number;
}
