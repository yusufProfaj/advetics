import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mailGonder, type SmtpKimligi } from './mail-gonderici';

/**
 * ═══ ÇOKLU ALICI YENİ BİR SESSİZ HATA YOLU AÇIYOR ═══
 *
 * nodemailer 9.0.5, `smtp-connection/index.js:1856`:
 *
 *   if (this._envelope.rejected.length < this._envelope.to.length) {
 *     // bazıları kabul edildi → AKIŞ DEVAM EDİYOR
 *   } else {
 *     err = ... "Can't send mail - all recipients were rejected"
 *   }
 *
 * Yani üç alıcıdan biri reddedilirse `sendMail` FIRLATMIYOR. Tek alıcıyken bu
 * hâl YOKTU (ret = hepsi reddedildi = fırlatır); çoklu alıcıya geçmek bu
 * sessiz hatayı KENDİ ELİMİZLE açıyor. Bu dosyanın tamamı o kapıyı kapatıyor.
 */

const KIMLIK: SmtpKimligi = {
  fromName: 'Advetics',
  fromEmail: 'gonderen@ajans.com',
  host: 'smtp.test',
  port: 587,
  secure: false,
  user: 'u',
  pass: 'p',
};

const MAIL = { subject: 'Rapor', html: '<p>merhaba</p>' };

/** `createTransport`u yamalayıp `sendMail` çağrısını ve dönüşünü yakalar. */
function transportKur(yanit: unknown) {
  /*
   * PARAMETRE YAZILI VE BU ŞART: parametresiz bir `vi.fn`de `mock.calls` BOŞ
   * DEMET tipi oluyor ve `calls[0][0]` DERLENMİYOR (TS2493). Vitest tip
   * denetimi yapmadığı için hata yalnızca `typecheck` ile görünüyor — aynı
   * tuzağa bu depoda daha önce de düşüldü.
   */
  const sendMail = vi.fn(async (_mail: Record<string, unknown>) => yanit);
  vi.doMock('nodemailer', () => ({ createTransport: () => ({ sendMail }) }));
  return sendMail;
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('nodemailer');
});

describe('mailGonder', () => {
  it('KRİTİK: KISMİ RET dönüş değerinde görünüyor — yutulmuyor', async () => {
    const sendMail = transportKur({
      accepted: ['a@x.com'],
      rejected: ['b@x.com'],
      rejectedErrors: [{ recipient: 'b@x.com', message: '550 mailbox unavailable' }],
    });
    const { mailGonder: taze } = await import('./mail-gonderici');

    const sonuc = await taze(KIMLIK, { ...MAIL, to: ['a@x.com', 'b@x.com'] });

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sonuc.kabul).toEqual(['a@x.com']);
    expect(sonuc.ret).toEqual([{ adres: 'b@x.com', sebep: '550 mailbox unavailable' }]);
  });

  it('KRİTİK: sebep bulunamasa da REDDEDİLEN adres listede kalıyor', async () => {
    /*
     * `rejectedErrors` her sunucuda dolmuyor. Sebebi bilmemek, reddi
     * bildirmemek için gerekçe değil — aksi hâlde bazı sunucularda ret
     * tamamen görünmez olurdu.
     */
    transportKur({ accepted: ['a@x.com'], rejected: ['b@x.com'] });
    const { mailGonder: taze } = await import('./mail-gonderici');

    const sonuc = await taze(KIMLIK, { ...MAIL, to: ['a@x.com', 'b@x.com'] });
    expect(sonuc.ret).toEqual([{ adres: 'b@x.com', sebep: 'sunucu reddetti' }]);
  });

  it('nesne biçimli adres de okunuyor', async () => {
    /*
     * nodemailer, adres bir görünen adla verildiğinde `{address}` nesnesi
     * döndürüyor. Yalnızca dizge beklemek listeyi SESSİZCE boşaltırdı ve
     * "hiç kimseye gitmedi" gibi görünürdü.
     */
    transportKur({ accepted: [{ address: 'a@x.com' }], rejected: [] });
    const { mailGonder: taze } = await import('./mail-gonderici');

    const sonuc = await taze(KIMLIK, { ...MAIL, to: ['a@x.com'] });
    expect(sonuc.kabul).toEqual(['a@x.com']);
  });

  it('KRİTİK: alıcılar DİZİ olarak veriliyor — elle birleştirilmiyor', async () => {
    /*
     * Adresleri `join(', ')` ile birleştirmek, virgül taşıyan bir görünen adı
     * ("Yapı, A.Ş. <a@x.com>") ikiye böler. Ayrıştırma nodemailer'ın işi.
     */
    const sendMail = transportKur({ accepted: ['a@x.com', 'b@x.com'], rejected: [] });
    const { mailGonder: taze } = await import('./mail-gonderici');

    await taze(KIMLIK, { ...MAIL, to: ['a@x.com', 'b@x.com'] });
    const cagri = sendMail.mock.calls[0]![0] as { to: unknown; replyTo: unknown };
    expect(Array.isArray(cagri.to)).toBe(true);
    expect(cagri.to).toEqual(['a@x.com', 'b@x.com']);
    // Yanıtlar gönderene gitsin — kurumsal sunucular `from`u yeniden yazıyor.
    expect(cagri.replyTo).toBe(KIMLIK.fromEmail);
  });

  it('KRİTİK: BOŞ liste erken reddediliyor, SMTP hatasına dönüşmüyor', async () => {
    const sendMail = transportKur({ accepted: [], rejected: [] });
    const { mailGonder: taze } = await import('./mail-gonderici');

    await expect(taze(KIMLIK, { ...MAIL, to: [] })).rejects.toThrow('Alıcı listesi boş');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('gönderim hatası OLDUĞU GİBİ yukarı çıkıyor', async () => {
    // Yutmak bu projede en pahalı hata türü: gönderilmediği hâlde
    // "gönderildi" yazan bir akış.
    vi.doMock('nodemailer', () => ({
      createTransport: () => ({
        sendMail: async () => {
          throw new Error('535 auth failed');
        },
      }),
    }));
    const { mailGonder: taze } = await import('./mail-gonderici');
    await expect(taze(KIMLIK, { ...MAIL, to: ['a@x.com'] })).rejects.toThrow('535 auth failed');
  });

  it('ekler olduğu gibi geçiyor', async () => {
    const sendMail = transportKur({ accepted: ['a@x.com'], rejected: [] });
    const { mailGonder: taze } = await import('./mail-gonderici');

    const ekler = [{ filename: 'a.pdf', content: Buffer.from('x'), contentType: 'application/pdf' }];
    await taze(KIMLIK, { ...MAIL, to: ['a@x.com'], attachments: ekler });
    expect((sendMail.mock.calls[0]![0] as { attachments: unknown }).attachments).toEqual(ekler);
  });
});

/**
 * ═══ VARSAYIMIN KENDİSİ ═══
 *
 * Yukarıdaki testler "kısmi ret fırlatmıyor" davranışını taklit ediyor.
 * Varsayım yanlışsa hepsi birlikte yanlış olur ve yeşil kalır — o yüzden
 * davranış kütüphanenin KENDİ kaynağından da kanıtlanıyor. nodemailer bir gün
 * kısmi reddi fırlatmaya başlarsa bu test düşsün ve varsayım yeniden
 * düşünülsün.
 */
describe('nodemailer davranışı — varsayım kaynaktan doğrulanıyor', () => {
  it('kısmi ret FIRLATMIYOR, yalnızca hepsi reddedilince fırlatıyor', () => {
    const yol = require.resolve('nodemailer/lib/smtp-connection/index.js');
    const kaynak = readFileSync(yol, 'utf8');

    const i = kaynak.indexOf('all recipients were rejected');
    expect(i, 'ilgili dal bulunamadı — nodemailer sürümünü kontrol et').toBeGreaterThan(-1);

    // O hata yalnızca "reddedilen sayısı < alıcı sayısı" KOŞULU SAĞLANMAZSA
    // üretiliyor; yani bazıları kabul edildiğinde akış devam ediyor.
    const once = kaynak.slice(Math.max(0, i - 600), i);
    expect(once).toMatch(/rejected\.length\s*<\s*this\._envelope\.to\.length/);
  });

  it('dönüş nesnesi accepted ve rejected taşıyor', () => {
    const kaynak = readFileSync(
      require.resolve('nodemailer/lib/smtp-connection/index.js'),
      'utf8',
    );
    expect(kaynak).toContain('accepted: this._envelope.accepted');
    expect(kaynak).toContain('rejected: this._envelope.rejected');
  });
});
