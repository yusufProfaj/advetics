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
        ═══ İŞARET HARF DEĞİL, VERİ (2026-10-06) ═══

        Kullanıcının isteği: "veri ile ilgili bir ikon". Yükselen üç çubuk —
        Advetics'in işi ölçmek ve büyütmek. Yazı logosu (`advetics-logo.png`)
        aynı kaldı; değişen yalnızca kare işaretin içi.

        ÇUBUKLAR KALIN ve ARALARI GENİŞ: 16 piksellik sekme ikonunda ince
        çubuklar birbirine yapışıp tek bir blok gibi görünüyor. Koordinatlar
        100×100 `viewBox`ta, kenardan bağımsız.
      */}
      <svg width="64%" height="64%" viewBox="0 0 100 100" fill="none">
        <rect x="6" y="56" width="22" height="38" rx="5" fill="#ffffff" />
        <rect x="39" y="32" width="22" height="62" rx="5" fill="#ffffff" />
        <rect x="72" y="6" width="22" height="88" rx="5" fill="#ffffff" />
      </svg>
    </div>
  );
}
