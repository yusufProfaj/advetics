/**
 * ═══ YAPAY ZEKÂ YORUMU: SAYI UYDURAMAZ (Paket B) ═══
 *
 * Kural (ORPHEX-BOSLUK § 2 Paket B): sayılar SORGUDAN gelir, Gemini yalnız
 * yorum cümlesini yazar. Bir dil modeli "maliyet %12 arttı" yazarken 12'yi
 * kendisi üretebilir ve o sayı müşteriye giden mailde, gerçek tablonun
 * hemen altında, YANLIŞ olarak durur. Hiçbir hata düşmez.
 *
 * Yöntem: modele SAYI VERİLMEZ, yalnız nitel tarif ("maliyet: arttı,
 * belirgin") ve YER TUTUCU adları (`{{harcama_degisim}}`). Model sayı
 * gerektiğinde yer tutucuyu yazar; sunucu yer tutucuyu SORGUDAN gelen,
 * biçimlenmiş değerle doldurur. Model çıktısında bir rakam, yüzde işareti,
 * para simgesi ya da sayı sözcüğü varsa yorum REDDEDİLİR ve mail yorumsuz
 * gider. Reddetmek, yanlış sayıyı yakalamaya çalışmaktan dürüst: hangi
 * rakamın "doğru" olduğunu metinden çıkarmak yeni bir tahmin olurdu.
 *
 * Kampanya ADLARI da modele verilmez (`{{k1_ad}}`): ad rakam taşıyabiliyor
 * ("Ekim 2026 Satış") ve model adı kopyalarsa denetim haklı olarak reddeder.
 */

/** `{{ad}}` — küçük harf, rakam, alt çizgi. */
export const YER_TUTUCU = /\{\{([a-z0-9_]+)\}\}/g;

/** Yorumun azami uzunluğu (yer tutucular DOLDURULMADAN). İki kısa cümle. */
export const YORUM_EN_UZUN = 320;

/**
 * Sayı sözcükleri. Kelime BİREBİR eşleşir (ek almış biçimler ayrıca
 * listeli); "on" ve "altı" gibi başka anlamı olanlar da burada, çünkü yanlış
 * ret ucuz (yorumsuz mail gider), yanlış kabul pahalı (uydurma sayı
 * müşteriye gider). "bir" YOK: Türkçede belirsizlik sıfatı, onu yasaklamak
 * hemen her cümleyi reddederdi.
 */
export const SAYI_SOZCUKLERI: readonly string[] = [
  'sıfır', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz', 'on',
  'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan',
  'yüz', 'bin', 'milyon', 'milyar', 'buçuk', 'yarım', 'yarı', 'yarısı', 'yarıya',
  'çeyrek', 'kat', 'katı', 'katına', 'yüzde', 'ikiye', 'üçte', 'dörtte',
  'ikişer', 'ikinci', 'üçüncü',
];

export type YorumDenetimi =
  | { gecerli: true; sablon: string }
  | { gecerli: false; neden: 'bos' | 'uzun' | 'rakam' | 'sayi_sozcugu' | 'simge' | 'bilinmeyen_yer_tutucu' | 'bicim'; ayrinti: string };

/**
 * Model çıktısını denetler. SAF: iş bunu çağırır, test ÇALIŞTIRARAK sınar.
 * Dönen `sablon` henüz doldurulmamış metin; `yerTutucuDoldur` ile doldurulur.
 *
 * UZUN TİRE normalleştirilir (virgüle), reddedilmez: panel metin dili onu
 * yasaklıyor ama içerik hatası değil.
 */
export function yorumDenetle(ham: string, izinli: ReadonlySet<string>): YorumDenetimi {
  const metin = ham.trim().replace(/\s*[—–]\s*/g, ', ').replace(/\s+/g, ' ');
  if (metin === '') return { gecerli: false, neden: 'bos', ayrinti: 'Yorum boş.' };
  if (metin.length > YORUM_EN_UZUN) return { gecerli: false, neden: 'uzun', ayrinti: `${metin.length} karakter.` };
  if (/[<>]/.test(metin) || /\n/.test(ham.trim())) {
    return { gecerli: false, neden: 'bicim', ayrinti: 'Yorum düz metin ve tek paragraf olmalı.' };
  }
  for (const m of metin.matchAll(YER_TUTUCU)) {
    if (!izinli.has(m[1]!)) return { gecerli: false, neden: 'bilinmeyen_yer_tutucu', ayrinti: m[0] };
  }
  // Yer tutucuları çıkarıp KALAN metni denetle: yer tutucu adındaki
  // rakamlar (`k1_ad`) meşru.
  const govde = metin.replace(YER_TUTUCU, ' ');
  if (/[{}]/.test(govde)) return { gecerli: false, neden: 'bicim', ayrinti: 'Kapanmamış yer tutucu.' };
  const rakam = /\p{Nd}/u.exec(govde);
  if (rakam) return { gecerli: false, neden: 'rakam', ayrinti: rakam[0] };
  const simge = /[%‰₺$€£]/.exec(govde);
  if (simge) return { gecerli: false, neden: 'simge', ayrinti: simge[0] };
  const kelimeler = govde.toLocaleLowerCase('tr').match(/\p{L}+/gu) ?? [];
  const sozcuk = kelimeler.find((k) => SAYI_SOZCUKLERI.includes(k));
  if (sozcuk) return { gecerli: false, neden: 'sayi_sozcugu', ayrinti: sozcuk };
  return { gecerli: true, sablon: metin };
}

/**
 * Yer tutucuları doldurur. Değeri olmayan yer tutucu `yorumDenetle`den
 * geçemez; yine de gelirse metin İÇİNDE BIRAKILMAZ, hata fırlatılır
 * (müşteriye `{{k3_ad}}` yazan bir mail gitmesin).
 */
export function yerTutucuDoldur(sablon: string, degerler: Readonly<Record<string, string>>): string {
  return sablon.replace(YER_TUTUCU, (_, ad: string) => {
    const d = degerler[ad];
    if (d === undefined) throw new Error(`Yer tutucunun değeri yok: ${ad}`);
    return d;
  });
}

/**
 * Sistem talimatı — depoda, gözden geçirilebilir. Değiştirirken
 * `yorumDenetle`yi de oku: talimat ile denetim aynı kuralı anlatmalı.
 */
export const YORUM_SISTEM_TALIMATI = [
  'Bir reklam ajansının müşterisine giden haftalık özet mailine en fazla iki kısa cümlelik yorum yazıyorsun.',
  'Okuyucu reklamcılık bilmiyor: sade Türkçe, teknik terim yok, abartı yok, emoji yok, uzun tire yok.',
  'Sana sayı VERİLMEYECEK. Sayı gerekirse yalnız sana verilen yer tutucuları aynen yaz, örneğin {{harcama_degisim}}.',
  'Hiçbir rakam, yüzde işareti, para simgesi ya da sayı sözcüğü (iki, yarı, kat, yüzde gibi) YAZMA; yazarsan yorum atılır.',
  'Kampanya adlarını yalnız yer tutucuyla yaz ({{k1_ad}} gibi).',
  'Verilmeyen bir bilgiyi, nedeni ya da tahmini ekleme. Emin olmadığın şeyi söyleme.',
  'Yalnız yorum cümlesini düz metin olarak döndür; başlık, liste, tırnak yok.',
].join('\n');
