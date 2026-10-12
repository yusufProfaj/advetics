import { haftaBasi, gunEkle, type IsoDay } from '../tarih';
import { istanbulParcalari } from '../plan-zamani';
import { ANOMALI } from '../sinyal/anomali';
import type { GunAraligi } from '../etki/yontem';

/**
 * ═══ HAFTA HESABI — TEK TANIM (Paket B) ═══
 *
 * ISO hafta kodu (`2026-W41`) bugün `apps/api/.../iyilestir/oneri-hesap.ts`
 * içinde YAŞIYOR ve panel ona erişemiyor. Özet hem worker'da (gönderim) hem
 * panelde (önizleme başlığı) hafta hesaplıyor; ikinci bir yazım doğduğu anda
 * ayrışır (CLAUDE.md "aynı şeyi üreten ikinci fonksiyon"). Bu dosya tek
 * tanım; `oneri-hesap.ts#isoHafta` Ajan 2'nin commit'inde buradan yeniden
 * dışa aktarılır. O güne kadar iki uygulamanın aynı sonucu verdiğini
 * sözleşme testi 3 yıl boyunca her gün için karşılaştırıyor.
 */

/** `YYYY-Www` (ISO 8601: hafta Pazartesi başlar, yılın ilk Perşembesini içeren hafta W01). */
export function isoHaftaKodu(gun: IsoDay): string {
  const d = new Date(`${gun}T00:00:00Z`);
  const haftaGunu = (d.getUTCDay() + 6) % 7; // Pazartesi 0
  d.setUTCDate(d.getUTCDate() - haftaGunu + 3); // o haftanın Perşembesi
  const yil = d.getUTCFullYear();
  const ocak4 = new Date(Date.UTC(yil, 0, 4));
  const ilkPazartesi = new Date(ocak4);
  ilkPazartesi.setUTCDate(ocak4.getUTCDate() - ((ocak4.getUTCDay() + 6) % 7));
  const hafta = 1 + Math.round((d.getTime() - 3 * 86_400_000 - ilkPazartesi.getTime()) / (7 * 86_400_000));
  return `${yil}-W${String(hafta).padStart(2, '0')}`;
}

export const ISO_HAFTA_DESENI = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;

/** Hafta kodunun Pazartesi–Pazar aralığı. Geçersiz kodda `null`. */
export function isoHaftaAraligi(kod: string): GunAraligi | null {
  if (!ISO_HAFTA_DESENI.test(kod)) return null;
  const yil = Number(kod.slice(0, 4));
  const hafta = Number(kod.slice(6));
  const ocak4 = `${yil}-01-04`;
  const bas = gunEkle(haftaBasi(ocak4), (hafta - 1) * 7);
  // W53 olmayan bir yılda W53 istenirse bir sonraki yılın W01'i çıkar: reddet.
  if (isoHaftaKodu(bas) !== kod) return null;
  return { bas, son: gunEkle(bas, 6) };
}

/**
 * Bir anın İstanbul takvim günü. Özet ajansın saatiyle gönderiliyor
 * (Pazartesi 09:00 İstanbul); UTC günü kullanmak Pazartesi 00:00–03:00
 * arasında koşan bir işi PAZAR'a koyar ve "geçen hafta" bir hafta geriye
 * kayar.
 */
export function istanbulGunu(an: Date): IsoDay {
  const p = istanbulParcalari(an);
  return `${p.yil}-${String(p.ay).padStart(2, '0')}-${String(p.gun).padStart(2, '0')}`;
}

/**
 * Özetin haftası: verilen anın (İstanbul) içinde bulunduğu haftadan BİR
 * ÖNCEKİ tam ISO hafta. Planlı gönderimde `an` SÜPÜRMENİN koştuğu an değil
 * planın `next_run_at`i olmalı: worker deploy'da geç kalıp Salı koşarsa
 * yine aynı haftayı göndersin.
 */
export function ozetHaftasi(an: Date): string {
  const bugun = istanbulGunu(an);
  return isoHaftaKodu(gunEkle(haftaBasi(bugun), -7));
}

/** Haftanın bir öncekisi (karşılaştırma haftası). */
export function oncekiHafta(kod: string): string | null {
  const a = isoHaftaAraligi(kod);
  return a ? isoHaftaKodu(gunEkle(a.bas, -7)) : null;
}

/**
 * ═══ DÖNÜŞÜM KIYASI OLGUN GÜNLER ÜZERİNDEN ═══
 *
 * Pazartesi sabahı geçen haftanın Cuma–Pazar dönüşümleri HENÜZ TAMAMLANMADI
 * (atıf penceresi; `insights_backfill` son 7 günü her gece düzeltiyor).
 * Önceki hafta ise tamamen olgun. İki haftayı olduğu gibi kıyaslamak HER
 * PAZARTESİ "dönüşüm düştü" yazar: sistematik, sessiz, tamamen yanlış bir
 * kötü haber. Paket A aynı sorunu `ANOMALI.donusumGecikmesiGun` ile
 * çözüyor ve sayı AYNI (ayrı sabit değil).
 *
 * Kural: dönüşüm ve dönüşüm başı maliyetin DEĞİŞİMİ, iki haftanın da
 * yalnız OLGUN günleri üzerinden (aynı hafta günleri) hesaplanır. Haftanın
 * toplamı ekranda yine gösterilir ama "kesinleşmedi" işaretiyle. Özet
 * Perşembe ya da sonra üretilirse (önizleme) bütün hafta olgundur ve kıyas
 * tam haftadır (`tamHafta`).
 */
export function donusumKiyasi(hafta: string, uretimGunu: IsoDay): { bu: GunAraligi; onceki: GunAraligi; tamHafta: boolean } | null {
  const a = isoHaftaAraligi(hafta);
  if (!a) return null;
  // Olgun son gün: üretim gününden (dün) gecikme kadar geride.
  const olgunSon = gunEkle(uretimGunu, -(ANOMALI.donusumGecikmesiGun + 1));
  const son = olgunSon < a.son ? olgunSon : a.son;
  if (son < a.bas) return null; // hiç olgun gün yok: kıyas yapılamaz
  const gunSayisi = Math.round((Date.parse(`${son}T00:00:00Z`) - Date.parse(`${a.bas}T00:00:00Z`)) / 86_400_000);
  const oncekiBas = gunEkle(a.bas, -7);
  return {
    bu: { bas: a.bas, son },
    onceki: { bas: oncekiBas, son: gunEkle(oncekiBas, gunSayisi) },
    tamHafta: son === a.son,
  };
}

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/** "6-12 Ekim", ay değişiyorsa "29 Eylül - 5 Ekim". Uzun tire YOK (panel metin dili). */
export function aralikMetni(a: GunAraligi): string {
  const [, ay1, g1] = a.bas.split('-').map(Number) as [number, number, number];
  const [, ay2, g2] = a.son.split('-').map(Number) as [number, number, number];
  if (ay1 === ay2) return `${g1}-${g2} ${AYLAR[ay2 - 1]}`;
  return `${g1} ${AYLAR[ay1 - 1]} - ${g2} ${AYLAR[ay2 - 1]}`;
}
