/**
 * ═══ GÜN ARİTMETİĞİ VE RAPOR PENCERESİ — TEK TANIM ═══
 *
 * Bu dosya `apps/web/src/lib/date-range.ts` içinde doğmuştu ve orada kalması
 * ZAMANLANMIŞ RAPORLA BİRLİKTE İMKÂNSIZ hâle geldi: planlanmış gönderim
 * WORKER'da (apps/api) koşuyor ve `apps/web` altındaki bir dosyaya erişemiyor.
 *
 * Kalan tek seçenek pencere hesabını worker tarafında İKİNCİ KEZ yazmaktı ve
 * CLAUDE.md'nin cevabı net: "AYNI ŞEYİ ÜRETEN İKİNCİ FONKSİYON, DOĞDUĞU ANDA
 * AYRIŞIR." Ayrışmanın bedeli burada somut: panelde gördüğü rapordan farklı
 * bir dönemi kapsayan bir belge MÜŞTERİYE gider ve fark hiçbir ekranda
 * görünmez.
 *
 * Bu yüzden hesap `packages/shared`a taşındı; `date-range.ts` artık buradan
 * besleniyor ve kendi kopyasını taşımıyor.
 *
 * TARİHLER STRING ve UTC. Kullanıcının tarayıcı saat dilimine göre hesaplamak
 * cazip ama yanlış: "dün" reklam HESABININ zaman diliminde tanımlı ve
 * metrikler o dilime göre yazılıyor (bkz. `insights_daily`).
 */

/** `YYYY-MM-DD` — UTC gün başına sabitlenmiş. */
export type IsoDay = string;

const GUN_MS = 86_400_000;

/** Bugün, UTC. */
export function bugunUtc(): IsoDay {
  return new Date().toISOString().slice(0, 10);
}

/** Gün ekler/çıkarır. `Date` aritmetiği UTC üzerinden — yerel saat kaymaz. */
export function gunEkle(gun: IsoDay, n: number): IsoDay {
  return new Date(Date.parse(`${gun}T00:00:00Z`) + n * GUN_MS).toISOString().slice(0, 10);
}

/** İki gün arasındaki fark (dahil): `2026-08-01..2026-08-01` = 1. */
export function gunSayisi(from: IsoDay, to: IsoDay): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / GUN_MS) + 1;
}

/** Haftanın Pazartesi'si. Türkiye'de hafta Pazartesi başlıyor. */
export function haftaBasi(gun: IsoDay): IsoDay {
  const d = new Date(`${gun}T00:00:00Z`);
  // `getUTCDay()` Pazar = 0. Pazartesi'ye çekmek için 0'ı 7 sayıyoruz.
  const gunNo = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  return gunEkle(gun, -(gunNo - 1));
}

/** Ayın ilk günü. */
export function ayBasi(gun: IsoDay): IsoDay {
  return `${gun.slice(0, 7)}-01`;
}

/**
 * ═══ PENCERE ÜRETİCİLERİ ═══
 *
 * Panelin ön ayar listesi (`RANGE_PRESETS`) bunları etiketleyip kullanıyor;
 * zamanlanmış rapor da aynılarını çağırıyor. İki taraf da BU fonksiyonlardan
 * geçtiği için ayrışma fiziksel olarak mümkün değil.
 */
export const PENCERE = {
  bugun: (b: IsoDay) => ({ from: b, to: b }),
  dun: (b: IsoDay) => ({ from: gunEkle(b, -1), to: gunEkle(b, -1) }),
  bu_hafta: (b: IsoDay) => ({ from: haftaBasi(b), to: b }),
  gecen_hafta: (b: IsoDay) => {
    const bu = haftaBasi(b);
    return { from: gunEkle(bu, -7), to: gunEkle(bu, -1) };
  },
  bu_ay: (b: IsoDay) => ({ from: ayBasi(b), to: b }),
  gecen_ay: (b: IsoDay) => {
    const buAy = ayBasi(b);
    const gecenAySonu = gunEkle(buAy, -1);
    return { from: ayBasi(gecenAySonu), to: gecenAySonu };
  },
  /** Son N gün — DÜNDE BİTİYOR, bugünü içermiyor. */
  sonGun: (b: IsoDay, n: number) => ({ from: gunEkle(b, -n), to: gunEkle(b, -1) }),
} as const;

/**
 * ═══ RAPOR PENCERESİ — BUGÜN İÇERİ GİRMİYOR ═══
 *
 * `apps/web/.../raporlar/page.tsx` seçilen aralığın bitişini DÜNE kırpıyor ve
 * `rapor-araligi.spec.ts` bunu kaynak taramasıyla kilitliyor. Gerekçe orada
 * yazılı: rapor bir BELGE ve müşteriye gidiyor; tamamlanmamış bir günü içine
 * almak, gün içinde değişecek rakamları müşteriye göndermek demek.
 *
 * Zamanlanmış gönderim aynı kırpmayı yapmak ZORUNDA. Ayrı yazılsaydı, ekranda
 * bakılan raporla otomatik giden rapor aynı ön ayarda farklı gün sayısı
 * gösterirdi.
 *
 * NULL DÖNÜYOR — BOŞ PENCERE SESSİZCE GEÇİLMİYOR. Ayın 1'inde "Bu ay" seçili
 * bir planlama koşarsa `from` (ayın 1'i) `to`dan (dün = geçen ayın son günü)
 * BÜYÜK oluyor. Bu bir tarih aralığı değil; sunucuya göndermek doğrulama
 * hatası, sessizce düzeltmek ise kullanıcının seçmediği bir dönemi
 * göndermek olurdu. Çağıran "dönem henüz başlamadı" diyerek atlıyor.
 */
export function raporPenceresi(
  anahtar: string,
  bugun: IsoDay,
): { from: IsoDay; to: IsoDay } | null {
  const dun = gunEkle(bugun, -1);

  const ham = ((): { from: IsoDay; to: IsoDay } | null => {
    switch (anahtar) {
      case '7g':
        return PENCERE.sonGun(bugun, 7);
      case '14g':
        return PENCERE.sonGun(bugun, 14);
      case '30g':
        return PENCERE.sonGun(bugun, 30);
      case 'bu_ay':
        return PENCERE.bu_ay(bugun);
      case 'gecen_ay':
        return PENCERE.gecen_ay(bugun);
      default:
        return null;
    }
  })();

  if (ham === null) return null;

  // KIRPMA. `bu_ay` bugünü içeriyor; diğerleri zaten dünde bitiyor ve bu
  // satır onlara dokunmuyor.
  const to = ham.to > dun ? dun : ham.to;
  if (ham.from > to) return null;
  return { from: ham.from, to };
}
