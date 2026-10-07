/**
 * ADVCAMPAIGN SOHBETİ — SIRADAKİ SORU (SENTEZ S-48, TASARIM-PLAN § 1.3).
 *
 * Modelin hangi soruyu soracağına MODEL karar vermiyor: sunucu taslağın
 * eksiklerinden tek bir alan seçiyor, model yalnız onu Türkçeleştiriyor.
 * Sebep: model kendi sırasıyla soru sorduğunda hem sıra her konuşmada
 * değişiyordu hem de "bütçen ne olsun, kaç gün, nerede" diye üç soruyu tek
 * mesaja yığıyordu; acemi kullanıcı ikisini cevaplayıp üçüncüsünü atlıyor ve
 * taslak sessizce eksik kalıyordu.
 *
 * Kurallar:
 *  - SIRA SABİT: niyet → medya → bütçe → süre → konum → niyete özgü alan →
 *    hesap/sayfa (yalnız birden çok varsa eksik çıkar).
 *  - Mesaj başına TEK soru, önizlemeye kadar EN ÇOK BEŞ. Beşinciden sonra
 *    `null`: kalan alanlar panelde eksik ya da "varsayılan" olarak durur.
 *  - Varsayılanı OLMAYAN alanlar (bütçe, süre, konum, özel kategori) beş soru
 *    dolsa bile TAHMİNLE dolmaz; onay kartı onlar olmadan açılmaz.
 *  - Özel kategori sorusu buradan ÇIKMAZ: modelin değil arayüzün sorusu
 *    (kategori beyanı kullanıcının kararı, model "hayır" diyerek onu
 *    cevaplamış gibi yapamamalı).
 *  - KAYNAK kilidi (asistanın önerisini onayla) soru değil; onay kartında
 *    toplu onaylanır. Onu soru saymak beş hakkı onaylarla tüketirdi.
 */
import type { TaslakAlanlari, TaslakEksigi } from '../taslak-alanlari';

export const EN_COK_SORU = 5;

/** Sorulabilen alanlar SIRAYLA. Dizinin sırası kuralın kendisi. */
export const SORU_SIRASI = [
  'niyet',
  'kavramlar',
  'butce',
  'takvim',
  'konumlar',
  'hedefAdres',
  'formSablonuId',
  'reklamHesabiId',
  'sayfaId',
] as const satisfies readonly (keyof TaslakAlanlari)[];

export type SorulabilirAlan = (typeof SORU_SIRASI)[number];

/** Tahminle ASLA dolmayan alanlar; beş soru dolsa da eksik kalır. */
export const VARSAYILANSIZ_ALANLAR: readonly (keyof TaslakAlanlari)[] = ['butce', 'takvim', 'konumlar', 'ekKategoriler'];

export interface SoruSecenegi {
  /** Ekranda çipin metni. */
  etiket: string;
  /** Sunucuya giden değer; serbest cevapta yok. */
  deger: string;
}

export interface Soru {
  alan: SorulabilirAlan;
  /** Modelin Türkçeleştireceği soru; model yazamazsa ekranda bu görünür. */
  metin: string;
  secenekler: SoruSecenegi[];
  /** Serbest cevap yazılabilir mi (bütçe tutarı, adres). */
  serbest: boolean;
  /** "Soru 2 / 5" — kaçıncı soru olduğu (1'den). */
  sira: number;
}

export interface SoruBaglami {
  /** Marka Merkezi'ndeki sık sayfalar: site adresi sorusunun çipleri. */
  sikSayfalar?: ReadonlyArray<{ ad: string; adres: string }>;
  /** Sayfanın formları: form sorusunun çipleri. */
  formlar?: ReadonlyArray<{ id: string; ad: string }>;
  hesaplar?: ReadonlyArray<{ id: string; ad: string }>;
  sayfalar?: ReadonlyArray<{ id: string; ad: string }>;
  /** Derleyicinin kurabildiği niyetler ve ekran adları. */
  niyetler?: ReadonlyArray<{ kod: string; ekranAdi: string }>;
}

const METIN: Record<SorulabilirAlan, string> = {
  niyet: 'Bu reklamdan ne olmasını istiyorsun?',
  kavramlar: 'Reklamda hangi görseller ya da videolar kullanılsın?',
  butce: 'Ne kadar harcamak istersin? Günlük ya da toplam tutar yaz.',
  takvim: 'Kaç gün sürsün?',
  konumlar: 'Reklam nerede görünsün?',
  hedefAdres: 'Reklama tıklayan hangi sayfaya gitsin?',
  formSablonuId: 'Hangi formu kullanalım?',
  reklamHesabiId: 'Hangi reklam hesabından yayınlansın?',
  sayfaId: 'Hangi Facebook sayfası adına yayınlansın?',
};

/**
 * Eksiklerden sıradaki tek soruyu seçer. `sorulanlar` bu oturumda daha önce
 * sorulmuş alanlar (sırayla); cevabı gelmemiş olsa bile sayılır, yoksa model
 * aynı soruyu tekrar tekrar sorup beş hakkı dolduramadan sonsuza dönerdi.
 */
export function siradakiSoru(
  eksikler: readonly TaslakEksigi[],
  sorulanlar: readonly SorulabilirAlan[],
  b: SoruBaglami = {},
): Soru | null {
  if (sorulanlar.length >= EN_COK_SORU) return null;
  // KAYNAK kilidi soru değil (bkz. dosya başı).
  const eksikAlanlar = new Set(eksikler.filter((e) => e.kod !== 'KAYNAK').map((e) => e.alan));
  const alan = SORU_SIRASI.find((a) => eksikAlanlar.has(a));
  if (!alan) return null;
  return { alan, metin: METIN[alan], ...secenekler(alan, b), sira: sorulanlar.length + 1 };
}

function secenekler(alan: SorulabilirAlan, b: SoruBaglami): { secenekler: SoruSecenegi[]; serbest: boolean } {
  switch (alan) {
    case 'niyet':
      return { secenekler: (b.niyetler ?? []).map((n) => ({ etiket: n.ekranAdi, deger: n.kod })), serbest: true };
    case 'kavramlar':
      // Medya çipi yok: dosya bırakma alanı cevabın kendisi.
      return { secenekler: [], serbest: false };
    case 'butce':
      // Tutar ÖNERİLMİYOR: bütçe varsayılansız alan, çip koymak bir tutarı
      // "önerilen" diye seçtirmek olur.
      return { secenekler: [], serbest: true };
    case 'takvim':
      return {
        secenekler: [
          { etiket: '7 gün', deger: '7' },
          { etiket: '14 gün', deger: '14' },
          { etiket: '30 gün', deger: '30' },
          { etiket: 'Bitiş yok', deger: 'bitis_yok' },
        ],
        serbest: true,
      };
    case 'konumlar':
      return { secenekler: [{ etiket: 'Bütün Türkiye', deger: 'TR' }], serbest: true };
    case 'hedefAdres':
      return { secenekler: (b.sikSayfalar ?? []).map((s) => ({ etiket: s.ad, deger: s.adres })), serbest: true };
    case 'formSablonuId':
      return { secenekler: (b.formlar ?? []).map((f) => ({ etiket: f.ad, deger: f.id })), serbest: false };
    case 'reklamHesabiId':
      return { secenekler: (b.hesaplar ?? []).map((h) => ({ etiket: h.ad, deger: h.id })), serbest: false };
    case 'sayfaId':
      return { secenekler: (b.sayfalar ?? []).map((s) => ({ etiket: s.ad, deger: s.id })), serbest: false };
  }
}
