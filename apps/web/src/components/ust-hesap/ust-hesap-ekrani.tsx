'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { ManagerAccountTree } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { acilisAdresi, ayarlarAdresi } from '@/lib/panel-adresleri';
import { Halka } from '@/components/yukleniyor';
import { Kart } from '@/components/ui/kart';
import { Girdi } from '@/components/ui/alan';
import { Serit } from '@/components/ui/hal';
import { Pencere, YanPanel } from '@/components/ui/pencere';
import { MenuAyraci, MenuOgesi } from '@/components/ui/acilir-menu';
import { dugmeSinifi } from '@/components/ui/dugme';
import { DigerMenusu } from '@/components/ayar-sekmeleri';
import { SirketDuzenle } from './sirket-duzenle';
import { SirketSil } from './sirket-sil';
import { UstHesapKarti } from './ust-hesap-karti';

type Sirket = ManagerAccountTree['organizations'][number];

/**
 * ═══ ÜST HESAP (MCC) EKRANI — RAY + DETAY ═══
 *
 * Hiyerarşi: Üst Hesap → Şirket → Workspace → Reklam Hesabı → Kampanya.
 *
 * DÜZEN KART IZGARASIYDI VE KIRK ŞİRKETTE ÇÖKÜYORDU. Her şirket yaklaşık
 * 200 piksellik bir kart, iki kolonda: kırk şirket yirmi satır, dört bin
 * piksel kaydırma. Asıl iş (seçili şirketi ve workspace'lerini düzenlemek)
 * o kaydırmanın ALTINDA kalıyordu — kullanıcının cümlesiyle "hiç kullanışlı
 * değil".
 *
 * Üç somut arıza vardı:
 *
 *   1. ARAMA YOKTU. Kırk şirket arasında birini bulmak gözle taramak
 *      demekti; hangi workspace'in hangi şirkette olduğunu bulmak ise kırk
 *      kartı tek tek açmak.
 *   2. TAŞIMA SEÇİCİSİ HER KARTTAYDI ve içeriği DİĞER bütün şirketlerin
 *      workspace'leriydi: kırk şirket × kırk workspace = kırk bin `option`
 *      düğümü. Ekranı yavaşlatan şey buydu ve hiçbir yerde görünmüyordu.
 *   3. SEÇİLİ ŞİRKET KAYBOLUYORDU. "Şu an neredeyim" sorusu ancak doğru
 *      kartı bulunca cevaplanıyordu.
 *
 * Bugün: SOLDA aranabilir ve kaydırılan bir RAY (satır başına bir şirket),
 * SAĞDA seçili şirketin tamamı. Taşıma seçicisi ray'den çıkıp DETAYA taşındı
 * — orada tek bir tane var ve hedefi zaten seçili şirket.
 *
 * DETAY SUNUCUDA ÜRETİLİYOR. Şirket formu ve workspace bölümü birer sunucu
 * bileşeni ve `children` olarak geçiyor; bu kabuk yalnızca yerleşimi ve
 * ray'i yönetiyor. Onları istemciye taşımak, içlerindeki sunucu tarafı
 * çözümleri de taşımak olurdu.
 *
 * VAR OLAN BİR ŞİRKETİ BAĞLAMA YOK ve bu bilinçli (arka uçta da yok):
 * "şu şirketi üst hesabıma ekle" diyebilmek, başkasının şirketini kendi
 * erişim listesine yazmak demekti. Devir iki tarafın da onayını isteyen
 * ayrı bir akış gerektirir.
 */
export function UstHesapEkrani({
  ilkAgac,
  aktifOrgId,
  yuklemeHatasi,
  sirket,
  sirketHatasi,
  platformAdmin,
  ustHesapKurabilir,
  children,
}: {
  ilkAgac: ManagerAccountTree | null;
  /** Şu an SEÇİLİ şirket — ray'de işaretlemek ve taşıma hedefi için. */
  aktifOrgId: string;
  /** Ağaç okunamadıysa SEBEBİ — sessizce "üst hesap yok" göstermiyoruz. */
  yuklemeHatasi: string | null;
  /**
   * AKTİF ŞİRKETİN BİLGİSİ — `children` YERİNE PROP.
   *
   * Düzenleme formu bir süre `children` içinden geliyordu ve EKRANDA SÜREKLİ
   * AÇIKTI; taşıma kutusu da öyle. Kullanıcının tarifi: *"gereksiz ve karışık
   * duruyor … bu kadar açıkta durmasın."* Paneli katlayabilmek için açık/kapalı
   * durumunun bu bileşende olması gerekiyor — `children` sunucuda üretiliyor ve
   * buradan kontrol edilemez.
   */
  sirket: { id: string; name: string; slug: string } | null;
  sirketHatasi: string | null;
  /**
   * Advetics'i işleten taraf mı. Üst hesap şeridinden "Üst hesap ayarları"na
   * (aynı sayfadaki `#ust-hesaplar` kartı) yalnız o gidebiliyor; kart da
   * yalnız ona çiziliyor (`PANEL_KAPILARI['ustHesap.yonet']`).
   */
  platformAdmin: boolean;
  /**
   * "ÜST HESAP KUR" KİME ÇIKIYOR.
   *
   * Ağaç `null` iki ayrı hâl: bağımsız şirket (kendi ajansını kurabilir) ve
   * bir ajansın müşteri şirketi (üyeliği yok, kuramaz). İkincisine form
   * gösteriliyordu ve sunucu "Bu şirket zaten bir üst hesaba bağlı" ile
   * reddediyordu: müşteri üstünde bir katman olduğunu bir hata mesajından
   * öğreniyordu. Karar sunucudaki kapıyla aynı: ev şirketi bağlı mı.
   */
  ustHesapKurabilir: boolean;
  /** Workspace bölümü — sunucuda üretiliyor. */
  children: React.ReactNode;
}) {
  /*
   * AĞAÇ SUNUCUDAN GELİYOR ve bu bileşen onu değiştirmiyor: şirket
   * işlemleri (düzenle, sil) bitince sayfa sunucudan yeniden çiziliyor.
   * Taşıma bu ekrandan kalkınca istemcide tutulan kopya da gereksizleşti.
   */
  const agac = ilkAgac;
  /*
   * TEK SEFERDE TEK PANEL. İkisini birden açık bırakmak, ekranın yine
   * düzeltmeye çalıştığımız hâle dönmesi demekti.
   *
   * "WORKSPACE TAŞI" PANELİ BURADAN KALKTI (2026-10-13): taşıma artık
   * workspace SATIRININ eylemi (`workspace-satirlari.tsx`, MIMARI Ç-23).
   * İki ayrı yol aynı işi iki ayrı yerde yapıyordu ve bu ekran onu ters
   * yönden ("başka şirketten buraya çek") soruyordu.
   */
  const [panel, setPanel] = useState<'yok' | 'duzenle' | 'sil'>('yok');

  /*
   * ═══ ÜST HESAP KATMANI DÜŞSE DE DETAY ÇİZİLİYOR ═══
   *
   * Aşağıdaki iki hâlde de `children` render ediliyor ve bu ŞART: içinde
   * şirket formu ve WORKSPACE BÖLÜMÜ var. Erken `return`la geçmek,
   * `/manager-account` ucu düştüğünde ya da üst hesap hiç kurulmamışken
   * kullanıcının workspace'lerini TAMAMEN kaybetmesi demekti — üst hesap
   * bir ÜST katman, workspace yönetiminin ön koşulu değil.
   *
   * `!agac` — `agac === null` DEĞİL. Sayfa değeri `?? null` ile
   * normalleştiriyor ama bu bileşen tek çağıranına bağlı kalmamalı:
   * `undefined` geldiğinde eşitlik kontrolü false kalıyor ve ağaç
   * `agac.name` ile fırlıyor. Bir sayfa hatası, KULLANICININ tek gördüğü şey
   * oluyor.
   */
  if (yuklemeHatasi || !agac) {
    return (
      <div className="grid gap-5">
        {yuklemeHatasi ? (
          <Serit ton="hata" baslik="Üst hesap bilgisi alınamadı">
            {yuklemeHatasi}
          </Serit>
        ) : ustHesapKurabilir ? (
          <UstHesapKur />
        ) : (
          /*
           * BİLGİ, HATA DEĞİL. Kullanıcının kararı: müşteri ajansa bağlı
           * olduğunu bilsin, ama ajansın hesabını ya da diğer şirketleri
           * görmesin. Ajansın adı da yazmıyor: oturum ona yalnızca "bağlı"
           * olgusunu taşıyor.
           */
          <Serit ton="bilgi" baslik="Bu şirket bir ajansın üst hesabına bağlı">
            Şirketinin workspace&apos;lerini aşağıdan yönetebilirsin.
          </Serit>
        )}
        {children}
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      {/*
        ÜST HESABIN KENDİSİ EN ÜSTTE: hangi hesaptasın, paketin ne, ne
        kadarını doldurdun. Şirket listesinin ÜSTÜNDE çünkü onların hepsini
        kapsıyor; yanına koymak hiyerarşiyi gizlerdi.
      */}
      <UstHesapKarti agac={agac} platformSahibi={platformAdmin} />

      {/*
        RAY SABİT GENİŞLİKTE, DETAY KALANI ALIYOR (`minmax(0,1fr)`).
        `1fr` yazmak yetmiyor: içerideki tablolar `min-content`u büyütüp
        ray'i eziyor ve sayfa yatay kayıyor.
      */}
      <div className="grid gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <SirketRayi agac={agac} aktifOrgId={aktifOrgId} />

        <div className="grid min-w-0 content-start gap-5">
          {/*
            ═══ ŞİRKET BAŞLIĞI VE EYLEMLERİ ═══

            Önce iki kutu (taşıma ve şirket bilgileri) ekranın üstünde SÜREKLİ
            AÇIK duruyordu ve workspace listesini aşağı itiyordu. Kullanıcının
            tarifi *"gereksiz ve karışık duruyor"*. Bugün bir başlık satırı ve
            ⋯ menüsü; düzenleme sağdan yan panelde, silme onay penceresinde
            (BILESENLER § 3.4).
          */}
          {sirketHatasi !== null ? (
            /* SEBEBİ EKRANDA: form olmadan boş bırakmak, "düzenleyemiyorum"
               ile "yüklenemedi" hâllerini aynı gösterirdi. */
            <Serit ton="hata" baslik="Şirket bilgisi alınamadı">
              {sirketHatasi}
            </Serit>
          ) : sirket ? (
            <Kart
              baslik={sirket.name}
              baslikEki={sirket.slug}
              eylem={
                <DigerMenusu etiket={`${sirket.name} için işlemler`}>
                  <MenuOgesi onClick={() => setPanel('duzenle')}>Şirket bilgilerini düzenle</MenuOgesi>
                  <MenuAyraci />
                  <MenuOgesi tehlike onClick={() => setPanel('sil')}>
                    Şirketi sil
                  </MenuOgesi>
                </DigerMenusu>
              }
            />
          ) : null}

          {children}
        </div>
      </div>

      {sirket && (
        <>
          {/*
            İÇERİK YALNIZ AÇIKKEN ÇİZİLİYOR (katmanın kendisi DOM'da kalıyor):
            silme özeti sunucudan sayılıyor ve sayfanın her açılışında o
            isteği atmak gereksiz yük; düzenleme formu da her açılışta kayıtlı
            değerden başlamalı.
          */}
          <YanPanel acik={panel === 'duzenle'} onKapat={() => setPanel('yok')} baslik="Şirket bilgileri">
            {panel === 'duzenle' && (
              <SirketDuzenle sirketAdi={sirket.name} sirketSlug={sirket.slug} />
            )}
          </YanPanel>

          <Pencere acik={panel === 'sil'} onKapat={() => setPanel('yok')} baslik="Şirketi sil">
            {panel === 'sil' && (
              <SirketSil
                organizationId={sirket.id}
                onVazgec={() => setPanel('yok')}
                onSilindi={() => {
                  /*
                   * SİLİNEN ŞİRKETTE KALINAMAZ. Sunucu aktif şirketin
                   * silinmesini zaten reddediyor, yani buradaki şirket
                   * BAŞKA bir şirket; yine de ağaç ve üst bardaki seçici
                   * tazelenmek zorunda, yoksa silinen şirket listede
                   * durmaya devam eder.
                   */
                  setPanel('yok');
                  window.location.assign(ayarlarAdresi('sirketler'));
                }}
              />
            )}
          </Pencere>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RAY
// ---------------------------------------------------------------------------

/** Türkçe küçültme — varsayılan `toLowerCase()` "İ"yi "i̇" yapıyor. */
const kucult = (s: string): string => s.toLocaleLowerCase('tr');

/**
 * ŞİRKET RAYI — arama, liste, ekleme.
 *
 * ARAMA ŞİRKET ADINDA VE WORKSPACE ADINDA BİRLİKTE. Kullanıcının bu ekranda
 * sorduğu iki soru var: "şu şirket nerede" ve "şu müşteri hangi şirkette".
 * İkincisi eskiden kırk kartı tek tek açmakla cevaplanıyordu; arama onu tek
 * tuşa indiriyor ve eşleşen workspace SATIRIN ALTINDA yazılıyor — yalnızca
 * şirketi göstermek "hangisiydi" sorusunu açık bırakırdı.
 */
function SirketRayi({
  agac,
  aktifOrgId,
}: {
  agac: ManagerAccountTree;
  aktifOrgId: string;
}) {
  const [arama, setArama] = useState('');
  const listeRef = useRef<HTMLUListElement>(null);

  /*
   * AÇILIŞTA SEÇİLİ SATIR GÖRÜŞ ALANINA ALINIYOR.
   *
   * Şirket değiştirmek TAM SAYFA yüklemesi yapıyor (kenar çubuğu, workspace
   * listesi ve marka renkleri değişiyor). Dönüşte arama kutusu boşalıyor ve
   * kırk şirketlik alfabetik listede yeni seçtiğin şirket kaydırma kabının
   * DIŞINDA kalabiliyor: kullanıcı tıklıyor, sayfa yenileniyor ve seçtiği
   * şirketi ekranda göremiyor.
   *
   * `scrollIntoView` KULLANILMIYOR: o yalnızca listeyi değil BÜTÜN ATA
   * kaydırıcıları (pencerenin kendisini de) kaydırıyor. Sayfa açılışta
   * ~150 piksel aşağı kayıyordu ve Ayarlar sekmeleri ile başlık görünür
   * alanın ÜSTÜNDE kalıyordu. Yalnızca kabın `scrollTop`u ayarlanıyor ve
   * satır zaten görünüyorsa hiçbir şey yapılmıyor ("nearest" davranışı).
   */
  useEffect(() => {
    const kap = listeRef.current;
    const satir = kap?.querySelector<HTMLElement>('[data-aktif="true"]');
    if (!kap || !satir) return;
    const ust = satir.offsetTop - kap.offsetTop;
    const alt = ust + satir.offsetHeight;
    if (ust < kap.scrollTop) kap.scrollTop = ust;
    else if (alt > kap.scrollTop + kap.clientHeight) kap.scrollTop = alt - kap.clientHeight;
  }, []);

  const q = kucult(arama.trim());
  const suzulmus = useMemo(() => {
    if (q === '') return agac.organizations.map((o) => ({ sirket: o, eslesen: [] as string[] }));
    return agac.organizations
      .map((o) => ({
        sirket: o,
        /*
         * EŞLEŞEN WORKSPACE'LER AYRI TUTULUYOR. Şirket adı eşleştiğinde
         * liste boş kalıyor (satırın kendisi zaten cevap); workspace adı
         * eşleştiğinde HANGİSİ olduğu satırın altında yazıyor.
         */
        eslesen: o.workspaces.filter((w) => kucult(w.name).includes(q)).map((w) => w.name),
      }))
      .filter((x) => kucult(x.sirket.name).includes(q) || x.eslesen.length > 0);
  }, [agac.organizations, q]);

  const toplamWorkspace = agac.organizations.reduce((n, o) => n + o.workspaces.length, 0);

  return (
    <aside className="min-w-0 lg:self-start">
      {/*
        RAYIN KARTI ORTAK KART KALIBI (`Kart`): başlık satırı, gövde, sağ altta
        tek eylem. Yapışkan DEĞİL: sayfa içi yan menü zaten solda yapışkan ve
        ikinci bir yapışkan sütun dar ekranda içeriğin üstüne biniyordu.
      */}
      <Kart
        as="div"
        dolgu={false}
        baslik={agac.name}
        /* SESSİZ KESME YOK: kaç şirket ve kaç workspace olduğu yazılı. */
        baslikEki={`${agac.organizations.length} şirket · ${toplamWorkspace} workspace`}
        altEylem={
          /*
            ŞİRKET SİHİRBAZLA AÇILIYOR, BURADAKİ SATIR İÇİ FORMLA DEĞİL.

            Form yalnızca adı soruyordu ve şirket BOŞ açılıyordu: bağlantı
            yok, workspace yok. Sonraki üç adım (şirkete geç, Meta/Google'ı
            O ŞİRKETTE bağla, workspace kurup hesap ata) hiçbir ekranda
            yazmıyordu ve yalnızca sistemi kuran kişi biliyordu. Sihirbaz
            aynı adımları sırayla yürütüyor.
          */
          <Link href={acilisAdresi('sirket')} className={dugmeSinifi('ikincil', 'kucuk')}>
            + Şirket ekle
          </Link>
        }
      >
        <div className="border-b border-line p-3">
          {/*
            `type="search"` — tarayıcının temizleme düğmesi bedava geliyor ve
            uzun bir aramadan sonra listeyi geri getirmenin yolu o.
          */}
          <Girdi
            type="search"
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            placeholder="Şirket ya da workspace ara"
            aria-label="Şirket ya da workspace ara"
          />
        </div>

        {/*
          LİSTE KENDİ KABINDA KAYIYOR. Sayfanın tamamıyla birlikte kaymak,
          kırk şirkette detayın ekrandan çıkması demekti — kullanıcı ray'i
          gezerken düzenlediği şirketi göremiyordu.
        */}
        <ul ref={listeRef} className="m-0 max-h-[60vh] min-h-0 list-none overflow-y-auto p-1.5">
          {suzulmus.length === 0 ? (
            /* ÜÇ HÂL AYRI: hiç şirket yok · arama eşleşmedi. */
            <li className="px-2 py-6 text-center text-13 text-ink-muted">
              {agac.organizations.length === 0
                ? 'Bu üst hesaba bağlı şirket yok.'
                : `“${arama}” ile eşleşen şirket ya da workspace yok.`}
            </li>
          ) : (
            suzulmus.map(({ sirket, eslesen }) => (
              <SirketSatiri
                key={sirket.id}
                sirket={sirket}
                aktif={sirket.id === aktifOrgId}
                eslesen={eslesen}
              />
            ))
          )}
        </ul>

        {/* KESME EKRANDA YAZILI — kaç şirketin süzülüp kaçının kaldığı. */}
        {q !== '' && agac.organizations.length > 0 && (
          <p className="m-0 border-t border-line px-4 py-2 text-12 text-ink-muted">
            {agac.organizations.length} şirketten {suzulmus.length} tanesi gösteriliyor
          </p>
        )}
      </Kart>
    </aside>
  );
}

/**
 * RAY SATIRI — bir şirket.
 *
 * WORKSPACE ADLARI HÂLÂ ULAŞILABİLİR ama artık VARSAYILAN OLARAK KAPALI:
 * kırk şirketin adlarını birden basmak, aramanın çözdüğü sorunu geri
 * getirirdi. Yalnızca "3 workspace" yazıp içini hiç göstermemek de olmaz —
 * o zaman "hangi müşteri nerede" sorusu ekrandan cevaplanamaz.
 */
function SirketSatiri({
  sirket,
  aktif,
  eslesen,
}: {
  sirket: Sirket;
  aktif: boolean;
  /** Aramanın bu şirkette eşleştirdiği workspace adları. */
  eslesen: string[];
}) {
  const [acik, setAcik] = useState(false);
  const [gecis, setGecis] = useState(false);
  const [gecisHatasi, setGecisHatasi] = useState<string | null>(null);

  /**
   * ŞİRKETE GEÇ — tam sayfa yükleme.
   *
   * `router.refresh()` YETMİYOR: şirket değişince kenar çubuğu, workspace
   * listesi ve marka renkleri değişiyor ve istemci state'i önceki şirketten
   * kalan kimlikleri taşıyor. Yarım tazelenmiş bir ekran, sızıntıdan ayırt
   * edilemeyecek kadar kötü görünüyor.
   */
  function gec(): void {
    setGecis(true);
    setGecisHatasi(null);
    void apiFetch('/auth/switch-org', {
      method: 'POST',
      body: JSON.stringify({ organizationId: sirket.id }),
    })
      .then(() => {
        // AYNI SAYFAYA DÖNÜYOR, `/dashboard`A DEĞİL. Kullanıcı şirketi
        // düzenlemek için tıkladı; onu Genel Bakış'a atmak, aradığı ekranı
        // yeniden bulmasını istemek olurdu.
        window.location.assign(ayarlarAdresi('sirketler'));
      })
      .catch((e: unknown) => {
        /*
         * HATA YUTULMUYOR: düğme eski hâline dönüp hiçbir şey söylemeseydi
         * kullanıcı tıklamanın "tutmadığını" sanıp tekrar tekrar basardı
         * (yetkisi kalkmış ya da silinmiş bir şirket). Sunucunun cümlesi
         * satırın altında.
         */
        setGecis(false);
        setGecisHatasi(e instanceof ApiRequestError ? e.message : 'Şirkete geçilemedi.');
      });
  }

  return (
    <li data-aktif={aktif ? 'true' : undefined}>
      {/*
        SEÇİLİ SATIR SAYFA İÇİ YAN MENÜYLE AYNI DİLDE: gri zemin + solda
        kırmızı çizgi. Kırmızı dolgu ana menünün seçili satırına ayrılmış;
        ikisi aynı görünse kullanıcı hangi listede olduğunu karıştırır.
      */}
      <div
        className={`relative flex items-center gap-1 rounded-alan px-1 ${
          aktif
            ? 'bg-surface-sunken before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-brand'
            : 'hover:bg-surface-sunken'
        }`}
      >
        {/*
          SATIRIN KENDİSİ GEÇİŞ DÜĞMESİ. Aktif şirkette düğme YOK: basılsaydı
          hiçbir şey değişmeyen bir tam sayfa yüklemesi olurdu ve kullanıcı
          ekranın boşuna sıfırlandığını görürdü.
        */}
        {aktif ? (
          <span className="min-w-0 flex-1 px-2 py-2" aria-current="true">
            <span className="block truncate text-13 font-bold text-ink">{sirket.name}</span>
            <span className="block truncate text-12 text-brand-strong">şu an buradasın, sağdan düzenle</span>
          </span>
        ) : (
          <button
            type="button"
            disabled={gecis}
            onClick={gec}
            className="min-w-0 flex-1 rounded-alan px-2 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50"
          >
            <span className="flex items-center gap-1.5">
              <span className="truncate text-13 font-semibold text-ink">{sirket.name}</span>
              {gecis && <Halka />}
            </span>
            <span className="block truncate text-12 text-ink-muted">
              {sirket.workspaces.length} workspace
              {sirket.isHome && ' · kendi şirketin'}
            </span>
          </button>
        )}

        {/*
          AÇ/KAPA AYRI BİR DÜĞME. Satırın tamamını hem geçiş hem açma yapmak
          mümkün değil: iki farklı iş ve biri geri alınamaz (tam sayfa
          yükleme), diğeri bakmaktan ibaret.
        */}
        <button
          type="button"
          onClick={() => setAcik((v) => !v)}
          aria-expanded={acik}
          aria-label={`${sirket.name} workspace’leri`}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${acik ? 'rotate-90' : ''}`}
            aria-hidden
          >
            <path d="m8 6 4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/*
        ARAMA EŞLEŞMESİ AÇMADAN GÖRÜNÜYOR. "Şu müşteri hangi şirkette"
        sorusunun cevabı bir tıklama daha gerektirseydi, arama işi yarım
        yapmış olurdu.
      */}
      {gecisHatasi && (
        <p role="alert" className="mx-2 mb-1 text-12 text-danger-strong">
          {gecisHatasi}
        </p>
      )}

      {!acik && eslesen.length > 0 && (
        <ul className="mb-1 ml-4 list-none border-l border-line pl-2.5">
          {eslesen.map((ad) => (
            <li key={ad} className="truncate py-0.5 text-12 text-brand-strong">
              {ad}
            </li>
          ))}
        </ul>
      )}

      {acik && (
        <ul className="mb-1 ml-4 list-none border-l border-line pl-2.5">
          {sirket.workspaces.length === 0 ? (
            /* BOŞ LİSTE NEDENİNİ SÖYLÜYOR (CLAUDE.md): "henüz eklenmedi" ile
               "yüklenemedi" aynı boş alana çevrilmemeli. */
            <li className="py-0.5 text-12 text-ink-muted">
              Bu şirkette henüz workspace yok. Şirkete geçince sayfa başlığındaki
              &quot;Yeni workspace&quot; ile ekleyebilirsin.
            </li>
          ) : (
            sirket.workspaces.map((w) => (
              <li key={w.id} className="truncate py-0.5 text-12 text-ink-muted">
                {w.name}
              </li>
            ))
          )}
        </ul>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------

function UstHesapKur() {
  return (
    <Kart
      baslik="Üst hesap oluştur"
      altEylem={
        /*
          SİHİRBAZA GİDİYOR. Buradaki form yalnızca adı soruyordu; sonraki
          adımlar (platform bağlama, workspace, hesap atama) hiçbir ekranda
          yazmıyordu. Kart içinde KIRMIZI DOLU DÜĞME YOK (BILESENLER § 3.3):
          sayfanın birincil eylemi başlıkta.
        */
        <Link href={acilisAdresi('ust-hesap')} className={dugmeSinifi('koyu', 'kucuk')}>
          Kurulumu başlat
        </Link>
      }
    >
      <p className="m-0 max-w-prose text-14 text-ink-muted">
        Birden çok şirketi tek girişle yönetmek için. Şu anki şirketin bu üst hesabın altına
        bağlanır, sonra yanına yenilerini ekleyebilirsin.
      </p>
    </Kart>
  );
}
