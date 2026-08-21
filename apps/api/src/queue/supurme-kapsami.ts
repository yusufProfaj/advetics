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
    return 'Hesap bir müşteriye atanmamış — atanana kadar veri çekilmiyor.';
  }
  if (a.client.status !== 'active') {
    return `Müşteri "${a.client.status}" durumunda — duraklatılmış müşterilerin hesapları güncellenmiyor.`;
  }
  if (a.connection.status !== 'active') {
    return `Platform bağlantısı "${a.connection.status}" durumunda — yeniden yetkilendirme gerekiyor.`;
  }
  if (a.status !== 'active' && a.status !== 'paused') {
    return `Hesabın platformdaki durumu "${a.status}" — zamanlanmış güncelleme yalnızca aktif ve duraklatılmış hesapları alıyor. "Şimdi güncelle" bu hesabı yine de çekiyor, bu yüzden veri elle basınca gelip kendiliğinden gelmiyor olabilir.`;
  }
  return null;
}
