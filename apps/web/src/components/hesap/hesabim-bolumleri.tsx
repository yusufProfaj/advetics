'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { SayfaIcDuzen, SayfaIcMenu } from '@/components/ui/sayfa-ic-menu';

/**
 * ═══ HESABIM BÖLÜMLERİ — SAYFA İÇİ YAN MENÜ (taslak `#hesabim`) ═══
 *
 * Hesabım tek uzun sayfaydı: giriş ve güvenlik, e-posta, okuma API alt
 * alta. Kullanıcı kartındaki "İki adımlı giriş" sayfanın başına, eski
 * `/ayarlar/e-posta` adresi ortasına düşüyordu ve bölümler arası geçiş
 * kaydırmaktan ibaretti. Bugün solda üç bölüm, sağda biri.
 *
 * BÖLÜM ADRESTEKİ ÇAPADA (`#e-posta`). Çapalar sözleşmede
 * (`AYARLAR_CAPALARI.hesabim`) ve eski adres yönlendirmeleri, Kurulum ve
 * kullanıcı menüsü onlara bağlanıyor; yeni bir `?bolum=` parametresi
 * yazmak o bağlantıların hepsini değiştirmek demekti. Açılışta çapa
 * okunuyor ve o bölüm seçiliyor.
 *
 * BÖLÜMLER SAYFADA (`children`, her biri `<section id=…>`), seçili olmayanlar
 * CSS ile gizli (CLAUDE.md §3 Tasarım: açılıp kapanan öğe DOM'dan çıkmaz).
 * Bölümler sunucu bileşeninde JSX olarak kalıyor ki kapıları (`okumaApiAcik`)
 * içeriğin hemen önünde dursun; burada bir dizi olarak taşınsaydı kapı
 * içerikten koparılırdı. Gizleme seçicisi bölümün KİMLİĞİNE bakıyor
 * (`data-secili` + `#kimlik`): yeni bir bölüm eklenirse aşağıdaki
 * `GIZLE` listesine de eklenmeli.
 *
 * NEXT `Link` AYNI SAYFADA YALNIZ ÇAPA DEĞİŞİNCE `hashchange` ATMIYOR
 * (`pushState` kullanıyor): Hesabım açıkken kullanıcı menüsünden "İki
 * adımlı giriş"e basmak hiçbir şey yapmıyordu. Aynı sayfaya giden çapalı
 * bağlantıların tıklaması da dinleniyor.
 */
export interface HesabimBolumu {
  deger: string;
  etiket: string;
  /** Kırmızı nokta: bu bölümde yapılacak iş var (doğrulanmamış e-posta…). */
  uyari?: boolean;
  sayi?: number;
}

/*
 * SABİT SINIFLAR: Tailwind sınıfları derleme anında taranıyor, çalışma
 * anında birleştirilen bir sınıf adı CSS üretmez. Her bölüm için bir satır.
 */
const GIZLE =
  'data-[secili=guvenlik]:[&>section:not(#guvenlik)]:hidden ' +
  'data-[secili=e-posta]:[&>section:not(#e-posta)]:hidden ' +
  'data-[secili=okuma-api]:[&>section:not(#okuma-api)]:hidden';

export function HesabimBolumleri({ bolumler, children }: { bolumler: HesabimBolumu[]; children: ReactNode }) {
  const [secili, setSecili] = useState(bolumler[0]?.deger ?? '');
  const anahtar = bolumler.map((b) => b.deger).join('|');

  useEffect(() => {
    const gecerli = anahtar.split('|');
    const capadan = (hash: string): string | null => {
      const h = decodeURIComponent(hash.replace(/^#/, ''));
      return gecerli.includes(h) ? h : null;
    };
    const ilk = capadan(window.location.hash);
    if (ilk) setSecili(ilk);

    function capaDegisti(): void {
      const h = capadan(window.location.hash);
      if (h) setSecili(h);
    }
    function tiklama(e: MouseEvent): void {
      const a = (e.target as Element | null)?.closest?.('a[href*="#"]');
      if (!(a instanceof HTMLAnchorElement)) return;
      const hedef = new URL(a.href, window.location.href);
      if (hedef.pathname !== window.location.pathname) return;
      const h = capadan(hedef.hash);
      if (h) setSecili(h);
    }
    window.addEventListener('hashchange', capaDegisti);
    // GERİ/İLERİ: Next `Link` çapayı `pushState` ile yazıyor ve o girdiye
    // geri dönmek `hashchange` DEĞİL `popstate` atıyor; dinlenmezse adres
    // `#guvenlik` derken ekran önceki bölümde kalıyordu.
    window.addEventListener('popstate', capaDegisti);
    document.addEventListener('click', tiklama);
    return () => {
      window.removeEventListener('hashchange', capaDegisti);
      window.removeEventListener('popstate', capaDegisti);
      document.removeEventListener('click', tiklama);
    };
  }, [anahtar]);

  /*
   * SEÇİM ADRESE YAZILIYOR (`replaceState`, yeni geçmiş girdisi DEĞİL):
   * sayfayı yenileyen ya da bağlantıyı paylaşan kişi aynı bölümde kalıyor;
   * geri tuşu ise bölümler arasında değil önceki sayfaya dönüyor.
   */
  function sec(deger: string): void {
    setSecili(deger);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${deger}`);
  }

  return (
    <SayfaIcDuzen
      menu={<SayfaIcMenu etiket="Hesabım bölümleri" secili={secili} onSec={sec} ogeler={bolumler} />}
    >
      <div data-secili={secili} className={`grid min-w-0 content-start gap-5 ${GIZLE}`}>
        {children}
      </div>
    </SayfaIcDuzen>
  );
}
