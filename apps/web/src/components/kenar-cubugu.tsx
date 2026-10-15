import type { NavEntry } from '@/components/nav';
import { NavSection, AyarlarSatiri } from '@/components/nav';
import { kenarBolumleri } from '@/lib/nav-sections';
import { ayarlarAdresi } from '@/lib/panel-adresleri';
import type { OlusturSecenegi } from '@/lib/olustur-menusu';
import { CikisOgesi } from '@/components/logout-button';
import { AdveticsLogo } from '@/components/advetics-logo';
import { KullaniciMenusu, OlusturMenusu } from '@/components/kabuk-menuleri';
import { TemaOgesi } from '@/components/tema';
import { MenuAyraci, MenuOgesi } from '@/components/ui/acilir-menu';
import { Ikon } from '@/components/ui/ikon';
import { KaydirilanMenu } from '@/components/kaydirilan-menu';

export interface KenarVerisi {
  bolumler: Array<{ title?: string; items: NavEntry[] }>;
  sirketAdi: string;
  logoUrl: string | null;
  kullaniciAdi: string;
  rolEtiketi: string;
  /** "+ Oluştur" seçenekleri, yetkiye göre süzülmüş; boşsa düğme yok. */
  olustur: OlusturSecenegi[];
  /**
   * Kullanıcı menüsünün metni, ekranın dilinde. Bileşen hem sunucuda hem
   * mobil çekmecede (istemci) çiziliyor; sözlüğü kendisi okuyamıyor, metin
   * veriyle geliyor.
   */
  etiketler: { hesabim: string; ikiAdim: string };
}

/**
 * Kenar çubuğunun İÇERİĞİ.
 *
 * AYRI DOSYADA ÇÜNKÜ İKİ YERDE ÇİZİLİYOR: masaüstünde sabit sütun,
 * mobilde çekmece. Markup iki yere kopyalansaydı biri güncellenmediğinde
 * telefondaki menü masaüstündekinden farklı olurdu ve bunu yalnızca telefonla
 * giren kullanıcı görürdü.
 *
 * `'use client'` YOK: burada istemciye özel bir şey yapmıyor. Durum tutan
 * parçalar (`NavSection`, açılır menüler) zaten istemci bileşeni.
 *
 * ═══ DÜZEN (menü kararı 2026-10-14, `docs/marka/menu-sistemi.html`) ═══
 * Yukarıdan aşağı: logo → workspace seçici → TEK kırmızı "+ Oluştur" →
 * grup başlıklı yedi bölüm (seçili öğe kırmızı zemin + kırmızı ikon, bekleyen
 * iş sayacı) → Ayarlar → sol altta kullanıcı kartı (Hesabım, iki adımlı
 * giriş, tema, çıkış). Kullanıcı nereye tıklayacağını aramaz: dört katman her
 * ekranda aynı yerde.
 */
export function KenarIcerigi({
  veri,
  onGezinme,
  ust,
}: {
  veri: KenarVerisi;
  onGezinme?: () => void;
  /**
   * Logonun altında, menünün üstünde (masaüstünde workspace seçici,
   * kullanıcı kararı 2026-10-11: "neredeyim" sorusu menünün başında).
   */
  ust?: React.ReactNode;
}) {
  const { bolumler, ayarlar } = kenarBolumleri(veri.bolumler);
  return (
    <>
      <div className="grid shrink-0 gap-3 px-3.5 pb-2.5 pt-4">
        <div className="flex h-9 items-center px-1.5">
          {veri.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={veri.logoUrl} alt="" className="h-8 max-w-[150px] object-contain" />
          ) : (
            <AdveticsLogo />
          )}
        </div>

        {ust && <div className="min-w-0">{ust}</div>}

        {/*
          + OLUŞTUR SEÇİCİNİN ALTINDA: "nerede çalışıyorum" sorusu önce,
          "ne yapacağım" sonra. Müşteri hesabında liste boş ve düğme yok.
        */}
        <OlusturMenusu secenekler={veri.olustur} onGezinme={onGezinme} />
      </div>

      <KaydirilanMenu
        className="flex-1 scroll-pb-8 overflow-y-auto px-2.5 pb-2.5 [mask-image:linear-gradient(to_bottom,black_calc(100%-1.5rem),transparent)]"
        onClick={onGezinme}
      >
        {/*
          MENÜ YETKİYE GÖRE SÜZÜLÜYOR ve bölüm boş kalırsa başlığı da
          basılmıyor. Liste bir süre filtresizdi: müşteri hesabı ajansın iç
          ekranlarını menüde görüyordu. Arka uç zaten reddediyordu, yani veri
          sızmıyordu; ama o ekranların VARLIĞI sızıyordu.

          `onGezinme` ÇEKMECE İÇİN: bir bağlantıya basınca çekmece kapanmalı,
          yoksa yeni sayfa menünün arkasında açılıyor.
        */}
        {/* İlk bölüm başlıksız ve `key={undefined}` React'te uyarı üretiyordu. */}
        {bolumler.map((section, i) => (
          <NavSection key={section.title ?? `bolum-${i}`} title={section.title} items={section.items} />
        ))}
      </KaydirilanMenu>

      {/*
        AYARLAR MENÜNÜN ALTINDA, TEK SATIR. Yedi ayar ekranı menünün yarısını
        kaplıyordu; içerideki sekmeler aynı yetki listesinden çiziliyor.
        Menünün alt kenarı SOLARAK bitiyor (`mask-image`): alçak ekranda son
        satır burada yarım kesiliyordu ve kesik bir satır hata gibi okunuyor.
      */}
      {ayarlar.length > 0 && (
        <div className="px-2.5 pb-1.5" onClick={onGezinme}>
          <AyarlarSatiri sayfalar={ayarlar} />
        </div>
      )}

      {/*
        KULLANICI KARTI SOL ALTTA ve bir menü açıyor (menü kararı 2026-10-14).
        Hesabım ayrı bir menü satırı değil: herkesin kendi sayfası ve menü
        yetkiye göre süzülen İŞ ekranlarının listesi. `onGezinme` çekmeceyi
        kapatıyor, yoksa sayfa menünün arkasında açılır.
      */}
      <div className="border-t border-line p-2.5">
        <KullaniciMenusu ad={veri.kullaniciAdi} rol={veri.rolEtiketi}>
          <MenuOgesi ikon={<Ikon ad="kisi" />} href={ayarlarAdresi('hesabim')} onClick={onGezinme}>
            {veri.etiketler.hesabim}
          </MenuOgesi>
          <MenuOgesi
            ikon={<Ikon ad="kalkan" />}
            href={ayarlarAdresi('hesabim', { capa: 'guvenlik' })}
            onClick={onGezinme}
          >
            {veri.etiketler.ikiAdim}
          </MenuOgesi>
          <TemaOgesi />
          <MenuAyraci />
          <CikisOgesi />
        </KullaniciMenusu>
      </div>
    </>
  );
}
