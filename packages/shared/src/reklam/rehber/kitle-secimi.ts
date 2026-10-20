/**
 * ═══ REKLAM KURARKEN KAYITLI KİTLE SEÇİMİ (hedef kitleler 2. parça) ═══
 *
 * Kime adımında açık her platform için ayrı seçici var (MIMARI Ç9): Meta
 * kitlesi yalnız Meta'ya, Google kitlesi yalnız Google'a gider; konum ve
 * yaş da platforma göre ayrı alanlara yazılır (`googleKonumlari`).
 * Seçim ANINDA kitlenin değerleri rehbere KOPYALANIR (Ç6); bu dosya o
 * kopyayı kuran TEK yer. Panel ve testler aynı fonksiyonu okuyor: ekranın
 * "Meta'ya gidecek" dediği ile rehbere yazılan ayrışmasın.
 */
import type { KitleSablonuRecord } from '../../schemas/kitle-sablonu.schema';
import type { RehberGoogleKitlesi, RehberKonumu, RehberMetaKitlesi } from './alanlar';

function cinsiyet(g: KitleSablonuRecord['genders']): 'erkek' | 'kadin' | null {
  return g === 'male' ? 'erkek' : g === 'female' ? 'kadin' : null;
}

/**
 * Kitle Meta değilse `null`: Google kitlesini Meta seçicisine koymak onun
 * kategorilerini sessizce atmak olurdu (her kitle tek platform).
 */
export function metaKitlesiKopyasi(k: KitleSablonuRecord): RehberMetaKitlesi | null {
  if (k.platform !== 'meta') return null;
  return {
    kitleId: k.id,
    ad: k.name,
    cinsiyet: cinsiyet(k.genders),
    ilgiler: k.interests.map((i) => ({ id: i.id, name: i.name })),
    ozelKitleler: k.ozelKitleler.map((o) => ({ ...o })),
  };
}

export function googleKitlesiKopyasi(k: KitleSablonuRecord): RehberGoogleKitlesi | null {
  if (k.platform !== 'google') return null;
  return {
    kitleId: k.id,
    ad: k.name,
    cinsiyet: cinsiyet(k.genders),
    ilgiler: k.google.ilgiler.map((i) => ({ ...i })),
    kelimeler: [...k.google.kelimeler],
  };
}

/** Kitlenin konumları rehberin konum biçiminde (hazırlıktaki varsayılan kitleyle aynı çeviri). */
export function kitleKonumlari(k: Pick<KitleSablonuRecord, 'locations'>): RehberKonumu[] {
  return k.locations.map((l) => ({ tur: l.type, key: l.key, etiket: l.label, ulkeKodu: l.countryCode }));
}

/** Kitlenin yaşı rehberin aralığı olarak; 18-65 = daraltma yok (`null`). */
export function kitleYasAraligi(k: Pick<KitleSablonuRecord, 'ageMin' | 'ageMax'>): { min: number; max: number } | null {
  return k.ageMin <= 18 && k.ageMax >= 65 ? null : { min: k.ageMin, max: k.ageMax };
}
