/**
 * ═══ MAİL ALICI LİSTESİ — TEK KAYNAK ═══
 *
 * Rapor maili artık BİRDEN ÇOK kişiye gidiyor ve alıcı listesi ÜÇ ayrı yerden
 * geliyor: elle gönderim formu, planlı gönderim kaydı ve müşterinin kayıtlı
 * iletişim adresi. Ayrıştırma/temizleme kararları (ayırıcı ne, büyük-küçük
 * harf, tekilleştirme, üst sınır) her birinde ayrı yazılsaydı doğdukları anda
 * ayrışırlardı: biri virgülü kabul ederken diğeri noktalı virgülü, biri
 * tekilleştirirken diğeri aynı adrese iki kez gönderirdi.
 *
 * DOĞRULAMA GİRİŞ ANINDA, KULLANIM ANINDA DEĞİL. Kullanıcı yazdığı adresin
 * geçersiz olduğunu "Gönder"e bastığında değil, alanı bıraktığında öğrenmeli;
 * bu projede tekrar eden bir karar.
 */

/**
 * Bir maildeki en fazla alıcı.
 *
 * SMTP'nin kendi sınırı değil, İŞ sınırı: bir rapor mailinin yirmiden fazla
 * kişiye gitmesi neredeyse her zaman bir hata (yanlış listeyi yapıştırmak) ve
 * kurumsal sağlayıcılar da çok alıcılı mesajları spam olarak işaretlemeye
 * meyilli. Sınıra takılmak, sessizce spam klasörüne düşmekten iyi.
 */
export const ALICI_UST_SINIRI = 20;

/**
 * Basit ama KASITLI OLARAK dar bir adres kontrolü.
 *
 * RFC 5322'nin tamamını uygulayan bir düzenli ifade okunmuyor ve bakımı
 * yapılamıyor; buradaki iş "kullanıcı yanlışlıkla adres olmayan bir şey
 * yazdı mı" sorusunu cevaplamak. Gerçek doğrulama zaten SMTP sunucusunda
 * oluyor ve reddi `mailGonder` geri bildiriyor.
 */
const ADRES = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;

export function gecerliAdres(deger: string): boolean {
  return ADRES.test(deger.trim());
}

export interface AliciAyrismasi {
  /** Temizlenmiş, tekilleştirilmiş, sırası korunmuş adresler. */
  adresler: string[];
  /** Adres gibi görünmeyen parçalar — kullanıcıya AYNEN gösteriliyor. */
  gecersiz: string[];
  /** Üst sınırı aştığı için atılanlar. Sessiz kesme yok. */
  atilan: string[];
}

/**
 * Serbest metni alıcı listesine çevirir.
 *
 * Virgül, noktalı virgül ve satır sonu ayırıcı sayılıyor: kullanıcı adresleri
 * bir yerden kopyalayıp yapıştırıyor ve hangi ayırıcıyla geldiği belli olmuyor.
 * Boşluk AYIRICI DEĞİL — bazı sistemler adresi "Ad Soyad <a@b.com>" biçiminde
 * veriyor ve boşlukta bölmek onu ikiye ayırırdı.
 */
export function aliciAyristir(ham: string | readonly string[]): AliciAyrismasi {
  const parcalar = (Array.isArray(ham) ? ham : String(ham).split(/[,;\n\r]+/))
    .map((p) => String(p).trim())
    .filter((p) => p !== '');

  const adresler: string[] = [];
  const gecersiz: string[] = [];
  const gorulen = new Set<string>();

  for (const p of parcalar) {
    if (!gecerliAdres(p)) {
      gecersiz.push(p);
      continue;
    }
    /*
     * TEKİLLEŞTİRME KÜÇÜK HARFE GÖRE ama SAKLANAN HÂLİ KULLANICININ YAZDIĞI.
     * Adresin yerel kısmı teknik olarak büyük-küçük harfe duyarlı; adresi
     * biz küçültüp göndermek, bazı kurumsal sunucularda teslimatı bozar.
     * Karşılaştırma için küçültmek ise güvenli ve mükerrer gönderimi
     * engelliyor.
     */
    const anahtar = p.toLowerCase();
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    adresler.push(p);
  }

  return {
    adresler: adresler.slice(0, ALICI_UST_SINIRI),
    gecersiz,
    atilan: adresler.slice(ALICI_UST_SINIRI),
  };
}

/**
 * Gönderim anındaki NİHAİ alıcı listesi.
 *
 * TEK YER, çünkü elle gönderim ve planlı gönderim aynı kararı vermek zorunda:
 * "liste boşsa müşterinin kayıtlı adresine düş". İki yerde yazılsaydı biri
 * güncellenmediğinde planlı raporlar sessizce farklı bir adrese giderdi —
 * ve bunu yalnızca alıcı görürdü.
 */
export function nihaiAlicilar(params: {
  /** Formdan ya da plandan gelen liste. Boş olabilir. */
  secilen: readonly string[];
  /** Müşterinin kayıtlı rapor alıcıları. Yedek. */
  musteriAdresleri: readonly string[];
}): string[] {
  const secilen = aliciAyristir(params.secilen).adresler;
  /*
   * SEÇİLEN VARSA MÜŞTERİNİNKİ EKLENMİYOR, YERİNE GEÇİYOR.
   *
   * Birleştirmek cazip görünüyor ("ikisi de gitsin") ama kullanıcının bir
   * raporu SADECE bir kişiye göndermesini imkânsız kılardı: müşterinin
   * kayıtlı listesi her seferinde araya girerdi ve bunu ancak alıcı görürdü.
   */
  if (secilen.length > 0) return secilen;
  return aliciAyristir(params.musteriAdresleri).adresler;
}
