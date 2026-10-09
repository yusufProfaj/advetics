import { METIN_SINIRLARI, karakterSayisi, metinUyariIceriyor, type AnahtarKelimeOnerisi, type MetinOnerisi } from '@advetics/shared';
import { kelimeSonucunuHazirla, sadelestir, type HamKelimeFikri } from '../../strateji/kelime-tekil';

/**
 * Rehberin "düğme arkasındaki yapay zekâ"sı ve öneri yardımcıları — SAF.
 * Kullanıcı tıklamazsa hiçbiri çalışmaz (karar K-2). Platform ve model
 * çağrısı serviste; buradaki her karar çalıştırılarak sınanıyor.
 */

// ---------------------------------------------------------------------------
// ANAHTAR KELİME ÖNERİSİ
// ---------------------------------------------------------------------------

/** Rehbere dönen en çok satır; toplam ayrıca söyleniyor (sessiz kesme yok). */
export const KELIME_ONERI_SINIRI = 50;

const REKABET: Record<string, 'dusuk' | 'orta' | 'yuksek'> = { LOW: 'dusuk', MEDIUM: 'orta', HIGH: 'yuksek' };

/**
 * Google'ın ham fikirleri → `AnahtarKelimeOnerisi`.
 *
 * YAKIN VARYANTLAR TEKİLLEŞİYOR: "türk kahve makinesi" ile "turk kahve
 * makinesi" aynı 74.000 aramayı ve aynı teklif aralığını taşıyor; iki satır
 * toplanırsa hacim İKİYE KATLANIR (CLAUDE.md, Keyword Planner ölçümü). Kural
 * AdvStrategy'nin tekilleştiricisi (`kelime-tekil.ts`) — ikinci bir kural
 * doğsaydı aynı liste iki ekranda farklı satır sayısı verirdi.
 *
 * `toplam` TEKİL fikir sayısı ("50 / 214"). Hacim YUVARLANMIŞ kova değeri;
 * `null` = Google değer vermedi, sıfır değil.
 *
 * Zaten seçili kelimeler listeden düşüyor (aynı kelimeyi iki kez eklemek
 * Google'da DUPLICATE_KEYWORD) ama toplamdan DÜŞMÜYOR: toplam Google'ın
 * cevabını anlatıyor.
 */
export function kelimeOnerisiHazirla(ham: readonly HamKelimeFikri[], secili: readonly string[]): AnahtarKelimeOnerisi {
  const { satirlar, toplam } = kelimeSonucunuHazirla(ham, Number.MAX_SAFE_INTEGER);
  const seciliSade = new Set(secili.map(sadelestir));
  const kalan = satirlar.filter((s) => !seciliSade.has(sadelestir(s.kelime)));
  const gosterilen = kalan.slice(0, KELIME_ONERI_SINIRI).map((s) => ({
    metin: s.kelime,
    // Hacim 2^53'ün çok altında; sayı güvenle taşınıyor.
    aylikArama: s.aylikArama === null ? null : Number(s.aylikArama),
    rekabet: s.rekabet ? REKABET[s.rekabet]! : null,
  }));
  return {
    satirlar: gosterilen,
    toplam,
    bosNeden:
      toplam === 0
        ? 'Google bu kelimeler için öneri döndürmedi; başka bir kelimeyle dene.'
        : gosterilen.length === 0
          ? "Google'ın önerdiği kelimelerin hepsi zaten seçili."
          : null,
  };
}

/**
 * Tohum: kullanıcı verdiyse o; yoksa başlıklar, o da yoksa sitenin alan adı
 * (`www.` ve uzantı atılarak). Tohumsuz istek gönderilmiyor — Google boş
 * tohuma hata döndürüyor ve o hata "eşleşme yok" diye okunurdu.
 */
export function kelimeTohumlari(verilen: readonly string[] | undefined, basliklar: readonly string[], siteAdresi: string | null): string[] {
  const temiz = (xs: readonly string[]) => [...new Set(xs.map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean))];
  if (verilen && verilen.length) return temiz(verilen).slice(0, 10);
  const b = temiz(basliklar).slice(0, 5);
  if (b.length) return b;
  if (siteAdresi) {
    try {
      const host = new URL(siteAdresi).hostname.replace(/^www\./, '');
      const ad = host.split('.')[0];
      if (ad && ad.length >= 3) return [ad.replace(/-/g, ' ')];
    } catch {
      // Geçersiz adres: tohum yok, çağıran bosNeden söyler.
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// KONUM EŞLEME (Meta konumu → Google geoTargetConstant)
// ---------------------------------------------------------------------------

export interface GoogleKonumAdayi {
  key: string;
  name: string;
  countryCode: string | null;
}

/** Türkiye ülke ölçütü: 2000 + ISO 3166 sayısal kodu (792). Sabit, tahmin değil. */
export const GOOGLE_TURKIYE = 'geoTargetConstants/2792';

/**
 * YALNIZ TAM AD EŞLEŞMESİ yazılır. "İzmir" için Google birden çok yer
 * döndürebilir (il, ilçe, başka ülkede aynı ad); en yakını SEÇMEK reklamı
 * başka bir şehre götürür ve hata vermez. Tek bir Türkiye adayı tam aynı
 * adı taşımıyorsa `null` kalır ve eksik listesi G-KONUM der.
 *
 * Ülke (Türkiye) konumu aranmıyor: kimliği sabit.
 */
export function konumEsle(
  konum: { tur: string; etiket: string; ulkeKodu?: string | null },
  adaylar: readonly GoogleKonumAdayi[],
): { kaynak: string; ad: string } | null {
  if (konum.tur === 'country') return konum.ulkeKodu === 'TR' ? { kaynak: GOOGLE_TURKIYE, ad: 'Türkiye' } : null;
  const hedef = sadelestir(konum.etiket.split(',')[0] ?? '');
  if (!hedef) return null;
  const tam = adaylar.filter((a) => a.countryCode === 'TR' && sadelestir(a.name) === hedef && /^geoTargetConstants\/\d+$/.test(a.key));
  return tam.length === 1 ? { kaynak: tam[0]!.key, ad: tam[0]!.name } : null;
}

// ---------------------------------------------------------------------------
// METİN ÖNERİSİ — modelin çıktısını temizle
// ---------------------------------------------------------------------------

/**
 * Model RAKAM, FİYAT, İNDİRİM UYDURAMAZ. İstemde yasak; yine de çıktıda
 * taranıyor: istem bir öneri, tarama bir kapı. Girdide (marka bilgisi, site
 * adresi, kullanıcının metni) GEÇMEYEN bir sayı ya da fiyat/indirim sözü
 * taşıyan satır ATILIR ve nedeni `notlar`a yazılır.
 */
// Sınır Unicode harf bakışıyla: `\b` ASCII'ye bakıyor ve "Ücretsiz"in
// başındaki Ü'yü sınır saymıyor — satır başındaki söz kaçıyordu.
const FIYAT_SOZU = /(%|₺|(?<![\p{L}\p{N}])tl(?![\p{L}])|(?<![\p{L}\p{N}])(indirim|fiyat|ücretsiz|bedava|taksit|peşin|hediye|kampanyal[ıi]))/iu;

function sayilar(s: string): string[] {
  return s.match(/\d+(?:[.,]\d+)*/g) ?? [];
}

export interface MetinOneriGirdisi {
  /** Modelin gördüğü bütün metin: uydurma taraması buna göre. */
  kaynakMetin: string;
  yasalUyari: string | null;
}

export interface HamMetinOnerisi {
  anaMetin?: unknown;
  basliklar?: unknown;
  aciklamalar?: unknown;
  notlar?: unknown;
}

export function metinOnerisiTemizle(ham: HamMetinOnerisi, g: MetinOneriGirdisi): MetinOnerisi {
  const notlar: string[] = Array.isArray(ham.notlar) ? ham.notlar.filter((x): x is string => typeof x === 'string').slice(0, 5) : [];
  const kaynakSayilari = new Set(sayilar(g.kaynakMetin));
  const kaynakKucuk = g.kaynakMetin.toLocaleLowerCase('tr-TR');
  const uydurmaMi = (s: string): string | null => {
    const yabanciSayi = sayilar(s).find((n) => !kaynakSayilari.has(n));
    if (yabanciSayi) return `"${yabanciSayi}" sayısı verilen bilgide yok`;
    const f = FIYAT_SOZU.exec(s);
    if (f && !kaynakKucuk.includes(f[0].toLocaleLowerCase('tr-TR'))) return `"${f[0]}" fiyat/kampanya sözü verilen bilgide yok`;
    return null;
  };
  const liste = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean) : []);

  // Yasal uyarı satırı uydurma taramasından muaf: profilden geliyor.
  const ayikla = (satirlar: string[], sinir: number, ad: string, enCok: number): string[] => {
    const kalan: string[] = [];
    for (const s of satirlar) {
      if (kalan.length >= enCok) {
        notlar.push(`${ad}: en çok ${enCok} tane; fazlası atıldı.`);
        break;
      }
      if (karakterSayisi(s) > sinir) {
        // KIRPILMIYOR: yarıda kesilmiş bir başlık anlamı değiştirir.
        notlar.push(`${ad} "${s}" ${sinir} karakteri aştığı için atıldı.`);
        continue;
      }
      const u = g.yasalUyari && metinUyariIceriyor(s, g.yasalUyari) ? null : uydurmaMi(s);
      if (u) {
        notlar.push(`${ad} "${s}" atıldı: ${u}.`);
        continue;
      }
      kalan.push(s);
    }
    return kalan;
  };

  const basliklar = ayikla(liste(ham.basliklar), METIN_SINIRLARI.baslik, 'Başlık', METIN_SINIRLARI.basliklarEnCok);
  const aciklamalar = ayikla(liste(ham.aciklamalar), METIN_SINIRLARI.aciklama, 'Açıklama', METIN_SINIRLARI.aciklamalarEnCok);

  let anaMetin = typeof ham.anaMetin === 'string' ? ham.anaMetin.trim() : '';
  // Ana metnin içinde yasal uyarı varsa onun sayıları taramaya girmesin.
  const anaTaranan = g.yasalUyari ? anaMetin.split(g.yasalUyari).join(' ') : anaMetin;
  const anaU = uydurmaMi(anaTaranan);
  if (anaU) {
    notlar.push(`Ana metin atıldı: ${anaU}.`);
    anaMetin = '';
  } else if (karakterSayisi(anaMetin) > METIN_SINIRLARI.anaMetinEnCok) {
    notlar.push(`Ana metin ${METIN_SINIRLARI.anaMetinEnCok} karakteri aştığı için atıldı.`);
    anaMetin = '';
  }
  // ZORUNLU YASAL UYARI: ana metinde yoksa SONUNA eklenir. Profilden gelen
  // metin, uydurma değil; eklendiği söyleniyor.
  if (g.yasalUyari && anaMetin && !metinUyariIceriyor(anaMetin, g.yasalUyari)) {
    anaMetin = `${anaMetin}\n\n${g.yasalUyari}`;
    notlar.push('Zorunlu yasal uyarı ana metnin sonuna eklendi.');
  }
  if (g.yasalUyari && aciklamalar.length && !aciklamalar.some((a) => metinUyariIceriyor(a, g.yasalUyari as string))) {
    notlar.push('Zorunlu yasal uyarı hiçbir Google açıklamasında yok; birine sen ekle.');
  }
  return { anaMetin, basliklar, aciklamalar, notlar };
}

/** Modelin JSON şeması (Gemini yapılandırılmış çıktı). */
export const METIN_ONERI_SEMASI = {
  type: 'object',
  properties: {
    anaMetin: { type: 'string', description: 'Meta ana metni, Türkçe; ilk 125 karakter en önemli bilgi.' },
    basliklar: { type: 'array', items: { type: 'string' }, description: `En çok ${METIN_SINIRLARI.baslik} karakterlik 8-10 başlık, birbirinden farklı.` },
    aciklamalar: { type: 'array', items: { type: 'string' }, description: `En çok ${METIN_SINIRLARI.aciklama} karakterlik 3-4 açıklama.` },
    notlar: { type: 'array', items: { type: 'string' }, description: 'Bilmediğin ve bu yüzden yazmadığın şeyler (ör. fiyat verilmedi).' },
  },
  required: ['anaMetin', 'basliklar', 'aciklamalar', 'notlar'],
} as const;

export function metinOneriIstemi(): string {
  return [
    'Sen Türkçe reklam metni yazan bir yardımcısın. Reklam bilmeyen bir işletme sahibi için yazıyorsun.',
    'KESİN KURALLAR:',
    '- Verilen bilgide GEÇMEYEN hiçbir sayı, fiyat, indirim, taksit, hediye, süre ya da kampanya YAZMA. Bilmiyorsan yazma ve notlara "fiyat verilmedi" gibi yaz.',
    `- Başlıklar en çok ${METIN_SINIRLARI.baslik}, açıklamalar en çok ${METIN_SINIRLARI.aciklama} karakter. Sınırı aşan satır atılır.`,
    '- Başlıklar birbirinin tekrarı olmasın.',
    '- Abartılı iddia (en iyi, bir numara, garanti) yazma.',
    '- Zorunlu yasal uyarı verildiyse ana metnin sonuna aynen ekle.',
  ].join('\n');
}
