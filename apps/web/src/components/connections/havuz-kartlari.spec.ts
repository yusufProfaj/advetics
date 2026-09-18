import { readFileSync } from 'node:fs';
import { CHANNEL_KINDS } from '@advetics/shared';
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
 *   3. Sayfa hesapları SATIR SATIR listelemiyor; atama havuz pop-up'ından
 *      yapılıyor. Liste geri gelirse ekran yine metrelerce uzar.
 */
const DIR = __dirname;
const KART = readFileSync(join(DIR, 'havuz-kartlari.tsx'), 'utf8');
/*
 * HAVUZ TÜRETMESİ ARTIK ORTAK YARDIMCIDA. Bileşenden çıkarıldı çünkü aynı
 * eşleme kurulum sihirbazında da lazım ve iki kopya doğdukları anda ayrışır.
 * Bu taramanın kaynağı da onunla birlikte taşındı — taşımayı zaten bu
 * dosyanın kendi boşa-düşme koruması yakaladı.
 */
const HAVUZ = readFileSync(join(DIR, '..', '..', 'lib', 'havuz.ts'), 'utf8');
const SAYFA = readFileSync(
  join(DIR, '..', '..', 'app', '(dashboard)', 'ayarlar', 'baglantilar', 'page.tsx'),
  'utf8',
);

const yorumsuz = (m: string): string =>
  m.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/.*$/gm, '');

describe('tarama boşa düşmüyor', () => {
  it('dosyalar okunuyor ve beklenen gövdeyi taşıyor', () => {
    expect(KART.length).toBeGreaterThan(2000);
    expect(HAVUZ.length).toBeGreaterThan(800);
    expect(yorumsuz(KART)).toContain('HavuzKartlari');
    expect(yorumsuz(HAVUZ)).toContain('havuzlariCikar');
    expect(yorumsuz(SAYFA)).toContain('HavuzKartlari');
  });
});

describe('kanal kapsamı', () => {
  it('KRİTİK: kanalların hepsi EKRANDA BASILAN listede', () => {
    /*
     * BU TEST BİR KEZ ELLE YAZILMIŞ LİSTEYİ KİLİTLİYORDU ve LinkedIn
     * eklenirken DÜŞTÜ — doğru sebeple: `KANALLAR` artık `CHANNEL_KINDS`tan
     * türüyor ve regex eski biçimi bulamadı. Test sessizce geçmek yerine
     * "tarama boşa düştü" diye patladı; bekçinin kendi bekçisi çalıştı.
     *
     * İDDİA ARTIK ÜRETİCİYE ÇAPALI. Eskiden beş kanal adı burada elle
     * sayılıydı ve altıncısı eklendiğinde bu test onu istemeden ENGELLERDİ:
     * kanal ekran listesinde olurdu ama test "beş kanal" diye bilirdi.
     * Şimdi tek kaynak var, yani liste ile ekran ayrışamıyor.
     */
    const kod = yorumsuz(HAVUZ);
    expect(kod, 'KANALLAR artık ortak listeden türemiyor').toContain(
      'export const KANALLAR: readonly ChannelKind[] = CHANNEL_KINDS;',
    );

    /*
     * Ortak listenin kendisi de en az bir reklam hesabı ve bir sosyal profil
     * kanalı taşımalı — `CHANNEL_KINDS` boşalırsa yukarıdaki iddia BOŞ KÜMEDE
     * doğru olurdu.
     */
    expect(CHANNEL_KINDS).toContain('meta_ads');
    expect(CHANNEL_KINDS).toContain('linkedin_ads');
    expect(CHANNEL_KINDS).toContain('youtube');
  });

  it('KRİTİK: her kanal için havuz DOLDURULUYOR — liste ile eşleme ayrışmasın', () => {
    // Kanal listede olup doldurulmazsa kart hep "0 hesap boşta" der ve
    // sebebi hiçbir yerde yazmaz.
    const kod = yorumsuz(HAVUZ);
    expect(kod).toContain("'youtube_channel'");
    expect(kod).toContain("'instagram_business'");
    expect(kod).toContain("'facebook_page'");
  });

  it('KRİTİK: yalnızca ATANMAMIŞ hesaplar havuzda', () => {
    // Atanmış hesabı havuzda göstermek, başka müşterinin hesabını ikinci kez
    // atamaya davet ederdi.
    expect(yorumsuz(HAVUZ)).toContain('clientId !== null) continue');
  });
});

describe('atama ucu', () => {
  /*
   * UÇ SEÇİMİ ARTIK `lib/havuz.ts` İÇİNDE — bileşende değil.
   *
   * Üç ayrı uç var (reklam hesabı, Meta sayfası, YouTube kanalı) ve seçim iki
   * ekranda birden gerekiyordu: havuz penceresi ve workspace varlıkları.
   * İkisinde ayrı yazılınca birinde YouTube dalı unutuluyor; kanal atanıyor,
   * hub aboneliği kurulmuyor ve panel "atandı" diyor — kart hiç gelmiyor.
   */
  it('KRİTİK: üç uç da TEK ÜRETİCİDE tanımlı', () => {
    const kod = yorumsuz(HAVUZ);
    expect(kod).toContain('/connections/ad-accounts/');
    expect(kod).toContain('/connections/social-profiles/');
    expect(kod).toContain('/autoboost/youtube/channels/');
  });

  it('KRİTİK: profil ucu `Record` ile seçiliyor — koşul zinciriyle değil', () => {
    /*
     * Koşul zinciri yeni bir profil türünde SESSİZCE yanlış uca gider;
     * `Record<SocialProfileTypeValue, ...>` derlemeyi kırar.
     */
    const kod = yorumsuz(HAVUZ);
    expect(kod).toContain('Record<SocialProfileTypeValue, (id: string) => string>');
    expect(kod).toContain('youtube_channel: (id)');
  });

  it('KRİTİK: bileşen ucu KENDİ KURMUYOR — öğeden okuyor', () => {
    // Bileşende yeniden kurulursa tek üretici kuralı sessizce çürür.
    const kod = yorumsuz(KART);
    expect(kod).toContain('oge.atamaYolu');
    expect(kod).not.toContain('/connections/ad-accounts/');
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

describe('bağlantı ekranı hesapları SATIR SATIR listelemiyor', () => {
  /*
   * KARAR AYNI, BEKÇİSİ DEĞİŞTİ. Önce `ConnectionCard`a `compact` bayrağı
   * geçiliyor mu diye bakıyordu; o kart ve bayrağı artık yok (kanal
   * kartlarına taşındı). Korunan şey bayrak değil SONUÇ: 284 hesabı olan bir
   * ajansta hesapların düz liste hâlinde basılması ekranı metrelerce
   * uzatıyordu ve "hangi hesap boşta" sorusu ancak kaydırarak
   * cevaplanabiliyordu.
   *
   * İDDİA VARLIĞA DEĞİL YOKLUĞA ÇAPALI VE BU RİSKLİ: "şu bileşen yok"
   * iddiası bileşen adı değişirse boşa düşer. O yüzden altta ikinci bir
   * iddia var: atama yolu GERÇEKTEN havuz pop-up'ından geçiyor.
   */
  it('KRİTİK: sayfa hesap listesi bileşeni çizmiyor', () => {
    const kod = yorumsuz(SAYFA);
    expect(kod).not.toContain('AccountPicker');
    expect(kod).not.toContain('SocialProfileList');
  });

  it('BOŞA DÜŞME BEKÇİSİ: atama yolu havuz kartlarından geçiyor', () => {
    // Yukarıdaki "yok" iddiası tek başına, sayfa TAMAMEN boşalsa da geçerdi.
    expect(yorumsuz(SAYFA)).toContain('<HavuzKartlari');
  });

  it('KRİTİK: kanal kartı hesapları sayıyor, listelemiyor', () => {
    /*
     * Sayılar kayboldu sanılmasın diye: kart "12 reklam hesabı · 8 atanmış,
     * 6 veri çekiyor" diyor. Üç sayı BİRİ DİĞERİNİN İÇİNDE ve kapsama
     * ilişkisi cümleden okunuyor; önceki ekran aynı hesapları üç ayrı yerde
     * üç ayrı kelimeyle ("keşfedildi", "boşta", "izlenen") sayıyordu.
     */
    const kanal = yorumsuz(readFileSync(join(DIR, 'kanal-kartlari.tsx'), 'utf8'));
    expect(kanal).toContain('atanmış,');
    expect(kanal).toContain('veri çekiyor');
    /*
     * İDDİA HESAP LİSTESİNE ÇAPALI, GENEL BİR DESENE DEĞİL. İlk yazdığımda
     * `.map((a) => (` yazmıştım ve bileşen PLATFORMLARI gezerken aynı desene
     * uyduğu için kod doğruyken kırmızı verdi: yasaklanan şey döngü değil,
     * HESAPLARI satır satır basmak.
     */
    expect(kanal).not.toContain('adAccounts.map(');
    expect(kanal).not.toContain('socialProfiles.map(');
  });
});
