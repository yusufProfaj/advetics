import {
  AMAC_ASAMASI,
  AMAC_OLCUTU,
  BAGLANTI_HALI_METNI,
  REHBER_AMACLARI,
  STRATEJI_ASAMALARI,
  STRATEJI_BELGE_BOLUMLERI,
  STRATEJI_GORUNUMLERI,
  STRATEJI_GORUNUM_IZINLERI,
  STRATEJI_ONAY_CUMLESI,
  STRATEJI_KAYNAK_ETIKETI,
  TAHMIN_YOK_METNI,
  belgeyeGirerMi,
  butceBol,
  onayTokenBicimiGecerli,
  type BaglantiHali,
  type KalemDurumu,
  type KalemPlatformDurumu,
  type KalemTahmini,
  type KaynakliMetin,
  type Permission,
  type RehberKonumu,
  type RehberPlatformu,
  type StratejiAsamasi,
  type StratejiDurumu,
  type StratejiGorunumu,
  type StratejiKalemi,
  type StratejiKalemiGirdisi,
} from '@advetics/shared';
import { formatDayShort } from '@/lib/format';
import { microsGirdiMetni, zamanMetni } from '../hesap';
import type { StratejiOnayKaydi } from './yanit';

/**
 * ═══ ADVSTRATEGY v2 — EKRANIN KARARLARI (SAF) ═══
 *
 * Panelde bileşen render eden test altyapısı yok (`vitest.config.ts`), yani
 * bir bileşenin içindeki karar yalnız kaynak taramasıyla sınanabilir ve o
 * tarama yanlış şeyi kilitleyebilir (CLAUDE.md `domaYazilmali` dersi). Hangi
 * görünüm monte edilir, para nasıl bölünür, tahmin nasıl yazılır, hangi
 * bölüm belgeye girer: hepsi burada ve `hesap.spec.ts` ÇALIŞTIRARAK sınıyor.
 */

// ─── Görünüm ─────────────────────────────────────────────────────────────────

/**
 * MONTE EDİLECEK görünümler. Kapı (`stratejiGorunumKapisi`) hangisinin
 * GÖSTERİLECEĞİNİ söylüyor; bu fonksiyon hangilerinin DOM'a gireceğini.
 * İkisi ayrı soru: görünümler arasında geçişte kaydedilmemiş taslak
 * kaybolmasın diye izinli üçü birden monte, ama müşteri hesabının ekranında
 * düzenleyici HİÇ monte edilmez (gizli bir düzenleyici de olsa, gizli
 * düğmesiyle bir istek atabilirdi ve sunucunun reddi tek savunma kalırdı).
 */
export function monteGorunumler(izinler: readonly Permission[]): StratejiGorunumu[] {
  return STRATEJI_GORUNUMLERI.filter((g) => STRATEJI_GORUNUM_IZINLERI[g].every((i) => izinler.includes(i)));
}

export const GORUNUM_ETIKETI: Record<StratejiGorunumu, string> = {
  duzenle: 'Strateji',
  belge: 'Müşterinin göreceği',
  aktar: 'AdvCampaign’e aktar',
};

// ─── Durum ───────────────────────────────────────────────────────────────────

export const STRATEJI_DURUM_ETIKETI: Record<StratejiDurumu, string> = {
  taslak: 'Taslak',
  onayda: 'Onay bekliyor',
  revizyon: 'Revizyon istendi',
  onaylandi: 'Onaylandı',
  kapandi: 'Kapandı',
  iptal: 'İptal edildi',
};

/** Kapakta filigran: onaylanmamış belge müşterinin elinde "son hâl" sanılmasın. */
export function filigran(durum: StratejiDurumu): string | null {
  switch (durum) {
    case 'taslak':
    case 'revizyon':
      return 'TASLAK';
    case 'onayda':
      return 'ONAY BEKLİYOR';
    case 'iptal':
      return 'İPTAL';
    case 'onaylandi':
    case 'kapandi':
      return null;
  }
}

/**
 * Onay cümlesi. Üç rol üç AYRI cümle (`STRATEJI_ONAY_CUMLESI`). Bağlantı
 * onayında ad ve e-posta kişinin BEYANI: cümle bunu gizlemiyor, doğrulanmış
 * bir kimlik gibi de göstermiyor.
 */
export function onayCumlesi(o: StratejiOnayKaydi | null): string | null {
  if (!o) return null;
  const kim = o.rol === 'baglanti' ? (o.ad ? ` · ${o.ad}${o.eposta ? ` (${o.eposta})` : ''}` : '') : o.kim ? ` · ${o.kim}` : '';
  return `${STRATEJI_ONAY_CUMLESI[o.rol]}${kim} · sürüm ${o.surum} · ${zamanMetni(o.zaman)}`;
}

/** Belgede gösterilecek bölümler: "Plan ve gerçekleşen" yalnız onaydan sonra. */
export function gorunurBolumler(durum: StratejiDurumu) {
  const onayli = durum === 'onaylandi' || durum === 'kapandi';
  return STRATEJI_BELGE_BOLUMLERI.filter((b) => !b.onaydanSonra || onayli);
}

/** Bölüm numarası kapak hariç iki haneli ("01"): panel ve PDF aynı sırada. */
export function bolumNumarasi(kod: string, durum: StratejiDurumu): string | null {
  if (kod === 'kapak') return null;
  const i = gorunurBolumler(durum).filter((b) => b.kod !== 'kapak').findIndex((b) => b.kod === kod);
  return i === -1 ? null : String(i + 1).padStart(2, '0');
}

/**
 * Belgeye girecek metin. `ai` öneri belgeye GİRMEZ (ajans "Kullan" demeden
 * müşteriye strateji diye gösterilmez); karar sözleşmenin `belgeyeGirerMi`.
 */
export function belgeMetni(m: KaynakliMetin | null | undefined): string | null {
  return m && belgeyeGirerMi(m) ? m.metin : null;
}

export function kaynakEtiketi(m: Pick<KaynakliMetin, 'kaynak'>): string {
  return STRATEJI_KAYNAK_ETIKETI[m.kaynak];
}

// ─── Para: platform payı ve aşama ───────────────────────────────────────────

/**
 * Kalemin platform tutarları `butceBol`dan (rehberle AYNI fonksiyon). Rehber
 * aktarımda aynı bölmeyi yapacak; ekranda ikinci bir bölme "Meta 36.000 ₺"
 * derken rehberde 35.999,99 ₺ görünmesi demekti.
 */
export function kalemPlatformTutarlari(k: Pick<StratejiKalemi, 'meta' | 'google' | 'metaPayi' | 'butceMicros'>, para: string): Record<RehberPlatformu, bigint> {
  const micros = BigInt(k.butceMicros);
  if (micros <= 0n || (!k.meta && !k.google)) return { meta: 0n, google: 0n };
  return butceBol(micros, { meta: k.meta, google: k.google }, k.metaPayi ?? 50, para);
}

export interface AsamaSatiri {
  asama: StratejiAsamasi;
  meta: bigint;
  google: bigint;
  toplam: bigint;
}

/** Aşama × platform. Aşama AMAÇTAN türer (`AMAC_ASAMASI`), kullanıcı seçmez. */
export function asamaDagilimi(kalemler: ReadonlyArray<Pick<StratejiKalemi, 'amac' | 'meta' | 'google' | 'metaPayi' | 'butceMicros'>>, para: string): AsamaSatiri[] {
  return STRATEJI_ASAMALARI.map((asama) => {
    let meta = 0n;
    let google = 0n;
    for (const k of kalemler) {
      if (AMAC_ASAMASI[k.amac] !== asama) continue;
      const t = kalemPlatformTutarlari(k, para);
      meta += t.meta;
      google += t.google;
    }
    return { asama, meta, google, toplam: meta + google };
  });
}

export function platformToplamlari(kalemler: ReadonlyArray<Pick<StratejiKalemi, 'meta' | 'google' | 'metaPayi' | 'butceMicros'>>, para: string): Record<RehberPlatformu, bigint> {
  let meta = 0n;
  let google = 0n;
  for (const k of kalemler) {
    const t = kalemPlatformTutarlari(k, para);
    meta += t.meta;
    google += t.google;
  }
  return { meta, google };
}

/** Dağıtılmamış (+) ya da aşım (−). Sessiz değil: tablonun altında yazılır. */
export function dagitilmamis(toplamMicros: string, kalemler: ReadonlyArray<Pick<StratejiKalemi, 'butceMicros'>>): bigint {
  return BigInt(toplamMicros) - kalemler.reduce((t, k) => t + BigInt(k.butceMicros), 0n);
}

/** Çubuk genişliği (%) — bigint oranı, iki ondalık. Payda sıfırsa 0. */
export function yuzde(pay: bigint, payda: bigint): number {
  if (payda <= 0n) return 0;
  return Number((pay * 10_000n) / payda) / 100;
}

// ─── Tahmin ─────────────────────────────────────────────────────────────────

const SAYI = new Intl.NumberFormat('tr-TR');

/**
 * Tahmin metni. VERİ YOKSA "Tahmin yok" ve NEDENİ (kullanıcı kararı 3): ne
 * varsayım aralığı ne ± yüzde. Tek ayın verisinde alt = üst ve bunu söyler.
 */
export function tahminMetni(t: KalemTahmini, amac: StratejiKalemi['amac']): { ana: string; alt: string; veri: boolean } {
  if (t.tur === 'yok') return { ana: 'Tahmin yok', alt: TAHMIN_YOK_METNI[t.neden].replace(/^Tahmin yok: /, ''), veri: false };
  const birim = AMAC_OLCUTU[amac].birim;
  const ana = t.altSonuc === t.ustSonuc ? `${SAYI.format(t.altSonuc)} ${birim}` : `${SAYI.format(t.altSonuc)}-${SAYI.format(t.ustSonuc)} ${birim}`;
  const alt = t.aySayisi === 1 ? 'Hesabınızın verisi · tek ay verisi' : `Hesabınızın verisi · son ${t.aySayisi} ay`;
  return { ana, alt, veri: true };
}

export interface BeklenenKutusu {
  olcut: string;
  birim: string;
  platform: RehberPlatformu;
  alt: number;
  ust: number;
}

/**
 * Özet kutularındaki "Beklenen". META VE GOOGLE TOPLANMAZ: iki platform
 * dönüşümü farklı tanım ve atıf penceresiyle sayıyor (YENIDEN-TASARIM § 1.3).
 * Toplama yalnız AYNI platform × AYNI ölçüt içinde (aynı tanım). Tahmini
 * olmayan kalem kutuya hiç girmez; kutu "yok" diye uydurulmaz.
 */
export function beklenenKutulari(kalemler: ReadonlyArray<Pick<StratejiKalemi, 'amac' | 'tahmin'>>): BeklenenKutusu[] {
  const harita = new Map<string, BeklenenKutusu>();
  for (const k of kalemler) {
    for (const p of ['meta', 'google'] as const) {
      const t = k.tahmin[p];
      if (!t || t.tur !== 'aralik') continue;
      const anahtar = `${t.olcut}|${p}`;
      const var_ = harita.get(anahtar);
      if (var_) {
        var_.alt += t.altSonuc;
        var_.ust += t.ustSonuc;
      } else {
        harita.set(anahtar, { olcut: t.olcut, birim: AMAC_OLCUTU[k.amac].birim, platform: p, alt: t.altSonuc, ust: t.ustSonuc });
      }
    }
  }
  return [...harita.values()];
}

// ─── Kalem ──────────────────────────────────────────────────────────────────

export const PLATFORM_ADI: Record<RehberPlatformu, string> = { meta: 'Meta', google: 'Google' };

export function amacAdi(amac: StratejiKalemi['amac']): string {
  return REHBER_AMACLARI[amac].ekranAdi;
}

/** "Meta %40 · Google %60", "Yalnız Meta". */
export function payMetni(k: Pick<StratejiKalemi, 'meta' | 'google' | 'metaPayi'>): string {
  if (k.meta && k.google) {
    const m = k.metaPayi ?? 50;
    return `Meta %${m} · Google %${100 - m}`;
  }
  return k.meta ? 'Yalnız Meta' : k.google ? 'Yalnız Google' : 'Platform yok';
}

/** "İzmir ili", "İzmir +2". Sessiz kesme yok: kaç tane daha olduğu yazılı. */
export function konumOzeti(konumlar: readonly Pick<RehberKonumu, 'etiket'>[]): string {
  if (konumlar.length === 0) return 'Bölge seçilmedi';
  const ilk = konumlar[0]!.etiket;
  return konumlar.length === 1 ? ilk : `${ilk} +${konumlar.length - 1}`;
}

export function yasMetni(min: number | null, max: number | null): string {
  if (min === null || max === null) return '18-65+';
  return `${min}-${max}${max === 65 ? '+' : ''}`;
}

/** "1 Kas - 31 Oca". Uzun tire YOK (panel metin dili). */
export function tarihAraligi(bas: string, bit: string): string {
  return `${formatDayShort(bas)} - ${formatDayShort(bit)}`;
}

const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/** "2026-11-01" + "2027-01-31" → "Kasım 2026 - Ocak 2027". Date'e çevrilmiyor. */
export function donemMetni(bas: string, bit: string): string {
  const ay = (g: string) => `${AY_ADLARI[Number(g.slice(5, 7)) - 1] ?? g.slice(5, 7)} ${g.slice(0, 4)}`;
  const a = ay(bas);
  const b = ay(bit);
  return a === b ? a : `${a} - ${b}`;
}

/** Kaç ay (1-3): başlangıç ve bitiş ayından, gün aritmetiği yok. */
export function aySayisi(bas: string, bit: string): number {
  return (Number(bit.slice(0, 4)) - Number(bas.slice(0, 4))) * 12 + Number(bit.slice(5, 7)) - Number(bas.slice(5, 7)) + 1;
}

/**
 * Yanıttaki kalem → düzenleyicinin girdisi. Bütçe micros DİZGESİNDEN geri
 * okunabilir metne (`microsGirdiMetni`): hiç dokunmadan kaydetmek aynı micros'u
 * üretmeli. Varlıklardan silinmiş olanlar ATILMAZ: atmak onaylanan seti
 * sessizce küçültürdü; aktarım onları `kaynak_silinmis` diye durdurur.
 */
export function kalemGirdisi(k: StratejiKalemi, para: string): StratejiKalemiGirdisi {
  return {
    id: k.id,
    amac: k.amac,
    meta: k.meta,
    google: k.google,
    metaPayi: k.meta && k.google ? (k.metaPayi ?? 50) : null,
    butce: microsGirdiMetni(k.butceMicros, para),
    baslangic: k.baslangic,
    bitis: k.bitis,
    konumlar: k.konumlar,
    yasMin: k.yasMin,
    yasMax: k.yasMax,
    kelimeGrubu: k.kelimeGrubu,
    varlikIdleri: k.varliklar.map((v) => v.id),
    metin: k.metin,
    kreatifYonergesi: k.kreatifYonergesi ? { metin: k.kreatifYonergesi.metin, kaynak: k.kreatifYonergesi.kaynak === 'ai' ? 'ai' : 'ajans' } : null,
    kitleTarifi: k.kitleTarifi ? { metin: k.kitleTarifi.metin, kaynak: k.kitleTarifi.kaynak === 'ai' ? 'ai' : 'ajans' } : null,
    not: k.not,
  };
}

/**
 * Platform kutusu değişince pay: iki platform açılırsa 50'den başlar (rehberin
 * varsayılanı), biri kapanırsa pay `null` olur. Sözleşme ikisini birlikte
 * istiyor; ekran ayrı ayrı yazsaydı "pay yalnız iki platformda" reddi
 * kullanıcıya kaydederken çıkardı.
 */
export function platformDegisti(k: StratejiKalemiGirdisi, p: RehberPlatformu, acik: boolean): StratejiKalemiGirdisi {
  const s = { ...k, [p]: acik };
  return { ...s, metaPayi: s.meta && s.google ? (k.metaPayi ?? 50) : null };
}

/** Yapay zekâ önerisini kullanmak = kaynak `ajans`. Metin değişmez. */
export function kullan<T extends { kaynak: 'ai' | 'ajans' }>(m: T): T {
  return { ...m, kaynak: 'ajans' };
}

// ─── Kalem durumu (rehberden türer) ─────────────────────────────────────────

export const KALEM_PLATFORM_ETIKETI: Record<KalemPlatformDurumu, string> = {
  taslakta: 'Taslakta',
  kuruluyor: 'Kuruluyor',
  incelemede: 'İncelemede',
  yayinda: 'Yayında',
  duraklatilmis: 'Duraklatılmış',
  sorunlu: 'Sorunlu',
  arsivlendi: 'Arşivlendi',
};

/** Yeşil nokta YALNIZ yayında (kılavuz: yeşil yalnız durum). */
export function kalemDurumSatirlari(d: KalemDurumu): Array<{ platform: RehberPlatformu | null; metin: string; nokta: 'ok' | 'uyari' | 'notr' }> {
  if (d.tur === 'aktarilmadi') return [{ platform: null, metin: 'Aktarılmadı', nokta: 'notr' }];
  return (Object.entries(d.platformlar) as Array<[RehberPlatformu, KalemPlatformDurumu]>).map(([p, x]) => ({
    platform: p,
    metin: `${KALEM_PLATFORM_ETIKETI[x]} · ${PLATFORM_ADI[p]}`,
    nokta: x === 'yayinda' ? 'ok' : x === 'sorunlu' ? 'uyari' : 'notr',
  }));
}

// ─── Takvim ─────────────────────────────────────────────────────────────────

const GUN_MS = 86_400_000;
const gun = (g: string) => Date.UTC(Number(g.slice(0, 4)), Number(g.slice(5, 7)) - 1, Number(g.slice(8, 10)));

/** Plan dönemi içinde kalemin çubuğu (%): sol ve genişlik. Dönem dışı kısım kırpılır. */
export function takvimCubugu(k: { baslangic: string; bitis: string }, plan: { baslangic: string; bitis: string }): { sol: number; genislik: number } {
  const p0 = gun(plan.baslangic);
  const toplam = (gun(plan.bitis) - p0) / GUN_MS + 1;
  const bas = Math.max(0, (gun(k.baslangic) - p0) / GUN_MS);
  const bit = Math.min(toplam, (gun(k.bitis) - p0) / GUN_MS + 1);
  if (toplam <= 0 || bit <= bas) return { sol: 0, genislik: 0 };
  return { sol: Math.round((bas / toplam) * 1000) / 10, genislik: Math.round(((bit - bas) / toplam) * 1000) / 10 };
}

/** Takvim başlığı: dönemin ayları ve her ayın genişliği (%). */
export function takvimAylari(plan: { baslangic: string; bitis: string }): Array<{ ad: string; genislik: number }> {
  const p0 = gun(plan.baslangic);
  const toplam = (gun(plan.bitis) - p0) / GUN_MS + 1;
  const sonuc: Array<{ ad: string; genislik: number }> = [];
  let y = Number(plan.baslangic.slice(0, 4));
  let m = Number(plan.baslangic.slice(5, 7));
  for (let i = 0; i < 4; i++) {
    const ayBas = Math.max(p0, Date.UTC(y, m - 1, 1));
    const aySon = Math.min(gun(plan.bitis), Date.UTC(y, m, 0));
    if (ayBas > gun(plan.bitis)) break;
    sonuc.push({ ad: AY_ADLARI[m - 1]!, genislik: Math.round((((aySon - ayBas) / GUN_MS + 1) / toplam) * 1000) / 10 });
    m += 1;
    if (m === 13) {
      m = 1;
      y += 1;
    }
  }
  return sonuc;
}

// ─── Halka grafiği ──────────────────────────────────────────────────────────

/** r = 70 halkada iki yay: Meta önce (saat 12'den), Google arkasından. */
export const HALKA_CEVRE = 2 * Math.PI * 70;

export function halkaYaylari(meta: bigint, google: bigint): { meta: number; google: number } {
  const t = meta + google;
  if (t <= 0n) return { meta: 0, google: 0 };
  const m = (yuzde(meta, t) / 100) * HALKA_CEVRE;
  return { meta: m, google: HALKA_CEVRE - m };
}

// ─── Girişsiz onay sayfası ──────────────────────────────────────────────────

/**
 * Bağlantı sayfasının hâli. Geçersiz, süresi dolmuş, iptal ve BULUNAMADI
 * AYNI cümle (`BAGLANTI_HALI_METNI`): var olan bir bağlantıyı tahmin
 * ettirmemek için (paylasim.ts kural 7). Biçimsiz token sunucuya hiç
 * sorulmaz.
 */
export const GECERSIZ_BAGLANTI_METNI = BAGLANTI_HALI_METNI.iptal;

export function tokenSorulmaliMi(token: string): boolean {
  return onayTokenBicimiGecerli(token);
}

export function baglantiMesaji(hal: BaglantiHali | 'bulunamadi'): string {
  return hal === 'bulunamadi' ? GECERSIZ_BAGLANTI_METNI : BAGLANTI_HALI_METNI[hal];
}

/**
 * Sunucu cevabından sayfanın hâli. 4xx'in HEPSİ (400 biçim, 403, 404, 410)
 * tek nötr cümle: hangisinin döndüğünü ayırt eden bir ekran, var olan bir
 * token'ı deneme yanılmayla bulduran bir kâhin olurdu. Yalnız iki istisna
 * ayrı yazılır, ikisi de bağlantının varlığı hakkında bilgi vermez: 429
 * (deneme sınırı, `ONAY_BAGLANTISI_DENEME_SINIRI`) ve 5xx / ağ (sunucu
 * cevap vermedi: "geçersiz" demek, geçerli bağlantısı olanı ajansı aramaya
 * gönderirdi).
 */
export type OnaySayfasiHali =
  | { tur: 'mesaj'; baslik: string; metin: string }
  | { tur: 'belge'; kararAcik: boolean; not: string | null };

export function onaySayfasiHali(status: number | null, govde: { hal: BaglantiHali; okunabilir: boolean; karar: boolean; belge: unknown } | null): OnaySayfasiHali {
  if (status === null || status >= 500) return { tur: 'mesaj', baslik: 'Belge şu an açılamıyor', metin: 'Sunucuya ulaşılamadı. Biraz sonra tekrar deneyin.' };
  if (status === 429) return { tur: 'mesaj', baslik: 'Çok fazla deneme', metin: 'Bu bağlantı kısa sürede çok kez açıldı. Birkaç dakika sonra tekrar deneyin.' };
  if (status >= 400 || !govde) return { tur: 'mesaj', baslik: GECERSIZ_BAGLANTI_METNI, metin: 'Ajansınızdan yeni bir bağlantı isteyebilirsiniz.' };
  if (!govde.okunabilir || !govde.belge) return { tur: 'mesaj', baslik: baglantiMesaji(govde.hal), metin: 'Ajansınızdan yeni bir bağlantı isteyebilirsiniz.' };
  return { tur: 'belge', kararAcik: govde.karar, not: govde.karar ? null : baglantiMesaji(govde.hal) || null };
}
