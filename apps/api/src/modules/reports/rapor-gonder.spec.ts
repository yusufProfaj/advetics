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

/**
 * GÖNDERİM ARTIK ORTAK BİR FONKSİYONDA (`email/mail-gonderici.ts`).
 *
 * Taşınma sebebi ikinci bir gönderenin (ödeme uyarısı maili) eklenmesiydi:
 * taşıma kararlarını (`replyTo`, parola çözümü, hata sarmalama) kopyalamak,
 * onların doğduğu anda ayrışması demekti.
 *
 * BU DOSYA HÂLÂ `gonder()`E BAKIYOR çünkü sınadığı şey KAPILAR: doğrulanmış
 * kimlik, alıcı kontrolü, gövde temizliği, denetim sırası. Taşımanın
 * kendisine ait iddia (`replyTo`) ise `mail-gonderici.spec.ts`e taşındı —
 * iddiayı kodun bulunmadığı dosyada tutmak, ilk yeniden düzenlemede boşa
 * düşen bir tarama demekti. Nitekim tam bu oldu ve bekçi yakaladı.
 */
const GONDERICI = readFileSync(
  join(__dirname, '..', 'email', 'mail-gonderici.ts'),
  'utf8',
);

function gonderGovdesi(): string {
  const bas = KAYNAK.indexOf('  async gonder(');
  if (bas === -1) {
    throw new Error('gonder() bulunamadı — tarama boşa düştü, testi güncelle.');
  }
  const g = KAYNAK.slice(bas, KAYNAK.indexOf('\n  private async musteriEpostasi'));
  if (!g.includes('mailGonder(')) {
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
    // Kapı gönderimden ÖNCE olmalı.
    expect(i).toBeLessThan(g.indexOf('mailGonder('));
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
    expect(i).toBeLessThan(g.indexOf('mailGonder('));
  });

  it('replyTo AÇIKÇA yazılıyor — bazı sunucular gönderen adresini yeniden yazıyor', () => {
    // İDDİA ARTIK ORTAK GÖNDERİCİDE: karar oraya taşındı ve iddiayı burada
    // tutmak, kodun bulunmadığı dosyayı taramak olurdu.
    expect(GONDERICI).toContain('replyTo: kimlik.fromEmail');
  });

  it('KRİTİK: gönderim DENETİME yazılıyor — kime, ne zaman, hangi dönem', () => {
    const g = gonderGovdesi();
    expect(g).toContain("action: 'report.emailed'");
    expect(g).toContain('to: alici');
  });

  it('denetim GÖNDERİMDEN SONRA — gitmemiş bir mail kaydedilmemeli', () => {
    const g = gonderGovdesi();
    expect(g.indexOf('mailGonder(')).toBeLessThan(g.indexOf("action: 'report.emailed'"));
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
