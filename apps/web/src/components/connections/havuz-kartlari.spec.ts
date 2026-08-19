import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * HAVUZ EKRANININ KARARLARI — kaynak taramasıyla.
 *
 * Bu bileşenler tarayıcı olayları (modal, arama, atama) etrafında kurulu ve
 * bu depoda DOM test altyapısı yok. Sınanabilecek şey, ekranın bir daha
 * eskiye dönmemesini sağlayan KARARLAR:
 *
 *   1. Beş kanalın hepsinde havuz var — biri unutulursa o kanalın hesapları
 *      hiçbir yerden atanamaz hâle gelir.
 *   2. Atama havuz ÖĞESİNİN tipine göre doğru uca gidiyor; reklam hesabını
 *      sosyal profil ucuna göndermek 404 verir.
 *   3. Bağlantı kartı `compact` ile çağrılıyor — değilse eski uzun liste
 *      geri gelir ve ekran yine metrelerce uzar.
 */
const DIR = __dirname;
const KART = readFileSync(join(DIR, 'havuz-kartlari.tsx'), 'utf8');
const SAYFA = readFileSync(
  join(DIR, '..', '..', 'app', '(dashboard)', 'ayarlar', 'baglantilar', 'page.tsx'),
  'utf8',
);

const yorumsuz = (m: string): string =>
  m.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/.*$/gm, '');

describe('tarama boşa düşmüyor', () => {
  it('dosyalar okunuyor ve beklenen gövdeyi taşıyor', () => {
    expect(KART.length).toBeGreaterThan(2000);
    expect(yorumsuz(KART)).toContain('HavuzKartlari');
    expect(yorumsuz(SAYFA)).toContain('HavuzKartlari');
  });
});

describe('kanal kapsamı', () => {
  it('KRİTİK: BEŞ kanalın hepsi EKRANDA BASILAN listede', () => {
    /*
     * ÇAPA `KANALLAR` DİZİSİ, dosyanın tamamı DEĞİL. İlk sürüm dizgeyi
     * dosyanın herhangi bir yerinde arıyordu ve mutasyon testi BOŞ çıktı:
     * `youtube`'u ekran listesinden sildim, kanal yine `map` nesnesinin
     * başlatıcısında geçtiği için test GEÇTİ. Ekranda basılan şey bu dizi.
     */
    const m = /const KANALLAR: ChannelKind\[\] = \[([^\]]*)\]/.exec(yorumsuz(KART));
    if (!m) throw new Error('KANALLAR dizisi bulunamadı — tarama boşa düştü.');

    for (const k of ['meta_ads', 'google_ads', 'facebook', 'instagram', 'youtube']) {
      expect(m[1], `${k} ekran listesinde yok`).toContain(k);
    }
  });

  it('KRİTİK: her kanal için havuz DOLDURULUYOR — liste ile eşleme ayrışmasın', () => {
    // Kanal listede olup doldurulmazsa kart hep "0 hesap boşta" der ve
    // sebebi hiçbir yerde yazmaz.
    const kod = yorumsuz(KART);
    expect(kod).toContain("'youtube_channel'");
    expect(kod).toContain("'instagram_business'");
    expect(kod).toContain("'facebook_page'");
  });

  it('KRİTİK: yalnızca ATANMAMIŞ hesaplar havuzda', () => {
    // Atanmış hesabı havuzda göstermek, başka müşterinin hesabını ikinci kez
    // atamaya davet ederdi.
    expect(yorumsuz(KART)).toContain('clientId !== null) continue');
  });
});

describe('atama ucu', () => {
  it('KRİTİK: reklam hesabı ve sosyal profil AYRI uçlara gidiyor', () => {
    const kod = yorumsuz(KART);
    expect(kod).toContain('/connections/ad-accounts/');
    expect(kod).toContain('/connections/social-profiles/');
    // Seçim öğenin tipine bağlı olmalı, sabit değil.
    expect(kod).toContain('reklamHesabi');
  });
});

describe('pop-up sözleşmesi', () => {
  it('modal erişilebilir ve ESC ile kapanıyor', () => {
    const kod = yorumsuz(KART);
    expect(kod).toContain("role=\"dialog\"");
    expect(kod).toContain('aria-modal');
    expect(kod).toContain("'Escape'");
  });

  it('KRİTİK: arama kutusu var — 284 hesapta kaydırmak yanlış atamanın yolu', () => {
    const kod = yorumsuz(KART);
    expect(kod).toContain('type="search"');
    expect(kod).toContain('suzulmus');
  });

  it('kaç sonuç gösterildiği YAZILI — sessiz kesme yok', () => {
    expect(yorumsuz(KART)).toContain('{suzulmus.length} / {ogeler.length}');
  });
});

describe('bağlantı kartı', () => {
  it('KRİTİK: `compact` ile çağrılıyor — eski uzun liste geri gelmesin', () => {
    expect(yorumsuz(SAYFA)).toContain('compact');
  });
});
