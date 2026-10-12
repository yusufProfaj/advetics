/**
 * ADVCAMPAIGN GİRİŞ EKRANININ SAF MANTIĞI (`/reklam`, 2026-10-12).
 *
 * Kullanıcının şikâyeti: "ilk girişi çok kötü ve görüntü kirliliği hiç bir
 * şey anlaşılmıyor ve silinmiyor". Canlıda Ege Birlik Yapı'da 24 satır tek
 * listedeydi: 13'ü platformda arşivlenmiş/kaldırılmış ama yayındakilerle
 * karışık, altı "Siteme gelsinler" birbirinden ayırt edilemiyor, yarım
 * taslaklar ("Amaç seçilmedi · Platform seçilmedi · 1 eksik") arada.
 *
 * Google Ads'in kampanya durum süzgeci mantığı: üç sekme. Karar burada,
 * bileşenin dışında: panelde bileşen render eden test altyapısı yok
 * (`vitest.config.ts`) ve effect/JSX içindeki karar yalnız kaynak taramasıyla
 * sınanabiliyordu.
 */
import { REHBER_AMACLARI, REHBER_AMAC_KODLARI, type RehberAmacKodu, type RehberOzeti } from '@advetics/shared';
import { yayinSonucu, yayinSonucuEtiketi } from '@/components/rehber/rehber-mantik';

export const GIRIS_SEKMELERI = ['yayindakiler', 'taslaklar', 'arsiv'] as const;
export type GirisSekmesi = (typeof GIRIS_SEKMELERI)[number];

export const SEKME_ADLARI: Readonly<Record<GirisSekmesi, string>> = {
  yayindakiler: 'Yayındakiler',
  taslaklar: 'Taslaklar',
  arsiv: 'Arşiv',
};

/**
 * Boş sekme NEDENİNİ söyler (sessiz boş liste yok). "Yeni reklam" düğmesi
 * metnin yanında; burada yalnız cümle.
 */
export const BOS_SEKME_METNI: Readonly<Record<GirisSekmesi, string>> = {
  yayindakiler: 'Henüz yayına aldığın reklam yok.',
  taslaklar: 'Yarım kalmış taslağın yok.',
  arsiv: 'Arşiv boş. Listeden kaldırdığın ve platformda kapatılan reklamlar burada görünür.',
};

/**
 * Satır hangi sekmede:
 * - rehberin kendisi arşivde (listeden kaldırıldı / taslak silindi) → Arşiv;
 * - taslak → Taslaklar;
 * - yayına gitmiş ve platformdaki HER kurulum arşivlenmiş/kaldırılmış → Arşiv.
 *   Rehberin durumu "Vazgeç ve arşivle"den sonra da `yayinda` kalıyor; bu
 *   satırlar canlıda yayındakilerin arasındaydı.
 * - kalan her şey (yayında, duraklatılmış, kısmen kurulmuş, kurulamamış) →
 *   Yayındakiler. Kurulamamış satır ARŞİVE GİTMEZ: hata gözden kaybolmamalı,
 *   kullanıcı "Listeden kaldır" ile kendisi kaldırır.
 */
export function satirSekmesi(r: Pick<RehberOzeti, 'durum' | 'yayinlar'>): GirisSekmesi {
  if (r.durum === 'arsivlendi') return 'arsiv';
  if (r.durum === 'taslak') return 'taslaklar';
  if (r.yayinlar.length > 0 && r.yayinlar.every((y) => yayinSonucu(y) === 'arsivlendi')) return 'arsiv';
  return 'yayindakiler';
}

export function sekmeyeAyir<T extends Pick<RehberOzeti, 'durum' | 'yayinlar'>>(satirlar: readonly T[]): Record<GirisSekmesi, T[]> {
  const g: Record<GirisSekmesi, T[]> = { yayindakiler: [], taslaklar: [], arsiv: [] };
  for (const r of satirlar) g[satirSekmesi(r)].push(r);
  return g;
}

/**
 * Adreste geçerli sekme yoksa İŞİ OLAN sekme: önce Yayındakiler (giren
 * kişinin ilk sorusu "neler yayında"), boşsa Taslaklar. İkisi de boşsa
 * Taslaklar: "Yeni reklam" çağrısı orada.
 */
export function aktifSekme(param: string | undefined, gruplar: Record<GirisSekmesi, readonly unknown[]>): GirisSekmesi {
  if (param && (GIRIS_SEKMELERI as readonly string[]).includes(param)) return param as GirisSekmesi;
  return gruplar.yayindakiler.length > 0 ? 'yayindakiler' : 'taslaklar';
}

const GUN_MS = 86_400_000;

/**
 * ESKİ TASLAK: amacı hiç seçilmemiş ve bir günden uzun süredir duran, ya da
 * bir haftadır dokunulmamış ve hâlâ eksiği olan taslak. Bunlar Taslaklar
 * sekmesinin ALTINDA, soluk ve topluca silinebilir; SESSİZCE silinmez.
 * Bir saat önce açılıp yarım bırakılan taslak eski sayılmaz: "Yeni reklam"a
 * basıp listeye dönen kişi işini altta soluk görmemeli.
 */
export function eskiTaslakMi(r: Pick<RehberOzeti, 'durum' | 'amac' | 'eksikSayisi' | 'updatedAt'>, simdi: number): boolean {
  if (r.durum !== 'taslak') return false;
  const yas = simdi - new Date(r.updatedAt).getTime();
  if (r.amac === null && yas >= GUN_MS) return true;
  return yas >= 7 * GUN_MS && r.eksikSayisi > 0;
}

export function taslaklariAyir<T extends Pick<RehberOzeti, 'durum' | 'amac' | 'eksikSayisi' | 'updatedAt'>>(
  taslaklar: readonly T[],
  simdi: number,
): { guncel: T[]; eski: T[] } {
  const guncel: T[] = [];
  const eski: T[] = [];
  for (const r of taslaklar) (eskiTaslakMi(r, simdi) ? eski : guncel).push(r);
  return { guncel, eski };
}

export function amacAdi(amac: string | null): string {
  return amac && (REHBER_AMAC_KODLARI as readonly string[]).includes(amac) ? REHBER_AMACLARI[amac as RehberAmacKodu].ekranAdi : 'Amaç seçilmedi';
}

/**
 * Satırın adı. Yayına gitmişse platformdaki kampanya adı (Reklam
 * Yöneticisi'nde ve Meta/Google'da aranan ad, kodu ile); taslakta amaç ve
 * oluşturma tarihi. Altı "Siteme gelsinler" ancak böyle ayrışıyor.
 */
export function satirAdi(r: Pick<RehberOzeti, 'yayinAdi' | 'amac' | 'createdAt'>, tarih: (iso: string) => string): string {
  return r.yayinAdi ?? `${amacAdi(r.amac)} · ${tarih(r.createdAt)}`;
}

export type RozetTonu = 'iyi' | 'hata' | 'notr';

export interface PlatformRozeti {
  platform: 'meta' | 'google';
  etiket: string;
  ton: RozetTonu;
  /** Yalnız hata rozetinde: platformun ya da sunucunun kısa sebebi. */
  ipucu: string | null;
}

const PLATFORM_ADI = { meta: 'Meta', google: 'Google' } as const;

/**
 * Platform başına TEK rozet ("Meta: Yayında", "Google: Kurulamadı").
 * Söz son ekranla aynı üreticiden (`yayinSonucuEtiketi`). Yeşil yalnız
 * yayında olan için (durum göstergesi), kırmızı yalnız hata için.
 */
export function platformRozetleri(r: Pick<RehberOzeti, 'durum' | 'platformlar' | 'yayinlar'>): PlatformRozeti[] {
  if (r.yayinlar.length === 0) return [];
  return r.yayinlar.map((y) => {
    const sonuc = yayinSonucu(y);
    const hata = sonuc === 'hata' || y.durum === 'dogrulanamadi';
    return {
      platform: y.platform,
      etiket: `${PLATFORM_ADI[y.platform]}: ${yayinSonucuEtiketi(y)}`,
      ton: hata ? 'hata' : sonuc === 'yayinda' ? 'iyi' : 'notr',
      ipucu: hata ? kisaSebep(y.sebep) : null,
    };
  });
}

/** Sebep ipucu tek satır: uzun platform mesajı satırı taşırmasın (tamamı `title`da). */
export function kisaSebep(sebep: string | null, sinir = 90): string | null {
  if (!sebep) return null;
  const tek = sebep.replace(/\s+/g, ' ').trim();
  return tek.length > sinir ? `${tek.slice(0, sinir - 1)}…` : tek;
}

/** Taslağın platform özeti: "Meta + Google" ya da seçilmemişse null (gürültü yazılmaz). */
export function taslakPlatformlari(r: Pick<RehberOzeti, 'platformlar'>): string | null {
  const p = [r.platformlar.meta && 'Meta', r.platformlar.google && 'Google'].filter(Boolean);
  return p.length ? p.join(' + ') : null;
}

export type SatirEylemi = 'taslagi_sil' | 'listeden_kaldir' | 'geri_getir';

/**
 * Satır menüsü (⋯). Platforma dokunan HİÇBİR eylem yok: listeden kaldırmak
 * rehberi arşivler, kampanya platformda olduğu gibi kalır (onay penceresi
 * bunu yazıyor). Rehberi zaten yayında olan ama platformda arşivlenmiş satır
 * Arşiv sekmesinde menüsüz: yapılacak iş yok, "Gör" yeterli.
 */
export function satirEylemleri(r: Pick<RehberOzeti, 'durum' | 'yayinlar'>): SatirEylemi[] {
  if (r.durum === 'arsivlendi') return ['geri_getir'];
  if (r.durum === 'taslak') return ['taslagi_sil'];
  return satirSekmesi(r) === 'arsiv' ? [] : ['listeden_kaldir'];
}

/** Tek birincil eylem: taslakta "Devam et", gerisinde "Gör". */
export function birincilEylem(r: Pick<RehberOzeti, 'durum'>): string {
  return r.durum === 'taslak' ? 'Devam et' : 'Gör';
}

export interface OnayMetni {
  baslik: string;
  govde: string;
  dugme: string;
  suruyor: string;
  /** Pencerede Reklam Yöneticisi bağlantısı gösterilsin mi (platformdaki kampanyayı durdurmanın yeri). */
  yoneticiBaglantisi: boolean;
}

/**
 * ONAY PENCERESİ METİNLERİ. "Listeden kaldır" platforma DOKUNMUYOR ve bunu
 * açıkça söylemek zorunda: "kaldır" kelimesini gören kişi kampanyanın da
 * durduğunu sanıp harcamanın sürdüğünü fark etmeyebilir. Durdurmanın yeri
 * Reklam Yöneticisi; pencere oraya bağlanıyor.
 */
export const ONAY_METINLERI: Readonly<Record<'taslagi_sil' | 'listeden_kaldir' | 'toplu_sil', OnayMetni>> = {
  taslagi_sil: {
    baslik: 'Taslağı sil',
    govde: 'Bu taslak silinecek. Fikrini değiştirirsen Arşiv sekmesinden geri getirebilirsin.',
    dugme: 'Taslağı sil',
    suruyor: 'Siliniyor…',
    yoneticiBaglantisi: false,
  },
  listeden_kaldir: {
    baslik: 'Listeden kaldır',
    govde:
      'Reklam bu listeden kaldırılıp Arşiv’e taşınır. Meta ve Google’daki kampanyalar olduğu gibi kalır; yayındaysa harcama sürer. Durdurmak için Reklam Yöneticisi’ni kullan.',
    dugme: 'Listeden kaldır',
    suruyor: 'Kaldırılıyor…',
    yoneticiBaglantisi: true,
  },
  toplu_sil: {
    baslik: 'Eski taslakları sil',
    govde: 'Bu taslakların hepsi silinecek. Arşiv sekmesinden tek tek geri getirebilirsin.',
    dugme: 'Hepsini sil',
    suruyor: 'Siliniyor…',
    yoneticiBaglantisi: false,
  },
};

/**
 * Toplu işlemin sonucu: kısmi başarısızlık SESSİZ olamaz. Kaç tanesinin
 * işlendiği ve ilk hatanın metni yazılır; hepsi geçtiyse null.
 */
export function topluSonucMetni(toplam: number, hatalar: readonly string[]): string | null {
  if (hatalar.length === 0) return null;
  return `${toplam - hatalar.length} / ${toplam} işlendi. İşlenemeyen ${hatalar.length} kayıt: ${hatalar[0]}`;
}

/** Bütçe sözü: "₺250 / gün" ya da "₺1.000 toplam". */
export function butceMetni(b: RehberOzeti['butce'], para: (micros: string, birim: string) => string): string | null {
  if (!b) return null;
  return b.tip === 'gunluk' ? `${para(b.micros, b.paraBirimi)} / gün` : `${para(b.micros, b.paraBirimi)} toplam`;
}
