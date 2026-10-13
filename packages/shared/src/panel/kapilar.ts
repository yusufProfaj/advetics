import type { Permission } from '../auth/roles';
import { MARKA_MERKEZI_IZNI, VARLIKLAR_IZNI } from './adresler';

/**
 * ═══ PANEL KAPILARI — HER EYLEMİN TEK KAPISI, API'NİN KAPISIYLA AYNI ═══
 *
 * Envanterde dört uyumsuzluk bulundu ve dördü de aynı sınıftan: panel bir
 * düğmeyi bir kurala göre gösteriyor, API başka bir kurala göre kabul
 * ediyordu.
 *
 *   · Workspace firma formu panelde `isOrgAdmin` ile açılıyordu, uç
 *     (`PATCH /clients/:id`) `client.write` istiyor → Reklam Yöneticisi
 *     yapabildiği işin düğmesini görmüyordu.
 *   · Logo yükleme `bulk.write`, aynı karttaki marka formu `client.write`.
 *     İkisi de API'nin doğru kapısı; yanlış olan kartın TEK bayrakla
 *     (`canWrite`) çizilmesiydi. Burada iki ayrı anahtar.
 *   · Bağlantılar bölümü `client.write`, Kurulum `client.read` ile
 *     görünüyordu → aynı kişi iki bölümde farklı şey görüyordu.
 *   · "Arşivle" herkese görünüyordu, uç `client.delete` + org yöneticisi
 *     istiyor → tıklayan 403 alıyordu.
 *
 * KURAL: düğme/kart bu tablodan `kapiAcikMi` ile açılır; tablodaki satır
 * API ucunun `@RequirePermissions` + `@RequireOrgAdmin` kapısının AYNASI.
 * `izinler` listesinin HEPSİ gerekir (API'nin çoklu izin semantiği).
 * Panelde `hasPermission(session, '...')` ile elle yazılmış bir kapı,
 * bu modülün dosyalarında KALMAYACAK (Ajan 4 kaynak taramasıyla bakıyor).
 */
export interface PanelKapisi {
  /** Gereken izinlerin HEPSİ. Boş dizi: izin aranmıyor (bayraklar yeter). */
  izinler: readonly Permission[];
  /** `@RequireOrgAdmin()` ya da servis içi `assertOrgAdmin`. */
  orgYoneticisi?: true;
  /** `users.platform_admin` — bir rol değil, bayrak (`roles.ts`). */
  platformSahibi?: true;
  /** Üst hesabın yöneticisi (`session.managerAccount.yonetebilir`). */
  ustHesapYoneticisi?: true;
  /** Ekranda düğmenin yanında yazacak kısa açıklama; neden kapalı olduğu. */
  neden: string;
}

/** Kapının okuduğu oturum alanları — `SessionResponse`ın alt kümesi. */
export interface KapiOturumu {
  permissions: readonly Permission[];
  isOrgAdmin: boolean;
  platformAdmin: boolean;
  managerAccount?: { yonetebilir: boolean } | null;
}

export const PANEL_KAPILARI = {
  // ── Ayarlar › Şirketler ve workspace'ler ─────────────────────────────────
  /** Şirket listesi, şirket ekle/düzenle/taşı. Servis `assertOrgAdmin`. */
  'sirket.yonet': { izinler: ['org.write'], orgYoneticisi: true, neden: 'Şirket işlemleri yöneticinin.' },
  /** Şirket silme — GERİ ALINAMAZ (metrik geçmişi gider); önce silme özeti. */
  'sirket.sil': { izinler: ['org.write'], orgYoneticisi: true, neden: 'Şirket silmek yöneticinin.' },
  /** `POST /clients`, `POST /clients/setup`. */
  'workspace.ekle': { izinler: ['client.write'], neden: 'Workspace açma yetkin yok.' },
  /** `POST /manager-account/workspaces/move`. */
  'workspace.tasi': { izinler: ['org.write'], orgYoneticisi: true, neden: 'Workspace taşımak yöneticinin.' },
  /** `DELETE /clients/:id` — arşiv, SİLME DEĞİL. */
  'workspace.arsivle': { izinler: ['client.delete'], orgYoneticisi: true, neden: 'Arşivlemek yöneticinin.' },
  /** Yeni uç (Ajan 2): arşivden geri al. Arşivlemeyle AYNI kapı. */
  'workspace.geriAl': { izinler: ['client.delete'], orgYoneticisi: true, neden: 'Arşivden almak yöneticinin.' },
  /** Üst hesaplar kartı: yalnız platform sahibi (kullanıcı kararı, 2026-10-13). */
  'ustHesap.yonet': { izinler: [], platformSahibi: true, neden: 'Üst hesapları yalnız Advetics yönetir.' },

  // ── Ayarlar › Platform bağlantıları ─────────────────────────────────────
  /** `POST /connections/authorize`, `:id/reauthorize`. */
  'baglanti.yetkilendir': { izinler: ['connection.write', 'connection.manage'], neden: 'Platform bağlamak yöneticinin.' },
  /** `POST /connections/:id/disconnect`. */
  'baglanti.kaldir': { izinler: ['connection.write', 'connection.manage'], orgYoneticisi: true, neden: 'Bağlantıyı kaldırmak yöneticinin.' },
  /** `POST /connections/:id/refresh-accounts`. */
  'baglanti.hesaplariTara': { izinler: ['connection.write'], neden: 'Hesapları tarama yetkin yok.' },
  /**
   * Havuzdan workspace'e ATAMA: `PATCH ad-accounts/:id/client`,
   * `social-profiles/:id/client`. YouTube kanalı ataması
   * (`PATCH /autoboost/youtube/channels/:id/client`) bugün yalnız
   * `connection.write` istiyor — Ajan 2 API'yi bu satıra hizalayacak.
   */
  'hesap.ata': { izinler: ['connection.write', 'connection.manage'], neden: 'Hesap atamak yöneticinin.' },
  /** `PATCH ad-accounts/:id/sync` — izlemeyi aç/kapat. */
  'hesap.izleme': { izinler: ['connection.write'], neden: 'İzlemeyi değiştirme yetkin yok.' },
  /** `POST /autoboost/youtube/channels`. */
  'youtube.ekle': { izinler: ['connection.write'], neden: 'Kanal ekleme yetkin yok.' },
  /** `POST /sync/bulk-refresh` (+ `/kurtar`). */
  'veri.topluGuncelle': { izinler: ['sync.trigger'], orgYoneticisi: true, neden: 'Toplu güncelleme yöneticinin.' },

  // ── Ayarlar › Ekip ve güvenlik ──────────────────────────────────────────
  /** `POST/PATCH /members`, `/memberships`. */
  'ekip.yonet': { izinler: ['user.write'], orgYoneticisi: true, neden: 'Kişi eklemek ve yetki vermek yöneticinin.' },
  /** `PATCH /auth/2fa/sirket` — `@RequireOrgAdmin()` yalnız. */
  'ikiAdim.sirketZorunlulugu': { izinler: [], orgYoneticisi: true, neden: 'Şirketin güvenlik kuralını yönetici belirler.' },
  /** Üst hesap ekibi (servis `yonetebilir` kontrolü). */
  'ustHesapEkibi.yonet': { izinler: [], ustHesapYoneticisi: true, neden: 'Üst hesap ekibini üst hesabın yöneticisi yönetir.' },

  // ── Ayarlar › Hesabım ───────────────────────────────────────────────────
  /** Rapor gönderen e-posta + imza. Herkes YALNIZ kendisininkini görür (RLS). */
  'eposta.duzenle': { izinler: ['report.share'], neden: 'Rapor gönderme yetkin yok.' },
  /** Okuma API anahtarları — sayfa ve API aynı bayrağı okuyor. */
  'okumaApi.yonet': { izinler: [], platformSahibi: true, neden: 'Yalnız platform sahibi.' },

  // ── Marka Merkezi (sayfa kapısı MARKA_MERKEZI_IZNI) ─────────────────────
  'markaMerkezi.gor': { izinler: [MARKA_MERKEZI_IZNI], neden: 'Marka Merkezi yetkin yok.' },
  /** `POST /clients/:id/kurulum/adim|tamamla`, `POST .../hazirlama(/cevap)`, `POST /olcum/birincil-yap`. */
  'kurulum.yaz': { izinler: ['client.write'], neden: 'Kurulumu değiştirme yetkin yok.' },
  /**
   * Kurulum'da HESAP SEÇMEK ya da YENİ HESAP AÇMAK (`meta_hesap`,
   * `google_hesap`, `sayfa`). Panel havuz atamasıyla AYNI kapıyı istiyor;
   * kurulum ucu bugün yalnız `client.write` sınıyor — Ajan 3 API'ye
   * `connection.manage`i ekleyecek. Yeni hesap açmak GERÇEK hesap açar.
   */
  'kurulum.hesap': { izinler: ['client.write', 'connection.write', 'connection.manage'], neden: 'Hesap atamak yöneticinin.' },
  /**
   * `PUT /clients/:id/kurulum/beyan` — "adresimiz yok", "web sitemiz yok"…
   * (YENİ, kurulum sihirbazı; uç Ajan 2'de). Beyan bir KAPSAM kararı, kurulum
   * yazmasıyla aynı kapı.
   */
  'kurulum.beyan': { izinler: ['client.write'], neden: 'Kurulum kapsamını değiştirme yetkin yok.' },
  /** `PUT /kurulum/sirket/beyan` — iki adımlı doğrulama kararı (YENİ, Ajan 2). */
  'sirketKurulum.beyan': { izinler: [], orgYoneticisi: true, neden: 'Şirketin güvenlik kararını yönetici verir.' },
  /** `POST /veri-kaynaklari` (bağla/kaldır). */
  'veriKaynagi.yonet': { izinler: ['connection.manage'], neden: 'Veri kaynağı bağlamak yöneticinin.' },
  /** `POST /veri-kaynaklari/:id/yenile|duraklat`, `GET .../secenekler`. */
  'veriKaynagi.yaz': { izinler: ['connection.write'], neden: 'Veri kaynağını değiştirme yetkin yok.' },
  /** `POST /client-profile`, `POST .../ai-taslak` — marka bilgileri ve iki metin. */
  'marka.yaz': { izinler: ['client.write'], neden: 'Marka bilgilerini değiştirme yetkin yok.' },
  /** Logo bir VARLIK: `POST/PUT/DELETE /assets`. Marka formundan AYRI kapı. */
  'logo.yaz': { izinler: ['bulk.write'], neden: 'Logo yükleme yetkin yok.' },
  /** `PATCH /clients/:id` — firma, iletişim, rapor alıcıları, adres + konum. */
  'firma.yaz': { izinler: ['client.write'], neden: 'Workspace bilgilerini değiştirme yetkin yok.' },
  /** `GET /members?clientId=` — salt okunur liste; değiştirme Ayarlar › Ekip'te. */
  'erisim.gor': { izinler: ['user.read'], neden: 'Ekibi görme yetkin yok.' },
  /** `GET /bildirim/kanallar` (`rule.read`); müşteri hesabı sinyal görmüyor. */
  'bildirim.gor': { izinler: ['rule.read'], neden: 'Bildirim kanallarını görme yetkin yok.' },
  /** `POST/PATCH/DELETE /bildirim/kanallar…` */
  'bildirim.yaz': { izinler: ['rule.read', 'client.write'], neden: 'Bildirim kanalı ekleme yetkin yok.' },
  /**
   * Veri durumu (eski Senkronizasyon): uç `insights.read`, kart
   * `connection.read` ile — ekran platformun HAM hata mesajını basıyor
   * (subcode, fbtrace) ve o müşteri tarafına ait bilgi değil.
   */
  'veriDurumu.gor': { izinler: ['insights.read', 'connection.read'], neden: 'Veri durumunu görme yetkin yok.' },

  // ── Varlıklar ───────────────────────────────────────────────────────────
  'varliklar.gor': { izinler: [VARLIKLAR_IZNI], neden: 'Varlıkları görme yetkin yok.' },
  /** `POST/PUT/DELETE /assets`. */
  'varlik.yaz': { izinler: ['bulk.write'], neden: 'Varlık yükleme yetkin yok.' },
  /** `POST/PUT/DELETE /audience-templates`. Varsayılan kitle burada DEĞİŞMİYOR (evi Kurulum). */
  'kitle.yaz': { izinler: ['client.write'], neden: 'Kitle kaydetme yetkin yok.' },
} as const satisfies Record<string, PanelKapisi>;

export type PanelKapiAnahtari = keyof typeof PANEL_KAPILARI;

/**
 * Kapı açık mı. Bayraklar VE izinler birlikte: platform sahibi bütün
 * izinleri taşısa bile `platformSahibi` istemeyen bir kapıyı bayrakla
 * açmıyoruz, izinle açıyoruz — bayrak yetkiyi GENİŞLETMİYOR, daraltıyor.
 */
export function kapiAcikMi(oturum: KapiOturumu, anahtar: PanelKapiAnahtari): boolean {
  const k: PanelKapisi = PANEL_KAPILARI[anahtar];
  if (k.platformSahibi && !oturum.platformAdmin) return false;
  if (k.orgYoneticisi && !oturum.isOrgAdmin) return false;
  if (k.ustHesapYoneticisi && !oturum.managerAccount?.yonetebilir) return false;
  return k.izinler.every((i) => oturum.permissions.includes(i));
}
