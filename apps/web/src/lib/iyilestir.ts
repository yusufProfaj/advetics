import type {
  AsistanAraci,
  AsistanMesaji,
  AsistanParcasi,
  Oneri,
  OneriListesi,
  OneriSerisi,
  OneriSeviyesi,
  Platform,
  UygulamaSonucu,
} from '@advetics/shared';
import { ASISTAN_ARACLARI, ONERI_TURU_ETIKETI, PLATFORM_KISA_ADLARI, formatMoney } from '@advetics/shared';

/**
 * ═══ İYİLEŞTİR EKRANININ SAF KARARLARI (Ajan 3, 2026-10-09) ═══
 *
 * Panelde bileşen render eden test altyapısı yok (bilinçli); bir kartın
 * hangi hâlde çizileceği, özet şeridinin sayıları, onay penceresinin
 * adımları ve asistan akışının ayrıştırılması burada ve ÇALIŞTIRILARAK
 * sınanıyor (`iyilestir.spec.ts`). Bileşenler yalnız çiziyor: bir karar
 * bileşenin içinde kalırsa ancak kaynak taramasıyla sınanabilir ve o tarama
 * yanlış şeyi kilitleyebilir (CLAUDE.md "REACT EFFECT'İNİN İÇİNDEKİ KARAR").
 */

// ─── Sekmeler ────────────────────────────────────────────────────────────────

export const SEKMELER = ['oneriler', 'asistan', 'kurallar'] as const;
export type Sekme = (typeof SEKMELER)[number];

export const SEKME_ETIKETI: Record<Sekme, string> = {
  oneriler: 'Öneriler',
  asistan: 'AI Asistan',
  kurallar: 'Kurallar',
};

/**
 * Adresteki sekme. Bilinmeyen değer Öneriler'e düşüyor, hata vermiyor:
 * adres elle düzenlenmiş olabilir ve bir yazım hatası yüzünden sayfanın
 * açılmaması abartı olurdu. Liste ÜZERİNDEN çözülüyor; `raw === 'asistan'`
 * gibi dallar dördüncü sekmeyi sessizce Öneriler'e çevirirdi.
 */
export function sekmeCoz(raw: string | undefined): Sekme {
  return SEKMELER.find((s) => s === raw) ?? 'oneriler';
}

// ─── Platform adının ekleri ──────────────────────────────────────────────────

/**
 * TÜRKÇE EK PLATFORMA GÖRE DEĞİŞİYOR: "Meta'ya", "Google'a", "LinkedIn'e".
 * Tek bir `${ad}'ya` kalıbı Google için yanlış Türkçe üretirdi. `Record`
 * olduğu için yeni platform eklenince derleme burayı ister.
 */
export const PLATFORM_EKLERI: Record<Platform, { yonelme: string; ayrilma: string; bulunma: string }> = {
  meta: { yonelme: 'Meta’ya', ayrilma: 'Meta’dan', bulunma: 'Meta’da' },
  google: { yonelme: 'Google’a', ayrilma: 'Google’dan', bulunma: 'Google’da' },
  linkedin: { yonelme: 'LinkedIn’e', ayrilma: 'LinkedIn’den', bulunma: 'LinkedIn’de' },
};

/**
 * Seviyenin BELİRTME hâli, platformun kendi adıyla. LinkedIn'de bizim
 * `ad_group` seviyemiz LinkedIn'in "Campaign"ı (CLAUDE.md, seviye eşlemesi):
 * orada "reklam setini" yazmak kullanıcıya olmayan bir nesneyi gösterirdi.
 */
const SEVIYE_BELIRTME: Record<Platform, Record<OneriSeviyesi, string>> = {
  meta: { campaign: 'kampanyayı', ad_group: 'reklam setini', ad: 'reklamı' },
  google: { campaign: 'kampanyayı', ad_group: 'reklam grubunu', ad: 'reklamı' },
  linkedin: { campaign: 'kampanya grubunu', ad_group: 'kampanyayı', ad: 'reklamı' },
};

const SEVIYE_ADI: Record<Platform, Record<OneriSeviyesi, string>> = {
  meta: { campaign: 'Kampanya', ad_group: 'Reklam seti', ad: 'Reklam' },
  google: { campaign: 'Kampanya', ad_group: 'Reklam grubu', ad: 'Reklam' },
  linkedin: { campaign: 'Kampanya grubu', ad_group: 'Kampanya', ad: 'Reklam' },
};

export function seviyeAdi(platform: Platform, seviye: OneriSeviyesi): string {
  return SEVIYE_ADI[platform][seviye];
}

const buyukHarf = (s: string): string => s.charAt(0).toLocaleUpperCase('tr') + s.slice(1);

// ─── Kart hâli ───────────────────────────────────────────────────────────────

/**
 * KARTIN ALTINDA NE YAZACAĞI. Yedi hâl ve hepsi ayrı cümle:
 *
 * - `uygulandi` (sonuç yok) ile `dogrulandi` AYRI: geri okuma sonucu yoksa
 *   "doğrulandı" yazmak, "200 döndü doğrulama değil" kuralını ekranda
 *   çiğnemek olurdu.
 * - `uyusmadi`: platform kabul etti ama geri okunan değer farklı; iki değer
 *   de yazılıyor.
 * - `bilgi`: eylem yok, sebebi `kisit`ta.
 * - `yetkisiz`: eylem var ama kullanıcıda `budget.write` yok. Düğmeyi
 *   göstermek 403'e götürür; hiç yazmamak "neden düğme yok" sorusunu
 *   cevapsız bırakır.
 */
export type KartHali = 'uygulanabilir' | 'bilgi' | 'yetkisiz' | 'dogrulandi' | 'uyusmadi' | 'uygulandi' | 'yoksayildi';

export function kartHali(o: Pick<Oneri, 'durum' | 'eylem' | 'uygulama'>, yazabilir: boolean): KartHali {
  if (o.durum === 'yoksayildi') return 'yoksayildi';
  if (o.durum === 'uygulandi') {
    if (o.uygulama === null) return 'uygulandi';
    return o.uygulama.durum === 'uyusmadi' ? 'uyusmadi' : 'dogrulandi';
  }
  if (o.eylem === null) return 'bilgi';
  if (!yazabilir) return 'yetkisiz';
  return 'uygulanabilir';
}

/**
 * Ekranda görünen kartlar: açık olanlar ve UYGULANANLAR (sonucu kartın
 * üstünde okunsun). Yoksayılanlar gizli ama SAYISI söyleniyor
 * (`yoksayilanSayisi`): sessiz kesme yok.
 */
export function gorunenOneriler(oneriler: readonly Oneri[]): Oneri[] {
  return oneriler.filter((o) => o.durum !== 'yoksayildi');
}

export function yoksayilanSayisi(oneriler: readonly Oneri[]): number {
  return oneriler.filter((o) => o.durum === 'yoksayildi').length;
}

// ─── Özet şeridi ─────────────────────────────────────────────────────────────

export interface OzetSayilari {
  uygulanabilir: number;
  /** Biçimlenmiş; birden çok para birimi varsa " + " ile ayrı ayrı. */
  harcama: string;
  yalnizBilgi: number;
  buAyUygulanan: number;
  acik: number;
}

/**
 * UYDURMA PUAN YOK, GERÇEK SAYILAR (PLAN.md). Yalnız AÇIK öneriler sayılıyor:
 * uygulanmış bir önerinin harcaması "etkilenecek" değil, etkilenmiş.
 *
 * PARA BİRİMLERİ TOPLANMIYOR: bir workspace'te TRY ve USD hesabı birlikte
 * olabiliyor ve ikisini tek sayıda toplamak anlamsız bir rakam üretir.
 * Micros BigInt ile toplanıyor (CLAUDE.md: para micros, Number'a çevrilmez).
 */
export function ozetSayilari(liste: Pick<OneriListesi, 'oneriler' | 'buAyUygulanan'>): OzetSayilari {
  const acik = liste.oneriler.filter((o) => o.durum === 'acik');
  const birimler = new Map<string, bigint>();
  for (const o of acik) {
    let tutar: bigint;
    try {
      tutar = BigInt(o.harcamaMikros);
    } catch {
      continue;
    }
    birimler.set(o.paraBirimi, (birimler.get(o.paraBirimi) ?? 0n) + tutar);
  }
  const harcama =
    birimler.size === 0
      ? '—'
      : [...birimler.entries()].map(([birim, t]) => formatMoney(t.toString(), birim, { decimals: 0 })).join(' + ');
  return {
    uygulanabilir: acik.filter((o) => o.eylem !== null).length,
    harcama,
    yalnizBilgi: acik.filter((o) => o.eylem === null).length,
    buAyUygulanan: liste.buAyUygulanan,
    acik: acik.length,
  };
}

// ─── Tür çipleri ─────────────────────────────────────────────────────────────

export interface TurCipi {
  anahtar: string;
  etiket: string;
  sayi: number;
}

/**
 * ÇİPLER ETİKETE GÖRE: `butce_artir` ve `butce_azalt` kullanıcı için tek iş
 * ("Bütçe"); iki ayrı çip, aynı ada sahip iki düğme demek olurdu. Etiket
 * sözleşmeden (`ONERI_TURU_ETIKETI`), ekranda ayrıca yazılmıyor.
 */
export function turCipleri(oneriler: readonly Oneri[]): TurCipi[] {
  const sayac = new Map<string, number>();
  for (const o of oneriler) {
    const e = ONERI_TURU_ETIKETI[o.tur];
    sayac.set(e, (sayac.get(e) ?? 0) + 1);
  }
  return [
    { anahtar: 'hepsi', etiket: 'Tümü', sayi: oneriler.length },
    ...[...sayac.entries()].map(([etiket, sayi]) => ({ anahtar: etiket, etiket, sayi })),
  ];
}

export function turaGoreSuz(oneriler: readonly Oneri[], secili: string): Oneri[] {
  if (secili === 'hepsi') return [...oneriler];
  return oneriler.filter((o) => ONERI_TURU_ETIKETI[o.tur] === secili);
}

// ─── Eylem metinleri (düğme + onay penceresi) ───────────────────────────────

export interface EylemMetni {
  dugme: string;
  baslik: string;
  once: string;
  sonra: string;
  aciklama: string;
}

function butceMetni(mikros: string, birim: string, tip: 'daily' | 'lifetime'): string {
  const t = formatMoney(mikros, birim, { decimals: 0 });
  return tip === 'daily' ? `${t} / gün` : `${t} (toplam)`;
}

/**
 * "ŞİMDİ → SONRA" ÖNERİNİN KENDİ DEĞERLERİNDEN. Bütçe tutarı `eylem`
 * içindeki micros'tan biçimleniyor; kartta yazan bir cümleden ayrıştırmak,
 * sunucunun uygulayacağı sayı ile pencerenin gösterdiği sayıyı ayırabilirdi.
 */
export function eylemMetni(o: Pick<Oneri, 'eylem' | 'platform' | 'varlik' | 'paraBirimi'>): EylemMetni | null {
  const e = o.eylem;
  if (e === null) return null;
  if (e.tur === 'durdur') {
    const dugme = buyukHarf(`${SEVIYE_BELIRTME[o.platform][o.varlik.seviye]} durdur`);
    const kapsam =
      o.varlik.seviye === 'ad'
        ? 'Yalnız bu reklam durur; üst seviyeler çalışmaya devam eder.'
        : o.varlik.seviye === 'ad_group'
          ? `Bu ${seviyeAdi(o.platform, 'ad_group').toLocaleLowerCase('tr')} içindeki bütün reklamlar durur; kampanya çalışmaya devam eder.`
          : 'Kampanyanın bütün reklamları durur.';
    return {
      dugme,
      baslik: `${dugme}: onay`,
      once: 'Yayında',
      sonra: 'Duraklatıldı',
      aciklama: `${kapsam} İstediğin zaman Reklam Yöneticisi’nden yeniden başlatabilirsin.`,
    };
  }
  let artis: boolean;
  try {
    artis = BigInt(e.yeniMikros) > BigInt(e.oncekiMikros);
  } catch {
    return null;
  }
  const dugme = artis ? 'Bütçeyi artır' : 'Bütçeyi düşür';
  const once = butceMetni(e.oncekiMikros, o.paraBirimi, e.butceTipi);
  const sonra = butceMetni(e.yeniMikros, o.paraBirimi, e.butceTipi);
  const seviye = seviyeAdi(o.platform, e.butceSeviyesi).toLocaleLowerCase('tr');
  return {
    dugme,
    baslik: `${dugme}: onay`,
    once,
    sonra,
    aciklama: `${e.butceTipi === 'daily' ? 'Günlük' : 'Toplam'} bütçe ${once} yerine ${sonra} olur. Değişiklik bütçenin durduğu ${seviye} seviyesinde yapılır.`,
  };
}

// ─── Onay penceresi adımları ─────────────────────────────────────────────────

export type UygulamaAsamasi = 'hazir' | 'gonderiliyor' | 'dogrulandi' | 'uyusmadi' | 'degisti' | 'hata';
export type AdimHali = 'bos' | 'suruyor' | 'bitti' | 'uyari' | 'hata';

export function adimMetinleri(platform: Platform): [string, string, string] {
  const ek = PLATFORM_EKLERI[platform];
  return [`${ek.yonelme} gönder`, `${ek.ayrilma} geri oku ve karşılaştır`, 'Kaydet (kim, ne zaman, eski → yeni)'];
}

/**
 * ADIMLAR GERÇEĞİ GÖSTERİYOR, ZAMANLAYICIYI DEĞİL. Sunucu üç adımı TEK
 * istekte yapıyor ve ara durum bildirmiyor; taslaktaki gibi 650 ms'de bir
 * adım ilerletmek, henüz geri okunmamış bir değeri "okundu" diye
 * göstermek olurdu. İstek sürerken yalnız ilk adım dönüyor; cevap gelince
 * üçü birden kesinleşiyor. `uyusmadi`da ikinci adım UYARI: gönderildi ve
 * kaydedildi ama geri okunan değer istenen değil.
 */
export function adimHalleri(asama: UygulamaAsamasi): [AdimHali, AdimHali, AdimHali] {
  switch (asama) {
    case 'hazir':
      return ['bos', 'bos', 'bos'];
    case 'gonderiliyor':
      return ['suruyor', 'bos', 'bos'];
    case 'dogrulandi':
      return ['bitti', 'bitti', 'bitti'];
    case 'uyusmadi':
      return ['bitti', 'uyari', 'bitti'];
    case 'degisti':
    case 'hata':
      return ['hata', 'bos', 'bos'];
  }
}

/**
 * Uygula isteğinin hatası. 409 AYRI bir hâl: sunucu öneriyi yeniden
 * hesapladı ve ekrandaki hâli artık geçerli değil (bütçe başkası
 * tarafından değişti ya da öneri kalktı). Aynı düğmeye tekrar basmak yine
 * 409 alır; tek doğru eylem sayfayı yenilemek.
 */
export function uygulaHatasi(e: { status?: number; message?: string } | null | undefined): {
  asama: 'degisti' | 'hata';
  mesaj: string;
} {
  const mesaj = e?.message?.trim() || 'Bağlantı kurulamadı.';
  return e?.status === 409 ? { asama: 'degisti', mesaj } : { asama: 'hata', mesaj };
}

/**
 * UYGULA YANITI İKİ BİÇİMDE GELEBİLİR: sözleşme `UygulamaSonucu` diyor,
 * API servisi ise güncellenmiş `Oneri`yi (içinde `uygulama`) döndürüyor
 * (Ajan 2, `iyilestir.service.ts#uygula`). İkisi de kabul; ikisi de
 * değilse `null` ve ekran "sonuç okunamadı" der. Sonucu olmayan bir
 * yanıtı "doğrulandı" saymak, geri okuma kuralını ekranda çiğnemek olurdu.
 */
export function uygulamaSonucuCoz(yanit: unknown): UygulamaSonucu | null {
  const sonucMu = (x: unknown): x is UygulamaSonucu => {
    const d = (x as { durum?: unknown } | null)?.durum;
    return (d === 'dogrulandi' || d === 'uyusmadi') && typeof (x as { platformDegeri?: unknown }).platformDegeri === 'string';
  };
  if (sonucMu(yanit)) return yanit;
  const icteki = (yanit as { uygulama?: unknown } | null)?.uygulama;
  return sonucMu(icteki) ? icteki : null;
}

/** Uygula ve Yoksay uçlarının adresi; workspace sorguda (liste ucuyla aynı biçim). */
export function oneriEylemAdresi(o: Pick<Oneri, 'anahtar' | 'clientId'>, eylem: 'uygula' | 'yoksay'): string {
  return `/iyilestir/oneriler/${encodeURIComponent(o.anahtar)}/${eylem}?${new URLSearchParams({ clientId: o.clientId })}`;
}

/** Kartın altındaki uygulanmış satırı; `zamanMetni` çağıranın biçimi ("az önce"). */
export function sonucMetni(
  sonuc: UygulamaSonucu,
  platform: Platform,
  istenen: string | null,
  zamanMetni: string,
): { ton: 'ok' | 'uyari'; metin: string } {
  if (sonuc.durum === 'dogrulandi') {
    return { ton: 'ok', metin: `Uygulandı · ${PLATFORM_EKLERI[platform].bulunma} doğrulandı · ${zamanMetni}` };
  }
  return {
    ton: 'uyari',
    metin:
      `${PLATFORM_KISA_ADLARI[platform]} değişikliği kabul etti ama geri okunan değer farklı: ${sonuc.platformDegeri}` +
      (istenen ? ` (istenen: ${istenen})` : '') +
      ` · ${zamanMetni}`,
  };
}

/** Önerinin listedeki yerini değiştirmeden durumunu günceller. */
export function oneriGuncelle(oneriler: readonly Oneri[], anahtar: string, degisim: Partial<Pick<Oneri, 'durum' | 'uygulama'>>): Oneri[] {
  return oneriler.map((o) => (o.anahtar === anahtar ? { ...o, ...degisim } : o));
}

// ─── Mini grafik ─────────────────────────────────────────────────────────────

export const MINI = { W: 150, H: 64, P: 4 } as const;

/**
 * Taslağın `mini()` fonksiyonunun aynısı: iki seri, HER BİRİ KENDİ
 * ölçeğinde (sıklık 1-5, tıklama oranı 0-3; ortak ölçekte biri düz çizgi
 * olurdu). Düz seri ortadan geçiyor. Çizilemeyen seri `null`: boş bir SVG
 * "veri sıfır" gibi okunur, hiç çizmemek dürüst.
 */
export function miniYollar(seri: OneriSerisi | null): { a: string; b: string } | null {
  if (!seri) return null;
  const { a, b } = seri;
  if (a.length < 2 || a.length !== b.length) return null;
  if (![...a, ...b].every((v) => Number.isFinite(v))) return null;
  const { W, H, P } = MINI;
  const yol = (d: number[]): string => {
    const mn = Math.min(...d);
    const mx = Math.max(...d);
    return d
      .map((v, i) => {
        const x = P + ((W - 2 * P) * i) / (d.length - 1);
        const y = H - P - (H - 2 * P) * (mx === mn ? 0.5 : (v - mn) / (mx - mn));
        return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join('');
  };
  return { a: yol(a), b: yol(b) };
}

// ─── AI Asistan akışı ────────────────────────────────────────────────────────

const PARCA_TURLERI = new Set<AsistanParcasi['tur']>(['metin', 'arac', 'uygula_karti', 'devret', 'hata']);

function parcaMi(x: unknown): x is AsistanParcasi {
  const tur = (x as { tur?: unknown } | null)?.tur;
  if (typeof tur !== 'string' || !PARCA_TURLERI.has(tur as AsistanParcasi['tur'])) return false;
  // `metin` iki biçimde gelebiliyor (aşağıda); parça biçimi `metin` alanı taşır.
  return tur !== 'metin' || typeof (x as { metin?: unknown }).metin === 'string';
}

/**
 * SSE AKIŞI — sunucunun zarfı (`apps/api/.../asistan/dongu.ts#AsistanOlayi`):
 *
 *   `basladi` {mesajId}       tur açıldı (ekranda karşılığı yok)
 *   `metin`   {parca: string} model yazdıkça akan metin
 *   `parca`   {parca}         araç izi, Uygula kartı, devir, hata
 *   `bitti`   {mesaj}         turun KAYITLI hâli; ekrandaki birikimin yerine geçer
 *
 * Zarfsız bir `AsistanParcasi` da kabul ediliyor: zarf sözleşmede (shared)
 * değil, API'nin içinde tanımlı ve bir gün düz parça gönderilirse ekran
 * susmasın. Bozuk JSON ve tanınmayan olay SESSİZCE atılmıyor; ikisi de
 * sayılıyor ve ekran "N parça okunamadı" der: sunucu yeni bir olay türü
 * eklerse ekranın onu hiç göstermemesi, asistanın bir şey söyleyip
 * kullanıcının görmemesi demek. Yarım kalan son blok `kalan`da bekler.
 */
export function parcalariAyikla(tampon: string): {
  parcalar: AsistanParcasi[];
  bitti: AsistanMesaji | null;
  kalan: string;
  bozuk: number;
  taninmayan: number;
} {
  const bloklar = tampon.split('\n\n');
  const kalan = bloklar.pop() ?? '';
  const parcalar: AsistanParcasi[] = [];
  let bitti: AsistanMesaji | null = null;
  let bozuk = 0;
  let taninmayan = 0;
  for (const b of bloklar) {
    const veri = b
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trimStart())
      .join('\n');
    if (!veri) continue;
    let nesne: unknown;
    try {
      nesne = JSON.parse(veri);
    } catch {
      bozuk++;
      continue;
    }
    const o = nesne as { tur?: unknown; parca?: unknown; mesaj?: unknown } | null;
    if (o?.tur === 'basladi') continue;
    if (o?.tur === 'metin' && typeof o.parca === 'string') {
      parcalar.push({ tur: 'metin', metin: o.parca });
    } else if (o?.tur === 'parca' && parcaMi(o.parca)) {
      parcalar.push(o.parca);
    } else if (o?.tur === 'bitti' && o.mesaj && Array.isArray((o.mesaj as AsistanMesaji).parcalar)) {
      bitti = o.mesaj as AsistanMesaji;
    } else if (parcaMi(nesne)) {
      parcalar.push(nesne);
    } else {
      taninmayan++;
    }
  }
  return { parcalar, bitti, kalan, bozuk, taninmayan };
}

/**
 * TURUN KAYITLI HÂLİ ekrandaki birikimin YERİNE geçiyor: akan metin model
 * yazarken ham hâlde geliyor, kayıt ise görünür metni ayıklanmış hâlde
 * taşıyor. İkisini birleştirmek metni iki kez gösterirdi.
 */
export function turuBitir(mesajlar: readonly AsistanMesaji[], bitti: AsistanMesaji): AsistanMesaji[] {
  const son = mesajlar.at(-1);
  if (son && son.rol === 'asistan') return [...mesajlar.slice(0, -1), bitti];
  return [...mesajlar, bitti];
}

/**
 * Akıştaki parçayı asistanın SON mesajına ekler. Ardışık metin parçaları
 * birleşiyor: sunucu metni kelime kelime gönderebilir ve her biri ayrı
 * balon olursa ekran yüz balonluk bir merdiven olur.
 */
export function parcaEkle(mesajlar: readonly AsistanMesaji[], p: AsistanParcasi): AsistanMesaji[] {
  const son = mesajlar.at(-1);
  if (!son || son.rol !== 'asistan') return [...mesajlar];
  const parcalar = [...son.parcalar];
  const onceki = parcalar.at(-1);
  if (p.tur === 'metin' && onceki?.tur === 'metin') {
    parcalar[parcalar.length - 1] = { tur: 'metin', metin: onceki.metin + p.metin };
  } else {
    parcalar.push(p);
  }
  return [...mesajlar.slice(0, -1), { ...son, parcalar }];
}

export const ARAC_ETIKETI: Record<AsistanAraci, string> = {
  metrik_ozeti: 'Metrik özeti okundu',
  gunluk_seri: 'Günlük seri okundu',
  varlik_kirilimi: 'Kırılım okundu',
  donusum_detayi: 'Dönüşümler okundu',
  butce_temposu: 'Bütçe temposu okundu',
  oneriler: 'Öneriler hesaplandı',
  uygula_karti: 'Uygula kartı hazırlandı',
  advcampaign_devret: 'AdvCampaign’e aktarıldı',
};

/** Araç izinin etiketi: sunucunun özeti varsa o, yoksa sabit ad. */
export function aracIziMetni(p: Extract<AsistanParcasi, { tur: 'arac' }>): string {
  const ozet = p.ozet?.trim();
  if (ozet) return ozet;
  return (ASISTAN_ARACLARI as readonly string[]).includes(p.arac) ? ARAC_ETIKETI[p.arac] : p.arac;
}

/**
 * ADVCAMPAIGN'E DEVİR ADRESİ. Workspace `?musteri=` ile taşınıyor; taşınmazsa
 * üst barda başka bir workspace seçiliyken rehber yanlış workspace'te açılır.
 * `?oturum=` 2026-10-10'a kadar sohbet oturumunu açıyordu; sohbet kalktı ve
 * `reklam/page.tsx` bu parametreyi görünce isteğin rehberde yeniden
 * kurulacağını söylüyor (sessizce listeye düşmüyor).
 */
export function devretAdresi(clientId: string, oturumId: string): string {
  return `/reklam?${new URLSearchParams({ musteri: clientId, oturum: oturumId })}`;
}

/**
 * Asistanın "yazıyor" göstergesi: akış sürüyor VE son asistan mesajında
 * henüz hiç parça yok. Parça geldikten sonra göstergeyi bırakmak, metnin
 * altında üç noktanın sonsuza kadar zıplaması demek.
 */
export function yaziyorMu(akisSuruyor: boolean, mesajlar: readonly AsistanMesaji[]): boolean {
  if (!akisSuruyor) return false;
  const son = mesajlar.at(-1);
  return !!son && son.rol === 'asistan' && son.parcalar.length === 0;
}

/**
 * `/kurallar` → `/iyilestir?sekme=kurallar`. YALNIZ bilinen parametreler
 * taşınıyor (beyaz liste): eski adreste ne varsa aynen aktarmak, `sekme`
 * gibi bu sayfanın kendi anahtarını eski bir değerle ezebilirdi.
 */
export function iyilestirKurallarAdresi(params: Record<string, string | string[] | undefined>): string {
  const p = new URLSearchParams({ sekme: 'kurallar' });
  for (const k of ['musteri', 'kural'] as const) {
    const v = params[k];
    const d = Array.isArray(v) ? v[0] : v;
    if (d) p.set(k, d);
  }
  return `/iyilestir?${p}`;
}

// ─── Asistan metni: küçük, GÜVENLİ biçim çözümleyici ────────────────────────

/** Bir satır içi parça: kalın ya da düz. */
export interface MetinParcasi {
  kalin: boolean;
  metin: string;
}
export type MetinBlogu =
  | { tur: 'paragraf'; satirlar: MetinParcasi[][] }
  | { tur: 'liste'; ogeler: MetinParcasi[][] };

/**
 * MODELİN MARKDOWN'I ÇİĞ GÖRÜNÜYORDU: "**Harcama:**", "* madde" (canlı
 * denetim, 2026-10-09). HTML'e çevirip `dangerouslySetInnerHTML` ile basmak
 * modelin ürettiği her şeyi sayfaya enjekte etmek olurdu; bu çözümleyici
 * yalnız ÜÇ şeyi tanıyor (kalın, madde, başlık satırı) ve düz veri döndürüyor,
 * çizim React'te. Tanımadığı her şey düz metin kalır.
 */
export function metinBloklari(md: string): MetinBlogu[] {
  const bloklar: MetinBlogu[] = [];
  const satirCoz = (s: string): MetinParcasi[] => {
    const out: MetinParcasi[] = [];
    const re = /\*\*(.+?)\*\*/g;
    let son = 0;
    for (const m of s.matchAll(re)) {
      if (m.index! > son) out.push({ kalin: false, metin: s.slice(son, m.index) });
      out.push({ kalin: true, metin: m[1]! });
      son = m.index! + m[0].length;
    }
    if (son < s.length) out.push({ kalin: false, metin: s.slice(son) });
    return out;
  };
  for (const ham of md.replace(/\r/g, '').split('\n')) {
    const satir = ham.trimEnd();
    const madde = /^\s*[*•-]\s+(.*)$/.exec(satir);
    const baslik = /^\s*#{1,6}\s+(.*)$/.exec(satir);
    const son = bloklar.at(-1);
    if (madde) {
      const parca = satirCoz(madde[1]!);
      if (son?.tur === 'liste') son.ogeler.push(parca);
      else bloklar.push({ tur: 'liste', ogeler: [parca] });
    } else if (satir.trim() === '') {
      bloklar.push({ tur: 'paragraf', satirlar: [] });
    } else {
      const parca = baslik ? [{ kalin: true, metin: baslik[1]!.replace(/\*\*/g, '') }] : satirCoz(satir);
      if (son?.tur === 'paragraf') son.satirlar.push(parca);
      else bloklar.push({ tur: 'paragraf', satirlar: [parca] });
    }
  }
  return bloklar.filter((b) => (b.tur === 'paragraf' ? b.satirlar.length > 0 : b.ogeler.length > 0));
}
