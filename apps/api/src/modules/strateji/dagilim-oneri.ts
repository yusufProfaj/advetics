import { paraOndaligi, type DagilimOnerisi, type DagilimSatiri, type StratejiPlatformu } from '@advetics/shared';

/**
 * ═══ BÜTÇE DAĞILIMI ÖNERİSİ — SAF HESAP ═══
 *
 * Veritabanından gelen platform toplamlarını öneriye çeviren kısım burada ve
 * SAF: para bölüşümü, yuvarlama ve "elle satıra dokunma" kuralı çalıştırılarak
 * sınanıyor (`strateji.service.spec.ts`). Sorgu servis tarafında.
 *
 * KATMAN KIRILIMI GEÇMİŞTE YOK. `insights_daily` bir kampanyanın hangi huni
 * katmanına (yeni kitle / etkileşim / yeniden pazarlama) ait olduğunu
 * bilmiyor. "Meta'nın %70'i soğuk" gibi bir oran uydurmak Ç-4'ü çiğnerdi.
 * Öneri platform tutarını BÜTÜNÜYLE "Yeni kitle" satırına yazıyor ve gerekçe
 * bunu açıkça söylüyor; katmanlara bölmek kullanıcının kararı.
 */

/** Önerinin baktığı gün sayısı (MIMARI § 2.2). */
export const ONERI_GUN_SAYISI = 90;

/** Öneri satırlarının yazıldığı katman (bkz. yukarıdaki "katman kırılımı yok"). */
export const ONERI_KATMANI = 'soguk' as const;

export interface PlatformDayanagi {
  platform: StratejiPlatformu;
  harcamaMicros: bigint;
  /** `insights_daily.conversions` DECIMAL(14,4); sayı olarak geliyor. */
  donusum: number;
}

const PLATFORM_ADI: Record<StratejiPlatformu, string> = { meta: 'Meta', google: 'Google' };

/**
 * Önerinin penceresi: DÜNE kadar 90 gün, İstanbul takvimiyle. Bugün dahil
 * değil: günün verisi henüz tamamlanmadı ve yarım gün payı bozar. Tarihler
 * `YYYY-MM-DD` string (Date'e çevirmek saat dilimi kayması üretir).
 */
export function oneriPenceresi(simdi: Date): { from: string; to: string } {
  const bugun = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(simdi);
  const [y, m, d] = bugun.split('-').map(Number) as [number, number, number];
  const gun = (fark: number) => new Date(Date.UTC(y, m - 1, d + fark)).toISOString().slice(0, 10);
  return { from: gun(-ONERI_GUN_SAYISI), to: gun(-1) };
}

/** Dönüşüm DECIMAL(14,4): dört basamak ölçekli tam sayıya çevrilir, bölüşüm kayan noktasız. */
function olcekli(donusum: number): bigint {
  return BigInt(Math.round(donusum * 10_000));
}

export function dayanakSatirlari(dayanak: readonly PlatformDayanagi[]): DagilimOnerisi['dayanak'] {
  return dayanak.map((d) => {
    const c = olcekli(d.donusum);
    return {
      platform: d.platform,
      harcamaMicros: d.harcamaMicros.toString(),
      donusum: d.donusum,
      // Dönüşüm yoksa "hesaplanamaz": sıfıra bölme değil, sıfır da değil.
      donusumBasiMaliyetMicros: c > 0n ? ((d.harcamaMicros * 10_000n) / c).toString() : null,
    };
  });
}

/**
 * Öneri: kalan bütçe, dönüşüm payına göre platformlara bölünür.
 *
 * ELLE SATIRLAR EZİLMEZ. Kullanıcının elle yazdığı hücreler öneriye OLDUĞU
 * GİBİ girer ve bütçeden düşülür; elle satırı olan platforma yeni tutar
 * önerilmez (o platformu kullanıcı yönetiyor). Öneri bu yüzden her zaman
 * tam bir dağılım: panel onu olduğu gibi kaydedebilir ve toplam aşılmaz.
 *
 * YUVARLAMA PARA BİRİMİNİN EN KÜÇÜK BİRİMİNE, AŞAĞI. Artan kuruşlar en büyük
 * paya eklenir: satırların toplamı kalan bütçeye TAM eşit (ne bir kuruş
 * fazla, ne eksik). Micros'u kesirli bırakmak, aktarımda Meta'nın en küçük
 * birimine çevrilirken hata verirdi (`microsToMinor` yuvarlamıyor).
 */
export function oneriHesapla(girdi: {
  toplamMicros: bigint;
  paraBirimi: string;
  mevcut: readonly DagilimSatiri[];
  dayanak: readonly PlatformDayanagi[];
}): Pick<DagilimOnerisi, 'satirlar' | 'bosNedeni'> {
  const harcama = girdi.dayanak.reduce((a, d) => a + d.harcamaMicros, 0n);
  if (harcama === 0n) return { satirlar: null, bosNedeni: 'veri_yok' };
  const tumDonusum = girdi.dayanak.reduce((a, d) => a + olcekli(d.donusum), 0n);
  // Harcama var, dönüşüm yok: pay harcamadan bölünebilirdi ama bu bir getiri
  // iddiası olurdu ("şu platform daha iyi") ve dayanağı yok. Öneri YOK,
  // dayanak tablosu yine gösteriliyor.
  if (tumDonusum === 0n) return { satirlar: null, bosNedeni: 'donusum_yok' };

  const elle = girdi.mevcut.filter((s) => s.kaynak === 'elle');
  const elleToplam = elle.reduce((a, s) => a + BigInt(s.tutarMicros), 0n);
  const kalan = girdi.toplamMicros > elleToplam ? girdi.toplamMicros - elleToplam : 0n;
  const ellePlatformlar = new Set(elle.map((s) => s.platform));
  const adaylar = girdi.dayanak.filter((d) => olcekli(d.donusum) > 0n && !ellePlatformlar.has(d.platform));
  const adayDonusum = adaylar.reduce((a, d) => a + olcekli(d.donusum), 0n);

  const birim = 10n ** BigInt(6 - paraOndaligi(girdi.paraBirimi));
  const paylar = adaylar.map((d) => {
    const ham = adayDonusum > 0n ? (kalan * olcekli(d.donusum)) / adayDonusum : 0n;
    return { d, tutar: (ham / birim) * birim };
  });
  const artan = kalan - paylar.reduce((a, p) => a + p.tutar, 0n);
  if (paylar.length > 0 && artan > 0n) {
    const enBuyuk = paylar.reduce((a, p) => (olcekli(p.d.donusum) > olcekli(a.d.donusum) ? p : a));
    enBuyuk.tutar += artan;
  }

  const oneri: DagilimSatiri[] = paylar
    .filter((p) => p.tutar > 0n)
    .map((p) => {
      const yuzde = Number((olcekli(p.d.donusum) * 1000n) / tumDonusum) / 10;
      return {
        platform: p.d.platform,
        katman: ONERI_KATMANI,
        tutarMicros: p.tutar.toString(),
        kaynak: 'gecmis_veri' as const,
        gerekce:
          // "%68'i" yerine "%68 kadarı": sayıya göre değişen ek ("%40'ı",
          // "%60'ı") her sayıda doğru yazılamıyor.
          `Son ${ONERI_GUN_SAYISI} günde dönüşümlerin %${yuzde.toLocaleString('tr-TR')} kadarı ${PLATFORM_ADI[p.d.platform]}'dan geldi. ` +
          'Geçmiş veride kitle katmanı ayrımı yok; tutarın tamamı Yeni kitle satırına yazıldı, katmanlara bölmek size kalmış.',
      };
    });
  return { satirlar: [...elle.map((s) => ({ ...s })), ...oneri], bosNedeni: null };
}

/**
 * Kaydedilen satırın KAYNAĞI. Sözleşmedeki kayıt girdisi kaynak taşımıyor
 * (yalnız platform, katman, tutar) ve panelin beyanına güvenmek, elle
 * değiştirilmiş bir tutarı müşteriye "geçmiş veriden" diye göstermek
 * olurdu. Sunucu karar veriyor: tutar, son önerideki ya da halihazırda
 * kayıtlı `gecmis_veri` satırındaki tutarla AYNI hücrede KURUŞU KURUŞUNA
 * aynıysa `gecmis_veri` (gerekçesiyle), değilse `elle`.
 */
export function kaynakBelirle(
  girdi: { platform: StratejiPlatformu; katman: DagilimSatiri['katman']; tutarMicros: bigint },
  sonOneri: readonly DagilimSatiri[] | null,
  mevcut: readonly DagilimSatiri[],
): Pick<DagilimSatiri, 'kaynak' | 'gerekce'> {
  const eslesen = [...(sonOneri ?? []), ...mevcut].find(
    (s) =>
      s.kaynak === 'gecmis_veri' &&
      s.platform === girdi.platform &&
      s.katman === girdi.katman &&
      BigInt(s.tutarMicros) === girdi.tutarMicros,
  );
  return eslesen ? { kaynak: 'gecmis_veri', gerekce: eslesen.gerekce } : { kaynak: 'elle', gerekce: null };
}
