/**
 * Reklam modülünün PARA ZİNCİRİ (TASARIM.md § 7.6.1, BTC-01).
 *
 * Tek zincir: ekran dizgesi → micros (BigInt) → Meta'nın en küçük birimi →
 * geri okumada micros → TAM eşitlik. Kayan nokta hiçbir halkada yok:
 * `parseFloat('539.7') * 1e6` = 539700000.0000002 ve `BigInt()` onu
 * reddediyor (LinkedIn'de canlıda görüldü). Micros'u doğrudan Meta'ya
 * göndermek bütçeyi bir milyon katına çıkarır ve API bunu GEÇERLİ sayar.
 *
 * `meta.provider.ts#toMinorUnits` bölüm tam değilse KIRPIYOR; burada
 * HATA. Kırpılan bir bütçe geri okumada farklı döner ve "fark" yerine
 * sessizce eksik harcama olur. Eski kopya Aşama 7'de eski yazma yollarıyla
 * birlikte kalkıyor; yeni modül onu içe aktarmıyor (modül sınırı).
 */

/** ISO 4217 istisnaları; listede olmayan her birim 2 ondalıklı. */
const SIFIR_ONDALIK = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA',
  'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);
const UC_ONDALIK = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);

export function paraOndaligi(paraBirimi: string): 0 | 2 | 3 {
  const k = paraBirimi.toUpperCase();
  if (!/^[A-Z]{3}$/.test(k)) throw new Error(`Para birimi kodu geçersiz: "${paraBirimi}"`);
  return SIFIR_ONDALIK.has(k) ? 0 : UC_ONDALIK.has(k) ? 3 : 2;
}

export type TutarSonucu = { tur: 'tamam'; micros: bigint } | { tur: 'hata'; mesaj: string };

/**
 * Türkçe yazılmış tutarı ayrıştırır: `1.500` = bin beş yüz, `1.500,50`,
 * `1500,5`. Binlik ayırıcı yalnız NOKTA, ondalık yalnız VİRGÜL.
 *
 * `1.5` bilerek REDDEDİLİYOR: Türkçe klavyede "bir buçuk" mu "bin beş yüz"
 * mü yazıldığı belirsiz ve iki yorum arasında bin kat fark var. Belirsizliği
 * tahminle çözmek bu modülün en pahalı sessiz hatası olurdu.
 */
export function tutarAyristir(girdi: string, paraBirimi: string): TutarSonucu {
  const ondalik = paraOndaligi(paraBirimi);
  const s = girdi.trim().replace(/\s/g, '');
  if (s === '') return { tur: 'hata', mesaj: 'Tutar boş.' };
  if (s.startsWith('-')) return { tur: 'hata', mesaj: 'Tutar eksi olamaz.' };
  const m = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?$/.exec(s);
  if (!m) {
    return {
      tur: 'hata',
      mesaj: 'Tutarı 1.500 ya da 1.500,50 biçiminde yaz (binlik nokta, kuruş virgülle).',
    };
  }
  const tam = m[1]!.replace(/\./g, '');
  const kesir = m[2] ?? '';
  if (kesir.length > ondalik) {
    return {
      tur: 'hata',
      mesaj:
        ondalik === 0
          ? `${paraBirimi.toUpperCase()} küsuratsız bir para birimi.`
          : `En çok ${ondalik} ondalık basamak yazılabilir.`,
    };
  }
  const micros = BigInt(tam) * 1_000_000n + BigInt((kesir + '000000').slice(0, 6));
  if (micros === 0n) return { tur: 'hata', mesaj: 'Tutar sıfır olamaz.' };
  return { tur: 'tamam', micros };
}

/** Micros → Meta'nın en küçük birimi. Bölüm tam değilse HATA (yuvarlama yok). */
export function microsToMinor(micros: bigint, paraBirimi: string): bigint {
  if (micros < 0n) throw new Error('Tutar eksi olamaz');
  const bolen = 10n ** BigInt(6 - paraOndaligi(paraBirimi));
  if (micros % bolen !== 0n) {
    throw new Error(`${micros} micros ${paraBirimi} biriminde tam değil; yuvarlama yapılmaz`);
  }
  return micros / bolen;
}

export function minorToMicros(minor: bigint, paraBirimi: string): bigint {
  return minor * 10n ** BigInt(6 - paraOndaligi(paraBirimi));
}

/**
 * Ekran yankısı: "1.500,00 TL". BigInt'ten dizgeyle kuruluyor —
 * `Number(micros) / 1e6` büyük tutarda hassasiyet kaybeder.
 */
export function tutarGoster(micros: bigint, paraBirimi: string): string {
  const ondalik = paraOndaligi(paraBirimi);
  const tam = micros / 1_000_000n;
  const kesir = (micros % 1_000_000n).toString().padStart(6, '0').slice(0, ondalik);
  const tamMetin = tam.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const kod = paraBirimi.toUpperCase();
  const simge = kod === 'TRY' ? 'TL' : kod;
  return ondalik === 0 ? `${tamMetin} ${simge}` : `${tamMetin},${kesir} ${simge}`;
}
