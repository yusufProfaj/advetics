/**
 * Dalga 3 · Meta ekran kararları — SAF (panelde bileşen render eden test
 * yok; karar effect'in içinde kalsaydı yalnız kaynak taramasıyla
 * sınanabilirdi, CLAUDE.md "REACT EFFECT'İNİN İÇİNDEKİ KARAR").
 */
import type { RehberPikselListesi } from '@advetics/shared';
import type { OneriHali } from './rehber-mantik';

/**
 * Piksel listesi DÖRT HÂL: sunucu boşun nedenini yazıyor; yazmadıysa genel
 * cümle. "Okunamadı" (`oneriHatasi`) ile "piksel yok" aynı boş seçiciye
 * çevrilirse kullanıcı olmayan bir pikseli ya da olmayan bir izin sorununu
 * arar.
 */
export function pikselListesiHali(r: RehberPikselListesi): OneriHali<RehberPikselListesi> {
  if (r.satirlar.length > 0) return { tur: 'geldi', deger: r };
  return { tur: 'bos', neden: r.bosNeden ?? 'Bu reklam hesabında Meta pikseli yok.' };
}

/**
 * Tek seçenek varsa ÖNERİ (kaynak `derleyici`, ekranda "Önerilen"): yalnız
 * hiçbir piksel seçili değilken ve listede TEK KULLANILABİLİR piksel
 * varken. Birden çoksa seçim kullanıcının: "listenin ilki" sayfa seçiminde
 * başka müşterinin sayfasını seçtiren hatanın aynısı olurdu.
 */
export function tekPikselOnerisi(secili: string | null | undefined, r: RehberPikselListesi): string | null {
  if (secili) return null;
  const uygun = r.satirlar.filter((p) => !p.kullanilamaz);
  return uygun.length === 1 && r.satirlar.length === 1 ? (uygun[0] as { id: string }).id : null;
}

/** Satırın altındaki kısa durum: son çalışma ve 7 günlük satın alma (üç hâl ayrı). */
export function pikselDurumu(p: RehberPikselListesi['satirlar'][number]): string {
  if (p.kullanilamaz) return "Meta'da kullanılamıyor";
  if (!p.sonCalisma) return 'Hiç çalışmamış';
  if (p.satinAlma7Gun === true) return 'Son 7 günde satın alma saydı';
  if (p.satinAlma7Gun === false) return 'Son 7 günde satın alma yok';
  return 'Satın alma kontrol edilemedi';
}

/**
 * Marka Merkezi telefonundan WhatsApp önerisi (E.164). Kayıtlı telefon serbest
 * biçimde ("0532 123 45 67", "+90 532 ...") duruyor; çözülemeyen biçim
 * ÖNERİLMEZ (yanlış bir numara önermek, mesajların başka birine gitmesi).
 */
export function whatsappOnerisi(ham: string | null | undefined): string | null {
  if (!ham) return null;
  const rakam = ham.replace(/\D/g, '');
  if (/^90\d{10}$/.test(rakam)) return `+${rakam}`;
  if (/^0?\d{10}$/.test(rakam)) return `+90${rakam.slice(-10)}`;
  return null;
}

/** Medya seçicinin kabul ettiği türler: Meta video amacında YALNIZ video. */
export function medyaKabulu(yalnizVideo: boolean): string {
  return yalnizVideo ? 'video/mp4,video/quicktime' : 'image/jpeg,image/png,video/mp4,video/quicktime';
}
