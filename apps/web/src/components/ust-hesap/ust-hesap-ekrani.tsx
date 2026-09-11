'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createManagedOrganizationSchema,
  createManagerAccountSchema,
  type ManagerAccountTree,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Halka } from '@/components/yukleniyor';
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
  /** Advetics'i işleten taraf mı — yeni üst hesap açabiliyor, paket seçebiliyor. */
  platformAdmin: boolean;
  /** Workspace bölümü — sunucuda üretiliyor. */
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [agac, setAgac] = useState<ManagerAccountTree | null>(ilkAgac);
  const [hata, setHata] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  /*
   * TEK SEFERDE TEK PANEL. İkisini birden açık bırakmak, ekranın yine
   * düzeltmeye çalıştığımız hâle dönmesi demekti.
   */
  const [panel, setPanel] = useState<'yok' | 'duzenle' | 'tasi' | 'sil'>('yok');

  async function gonder(yol: string, govde: unknown) {
    setPending(true);
    setHata(null);
    try {
      const sonuc = await apiFetch<ManagerAccountTree>(yol, {
        method: 'POST',
        body: JSON.stringify(govde),
      });
      setAgac(sonuc);
      /*
       * SUNUCU BİLEŞENLERİ TAZELENİYOR. Üst bardaki şirket seçici oturum
       * yanıtından besleniyor; tazelenmezse yeni şirket ekranda listelenir
       * ama seçicide GÖRÜNMEZ ve kullanıcı ona geçemez.
       */
      router.refresh();
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'İşlem tamamlanamadı.');
    } finally {
      setPending(false);
    }
  }

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
      <div className="space-y-6">
        {hata && <Uyari mesaj={hata} />}
        {yuklemeHatasi ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Üst hesap bilgisi alınamadı: {yuklemeHatasi}
          </p>
        ) : (
          <UstHesapKur
            pending={pending}
            onKur={(name) => void gonder('/manager-account', { name })}
          />
        )}
        {children}
      </div>
    );
  }

  const aktifSirket = agac.organizations.find((o) => o.id === aktifOrgId) ?? null;

  return (
    <div className="space-y-4">
      {hata && <Uyari mesaj={hata} />}

      {/*
        RAY SABİT GENİŞLİKTE, DETAY KALANI ALIYOR (`minmax(0,1fr)`).
        `1fr` yazmak yetmiyor: içerideki tablolar `min-content`u büyütüp
        ray'i eziyor ve sayfa yatay kayıyor.
      */}
      {/*
        ÜST HESABIN KENDİSİ EN ÜSTTE: hangi hesaptasın, paketin ne, ne
        kadarını doldurdun. Şirket listesinin ÜSTÜNDE çünkü onların hepsini
        kapsıyor; yanına koymak hiyerarşiyi gizlerdi.
      */}
      <UstHesapKarti agac={agac} platformAdmin={platformAdmin} onGuncellendi={setAgac} />

      <div className="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <SirketRayi
          agac={agac}
          aktifOrgId={aktifOrgId}
          pending={pending}
          onEkle={(name) => void gonder('/manager-account/organizations', { name })}
        />

        <div className="min-w-0 space-y-6">
          {/*
            ═══ ŞİRKET BAŞLIĞI VE EYLEMLERİ ═══

            Önce iki kutu (taşıma ve şirket bilgileri) ekranın üstünde SÜREKLİ
            AÇIK duruyordu ve workspace listesini aşağı itiyordu. Kullanıcının
            tarifi *"gereksiz ve karışık duruyor"*. Bugün bir başlık satırı ve
            üç düğme; paneller istendiğinde açılıyor.
          */}
          {sirketHatasi !== null ? (
            /* SEBEBİ EKRANDA: form olmadan boş bırakmak, "düzenleyemiyorum"
               ile "yüklenemedi" hâllerini aynı gösterirdi. */
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              Şirket bilgisi alınamadı: {sirketHatasi}
            </p>
          ) : sirket ? (
            <section className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-ink">{sirket.name}</h2>
                  <p className="text-[11px] text-ink-muted">{sirket.slug}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <EylemDugmesi
                    aktif={panel === 'duzenle'}
                    onClick={() => setPanel((p) => (p === 'duzenle' ? 'yok' : 'duzenle'))}
                  >
                    Düzenle
                  </EylemDugmesi>
                  <EylemDugmesi
                    aktif={panel === 'tasi'}
                    onClick={() => setPanel((p) => (p === 'tasi' ? 'yok' : 'tasi'))}
                  >
                    Workspace taşı
                  </EylemDugmesi>
                  <button
                    type="button"
                    onClick={() => setPanel((p) => (p === 'sil' ? 'yok' : 'sil'))}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                      panel === 'sil'
                        ? 'border-red-300 bg-red-50 text-red-700'
                        : 'border-line text-red-600 hover:bg-red-50'
                    }`}
                  >
                    Sil
                  </button>
                </div>
              </div>

              {panel === 'duzenle' && (
                <div className="mt-4 border-t border-line pt-4">
                  <SirketDuzenle sirketAdi={sirket.name} sirketSlug={sirket.slug} />
                </div>
              )}

              {panel === 'tasi' && aktifSirket && (
                <div className="mt-4 border-t border-line pt-4">
                  {/*
                    TAŞIMA DETAYDA, RAY'DE DEĞİL. Her satıra bir seçici koymak
                    kırk şirkette kırk bin `option` düğümü demekti ve seçicinin
                    hedefi zaten "şu an bulunduğun şirket".
                  */}
                  <WorkspaceTasi
                    agac={agac}
                    hedef={aktifSirket}
                    pending={pending}
                    onTasi={(clientId) =>
                      void gonder('/manager-account/workspaces/move', {
                        clientId,
                        organizationId: aktifSirket.id,
                      })
                    }
                  />
                </div>
              )}

              {panel === 'sil' && (
                <div className="mt-4 border-t border-line pt-4">
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
                      window.location.assign('/ayarlar/ust-hesap');
                    }}
                  />
                </div>
              )}
            </section>
          ) : null}

          {children}
        </div>
      </div>
    </div>
  );
}

/** Panel açan düğme — açıkken işaretli. */
function EylemDugmesi({
  aktif,
  onClick,
  children,
}: {
  aktif: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={aktif}
      className={`rounded-lg border px-3 py-1.5 text-sm transition ${
        aktif ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink hover:bg-surface-muted'
      }`}
    >
      {children}
    </button>
  );
}

function Uyari({ mesaj }: { mesaj: string }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {mesaj}
    </p>
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
  pending,
  onEkle,
}: {
  agac: ManagerAccountTree;
  aktifOrgId: string;
  pending: boolean;
  onEkle: (name: string) => void;
}) {
  const [arama, setArama] = useState('');
  const [ekleAcik, setEkleAcik] = useState(false);
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
   * `block: 'nearest'` — zaten görünüyorsa hiçbir şey yapmıyor; 'center'
   * yazmak, görünen bir satırı sebepsiz yere ortaya kaydırırdı.
   */
  useEffect(() => {
    listeRef.current
      ?.querySelector('[data-aktif="true"]')
      ?.scrollIntoView({ block: 'nearest' });
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
    <aside className="lg:sticky lg:top-4 lg:self-start">
      <div className="flex flex-col rounded-xl border border-line bg-surface">
        <div className="border-b border-line px-3 py-2.5">
          <p className="truncate text-sm font-semibold text-ink">{agac.name}</p>
          {/* SESSİZ KESME YOK: kaç şirket ve kaç workspace olduğu yazılı. */}
          <p className="mt-0.5 text-[11px] text-ink-muted">
            {agac.organizations.length} şirket · {toplamWorkspace} workspace
          </p>
        </div>

        <div className="border-b border-line p-2">
          {/*
            `type="search"` — tarayıcının temizleme düğmesi bedava geliyor ve
            uzun bir aramadan sonra listeyi geri getirmenin yolu o.
          */}
          <input
            type="search"
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            placeholder="Şirket veya workspace ara…"
            aria-label="Şirket veya workspace ara"
            className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
          />
        </div>

        {/*
          LİSTE KENDİ KABINDA KAYIYOR. Sayfanın tamamıyla birlikte kaymak,
          kırk şirkette detayın ekrandan çıkması demekti — kullanıcı ray'i
          gezerken düzenlediği şirketi göremiyordu.
        */}
        <ul ref={listeRef} className="max-h-[60vh] min-h-0 overflow-y-auto p-1.5">
          {suzulmus.length === 0 ? (
            /* ÜÇ HÂL AYRI: hiç şirket yok · arama eşleşmedi. */
            <li className="px-2 py-6 text-center text-xs text-ink-muted">
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
          <p className="border-t border-line px-3 py-1.5 text-[11px] text-ink-muted">
            {agac.organizations.length} şirketten {suzulmus.length} tanesi gösteriliyor
          </p>
        )}

        <div className="border-t border-line p-2">
          {ekleAcik ? (
            <SirketEkle
              pending={pending}
              onEkle={(name) => {
                onEkle(name);
                setEkleAcik(false);
              }}
              onVazgec={() => setEkleAcik(false)}
            />
          ) : (
            /*
              EKLEME FORMU KAPALI BAŞLIYOR. Açık dururken ray'in altında
              kalıcı bir blok kaplıyordu; şirket açmak seyrek bir iş ve
              her gün yapılan şey listede gezmek.
            */
            <button
              type="button"
              onClick={() => setEkleAcik(true)}
              className="w-full rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-sunken"
            >
              + Şirket ekle
            </button>
          )}
        </div>
      </div>
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
    void apiFetch('/auth/switch-org', {
      method: 'POST',
      body: JSON.stringify({ organizationId: sirket.id }),
    })
      .then(() => {
        // AYNI SAYFAYA DÖNÜYOR, `/dashboard`A DEĞİL. Kullanıcı şirketi
        // düzenlemek için tıkladı; onu Genel Bakış'a atmak, aradığı ekranı
        // yeniden bulmasını istemek olurdu.
        window.location.assign('/ayarlar/ust-hesap');
      })
      .catch(() => setGecis(false));
  }

  return (
    <li data-aktif={aktif ? 'true' : undefined}>
      <div
        className={`flex items-center gap-1 rounded-lg px-1 ${
          aktif ? 'bg-brand/10 ring-1 ring-inset ring-brand/30' : 'hover:bg-surface-sunken'
        }`}
      >
        {/*
          SATIRIN KENDİSİ GEÇİŞ DÜĞMESİ. Aktif şirkette düğme YOK: basılsaydı
          hiçbir şey değişmeyen bir tam sayfa yüklemesi olurdu ve kullanıcı
          ekranın boşuna sıfırlandığını görürdü.
        */}
        {aktif ? (
          <span className="min-w-0 flex-1 px-1.5 py-1.5" aria-current="true">
            <span className="block truncate text-sm font-semibold text-ink">{sirket.name}</span>
            <span className="block truncate text-[11px] text-brand-strong">
              şu an buradasın — sağdan düzenle
            </span>
          </span>
        ) : (
          <button
            type="button"
            disabled={gecis}
            onClick={gec}
            className="min-w-0 flex-1 px-1.5 py-1.5 text-left disabled:opacity-50"
          >
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm text-ink">{sirket.name}</span>
              {gecis && <Halka />}
            </span>
            <span className="block truncate text-[11px] text-ink-muted">
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
          className="shrink-0 rounded p-1.5 text-ink-muted transition hover:text-ink"
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            className={`h-3.5 w-3.5 transition ${acik ? 'rotate-90' : ''}`}
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
      {!acik && eslesen.length > 0 && (
        <ul className="mb-1 ml-3 border-l border-line pl-2.5">
          {eslesen.map((ad) => (
            <li key={ad} className="truncate py-0.5 text-[11px] text-brand-strong">
              {ad}
            </li>
          ))}
        </ul>
      )}

      {acik && (
        <ul className="mb-1 ml-3 border-l border-line pl-2.5">
          {sirket.workspaces.length === 0 ? (
            /* BOŞ LİSTE NEDENİNİ SÖYLÜYOR (CLAUDE.md): "henüz eklenmedi" ile
               "yüklenemedi" aynı boş alana çevrilmemeli. */
            <li className="py-0.5 text-[11px] text-ink-muted">
              Bu şirkette henüz workspace yok. Şirkete geçince sağdaki
              &quot;Workspace&apos;ler&quot; bölümünden ekleyebilirsin.
            </li>
          ) : (
            sirket.workspaces.map((w) => (
              <li key={w.id} className="truncate py-0.5 text-[11px] text-ink-muted">
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
// DETAY — WORKSPACE TAŞIMA
// ---------------------------------------------------------------------------

/**
 * VAR OLAN BİR WORKSPACE'İ BU ŞİRKETE TAŞI.
 *
 * TEK SEÇİCİ, RAY'DE DEĞİL DETAYDA. Her şirket kartında bir tane vardı ve
 * her biri DİĞER bütün şirketlerin workspace'lerini listeliyordu: kırk
 * şirkette kırk bin `option` düğümü. Ekranın yavaşlığının ölçülebilir kısmı
 * buydu ve hiçbir yerde görünmüyordu.
 *
 * ADAYLAR YALNIZCA BAŞKA ŞİRKETLERDEN. Kendi workspace'lerini listelemek,
 * "buraya taşı" deyip hiçbir şey yapmayan bir seçenek göstermek olurdu.
 *
 * Taşıma 30 tabloda `org_id` güncelliyor ve RLS DIŞINDA koşuyor (`workspaceTasi`).
 */
function WorkspaceTasi({
  agac,
  hedef,
  pending,
  onTasi,
}: {
  agac: ManagerAccountTree;
  hedef: Sirket;
  pending: boolean;
  onTasi: (clientId: string) => void;
}) {
  const [secilen, setSecilen] = useState('');

  const adaylar = useMemo(
    () =>
      agac.organizations
        .filter((d) => d.id !== hedef.id)
        .flatMap((d) => d.workspaces.map((w) => ({ id: w.id, name: w.name, sirket: d.name }))),
    [agac.organizations, hedef.id],
  );

  // ADAY YOKSA KUTU DA YOK: boş bir seçici, yapılabilir bir iş varmış gibi
  // görünüp hiçbir şey yapmıyor.
  if (adaylar.length === 0) return null;

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold text-ink">Başka şirketten workspace taşı</h2>
      <p className="mt-1 max-w-prose text-xs text-ink-muted">
        Seçilen workspace <strong>{hedef.name}</strong> şirketine geçer; reklam hesapları,
        kampanyaları ve geçmiş verisi birlikte taşınır.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label htmlFor="tasinacak-workspace" className="sr-only">
          Bu şirkete taşınacak workspace
        </label>
        <select
          id="tasinacak-workspace"
          value={secilen}
          disabled={pending}
          onChange={(e) => setSecilen(e.target.value)}
          className="min-w-[16rem] flex-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
        >
          <option value="">Workspace seç…</option>
          {adaylar.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.sirket})
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={pending || secilen === ''}
          onClick={() => {
            onTasi(secilen);
            setSecilen('');
          }}
          className="shrink-0 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink hover:bg-surface-muted disabled:opacity-40"
        >
          Taşı
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function UstHesapKur({
  pending,
  onKur,
}: {
  pending: boolean;
  onKur: (name: string) => void;
}) {
  const [ad, setAd] = useState('');
  const [alanHatasi, setAlanHatasi] = useState<string | undefined>();

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold text-ink">Üst hesap oluştur</h2>
      <p className="mt-1 max-w-prose text-sm text-ink-muted">
        Google&apos;ın Müşteri Merkezi (MCC) gibi çalışır: birden çok şirketi tek girişle
        yönetirsin. Şu anki şirketin bu üst hesabın altına bağlanır, sonra yanına yenilerini
        ekleyebilirsin.
      </p>

      <form
        className="mt-4 flex flex-wrap items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = createManagerAccountSchema.safeParse({ name: ad });
          if (!parsed.success) {
            setAlanHatasi(parsed.error.issues[0]?.message);
            return;
          }
          setAlanHatasi(undefined);
          onKur(parsed.data.name);
        }}
        noValidate
      >
        <div className="min-w-[16rem] flex-1">
          <label htmlFor="ustHesapAdi" className="sr-only">
            Üst hesap adı
          </label>
          <input
            id="ustHesapAdi"
            value={ad}
            onChange={(e) => setAd(e.target.value)}
            disabled={pending}
            placeholder="Örn. Profaj Danışmanlık"
            aria-invalid={alanHatasi ? 'true' : undefined}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
          {alanHatasi && <p className="mt-1 text-xs text-red-600">{alanHatasi}</p>}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending && <Halka />}
          Oluştur
        </button>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------

function SirketEkle({
  pending,
  onEkle,
  onVazgec,
}: {
  pending: boolean;
  onEkle: (name: string) => void;
  onVazgec: () => void;
}) {
  const [ad, setAd] = useState('');
  const [alanHatasi, setAlanHatasi] = useState<string | undefined>();

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = createManagedOrganizationSchema.safeParse({ name: ad });
        if (!parsed.success) {
          setAlanHatasi(parsed.error.issues[0]?.message);
          return;
        }
        setAlanHatasi(undefined);
        onEkle(parsed.data.name);
        setAd('');
      }}
      noValidate
    >
      <label htmlFor="sirketAdi" className="block text-[11px] text-ink-muted">
        Yeni şirket adı
      </label>
      <input
        id="sirketAdi"
        value={ad}
        onChange={(e) => setAd(e.target.value)}
        disabled={pending}
        autoFocus
        placeholder="Örn. Sabancı İnşaat A.Ş."
        aria-invalid={alanHatasi ? 'true' : undefined}
        className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
      />
      {alanHatasi && <p className="text-[11px] text-red-600">{alanHatasi}</p>}
      {/*
        AÇIKLAMA FORMUN İÇİNDE KALIYOR: var olan bir şirketi buraya bağlamak
        MÜMKÜN DEĞİL ve bunu yazmazsak kullanıcı onu arar. O şirketin kendi
        kullanıcıları ve kendi verisi var; devri iki tarafın da onayını
        gerektirir.
      */}
      <p className="text-[11px] text-ink-muted">
        Yeni bir şirket açar ve seni sahibi yapar. Var olan bir şirketi buraya bağlamak
        mümkün değil.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending && <Halka />}
          Ekle
        </button>
        <button
          type="button"
          onClick={onVazgec}
          className="text-xs text-ink-muted transition hover:text-ink"
        >
          Vazgeç
        </button>
      </div>
    </form>
  );
}
