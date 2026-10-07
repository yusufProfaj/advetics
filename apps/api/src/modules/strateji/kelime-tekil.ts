/**
 * ═══ KELİME FİKİRLERİ: TEKİLLEŞTİR, SIRALA, KES ═══
 *
 * SAF FONKSİYONLAR. Google'ın yanıtı ile tabloya yazılan satırlar arasındaki
 * bütün karar burada; işleyici yalnızca çağırıyor ve yazıyor. Çalıştırılarak
 * sınanıyor (`kelime-tekil.spec.ts`): bir günlük kayma gibi, bir varyantın
 * ayrı satır kalması da kaynak taramasında görünmez.
 */

/** Google'dan gelen ham fikir (`GoogleProvider.kelimeFikirleri` dönüşü). */
export interface HamKelimeFikri {
  kelime: string;
  aylikArama: string | null;
  rekabet: string | null;
  teklifAltMicros: string | null;
  teklifUstMicros: string | null;
}

/** Tabloya yazılmaya hazır, tekilleştirilmiş fikir. */
export interface TekilKelime {
  kelime: string;
  varyantlar: string[];
  aylikArama: bigint | null;
  rekabet: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  teklifAltMicros: bigint | null;
  teklifUstMicros: bigint | null;
}

/**
 * Plana yazılan en çok fikir sayısı. Ö-1'de tek tohum çifti 2.660 fikir
 * döndürdü; hepsini yazmak plan ekranını okunmaz yapar ve detay yanıtını
 * yüzlerce KB'a çıkarır. 300 seçildi çünkü (a) hacme göre sıralı listenin
 * ilk 300'ü pratikte bütün anlamlı hacmi taşıyor (Ö-1'de 300. sıradaki
 * kelime ayda ~1.000 arama civarındaydı, yani `AYRI_GRUP_HACIM_ESIGI`
 * sınırı), (b) seçim ucu (`kelimeGuncelleSchema`) tek seferde en çok 500
 * satır kabul ediyor: yazılan satırların tamamı tek istekle işaretlenebilmeli.
 * Kesilen kısım SAKLANMIYOR ama SAYISI saklanıyor (`kelime_toplam`) ve ekran
 * "300 / 2.660" yazıyor.
 */
export const KELIME_YAZMA_SINIRI = 300;

/** Kelime sütununun genişliği (VARCHAR 80); daha uzun fikir yazılamaz. */
export const KELIME_EN_UZUN = 80;

/**
 * Türkçe karakterleri sadeleştirir: "türk kahve makinesi" ile "turk kahve
 * makinesi" aynı anahtara düşer. Önce Türkçe kurallarla küçük harf ("İ" →
 * "i", "I" → "ı"), sonra ı → i: Google'ın varyantı "ı"yı "i" yazıyor.
 */
export function sadelestir(kelime: string): string {
  return kelime
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/[âà]/g, 'a')
    .replace(/[îì]/g, 'i')
    .replace(/[ûù]/g, 'u')
    .replace(/\s+/g, ' ')
    .trim();
}

function tamSayi(v: string | null): bigint | null {
  if (v === null) return null;
  const s = v.trim();
  // Google micros'u ve hacmi int64 STRING olarak veriyor. Ondalıklı ya da
  // bozuk bir değer "bilinmiyor" sayılır; yuvarlayıp sayı UYDURMAK değil.
  return /^\d{1,18}$/.test(s) ? BigInt(s) : null;
}

function rekabetKodu(v: string | null): TekilKelime['rekabet'] {
  // UNSPECIFIED / UNKNOWN "Google değer vermedi" demek; tabloda NULL.
  return v === 'LOW' || v === 'MEDIUM' || v === 'HIGH' ? v : null;
}

/**
 * VARYANT TEKİLLEŞTİRME (MIMARI § 4.1, Ö-1'de ölçüldü).
 *
 * Google yakın varyantları TEK METRİKTE birleştiriyor: "türk kahve makinesi"
 * ve "turk kahve makinesi" aynı 74.000 hacmi ve aynı teklif aralığını
 * taşıyor. İkisi ayrı satır olsaydı grup ya da plan toplamında hacim İKİYE
 * KATLANIRDI ve hiçbir hata düşmezdi.
 *
 * İKİ KOŞUL BİRLİKTE: aynı parmak izi (hacim, rekabet, teklif alt, teklif
 * üst) VE sadeleştirilince aynı metin. Yalnız parmak izi yetmez: farklı iki
 * kelimenin aynı yuvarlanmış kovaya (49.500) düşmesi sık. Yalnız metin de
 * yetmez: metrikleri farklıysa Google onları ayrı kelime sayıyor demektir.
 *
 * İlk görülen ad satırın adı olur, diğerleri `varyantlar`a gider.
 *
 * İKİNCİ GEÇİŞ — veritabanı anahtarı: tablo `(plan_id, lower(kelime))`
 * üstünde tekil. Metrikleri farklı ama yalnız büyük/küçük harfte ayrışan iki
 * fikir ("IPHONE" / "iphone") aynı INSERT'te o indekse iki kez çarpar ve
 * yazım TAMAMEN düşerdi. Bu durumda hacmi yüksek olan kalır, diğeri varyant
 * olur. Anahtar `toLowerCase()` (dil kuralı olmadan): Postgres `lower()` ile
 * aynı eşdeğerlikleri en az onun kadar geniş tutuyor.
 */
export function tekillestir(fikirler: readonly HamKelimeFikri[]): TekilKelime[] {
  const sirali: TekilKelime[] = [];
  const parmakIzi = new Map<string, TekilKelime>();
  for (const f of fikirler) {
    const kelime = f.kelime.replace(/\s+/g, ' ').trim();
    // Boş ya da sütuna sığmayan fikir yazılamaz; kırpmak başka bir kelime
    // üretirdi.
    if (kelime === '' || kelime.length > KELIME_EN_UZUN) continue;
    const satir: TekilKelime = {
      kelime,
      varyantlar: [],
      aylikArama: tamSayi(f.aylikArama),
      rekabet: rekabetKodu(f.rekabet),
      teklifAltMicros: tamSayi(f.teklifAltMicros),
      teklifUstMicros: tamSayi(f.teklifUstMicros),
    };
    const anahtar = [
      satir.aylikArama ?? '-',
      satir.rekabet ?? '-',
      satir.teklifAltMicros ?? '-',
      satir.teklifUstMicros ?? '-',
      sadelestir(kelime),
    ].join('|');
    const onceki = parmakIzi.get(anahtar);
    if (onceki) {
      if (onceki.kelime !== kelime && !onceki.varyantlar.includes(kelime)) onceki.varyantlar.push(kelime);
      continue;
    }
    parmakIzi.set(anahtar, satir);
    sirali.push(satir);
  }

  const dbAnahtari = new Map<string, TekilKelime>();
  const sonuc: TekilKelime[] = [];
  for (const s of sirali) {
    const k = s.kelime.toLowerCase();
    const onceki = dbAnahtari.get(k);
    if (!onceki) {
      dbAnahtari.set(k, s);
      sonuc.push(s);
      continue;
    }
    const kazanan = hacimKarsilastir(s, onceki) < 0 ? s : onceki;
    const kaybeden = kazanan === s ? onceki : s;
    kazanan.varyantlar.push(...[kaybeden.kelime, ...kaybeden.varyantlar].filter((v) => v !== kazanan.kelime && !kazanan.varyantlar.includes(v)));
    if (kazanan === s) {
      sonuc[sonuc.indexOf(onceki)] = s;
      dbAnahtari.set(k, s);
    }
  }
  return sonuc;
}

/** Hacim azalan; hacmi bilinmeyen (`null`) en sonda. Eşitlikte ad sırası (kararlı çıktı). */
function hacimKarsilastir(a: TekilKelime, b: TekilKelime): number {
  if (a.aylikArama === b.aylikArama) return a.kelime.localeCompare(b.kelime, 'tr');
  if (a.aylikArama === null) return 1;
  if (b.aylikArama === null) return -1;
  return a.aylikArama > b.aylikArama ? -1 : 1;
}

/**
 * Tekilleştir → hacme göre sırala → ilk `sinir` kadarını al. `toplam`
 * KESMEDEN ÖNCEKİ tekil sayı: ekran "gösterilen / toplam" yazıyor.
 */
export function kelimeSonucunuHazirla(
  fikirler: readonly HamKelimeFikri[],
  sinir = KELIME_YAZMA_SINIRI,
): { satirlar: TekilKelime[]; toplam: number } {
  const tekil = tekillestir(fikirler).sort(hacimKarsilastir);
  return { satirlar: tekil.slice(0, sinir), toplam: tekil.length };
}

/** Hiçbir tohumu içermeyen ve eşiğin altındaki kelimelerin grubu. */
export const DIGER_GRUBU = 'Diğer';

/**
 * ═══ KELİME GRUPLAMA (MIMARI § 6.2) — DETERMİNİSTİK, YAPAY ZEKÂ YOK ═══
 *
 * Grup Google'da bir REKLAM GRUBU olacak: aynı kelime listesi her seferinde
 * aynı gruplara düşmeli ve kullanıcı nedenini görebilmeli. Kural:
 *   1. Karşılaştırma Türkçe sadeleştirmeyle (`sadelestir`, tekilleştirmeyle
 *      AYNI fonksiyon: ikinci bir sadeleştirici doğarsa "türk kahve" bir
 *      ekranda tek satır, diğerinde iki grup olur).
 *   2. Kelime İÇERDİĞİ EN UZUN tohuma gider; grup adı tohumun kendisi. En
 *      uzun, çünkü "kahve makinesi" ile "kahve" tohumlarından ikisini de
 *      içeren "türk kahve makinesi" daha DAR olan gruba ait.
 *   3. Tohum içermeyen kelime: ayda `AYRI_GRUP_HACIM_ESIGI` ve üstü arama
 *      alıyorsa kendi adıyla ayrı grup, değilse `Diğer`. Hacmi bilinmeyen
 *      (`null`) kelime eşiği GEÇMİŞ sayılmaz: kendi grubunu hak ettiğine
 *      dair kanıt yok.
 */
export function kelimeGrubu(
  kelime: string,
  aylikArama: bigint | null,
  tohumlar: readonly string[],
  esik: number,
): string {
  const sade = sadelestir(kelime);
  let enIyi: { tohum: string; uzunluk: number } | null = null;
  for (const t of tohumlar) {
    const st = sadelestir(t);
    if (st === '' || !sade.includes(st)) continue;
    // Eşit uzunlukta ilk yazılan tohum kazanır: kararlı çıktı.
    if (!enIyi || st.length > enIyi.uzunluk) enIyi = { tohum: t.replace(/\s+/g, ' ').trim(), uzunluk: st.length };
  }
  if (enIyi) return enIyi.tohum;
  if (aylikArama !== null && aylikArama >= BigInt(esik)) return kelime;
  return DIGER_GRUBU;
}
