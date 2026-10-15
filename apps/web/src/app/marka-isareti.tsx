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
 * ═══ İŞARET: KENETLENEN İKİ KÖŞEBENT (2026-10-15) ═══
 *
 * Siyah köşebent sol üstte, kırmızı köşebent sağ altta; birbirine kenetlenip
 * bir kare kuruyor. Profaj kılavuzunun çizgi dili: kalın, köşeli, sivri
 * kenarlı, yuvarlak köşe YOK. Kullanıcı yedi taslak arasından seçti
 * (`docs/marka/taslaklar/advetics-logo-taslak.html`, seçenek 5).
 *
 * NEDEN DEĞİŞTİ: önceki işaret kırmızı karede yükselen ÜÇ YUVARLAK ÇUBUKTU
 * ve Google Analytics simgesinin neredeyse aynısıydı. Google'ın OAuth marka
 * incelemesi *"Your logo does not uniquely identify your brand"* ile iki kez
 * reddetti; inceleme ana sayfayı açıyor ve menüde bu işareti görüyordu.
 * Yeni bir işaret çizerken tanınmış bir markaya (özellikle Google'ın
 * ürünlerine) benzemediğini kontrol et — ret sebebi kodda değil o benzerlikte.
 *
 * KOORDİNATLAR TEK YERDE. Sekme ikonu (satori) ve menüdeki logo
 * (`components/advetics-logo.tsx`) aynı yolları buradan okuyor; ayrı
 * yazılsalardı sekme ile menü farklı logo gösterirdi ve bu bir kez oldu.
 * `viewBox` 100×100, yani ölçü kenar uzunluğundan bağımsız.
 */
export const ISARET_VIEWBOX = '0 0 100 100';
export const ISARET_SIYAH_YOL = 'M8 8H64V24H24V64H8Z';
export const ISARET_KIRMIZI_YOL = 'M92 92H36V76H76V36H92Z';

/**
 * ZEMİN BEYAZ, İŞARET SİYAH + KIRMIZI — kılavuzdaki ilk kullanım.
 *
 * Google onay ekranına yüklenen logo da bu (`docs/marka/google-oauth/`):
 * incelemenin baktığı üç yer (onay ekranı, sekme, menü) aynı işareti
 * göstermeli. Beyaz kare, koyu temalı sekme şeridinde de görünüyor; açık
 * şeritte zemin kaybolsa bile siyah ve kırmızı parça kalıyor. Önceki
 * sürümün kırmızı dolgusu bu yüzden gerekmiyor.
 *
 * KÖŞE SİVRİ. Kılavuzun kutuları keskin; iOS ana ekran ikonunu kendisi
 * yuvarlatıyor, buradan yuvarlamak ikinci kez kırpmak olurdu.
 */
/*
 * `_kenar` İMZADA KALDI: çağıranlar (`icon.tsx`, `apple-icon.tsx`) boyutu
 * geçiriyor ve `marka-isareti.spec.ts` bunu kilitliyor. Çizim yüzde ve
 * `viewBox` ile ölçeklendiği için artık kullanılmıyor.
 */
export function markaIsareti(_kenar: number): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        background: '#ffffff',
      }}
    >
      {/*
        DOLGU KENARA ORANLI. %78: 16 piksellik sekmede çizgiler ~2 piksel
        kalınlığında kalıyor ve kenetlenme seçilebiliyor; daha küçük çizim
        iki köşebenti tek bir lekeye çeviriyor.
      */}
      <svg width="78%" height="78%" viewBox={ISARET_VIEWBOX} fill="none">
        <path d={ISARET_SIYAH_YOL} fill="#000000" />
        <path d={ISARET_KIRMIZI_YOL} fill={ADVETICS_KIRMIZI} />
      </svg>
    </div>
  );
}
