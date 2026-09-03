import type { ReactElement } from 'react';

/**
 * ═══ ADVETICS'İN KENDİ İŞARETİ — TEK TANIM ═══
 *
 * Sekme ikonu, iOS ana ekran ikonu ve Open Graph görseli AYNI işareti
 * çiziyor. Üçü ayrı yazılsaydı doğdukları anda ayrışırlardı; OG görseli zaten
 * ayrışmıştı (aşağıya bkz.).
 *
 * ┌─ BU RENK `--brand-primary` DEĞİL ─────────────────────────────────────┐
 * │ `--brand-primary` (#e11d2e) AJANSIN rengi ve `branding_profiles`      │
 * │ tablosundan müşteriye göre değişiyor — beyaz etiketin ta kendisi.      │
 * │ Buradaki renk ADVETICS'in kendi kimliği: sekme ikonu ürünün kendisini  │
 * │ temsil ediyor, müşterinin markasını değil, ve ajans rengini değiştirdi │
 * │ diye tarayıcı sekmesi değişmemeli.                                     │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * DEĞER LOGODAN ÖLÇÜLDÜ, tahmin edilmedi: `advetics-logo.png` içindeki "i"
 * harfinin üzerindeki noktanın baskın pikseli #FF2500. Open Graph görseli
 * #e11d2e kullanıyordu, yani logonun kırmızısıyla uyuşmuyordu; aynı sabite
 * bağlanarak düzeltildi. `marka-isareti.spec.ts` değeri logodan yeniden
 * ölçüp karşılaştırıyor — logo güncellenip sabit unutulursa düşüyor.
 */
export const ADVETICS_KIRMIZI = '#ff2500';

/**
 * NEDEN YAZI MARKASI DEĞİL, "A" HARFİ.
 *
 * `advetics-logo.png` 670×139, yani ~4,8:1 bir yazı markası. Sekme ikonu
 * 16×16 çiziliyor: o oranı kareye sıkıştırmak harfleri 3 piksel yüksekliğe
 * indirir ve okunmaz bir lekeye dönüştürür. Logoyu "yerleştirmek" teknik
 * olarak mümkün ama sonucu logo GÖSTERMEMEK olurdu.
 *
 * DOLGU KIRMIZI, HARF BEYAZ — logonun tersi (siyah harf, kırmızı nokta)
 * değil. Sebep tarayıcı: sekme şeridi açık temada beyaz, koyu temada
 * neredeyse siyah. Siyah bir harf koyu temada kayboluyor; dolu bir renk
 * lekesi ikisinde de görünüyor. Aynı gerekçeyle logonun kırmızı noktası
 * eklenmedi: 16 pikselde iki piksel kalıyor ve yalnızca gürültü yapıyor.
 */
export function markaIsareti(kenar: number): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        background: ADVETICS_KIRMIZI,
        /*
         * YUVARLAKLIK KENARA ORANLI. Sabit bir piksel değeri 32'lik ikonda
         * doğru görünüp 180'likte neredeyse kare bırakırdı.
         */
        borderRadius: `${Math.round(kenar * 0.22)}px`,
      }}
    >
      {/*
        ═══ HARF YAZI DEĞİL, ÇİZİM ═══

        Önce `fontWeight: 700` ile metin olarak yazdım ve üretilen ikona
        BAKTIĞIMDA harf İNCE çıkıyordu: `ImageResponse`un gömülü varsayılan
        fontu kalın kesimi taşımıyor ve ağırlık sessizce yok sayılıyor.
        Logonun ayırt edici özelliği tam da ağır, geometrik harfleri; ince bir
        "A" yer tutucu gibi duruyordu.

        Çizim ayrıca font BAĞIMLILIĞINI tamamen kaldırıyor: satori'nin
        varsayılan fontu bir gün değişirse ikon değişmiyor.

        `stroke` ile kuruldu, dolgu yolu ile değil: kalınlık tek sayı ve
        harfin oranı okunarak ayarlanabiliyor. `viewBox` 100×100, yani
        koordinatlar kenar uzunluğundan BAĞIMSIZ — 32 ve 180 aynı çizimi
        veriyor.
      */}
      <svg width="72%" height="72%" viewBox="0 0 100 100" fill="none">
        <path
          d="M12 88 L50 14 L88 88"
          stroke="#ffffff"
          strokeWidth="15"
          strokeLinejoin="miter"
          strokeLinecap="butt"
        />
        {/*
          ÇAPRAZ ÇİZGİ BACAKLARDAN İNCE. Logoda da öyle; eşit kalınlıkta
          çizmek harfi tıkanık gösteriyor ve 16 pikselde iç boşluk kapanıyor.
        */}
        <path d="M30 63 L70 63" stroke="#ffffff" strokeWidth="13" strokeLinecap="butt" />
      </svg>
    </div>
  );
}
