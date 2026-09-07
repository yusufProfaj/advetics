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
 *   3. Bağlantı kartı `compact` ile çağrılıyor — değilse eski uzun liste
 *      geri gelir ve ekran yine metrelerce uzar.
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
