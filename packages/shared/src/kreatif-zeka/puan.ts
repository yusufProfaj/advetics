import { ONERI_TURU_ETIKETI } from '../iyilestir';
import type { EtiketAlani } from './etiket';
import { ETIKET_ETIKETLERI } from './etiket';
import type { EtiketFarki, KreatifMetrigi } from './istatistik';
import { METRIK_GOSTERIMI } from './istatistik';

/**
 * ═══ KREATİF PUANI (0-100) VE YENİ KREATİF KOVALARI ═══
 *
 * PUAN = BENZERLER İÇİNDEKİ SIRA. "Aynı amaç ve kanaldaki 23 benzerinden
 * 17'sinden iyi → 74." Formül tek cümleyle anlatılabiliyor ve reklam
 * bilmeyen kullanıcıya "74 ne demek" sorusunun cevabı kartın üstünde
 * yazıyor. Ağırlıklı bir bileşik puan (tıklama × 0,4 + maliyet × 0,6...)
 * daha "akıllı" görünürdü ama ağırlıkların gerekçesi olmazdı ve kullanıcı
 * puanın NEDEN düştüğünü göremezdi.
 *
 * Eşitlikte orta sıra: aynı değerdeki benzerlerin yarısı "altında" sayılır.
 * Böylece bütün benzerleri aynı olan bir kümede herkes 50 alır, 0 ya da
 * 100 değil.
 *
 * PUAN YALNIZ YETERLİ HARCAMADA. 300 ₺ harcamış bir kreatifin tıklama oranı
 * şans; ona 92 vermek kullanıcıyı ona benzer kreatif üretmeye gönderir
 * (`kreatif-performansi.ts` "üç gösterimli en iyi kreatif" dersi).
 */

export const PUAN = {
  /** Puan için kümede (kendisi hariç) en az bu kadar yeterli harcamalı benzer. */
  enAzBenzer: 5,
} as const;

/**
 * YETERLİ HARCAMA EŞİĞİ. Kullanıcının verdiği varsayılan ₺1.000 (Orphex ile
 * aynı). Para RAPOR para biriminde; workspace TL dışındaysa eşik o günün
 * kuruyla çevrilir. Kur yoksa eşik YOK ve kreatif "veri yetersiz · kur
 * bilinmiyor" der: kursuz bir eşiği 1.000 USD saymak eşiği 40 kat
 * büyütürdü, sessizce.
 */
export const HARCAMA_ESIGI_TRY = 1000;

/** `tryBasinaBirim`: 1 birim rapor parası kaç TL (USD için ~41). TL'de yok sayılır. */
export function harcamaEsigiMicros(paraBirimi: string, tryBasinaBirim: number | null): bigint | null {
  if (paraBirimi === 'TRY') return BigInt(HARCAMA_ESIGI_TRY) * 1_000_000n;
  if (!tryBasinaBirim || !(tryBasinaBirim > 0)) return null;
  return BigInt(Math.round((HARCAMA_ESIGI_TRY / tryBasinaBirim) * 1e6));
}

export type PuanSonucu =
  | { puan: number; benzer: number; altinda: number; esit: number }
  | { puan: null; neden: 'harcama_az' | 'benzer_az' | 'metrik_yok'; benzer: number };

/**
 * `deger` ve `benzerler` VERİM ölçeğinde (yüksek daha iyi, `kreatifMetrikDegeri`).
 * `benzerler` çağıranda süzülmüş olmalı: aynı küme, yeterli harcama,
 * kendisi HARİÇ. Kendisini dahil etmek her puanı yukarı çeker.
 */
export function kreatifPuani(deger: number | null, yeterliHarcama: boolean, benzerler: readonly number[]): PuanSonucu {
  const b = benzerler.filter((x) => Number.isFinite(x));
  if (!yeterliHarcama) return { puan: null, neden: 'harcama_az', benzer: b.length };
  if (deger === null || !Number.isFinite(deger)) return { puan: null, neden: 'metrik_yok', benzer: b.length };
  if (b.length < PUAN.enAzBenzer) return { puan: null, neden: 'benzer_az', benzer: b.length };
  const altinda = b.filter((x) => x < deger).length;
  const esit = b.filter((x) => x === deger).length;
  return { puan: Math.round((100 * (altinda + esit / 2)) / b.length), benzer: b.length, altinda, esit };
}

// ─── Yeni kreatif kovaları ──────────────────────────────────────────────────

/**
 * "YENİ" = ilk gösterimi son 14 günde. Kova yalnız yenilere: eski
 * kreatiflerin sorusu "nasıl gidiyor" değil "hâlâ gidiyor mu" ve onun sahibi
 * İyileştir'in yorgunluk önerisi (aşağıda).
 */
export const YENI_KREATIF_GUN = 14;

export const KOVALAR = ['iyi_gidiyor', 'dikkat', 'veri_yetersiz'] as const;
export type Kova = (typeof KOVALAR)[number];

export const KOVA_ADI: Record<Kova, string> = {
  iyi_gidiyor: 'İyi gidiyor',
  dikkat: 'Dikkat',
  veri_yetersiz: 'Veri yetersiz',
};

/**
 * `iyi_gidiyor` sınırı: benzerlerin ortancası. Ortanca seçildi çünkü tek
 * cümleyle söylenebiliyor ("benzerlerinin yarısından iyi"). ÖLÇÜLECEK:
 * yeni kreatiflerin ilk 14 günde ortancanın altında kalıp sonra toparlanma
 * oranı (öğrenme dönemi); yüksekse sınır aşağı çekilir.
 */
export const KOVA_SINIRI = 50;

export type KovaNedeni = 'harcama_az' | 'benzer_az' | 'metrik_yok' | 'kur_yok' | 'ortancanin_ustu' | 'ortancanin_alti';

export interface KovaSonucu {
  kova: Kova;
  neden: KovaNedeni;
  /**
   * YORGUNLUK ÖNERİSİ VARSA KENDİ CÜMLEMİZİ SÖYLEMİYORUZ. Aynı reklamın
   * düşen tıklama oranı İyileştir › Öneriler'de "Kreatif yorgunluğu" diye
   * zaten duruyor; burada ikinci bir dille ("Dikkat: benzerlerinden kötü")
   * anlatmak aynı olayı iki ekranda iki farklı sözle göstermek olurdu.
   * Satır kovasını korur (puan hâlâ doğru), cümlesi ise öneriye bağlanır
   * ve öneri adı `ONERI_TURU_ETIKETI`ten gelir (iki ekranda AYNI kelime).
   */
  yorgunlukOnerisi: boolean;
}

export function kreatifKovasi(g: { puan: PuanSonucu; esikBiliniyor: boolean; yorgunlukOnerisi: boolean }): KovaSonucu {
  const yo = g.yorgunlukOnerisi;
  if (!g.esikBiliniyor) return { kova: 'veri_yetersiz', neden: 'kur_yok', yorgunlukOnerisi: yo };
  if (g.puan.puan === null) return { kova: 'veri_yetersiz', neden: g.puan.neden, yorgunlukOnerisi: yo };
  return g.puan.puan >= KOVA_SINIRI
    ? { kova: 'iyi_gidiyor', neden: 'ortancanin_ustu', yorgunlukOnerisi: yo }
    : { kova: 'dikkat', neden: 'ortancanin_alti', yorgunlukOnerisi: yo };
}

/** Kovanın tek satırlık açıklaması. Sayılar argümandan, uydurma yok. */
export function kovaCumlesi(k: KovaSonucu, p: PuanSonucu, harcamaMetni: string, esikMetni: string): string {
  if (k.yorgunlukOnerisi) return `${ONERI_TURU_ETIKETI.kreatif_yorgunlugu} önerisi var, İyileştir › Öneriler'de`;
  switch (k.neden) {
    case 'harcama_az':
      return `${harcamaMetni} harcadı, karar için ${esikMetni} gerekiyor`;
    case 'benzer_az':
      return `Aynı amaçta karşılaştırılacak ${p.benzer} kreatif var, en az 5 gerekiyor`;
    case 'metrik_yok':
      return 'Bu amaçta ölçülecek sonuç henüz yok';
    case 'kur_yok':
      return 'Para birimi kuru bilinmiyor, eşik hesaplanamadı';
    case 'ortancanin_ustu':
    case 'ortancanin_alti':
      return p.puan === null ? '' : `${p.benzer} benzerinden ${p.altinda + Math.floor(p.esit / 2)} tanesinden iyi`;
  }
}

// ─── Fark cümlesi: sayılar ŞABLONDAN ────────────────────────────────────────

const yuzde = (x: number) => `%${Math.round(Math.abs(x) * 100)}`;

/**
 * "İnsan olan görsellerde tıklama oranı %12 ile %31 arası daha yüksek
 * (23 ve 41 kreatif)". Brief'in ve ekranın SAYI TAŞIYAN tek cümlesi; Gemini
 * bu cümleyi yazmaz (brief.ts). Maliyet metriklerinde verim farkı maliyet
 * farkına çevrilir: verim %25 yüksek = maliyet %20 düşük (1/1,25).
 */
export function farkCumlesi(alan: EtiketAlani, deger: string, metrik: KreatifMetrigi, f: EtiketFarki): string {
  const ad = ETIKET_ETIKETLERI[alan].degerler[deger] ?? deger;
  const m = METRIK_GOSTERIMI[metrik];
  if (f.karar === 'yetersiz' || !f.aralik || f.goreliFark === null) return `${ad}: veri yetersiz (${f.yetersizNedeni ?? ''})`;
  const n = `${f.a?.kreatif ?? 0} ve ${f.b?.kreatif ?? 0} kreatif`;
  if (f.karar === 'belirsiz') return `${ad}: ${m.ad.toLocaleLowerCase('tr')} açısından belirgin fark yok (${n})`;
  const iyi = f.goreliFark > 0;
  const yon = m.gosterim === 'tl_ters' ? (iyi ? 'daha düşük' : 'daha yüksek') : iyi ? 'daha yüksek' : 'daha düşük';
  const metrikAdi = m.ad.toLocaleLowerCase('tr');
  /*
   * VERİM UCU -%100 YA DA ALTINDAYSA O UÇ MALİYETE ÇEVRİLEMEZ. `1/(1+g) - 1`
   * g = -1'de sonsuz, g < -1'de NEGATİF çıkıyor ve mutlak değere göre
   * sıralama "%35 ile %517 arası" gibi HİÇBİR ölçümden gelmeyen bir üst
   * sınır uyduruyordu (Ajan 4, Ö-1). O uç "sınır yok" demek: cümle tek
   * uçlu ("en az %35"). Bu cümle brief'e ve AdvCampaign'e giden TEK sayılı
   * metin; sonsuz ya da NaN hiçbir hâlde yazılmıyor.
   */
  const uclar = m.gosterim === 'tl_ters' ? f.aralik.filter((g) => g > -1).map((g) => 1 / (1 + g) - 1) : [...f.aralik];
  const sonlu = uclar.filter((u) => Number.isFinite(u)).sort((p, q) => Math.abs(p) - Math.abs(q));
  if (sonlu.length === 0) return `${ad}: ${metrikAdi} belirgin biçimde ${yon} (${n})`;
  if (sonlu.length === 1) return `${ad}: ${metrikAdi} en az ${yuzde(sonlu[0]!)} ${yon} (${n})`;
  return `${ad}: ${metrikAdi} ${yuzde(sonlu[0]!)} ile ${yuzde(sonlu[1]!)} arası ${yon} (${n})`;
}
