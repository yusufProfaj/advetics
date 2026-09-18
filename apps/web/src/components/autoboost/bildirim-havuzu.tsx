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
import { formatMoney, formatRelative } from '@/lib/format';
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
export function BildirimHavuzu({ clientId }: { clientId: string }) {
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
            : 'Yeni içerikler yüklenemedi. Sayfayı yenilemeyi dene.',
        ),
      );
  }, [clientId]);

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
        <p className="text-sm font-semibold text-danger">Yeni içerikler listesi açılamadı</p>
        <p className="mt-1 text-xs text-ink-muted">{hata}</p>
      </div>
    );
  }

  if (!liste) {
    return <p className="text-xs text-ink-muted">Yeni içerikler yükleniyor…</p>;
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
  const gosterilen =
    suzgec === 'hepsi' ? liste.items : liste.items.filter((k) => k.platform === suzgec);

  return (
    <section className="min-w-0 space-y-3">
      <header className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
        {/*
          BAŞLIK "BİLDİRİM HAVUZU" DEĞİL.

          "Havuz" bizim iç terimimiz; kullanıcının gördüğü şey yeni
          yayınlanan içerikler. Ayrıca sayfada İKİ onay kuyruğu var ve eski
          hâlde ikisi de yalnızca "onay bekliyor" diyordu — bir gönderinin
          neden burada olup diğerinde olmadığı hiçbir yerde yazmıyordu.
          Buradakiler YENİ, alttakiler kuralın performansa bakıp seçtikleri.
        */}
        <h2 className="text-sm font-semibold text-ink">
          Yeni içerikler
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
        <p className="text-[11px] text-ink-muted">
          {/* SÜZGEÇ AÇIKKEN KAÇ KARTIN GİZLENDİĞİ DE YAZIYOR: süzgeci
              unutan kullanıcı eksik listeyi "kart gelmemiş" diye okur. */}
          {gosterilen.length} kart gösteriliyor
          {gosterilen.length < liste.items.length &&
            ` · ${liste.items.length - gosterilen.length} kart süzgeçte`}
          {liste.total > liste.items.length && ` · toplam ${liste.total}, en yeniler`}
        </p>
      </header>

      {mecralar.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <SuzgecDugmesi
            etiket="Tümü"
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
            Bu mecrada kart yok. Diğer sekmelerde {liste.items.length} kart var.
          </p>
        </div>
      )}

      {/*
        IZGARA — DİKEY KARTLAR YAN YANA.
        Kartlar tam genişlikte yatay şeritlerdi: 64 piksellik bir küçük
        resim, yanında metin, sağda bir düğme. İçerik bir Instagram
        gönderisi ve gönderiyi TANIMANIN yolu görselini görmek; şerit
        düzeninde kullanıcı neyi onayladığını ancak "İçeriği aç"a basıp
        yeni sekmede bakarak anlıyordu.
      */}
      {/*
        SIĞDIĞI KADAR KOLON. Üç kolonda kartlar geniş ekranda gereksiz
        büyüyordu ve tek satıra üçten fazla gönderi sığmıyordu; kart bir
        gönderi ÖNİZLEMESİ ve onu tanımak için 260 piksel yetiyor.
        Eşikler kart genişliğine göre seçildi, ekran adına göre değil.
      */}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
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
  const [busy, setBusy] = useState<'onay' | 'ret' | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  const onaylanabilir = kayit.status === 'pending' && kayit.blockedReason === null;
  const bicim = GORSEL_BICIMI[kayit.platform];

  /**
   * KARAR — onayla, reddet ya da ÖZELLEŞTİRİLMİŞ ayarlarla onayla.
   *
   * ═══ BU YOL PARA HARCIYOR ═══
   *
   * Ara onay adımı YOK: kararı kullanıcı zaten bu ekranda veriyor ve ikinci
   * kez sormak istenen akışı bozardı. Ama harcanacak tutar düğmelerin
   * ÜSTÜNDE yazıyor ve engel varsa düğme açılmıyor.
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

  return (
    <article className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface">
      {/*
        ═══ DİKEY GÖNDERİ — 4:5 ═══

        Instagram'ın dikey gönderi oranı. Kare kullanmak dikey gönderilerin
        ve reels'in üstünü/altını kırpıyor; 4:5 ikisini de gösteriyor ve
        yatay bir gönderide üstte/altta ince bir zemin bırakıyor —
        kırpmaktan iyi, çünkü kırpılan yer çoğu zaman ürünün kendisi.
      */}
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-surface-sunken">
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
              CDN'inden geliyor ve uzak alan adı yapılandırması gerektiriyordu;
              elle boost ekranında aynı karar verildi ve görseller ancak öyle
              göründü. `referrerPolicy` şart: Meta CDN referrer'lı isteği
              reddediyor ve beyaz etiket alan adını da sızdırmıyoruz.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={kayit.thumbnailUrl}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setGorselDustu(true)}
              className={`relative h-full w-full ${bicim.oturtma}`}
            />
          </>
        ) : (
          /* Görsel yoksa kutu AYNI ORANDA duruyor: ızgarada kartların
             yüksekliği ayrışırsa göz taraması satır satır yapılamıyor. */
          <div className="grid h-full w-full place-items-center text-[11px] text-ink-muted">
            görsel yok
          </div>
        )}

        {/*
          ROZET ARTIK HESABIN ADINI DA TAŞIYOR.

          "Instagram" yazması hangi Instagram hesabı olduğunu söylemiyordu; bir
          workspace'te birden çok hesap ve kanal olabiliyor ve kullanıcı
          onayladığı içeriğin hangi markaya ait olduğunu ancak içeriği açarak
          görüyordu. Logo metin yerine geçiyor: mecra adını da yazmak, dar
          kartta hesap adını kırpardı.

          HESAP ADI GÖRÜNMÜYORSA MECRA ADI YAZILIYOR. Hesap havuza geri
          konmuşsa RLS satırı göstermiyor ve boş bir rozet, rozetin hiç
          olmamasından kötü.
        */}
        <span className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
          <PlatformLogo kind={PLATFORM_KANALI[kayit.platform]} className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {kayit.socialProfileName ?? PLATFORM_ETIKETI[kayit.platform]}
          </span>
        </span>

        {kayit.status !== 'pending' && (
          <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
            {DURUM_ETIKETI[kayit.status] ?? kayit.status}
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
        <div className="flex min-w-0 items-center gap-2 text-[11px] text-ink-muted">
          {kayit.publishedAt && <span>{formatRelative(kayit.publishedAt)}</span>}
          {kayit.permalink && (
            <a
              href={kayit.permalink}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-brand-strong hover:underline"
            >
              İçeriği aç
            </a>
          )}
        </div>

        {/* `line-clamp` — `truncate` DEĞİL: nowrap, kartın min-content
            genişliğini şişirip ızgarayı yatay taşırıyordu. */}
        <p className="line-clamp-2 min-w-0 text-sm text-ink">
          {kayit.title || 'Başlıksız içerik'}
        </p>

        {/*
          UYGULANACAK AYAR — DÜĞMELERİN ÜSTÜNDE.
          Bu düğmeler para harcıyor ve ne kadar harcanacağı karara BAKARKEN
          görünmeli; altına koymak, kullanıcının tıkladıktan sonra okuması
          demek olurdu.
        */}
        {kayit.preset && (
          <p className="rounded-lg bg-surface-sunken px-2 py-1.5 text-[11px] text-ink-muted">
            <strong className="text-ink">
              {formatMoney(kayit.preset.budgetMicros, 'TRY')}
            </strong>
            {kayit.preset.budgetMode === 'daily' ? ' / gün' : ' toplam'} ·{' '}
            {kayit.preset.durationDays} gün
          </p>
        )}

        {/*
          ═══ YAYINLANDIĞI KARTTA YAZIYOR ═══

          Bu blok yoktu ve eksikliği kullanıcıdan birebir şu cümleyle geldi:
          "yayınlandı bildirimi alt tarafta gözüküyor fakat kartta belli
          olmuyor". Onaydan sonra düğmeler kayboluyor, yerine HİÇBİR ŞEY
          konmuyordu; başarının tek izi sayfanın en altındaki "Geçmiş"
          satırıydı.
        */}
        {kayit.status === 'launched' && (
          <p className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-ok/40 bg-ok/5 px-2 py-1 text-[11px] text-ink">
            <span aria-hidden="true">✓</span>
            <strong>Yayında</strong>
            {kayit.externalCampaignId && (
              <span className="text-ink-muted">· kampanya {kayit.externalCampaignId}</span>
            )}
          </p>
        )}
        {kayit.status === 'launching' && (
          <p className="rounded-lg border border-line bg-surface-muted px-2 py-1 text-[11px] text-ink-muted">
            Yayına alınıyor…
          </p>
        )}

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
          YOUTUBE KAMPANYASI DURAKLATILMIŞ AÇILIYOR ve bu kullanıcıya
          SÖYLENİYOR. Meta yolundan farkı bilinçli: Google yazma yolu canlıda
          hiç çalışmadı ve ilk gerçek çağrının sonucunu insan görmeden para
          harcamamalı. Söylemezsek kullanıcı "yayınladım" sanıp Ads
          Manager'da duraklatılmış bir kampanya bulur ve sebebini arar.
        */}
        {kayit.status === 'pending' && kayit.platform === 'google' && (
          <p className="text-[10px] text-ink-muted">
            Kampanya <strong>duraklatılmış</strong> açılır; Google Ads’te gözden
            geçirip yayına alman gerekiyor.
          </p>
        )}

        {/*
          ═══ ÜÇ DÜĞME, ÜÇ AYRI KARAR ═══

          Onayla ön ayarla yayınlıyor; Düzenle SADECE BU GÖNDERİ için
          bütçeyi, süreyi ve hedeflemeyi değiştirip yayınlıyor; Reddet kartı
          kapatıyor. Düzenle'yi onayın içine gömmek (önce pencere, sonra
          yayın) çoğunluk için fazladan bir adım olurdu: kartların çoğu ön
          ayarla yayınlanıyor ve akışın vaadi "tek tık".

          `mt-auto`: ızgaradaki kartlar farklı uzunlukta metin taşıyor ve
          düğmelerin ALT HİZADA olması göz taramasını satır satır
          yapılabilir kılıyor.
        */}
        {kayit.status === 'pending' && (
          <div className="mt-auto grid grid-cols-3 gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => void karar(true).catch(() => undefined)}
              disabled={!onaylanabilir || busy !== null}
              className="rounded-lg bg-brand px-2 py-2 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted"
            >
              {busy === 'onay' ? '…' : 'Onayla'}
            </button>
            <button
              type="button"
              onClick={() => setDuzenleAcik(true)}
              disabled={!onaylanabilir || busy !== null}
              className="rounded-lg border border-line px-2 py-2 text-xs font-medium text-ink transition hover:bg-surface-sunken disabled:cursor-not-allowed disabled:text-ink-muted"
            >
              Düzenle
            </button>
            <button
              type="button"
              onClick={() => void karar(false).catch(() => undefined)}
              disabled={busy !== null}
              className="rounded-lg border border-line px-2 py-2 text-xs font-medium text-ink-muted transition hover:bg-surface-sunken hover:text-danger disabled:cursor-not-allowed"
            >
              {busy === 'ret' ? '…' : 'Reddet'}
            </button>
          </div>
        )}
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

const DURUM_ETIKETI: Record<string, string> = {
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
  launching: 'Yayına alınıyor',
  launched: 'Yayında',
  failed: 'Başarısız',
};
