import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALICI_UST_SINIRI,
  aliciAyristir,
  gecerliAdres,
  nihaiAlicilar,
} from '@advetics/shared';

/**
 * ═══ ALICI LİSTESİ ═══
 *
 * Rapor maili artık BİRDEN ÇOK kişiye gidiyor. Ayrıştırma kararları (ayırıcı,
 * tekilleştirme, üst sınır, yedeğe düşme) üç ekranda ve iki gönderim yolunda
 * kullanılıyor; hepsi TEK fonksiyondan geçmek zorunda çünkü ayrı yazılan bir
 * kural doğduğu anda ayrışıyor ve farkı yalnızca ALICI görüyor.
 */
describe('aliciAyristir', () => {
  it('virgül, noktalı virgül ve satır sonu ayırıcı', () => {
    /*
     * ÜÇÜ DE ŞART: kullanıcı adresleri Outlook'tan, bir tablodan ya da bir
     * e-postadan kopyalıyor ve hangi ayırıcıyla geldiği önceden bilinmiyor.
     */
    expect(aliciAyristir('a@x.com, b@x.com').adresler).toEqual(['a@x.com', 'b@x.com']);
    expect(aliciAyristir('a@x.com; b@x.com').adresler).toEqual(['a@x.com', 'b@x.com']);
    expect(aliciAyristir('a@x.com\nb@x.com').adresler).toEqual(['a@x.com', 'b@x.com']);
  });

  it('KRİTİK: BOŞLUK ayırıcı DEĞİL', () => {
    /*
     * Bazı sistemler adresi "Ad Soyad <a@x.com>" biçiminde veriyor; boşlukta
     * bölmek onu üçe ayırır ve üçü de geçersiz görünür. Kullanıcı kopyaladığı
     * listenin tamamının reddedildiğini görürdü.
     */
    const { adresler, gecersiz } = aliciAyristir('Ad Soyad <a@x.com>');
    expect(adresler.length + gecersiz.length).toBe(1);
  });

  it('KRİTİK: MÜKERRER adres tekilleşiyor — büyük/küçük harf duyarsız', () => {
    // Aynı kişiye iki kez mail gitmesi, listeyi iki yerden birleştiren
    // kullanıcının hiç fark etmeyeceği bir hata.
    expect(aliciAyristir('a@x.com, A@X.com, a@x.com').adresler).toEqual(['a@x.com']);
  });

  it('KRİTİK: saklanan hâl KULLANICININ YAZDIĞI, küçültülmüş değil', () => {
    /*
     * Adresin yerel kısmı teknik olarak büyük-küçük harfe duyarlı; küçültüp
     * göndermek bazı kurumsal sunucularda teslimatı bozuyor. Karşılaştırma
     * küçük harfle, GÖNDERİM yazıldığı gibi.
     */
    expect(aliciAyristir('Rapor.Alici@Firma.com').adresler).toEqual(['Rapor.Alici@Firma.com']);
  });

  it('geçersiz parça AYRI dönüyor — sessizce atılmıyor', () => {
    const { adresler, gecersiz } = aliciAyristir('a@x.com, bozuk, b@x.com');
    expect(adresler).toEqual(['a@x.com', 'b@x.com']);
    expect(gecersiz).toEqual(['bozuk']);
  });

  it('KRİTİK: üst sınırı aşan adresler ATILAN olarak bildiriliyor', () => {
    /*
     * "Sessiz kesme yok": sınıra takılan adres bildirilmezse kullanıcı
     * listenin tamamının gittiğini sanar.
     */
    const cok = Array.from({ length: ALICI_UST_SINIRI + 3 }, (_, i) => `k${i}@x.com`);
    const { adresler, atilan } = aliciAyristir(cok);
    expect(adresler.length).toBe(ALICI_UST_SINIRI);
    expect(atilan.length).toBe(3);
    // Atılanlar GERÇEKTEN listenin sonundakiler olmalı; rastgele değil.
    expect(atilan).toEqual(cok.slice(ALICI_UST_SINIRI));
  });

  it('boş girdi boş liste — patlamıyor', () => {
    expect(aliciAyristir('').adresler).toEqual([]);
    expect(aliciAyristir([]).adresler).toEqual([]);
    expect(aliciAyristir('   ,  ; \n ').adresler).toEqual([]);
  });

  it('dizi girdisi de aynı kurallardan geçiyor', () => {
    // Plan kaydından gelen liste zaten dizi; ayrı bir yol açmak iki kural demekti.
    expect(aliciAyristir([' a@x.com ', 'A@x.com', 'bozuk']).adresler).toEqual(['a@x.com']);
  });
});

describe('gecerliAdres', () => {
  it('kabul edilenler', () => {
    for (const a of ['a@b.co', 'rapor.alici+etiket@firma.com.tr', 'x_y@alt.alan.org']) {
      expect(gecerliAdres(a), a).toBe(true);
    }
  });

  it('reddedilenler', () => {
    for (const a of ['bozuk', 'a@b', '@b.com', 'a@.com', 'a b@c.com', 'a@b,c.com', '']) {
      expect(gecerliAdres(a), a).toBe(false);
    }
  });
});

describe('nihaiAlicilar', () => {
  it('seçilen varsa O kullanılıyor', () => {
    expect(
      nihaiAlicilar({ secilen: ['a@x.com'], musteriAdresleri: ['kayitli@x.com'] }),
    ).toEqual(['a@x.com']);
  });

  it('KRİTİK: seçilen varsa müşterininki EKLENMİYOR, yerine geçiyor', () => {
    /*
     * Birleştirmek cazip ("ikisi de gitsin") ama kullanıcının bir raporu
     * SADECE bir kişiye göndermesini imkânsız kılardı: müşterinin kayıtlı
     * listesi her seferinde araya girer ve bunu ancak alıcı görürdü.
     */
    const out = nihaiAlicilar({
      secilen: ['tek@x.com'],
      musteriAdresleri: ['a@x.com', 'b@x.com'],
    });
    expect(out).toEqual(['tek@x.com']);
  });

  it('seçilen boşsa müşterinin kayıtlı listesine düşüyor', () => {
    expect(nihaiAlicilar({ secilen: [], musteriAdresleri: ['a@x.com', 'b@x.com'] })).toEqual([
      'a@x.com',
      'b@x.com',
    ]);
  });

  it('KRİTİK: ikisi de boşsa BOŞ liste — uydurma adres yok', () => {
    // Boş liste çağıranın "alıcı yok" hatası vermesini sağlıyor; bir yere
    // varsayılan göndermek, raporu yanlış kişiye yollamak olurdu.
    expect(nihaiAlicilar({ secilen: [], musteriAdresleri: [] })).toEqual([]);
  });

  it('yedek listedeki bozuk adres eleniyor', () => {
    expect(nihaiAlicilar({ secilen: [], musteriAdresleri: ['bozuk', 'a@x.com'] })).toEqual([
      'a@x.com',
    ]);
  });
});

/**
 * ═══ KAYNAK TARAMASI: ÇÖZÜCÜ TEK, ÇAĞIRAN İKİ ═══
 *
 * Elle gönderim ve planlı gönderim aynı kuralı vermek zorunda. Kural iki
 * yerde yazılsaydı biri güncellenmediğinde planlı raporlar sessizce başka
 * adrese giderdi — ve bunu yalnızca alıcı görürdü.
 */
describe('kaynak taraması — alıcı çözümü tek yerden', () => {
  const KAYNAK = readFileSync(join(__dirname, 'rapor-gonder.service.ts'), 'utf8');

  function dilim(bas: string, son: string): string {
    const i = KAYNAK.indexOf(bas);
    expect(i, `"${bas}" bulunamadı — tarama boşa düştü`).toBeGreaterThan(-1);
    const j = KAYNAK.indexOf(son, i);
    expect(j, `"${son}" bulunamadı — tarama boşa düştü`).toBeGreaterThan(-1);
    return KAYNAK.slice(i, j);
  }

  it('ELLE gönderim nihaiAlicilar kullanıyor', () => {
    expect(dilim('async gonder(', 'async zamanlanmisGonder(')).toContain('nihaiAlicilar({');
  });

  it('KRİTİK: PLANLI gönderim de AYNI çözücüyü kullanıyor', () => {
    expect(dilim('async zamanlanmisGonder(', 'private async musteriEpostalari(')).toContain(
      'nihaiAlicilar({',
    );
  });

  it('KRİTİK: iki yol da KISMİ REDDİ taşıyor', () => {
    /*
     * nodemailer bazı alıcılar reddedilse bile fırlatmıyor. `catch` bu hâli
     * görmüyor; ret açıkça okunmazsa "gönderildi" yazan bir akış müşterinin
     * raporu almadığını gizler.
     */
    expect(dilim('async gonder(', 'async zamanlanmisGonder(')).toContain('sonuc.ret');
    expect(dilim('async zamanlanmisGonder(', 'private async musteriEpostalari(')).toContain(
      'sonuc.ret',
    );
  });

  it('denetim kaydına KABUL EDİLEN adresler yazılıyor', () => {
    // "Kime gönderdim" sorusunun aylar sonraki cevabı, sunucunun teslim için
    // kabul ettiği liste olmalı — istenen liste değil.
    expect(dilim('async gonder(', 'async zamanlanmisGonder(')).toContain('to: sonuc.kabul');
  });
});
