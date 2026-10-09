import type { NavEntry } from '@/components/nav';

/**
 * ═══ İKON RAYI: SAF KARARLAR (2026-10-09) ═══
 *
 * Kabuk Google Ads'in kullanım mantığıyla kuruldu (kullanıcı: "görünüş
 * Advetics'in, kullanım mantığı Google Ads'in"): solda dar bir ikon rayı,
 * her bölüm bir ikon + altında adı, çok sayfalı bölüm yanda açılan bir panel.
 * Kararlar burada ve test ediliyor; bileşen yalnız çiziyor. Panelde bileşen
 * render eden test altyapısı yok (bilinçli), effect içindeki bir karar ancak
 * kaynak taramasıyla sınanabilirdi.
 */

/** Bölümün raydaki ikonu. Başlıksız bölümün öğeleri kendi ikonunu taşıyor. */
const BOLUM_IKONU: Record<string, NavEntry['icon']> = {
  Planla: 'plan',
  Oluştur: 'create',
  Yönet: 'explorer',
  İyileştir: 'health',
  Raporlar: 'reports',
  Base: 'brand',
  Ayarlar: 'settings',
};

/** Raydaki bir satır: ya doğrudan bir sayfaya gider ya da panel açar. */
export type RayOgesi =
  | { tur: 'baglanti'; anahtar: string; etiket: string; ikon: NavEntry['icon']; oge: NavEntry }
  | { tur: 'panel'; anahtar: string; etiket: string; ikon: NavEntry['icon']; ogeler: NavEntry[] };

/**
 * Bölümlerden ray satırları.
 *
 * - Başlıksız bölümün (Genel Bakış) her öğesi kendi satırı.
 * - TEK sayfalı bölüm DOĞRUDAN o sayfaya gider; tek satırlık bir panel her
 *   gidişe boşa bir tık ekler. Müşteri hesabında Planla (yalnız AdvStrategy)
 *   ve Yönet (yalnız Reklam Keşfi) böyle; menü ona göre kendiliğinden
 *   sadeleşiyor.
 * - Çok sayfalı bölüm panel açar.
 * - "Oluştur" rayda ayrı bir satır DEĞİL: Google Ads'teki gibi en üstteki
 *   + düğmesi (`olusturOgeleri`). İki kapı aynı listeyi gösterirdi.
 */
export function rayOgeleri(bolumler: ReadonlyArray<{ title?: string; items: NavEntry[] }>): RayOgesi[] {
  const out: RayOgesi[] = [];
  for (const b of bolumler) {
    if (b.title === 'Oluştur' || b.items.length === 0) continue;
    if (!b.title) {
      for (const oge of b.items) out.push({ tur: 'baglanti', anahtar: oge.href, etiket: oge.label, ikon: oge.icon, oge });
      continue;
    }
    const ikon = BOLUM_IKONU[b.title] ?? b.items[0]!.icon;
    if (b.items.length === 1) {
      out.push({ tur: 'baglanti', anahtar: b.title, etiket: b.title, ikon, oge: b.items[0]! });
    } else {
      out.push({ tur: 'panel', anahtar: b.title, etiket: b.title, ikon, ogeler: b.items });
    }
  }
  return out;
}

/** + Oluştur düğmesinin listesi; boşsa (müşteri hesabı) düğme hiç çizilmiyor. */
export function olusturOgeleri(bolumler: ReadonlyArray<{ title?: string; items: NavEntry[] }>): NavEntry[] {
  return bolumler.find((b) => b.title === 'Oluştur')?.items ?? [];
}

/**
 * ═══ PANEL DURUMU ═══
 *
 * Google Ads paneli üzerine gelince açıyor; aynı davranışı tıklamayla da
 * vermek gerekiyor (dokunmatik, klavye). İkisi birlikte iki klasik hata
 * üretir ve ikisi de burada kapalı:
 *
 * 1. "Gelince açıldı, tıklayınca kapandı": fareyle gelip tıklayan kullanıcı
 *    paneli kapatmış olurdu. Üzerine gelmeyle açılmış panele tıklamak onu
 *    SABİTLER, kapatmaz.
 * 2. "Tıklayıp açtım, fareyi çekince kapandı": tıklamayla açılan panel
 *    fare ayrılınca kapanmaz; dışarı tıklama, Esc, sayfa değişimi kapatır.
 */
export interface PanelDurumu {
  acik: string | null;
  acilis: 'uzerine' | 'tik' | null;
}

export type PanelOlayi =
  | { tur: 'uzerine'; anahtar: string }
  | { tur: 'tik'; anahtar: string }
  | { tur: 'ayril' }
  | { tur: 'kapat' };

export const KAPALI: PanelDurumu = { acik: null, acilis: null };

export function panelDurumu(d: PanelDurumu, o: PanelOlayi): PanelDurumu {
  switch (o.tur) {
    case 'uzerine':
      // Sabitlenmiş panelde başka bölümün üstüne gelmek içeriği değiştirir,
      // sabitlemeyi bozmaz.
      return { acik: o.anahtar, acilis: d.acilis === 'tik' ? 'tik' : 'uzerine' };
    case 'tik':
      if (d.acik === o.anahtar && d.acilis === 'tik') return KAPALI;
      return { acik: o.anahtar, acilis: 'tik' };
    case 'ayril':
      return d.acilis === 'uzerine' ? KAPALI : d;
    case 'kapat':
      return KAPALI;
  }
}

/**
 * BÖLÜME TIKLAMAK İLK SAYFAYA GİDER (kullanıcı, 2026-10-09: "Planla'ya
 * tıklarsam hem sabitlensin hem de AdvStrategy sayfasına gitsin"). Google
 * Ads'te de raydaki bölüm kendi ana sayfasını açıyor.
 *
 * Kullanıcı ZATEN o bölümün bir sayfasındaysa gidilmez (`null`): Aylık
 * Bütçe'deyken Planla'ya basmak onu AdvStrategy'ye atardı, oysa niyeti
 * paneli açmak.
 */
export function tiklamaHedefi(
  ogeler: ReadonlyArray<Pick<NavEntry, 'href' | 'ekYollar'>>,
  icindeMi: (oge: Pick<NavEntry, 'href' | 'ekYollar'>) => boolean,
): string | null {
  const ilk = ogeler[0];
  if (!ilk || ogeler.some(icindeMi)) return null;
  return ilk.href;
}

/** Fare bir satırın üstünde bu kadar durmadan panel açılmaz (geçip giden fare paneli titretmesin). */
export const UZERINE_GECIKME_MS = 140;
/** Fare raydan/panelden ayrılınca bu kadar beklenir: ray ile panel arasındaki boşlukta kapanmasın. */
export const AYRILMA_GECIKME_MS = 220;
