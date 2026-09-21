import { CONVERSION_BUCKETS } from './schemas/report.schema';

/**
 * ═══ ADLANDIRILMIŞ DÖNÜŞÜM DETAYI ═══
 *
 * Kullanıcının isteği birebir: "google adsteki dönüşümleri ne dönüşümler
 * olduğunu bilmiyorum... dönüşümlerde ne olarak adlandırdıysam 'whatsapp
 * tıklaması' 'site içi telefon araması' gibi gibi dönüşümleri raporda düzgün
 * bir şekilde görebilmem lazım".
 *
 * Panelde tek bir "Dönüşüm: 47" sayısı vardı ve NEYİN 47 olduğu hiçbir yerde
 * yazmıyordu.
 *
 * ═══ İKİ PLATFORM, İKİ AYRI GERÇEK ═══
 *
 * GOOGLE: dönüşüm eylemlerini kullanıcı kendisi adlandırıyor ve API o adı
 * `segments.conversion_action_name` ile veriyor. Yani gösterilen ad
 * KULLANICININ KENDİ ADI — bizim uydurduğumuz bir etiket değil.
 *
 * META: insights yanıtı yalnızca TEKNİK aksiyon türü taşıyor
 * (`onsite_conversion.messaging_conversation_started_7d`) ve özel
 * dönüşümlerin kullanıcı verdiği adı İÇERMİYOR — o ad ayrı bir uçta duruyor.
 * Ham türleri olduğu gibi listelemek iki kat kötü olurdu: hem okunmaz, hem
 * MÜKERRER (aynı olay birden çok tür altında raporlanıyor; canlıda ölçüldü,
 * `CONVERSION_BUCKETS` notuna bakılabilir). Bu yüzden Meta tarafında
 * tekilleştirilmiş KOVALAR gösteriliyor: Form, Mesaj, Satış.
 *
 * Bu fark gizlenmiyor; her satır hangi platformdan geldiğini taşıyor.
 *
 * ═══ SORGU ANINDA TÜRETİLİYOR ═══
 *
 * Hesaplanmış sayı kolona yazılmıyor. `raw_metrics` zaten saklanıyor ve
 * adlandırma bir KARAR: değiştiğinde 90 günlük veriyi platformdan yeniden
 * çekmek gerekmemeli. Meta kovalarında verilmiş kararın aynısı.
 */

export interface DonusumDetayi {
  /** Google'da kullanıcının verdiği ad; Meta'da kova etiketi. */
  ad: string;
  sayi: number;
  degerMikros: string;
}

function nesneMi(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Google ham gövdesinden dönüşüm eylemlerini çıkarır.
 *
 * `conversionActionsError` DOLUYSA BOŞ DEĞİL HATA DÖNÜYOR: "dönüşüm yok" ile
 * "detay alınamadı" aynı boş liste olarak görünürse kullanıcı sebebi kendi
 * Google Ads kurulumunda arar. Bu depoda adı konmuş yasak.
 */
function googledan(raw: Record<string, unknown>): {
  satirlar: DonusumDetayi[];
  hata: string | null;
} {
  const hata = typeof raw.conversionActionsError === 'string' ? raw.conversionActionsError : null;
  if (hata) return { satirlar: [], hata };

  const liste = raw.conversionActions;
  if (!Array.isArray(liste)) return { satirlar: [], hata: null };

  const satirlar: DonusumDetayi[] = [];
  for (const item of liste) {
    if (!nesneMi(item)) continue;
    const ad = typeof item.name === 'string' ? item.name.trim() : '';
    if (!ad) continue;
    const sayi = Number(item.conversions ?? 0);
    if (!Number.isFinite(sayi) || sayi === 0) continue;
    satirlar.push({
      ad,
      sayi,
      degerMikros: typeof item.valueMicros === 'string' ? item.valueMicros : '0',
    });
  }
  return { satirlar, hata: null };
}

/**
 * Meta ham gövdesinden KOVA satırları çıkarır.
 *
 * Kovanın içindeki öncelik sırası `bucketsFromRaw` ile AYNI mantık: ilk DOLU
 * tür kazanıyor, toplanmıyor. Toplamak canlıda ölçülmüş bir çift sayım
 * üretiyordu (20 konuşma "59" olarak raporlanmıştı).
 */
function metadan(raw: Record<string, unknown>): DonusumDetayi[] {
  const actions = raw.actions;
  if (!Array.isArray(actions)) return [];

  const turBasina = new Map<string, number>();
  for (const item of actions) {
    if (!nesneMi(item)) continue;
    const tur = typeof item.action_type === 'string' ? item.action_type : null;
    if (!tur) continue;
    const deger = Number(item.value ?? 0);
    if (!Number.isFinite(deger)) continue;
    turBasina.set(tur, (turBasina.get(tur) ?? 0) + deger);
  }

  const degerler = raw.action_values;
  const degerBasina = new Map<string, number>();
  if (Array.isArray(degerler)) {
    for (const item of degerler) {
      if (!nesneMi(item)) continue;
      const tur = typeof item.action_type === 'string' ? item.action_type : null;
      if (!tur) continue;
      const deger = Number(item.value ?? 0);
      if (!Number.isFinite(deger)) continue;
      degerBasina.set(tur, (degerBasina.get(tur) ?? 0) + deger);
    }
  }

  const satirlar: DonusumDetayi[] = [];
  for (const kova of Object.values(CONVERSION_BUCKETS)) {
    for (const tur of kova.actionTypes) {
      const sayi = turBasina.get(tur);
      if (sayi === undefined || sayi === 0) continue;
      const para = degerBasina.get(tur) ?? 0;
      satirlar.push({
        ad: kova.label,
        sayi,
        // Meta parayı ONDALIK veriyor; micros'a çevirmek çağıranın değil
        // buranın işi — iki yerde yapılırsa biri unutulur.
        degerMikros: String(Math.round(para * 1_000_000)),
      });
      break;
    }
  }
  return satirlar;
}

/**
 * Tek bir `raw_metrics` gövdesinden dönüşüm detayını çıkarır.
 *
 * BOZUK GÖVDEDE FIRLATMIYOR. Rapor müşteriye gidiyor ve "rapor
 * oluşturulamadı" demek, bir tablonun eksik olmasından çok daha kötü.
 */
export function donusumDetaylari(
  platform: string,
  raw: unknown,
): { satirlar: DonusumDetayi[]; hata: string | null } {
  if (!nesneMi(raw)) return { satirlar: [], hata: null };
  if (platform === 'google') return googledan(raw);
  return { satirlar: metadan(raw), hata: null };
}

/**
 * Birden çok gövdeyi AD BAZINDA toplar.
 *
 * Satırlar gün × varlık granülünde geliyor; kullanıcının gördüğü şey dönem
 * toplamı. Toplama SONUNDA yuvarlanıyor: Meta kesirli atıf uyguluyor (bir
 * dönüşüm iki reklama 0,5/0,5 dağıtılabiliyor) ve ara toplamlarda yuvarlamak
 * hata biriktirirdi.
 */
export function donusumToplami(
  girdiler: Iterable<{ platform: string; raw: unknown }>,
): { satirlar: Array<DonusumDetayi & { platform: string }>; hatalar: string[] } {
  const toplam = new Map<string, { platform: string; ad: string; sayi: number; deger: bigint }>();
  const hatalar = new Set<string>();

  for (const g of girdiler) {
    const { satirlar, hata } = donusumDetaylari(g.platform, g.raw);
    if (hata) hatalar.add(hata);
    for (const s of satirlar) {
      /*
       * ANAHTAR PLATFORMU DA TAŞIYOR. İki platformda aynı adlı bir dönüşüm
       * olabilir ("Satış") ve onları toplamak, iki ayrı ölçüm sistemini tek
       * sayıda birleştirmek olurdu — atıf pencereleri bile farklı.
       */
      const anahtar = `${g.platform}|${s.ad}`;
      const mevcut = toplam.get(anahtar) ?? {
        platform: g.platform,
        ad: s.ad,
        sayi: 0,
        deger: 0n,
      };
      mevcut.sayi += s.sayi;
      mevcut.deger += BigInt(s.degerMikros || '0');
      toplam.set(anahtar, mevcut);
    }
  }

  const satirlar = [...toplam.values()]
    .map((t) => ({
      platform: t.platform,
      ad: t.ad,
      sayi: Math.round(t.sayi),
      degerMikros: t.deger.toString(),
    }))
    // ÇOK OLAN ÜSTTE: kullanıcının ilk sorusu "en çok hangisi geldi".
    .sort((a, b) => b.sayi - a.sayi || a.ad.localeCompare(b.ad, 'tr'));

  return { satirlar, hatalar: [...hatalar] };
}
