import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * RAPOR GÖNDERİMİ — KAPI KONTROLLERİ.
 *
 * Bu yol müşteriye mail atıyor: yanlış giden bir şey geri alınamıyor. O
 * yüzden kapılar kaynak taramasıyla kilitleniyor — SMTP'ye gerçekten bağlanan
 * bir birim testi kurmak mümkün değil ve ayrışma tek satırlık.
 */
const KAYNAK = readFileSync(join(__dirname, 'rapor-gonder.service.ts'), 'utf8');

function gonderGovdesi(): string {
  const bas = KAYNAK.indexOf('  async gonder(');
  if (bas === -1) {
    throw new Error('gonder() bulunamadı — tarama boşa düştü, testi güncelle.');
  }
  const g = KAYNAK.slice(bas, KAYNAK.indexOf('\n  private async musteriEpostasi'));
  if (!g.includes('sendMail')) {
    throw new Error('gonder() dilimi mail atmıyor — tarama boşa düştü.');
  }
  return g;
}

describe('rapor gönderimi', () => {
  it('KRİTİK: DOĞRULANMAMIŞ e-posta kimliğiyle gönderim REDDEDİLİYOR', () => {
    /*
     * "Kaydedildi" doğrulama değil: SMTP kimliği yanlışsa hata ilk gerçek
     * gönderimde çıkar ve o gönderim MÜŞTERİYE gidecek olandır.
     */
    const g = gonderGovdesi();
    const i = g.indexOf('verified_at === null');
    expect(i, 'doğrulama kapısı yok').toBeGreaterThan(-1);
    // Kapı sendMail'den ÖNCE olmalı.
    expect(i).toBeLessThan(g.indexOf('sendMail'));
  });

  it('KRİTİK: alıcı yoksa açık bir hata — sessizce boşa gönderilmiyor', () => {
    const g = gonderGovdesi();
    expect(g).toContain('iletişim e-postası tanımlı değil');
  });

  it('KRİTİK: gövde TEMİZLENİYOR — alıcının istemcisinde açılıyor', () => {
    // Kullanıcı taslağı ekranda düzenliyor; sonuç imza ile aynı yüzey.
    const g = gonderGovdesi();
    const i = g.indexOf('imzaTemizle(input.html)');
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(g.indexOf('sendMail'));
  });

  it('replyTo AÇIKÇA yazılıyor — bazı sunucular gönderen adresini yeniden yazıyor', () => {
    expect(gonderGovdesi()).toContain('replyTo: gonderen.from_email');
  });

  it('KRİTİK: gönderim DENETİME yazılıyor — kime, ne zaman, hangi dönem', () => {
    const g = gonderGovdesi();
    expect(g).toContain("action: 'report.emailed'");
    expect(g).toContain('to: alici');
  });

  it('denetim GÖNDERİMDEN SONRA — gitmemiş bir mail kaydedilmemeli', () => {
    const g = gonderGovdesi();
    expect(g.indexOf('sendMail')).toBeLessThan(g.indexOf("action: 'report.emailed'"));
  });

  it('SMTP hatası OLDUĞU GİBİ yukarı taşınıyor', () => {
    // "Gönderilemedi" demek, "kimlik doğrulanamadı" ile "alıcı reddedildi"yi
    // aynı cümleye çevirirdi ve ikisinin yapılacak işi farklı.
    expect(gonderGovdesi()).toContain('Mail gönderilemedi — ${mesaj}');
  });

  it('taslak, gönderenin HAZIR olup olmadığını söylüyor', () => {
    const bas = KAYNAK.indexOf('  async taslak(');
    expect(bas).toBeGreaterThan(-1);
    const t = KAYNAK.slice(bas, KAYNAK.indexOf('  async gonder('));
    expect(t).toContain('senderReady');
    expect(t).toContain('defaultTo');
  });

  it('KUYRUK YOK — karar ölçülerek verildi ve gerekçesi yazılı', () => {
    // Kuyruğa taşımak kullanıcıyı "gitti mi?" sorusuyla baş başa bırakırdı;
    // pdf-lib ölçümü (1 sn, 10 MB) tavanın yanına yaklaşmıyor.
    expect(KAYNAK).toContain('SENKRON, KUYRUKTA DEĞİL');
    expect(KAYNAK).toContain('ÖLÇÜLEREK');
  });
});
