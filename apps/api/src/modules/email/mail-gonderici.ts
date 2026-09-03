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
  /**
   * ALICI LİSTESİ — TEK DİZGE DEĞİL.
   *
   * Eskiden `to: string` idi ve çoklu gönderim yapan tek yer (Auto-Boost
   * bildirimi) adresleri KENDİ İÇİNDE `join(', ')` ile birleştiriyordu. Tip
   * "tek alıcı" diyor, kullanım "çok alıcı" yapıyordu; ikinci bir çağıran
   * geldiğinde aynı birleştirme kararını (ayırıcı, tekilleştirme, boşluk
   * kırpma) yeniden yazmak zorunda kalacaktı ve o kopya doğduğu anda ayrışır.
   */
  to: readonly string[];
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
}

/** Gönderimin alıcı bazında sonucu. */
export interface GonderimSonucu {
  /** Sunucunun teslim için KABUL ETTİĞİ adresler. */
  kabul: string[];
  /**
   * Sunucunun REDDETTİĞİ adresler ve sebepleri.
   *
   * Boş olmayan bir liste, kullanıcının GÖRMESİ gereken bir arıza demek.
   */
  ret: Array<{ adres: string; sebep: string }>;
}

/**
 * Maili gönderir. Hata OLDUĞU GİBİ yukarı çıkıyor.
 *
 * Yutmak bu projede en pahalı hata türü: gönderilmediği hâlde
 * "gönderildi" yazan bir akış, kullanıcının müşterisinin raporu almadığını
 * günler sonra öğrenmesi demek. Çağıran hatayı kaydetmek ve göstermekle
 * yükümlü.
 *
 * ┌─ KISMİ RET SESSİZCE BAŞARILI DÖNÜYOR — ÇOKLU ALICININ TUZAĞI ─────────┐
 * │ nodemailer 9.0.5, `smtp-connection/index.js:1856`:                     │
 * │                                                                        │
 * │   if (this._envelope.rejected.length < this._envelope.to.length) {     │
 * │     // bazıları kabul edildi → AKIŞ DEVAM EDİYOR                       │
 * │   } else {                                                             │
 * │     err = ... "Can't send mail - all recipients were rejected"          │
 * │   }                                                                    │
 * │                                                                        │
 * │ Yani üç alıcıdan biri reddedilirse `sendMail` FIRLATMIYOR; ret yalnızca │
 * │ dönüş nesnesindeki `rejected` alanında duruyor. Tek alıcıyken bu hâl    │
 * │ YOKTU (ret = hepsi reddedildi = fırlatır), yani çoklu alıcıya geçmek bu │
 * │ sessiz hatayı KENDİ ELİMİZLE açıyor. Dönüş değeri bu yüzden var ve bu   │
 * │ yüzden `void` DEĞİL: çağıranın onu okumaması artık bir tip hatası değil │
 * │ ama en azından görünür bir eksiklik.                                    │
 * └────────────────────────────────────────────────────────────────────────┘
 */
export async function mailGonder(
  kimlik: SmtpKimligi,
  mail: GonderilecekMail,
): Promise<GonderimSonucu> {
  /*
   * BOŞ LİSTE ERKEN REDDEDİLİYOR. nodemailer boş `to` ile "No recipients
   * defined" fırlatıyor ama mesajı bizim bağlamımızı taşımıyor; kullanıcıya
   * "alıcı yok" demek, SMTP hatasını göstermekten anlaşılır.
   */
  if (mail.to.length === 0) {
    throw new Error('Alıcı listesi boş — gönderilecek adres yok.');
  }

  const transport = createTransport({
    host: kimlik.host,
    port: kimlik.port,
    secure: kimlik.secure,
    auth: { user: kimlik.user, pass: kimlik.pass },
  });

  const bilgi = (await transport.sendMail({
    from: { name: kimlik.fromName, address: kimlik.fromEmail },
    /*
     * DİZİ OLARAK VERİLİYOR, birleştirilmiş dizge olarak değil: adres
     * ayrıştırmasını nodemailer yapıyor ve virgül taşıyan bir görünen ad
     * ("Yapı, A.Ş. <a@b.com>") elle birleştirmede listeyi ikiye bölerdi.
     */
    to: [...mail.to],
    /*
     * YANITLAR GÖNDERENE GİTSİN. `from` zaten onun adresi ama bazı kurumsal
     * sunucular gönderen adresini yeniden yazıyor; `replyTo` açıkça
     * yazılınca "yanıtla" her hâlükârda doğru yere gidiyor.
     */
    replyTo: kimlik.fromEmail,
    subject: mail.subject,
    html: mail.html,
    ...(mail.attachments ? { attachments: mail.attachments } : {}),
  })) as {
    accepted?: unknown;
    rejected?: unknown;
    rejectedErrors?: Array<{ recipient?: unknown; message?: unknown }>;
  };

  return {
    kabul: adresler(bilgi.accepted),
    ret: retSebepleri(bilgi.rejected, bilgi.rejectedErrors),
  };
}

/**
 * nodemailer `accepted`/`rejected` içinde ya düz dizge ya `{address}` nesnesi
 * döndürüyor (adres bir görünen adla verilmişse nesne). İkisini de kabul
 * etmek zorundayız; yalnızca dizge beklemek listeyi sessizce boşaltırdı.
 */
function adresler(deger: unknown): string[] {
  if (!Array.isArray(deger)) return [];
  return deger
    .map((d) => (typeof d === 'string' ? d : ((d as { address?: unknown })?.address ?? null)))
    .filter((d): d is string => typeof d === 'string');
}

/** Reddedilen adresleri sebepleriyle eşler; sebep yoksa adres yine listede kalır. */
function retSebepleri(
  reddedilen: unknown,
  hatalar: Array<{ recipient?: unknown; message?: unknown }> | undefined,
): Array<{ adres: string; sebep: string }> {
  const sebepler = new Map<string, string>();
  for (const h of hatalar ?? []) {
    const adres = typeof h?.recipient === 'string' ? h.recipient : null;
    if (adres) sebepler.set(adres.toLowerCase(), String(h?.message ?? 'sunucu reddetti'));
  }
  /*
   * SEBEP BULUNAMAZSA DA ADRES LİSTEDE KALIYOR. `rejectedErrors` her sunucuda
   * dolmuyor; sebebi bilmemek, reddi bildirmemek için gerekçe değil.
   */
  return adresler(reddedilen).map((adres) => ({
    adres,
    sebep: sebepler.get(adres.toLowerCase()) ?? 'sunucu reddetti',
  }));
}
