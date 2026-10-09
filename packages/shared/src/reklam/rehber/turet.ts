/**
 * Rehberden platform girdilerine TÜRETME — saf.
 *
 * META: mevcut taslak şemasına (`TaslakAlanlari`) çevrilir ve mevcut zincir
 * (taslak sürümü → `derleMeta` → prova → yayın motoru) DEĞİŞMEDEN koşar.
 * Meta'nın kendi eksik listesi (`taslakEksikleri`) türetilmiş taslağa ayrıca
 * uygulanır: rehber kendi kontrolünde bir şeyi atlarsa motor yine durdurur.
 *
 * GOOGLE: `GoogleDerlemeGirdisi` üretilir; gövdeyi API'deki derleyici
 * (`google-write.ts` / `google-demandgen.ts` kurucuları) kurar. Shared'da
 * gövde kurulmaz: aynı gövdeyi üreten ikinci fonksiyon doğduğu anda ayrışır.
 *
 * Her iki türetme de alanların bir eksikle durduğunu VARSAYMAZ: girdi eksikse
 * `ret` döner. Yayın kapısı `rehberEksikleri`ne zaten baktı, ama bu fonksiyon
 * prova ucundan da çağrılıyor ve sessizce boş bir alanla gövde kurmak, platformun
 * varsayılanına karar bırakmak demek.
 */
import type { TaslakAlanlari } from '../taslak-alanlari';
import type { AlanDegeri } from '../taslak';
import type { OzelKategori } from '../meta/hedefleme';
import { REHBER_AMACLARI, type GoogleKurgu, type GoogleUlasma } from './amaclar';
import { VARSAYILAN_META_PAYI, type RehberAlanlari } from './alanlar';
import { butceBol } from './butce';
import { METIN_SINIRLARI } from './metin';

/** Meta taslak şeması en çok 5 kavram (görsel × metin) taşıyor. */
export const META_EN_COK_GORSEL = 5;

export type TuretmeSonucu<T> = { tur: 'tamam'; deger: T } | { tur: 'ret'; kodlar: string[] };

const turetilmis = <T>(deger: T, zaman: string): AlanDegeri<T> => ({ deger, kaynak: 'derleyici', kim: null, zaman });

/**
 * Rehber → Meta taslağı. `zaman` dışarıdan: saf kalsın (saat okumak aynı
 * girdiye farklı çıktı demek; içerik özeti `kim`/`zaman` almadığı için
 * özet yine de kararlı, ama testler saatsiz yazılabilsin).
 */
export function rehberdenMeta(a: RehberAlanlari, paraBirimi: string, zaman: string): TuretmeSonucu<TaslakAlanlari> {
  const kodlar: string[] = [];
  const amac = a.amac?.deger;
  const m = a.metin?.deger;
  const butce = a.butce?.deger;
  const p = a.platformlar?.deger;
  if (!amac) kodlar.push('AMAC');
  if (!m) kodlar.push('METIN');
  if (!butce) kodlar.push('BTC-01');
  if (!p?.meta) kodlar.push('PLT-META-KAPALI');
  if (kodlar.length || !amac || !m || !butce || !p) return { tur: 'ret', kodlar };

  const pay = butceBol(BigInt(butce.micros), p, a.metaPayiYuzde?.deger ?? VARSAYILAN_META_PAYI, paraBirimi);
  const basliklar = m.basliklar.map((s) => s.trim()).filter(Boolean).slice(0, METIN_SINIRLARI.metaBaslikSayisi);
  const aciklama = m.aciklamalar.map((s) => s.trim()).find(Boolean);
  const medya = (a.medya?.deger ?? []).slice(0, META_EN_COK_GORSEL);
  // Her görsel bir kavram; başlık sırayla dağıtılır. Aynı başlığı her görsele
  // yazmak Meta'nın kreatif çeşitliliğini boşa harcar, metin ise TEK (marka
  // sesi ve yasal uyarı her kavramda aynı kalmalı).
  const kavramlar = medya.map((x, i) => ({
    varlikId: x.varlikId,
    baslik: basliklar.length ? (basliklar[i % basliklar.length] as string) : '',
    metin: m.anaMetin,
    ...(aciklama ? { aciklama } : {}),
    ...(x.kapakVarlikId ? { kapakVarlikId: x.kapakVarlikId } : {}),
  }));

  const t: TaslakAlanlari = {
    niyet: { ...a.amac!, deger: REHBER_AMACLARI[amac].meta.niyet },
    ...(a.metaHesabiId ? { reklamHesabiId: a.metaHesabiId } : {}),
    ...(a.sayfaId ? { sayfaId: a.sayfaId } : {}),
    ...(a.instagramId ? { instagramId: a.instagramId } : {}),
    ...(a.konumlar ? { konumlar: { ...a.konumlar, deger: a.konumlar.deger.map(({ google: _g, ...k }) => k) } } : {}),
    ...(a.enDusukYas ? { enDusukYas: a.enDusukYas } : {}),
    ...(a.yasAraligi ? { ipucuYas: a.yasAraligi } : {}),
    ...(a.ekKategoriler ? { ekKategoriler: a.ekKategoriler } : {}),
    // Bütçe KULLANICININ kararı; payı derleyici ayırdı ama kaynak kullanıcıda
    // kalır (Meta'nın IZINLI listesi butce'de yalnız `kullanici` kabul ediyor).
    butce: { ...a.butce!, deger: { tip: butce.tip, micros: pay.meta.toString() } },
    ...(a.takvim ? { takvim: a.takvim } : {}),
    kavramlar: turetilmis(kavramlar, zaman),
    ...(a.hedefAdres ? { hedefAdres: a.hedefAdres } : {}),
    ...(a.formSablonuId ? { formSablonuId: a.formSablonuId } : {}),
  };
  return { tur: 'tamam', deger: t };
}

/**
 * TABAN NEGATİF LİSTE (SENTEZ S-43, K-06): Türkçe "işi olmayan" aramalar.
 * Sektöre göre ters etki yapanlar (`ikinci el` gibi) burada DEĞİL.
 * Ekranda sayısı ve listesi gösterilir ("9 arama otomatik dışarıda").
 */
export const TABAN_NEGATIFLER = ['ücretsiz', 'bedava', 'nasıl yapılır', 'iş ilanı', 'staj', 'pdf', 'indir', 'şikayet', 'maaş'] as const;

/** Türkçe dil ölçütü (Google `languageConstants/1037`). */
export const GOOGLE_TURKCE = 'languageConstants/1037';

/**
 * Teklif: dönüşüm ÖLÇÜLMÜYORSA "dönüşümü artır" teklifi öğrenemez ve
 * harcamayı rastgele dağıtır; panel turunda Google bunu yine de önerdi
 * (A4 § 3). Ölçüm yoksa ya da bilinmiyorsa Maksimum tıklama.
 */
export type GoogleTeklif = 'MAKS_TIKLAMA' | 'MAKS_DONUSUM';

export interface GoogleDerlemeGirdisi {
  kurgu: GoogleKurgu;
  ulasma: GoogleUlasma | null;
  teklif: GoogleTeklif;
  /** Hesabın müşteri kimliği, tiresiz. */
  musteriId: string;
  paraBirimi: string;
  saatDilimi: string;
  /** `geoTargetConstants/NNN`; PRESENCE ile yazılır ("ilgilenenler" kapalı). */
  konumlar: string[];
  dil: typeof GOOGLE_TURKCE;
  /** Talep Yaratma'da yaş segmenti; Arama'da yaş ölçütü YOK (gözlem, sınır değil). */
  enDusukYas: number;
  butce: { tip: 'gunluk' | 'toplam'; micros: bigint };
  takvim: { baslangic: string; bitis: string | null };
  hedefAdres: string;
  telefon: string | null;
  basliklar: string[];
  aciklamalar: string[];
  /** Öbek eşleme (`PHRASE`). */
  anahtarKelimeler: string[];
  negatifler: string[];
  gorselVarlikIdleri: string[];
  youtubeVideoId: string | null;
  isletmeAdi: string | null;
  logoVarlikId: string | null;
  /** Kısıtlı kategori; Google'da kendi kural paketiyle derlenir. */
  kategoriler: OzelKategori[];
}

export interface GoogleTuretmeBaglami {
  musteriId: string;
  paraBirimi: string;
  saatDilimi: string;
  donusumEtkin: boolean | null;
  isletmeAdi: string | null;
  logoVarlikId: string | null;
  /** Müşteri kartındaki kategori tabanı (taslakta düşürülemez). */
  kategoriTabani: OzelKategori[];
}

export function rehberdenGoogle(a: RehberAlanlari, b: GoogleTuretmeBaglami): TuretmeSonucu<GoogleDerlemeGirdisi> {
  const kodlar: string[] = [];
  const amac = a.amac?.deger;
  const p = a.platformlar?.deger;
  const m = a.metin?.deger;
  const butce = a.butce?.deger;
  const takvim = a.takvim?.deger;
  const adres = a.hedefAdres?.deger;
  const konumlar = a.konumlar?.deger ?? [];
  if (!amac) kodlar.push('AMAC');
  const tanim = amac ? REHBER_AMACLARI[amac].google : null;
  if (tanim && tanim.kurgu === null) kodlar.push('G-KARSILIK-YOK');
  if (!p?.google) kodlar.push('PLT-GOOGLE-KAPALI');
  if (!m) kodlar.push('METIN');
  if (!butce) kodlar.push('BTC-01');
  if (!takvim) kodlar.push('TKV');
  if (!adres) kodlar.push('SITE-ADRES');
  if (konumlar.length === 0) kodlar.push('KNM-01');
  if (konumlar.some((k) => !k.google)) kodlar.push('G-KONUM');
  if (kodlar.length || !tanim || tanim.kurgu === null || !p || !m || !butce || !takvim || !adres) return { tur: 'ret', kodlar };

  const pay = butceBol(BigInt(butce.micros), p, a.metaPayiYuzde?.deger ?? VARSAYILAN_META_PAYI, b.paraBirimi);
  const ek = a.ekKategoriler?.deger ?? [];
  return {
    tur: 'tamam',
    deger: {
      kurgu: tanim.kurgu,
      ulasma: tanim.ulasma,
      teklif: tanim.kurgu === 'MAKS_PERFORMANS' || b.donusumEtkin === true ? 'MAKS_DONUSUM' : 'MAKS_TIKLAMA',
      musteriId: b.musteriId.replace(/-/g, ''),
      paraBirimi: b.paraBirimi,
      saatDilimi: b.saatDilimi,
      konumlar: konumlar.map((k) => k.google!.kaynak),
      dil: GOOGLE_TURKCE,
      enDusukYas: a.enDusukYas?.deger ?? 18,
      butce: { tip: butce.tip, micros: pay.google },
      takvim,
      hedefAdres: adres,
      telefon: a.telefon?.deger ?? null,
      basliklar: m.basliklar.map((s) => s.trim()).filter(Boolean).slice(0, METIN_SINIRLARI.basliklarEnCok),
      aciklamalar: m.aciklamalar.map((s) => s.trim()).filter(Boolean).slice(0, METIN_SINIRLARI.aciklamalarEnCok),
      anahtarKelimeler: (a.anahtarKelimeler?.deger ?? []).map((k) => k.metin.trim()),
      negatifler: [...TABAN_NEGATIFLER],
      gorselVarlikIdleri: (a.medya?.deger ?? []).map((x) => x.varlikId),
      youtubeVideoId: a.youtubeVideo?.deger?.videoId ?? null,
      isletmeAdi: b.isletmeAdi,
      logoVarlikId: b.logoVarlikId,
      kategoriler: [...new Set([...b.kategoriTabani, ...ek])],
    },
  };
}
