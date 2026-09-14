import type { Permission } from '@advetics/shared';

/**
 * Bilgi Bankası sekmelerinin YETKİ TANIMI.
 *
 * ═══ NEDEN AYRI VE 'use client' TAŞIMAYAN BİR DOSYA ═══
 *
 * Sayfa (sunucu bileşeni) oturumdan yetkileri okuyup HANGİ sekmelerin
 * görüneceğine karar veriyor; sekme çubuğu (istemci bileşeni) aynı listeyi
 * çiziyor. İkisi listeyi ayrı ayrı yazsaydı — ki önce öyleydi: sayfa tek bir
 * `client.write` hesaplayıp geçiyordu — sekme eklendiğinde biri
 * güncellenmeyecek ve kullanıcı ya tıklayınca 403 alacağı bir sekme görecek
 * ya da hakkı olan bir sekmeyi göremeyecekti. Liste TEK.
 *
 * ═══ HER SEKME KENDİ UCUNUN YETKİSİNİ İSTİYOR ═══
 *
 * Sekmeler AYNI uca gitmiyor ve bu ölçüldü:
 *
 *   Bilgi Bankası / Hedef Kitle / Marka → `/client-profile` : client.*
 *   Bütçe                               → `/budgets`        : budget.*
 *   Logo                                → `/assets`         : bulk.*
 *
 * `customer_service` ve `client_viewer` rollerinde `bulk.read` YOK: sayfa tek
 * bir yetkiyle açıldığı sürece Logo sekmesi onlarda doğrudan kırmızı
 * "Yüklenemedi" kutusuyla açılıyordu — hata mesajı arka uçtan geliyor, yani
 * arıza gibi görünüyor ama aslında bir YETKİ kararı. `roles.ts`: "Backend
 * guard'ları ve frontend UI gizleme mantığı aynı matristen beslenir —
 * ikisinin ayrışması, kullanıcıya tıklayabildiği ama 403 alacağı butonlar
 * göstermek demektir."
 *
 * Yazma yetkisi de sekme başına: `resolvePermissions` override'ı tek başına
 * `budget.write`ı kapatabiliyor ve sayfa `client.write` ile açıksa kullanıcı
 * tıklandığında 403 alacak bir "Kaydet" düğmesi görüyordu.
 */
export interface SekmeTanimi {
  kod: 'bilgi-bankasi' | 'butce' | 'hedef-kitle' | 'marka' | 'logo';
  ad: string;
  /** Sekmenin GÖRÜNMESİ için gereken yetki. */
  oku: Permission;
  /** Sekmenin DÜZENLENEBİLİR olması için gereken yetki. */
  yaz: Permission;
}

export const SEKMELER = [
  /*
   * BİRİNCİ SEKME BİLGİ BANKASI — ve `clients.notes` DEĞİL.
   *
   * Burada "Genel" adıyla `clients.notes` gösteriliyordu. O alan kendi
   * açıklamasında ajans içi ilan edilmişti ("ekip içi, panelin başka hiçbir
   * yerinde görünmüyor") ama üç halka birleşince MÜŞTERİNİN KENDİ hesabına
   * açılıyordu: menü satırında `perm` yoktu, sayfa okuma yetkisi hiç
   * kontrol etmiyordu ve `GET /clients/:id` `client.read` istiyor —
   * `client_viewer` da o yetkiyi taşıyor. Ajans içi not, müşteriye açık bir
   * sekmeden okunamaz; alan artık HİÇ kullanılmıyor ve yerini
   * `ClientProfile.bilgiBankasi` aldı: müşterinin KENDİ genel bilgisi.
   */
  { kod: 'bilgi-bankasi', ad: 'Bilgi Bankası', oku: 'client.read', yaz: 'client.write' },
  { kod: 'butce', ad: 'Bütçe', oku: 'budget.read', yaz: 'budget.write' },
  { kod: 'hedef-kitle', ad: 'Hedef Kitle', oku: 'client.read', yaz: 'client.write' },
  { kod: 'marka', ad: 'Marka Bilgileri', oku: 'client.read', yaz: 'client.write' },
  { kod: 'logo', ad: 'Logo', oku: 'bulk.read', yaz: 'bulk.write' },
] as const satisfies readonly SekmeTanimi[];

export type SekmeKodu = (typeof SEKMELER)[number]['kod'];

/**
 * Sekmelerin İLGİLENDİĞİ yetkiler — sayfanın istemciye geçireceği liste.
 *
 * Oturumun BÜTÜN yetki listesini istemciye geçirmek gereksizce geniş; ama
 * elle yazılmış bir alt küme de sekme eklendiğinde eksik kalırdı. Liste
 * `SEKMELER`den TÜRETİLİYOR.
 */
export const SEKME_IZINLERI: readonly Permission[] = [
  ...new Set(SEKMELER.flatMap((s) => [s.oku, s.yaz] as Permission[])),
];

/**
 * Kullanıcının GÖREBİLECEĞİ sekmeler.
 *
 * Boş dönebilir ve o hâl sayfada AÇIKÇA yazılıyor — boş bir sekme çubuğu
 * "yetkin yok" ile "müşteri seçilmedi"yi aynı boş ekrana çevirirdi.
 */
export function gorunurSekmeler(izinler: readonly Permission[]): SekmeTanimi[] {
  const izinli = new Set(izinler);
  return SEKMELER.filter((s) => izinli.has(s.oku));
}

/**
 * Menüdeki "Bilgi Bankası" satırının ve sayfanın GİRİŞ yetkisi.
 *
 * ═══ `client.write` — `client.read` DEĞİL, VE KARAR DEĞİŞTİ ═══
 *
 * Bir süre `SEKMELER[0].oku` (`client.read`) idi ve gerekçesi "Bilgi
 * Bankası workspace'in KENDİ bilgisi, müşteri hesabı görsün" idi. Kullanıcı
 * rolleri yeniden tanımlarken müşteri hesabının sınırını açıkça çizdi:
 * *"sadece genel bakış, reklam keşfi ve raporlar"*. Bu sayfa o üçünden
 * değil; Kütüphane'nin diğer üç satırıyla birlikte ajans tarafında kalıyor.
 *
 * `client.write` seçildi çünkü bu sayfanın sekmelerini DÜZENLEYEN yetki o
 * ve onu taşıyan her rol (Yönetici, Reklam Yöneticisi) `client.read`i de
 * taşıyor — yani menüde görünen satır her zaman açılıyor ve en az üç sekme
 * gösteriyor. Sekmelerin kendi `oku` yetkileri DEĞİŞMEDİ: sayfaya giren
 * biri override ile `budget.read`i kaybetmişse Bütçe sekmesi yine gizli.
 */
export const SAYFA_GIRIS_IZNI: Permission = 'client.write';
