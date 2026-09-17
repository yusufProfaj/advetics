/**
 * ═══ MODELİN YAZDIĞI METNİ EKRANA UYGUN PARÇALARA AYIRIR ═══
 *
 * Model markdown yazıyor: `**kalın**`, madde işaretleri, numaralı liste.
 * Ekran onu DÜZ METİN olarak basıyordu ve kullanıcının gördüğü şey
 * yıldızlarla dolu bir duvardı — kullanıcının tarifi birebir: *"metinlerde
 * '*' '**' işaretleri çıkıyor"*.
 *
 * HTML ÜRETİLMİYOR, PARÇA ÜRETİLİYOR. `dangerouslySetInnerHTML` ile bir
 * markdown kütüphanesi bağlamak iki şey getirirdi: yeni bir bağımlılık ve
 * modelin ürettiği metnin HTML olarak çalıştığı bir yüzey. Bu fonksiyon saf:
 * girdi metin, çıktı veri. Çizimi React yapıyor, yani hiçbir dize HTML
 * olarak yorumlanmıyor.
 *
 * SAF OLMASININ İKİNCİ SEBEBİ: kural burada ve kural sınanabilmeli. Bileşen
 * içinde kalsaydı yalnızca kaynak taramasıyla kontrol edilebilirdi ve tarama
 * "üç yıldız neye dönüşüyor" gibi bir soruyu ölçemez.
 */

export type SatirIci =
  | { tip: 'metin'; deger: string }
  | { tip: 'kalin'; deger: string }
  | { tip: 'egik'; deger: string }
  | { tip: 'kod'; deger: string };

export type Blok =
  | { tip: 'paragraf'; parcalar: SatirIci[] }
  | { tip: 'baslik'; parcalar: SatirIci[] }
  | { tip: 'madde'; ogeler: SatirIci[][] }
  | { tip: 'sirali'; ogeler: SatirIci[][] };

/** Satır başındaki madde işareti — üç biçim de modelden geliyor. */
const MADDE = /^\s*[-*·•]\s+/;
const SIRALI = /^\s*\d+[.)]\s+/;
const BASLIK = /^\s*#{1,6}\s+/;

/**
 * Metni bloklara ayırır.
 *
 * BOŞ SATIR PARAGRAFI BİTİRİYOR ama listeyi bitirmiyor: model maddeler
 * arasına boş satır koyabiliyor ve her maddeyi ayrı listeye bölmek ekranda
 * araları açılmış, kopuk bir liste üretirdi.
 */
export function bloklaraAyir(metin: string): Blok[] {
  const bloklar: Blok[] = [];
  const satirlar = metin.replace(/\r\n/g, '\n').split('\n');

  let paragraf: string[] = [];
  const paragrafiKapat = (): void => {
    if (paragraf.length === 0) return;
    bloklar.push({ tip: 'paragraf', parcalar: satirIciAyir(paragraf.join(' ').trim()) });
    paragraf = [];
  };

  for (const satir of satirlar) {
    if (satir.trim() === '') {
      paragrafiKapat();
      continue;
    }

    if (BASLIK.test(satir)) {
      paragrafiKapat();
      bloklar.push({ tip: 'baslik', parcalar: satirIciAyir(satir.replace(BASLIK, '').trim()) });
      continue;
    }

    if (MADDE.test(satir)) {
      paragrafiKapat();
      const oge = satirIciAyir(satir.replace(MADDE, '').trim());
      const son = bloklar[bloklar.length - 1];
      if (son?.tip === 'madde') son.ogeler.push(oge);
      else bloklar.push({ tip: 'madde', ogeler: [oge] });
      continue;
    }

    if (SIRALI.test(satir)) {
      paragrafiKapat();
      const oge = satirIciAyir(satir.replace(SIRALI, '').trim());
      const son = bloklar[bloklar.length - 1];
      if (son?.tip === 'sirali') son.ogeler.push(oge);
      else bloklar.push({ tip: 'sirali', ogeler: [oge] });
      continue;
    }

    paragraf.push(satir.trim());
  }
  paragrafiKapat();
  return bloklar;
}

/**
 * Satır içi biçimlendirme.
 *
 * SIRA ÖNEMLİ: `**kalın**` önce aranıyor. Tek yıldızı önce aramak
 * `**kalın**` ifadesini "boş eğik + kalın + boş eğik" diye parçalardı ve
 * ekranda yıldızlar geri görünürdü.
 *
 * EŞLEŞMEYEN YILDIZ METİN OLARAK KALIYOR: model bazen tek bir yıldız yazıyor
 * (çarpı işareti yerine) ve onu silmek kullanıcının okuduğu cümleyi
 * değiştirmek olurdu.
 */
export function satirIciAyir(metin: string): SatirIci[] {
  const parcalar: SatirIci[] = [];
  const desen = /(\*\*[^*\n]+\*\*)|(`[^`\n]+`)|(\*[^*\n]+\*)|(_[^_\n]+_)/g;

  let son = 0;
  for (const m of metin.matchAll(desen)) {
    const bas = m.index;
    if (bas > son) parcalar.push({ tip: 'metin', deger: metin.slice(son, bas) });

    const ham = m[0];
    if (ham.startsWith('**')) parcalar.push({ tip: 'kalin', deger: ham.slice(2, -2) });
    else if (ham.startsWith('`')) parcalar.push({ tip: 'kod', deger: ham.slice(1, -1) });
    else parcalar.push({ tip: 'egik', deger: ham.slice(1, -1) });

    son = bas + ham.length;
  }
  if (son < metin.length) parcalar.push({ tip: 'metin', deger: metin.slice(son) });

  return parcalar.length > 0 ? parcalar : [{ tip: 'metin', deger: metin }];
}
