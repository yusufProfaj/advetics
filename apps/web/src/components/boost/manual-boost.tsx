'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  MEDIA_TYPE_LABELS,
  type BoostablePostList,
  type BoostablePostRecord,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { formatNumber } from '@/lib/format';

/**
 * ELLE BOOST — "gönderi seç → kampanya → bütçe ve süre → nereye/kime → yayınla".
 *
 * BEŞ ADIM, TEK EKRAN, ARA ONAY YOK (§7.2). Kampanya adımı sonradan eklendi
 * (K21): ilk gönderi kendi kampanyasını açıyor, sonraki gönderiler o
 * kampanyanın altına kendi reklam seti ve reklamıyla eklenebiliyor. Kural yolundaki "aday → onay"
 * adımı burada yok çünkü kararı zaten kullanıcı veriyor; ikinci kez sormak
 * istenen akışı bozmak olurdu.
 *
 * EKRANIN TAŞIDIĞI TEK MESAJ: bu düğme para harcıyor ve ne kadar harcadığı
 * düğmenin ÜSTÜNDE yazıyor (K19). Sert bir tavan yok — karar kullanıcının —
 * ama tutarı görmeden verilen bir karar olmasın.
 *
 * PANEL BAŞLIK SATIRINDA DEĞİL, ONUN ALTINDA — ve bu bir yerleşim zorunluluğu.
 * Form ilk yazımda sayfa başlığının düğme satırının içindeydi; dört adımlı bir
 * form iki düğmenin yanına flex öğesi olarak giriyordu. Satırdaki gönderi
 * metni `truncate` (nowrap) olduğu için formun min-content genişliği 1142px'e
 * çıkıyor ve flex öğesi `min-width:auto` yüzünden o genişliğin altına
 * küçülemiyor: canlıda 1280px ekranda 153px yatay BELGE taşması ölçüldü.
 * Kenar çubuğu `sticky` yalnızca dikey sabitlediği için kullanıcı sağa
 * kaydırınca sol kenar ekrandan çıkıyor ve metinler "soldan kesilmiş"
 * görünüyordu. Panel blok seviyesine alındığında genişlik veriye göre de
 * oynamıyor: liste boşken 715px, dolduğunda 984px zıplıyordu.
 */
export function ManualBoost({
  clientId,
  canPublish,
}: {
  clientId: string;
  canPublish: boolean;
}) {
  const [acik, setAcik] = useState(false);

  if (!canPublish) return null;

  return (
    <div className="min-w-0">
      {!acik ? (
        <button
          type="button"
          onClick={() => setAcik(true)}
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white"
        >
          Gönderi öne çıkar
        </button>
      ) : (
        <ManualBoostForm clientId={clientId} onClose={() => setAcik(false)} />
      )}
    </div>
  );
}

/**
 * Profil türü etiketleri.
 *
 * ÖNCEDEN İKİLİYDİ (`instagram_business ? 'Instagram' : 'Facebook'`) ve
 * Advetics 1.0 ile `youtube_channel` eklenince bir YouTube kanalı sessizce
 * "Facebook" diye görünürdü. Kayıt tablosu, yeni tür eklendiğinde en kötü
 * ihtimalle ham değeri gösteriyor — yanlış bir etiket göstermiyor.
 */
const PROFIL_ETIKETI: Record<string, string> = {
  facebook_page: 'Facebook',
  instagram_business: 'Instagram',
  youtube_channel: 'YouTube',
};

/**
 * Lokasyon türü etiketleri.
 *
 * TÜR EKRANDA GÖRÜNÜYOR çünkü seçim sonucu değiştiriyor: "Türkiye" seçmek ülke
 * geneli, "İzmir" seçmek şehir demek ve ikisi Meta'da farklı kovalara gidiyor.
 * Aynı adı taşıyan bir il ile bir şehir de olabiliyor.
 */
/** Hazır bütçe/süre ön ayarları — ham sayı kutusundan önce gelir. */
/**
 * ═══ GÖNDERİ ÖNE ÇIKAR — TEK SORU: HANGİ GÖNDERİ ═══
 *
 * Bu bileşen beş adımlı bir formdu: gönderi, kampanya, bütçe, hedefleme,
 * yayınla. Sorun teknik değil KAVRAMSALDI — aynı satırda İKİ farklı bütçe
 * davranışı duruyordu. Satıra tıklamak formu besliyor, satırın SAĞINDAKİ
 * "Yayınla" düğmesi ise formu tamamen atlayıp ÖN AYARLA yayınlıyordu.
 * İki ayrı API ucu, iki ayrı ayar kümesi, tek ekran.
 *
 * KARAR: ÖN AYAR GEÇERLİ. Bütçe, süre ve hedefleme tek yerden belirleniyor
 * (başlıktaki "Boost ön ayarı"); burada yalnızca hangi gönderinin öne
 * çıkacağı soruluyor. Ön ayar artık şehir ve kayıtlı kitle de taşıyor —
 * yani formun sorduğu her şeyi kapsıyor, kaldırmak yetenek kaybı değil.
 */
function ManualBoostForm({
  clientId,
  onClose,
}: {
  clientId: string;
  onClose: () => void;
}) {
  const [posts, setPosts] = useState<BoostablePostList | null>(null);

  const gonderileriYukle = useCallback(() => {
    void apiFetch<BoostablePostList>(`/boosts/posts?clientId=${clientId}`)
      .then(setPosts)
      .catch(() =>
        setPosts({
          items: [],
          total: 0,
          limit: 0,
          emptyReason: 'Gönderiler yüklenemedi. Sayfayı yenilemeyi dene.',
        }),
      );
  }, [clientId]);

  useEffect(() => {
    gonderileriYukle();
  }, [gonderileriYukle]);

  const engelliSayi = posts?.items.filter((p) => p.blockedReason).length ?? 0;

  return (
    <section className="w-full min-w-0 space-y-3 rounded-xl border border-line bg-surface p-4">
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">Gönderi öne çıkar</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Bütçe ve hedefleme <strong>Boost ön ayarından</strong> geliyor.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-sunken"
        >
          Kapat
        </button>
      </header>

      {posts === null && <p className="text-xs text-ink-muted">Gönderiler yükleniyor…</p>}

      {/*
        BOŞ DURUM KESİKLİ ÇERÇEVEYLE ve `emptyReason` yapılacak işi söylüyor:
        sayfa atanmamış / izleme kapalı / süpürme koşmamış / senkronizasyon
        hata verdi. Dördü de tek satırlık gri bir kutuya sığmıyordu.
      */}
      {posts && posts.items.length === 0 && (
        <div className="rounded-xl border border-dashed border-line bg-surface p-6 text-center">
          <p className="text-sm font-semibold text-ink">Öne çıkarılacak gönderi yok</p>
          <p className="mx-auto mt-2 max-w-lg text-xs text-ink-muted">
            {posts.emptyReason ?? 'Bu müşteride henüz çekilmiş gönderi yok.'}
          </p>
        </div>
      )}

      {posts && posts.items.length > 0 && posts.items.every((p) => !p.presetReady) && (
        /*
          ÖN AYAR YOKSA TEK BANT — her satıra ayrı uyarı yazmak yerine.
          Bant yalnızca HİÇBİRİ hazır değilken çıkıyor; karışık durumda
          satırın kendi notu görünüyor.

          FORM KALKTIĞI İÇİN BU ARTIK BİR ÖN KOŞUL. Eskiden "aşağıdaki form
          ön ayarsız da kullanılabilir" yazıyordu ve o cümle artık yanlış.
        */
        <div className="rounded-xl border border-warn/40 bg-warn/5 px-3 py-2.5">
          <p className="text-xs font-semibold text-ink">Önce boost ön ayarını kur</p>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            Bu müşteri için Meta ön ayarı tanımlı değil ya da kapalı. Bütçeyi,
            süreyi ve hedeflemeyi yukarıdaki <strong>Boost ön ayarı</strong>{' '}
            düğmesinden bir kez tanımladıktan sonra gönderilerin yanındaki
            “Yayınla” düğmesi çalışır.
          </p>
        </div>
      )}

      {posts && posts.items.length > 0 && (
        <>
          <ul className="overflow-hidden rounded-xl border border-line">
            {posts.items.map((p) => (
              <li
                key={p.id}
                className="flex items-stretch gap-1 border-b border-line pr-2 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <PostRow post={p} />
                </div>
                <div className="flex shrink-0 items-center">
                  <YayinlaDugmesi
                    post={p}
                    clientId={clientId}
                    onYayinlandi={gonderileriYukle}
                  />
                </div>
              </li>
            ))}
          </ul>
          {/*
            SAYAÇ KOŞULSUZ. "Sessiz kesme yok": kaç gönderi gösterildiği ve
            kaçının kullanılamadığı her zaman yazılı.
          */}
          <p className="text-[11px] text-ink-muted">
            {posts.items.length} gönderi gösteriliyor
            {posts.total > posts.items.length && ` · toplam ${posts.total}, en yeniler`}
            {engelliSayi > 0 && ` · ${engelliSayi} tanesi öne çıkarılamıyor (sebebi satırda)`}
          </p>
        </>
      )}
    </section>
  );
}

/**
 * Bir gönderi satırı — GÖRSELİYLE, engelliyse SEBEBİYLE.
 *
 * SATIRIN TAMAMI TIKLANABİLİR: ayrı bir "Seç" düğmesi, tıklama alanını
 * gereksiz daraltıyordu. Engelli satır `disabled` — tıklanamıyor ama
 * listeden GİZLENMİYOR: Instagram gönderisini aramaya gelen kullanıcı
 * bulamayınca senkronizasyonun bozuk olduğunu sanıyor.
 */
/**
 * Gönderi satırı — ARTIK TIKLANABİLİR DEĞİL.
 *
 * `<button>` idi ve tıklamanın tek işlevi kaldırılan formu beslemekti.
 * Tıklanan ama hiçbir şey yapmayan bir satır bırakmak, çalışmayan bir
 * düğme göstermekle aynı şey; üstelik yanındaki gerçek "Yayınla"
 * düğmesiyle karışırdı. Eylem artık yalnızca sağdaki düğmede.
 */
function PostRow({ post }: { post: BoostablePostRecord }) {
  const engelli = post.blockedReason !== null;
  const [gorselDustu, setGorselDustu] = useState(false);
  const gorselVar = post.thumbnailUrl !== null && !gorselDustu;

  return (
    <div
      className={`flex w-full min-w-0 items-start gap-3 px-3 py-2.5 text-left ${
        engelli ? 'opacity-60' : ''
      }`}
    >
      {/*
        GÖRSEL DÜZ <img> İLE — `next/image` DEĞİL ve bu depo genelindeki karar.
        Meta'nın CDN adresleri imzalı ve süresi doluyor; `next/image` onları
        kendi proxy'sinde önbelleğe alır, imza dolunca optimizer hata döndürür.
        Üstelik `remotePatterns`'a fbcdn yazmak joker alt alan adı gerektiriyor
        ve panelin kendi origin'i üzerinden herhangi bir fbcdn nesnesini
        servis eden bir görsel proxy'si açardı.

        `referrerPolicy="no-referrer"`: beyaz etiket alan adını Meta'ya
        sızdırmamak için. `onError`: imzası dolmuş adres boş kutu bırakmasın,
        medya tipi etiketine düşsün.
      */}
      {gorselVar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.thumbnailUrl!}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setGorselDustu(true)}
          className="h-16 w-16 shrink-0 rounded-lg bg-surface-sunken object-cover"
        />
      ) : (
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-[10px] text-ink-muted">
          {MEDIA_TYPE_LABELS[post.mediaType]}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <Chip
            cls={
              post.profileType === 'instagram_business'
                ? 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200'
                : 'bg-sky-50 text-sky-700 ring-sky-200'
            }
          >
            {PROFIL_ETIKETI[post.profileType] ?? post.profileType}
          </Chip>
          <span className="truncate text-[11px] text-ink-muted">
            {post.socialProfileName}
          </span>
        </span>

        {/*
          METİN İKİ SATIRDA KIRPILIYOR, tek satırda DEĞİL. Tek satır `truncate`
          (nowrap) formun min-content genişliğini metnin tamamına çıkarıyordu ve
          yatay taşmanın ölçülmüş sebebi buydu. `line-clamp` sarmayı koruyor.
        */}
        <span className="mt-0.5 line-clamp-2 block text-sm text-ink">
          {post.message ?? `${MEDIA_TYPE_LABELS[post.mediaType]} gönderisi`}
        </span>

        <span className="mt-0.5 block text-[11px] text-ink-muted">
          {formatNumber(post.reach)} erişim · {formatNumber(post.engagements)} etkileşim
          {post.engagementRate !== null && ` · %${post.engagementRate.toFixed(1)}`}
        </span>

        {post.blockedReason && (
          <span className="mt-1 block text-[11px] text-ink-muted">{post.blockedReason}</span>
        )}
        {post.warning && !post.blockedReason && (
          <span className="mt-1 block text-[11px] text-warn">{post.warning}</span>
        )}
      </span>
    </div>
  );
}

/**
 * "YAYINLA" / "TEKRAR BOOSTLA" — tek tıkla yayın.
 *
 * KULLANICI HİÇBİR ŞEY GİRMİYOR. Bütçe, süre, hedefleme ve ad Bilgi
 * Bankası ön ayarından geliyor; bu düğme yalnızca gönderiyi ve müşteriyi
 * söylüyor. İstek gövdesine bütçe koyulabilseydi "ön ayar uygulanıyor"
 * iddiası yalnızca ekranda doğru olurdu.
 *
 * ÜÇ AYRI ETKİSİZLİK SEBEBİ VE ÜÇÜ DE YAZILI. Düğmeyi sebepsiz kapatmak,
 * kullanıcıya "çalışmıyor" göstermek olurdu:
 *   · gönderi engelli (canlı boost, hesap yok, Instagram ana sayfası yok)
 *   · ön ayar yok ya da kapalı
 *   · yayın sürüyor
 *
 * HATA YUTULMUYOR. Sunucudan gelen mesaj platformun kendi cümlesini
 * taşıyor ve bu projede tek teşhis kaynağı o.
 */
function YayinlaDugmesi({
  post,
  clientId,
  onYayinlandi,
}: {
  post: BoostablePostRecord;
  clientId: string;
  onYayinlandi: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const engelli = post.blockedReason !== null;
  const onAyarYok = !post.presetReady;
  const kapali = engelli || onAyarYok || busy;

  // DAHA ÖNCE ÖNE ÇIKARILMIŞSA ETİKET DEĞİŞİYOR (K20). Aynı gönderiyi
  // yeniden boostlamak yasak değil; kullanıcı bunu bilerek yapıyor.
  const etiket = busy
    ? 'Yayınlanıyor…'
    : post.boostedAt !== null
      ? 'Tekrar boostla'
      : 'Yayınla';

  async function yayinla(): Promise<void> {
    setBusy(true);
    setHata(null);
    try {
      await apiFetch<{ status: string; message: string }>(
        `/autoboost/posts/${post.id}/launch`,
        { method: 'POST', body: JSON.stringify({ clientId }) },
      );
      // LİSTE YENİLENİYOR: yayınlanan gönderinin düğmesi kapanmalı, yoksa
      // ikinci tık kısıt hatası üretir ve kullanıcı işlemin başarısız
      // olduğunu sanır.
      onYayinlandi();
    } catch (e) {
      setHata(
        e instanceof ApiRequestError ? e.message : 'Yayın başarısız oldu.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-[9.5rem] flex-col items-end gap-1 py-2">
      <button
        type="button"
        onClick={() => void yayinla()}
        disabled={kapali}
        className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-white transition disabled:opacity-40"
      >
        {etiket}
      </button>
      {/* SEBEP YAZILI — yalnızca ön ayar eksikse. Gönderi engelliyse sebep
          zaten satırın kendisinde duruyor ve iki kez yazmak gürültü. */}
      {onAyarYok && !engelli && (
        <span className="text-right text-[10px] leading-tight text-ink-muted">
          Ön ayar yok
        </span>
      )}
      {hata && (
        <span className="text-right text-[10px] leading-tight text-danger">{hata}</span>
      )}
    </div>
  );
}

/** Depo standardı rozet. */
function Chip({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${cls}`}
    >
      {children}
    </span>
  );
}
