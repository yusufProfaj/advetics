import type { ConnectionSummary, Platform, ProviderAvailability } from '@advetics/shared';
import { acilisAdresi } from '@/lib/panel-adresleri';

/**
 * ═══ KURULUM AKIŞI — sihirbazın KARARLARI, çiziminden ayrı ═══
 *
 * Panelde bileşen render eden bir test altyapısı yok (`vitest.config.ts`
 * bunu bilinçli reddediyor). Sihirbazın doğru çalışması birkaç karara
 * bağlı: hangi adımlar hangi sırayla, geri dönülebilir mi, platformun
 * hangi hâlde olduğu. Bunlar bileşenin içinde
 * kalsaydı yalnızca kaynak taramasıyla sınanabilirdi ve o tarama yanlış
 * şeyi kilitleyebiliyor. Burada saf fonksiyon olarak duruyorlar ve
 * ÇALIŞTIRILARAK sınanıyorlar.
 *
 * ═══ ÜÇ SİHİRBAZ, TEK AKIŞ ═══
 *
 * Üst hesap, şirket ve workspace kurulumu aynı merdivenin üç basamağı:
 * üst hesap kuran şirketi de, şirket kuran workspace'i de kuruyor. Üç ayrı
 * bileşen yazmak, aynı "platform bağla → workspace aç" dizisini üç kez
 * yazmak ve birinin bir gün eksik kalması demekti. Tür yalnızca merdivenin
 * HANGİ BASAMAKTAN başladığını seçiyor.
 *
 * AÇILIŞ ARTIK YALNIZ AÇAR (kurulum sihirbazı, MIMARI Ç-7, 2026-10-13):
 * hesap seçimi ve boost hesabı açılıştan çıktı. Workspace açılınca ona
 * geçilir ve AYNI sayfa tamamlama moduna döner (`sihirbazAdresi`); hesaplar
 * kurulumun `meta_hesap`/`google_hesap`/`sayfa` adımlarından TEK yoldan
 * atanır. İki atama yolu ayrışırdı: açılışın boost kararı ile kurulumun
 * sayfa adımı aynı soruyu iki ayrı kuralla cevaplıyordu.
 */

export const KURULUM_TURLERI = ['ust-hesap', 'sirket', 'workspace'] as const;
export type KurulumTuru = (typeof KURULUM_TURLERI)[number];

/**
 * Bir kurulum türünün başlığı ve (varsa) açılamama sebebi. Seçim ekranı
 * kalktı ama tür başlığı ve engel cümlesi formun kendisinde gösteriliyor.
 */
export interface SecimKarti {
  tur: KurulumTuru;
  baslik: string;
  aciklama: string;
  /** Doluysa tür açılamıyor ve SEBEP ekranda yazıyor. */
  engel: string | null;
}

export type AdimKodu = 'ust-hesap' | 'sirket' | 'baglantilar' | 'workspace';

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
 * AJANSIN BAĞLANTISI YENİ ŞİRKETTE DE GÖRÜNÜR — YENİDEN BAĞLANILMAZ
 * (kurulum sihirbazı Ç-2, kaynak okundu 2026-10-13). Burada uzun süre
 * "yeni şirkette Meta ve Google yeniden bağlanmak zorunda, bağlantı tablosu
 * `org_id` ile süzülüyor" yazıyordu; ESKİDİ. PARAMETRESİZ `/connections`
 * RLS'te `havuz_kapsaminda` ile süzülüyor (kendi şirketi + AJANS şirketi),
 * yani ajansın bağlantısı müşteri şirketinde görünüyor; aynı kimliği o
 * şirkette yeniden yetkilendirmek önceki token'ı geçersiz kılıp bütün
 * şirketlerin bağlantısını koparıyordu ve artık sunucuda reddediliyor.
 * Platform adımı yine duruyor: bağlantı HİÇ yoksa (bağımsız şirket) ya da
 * yetkisi düştüyse ne yapılacağını söylüyor (`PlatformAdimi`).
 */
export const ADIMLAR: Record<KurulumTuru, readonly AdimKodu[]> = {
  'ust-hesap': ['ust-hesap', 'sirket', 'baglantilar', 'workspace'],
  sirket: ['sirket', 'baglantilar', 'workspace'],
  workspace: ['baglantilar', 'workspace'],
};

/** Adımların rayda görünen kısa adları. */
export const ADIM_ADLARI: Record<AdimKodu, string> = {
  'ust-hesap': 'Üst hesap',
  sirket: 'Şirket',
  baglantilar: 'Platformlar',
  workspace: 'Workspace',
};

export function turOku(deger: string | undefined | null): KurulumTuru | null {
  return (KURULUM_TURLERI as readonly string[]).includes(deger ?? '')
    ? (deger as KurulumTuru)
    : null;
}

/**
 * URL'DEKİ ADIM — tanınmıyorsa türün İLK adımı. Eski `hesaplar`/`bitti`
 * yer imleri de ilk adıma düşer (açılış artık yalnız açıyor).
 */
export function adimOku(tur: KurulumTuru, deger: string | undefined | null): AdimKodu {
  const liste = ADIMLAR[tur];
  return liste.find((a) => a === deger) ?? liste[0]!;
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
  return acilisAdresi(tur, adim);
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
