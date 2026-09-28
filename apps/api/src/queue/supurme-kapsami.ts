import type { Prisma } from '@prisma/client';

/**
 * ZAMANLANMIŞ SÜPÜRMENİN HESAP SÜZGECİ — TEK TANIM.
 *
 * Bu koşul iki yerde birden gerekiyor: süpürmenin KENDİSİ (hangi hesaplar
 * kuyruğa girer) ve teşhis ekranı (bir hesabın neden kendiliğinden
 * güncellenmediğini söylemek). İkisi ayrı yazıldığında ayrışıyor ve ayrışma
 * canlıda şöyle görünüyordu:
 *
 *   "Şimdi güncelle"ye basınca veri geliyor, kendiliğinden gelmiyor.
 *
 * Sebebi tek satırdı: süpürme hesabın PLATFORM DURUMUNA da bakıyor, elle
 * tetikleyen uç bakmıyor. Meta `account_status` olarak haritada olmayan bir
 * kod döndürdüğünde hesap `unknown` oluyor ve zamanlanmış süpürmeden sessizce
 * düşüyor — hiçbir ekranda görünmeden.
 *
 * Süzgeci burada tutmak ayrışmayı imkânsız kılmıyor ama görünür kılıyor:
 * `supurme-kapsami.spec.ts` süpürmenin bu sabiti kullandığını tarıyor.
 */
export const SUPURME_HESAP_KOSULU = {
  syncEnabled: true,
  status: { in: ['active', 'paused'] },
  connection: { status: 'active' },
  client: { status: 'active' },
} satisfies Prisma.AdAccountWhereInput;

/** `supurmeDisiSebep`'in okuduğu alanlar — çağıranın `select`'i bunu karşılamalı. */
export interface SupurmeAdayi {
  syncEnabled: boolean;
  status: string;
  connection: { status: string };
  client: { status: string } | null;
}

/**
 * Hesap zamanlanmış süpürmenin DIŞINDA kalıyorsa sebebini yazar, kalmıyorsa
 * `null` döner.
 *
 * Dönen cümle KULLANICIYA OLDUĞU GİBİ gösteriliyor: "izleme kapalı",
 * "bağlantı yeniden yetki istiyor" ve "hesap platformda kapatılmış" üçü de
 * bugüne kadar aynı boş grafiğe düşüyordu ve üçünün yapılacak işi farklı.
 *
 * SIRA ÖNEMLİ: bir hesap birden fazla koşula takılabilir. Önce KULLANICININ
 * DÜZELTEBİLECEĞİ olan yazılıyor — "izleme kapalı" tek tıkla çözülüyor,
 * "hesap platformda kapatılmış" Ads Manager işi.
 */
export function supurmeDisiSebep(a: SupurmeAdayi): string | null {
  if (!a.syncEnabled) {
    return 'İzleme kapalı — bu hesap hiçbir zamanlanmış güncellemeye girmiyor.';
  }
  if (a.client === null) {
    return 'Hesap bir workspace’e atanmamış — atanana kadar veri çekilmiyor.';
  }
  if (a.client.status !== 'active') {
    return `Workspace "${a.client.status}" durumunda — duraklatılmış workspace’lerin hesapları güncellenmiyor.`;
  }
  if (a.connection.status !== 'active') {
    return `Platform bağlantısı "${a.connection.status}" durumunda — yeniden yetkilendirme gerekiyor.`;
  }
  if (a.status !== 'active' && a.status !== 'paused') {
    return `Hesabın platformdaki durumu "${a.status}" — zamanlanmış güncelleme yalnızca aktif ve duraklatılmış hesapları alıyor. "Şimdi güncelle" bu hesabı yine de çekiyor, bu yüzden veri elle basınca gelip kendiliğinden gelmiyor olabilir.`;
  }
  return null;
}

/**
 * ═══ BU HESAPTAN VERİ NEDEN GELMİYOR — TEK CEVAP ═══
 *
 * Bu karar `sync.controller.ts` içinde satır içi yazılıydı ve yalnızca
 * Senkronizasyon Durumu ekranı onu okuyordu. Marka Merkezi'nin hazırlık
 * listesi de aynı soruyu soruyor ("veri geliyor mu"). İkinci bir kopya,
 * bir ekranın "veri geliyor", ötekinin "gelmiyor" demesi olurdu. Süzgeci iki
 * yerde yazmanın bu depodaki klasik sonucu (bkz. `SUPURME_HESAP_KOSULU`).
 *
 * SIRA ÖNEMLİ: süpürme dışı sebep önce, çünkü izlemesi kapalı bir hesapta
 * "yapı taraması koşmadı" demek, asıl işi (izlemeyi açmak) gizler.
 *
 * YAPI ENGELİ süpürme engelinden bağımsız: süpürmeye giren bir hesapta bile
 * yapı taraması hiç koşmadıysa metrik satırları yazılamıyor, çünkü
 * eşlenecek kampanya satırı yok. Eşlenemeyen satır atlanıyor ve iş
 * "başarılı" kapanıyor.
 */
export interface VeriAkisiAdayi extends Omit<SupurmeAdayi, 'connection'> {
  /**
   * `null` = bağlantı BU KAPSAMDA GÖRÜNMÜYOR (RLS). Yokluk değil
   * bilinmezlik: hesabın bağlantısı başka bir şirketin kendi bağlantısı ve
   * "Tüm şirketler" modunda gizli. Bkz. `gorunen-baglantilar.ts`.
   */
  connection: { status: string } | null;
  lastStructureSyncAt: Date | null;
  lastInsightsSyncAt: Date | null;
}

/**
 * Bağlantısı görünmeyen hesabın cümlesi — sabit, çünkü okuyan taraflar
 * (hazırlık listesi) onu "eksik" değil "bilinmiyor" diye ayırt ediyor.
 */
export const BAGLANTI_GORUNMUYOR =
  'Bu hesabın platform bağlantısı başka bir şirketin kendi bağlantısı ve bu görünümden okunamıyor. Veri durumunu görmek için o şirkete geç.';

export function veriAkisiEngeli(a: VeriAkisiAdayi): string | null {
  /*
   * GÖRÜNMEYEN BAĞLANTI: bağlantıya bakmayan sebepler (izleme kapalı,
   * workspace pasif, hesap durumu) yine de söylenebiliyor ve önce onlar
   * geliyor; bağlantı adımı "bilinmiyor" cümlesine düşüyor. Bağlantıyı
   * `active` saymak onun sağlam olduğunu uydurmak olurdu, o yüzden yalnızca
   * DİĞER adımların sonucuna bakmak için kullanılıyor.
   */
  if (a.connection === null) {
    return supurmeDisiSebep({ ...a, connection: { status: 'active' } }) ?? BAGLANTI_GORUNMUYOR;
  }
  const sweep = supurmeDisiSebep({ ...a, connection: a.connection });
  if (sweep !== null) return sweep;
  if (a.lastStructureSyncAt === null) {
    return 'Yapı taraması bu hesapta hiç koşmadı — kampanya satırları olmadan metrikler yazılamıyor. "Şimdi güncelle" önce yapıyı çeker.';
  }
  if (a.lastInsightsSyncAt === null) {
    return 'Hesap izleniyor ve yapı taraması koştu ama metrik hiç çekilmedi. Aşağıdaki iş listesinde bu hesabın son işine bakın.';
  }
  return null;
}
