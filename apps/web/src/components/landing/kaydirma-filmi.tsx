'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import {
  ETIKETLER,
  FILM,
  KARTLAR,
  SAYAC_BASLANGICI,
  bicimle,
  bolumIlerlemesi,
  kartKutusu,
  sayacDegerleri,
  sayacOpakligi,
  videoSaniyesi,
  type SayacAnahtari,
} from './film-matematigi';

/**
 * ═══ KAYDIRMAYLA İLERLEYEN HERO FİLMİ ═══
 *
 * Ziyaretçi kaydırdıkça dağınık reklam hesapları tek panelde birleşiyor ve
 * ROAS / Form / Mesaj sayaçları tırmanıyor.
 *
 * ┌─ BU BİLEŞEN TANITIM SAYFASINA JAVASCRIPT SOKUYOR ─────────────────────┐
 * │ `page.tsx` bilerek sıfır istemci JavaScript'i taşıyordu ve gerekçesi   │
 * │ oradaki yorumda yazılı: ilk boyama hızı doğrudan dönüşüm ve SEO.       │
 * │ Bu bileşen o kararı KISMEN geri alıyor ve sınırı şurada tutuyor:       │
 * │                                                                       │
 * │  · Başlık, paragraf ve BUTONLAR `children` olarak geliyor, yani        │
 * │    sunucuda render ediliyor ve istemci paketine HİÇ girmiyor. LCP      │
 * │    metin oluyor, video değil.                                         │
 * │  · Video `src` niteliğini ancak effect veriyor: mobil ve              │
 * │    `prefers-reduced-motion` açık olan ziyaretçi 5,3 MB'ı HİÇ           │
 * │    indirmiyor.                                                        │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * Sayaç rakamları videoya GÖMÜLMÜYOR, DOM'dan basılıyor. Sebep modelin
 * sınırı: Veo rakam ve Türkçe harf yazamıyor — her karede başka bir şey
 * çiziyor, `ğ ş ı` bozuk glif oluyor. Video boş kart yuvaları bırakıyor,
 * sayaçlar onların üstüne oturuyor. Kartların ölçülen konumu
 * `film-matematigi.ts` içinde.
 */

/** Masaüstü eşiği — Tailwind `lg` ile AYNI olmak zorunda (aşağıdaki sınıflar). */
const MASAUSTU = '(min-width: 1024px)';

export function KaydirmaFilmi({ children }: { children: ReactNode }) {
  const bolumRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const katmanRef = useRef<HTMLDivElement | null>(null);
  const sayacRef = useRef<Partial<Record<SayacAnahtari, HTMLSpanElement | null>>>({});

  useEffect(() => {
    const bolum = bolumRef.current;
    const video = videoRef.current;
    const katman = katmanRef.current;
    if (!bolum || !video || !katman) return;

    const azHareket = window.matchMedia('(prefers-reduced-motion: reduce)');
    const genis = window.matchMedia(MASAUSTU);

    /** Sayaçları ve katman opaklığını tek yerden yazar. */
    const yaz = (s: number) => {
      const d = sayacDegerleri(s);
      for (const kart of KARTLAR) {
        const el = sayacRef.current[kart.anahtar];
        if (el) el.textContent = bicimle(kart.anahtar, d[kart.anahtar]);
      }
      katman.style.opacity = String(sayacOpakligi(s));
    };

    /*
     * SAYAÇLAR REACT DURUMUNDA TUTULMUYOR.
     *
     * Kaydırma boyunca saniyede ~60 kez değişiyorlar; her değişimde yeniden
     * render etmek bütün ağacı her karede dolaştırmak demek ve kaydırma
     * takılıyor. Metin doğrudan DOM'a yazılıyor — React'in yeniden render
     * edeceği bir şey yok.
     */

    /**
     * ═══ DAL SEÇİMİ TEK SEFERLİK OLAMAZ ═══
     *
     * İlk yazımda `matchMedia` yalnızca mount anında okunuyordu ve dal orada
     * donuyordu. Tarayıcıda yakalandı: sayfa dar bir pencerede yüklenip
     * sonra genişletildiğinde bileşen MOBİL dalında kalıyor — video hiç
     * indirilmiyor, sayaçlar bir kez sayıp duruyor ve kaydırma filmi HİÇ
     * çalışmıyor. Hiçbir hata düşmüyor; sayfa yalnızca "hareketsiz" görünüyor.
     *
     * Gerçek kullanıcıda da oluyor: pencereyi büyütmek, tableti döndürmek,
     * masaüstünde geliştirici araçlarını açıp kapatmak. Kurulum artık medya
     * sorgusu değiştiğinde SÖKÜLÜP yeniden yapılıyor.
     */
    type Mod = 'az-hareket' | 'dar' | 'genis';
    const modu = (): Mod =>
      azHareket.matches ? 'az-hareket' : genis.matches ? 'genis' : 'dar';

    const kurulum = (mod: Mod): (() => void) | undefined => {
      // ── Hareket azaltılmışsa: video yok, sayaçlar son değerinde ────────
      if (mod === 'az-hareket') {
        yaz(1);
        katman.style.opacity = '1';
        return undefined;
      }

      // ── Mobil / dar ekran: video indirilmiyor, sayaçlar bir kez sayıyor ─
      if (mod === 'dar') {
        /*
         * MOBİLDE KAYDIRMAYA BAĞLAMIYORUZ. iOS'ta video arama takılıyor,
         * Düşük Güç Modu oynatmayı tamamen engelliyor ve 5,3 MB mobil
         * veriyle ödenemez. Poster duruyor, sayaçlar görünür olunca bir kez
         * sayıyor — anlatının sonucu korunuyor, yalnızca arka plan sabit.
         */
        let iptal = 0;
        const gozcu = new IntersectionObserver(
          (girisler) => {
            if (!girisler.some((g) => g.isIntersecting)) return;
            gozcu.disconnect();
            const sure = 1400;
            const bas = performance.now();
            const adim = (simdi: number) => {
              const o = Math.min(1, (simdi - bas) / sure);
              // Kaydırma eşiğini taklit et: 0 → SAYAC_BASLANGICI atlanıyor.
              yaz(SAYAC_BASLANGICI + (1 - SAYAC_BASLANGICI) * o);
              if (o < 1) iptal = requestAnimationFrame(adim);
            };
            iptal = requestAnimationFrame(adim);
          },
          { threshold: 0.35 },
        );
        gozcu.observe(katman);
        yaz(0);
        return () => {
          gozcu.disconnect();
          cancelAnimationFrame(iptal);
        };
      }

      // ── Masaüstü: kaydırmayla tarama ───────────────────────────────────
      /*
       * `preload` BURADA AÇILIYOR, işaretlemede değil.
       *
       * Etiket `preload="none"` ile geliyor: mobil ve hareket azaltılmış
       * ziyaretçi 5,3 MB'ı hiç indirmesin. Ama `none` kaldığında tarayıcı
       * `src` verilse ve `load()` çağrılsa bile VERİ İNDİRMİYOR:
       * `loadeddata` hiç ateşlenmiyor, `readyState` 0'da kalıyor ve film
       * kaydırırken posterde donuyor. Hiçbir hata düşmüyor — ilk denememde
       * tam olarak bu oldu ve yalnızca `readyState`e bakınca görüldü.
       */
      video.preload = 'auto';
      if (!video.src) {
        video.src = '/hero/hero.mp4';
        video.load();
      }

      let hedef = 0;
      let suanki = 0;
      let calisiyor = false;
      let hazir = video.readyState >= 2;

      /*
       * `currentTime`A HER KAYDIRMA OLAYINDA YAZILMIYOR.
       *
       * Doğrudan atamak Safari'de arama kuyruğunu dolduruyor ve görüntü
       * takılıyor. Hedefe doğru yumuşatılıyor ve fark ihmal edilebilir hâle
       * gelince döngü duruyor — boşta hiçbir kare harcanmıyor.
       */
      const dongu = () => {
        suanki += (hedef - suanki) * 0.12;
        if (Math.abs(hedef - suanki) > 0.004) {
          if (hazir) video.currentTime = suanki;
          requestAnimationFrame(dongu);
        } else {
          if (hazir) video.currentTime = hedef;
          calisiyor = false;
        }
      };

      const kaydirildi = () => {
        const r = bolum.getBoundingClientRect();
        const s = bolumIlerlemesi(r.top, r.height, window.innerHeight);
        hedef = videoSaniyesi(s);
        yaz(s);
        if (!calisiyor) {
          calisiyor = true;
          requestAnimationFrame(dongu);
        }
      };

      const hazirOldu = () => {
        hazir = true;
        video.currentTime = hedef;
      };

      video.addEventListener('loadeddata', hazirOldu);
      window.addEventListener('scroll', kaydirildi, { passive: true });
      window.addEventListener('resize', kaydirildi);
      kaydirildi();

      return () => {
        video.removeEventListener('loadeddata', hazirOldu);
        window.removeEventListener('scroll', kaydirildi);
        window.removeEventListener('resize', kaydirildi);
      };
    };

    /*
     * ═══ DAL `resize` ÜZERİNDEN SENKRONLANIYOR, `change` ÜZERİNDEN DEĞİL ═══
     *
     * `matchMedia(...).addEventListener('change', …)` doğru API ve çoğu yerde
     * çalışıyor; ama tarayıcı görünüm emülasyonuyla sınarken olayın HİÇ
     * yayılmadığı akışlar görüldü (sayfa yeniden yüklendikten hemen sonra
     * genişletmek). `resize` o akışlarda da ateşliyor. Genişlik dalı buna
     * bağlandı; `prefers-reduced-motion` `resize` üretmediği için o hâlâ
     * `change` dinliyor.
     *
     * Mod DEĞİŞMEDİYSE hiçbir şey yapılmıyor: `resize` sürükleme boyunca
     * onlarca kez ateşliyor ve her seferinde videoyu yeniden kurmak onu
     * baştan indirmek olurdu.
     */
    let mevcutMod: Mod | null = null;
    let temizle: (() => void) | undefined;

    const senkronla = () => {
      const m = modu();
      if (m === mevcutMod) return;
      mevcutMod = m;
      temizle?.();
      temizle = kurulum(m);
    };

    window.addEventListener('resize', senkronla);
    azHareket.addEventListener('change', senkronla);
    senkronla();

    return () => {
      temizle?.();
      window.removeEventListener('resize', senkronla);
      azHareket.removeEventListener('change', senkronla);
    };
  }, []);

  return (
    <section
      ref={bolumRef}
      className="relative bg-surface lg:h-[500vh]"
      aria-labelledby="hero-baslik"
    >
      {/*
        Yapışkan sahne üst çubuğun ALTINDA duruyor: `SiteNav` `sticky top-0`
        ve `h-16`. `top-16` yazılmazsa sahne çubuğun arkasına giriyor ve
        başlığın ilk satırı kayboluyor.
      */}
      <div className="lg:sticky lg:top-16 lg:flex lg:h-[calc(100dvh-4rem)] lg:items-center">
        <div className="mx-auto grid w-full max-w-[84rem] gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:items-center lg:gap-14 lg:py-0">
          {/*
            METİN VE BUTONLAR SUNUCUDAN GELİYOR (`children`).

            Ayrıca videonun ÜSTÜNDE değil YANINDA duruyorlar. Videonun üstüne
            koymak denenebilirdi ama film neredeyse tamamen beyaz ve panelin
            yerleşimi kadraja göre değişiyor; butonu oraya koymak, onu bazı
            ekranlarda kartların üstüne düşürürdü. Kendi sütununda düz zemin
            üzerinde duran bir buton HER ekranda okunur.
          */}
          <div className="max-w-xl lg:max-w-none">{children}</div>

          {/* Film sütunu */}
          <div>
            <div className="relative overflow-hidden rounded-2xl border border-line bg-white">
              {/*
                16:9 ORAN KUTUSU — sayaç yüzdelerinin doğru çalışmasının şartı.

                `object-cover` kullanılsaydı video kırpılır, kartlar kutunun
                yüzdesiyle ARTIK AYNI YERDE OLMAZDI ve sayaçlar geniş ekranda
                kartların dışına kayardı. Kırpmamanın bedeli kenarlarda boşluk
                bırakmak; film neredeyse tamamen beyaz ve zemin de beyaz
                olduğu için o boşluk görünmüyor.
              */}
              <video
                ref={videoRef}
                /*
                  KOYU TEMADA HAFİFÇE KISILIYOR. Film sabit beyaz ve koyu
                  zeminde tam parlaklıkta bir ışık kaynağı gibi duruyordu;
                  %90'a çekmek onu "ışık" olmaktan çıkarıp çerçeveli bir nesne
                  hâline getiriyor. Daha fazla kısmak sayaçların altındaki
                  kontrastı düşürürdü.
                */
                className="block aspect-video w-full bg-white dark:brightness-90"
                poster="/hero/hero-poster.jpg"
                muted
                playsInline
                preload="none"
                /* Dekoratif: anlatılan her şey yanındaki metinde ve sayaçlarda. */
                aria-hidden
                tabIndex={-1}
              />

              {/* Sayaç katmanı — kartların ÖLÇÜLEN konumları */}
              <div
                ref={katmanRef}
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 motion-reduce:transition-none"
              >
                {KARTLAR.map((kart) => (
                  <div
                    key={kart.anahtar}
                    className="absolute flex flex-col items-center justify-center text-center"
                    style={kartKutusu(kart)}
                  >
                    {/*
                      ═══ RENK TEMAYA DEĞİL VİDEOYA BAĞLI ═══

                      `text-ink` YAZILAMAZ. O belirteç koyu temada beyaza
                      dönüyor (globals.css) ama ALTINDAKİ VİDEO her zaman
                      beyaz — sayaçlar koyu temada görünmez oluyordu. Metin
                      temanın değil, üstünde durduğu yüzeyin dünyasına ait;
                      değerler `--text` ve `--text-muted` belirteçlerinin
                      AÇIK tema karşılıkları.
                    */}
                    <span
                      ref={(el) => {
                        sayacRef.current[kart.anahtar] = el;
                      }}
                      className="text-2xl font-black leading-none tracking-tight text-[#14161c] tabular-nums sm:text-3xl lg:text-[clamp(1.5rem,2.6vw,2.75rem)]"
                    >
                      {/* Sunucuda basılan ilk değer — JavaScript gelmeden de
                          kutular boş görünmesin. */}
                      {bicimle(kart.anahtar, sayacDegerleri(1)[kart.anahtar])}
                    </span>
                    <span className="mt-2 text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-[#374151] sm:text-xs">
                      {ETIKETLER[kart.anahtar]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/*
              ÖRNEK VERİ OLDUĞU YAZILI.

              Rakamlar gerçekçi büyüklükler ama bir müşterinin gerçek verisi
              değil. Yazmamak, ana sayfada bir performans VAADİ vermek olurdu.
            */}
            <p className="mt-3 text-xs text-ink-muted">
              Örnek veriler — gerçek bir hesabın rakamları değildir.
            </p>
          </div>
        </div>
      </div>

      {/*
        Filmin süresi ve çözünürlüğü kodda bir yerde DURMAK ZORUNDA: eşleme
        tablosu (`NOKTALAR`) buna göre yazıldı ve kaynak yeniden montajlanıp
        süre değişirse sayaçlar sessizce yanlış saniyeye bağlanır.
      */}
      <span hidden data-film-suresi={FILM.sure} data-film-karesi={`${FILM.kareEn}x${FILM.kareBoy}`} />
    </section>
  );
}
