'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type {
  AutoBoostPlatform,
  AutoBoostQueueItemRecord,
  AutoBoostQueueList,
  AutoBoostQueueOverride,
  AutoBoostSubscriptionHealth,
  ChannelKind,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { hedeflemeOzeti } from '@advetics/shared';
import { formatMoney, formatNumber, formatPercent, formatTarih } from '@/lib/format';
import { KartDuzenle } from '@/components/autoboost/kart-duzenle';
import { PlatformLogo } from '@/components/platform-logo';

/**
 * ═══ PLATFORM TABLOLARI — HEPSİ `Record`, HİÇBİRİ KOŞUL ZİNCİRİ ═══
 *
 * Bu ekran iki kaynaktan besleniyor (Instagram gönderisi, YouTube videosu) ve
 * ikisinin görsel oranı, mecra adı ve logosu farklı. Elle yazılmış bir koşul
 * ("google değilse Instagram") üçüncü bir kaynak eklendiğinde YANLIŞ ROZET
 * üretir — ve yanlış rozet, eksik rozetten kötüdür: kullanıcı sorgulamaz.
 */
const PLATFORM_ETIKETI: Record<AutoBoostPlatform, string> = {
  meta: 'Instagram',
  google: 'YouTube',
};

const PLATFORM_KANALI: Record<AutoBoostPlatform, ChannelKind> = {
  meta: 'instagram',
  google: 'youtube',
};

/**
 * GÖRSEL ORANI PLATFORMA GÖRE DEĞİŞİYOR ve kart oranı DEĞİŞMİYOR.
 *
 * Instagram gönderisi dikey (4:5), YouTube küçük resmi yatay (16:9). Kart
 * kutusunu içeriğe göre değiştirmek ızgaradaki satırların hizasını bozuyor ve
 * göz taraması satır satır yapılamaz hâle geliyor. Yatay görseli 4:5'e
 * KIRPMAK ise videonun iki yanını kesiyor; küçük resimde metin çoğu zaman tam
 * oraya yazılıyor.
 *
 * Çözüm: yatay görsel kutuya SIĞDIRILIYOR ve arkasına kendisinin bulanık,
 * büyütülmüş bir kopyası konuyor. Boşluk düz gri kalsaydı kart eksik
 * görünürdü; kırpma ise bilgiyi GÖTÜRÜYOR.
 */
const GORSEL_BICIMI: Record<AutoBoostPlatform, { oturtma: string; bulanikZemin: boolean }> = {
  meta: { oturtma: 'object-cover', bulanikZemin: false },
  google: { oturtma: 'object-contain', bulanikZemin: true },
};

/**
 * TEKRAR BOOSTLAMAYA AÇIK DURUMLAR — sunucudaki listeyle AYNI.
 *
 * Ayrışırlarsa panel açık bir düğme gösterir ve sunucu reddeder; kullanıcı
 * sebebi kendi kurulumunda arar. `autoboost-tekrar-boost.spec.ts` iki listeyi
 * karşılaştırıyor.
 */
const TEKRAR_ACIK_DURUMLAR = new Set(['launched', 'rejected', 'failed']);

/**
 * ═══ DURUM SÜZGECİ ═══
 *
 * Yayınlanan kart artık listeden ÇIKMIYOR: kullanıcı gönderilerini tarih
 * sırasında, boostlanmış olanlarla birlikte görmek istedi. Bedeli liste
 * uzunluğu — bir yıl sonra onay bekleyen üç kart, yayınlanmış yüz kartın
 * arasında kalıyor. Süzgeç o bedeli ödüyor ve kaç kartın gizlendiği her
 * zaman yazılı.
 */
const DURUM_SUZGECLERI = [
  { anahtar: 'bekleyen', etiket: 'Onay bekliyor', durumlar: ['pending'] },
  { anahtar: 'yayinda', etiket: 'Yayında', durumlar: ['launched', 'launching', 'approved'] },
  { anahtar: 'kapali', etiket: 'Kapanan', durumlar: ['rejected', 'failed'] },
] as const;

type DurumSuzgeci = (typeof DURUM_SUZGECLERI)[number]['anahtar'] | 'hepsi';

/**
 * BİLDİRİM HAVUZU — Advetics 1.0'ın taşıdığı vaat.
 *
 * Yeni gönderi/video yayınlanır → kart düşer → tek tıkla yayına girer.
 *
 * ═══ EKRANIN TAŞIDIĞI TEK MESAJ ═══
 *
 * Bu düğme PARA HARCIYOR ve ne kadar harcayacağı düğmenin ÜSTÜNDE yazıyor.
 * Kart onaylanamıyorsa SEBEBİ satırda — "onaylanamıyor" demek, kullanıcıyı
 * sebebi kendi kurulumunda aramaya iter ve bu ekranda daha önce tam olarak o
 * oldu.
 */
export function BildirimHavuzu({
  clientId,
  canWrite,
}: {
  clientId: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [liste, setListe] = useState<AutoBoostQueueList | null>(null);
  const [saglik, setSaglik] = useState<AutoBoostSubscriptionHealth[]>([]);
  const [hata, setHata] = useState<string | null>(null);
  /**
   * MECRA SÜZGECİ — `'hepsi'` varsayılan.
   *
   * Instagram gönderileri ve YouTube videoları aynı ızgarada duruyor ve bu
   * doğru: ikisi de aynı kararı bekliyor. Ama bir kanalın videolarını
   * toplu gözden geçirmek isteyen kullanıcı, araya karışmış on gönderiyi
   * elemek zorunda kalıyordu.
   *
   * SÜZGEÇ SUNUCUYA GİTMİYOR: liste zaten en fazla 50 kart ve süzgeci
   * sunucuya taşımak, her tıklamada yeni bir istek ve yeni bir "toplam"
   * demekti — sayaçlar süzgece göre değişince "sessiz kesme yok" kuralı
   * okunamaz hâle gelirdi.
   */
  const [suzgec, setSuzgec] = useState<AutoBoostPlatform | 'hepsi'>('hepsi');
  const [durumSuzgeci, setDurumSuzgeci] = useState<DurumSuzgeci>('hepsi');
  /** Geçmiş çekiminin profil bazlı sonucu — boş kalırsa düğme sessiz görünür. */
  const [gecmisNotlari, setGecmisNotlari] = useState<string[] | null>(null);
  const [gecmisBekliyor, setGecmisBekliyor] = useState(false);

  /*
   * KUYRUĞU YENİDEN ÇEKEN FONKSİYON — `router.refresh()` BUNU YAPMIYOR.
   *
   * Bu bileşen `use client` ve listeyi KENDİ state'inde tutuyor.
   * `router.refresh()` sunucu bileşen ağacını tazeliyor ama istemci
   * state'ine dokunmuyor; `clientId` de değişmediği için useEffect tekrar
   * koşmuyordu. Sonuç: sunucuda kart `launched` olmasına rağmen ekrandaki
   * kart `pending` çizimiyle duruyordu ve kullanıcının gördüğü tek iz
   * sayfanın en altındaki "Geçmiş" satırıydı — bildirdiği şey birebir buydu.
   *
   * Doğru desen zaten aynı sayfada vardı: `manual-boost.tsx` yayından sonra
   * `onYayinlandi={gonderileriYukle}` ile GERÇEKTEN yeniden çekiyor.
   */
  const kuyruguYukle = useCallback((): void => {
    void apiFetch<AutoBoostQueueList>(`/autoboost/queue?clientId=${clientId}`)
      .then((r) => {
        setListe(r);
        setHata(null);
      })
      /*
       * HATA YUTULMUYOR. `.catch(() => setListe(null))` yazmak "henüz
       * yüklemedim" ile "çağrı düştü"yü aynı boş alana çevirirdi — lokasyon
       * aramasında tam olarak bu yüzden sebep teşhis edilemedi.
       */
      .catch((err: unknown) =>
        setHata(
          err instanceof ApiRequestError
            ? err.message
            : 'İçerikler yüklenemedi. Sayfayı yenilemeyi dene.',
        ),
      );
  }, [clientId]);

  /**
   * GEÇMİŞ İÇERİĞİ ÇEK — tek seferlik otomatik tohumun elle karşılığı.
   *
   * Otomatik yolların ikisi de tek seferlikti ve koşullardan biri o an
   * yerinde değilse fırsat harcanıyordu; üretimde bir workspace'te YouTube
   * kartları geldi, Instagram kartları gelmedi ve kullanıcının yapabileceği
   * bir şey yoktu.
   */
  async function gecmisiCek(): Promise<void> {
    setGecmisBekliyor(true);
    setGecmisNotlari(null);
    try {
      const r = await apiFetch<{ kartlar: number; notlar: string[] }>(
        '/autoboost/gecmis-icerik',
        { method: 'POST', body: JSON.stringify({ clientId }) },
      );
      // SONUÇ PROFİL BAZINDA YAZILIYOR: "0 kart" tek başına, düğmenin bozuk
      // olduğunu düşündürüyor. Sunucu her profil için sebebini söylüyor.
      setGecmisNotlari(r.notlar);
      kuyruguYukle();
    } catch (err) {
      setGecmisNotlari([
        err instanceof ApiRequestError ? err.message : 'Geçmiş içerik çekilemedi.',
      ]);
    } finally {
      setGecmisBekliyor(false);
    }
  }

  useEffect(() => {
    kuyruguYukle();

    /*
     * ABONELİK SAĞLIĞI AYRI ÇEKİLİYOR ve hatası kartları GİZLEMİYOR.
     *
     * Sağlık okunamazsa kuyruk yine gösterilmeli: ikisi ayrı iş ve birinin
     * arızası diğerini görünmez yapmamalı.
     */
    void apiFetch<AutoBoostSubscriptionHealth[]>(
      `/autoboost/subscriptions/health?clientId=${clientId}`,
    )
      .then(setSaglik)
      .catch(() => setSaglik([]));
  }, [clientId, kuyruguYukle]);

  if (hata) {
    return (
      <div role="alert" className="rounded-xl border border-danger/40 bg-surface p-4">
        <p className="text-sm font-semibold text-danger">İçerik listesi açılamadı</p>
        <p className="mt-1 text-xs text-ink-muted">{hata}</p>
      </div>
    );
  }

  if (!liste) {
    return <p className="text-xs text-ink-muted">İçerikler yükleniyor…</p>;
  }

  const bekleyen = liste.items.filter((i) => i.status === 'pending');

  /*
   * SEKME YALNIZCA İKİ KAYNAK DA VARSA ÇİZİLİYOR. Tek kaynaklı bir
   * workspace'te süzgeç göstermek, hiçbir işe yaramayan bir seçim sunmak ve
   * ekranı gereksiz kalabalıklaştırmak olurdu.
   */
  const sayilar = new Map<AutoBoostPlatform, number>();
  for (const k of liste.items) sayilar.set(k.platform, (sayilar.get(k.platform) ?? 0) + 1);
  const mecralar = [...sayilar.keys()];

  const durumSayilari = new Map<DurumSuzgeci, number>();
  for (const d of DURUM_SUZGECLERI) {
    const n = liste.items.filter((k) =>
      (d.durumlar as readonly string[]).includes(k.status),
    ).length;
    if (n > 0) durumSayilari.set(d.anahtar, n);
  }

  const gosterilen = liste.items.filter((k) => {
    if (suzgec !== 'hepsi' && k.platform !== suzgec) return false;
    if (durumSuzgeci === 'hepsi') return true;
    const d = DURUM_SUZGECLERI.find((x) => x.anahtar === durumSuzgeci);
    return d ? (d.durumlar as readonly string[]).includes(k.status) : true;
  });

  return (
    <section className="min-w-0 space-y-3">
      <header className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
        {/*
          BAŞLIK "BİLDİRİM HAVUZU" DEĞİL — "YENİ İÇERİKLER" DE DEĞİL.

          "Havuz" bizim iç terimimiz. "Yeni içerikler" ise artık YANLIŞ:
          yayınlanmış ve reddedilmiş kartlar listeden çıkmıyor, yani liste
          birkaç hafta sonra çoğunlukla ESKİ içerikten oluşuyor. Başlığın
          listeyi anlatmaması, bu depoda bir kez menü ile sayfa arasında
          yaşandı ve kullanıcıya yanlış ekranda olduğunu düşündürdü.

          Sayfada İKİ onay kuyruğu var ve başlıklar KAYNAĞI söylemek zorunda:
          buradakiler hesabın kendi gönderileri, alttakiler kuralın
          performansa bakıp seçtikleri.
        */}
        <h2 className="text-sm font-semibold text-ink">
          İçerikler
          {bekleyen.length > 0 && (
            <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-white">
              {bekleyen.length}
            </span>
          )}
        </h2>
        {/*
          SAYAÇ KOŞULSUZ — "sessiz kesme yok". Kaç kayıt gösterildiği ve
          toplamın kaç olduğu her zaman yazılı.
        */}
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[11px] text-ink-muted">
            {/* SÜZGEÇ AÇIKKEN KAÇ KARTIN GİZLENDİĞİ DE YAZIYOR: süzgeci
                unutan kullanıcı eksik listeyi "kart gelmemiş" diye okur. */}
            {gosterilen.length} kart gösteriliyor
            {gosterilen.length < liste.items.length &&
              ` · ${liste.items.length - gosterilen.length} kart süzgeçte`}
            {liste.total > liste.items.length && ` · toplam ${liste.total}, en yeniler`}
          </p>
          {canWrite && (
            <button
              type="button"
              onClick={() => void gecmisiCek()}
              disabled={gecmisBekliyor}
              title="Sayfanın ve kanalın son gönderilerini onay kartına çevirir"
              className="rounded-lg border border-line px-2.5 py-1 text-[11px] font-medium text-ink transition hover:bg-surface-sunken disabled:opacity-40"
            >
              {gecmisBekliyor ? 'Getiriliyor…' : 'Geçmiş içerikleri getir'}
            </button>
          )}
        </div>
      </header>

      {gecmisNotlari && (
        <div className="rounded-xl border border-line bg-surface-sunken px-3 py-2">
          <ul className="space-y-0.5 text-[11px] text-ink-muted">
            {gecmisNotlari.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {/*
        SÜZGEÇLER TEK SATIRDA — durum solda, mecra sağda.

        İkisini ayrı satırlara koymak, listenin üstünde iki şeritlik bir çubuk
        bırakıyordu ve asıl iş (kartlar) ekranın altına iniyordu. İkisi de
        yalnızca SEÇENEK VARSA çiziliyor: tek mecralı bir workspace'te mecra
        sekmesi hiçbir işe yaramayan bir seçim.
      */}
      {(durumSayilari.size > 1 || mecralar.length > 1) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {durumSayilari.size > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <SuzgecDugmesi
                etiket="Tümü"
                adet={liste.items.length}
                secili={durumSuzgeci === 'hepsi'}
                onSec={() => setDurumSuzgeci('hepsi')}
              />
              {DURUM_SUZGECLERI.filter((d) => durumSayilari.has(d.anahtar)).map((d) => (
                <SuzgecDugmesi
                  key={d.anahtar}
                  etiket={d.etiket}
                  adet={durumSayilari.get(d.anahtar) ?? 0}
                  secili={durumSuzgeci === d.anahtar}
                  onSec={() => setDurumSuzgeci(d.anahtar)}
                />
              ))}
            </div>
          )}

          {mecralar.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <SuzgecDugmesi
                etiket="Her mecra"
                adet={liste.items.length}
                secili={suzgec === 'hepsi'}
                onSec={() => setSuzgec('hepsi')}
              />
              {mecralar.map((m) => (
                <SuzgecDugmesi
                  key={m}
                  etiket={PLATFORM_ETIKETI[m]}
                  kanal={PLATFORM_KANALI[m]}
                  adet={sayilar.get(m) ?? 0}
                  secili={suzgec === m}
                  onSec={() => setSuzgec(m)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/*
        ÖLÜ ADAM DÜĞMESİ — kartlardan ÖNCE.
        
        WebSub kiralaması ~10 günde sessizce doluyor, hub aboneliği
        reddedebiliyor ve yenileme işinin kendisi kaybolabiliyor. Üçü de
        panelde yalnızca "hiç kart gelmiyor" olarak görünür ve sebebi
        YouTube'da, kanalda, izinlerde aranırdı. Uyarı listenin ÜSTÜNDE çünkü
        boş bir liste gördüğünde okunması gereken ilk şey bu.
      */}
      {saglik
        .filter((h) => !h.ok)
        .map((h) => (
          <div
            key={h.socialProfileId}
            className="rounded-xl border border-danger/40 bg-surface p-3"
          >
            <p className="text-xs font-semibold text-danger">
              {h.channelName}: bildirim aboneliği çalışmıyor
            </p>
            <p className="mt-1 text-[11px] text-ink-muted">{h.message}</p>
          </div>
        ))}

      {/*
        İMZASIZ ABONELİK UYARISI — hata değil, bilgi.
        
        Kilit kurulmadıysa koruma yalnızca bildirim adresinin gizli kalmasına
        dayanıyor. Sessiz bırakmak, kullanıcının bilmediği bir riski taşıması
        demek olurdu.
      */}
      {saglik
        .filter((h) => h.ok && !h.signatureLocked && h.lastNotificationAt)
        .map((h) => (
          <p key={h.socialProfileId} className="text-[11px] text-ink-muted">
            {h.channelName}: bildirimler imzasız geliyor. Koruma yalnızca bildirim
            adresinin gizli kalmasına dayanıyor.
          </p>
        ))}

      {liste.items.length === 0 && (
        <div className="rounded-xl border border-dashed border-line bg-surface p-6 text-center">
          <p className="text-sm font-semibold text-ink">Onay bekleyen içerik yok</p>
          <p className="mx-auto mt-2 max-w-lg text-xs text-ink-muted">{liste.emptyReason}</p>
        </div>
      )}

      {/* SÜZGEÇ YÜZÜNDEN BOŞALAN LİSTE, GERÇEKTEN BOŞ LİSTEYLE AYNI
          GÖRÜNMEMELİ: biri "kart yok", diğeri "kartlar başka sekmede". */}
      {liste.items.length > 0 && gosterilen.length === 0 && (
        <div className="rounded-xl border border-dashed border-line bg-surface p-6 text-center">
          <p className="text-sm text-ink-muted">
            Bu süzgeçte kart yok. Diğer sekmelerde {liste.items.length} kart var.
          </p>
        </div>
      )}

      {/*
        ═══ SATIR LİSTESİ — IZGARA DEĞİL ═══

        Kartlar dikey ızgaradaydı ve her kart yalnızca görsel + başlık
        taşıyabiliyordu. Yayınlanmış kart artık listede kalıyor ve onunla
        birlikte taşınması gereken şey de büyüdü: harcama, gösterim, tık,
        dönüşüm. Bunlar 260 piksellik bir kutuya sığmıyor.

        Satır düzeninin ikinci kazancı SIRALAMA: kartlar gönderi tarihine göre
        diziliyor ve tek sütunda tarih sırası okunabiliyor. Izgarada aynı sıra
        soldan sağa, sonra alta atlıyor ve göz onu takip etmiyor.
      */}
      <ul className="space-y-2">
        {gosterilen.map((k) => (
          <li key={k.id}>
            <Kart
              kayit={k}
              clientId={clientId}
              onDegisti={() => {
                // İKİSİ BİRDEN: kartın kendi listesi (istemci state'i) VE
                // sayfanın sunucu tarafı ("Geçmiş" bölümü). Yalnızca
                // ikincisi yapıldığında kart yayınlandığını göstermiyordu.
                kuyruguYukle();
                router.refresh();
              }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * MECRA SEKMESİ — logo + ad + sayı.
 *
 * Yalnızca ad yazmak yetmiyordu: kullanıcı hangi sekmede kaç kart olduğunu
 * göremeden süzgeci deneyerek kullanıyor. Sayı, boş bir sekmeye tıklamayı
 * baştan gereksiz kılıyor.
 */
function SuzgecDugmesi({
  etiket,
  kanal,
  adet,
  secili,
  onSec,
}: {
  etiket: string;
  kanal?: ChannelKind;
  adet: number;
  secili: boolean;
  onSec: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSec}
      aria-pressed={secili}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
        secili
          ? 'border-brand bg-brand text-white'
          : 'border-line bg-surface text-ink-muted hover:text-ink'
      }`}
    >
      {kanal && <PlatformLogo kind={kanal} className="h-3.5 w-3.5" />}
      {etiket}
      <span className={secili ? 'text-white/80' : 'text-ink-muted'}>{adet}</span>
    </button>
  );
}

function Kart({
  kayit,
  clientId,
  onDegisti,
}: {
  kayit: AutoBoostQueueItemRecord;
  clientId: string;
  onDegisti: () => void;
}) {
  const [gorselDustu, setGorselDustu] = useState(false);
  const [duzenleAcik, setDuzenleAcik] = useState(false);
  /** Sunucunun kendi cümlesi — "sürdürüldü ama üst seviyede duraklatılmış" gibi. */
  const [not, setNot] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** Uzun gönderi metni varsayılan olarak iki satır; tamamı istenirse açılıyor. */
  const [metinAcik, setMetinAcik] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const onaylanabilir = kayit.status === 'pending' && kayit.blockedReason === null;
  const bicim = GORSEL_BICIMI[kayit.platform];
  const yayinda = kayit.status === 'launched';
  /*
   * ═══ KARTIN ÜÇ HÂLİ, ÜÇ AYRI DÜĞME TAKIMI ═══
   *
   *   · KARAR BEKLİYOR → Yayınla · Düzenle · Yayınlama
   *   · YAYINDA        → Yayını duraklat/sürdür · Düzenle · İptal
   *   · KAPANMIŞ       → Tekrar yayınla · Düzenle · Yayınlama
   *
   * Ayrım `boostDurumu`dan geliyor, kartın kendi durumundan DEĞİL: kart
   * `launched` olduğu hâlde kampanya çoktan bitmiş olabilir ve bitmiş bir
   * kampanyaya "duraklat" göstermek, basıldığında hata veren bir düğme
   * göstermek olurdu.
   */
  const canli = kayit.boostDurumu === 'active' || kayit.boostDurumu === 'paused';
  const duraklatilmis = kayit.boostDurumu === 'paused';
  const tekrarGosterilsin = !canli && TEKRAR_ACIK_DURUMLAR.has(kayit.status);

  /**
   * KARAR — onayla, reddet ya da ÖZELLEŞTİRİLMİŞ ayarlarla onayla.
   *
   * ═══ BU YOL PARA HARCIYOR ═══
   *
   * Ara onay adımı YOK: kararı kullanıcı zaten bu ekranda veriyor ve ikinci
   * kez sormak istenen akışı bozardı. Ama harcanacak tutar düğmelerin
   * YANINDA yazıyor ve engel varsa düğme açılmıyor.
   */
  async function karar(approve: boolean, override?: AutoBoostQueueOverride): Promise<void> {
    setBusy(approve ? 'onay' : 'ret');
    setHata(null);
    try {
      const r = await apiFetch<{ status: string; message: string }>(
        `/autoboost/queue/${kayit.id}/decision`,
        {
          method: 'POST',
          /*
           * `override` YALNIZCA VARSA gönderiliyor. Şema `.strict()` ve boş
           * bir nesne göndermek, "hiçbir alanı değiştirme" ile "hepsini
           * sıfırla" arasındaki farkı sunucuya taşımak olurdu.
           */
          body: JSON.stringify(override ? { approve, override } : { approve }),
        },
      );
      /*
       * BAŞARISIZ YAYIN DA BİR SONUÇ. Sunucu `failed` dönebiliyor ve mesajı
       * platformun kendi cümlesini taşıyor; onu göstermeden yenilemek,
       * kullanıcıya "bir şey oldu ama ne bilmiyorum" bırakırdı.
       */
      if (r.status === 'failed') setHata(r.message);
      setDuzenleAcik(false);
      onDegisti();
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : 'İşlem tamamlanamadı.');
      throw err;
    } finally {
      setBusy(null);
    }
  }

  /**
   * YAYIN KONTROLÜ — duraklat, sürdür, iptal.
   *
   * Üçü de PLATFORMA GİDİYOR ve sonucu sunucudan gelen cümleyle söylüyor:
   * "sürdürüldü" demek yetmiyor, hesap üst seviyede duraklatılmışsa reklam
   * yine çıkmıyor ve bunu kullanıcıya söyleyen tek yer o mesaj.
   */
  async function yayinKontrol(uc: 'duraklat' | 'surdur' | 'iptal'): Promise<void> {
    setBusy(uc);
    setHata(null);
    setNot(null);
    try {
      const r = await apiFetch<{ status: string; message: string }>(
        `/autoboost/queue/${kayit.id}/${uc}`,
        { method: 'POST' },
      );
      setNot(r.message);
      onDegisti();
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : 'İşlem tamamlanamadı.');
    } finally {
      setBusy(null);
    }
  }

  /** KARTI KAPAT — "bir daha yayınlama". Yayındaki reklama DOKUNMUYOR. */
  async function kapat(): Promise<void> {
    setBusy('kapat');
    setHata(null);
    try {
      await apiFetch(`/autoboost/queue/${kayit.id}/kapat`, { method: 'POST' });
      onDegisti();
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : 'Kart kapatılamadı.');
    } finally {
      setBusy(null);
    }
  }

  /**
   * TEKRAR BOOSTLA — kartı karara geri açıyor, PARA HARCAMIYOR.
   *
   * Harcama yine "Onayla"da. İki adım olması bilinçli: iyi giden bir gönderiyi
   * yeniden boostlamak tek tıkla para harcamak olmamalı, çünkü bütçe ve süre
   * bu arada değişmiş olabilir ve kullanıcı onları kararı verirken görüyor.
   */
  async function tekrarBoostla(): Promise<void> {
    setBusy('tekrar');
    setHata(null);
    try {
      await apiFetch<{ status: string; message: string }>(
        `/autoboost/queue/${kayit.id}/tekrar`,
        { method: 'POST' },
      );
      onDegisti();
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : 'Kart tekrar açılamadı.');
    } finally {
      setBusy(null);
    }
  }

  return (
    /*
      ═══ SATIR KARTI — IZGARA DEĞİL ═══

      Kartlar dikey ızgaradaydı ve her kart yalnızca görsel + başlık
      taşıyabiliyordu; yayınlanmış bir kartın SONUCU (harcama, gösterim,
      dönüşüm) sığmıyordu ve kullanıcı boostladığı gönderinin ne yaptığını
      görmek için Genel Bakış'a gidip kampanyayı aramak zorundaydı.

      Satır düzeni üç bölgeyi yan yana koyuyor: NE (görsel), HANGİSİ (metin ve
      karar), NE OLDU (rakamlar). Dar ekranda alt alta yığılıyor — rakam
      sütununu 400 pikselde yanda tutmak, başlığı iki karaktere düşürürdü.
    */
    <article
      className={`flex min-w-0 flex-col gap-3 rounded-2xl border p-3 transition sm:flex-row sm:gap-4 sm:p-4 ${
        yayinda ? 'border-line/70 bg-surface-sunken/40' : 'border-line bg-surface'
      }`}
    >
      {/*
        ═══ GÖRSEL KUTUSU KARE ═══

        Satır düzeninde kart yüksekliğini görsel belirliyor; 4:5 kutu satırı
        gereksiz uzatıp ekrana sığan kart sayısını düşürüyordu. Kare kutu
        dikey gönderiyi de yatay küçük resmi de tanınır tutuyor ve tanımak
        için bu yeterli — ayrıntı için "Gönderiyi aç" var.
      */}
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-surface-sunken sm:h-28 sm:w-28">
        {kayit.thumbnailUrl && !gorselDustu ? (
          <>
            {/*
              BULANIK ZEMİN — yalnızca kutuya sığdırılan görsellerde.
              Sığdırma iki yanda boşluk bırakıyor ve düz gri bir boşluk kartı
              "yüklenmemiş" gösteriyor. Zemin görselin kendisinden geliyor,
              yani kart hep içeriğin renginde.
            */}
            {bicim.bulanikZemin && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={kayit.thumbnailUrl}
                alt=""
                aria-hidden="true"
                loading="lazy"
                referrerPolicy="no-referrer"
                className="absolute inset-0 h-full w-full scale-125 object-cover opacity-50 blur-xl"
              />
            )}
            {/*
              DÜZ `img` — Next/Image DEĞİL. Küçük resimler Meta ve YouTube
              CDN'inden geliyor ve uzak alan adı yapılandırması gerektiriyordu.
              `referrerPolicy` şart: Meta CDN referrer'lı isteği reddediyor ve
              beyaz etiket alan adını da sızdırmıyoruz.

              ═══ YAYINLANMIŞ GÖNDERİ BULANIK ═══

              Kullanıcının isteği birebir buydu: boostlanan gönderi listeden
              çıkmıyor, bulanıklaşıp "Yayınlandı" diyor. Kazancı tarama:
              onlarca kartlık bir listede hangilerinin işi bittiği tek bakışta
              görünüyor ve gönderi tarih sırasındaki yerini koruyor.

              BULANIKLIK TEK BAŞINA İŞARET DEĞİL — üstünde yazı da var. Renk
              ya da efekt tek başına anlam taşırsa, göremeyen kullanıcı için
              o anlam hiç yok.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={kayit.thumbnailUrl}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setGorselDustu(true)}
              className={`relative h-full w-full ${bicim.oturtma} ${
                yayinda ? 'scale-105 blur-[3px]' : ''
              }`}
            />
          </>
        ) : (
          /* Görsel yoksa kutu AYNI ORANDA duruyor: satırların yüksekliği
             ayrışırsa göz taraması satır satır yapılamıyor. */
          <div className="grid h-full w-full place-items-center px-1 text-center text-[11px] text-ink-muted">
            görsel yok
          </div>
        )}

        {yayinda && (
          <span className="absolute inset-0 grid place-items-center bg-black/45 text-[11px] font-semibold uppercase tracking-wide text-white">
            Yayınlandı
          </span>
        )}
      </div>

      {/* ═══ ORTA BÖLGE: HANGİ İÇERİK, HANGİ KARAR ═══ */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <DurumRozeti kayit={kayit} />
          {/*
            ROZET HESABIN ADINI TAŞIYOR.

            "Instagram" yazması hangi Instagram hesabı olduğunu söylemiyordu;
            bir workspace'te birden çok hesap ve kanal olabiliyor ve kullanıcı
            onayladığı içeriğin hangi markaya ait olduğunu ancak içeriği açarak
            görüyordu.

            HESAP ADI GÖRÜNMÜYORSA MECRA ADI YAZILIYOR: hesap havuza geri
            konmuşsa RLS satırı göstermiyor ve boş bir rozet, rozetin hiç
            olmamasından kötü.
          */}
          <span className="inline-flex min-w-0 items-center gap-1 rounded-md bg-surface-sunken px-1.5 py-0.5 text-[11px] text-ink-muted">
            <PlatformLogo
              kind={PLATFORM_KANALI[kayit.platform]}
              className="h-3 w-3 shrink-0"
            />
            <span className="truncate">
              {kayit.socialProfileName ?? PLATFORM_ETIKETI[kayit.platform]}
            </span>
          </span>
        </div>

        {/*
          ═══ GÖNDERİ METNİ AÇILABİLİR ═══

          İki satıra kırpılıyordu ve kırpılan yer çoğu zaman teklifin
          kendisiydi: kullanıcı neyi onayladığını görmek için gönderiyi yeni
          sekmede açmak zorundaydı. Varsayılan hâlâ iki satır — on kartlık bir
          listede her metnin tamamını açmak listeyi okunmaz yapıyor — ama
          tamamı bir tık uzakta.

          `line-clamp` kullanılıyor, `truncate` DEĞİL: nowrap kartın
          min-content genişliğini şişirip satırı yatay taşırıyordu.
        */}
        <p
          className={`min-w-0 whitespace-pre-line text-sm font-semibold text-ink ${
            metinAcik ? '' : 'line-clamp-2'
          }`}
        >
          {kayit.title || 'Başlıksız içerik'}
        </p>
        {(kayit.title?.length ?? 0) > 110 && (
          <button
            type="button"
            onClick={() => setMetinAcik(!metinAcik)}
            aria-expanded={metinAcik}
            className="self-start rounded text-[11px] font-medium text-ink-muted underline underline-offset-2 transition hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {metinAcik ? 'Metni kısalt' : 'Metnin tamamı'}
          </button>
        )}

        {/*
          ═══ İKİ TARİH, İKİ AYRI SORU ═══

          Sıralama GÖNDERİNİN tarihine göre ve o tarih burada MUTLAK yazıyor:
          "47 gün önce" bir takvim günü değil ve kullanıcı kartı kendi
          içerik takviminde arıyor. Reklamın açıldığı tarih ayrı yazılıyor —
          ikisi arasında haftalar olabiliyor ve tek bir tarih göstermek,
          hangisi olduğunu okuyana tahmin ettirirdi.
        */}
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-muted">
          <span>
            <span className="text-ink-muted">Gönderi:</span>{' '}
            <span className="font-medium text-ink">{formatTarih(kayit.publishedAt)}</span>
          </span>
          {kayit.launchedAt && (
            <span>
              <span className="text-ink-muted">Yayın:</span>{' '}
              <span className="font-medium text-ink">{formatTarih(kayit.launchedAt)}</span>
            </span>
          )}
          {kayit.permalink && (
            /*
              BAĞLANTI MARKA RENGİNDE DEĞİL.

              Kartta tek bir birincil eylem var ve o "Onayla". Aynı kartta
              marka renginde ikinci bir öğe, gözün nereye gideceğini
              belirsizleştiriyordu. Bağlantı olduğu ALTI ÇİZİLİ olmasından
              anlaşılıyor — renkle değil, çünkü renk tek başına anlam
              taşımamalı.
            */
            <a
              href={kayit.permalink}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-ink-muted underline underline-offset-2 transition hover:text-ink"
            >
              Gönderiyi aç
            </a>
          )}
        </p>

        {/* KİME GİDİYOR — bütçenin yanında, karar verilirken okunuyor. */}
        <Hedefleme kayit={kayit} />

        {/* ENGEL SEBEBİ SATIRDA. Düğmeyi kapatıp sebebini söylememek,
            kullanıcıya "çalışmıyor" göstermek olurdu. */}
        {kayit.blockedReason && (
          <p className="text-[11px] text-danger">{kayit.blockedReason}</p>
        )}
        {kayit.error && <p className="text-[11px] text-danger">{kayit.error}</p>}
        {hata && (
          <p role="alert" className="text-[11px] text-danger">
            {hata}
          </p>
        )}
        {/*
          SUNUCUNUN KENDİ CÜMLESİ. "Sürdürüldü" demek yetmiyor: hesap ya da
          kampanya üst seviyede duraklatılmışsa Meta reklamı yine göstermiyor
          ve bunu söyleyen tek yer bu mesaj.
        */}
        {not && (
          <p role="status" className="text-[11px] text-ink-muted">
            {not}
          </p>
        )}

        {/*
          YOUTUBE KAMPANYASI DURAKLATILMIŞ AÇILIYOR ve bu kullanıcıya
          SÖYLENİYOR. Meta yolundan farkı bilinçli: Google yazma yolu canlıda
          hiç çalışmadı ve ilk gerçek çağrının sonucunu insan görmeden para
          harcamamalı.
        */}
        {kayit.status === 'pending' && kayit.platform === 'google' && (
          <p className="text-[10px] text-ink-muted">
            Kampanya <strong>duraklatılmış</strong> açılır; Google Ads’te gözden
            geçirip yayına alman gerekiyor.
          </p>
        )}

        {/*
          ═══ DÖRT DÜĞME, DÖRT AYRI KARAR ═══

          Onayla ön ayarla yayınlıyor; Düzenle SADECE BU GÖNDERİ için bütçeyi,
          süreyi ve hedeflemeyi değiştirip yayınlıyor; Reddet kartı kapatıyor;
          Tekrar boostla kapanmış bir kartı karara geri açıyor.

          `mt-auto`: satırların yüksekliği metin uzunluğuna göre değişiyor ve
          düğmelerin ALT HİZADA olması göz taramasını satır satır yapılabilir
          kılıyor.
        */}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          {kayit.status === 'pending' && (
            <>
              <button
                type="button"
                onClick={() => void karar(true).catch(() => undefined)}
                disabled={!onaylanabilir || busy !== null}
                className={BIRINCIL_DUGME}
              >
                {busy === 'onay' ? 'Yayınlanıyor…' : 'Yayınla'}
              </button>
              <button
                type="button"
                onClick={() => setDuzenleAcik(true)}
                disabled={!onaylanabilir || busy !== null}
                className={IKINCIL_DUGME}
              >
                Düzenle
              </button>
              <button
                type="button"
                onClick={() => void karar(false).catch(() => undefined)}
                disabled={busy !== null}
                className={SESSIZ_DUGME}
              >
                {busy === 'ret' ? '…' : 'Yayınlama'}
              </button>
            </>
          )}

          {/*
            ═══ YAYINDAKİ KART ═══

            Duraklat harcamayı durduruyor ve geri alınabilir; İptal boost'u
            bitiriyor ve gönderiyi yeniden boostlanabilir bırakıyor. İkisini
            tek düğmede toplamak, "biraz durdur" ile "bu iş bitti"yi aynı
            tıklamaya bağlamak olurdu.
          */}
          {canli && (
            <>
              <button
                type="button"
                onClick={() => void yayinKontrol(duraklatilmis ? 'surdur' : 'duraklat')}
                disabled={busy !== null}
                className={duraklatilmis ? BIRINCIL_DUGME : IKINCIL_DUGME}
              >
                {busy === 'duraklat' || busy === 'surdur'
                  ? '…'
                  : duraklatilmis
                    ? 'Yayını sürdür'
                    : 'Yayını duraklat'}
              </button>
              <button
                type="button"
                onClick={() => setDuzenleAcik(true)}
                disabled={busy !== null}
                className={IKINCIL_DUGME}
              >
                Düzenle
              </button>
              <button
                type="button"
                onClick={() => void yayinKontrol('iptal')}
                disabled={busy !== null}
                className={SESSIZ_DUGME}
              >
                {busy === 'iptal' ? '…' : 'İptal'}
              </button>
            </>
          )}

          {tekrarGosterilsin && (
            <>
              <button
                type="button"
                onClick={() => void tekrarBoostla()}
                disabled={busy !== null || kayit.reBoostBlockedReason !== null}
                /*
                  ENGEL SEBEBİ `title`DA DEĞİL YANINDA — aşağıdaki satırda
                  yazılı. Kapalı bir düğmeye ipucu koymak, sebebi yalnızca
                  fareyle üstüne gelen kullanıcıya söylemek olurdu.
                */
                className={BIRINCIL_DUGME}
              >
                {busy === 'tekrar' ? '…' : 'Tekrar yayınla'}
              </button>
              <button
                type="button"
                onClick={() => setDuzenleAcik(true)}
                disabled={busy !== null || kayit.reBoostBlockedReason !== null}
                className={IKINCIL_DUGME}
              >
                Düzenle
              </button>
              {/*
                KAPANMIŞ KARTTA "YAYINLAMA" YALNIZCA KARTI KAPATIYOR.
                Yayındaki bir reklamı durdurmak İPTAL'in işi; ikisini
                birleştirmek, listeden kaldırmak isteyen kullanıcının farkında
                olmadan yayındaki reklamı durdurması olurdu.
              */}
              {kayit.status !== 'rejected' && (
                <button
                  type="button"
                  onClick={() => void kapat()}
                  disabled={busy !== null}
                  className={SESSIZ_DUGME}
                >
                  {busy === 'kapat' ? '…' : 'Yayınlama'}
                </button>
              )}
              {kayit.reBoostBlockedReason && (
                <span className="text-[11px] text-ink-muted">
                  {kayit.reBoostBlockedReason}
                </span>
              )}
            </>
          )}

          {kayit.status === 'launching' && (
            <span className="text-[11px] text-ink-muted">Yayına alınıyor…</span>
          )}
        </div>
      </div>

      {/* ═══ SAĞ BÖLGE: NE OLACAK / NE OLDU ═══ */}
      <div className="w-full shrink-0 border-t border-line/60 pt-3 sm:w-56 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
        <SagBolge kayit={kayit} />
      </div>

      {duzenleAcik && (
        <KartDuzenle
          kayit={kayit}
          clientId={clientId}
          onKapat={() => setDuzenleAcik(false)}
          onYayinla={(override) => karar(true, override)}
        />
      )}
    </article>
  );
}

/**
 * ═══ SAĞ SÜTUN KARTIN DURUMUNA GÖRE DEĞİŞİYOR ═══
 *
 * Onay bekleyen kartta sorulan şey "ne kadara mal olacak", yayınlanmış kartta
 * "ne oldu". Aynı alanı iki soruya birden ayırmak yerine soru kartın
 * durumundan okunuyor; iki bloğu üst üste çizmek, karar anında okunması
 * gereken tutarı ikinci sıraya düşürürdü.
 */
function SagBolge({ kayit }: { kayit: AutoBoostQueueItemRecord }) {
  if (kayit.performance) {
    const p = kayit.performance;
    /*
     * CTR VE EBM BURADA HESAPLANIYOR, SUNUCUDA DEĞİL.
     *
     * İkisi de türetilmiş: gösterim yoksa CTR TANIMSIZ, dönüşüm yoksa EBM
     * TANIMSIZ ve ikisinde de "%0" yazmak "kampanyan çalışmıyor" demek olur.
     * `null` geçmek biçimlendiriciye "—" yazdırıyor.
     */
    const ctr = p.impressions > 0 ? (p.clicks / p.impressions) * 100 : null;
    /*
     * DÖNÜŞÜM ONDALIKLI GELEBİLİYOR ve BÖLEN SIFIRA YUVARLANABİLİYOR.
     *
     * Google kısmi dönüşüm döndürüyor (`0,4` gibi). `conversions > 0` koşulu
     * geçiyor ama binde bire yuvarlanan bölen SIFIR olabiliyor ve `BigInt`
     * bölmesi sıfıra bölümde RangeError fırlatıyor — kartın tamamı çizilmez
     * hâle gelirdi. Koşul BÖLENİN kendisine bakıyor.
     *
     * Çarpan bölmeden ÖNCE: sonra çarpmak, tam sayı bölmesinde her tutarı
     * bine yuvarlardı.
     */
    const bolen = Math.round(p.conversions * 1000);
    const cpa =
      bolen > 0 ? ((BigInt(p.spendMicros) * 1000n) / BigInt(bolen)).toString() : null;

    return (
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        <Olcum etiket="Harcama" deger={formatMoney(p.spendMicros, 'TRY')} vurgulu />
        <Olcum etiket="Dönüşüm" deger={formatNumber(p.conversions)} vurgulu />
        <Olcum etiket="Gösterim" deger={formatNumber(p.impressions)} />
        <Olcum etiket="Tık" deger={formatNumber(p.clicks)} />
        <Olcum etiket="TO" deger={formatPercent(ctr)} />
        <Olcum etiket="EBM" deger={formatMoney(cpa, 'TRY')} />
      </dl>
    );
  }

  /*
   * SAYI YOKSA SEBEBİ YAZIYOR. "Kampanya henüz senkronize edilmedi" ile
   * "hiç gösterim almadı" aynı boş alana çevrilirse, kullanıcı çalışan bir
   * kampanyayı bozuk sanıp aramaya çıkar.
   */
  if (kayit.performanceNote) {
    return <p className="text-[11px] text-ink-muted">{kayit.performanceNote}</p>;
  }

  /*
   * UYGULANACAK AYAR — KARARIN YANINDA.
   * Bu düğmeler para harcıyor ve ne kadar harcanacağı karara BAKARKEN
   * görünmeli; altına koymak, kullanıcının tıkladıktan sonra okuması demek
   * olurdu.
   */
  if (kayit.preset) {
    return (
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-1">
        <Olcum
          etiket={kayit.preset.budgetMode === 'daily' ? 'Günlük bütçe' : 'Toplam bütçe'}
          deger={formatMoney(kayit.preset.budgetMicros, 'TRY')}
          vurgulu
        />
        <Olcum etiket="Süre" deger={`${kayit.preset.durationDays} gün`} />
      </dl>
    );
  }

  return <p className="text-[11px] text-ink-muted">Ön ayar yok.</p>;
}

/**
 * ═══ KİME GİDİYOR ═══
 *
 * Hedefleme ön ayarın içinde duruyordu ve kartta HİÇ görünmüyordu: kullanıcı
 * onayladığı reklamın kime gideceğini görmek için ön ayarı açmak zorundaydı.
 * Bu ekranda her onay para harcıyor ve kime harcandığı, ne kadar harcandığı
 * kadar önemli.
 *
 * ÖZET ORTAK ÜRETİCİDEN (`hedeflemeOzeti`): kart, düzenleme penceresi ve ön
 * ayar formu aynı cümleyi göstermek zorunda ve ikinci bir üretici doğduğu an
 * ayrışır.
 */
function Hedefleme({ kayit }: { kayit: AutoBoostQueueItemRecord }) {
  if (!kayit.preset) return null;
  const satirlar = hedeflemeOzeti(kayit.preset.settings);

  return (
    <dl className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-[11px]">
      {satirlar.map((r) => (
        <div key={r.etiket} className="min-w-0">
          <dt className="truncate text-ink-muted">{r.etiket}</dt>
          <dd className="truncate font-medium text-ink" title={r.deger}>
            {r.deger}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * ÖLÇÜM HÜCRESİ — etiket üstte, sayı altta.
 *
 * `tabular-nums`: sayılar alt alta duruyor ve orantılı rakamlarda basamaklar
 * hizalanmıyor; hizalanmayan bir sütunda iki satırı karşılaştırmak gözle
 * yapılamıyor.
 */
function Olcum({
  etiket,
  deger,
  vurgulu = false,
}: {
  etiket: string;
  deger: string;
  vurgulu?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[10px] uppercase tracking-wide text-ink-muted">
        {etiket}
      </dt>
      <dd
        className={`truncate tabular-nums ${
          vurgulu ? 'text-sm font-semibold text-ink' : 'text-sm text-ink'
        }`}
      >
        {deger}
      </dd>
    </div>
  );
}

/**
 * DURUM ROZETİ — renk TEK BAŞINA anlam taşımıyor, metin de var.
 *
 * Yayınlanmış kart yeşil DEĞİL nötr: yeşil "her şey yolunda" diye okunuyor
 * ve süresi dolmuş bir boost ile hâlâ harcayan bir boost aynı renkte
 * görünürse, aylık harcamayı gözle toplayan biri yanlış sayıya varır.
 */
function DurumRozeti({ kayit }: { kayit: AutoBoostQueueItemRecord }) {
  /*
   * ═══ ROZET KAMPANYANIN DURUMUNU SÖYLÜYOR, KARTINKİNİ DEĞİL ═══
   *
   * Kart yayına girdikten sonra durumu `launched` olarak KALIYOR: kampanya
   * duraklatılsa da bitse de kart aynı. Rozet kart durumundan okununca
   * süresi dolmuş bir boost "Yayında" yazıyor ve hemen altındaki düğme
   * "Tekrar yayınla" diyordu — aynı kartta iki farklı gerçek.
   *
   * Kampanya durumu biliniyorsa o kazanıyor; bilinmiyorsa (henüz
   * yayınlanmamış kart ya da YouTube yolu) kartın kendi durumu yazılıyor.
   */
  const anahtar = kayit.boostDurumu ?? kayit.status;
  const ton = DURUM_TONU[anahtar] ?? 'bg-surface-sunken text-ink-muted ring-line';
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${ton}`}
    >
      {DURUM_ETIKETI[anahtar] ?? anahtar}
    </span>
  );
}

/**
 * ═══ DÜĞME SINIFLARI TEK TANIMDA ═══
 *
 * Kartın üç hâli var ve her hâlde üç düğme çiziliyor: dokuz yerde aynı uzun
 * sınıf dizesi. Elle kopyalanınca biri odak halkasını, biri kapalı hâlini
 * düşürüyor ve fark yalnızca klavyeyle gezen kullanıcıda görünüyor.
 *
 * ODAK HALKASI HER ÜÇÜNDE DE VAR: `focus-visible` olmadan klavye kullanıcısı
 * hangi düğmede olduğunu göremiyor ve bu düğmeler para harcıyor.
 */
const BIRINCIL_DUGME =
  'rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted';

const IKINCIL_DUGME =
  'rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:text-ink-muted disabled:opacity-70';

const SESSIZ_DUGME =
  'rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-muted transition hover:bg-surface-sunken hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-70';

const DURUM_TONU: Record<string, string> = {
  pending: 'bg-warn-soft text-warn-strong ring-warn/30',
  candidate: 'bg-warn-soft text-warn-strong ring-warn/30',
  approved: 'bg-info-soft text-info-strong ring-info/30',
  launching: 'bg-info-soft text-info-strong ring-info/30',
  creating: 'bg-info-soft text-info-strong ring-info/30',
  /*
   * YAYINDAKİ KAMPANYA YEŞİL: para O AN harcanıyor ve bu, kartın taşıdığı
   * en önemli bilgi. Biten ve reddedilen nötr; duraklatılmış UYARI renginde
   * çünkü yapılacak bir iş var — ya sürdürülecek ya iptal edilecek.
   */
  active: 'bg-ok-soft text-ok-strong ring-ok/30',
  launched: 'bg-surface-sunken text-ink-muted ring-line',
  completed: 'bg-surface-sunken text-ink-muted ring-line',
  paused: 'bg-warn-soft text-warn-strong ring-warn/30',
  rejected: 'bg-surface-sunken text-ink-muted ring-line',
  failed: 'bg-danger-soft text-danger-strong ring-danger/30',
};

const DURUM_ETIKETI: Record<string, string> = {
  pending: 'Onay bekliyor',
  /*
   * BOOST DURUMLARI DA BU TABLODA. Rozet iki kaynaktan besleniyor (kartın
   * durumu ve kampanyanın durumu) ve ikisi için ayrı tablo tutmak, birine
   * eklenip diğerine eklenmeyen bir değerin ekranda ham hâliyle görünmesi
   * demek olurdu.
   */
  completed: 'Süresi doldu',
  paused: 'Duraklatıldı',
  creating: 'Oluşturuluyor',
  candidate: 'Onay bekliyor',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
  launching: 'Yayına alınıyor',
  launched: 'Yayında',
  failed: 'Başarısız',
};
