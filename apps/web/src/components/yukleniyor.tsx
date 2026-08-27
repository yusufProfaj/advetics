'use client';

import { createPortal } from 'react-dom';

/**
 * ═══ YÜKLENİYOR GÖSTERGELERİ ═══
 *
 * Panelde bir tıklamanın ardından veri beklenirken ekranda hiçbir şey
 * olmuyordu. Kullanıcının tarifi: *"ufak veri getirme beklemesi yaşıyoruz bu
 * normal ama bunu belirten herhangi bir görsel yok"*.
 *
 * İki boy var ve ikisi farklı iş yapıyor:
 *   · `Nokta`   — düğmenin İÇİNDE, o düğmenin işini beklerken. Ekranı
 *     kaplamıyor çünkü kullanıcı başka bir şey yapabilir.
 *   · `TamEkranYukleniyor` — workspace değiştirmek gibi SAYFANIN TAMAMINI
 *     tazeleyen işlerde. Burada başka bir şey yapmak zaten anlamsız ve
 *     ekranın yarısı eski müşterinin verisini gösterirken tıklanabilir
 *     kalması, yanlış müşteride işlem yapma riski.
 *
 * İŞARET MARKADAN: wordmark'ın "i"si üzerindeki kırmızı nokta.
 */

/** Düğme içi gösterge — metnin yanında, satır yüksekliğini bozmadan. */
export function Nokta({ className = '' }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Yükleniyor"
      className={`inline-flex items-center gap-0.5 align-middle ${className}`}
    >
      {/*
        ÜÇ NOKTA, GECİKMELİ. Tek bir dönen halka da olurdu ama nokta markanın
        kendi işareti ve üç nokta "bekleniyor" duygusunu daha doğrudan
        veriyor. Gecikmeler satır içinde yazılı: ayrı bir sınıf üretmek üç
        neredeyse aynı CSS kuralı demekti.
      */}
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="advetics-nokta block h-1.5 w-1.5 rounded-full bg-[var(--brand-primary)]"
          style={{ animationDelay: `${i * 0.14}s` }}
        />
      ))}
    </span>
  );
}

/** Dönen halka — nokta üçlüsünün sığmadığı dar yerlerde (ikon düğmeleri). */
export function Halka({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Yükleniyor"
      className={`advetics-donus inline-block shrink-0 rounded-full border-2 border-[var(--brand-primary)] border-t-transparent ${className}`}
    />
  );
}

/**
 * Tam ekran bekleme — logo, tarama bandı ve ne beklendiğini yazan satır.
 *
 * NE BEKLENDİĞİ YAZILI. "Yükleniyor…" tek başına, üç saniye sonra "takıldı
 * mı" sorusunu doğuruyor; "Ege Birlik Yapı'ya geçiliyor" ise bekleyişi
 * anlamlı kılıyor ve yanlış müşteriye tıklandığında bunu HEMEN gösteriyor.
 */
export function TamEkranYukleniyor({ mesaj }: { mesaj: string }) {
  /*
   * ═══ PORTAL ZORUNLU ═══
   *
   * Bu bileşenin ilk hâli `fixed inset-0` ile ekranın tamamını kapladığını
   * sanıyordu; ekranda ise ÜST BARIN İÇİNDE, başlığın 64 puntoluk kutusuna
   * sıkışmış olarak çıkıyordu.
   *
   * Sebep: müşteri seçici `<header>`ın içinde ve o başlıkta `backdrop-blur`
   * var. `backdrop-filter` — tıpkı `transform` ve `filter` gibi — SABİT
   * konumlu alt öğeler için KAPSAYICI BLOK oluşturuyor, yani `fixed` artık
   * görüntü alanına değil o kutuya göre konumlanıyor. Aynı tuzağa yönetim
   * paneli penceresinde de düşülmüştü (`yonetim-paneli.tsx`).
   *
   * Ağaçtan çıkmak tek güvenilir yol: hangi bileşenin içinden çağrılırsa
   * çağrılsın (üst bar, ızgara hücresi, `filter` taşıyan bir sarmalayıcı)
   * örtü ekranın tamamını kaplıyor.
   *
   * SSR'DA `document` YOK. Bileşen yalnızca kullanıcı etkileşiminden sonra
   * görünüyor, yani sunucuda render edilmiyor — ama koşulu yazmamak, ileride
   * varsayılan açık bir kullanım eklendiğinde sunucuda çöken bir sayfa
   * demekti.
   */
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      /*
        BULANIKLIK ARTIRILDI (sm → md) ve zemin biraz saydamlaştırıldı.
        `sm` neredeyse görünmüyordu ve örtünün altındaki tablo hâlâ okunur
        kalıyordu; okunur kalan bir tablo, kullanıcıya "hâlâ eski müşterinin
        verisi" ile "yeni müşteri geldi" arasında ayrım yapamadığı bir an
        bırakıyor.
      */
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-surface/70 backdrop-blur-md"
    >
      {/*
        LOGO DEPODAKİ DOSYADAN, `branding.logoUrl`DEN DEĞİL.
        Bu gösterge ajansın markasını değil ÜRÜNÜN kendisini temsil ediyor:
        beyaz etiketli kurulumda bile "sistem çalışıyor" mesajını veren şey
        Advetics. Rapor kapağındaki kararla aynı yönde.

        `next/image` KULLANILMIYOR: bu bileşen bekleme anında görünüyor ve
        optimizasyon hattına bir tur daha eklemek, göstergenin kendisinin geç
        gelmesi demekti.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/advetics-logo.png" alt="Advetics" className="h-6 w-auto opacity-90" />

      <span className="relative block h-0.5 w-40 overflow-hidden rounded-full bg-surface-sunken">
        <span className="advetics-tarama absolute inset-y-0 left-0 w-1/3 rounded-full bg-[var(--brand-primary)]" />
      </span>

      <span className="text-xs text-ink-muted">{mesaj}</span>
    </div>,
    document.body,
  );
}
