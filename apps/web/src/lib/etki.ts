import {
  DEGISIKLIK_YOLU_ADI,
  ENTITY_LEVEL_LABELS,
  ETKI,
  ETKI_DURUM_ADI,
  ETKI_SONUCU_ADI,
  PLATFORM_KISA_ADLARI,
  type DegisiklikYolu,
  type Etki,
  type EtkiAyrintisi,
  type EtkiBosNedeni,
  type EtkiListesi,
  type GunAraligi,
  type Dil,
  sec,
} from '@advetics/shared';
import { baglanti } from '@/lib/baglanti';
import { etkiSozlugu } from '@/dil/sozlukler/iyilestir-etki';
import { iyilestirSozlugu } from '@/dil/sozlukler/iyilestir';

/**
 * ═══ İYİLEŞTİR › ETKİSİ: SAF KARARLAR (Paket C, taslak `docs/etki/taslak.html`) ═══
 *
 * Ekranın her kararı burada ve ÇALIŞTIRILARAK sınanıyor (`etki.spec.ts`):
 * panelde bileşen render eden test altyapısı yok, effect içindeki bir
 * karar yalnız kaynak taramasıyla sınanabilirdi (CLAUDE.md).
 *
 * Tek cümle sunucudan (`etki.cumle`, şablon `etkiCumlesi`): ikinci bir
 * cümle üreticisi panelde doğduğu anda sunucununkinden ayrışır.
 */

export type EtkiGorunumu = 'hepsi' | 'acik' | 'kapali';

export function gorunumEtiketi(g: EtkiGorunumu, dil: Dil = 'tr'): string {
  return sec(etkiSozlugu, dil).gorunum[g];
}

export interface EtkiSorgusu {
  clientId: string;
  durum: EtkiGorunumu;
  varlikId?: string;
  yol?: DegisiklikYolu;
  sayfa: number;
}

/** Liste ucunun adresi; elle birleştirme yok (CLAUDE.md "bağlantıyı elle birleştirme"). */
export function etkiListeYolu(q: EtkiSorgusu): string {
  return baglanti('/etki', {
    clientId: q.clientId,
    durum: q.durum === 'hepsi' ? undefined : q.durum,
    varlikId: q.varlikId,
    yol: q.yol,
    sayfa: q.sayfa > 1 ? String(q.sayfa) : undefined,
  });
}

export function etkiAyrintiYolu(id: string): string {
  return `/etki/${encodeURIComponent(id)}`;
}

/** İyileştir'in Etkisi sekmesi (öneri kartının altındaki bağlantı ve bekleyen işler). */
export function etkiAdresi(clientId: string): string {
  return baglanti('/iyilestir', { musteri: clientId, sekme: 'etki' });
}

/**
 * Çağrı düşerse BOŞ LİSTE DEĞİL, sebebiyle bir hata: boş liste "değişiklik
 * yok" demek ve düşen bir çağrıyı "ölçülecek bir şey yok"a çevirirdi.
 */
export type EtkiSonucu = { durum: 'tamam'; liste: EtkiListesi } | { durum: 'hata'; mesaj: string };

/** DÖRT HÂL AYRI: yükleniyor, hata (sunucunun cümlesi), boş (nedeniyle), dolu. */
export type EtkiKutuHali = 'yukleniyor' | 'hata' | 'bos' | 'dolu';

export function etkiKutuHali(sonuc: EtkiSonucu | null): EtkiKutuHali {
  if (sonuc === null) return 'yukleniyor';
  if (sonuc.durum === 'hata') return 'hata';
  return sonuc.liste.etkiler.length === 0 ? 'bos' : 'dolu';
}

/**
 * Boş listenin cümlesi NEDENİYLE. "Keşif koşmadı", "değişiklik yok" ve
 * "süzgeç boş" üç ayrı iş: birincisinde beklenir, ikincisinde bir şey
 * uygulanır, üçüncüsünde süzgeç değiştirilir. Neden bilinmiyorsa (sunucu
 * bir kaynağı okuyamadı) cümle bunu söylüyor; "değişiklik yok" demiyor.
 */
export function bosMetni(neden: EtkiBosNedeni | null, dil: Dil = 'tr'): { baslik: string; metin: string; suzgec: boolean } {
  const d = sec(etkiSozlugu, dil).bos;
  switch (neden) {
    case 'kesif_kosmadi':
      return { baslik: d.kesifKosmadiBaslik, metin: d.kesifKosmadi, suzgec: false };
    case 'degisiklik_yok':
      return { baslik: d.degisiklikYokBaslik, metin: d.degisiklikYok(ETKI.kesifGeriyeGun), suzgec: false };
    case 'suzgec_bos':
      return { baslik: d.suzgecBosBaslik, metin: d.suzgecBos, suzgec: true };
    default:
      return { baslik: d.bilinmeyenBaslik, metin: d.bilinmeyen, suzgec: false };
  }
}

// ─── Satır ───────────────────────────────────────────────────────────────────

export type Nokta = 'yesil' | 'kirmizi' | 'gri' | 'bos';

/**
 * Sonuç rozeti. YEŞİL YALNIZ "iyileşti" (kılavuz: yeşil yalnız durum
 * noktası), kırmızı "kötüleşti", içi boş nokta "ölçüm bekleniyor", gri
 * halka geri kalan hepsi.
 */
export function sonucRozeti(e: Pick<Etki, 'durum' | 'sonuc'>): { nokta: Nokta; metin: string } {
  if (e.durum === 'bekliyor') return { nokta: 'bos', metin: ETKI_DURUM_ADI.bekliyor };
  if (e.durum === 'sonuclandi' && e.sonuc) {
    return { nokta: e.sonuc === 'iyilesti' ? 'yesil' : e.sonuc === 'kotulesti' ? 'kirmizi' : 'gri', metin: ETKI_SONUCU_ADI[e.sonuc] };
  }
  return { nokta: 'gri', metin: ETKI_DURUM_ADI[e.durum] };
}

/**
 * Gün ve ay adı ayrı ayrı: `15-28 Eylül` / `Sep 15-28` aynı ayda ay adını bir
 * kez yazıyor ve sıra dile göre değişiyor (TR "gün ay", EN "ay gün").
 */
function gunAy(gun: string, dil: Dil): { g: number; ay: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(gun);
  return m ? { g: Number(m[3]), ay: sec(etkiSozlugu, dil).aylar[Number(m[2]) - 1] ?? '' } : null;
}

/** `2026-09-29` → `29 Eylül` / `Sep 29`. Date'e çevirmeden (saat dilimi kayması). */
export function gunKisa(gun: string, dil: Dil = 'tr'): string {
  const x = gunAy(gun, dil);
  if (!x) return gun;
  return dil === 'en' ? `${x.ay} ${x.g}` : `${x.g} ${x.ay}`;
}

/** `15-28 Eylül` ya da `30 Eylül - 6 Ekim`. Uzun tire yok (panel metin dili). */
export function aralikMetni(a: GunAraligi, dil: Dil = 'tr'): string {
  // Grup sırası: [tamamı, yıl, ay, gün]. Aynı yıl ve ay ise ay adı bir kez yazılıyor.
  const [, yilBas, ayBas, gunBas] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(a.bas) ?? [];
  const [, yilSon, aySon] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(a.son) ?? [];
  if (ayBas && yilBas === yilSon && ayBas === aySon) {
    const son = gunAy(a.son, dil);
    if (son) return dil === 'en' ? `${son.ay} ${Number(gunBas)}-${son.g}` : `${Number(gunBas)}-${gunKisa(a.son, dil)}`;
  }
  return `${gunKisa(a.bas, dil)} - ${gunKisa(a.son, dil)}`;
}

export function satirBasligi(e: Pick<Etki, 'varlik' | 'degisiklikMetni'>): string {
  return `${e.varlik.ad} · ${e.degisiklikMetni}`;
}

/**
 * "29 Eylül · İyileştir önerisi · Ayşe Kaya · Meta". Kuralda kim = kural
 * adı ("Kural: Yorgun kreatif"). Durdurmada ölçülen ÜST varlık açıkça
 * yazılıyor: kullanıcı reklamı durdurdu ama sonuç reklam setinin; bunu
 * söylemeden "maliyet %18 düştü" demek neyin düştüğünü gizlerdi.
 */
export function satirYolu(
  e: Pick<Etki, 'gun' | 'yol' | 'kim' | 'platform' | 'varlik' | 'kapsam' | 'birlikteOlculen'>,
  dil: Dil = 'tr',
): string {
  const d = sec(etkiSozlugu, dil).yol;
  const p: string[] = [gunKisa(e.gun, dil)];
  if (e.yol === 'kural') p.push(e.kim ? d.kural(e.kim) : DEGISIKLIK_YOLU_ADI.kural);
  else {
    p.push(DEGISIKLIK_YOLU_ADI[e.yol]);
    if (e.kim) p.push(e.kim);
  }
  if (e.kapsam.id !== e.varlik.id) {
    // Seviye adı İyileştir sözlüğündeki platform tablosundan (EN'de Türkçe kalmasın);
    // tabloda olmayan seviye (hesap) shared'daki adına düşüyor.
    const tablo = sec(iyilestirSozlugu, dil).seviye[e.platform] as Record<string, { ad: string }>;
    const ad = tablo[e.kapsam.seviye]?.ad ?? ENTITY_LEVEL_LABELS[e.platform][e.kapsam.seviye];
    p.push(d.olculen(e.kapsam.ad, ad.toLocaleLowerCase(dil === 'en' ? 'en' : 'tr')));
  }
  if (e.birlikteOlculen > 0) p.push(d.birlikte(e.birlikteOlculen + 1));
  p.push(PLATFORM_KISA_ADLARI[e.platform]);
  return p.join(' · ');
}

/**
 * Tek cümlenin arkasına eklenen olgular: kontrolsüz durdurmanın gözlemi ve
 * tıklama maliyetine düşülmesi. İkisi de kullanıcının bilmesi gereken bir
 * kısıt; ayrıntı panelinde saklı kalsa sonuç olduğundan kesin okunurdu.
 */
export function ekCumleler(e: Pick<Etki, 'gozlem' | 'metrik' | 'durum'>, dil: Dil = 'tr'): string[] {
  const d = sec(etkiSozlugu, dil).ek;
  const r: string[] = [];
  if (e.gozlem) r.push(d.gozlem(e.gozlem.onceGunlukHarcama, e.gozlem.sonraGunlukHarcama));
  if (e.metrik === 'tiklama_basi_maliyet') {
    r.push(e.durum === 'sonuclandi' ? d.tiklamaBitti : d.tiklamaSuruyor);
  }
  return r;
}

/** Ayrıntı düğmesi yalnız gösterilecek kanıt varsa (öncesi/sonrası ölçüldü). */
export function ayrintiVar(e: Pick<Etki, 'once' | 'sonra'>): boolean {
  return e.once !== null && e.sonra !== null;
}

export interface KanitKutusu {
  baslik: string;
  deger: string;
  alt: string;
}

const yuzde = (x: number) => `%${x < 0 ? '-' : ''}${Math.round(Math.abs(x) * 100)}`;
const sayi = (n: number, dil: Dil) => n.toLocaleString(dil === 'en' ? 'en-US' : 'tr-TR', { maximumFractionDigits: 1 });

/** Ayrıntının üç kutusu: önce, sonra, kontrol değişimi. Değer yoksa "ölçülemedi" yazar, uydurmaz. */
export function kanitKutulari(e: Pick<Etki, 'once' | 'sonra' | 'kontrolMetni' | 'kontrolDegisimi'>, dil: Dil = 'tr'): KanitKutusu[] {
  const d = sec(etkiSozlugu, dil).kanit;
  const r: KanitKutusu[] = [];
  if (e.once) r.push({ baslik: d.once(aralikMetni(e.once.aralik, dil)), deger: e.once.deger ?? d.olculemedi, alt: d.alt(sayi(e.once.tiklama, dil), sayi(e.once.donusum, dil)) });
  if (e.sonra) r.push({ baslik: d.sonra(aralikMetni(e.sonra.aralik, dil)), deger: e.sonra.deger ?? d.olculemedi, alt: d.alt(sayi(e.sonra.tiklama, dil), sayi(e.sonra.donusum, dil)) });
  if (e.kontrolMetni) {
    r.push({ baslik: e.kontrolMetni, deger: e.kontrolDegisimi === null ? d.olculemedi : yuzde(e.kontrolDegisimi), alt: d.ayniDonem });
  }
  return r;
}

/** Ayrıntının dipnotu. Platform dışı değişiklik uyarısı HER sonuçta (MIMARI Ç-C7). */
export function dipnot(e: Pick<Etki, 'metrik' | 'noktaGun'>, dil: Dil = 'tr'): string {
  const d = sec(etkiSozlugu, dil).dipnot;
  const metrik = e.metrik === 'tiklama_basi_maliyet' ? d.metrikTiklama : d.metrikDonusum;
  const pencere = e.noktaGun ? d.pencere(e.noktaGun) : '';
  return d.cumle(metrik, pencere, ETKI.donusumBeklemeGun);
}

// ─── Özet şeridi ─────────────────────────────────────────────────────────────

export interface EtkiOzeti {
  sonuclanan: number;
  olculuyor: number;
  olculemedi: number;
  /**
   * İyileşen / kötüleşen YALNIZ liste eksiksizse sayılıyor. Sunucu durum
   * başına sayı veriyor, sonuç başına değil; sayfalı bir listeden saymak
   * "4 iyileşen" derken 50'den sonrakileri sessizce dışarıda bırakırdı.
   */
  iyilesen: number | null;
  kotulesen: number | null;
  /** Ekrandaki listedeki en yakın ölçüm günü; liste eksikse yine en yakın GÖRÜNEN. */
  siradaki: string | null;
}

export function etkiOzeti(liste: EtkiListesi, gorunum: EtkiGorunumu): EtkiOzeti {
  const tam = gorunum === 'hepsi' && liste.etkiler.length === liste.toplam;
  const siradaki =
    liste.etkiler
      .map((e) => e.sonrakiOlcum)
      .filter((g): g is string => g !== null)
      .sort()[0] ?? null;
  return {
    sonuclanan: liste.sayilar.sonuclandi,
    olculuyor: liste.sayilar.bekliyor + liste.sayilar.olcumde,
    olculemedi: liste.sayilar.olculemedi,
    iyilesen: tam ? liste.etkiler.filter((e) => e.sonuc === 'iyilesti').length : null,
    kotulesen: tam ? liste.etkiler.filter((e) => e.sonuc === 'kotulesti').length : null,
    siradaki,
  };
}

// ─── Mini grafik ─────────────────────────────────────────────────────────────

export const ETKI_GRAFIK = { W: 300, H: 120, UST: 6, ALT: 110 } as const;

/**
 * Deney ve kontrol çizgisi, değişiklik günü dikey çizgi. Boş gün çizgiyi
 * KESİYOR (`M` ile yeniden başlıyor): ara günü komşudan uydurmak, metriği
 * olmayan bir günü varmış gibi gösterirdi. Çizilecek tek nokta yoksa `null`.
 */
export function etkiGrafikYollari(seri: NonNullable<EtkiAyrintisi['seri']>): { deney: string; kontrol: string | null; degisiklikX: number | null } | null {
  const { W, UST, ALT } = ETKI_GRAFIK;
  const hepsi = [...seri.deney, ...seri.kontrol].filter((v): v is number => v !== null);
  if (hepsi.length === 0) return null;
  const enAz = Math.min(...hepsi);
  const enCok = Math.max(...hepsi);
  const fark = enCok - enAz || 1;
  const n = seri.gunler.length;
  const x = (i: number) => (n <= 1 ? W / 2 : Math.round((i / (n - 1)) * W * 10) / 10);
  const y = (v: number) => Math.round((ALT - ((v - enAz) / fark) * (ALT - UST)) * 10) / 10;
  const yol = (vs: Array<number | null>) => {
    let d = '';
    let kalem = false;
    vs.forEach((v, i) => {
      if (v === null) {
        kalem = false;
        return;
      }
      d += `${kalem ? 'L' : 'M'}${x(i)},${y(v)} `;
      kalem = true;
    });
    return d.trim();
  };
  const i = seri.gunler.indexOf(seri.degisiklikGunu);
  const kontrolVar = seri.kontrol.some((v) => v !== null);
  return { deney: yol(seri.deney), kontrol: kontrolVar ? yol(seri.kontrol) : null, degisiklikX: i < 0 ? null : x(i) };
}

// ─── Öneri kartının altı ─────────────────────────────────────────────────────

export interface KartEtkiSatiri {
  nokta: Nokta;
  metin: string;
  /** Sonuç ya da ölçüm bilgisi var mı; yoksa bağlantı gösterilmiyor. */
  bagli: boolean;
}

/**
 * Uygulanmış öneri kartının altındaki tek satır. Etki satırı ÖNERİ
 * ANAHTARIYLA (`yolRef`) bulunuyor: aynı varlığa başka bir yoldan yapılmış
 * değişikliği bu önerinin sonucu gibi göstermek yanlış olurdu.
 *
 * Dört hâl: liste okunamadı (sunucunun cümlesi), satır henüz yok (keşif
 * sabah koşuyor; bugün uygulanan yarın görünür), bekliyor/ölçülüyor,
 * sonuç. Satır yokken "ölçülmeyecek" demek yanlış olurdu.
 */
export function kartEtkiSatiri(sonuc: EtkiSonucu | null, anahtar: string, dil: Dil = 'tr'): KartEtkiSatiri {
  const d = sec(etkiSozlugu, dil).kart;
  if (sonuc === null) return { nokta: 'bos', metin: d.yukleniyor, bagli: false };
  if (sonuc.durum === 'hata') return { nokta: 'gri', metin: d.alinamadi(sonuc.mesaj), bagli: false };
  const e = sonuc.liste.etkiler.find((x) => x.yol === 'iyilestir' && x.yolRef === anahtar);
  if (!e) return { nokta: 'bos', metin: d.henuz, bagli: false };
  const r = sonucRozeti(e);
  return { nokta: r.nokta, metin: e.cumle, bagli: true };
}
