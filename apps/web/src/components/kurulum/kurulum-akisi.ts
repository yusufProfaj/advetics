import type { ConnectionSummary, Platform, ProviderAvailability } from '@advetics/shared';

/**
 * ═══ KURULUM AKIŞI — sihirbazın KARARLARI, çiziminden ayrı ═══
 *
 * Panelde bileşen render eden bir test altyapısı yok (`vitest.config.ts`
 * bunu bilinçli reddediyor). Sihirbazın doğru çalışması birkaç karara
 * bağlı: hangi adımlar hangi sırayla, geri dönülebilir mi, boost hesabı
 * kendiliğinden mi seçiliyor yoksa soruluyor mu. Bunlar bileşenin içinde
 * kalsaydı yalnızca kaynak taramasıyla sınanabilirdi ve o tarama yanlış
 * şeyi kilitleyebiliyor. Burada saf fonksiyon olarak duruyorlar ve
 * ÇALIŞTIRILARAK sınanıyorlar.
 *
 * ═══ ÜÇ SİHİRBAZ, TEK AKIŞ ═══
 *
 * Üst hesap, şirket ve workspace kurulumu aynı merdivenin üç basamağı:
 * üst hesap kuran şirketi de, şirket kuran workspace'i de kuruyor. Üç ayrı
 * bileşen yazmak, aynı "platform bağla → hesap seç → boost hesabı" dizisini
 * üç kez yazmak ve birinin bir gün eksik kalması demekti. Tür yalnızca
 * merdivenin HANGİ BASAMAKTAN başladığını seçiyor.
 */

export const KURULUM_TURLERI = ['ust-hesap', 'sirket', 'workspace'] as const;
export type KurulumTuru = (typeof KURULUM_TURLERI)[number];

export type AdimKodu = 'ust-hesap' | 'sirket' | 'baglantilar' | 'workspace' | 'hesaplar' | 'bitti';

/**
 * ADIM SIRASI SABİT VE GEREKÇELİ.
 *
 * PLATFORMLAR WORKSPACE BİLGİSİNDEN ÖNCE. Platform bağlamak tarayıcıyı
 * Meta'ya/Google'a gönderip geri getiriyor ve o dönüşte ekrandaki form
 * kayboluyor. Sıra tersi olsaydı kullanıcı workspace adını, sitesini ve
 * rapor adreslerini yazıp bağlan'a basacak, döndüğünde hepsini yeniden
 * yazacaktı. Platform adımına gelindiğinde ondan önceki her şey SUNUCUDA
 * duruyor (üst hesap, şirket), ondan sonraki hiçbir şey henüz yazılmamış.
 *
 * BAĞLANTI ŞİRKETE AİT. Yeni bir şirkette Meta ve Google yeniden bağlanmak
 * zorunda: bağlantı tablosu `org_id` ile süzülüyor ve kardeş şirketin
 * bağlantısı görünmüyor. Bu kural uzun süre yalnızca sistemi kuran kişinin
 * kafasındaydı; bu yüzden workspace sihirbazında bile platform adımı var,
 * bağlıysa tek tıkla geçiliyor.
 */
export const ADIMLAR: Record<KurulumTuru, readonly AdimKodu[]> = {
  'ust-hesap': ['ust-hesap', 'sirket', 'baglantilar', 'workspace', 'hesaplar', 'bitti'],
  sirket: ['sirket', 'baglantilar', 'workspace', 'hesaplar', 'bitti'],
  workspace: ['baglantilar', 'workspace', 'hesaplar', 'bitti'],
};

/** Adımların rayda görünen kısa adları. */
export const ADIM_ADLARI: Record<AdimKodu, string> = {
  'ust-hesap': 'Üst hesap',
  sirket: 'Şirket',
  baglantilar: 'Platformlar',
  workspace: 'Workspace',
  hesaplar: 'Hesaplar',
  bitti: 'Bilgi bankası',
};

export function turOku(deger: string | undefined | null): KurulumTuru | null {
  return (KURULUM_TURLERI as readonly string[]).includes(deger ?? '')
    ? (deger as KurulumTuru)
    : null;
}

/**
 * URL'DEKİ ADIM — tanınmıyorsa türün İLK adımı.
 *
 * `bitti` URL'DEN AÇILAMIYOR: o adım bu oturumda kurulan workspace'in
 * sonucunu gösteriyor ve sonuç yalnızca bellekte. Adres çubuğundan oraya
 * gelmek, boş bir "kuruldu" ekranı demekti.
 */
export function adimOku(tur: KurulumTuru, deger: string | undefined | null): AdimKodu {
  const liste = ADIMLAR[tur];
  const aday = liste.find((a) => a === deger);
  if (!aday || aday === 'bitti') return liste[0]!;
  return aday;
}

/**
 * SİHİRBAZ ADRESİ — TEK ÜRETİCİ.
 *
 * Adres üç yerde kuruluyor: adımlar arası geçiş, platform bağlantısının
 * dönüş yolu (`redirectTo`) ve üst hesap/şirket kurulduktan sonraki tam
 * sayfa geçişi. CLAUDE.md: "Bağlantıyı elle birleştirme — süzgeç düşüyor."
 * Birinde `tur` unutulsa kullanıcı bağlandıktan sonra seçim ekranına
 * düşerdi ve kurduğu şirketin yarım kaldığını sanırdı.
 */
export function kurulumAdresi(tur: KurulumTuru, adim: AdimKodu): string {
  return `/kurulum?tur=${tur}&adim=${adim}`;
}

/**
 * SUNUCUYA YAZILMIŞ ADIMA GERİ DÖNÜLMÜYOR.
 *
 * Üst hesap ve şirket, platform adımına geçerken KURULUYOR. Oraya geri
 * dönüp "Devam"a basmak İKİNCİ bir üst hesap ya da şirket açardı; kullanıcı
 * bunu yalnızca listede aynı adı iki kez görünce fark ederdi. Platform
 * adımı ve sonrası yalnızca bellekte, aralarında serbestçe gidilip geliniyor.
 */
export function geriGidilebilir(tur: KurulumTuru, hedef: AdimKodu): boolean {
  return hedef !== 'ust-hesap' && hedef !== 'sirket' ? true : tur === 'workspace';
}

// ---------------------------------------------------------------------------
// Platform durumu
// ---------------------------------------------------------------------------

export type PlatformDurumu =
  | { durum: 'ayarsiz' }
  | { durum: 'yok' }
  | { durum: 'yeniden'; baglanti: ConnectionSummary }
  | { durum: 'bagli'; baglanti: ConnectionSummary; bostaHesap: number; bostaSayfa: number };

/**
 * Bir platformun bu şirketteki hâli — DÖRT DURUM AYRI.
 *
 * "Bağlı değil", "sunucu ayarı eksik", "yetkisi düşmüş" ve "bağlı" dördü
 * farklı iş: birincisi bir düğme, ikincisi Advetics ekibine haber, üçüncüsü
 * yeniden yetkilendirme, dördüncüsü devam. Hepsini "bağlı değil" diye
 * göstermek, kullanıcıyı çalışmayan bir düğmeye tekrar tekrar bastırırdı.
 *
 * `revoked` bağlantı YOK sayılıyor: kaldırılmış bir bağlantının hesapları
 * atansa bile veri çekmez.
 */
export function platformDurumu(
  platform: Platform,
  uygunluk: readonly ProviderAvailability[],
  baglantilar: readonly ConnectionSummary[],
): PlatformDurumu {
  const ayar = uygunluk.find((u) => u.platform === platform);
  if (!ayar?.configured) return { durum: 'ayarsiz' };

  const buPlatform = baglantilar.filter((b) => b.platform === platform && b.status !== 'revoked');
  const saglam = buPlatform.find((b) => b.status === 'active');
  if (saglam) {
    return {
      durum: 'bagli',
      baglanti: saglam,
      bostaHesap: saglam.adAccounts.filter((a) => a.clientId === null && !a.isManager).length,
      bostaSayfa: saglam.socialProfiles.filter((p) => p.clientId === null).length,
    };
  }
  const bozuk = buPlatform[0];
  if (bozuk) return { durum: 'yeniden', baglanti: bozuk };
  return { durum: 'yok' };
}

// ---------------------------------------------------------------------------
// Boost hesabı
// ---------------------------------------------------------------------------

export type BoostKarari =
  /** Boost'a uygun sayfa seçilmedi — soru yok. */
  | { durum: 'gereksiz'; hesapId: null }
  /** Sayfa seçildi ama Meta reklam hesabı yok — boost çalışmayacak. */
  | { durum: 'hesap-yok'; hesapId: null }
  /** Tek Meta hesabı var, o kullanılıyor. */
  | { durum: 'otomatik'; hesapId: string }
  /** Birden çok hesap, kullanıcı seçti. */
  | { durum: 'secildi'; hesapId: string }
  /** Birden çok hesap, henüz seçilmedi — kurulum bekliyor. */
  | { durum: 'secilmeli'; hesapId: null };

/**
 * BOOST HESABI SORULMALI MI?
 *
 * Akıllı Boost'un ön koşulu her sayfanın bir Meta reklam hesabına bağlı
 * olması ve kurulum bunu hiç yapmıyordu: sayfa atanıyor, her gönderi "bağlı
 * reklam hesabı yok" diyordu. Çoğu workspace'te TEK Meta hesabı var ve
 * soru sormak gereksiz bir adım; birden çok olduğunda ise TAHMİN ETMEK
 * yanlış hesabın bütçesinden harcamak demek. O yüzden: tek hesap =
 * sessizce seç ve SÖYLE, birden çok = sor ve seçilmeden kurma.
 *
 * Seçim listede yoksa (kullanıcı hesabı sonradan kaldırdı) seçim YOK
 * sayılıyor: kaldırılmış bir hesabı sunucuya göndermek "hesap bu
 * workspace'e atanmamış" hatasıyla sayfaları boost'suz bırakırdı.
 */
export function boostKarari(
  metaHesapIdleri: readonly string[],
  boostSayfaSayisi: number,
  secim: string | null,
): BoostKarari {
  if (boostSayfaSayisi === 0) return { durum: 'gereksiz', hesapId: null };
  if (metaHesapIdleri.length === 0) return { durum: 'hesap-yok', hesapId: null };
  if (metaHesapIdleri.length === 1) return { durum: 'otomatik', hesapId: metaHesapIdleri[0]! };
  if (secim !== null && metaHesapIdleri.includes(secim)) return { durum: 'secildi', hesapId: secim };
  return { durum: 'secilmeli', hesapId: null };
}

// ---------------------------------------------------------------------------
// Web sitesi
// ---------------------------------------------------------------------------

/**
 * SİTE ADRESİ GİRİŞTE DÜZELTİLİYOR.
 *
 * Kullanıcı "miayapi.com" yazıyor; bilgi bankasını dolduran okuyucu
 * yalnızca `https` kabul ediyor ve şemasız adres "geçersiz adres" ile
 * reddediliyordu. Sebep ekranda yazsa bile kullanıcı bir adres yazdığını
 * biliyor ve sistemi bozuk sanıyor. `http://` bilerek `https://`e
 * çevriliyor: okuyucu düz http'yi zaten reddediyor ve bugün neredeyse her
 * site https açıyor.
 */
export function siteAdresiDuzelt(deger: string): string {
  const t = deger.trim();
  if (t === '') return '';
  if (/^https:\/\//i.test(t)) return t;
  if (/^http:\/\//i.test(t)) return `https://${t.slice(7)}`;
  return `https://${t}`;
}
