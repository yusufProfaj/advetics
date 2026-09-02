'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MEDIA_TYPE_LABELS,
  type BoostablePostList,
  type BoostablePostRecord,
  type BoostCampaignList,
  type BoostSpendSummary,
  type GeoLocationOption,
  type SavedAudienceList,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { formatMoney, formatNumber } from '@/lib/format';

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
  const router = useRouter();
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
        <ManualBoostForm
          clientId={clientId}
          onClose={() => setAcik(false)}
          onDone={() => {
            setAcik(false);
            router.refresh();
          }}
        />
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
const LOKASYON_TURU: Record<string, string> = {
  country: 'Ülke',
  region: 'İl',
  city: 'Şehir',
};

/** Depo standardı form girdisi — `focus:border-brand` dahil. */
const input =
  'w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand';

/** Hazır bütçe/süre ön ayarları — ham sayı kutusundan önce gelir. */
const PRESETS = [
  { toplam: '300', gun: 5 },
  { toplam: '500', gun: 7 },
  { toplam: '1000', gun: 14 },
] as const;

function ManualBoostForm({
  clientId,
  onClose,
  onDone,
}: {
  clientId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [posts, setPosts] = useState<BoostablePostList | null>(null);
  const [spend, setSpend] = useState<BoostSpendSummary | null>(null);
  const [secili, setSecili] = useState<BoostablePostRecord | null>(null);

  const [butce, setButce] = useState('300');
  const [gun, setGun] = useState(5);

  const [sehirler, setSehirler] = useState<GeoLocationOption[]>([]);
  const [arama, setArama] = useState('');
  const [sonuclar, setSonuclar] = useState<GeoLocationOption[]>([]);
  /**
   * ARAMANIN DURUMU AYRI TUTULUYOR — dört hâl var ve dördü farklı iş.
   *
   * Önceden yalnızca `sonuclar` vardı ve hata `.catch(() => setSonuclar([]))`
   * ile yutuluyordu: "henüz aramadım", "arıyorum", "eşleşme yok" ve "çağrı
   * düştü" ekranda AYNI görünüyordu — boş bir alan. Konum seçenekleri
   * gelmediğinde sebebin ne olduğu 2026-08-17'de tam bu yüzden teşhis
   * edilemedi; kodda hiçbir iz yoktu çünkü hata hiç yazılmamıştı.
   */
  const [aramaDurum, setAramaDurum] = useState<'bos' | 'kisa' | 'araniyor' | 'bitti'>(
    'bos',
  );
  const [aramaHata, setAramaHata] = useState<string | null>(null);
  const [yasMin, setYasMin] = useState(18);
  const [yasMax, setYasMax] = useState(65);
  const [cinsiyet, setCinsiyet] = useState<'all' | 'male' | 'female'>('all');

  const [kitleler, setKitleler] = useState<SavedAudienceList | null>(null);
  const [kitleHata, setKitleHata] = useState<string | null>(null);
  const [kitle, setKitle] = useState<string>('');

  /**
   * SEÇİLEN KAMPANYA (K21). BOŞ DİZGE = yeni kampanya oluştur.
   *
   * Varsayılan bilinçli olarak boş: kullanıcı hiçbir şey seçmediğinde kendi
   * kampanyası açılıyor. Tersi varsayılan (en son kampanyayı seçili getirmek)
   * fark edilmeden PAYLAŞILAN bir kampanyaya eklemek olurdu.
   */
  const [kampanya, setKampanya] = useState('');
  const [kampanyalar, setKampanyalar] = useState<BoostCampaignList | null>(null);

  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  /*
   * GÖNDERİ YÜKLEMESİ AYRI BİR FONKSİYON: tek tıkla yayından sonra liste
   * YENİDEN çekilmek zorunda. Yenilenmezse yayınlanan gönderinin düğmesi
   * etkin kalır ve ikinci tık, veritabanı kısıtına takılan bir hata mesajı
   * üretir — kullanıcıya "çalışmadı" gibi görünen ama aslında çalışmış olan
   * bir işlem.
   */
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
    void apiFetch<BoostSpendSummary>(`/boosts/spend?clientId=${clientId}`)
      .then(setSpend)
      .catch(() => setSpend(null));
    /*
     * KAMPANYALAR EN BAŞTA ÇEKİLİYOR, gönderi seçimini beklemiyor: liste
     * müşteriye ait ve gönderiden bağımsız. Durumları Meta'dan okunduğu için
     * çağrı yavaş olabiliyor ve gönderi seçildikten sonra beklemek, kullanıcıyı
     * boş bir kutuya baktırmak olurdu.
     */
    void apiFetch<BoostCampaignList>(`/boosts/campaigns?clientId=${clientId}`)
      .then(setKampanyalar)
      .catch(() =>
        setKampanyalar({
          campaigns: [],
          emptyReason:
            'Kampanya listesi yüklenemedi. Yeni kampanya oluşturarak devam edebilirsin.',
        }),
      );
  }, [clientId, gonderileriYukle]);

  /**
   * KİTLELER GÖNDERİ SEÇİLİNCE ÇEKİLİYOR — hangi reklam hesabı olduğu ancak
   * o zaman belli. Kitle hesap başına kurulu ve yanlış hesabın kitlelerini
   * göstermek, seçilemeyen bir liste göstermek olurdu.
   */
  useEffect(() => {
    if (!secili?.adAccountId) {
      setKitleler(null);
      return;
    }
    setKitleHata(null);
    void apiFetch<SavedAudienceList>(
      `/connections/targeting/saved-audiences?adAccountId=${secili.adAccountId}`,
    )
      .then((k) => {
        setKitleler(k);
        setKitleHata(null);
      })
      .catch((err: unknown) => {
        /*
         * HATA YUTULMUYOR — BURASI CLAUDE.md'NİN AÇIKÇA YASAKLADIĞI DESENDİ.
         *
         * Eski hâli `.catch(() => setKitleler({ items: [], total: 0 }))` idi
         * ve "çağrı düştü" ile "kitle yok"u AYNI ekrana çeviriyordu. Üretimde
         * bunun bedeli somut oldu: uç `approximate_count` alanı yüzünden 502
         * dönüyordu, panel ise "Ads Manager'da kayıtlı kitle bulunamadı"
         * yazıyordu — kullanıcı KENDİ Meta kurulumunu eksik sandı.
         *
         * Hemen yanındaki lokasyon araması bunu zaten doğru yapıyordu;
         * iki bitişik çağrı, iki farklı standart.
         */
        setKitleler(null);
        setKitleHata(
          err instanceof ApiRequestError
            ? err.message
            : 'Kayıtlı kitleler alınamadı.',
        );
      });
  }, [secili?.adAccountId]);

  // Şehir araması: en az iki harf ve yazma durunca. Her tuşa istek atmak
  // Meta kotasını boşuna yakar.
  useEffect(() => {
    setAramaHata(null);
    if (!secili?.adAccountId) {
      // Hesap yoksa arama HİÇ atılmıyor ve kullanıcı yazdıkça hiçbir şey
      // olmuyor. Gönderi seçiliyse engel listesinde yakalanmış olurdu, ama
      // kalan tek ihtimal de sessiz kalmasın.
      setSonuclar([]);
      setAramaDurum('bos');
      return;
    }
    if (arama.trim().length < 2) {
      setSonuclar([]);
      setAramaDurum(arama.trim().length === 0 ? 'bos' : 'kisa');
      return;
    }
    setAramaDurum('araniyor');
    const t = setTimeout(() => {
      void apiFetch<GeoLocationOption[]>(
        `/connections/targeting/locations?adAccountId=${secili.adAccountId}&q=${encodeURIComponent(arama.trim())}`,
      )
        .then((r) => {
          setSonuclar(r);
          setAramaDurum('bitti');
        })
        .catch((err: unknown) => {
          /*
           * HATA METNİ OLDUĞU GİBİ GÖSTERİLİYOR. Meta'nın mesajı burada
           * kullanıcıya da bize de tek ipucu: "izin yok", "kota doldu" ve
           * "hesap bulunamadı" üç ayrı iş ve üçü de boş liste olarak
           * görünüyordu.
           */
          setSonuclar([]);
          setAramaDurum('bitti');
          setAramaHata(
            err instanceof ApiRequestError
              ? err.message
              : 'Lokasyon araması başarısız oldu (ağ hatası).',
          );
        });
    }, 350);
    return () => clearTimeout(t);
  }, [arama, secili?.adAccountId]);

  const toplamMicros = useMemo(() => {
    const n = Number(butce.replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? BigInt(Math.round(n * 1_000_000)) : 0n;
  }, [butce]);

  /**
   * GÜNLÜK KARŞILIĞI DA YAZILIYOR — sürpriz olmasın diye (K18).
   *
   * Meta'ya giden sayı toplam; ama kullanıcı "günde ne kadar" sorusunu da
   * soruyor ve cevabı ekranda görmezse kendi hesaplamak zorunda kalıyor.
   */
  const gunlukMicros = gun > 0 ? toplamMicros / BigInt(gun) : 0n;

  const kitleSecili = kitle !== '';
  const engelliSayi = posts?.items.filter((p) => p.blockedReason !== null).length ?? 0;

  async function yayinla(): Promise<void> {
    if (!secili) return;
    setBusy(true);
    setHata(null);
    try {
      await apiFetch('/boosts/manual', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          organicPostId: secili.id,
          totalBudget: butce.replace(',', '.'),
          durationDays: gun,
          /*
           * BOŞ DİZGE GÖNDERİLMİYOR, alan HİÇ gönderilmiyor. Şema `""`
           * kabul etmiyor ve etmemesi doğru: boş dizge bir kampanya kimliği
           * değil. Gönderilse Meta'ya boş kimlikle gidilir ve hata
           * "kampanya bulunamadı" olarak döner — sebebi hiç anlaşılmaz.
           */
          ...(kampanya ? { targetCampaignExternalId: kampanya } : {}),
          targeting: kitleSecili
            ? {
                locations: [],
                ageMin: 18,
                ageMax: 65,
                genders: 'all',
                savedAudienceId: kitle,
              }
            : {
                /**
                 * TÜR DE GÖNDERİLİYOR. İlk sürümde yalnızca anahtar
                 * gönderiliyordu ve sunucu hepsini şehir sanıyordu: "Türkiye"
                 * seçildiğinde Meta "integer bekleniyor, TR geldi" ile
                 * reddediyordu, il seçildiğinde "şehir hedeflemesi
                 * desteklenmiyor" diyordu.
                 */
                locations: sehirler.map((s) => ({
                  key: s.key,
                  type: s.type === 'country' || s.type === 'region' ? s.type : 'city',
                })),
                ageMin: yasMin,
                ageMax: yasMax,
                genders: cinsiyet,
              },
        }),
      });
      onDone();
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : 'Boost yayınlanamadı.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="w-full min-w-0 space-y-4 rounded-xl border border-line bg-surface p-4">
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">Gönderi öne çıkar</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Kural kurmadan, seçtiğin gönderiyi hemen yayına alır.
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

      <Blok no={1} baslik="Gönderi" alt="Öne çıkarmak istediğin gönderiyi seç.">
        {posts === null && <p className="text-xs text-ink-muted">Gönderiler yükleniyor…</p>}

        {/*
          BOŞ DURUM KESİKLİ ÇERÇEVEYLE. Depoda kesikli çerçeve "burada içerik
          yok, sen ekleyeceksin" demek ve `emptyReason` tam olarak yapılacak
          işi söylüyor: sayfa atanmamış / izleme kapalı / süpürme koşmamış /
          son senkronizasyon hata verdi. Dördü de tek satırlık bir gri kutuya
          sığmıyordu.
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
             Ön ayar sayfa bazında da tanımlanabildiği için "hiçbiri hazır
             değil" ile "bazıları hazır" farklı iki durum; bant yalnızca
             HİÇBİRİ hazır değilken çıkıyor, karışık durumda satırın kendi
             notu görünüyor.
          */
          <div className="mb-3 rounded-xl border border-warn/40 bg-warn/5 px-3 py-2.5">
            <p className="text-xs font-semibold text-ink">
              Tek tıkla yayın için Bilgi Bankası boş
            </p>
            <p className="mt-0.5 text-[11px] text-ink-muted">
              Bu müşteri için Meta ön ayarı tanımlı değil ya da kapalı. Bütçeyi,
              süreyi ve hedeflemeyi bir kez{' '}
              <Link
                href="/kutuphane/bilgi-bankasi"
                className="font-semibold text-brand underline"
              >
                Kütüphane → Bilgi Bankası
              </Link>{' '}
              üzerinden tanımladıktan sonra gönderilerin yanındaki “Yayınla”
              düğmesi çalışır. Aşağıdaki form ön ayarsız da kullanılabilir.
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
                  {/*
                    SATIR VE DÜĞME KARDEŞ, İÇ İÇE DEĞİL. `PostRow` bir
                    <button> ve içine ikinci bir <button> koymak geçersiz
                    HTML — tarayıcı iç düğmeyi dışarı taşıyor ve tıklama
                    hedefleri karışıyor.
                  */}
                  <div className="min-w-0 flex-1">
                    <PostRow
                      post={p}
                      secili={secili?.id === p.id}
                      onSec={() => setSecili(p)}
                    />
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
              kaçının kullanılamadığı her zaman yazılı — koşullu yazmak,
              kullanıcının listeyi tam sanmasına izin vermek olurdu.
            */}
            <p className="text-[11px] text-ink-muted">
              {posts.items.length} gönderi gösteriliyor
              {posts.total > posts.items.length && ` · toplam ${posts.total}, en yeniler`}
              {engelliSayi > 0 && ` · ${engelliSayi} tanesi öne çıkarılamıyor (sebebi satırda)`}
            </p>
          </>
        )}
      </Blok>

      {secili && (
        <>
          <Blok
            no={2}
            baslik="Kampanya"
            alt="Yeni kampanya açabilir ya da var olanın altına ekleyebilirsin."
          >
            <div className="space-y-1.5">
              <KampanyaSecim
                secili={kampanya === ''}
                onSec={() => setKampanya('')}
                baslik="Yeni kampanya oluştur"
                alt="Bu gönderi için ayrı bir kampanya açılır."
              />

              {kampanyalar?.campaigns.map((k) => (
                <KampanyaSecim
                  key={k.externalId}
                  secili={kampanya === k.externalId}
                  onSec={() => setKampanya(k.externalId)}
                  baslik={k.name}
                  alt={
                    `${k.postCount} gönderi · son kullanım ` +
                    new Date(k.lastUsedAt).toLocaleDateString('tr-TR')
                  }
                  /*
                   * SEÇİLEMEZ SEBEBİ SATIRDA. Düğmeyi kapatıp sebebini
                   * söylememek, kullanıcıya "çalışmıyor" göstermek olurdu —
                   * bu ekranda daha önce tam olarak bu hataya düşüldü.
                   */
                  kapali={!k.selectable}
                  kapaliSebep={
                    k.status === null
                      ? 'Durumu okunamadı — Ads Manager’dan kontrol et'
                      : `Yayında değil (${k.status}) — altına eklenen reklam harcamaz`
                  }
                />
              ))}

              {kampanyalar === null && (
                <p className="text-[11px] text-ink-muted">Kampanyalar yükleniyor…</p>
              )}

              {/*
                SAYAÇ VE SEBEP KOŞULSUZ. Liste boşken de, doluyken de kaç
                kampanya bulunduğu ve neden seçilemediği yazılı.
              */}
              {kampanyalar && (
                <p className="pt-1 text-[11px] text-ink-muted">
                  {kampanyalar.campaigns.length > 0 &&
                    `${kampanyalar.campaigns.length} kampanya bulundu · ` +
                      `${kampanyalar.campaigns.filter((k) => k.selectable).length} tanesi seçilebilir`}
                  {kampanyalar.emptyReason && (
                    <span className="block pt-1">{kampanyalar.emptyReason}</span>
                  )}
                </p>
              )}

              {/*
                AYNI KAMPANYAYA EKLEMENİN NE OLMADIĞI da söyleniyor. Kullanıcı
                "aynı kampanya = birleşik performans" bekleyebilir; Meta'nın
                öğrenme evresi ad set başına işliyor ve beklentiyi düzeltmemek,
                sonradan açıklanamayan bir sonuç bırakırdı.
              */}
              {kampanya !== '' && (
                <p className="rounded-lg border border-line bg-surface-sunken px-2.5 py-2 text-[11px] text-ink-muted">
                  Bu gönderi seçilen kampanyanın altına <strong>kendi reklam seti ve
                  reklamıyla</strong> eklenecek. Bütçesi ayrı — kampanyadaki diğer
                  gönderilerin harcamasına dokunmuyor. Performans da ayrı hesaplanır;
                  aynı kampanyada olmak sonuçları birleştirmiyor.
                </p>
              )}
            </div>
          </Blok>

          <Blok
            no={3}
            baslik="Bütçe ve süre"
            alt="Yazdığın toplam tutar Meta'ya olduğu gibi gidiyor."
          >
            <div className="grid gap-2 sm:grid-cols-3">
              {PRESETS.map((p) => {
                const aktif = butce === p.toplam && gun === p.gun;
                return (
                  <button
                    key={p.toplam}
                    type="button"
                    aria-pressed={aktif}
                    onClick={() => {
                      setButce(p.toplam);
                      setGun(p.gun);
                    }}
                    className={`rounded-xl border p-3 text-left transition ${
                      aktif ? 'border-brand bg-brand-soft' : 'border-line hover:bg-surface-sunken'
                    }`}
                  >
                    <span className="block text-sm font-semibold text-ink">{p.toplam} ₺</span>
                    <span className="block text-[11px] text-ink-muted">{p.gun} gün</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                  Toplam bütçe (₺)
                </span>
                <input
                  value={butce}
                  onChange={(e) => setButce(e.target.value)}
                  inputMode="decimal"
                  className={`${input} w-32`}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                  Süre (gün)
                </span>
                <input
                  value={gun}
                  onChange={(e) => setGun(Number(e.target.value) || 1)}
                  type="number"
                  min={1}
                  max={30}
                  className={`${input} w-24`}
                />
              </label>
              <p className="pb-1.5 text-[11px] text-ink-muted">
                Günde yaklaşık {formatMoney(gunlukMicros.toString(), 'TRY')}.
                <span className="block">
                  Meta'ya toplam tutar gidiyor; günlük sayı yalnızca bilgi.
                </span>
              </p>
            </div>
          </Blok>

          <Blok no={4} baslik="Kime gösterilsin" alt="Boş bırakırsan Türkiye geneli.">
            {kitleler && kitleler.items.length > 0 && (
              <label className="block max-w-sm">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                  Kayıtlı kitle
                </span>
                <select
                  value={kitle}
                  onChange={(e) => setKitle(e.target.value)}
                  className={input}
                >
                  <option value="">Kullanma — aşağıdan kendim seçeyim</option>
                  {kitleler.items.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                      {k.approximateCount !== null
                        ? ` · ~${formatNumber(k.approximateCount)} kişi`
                        : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {/*
              ÜÇ HÂL AYRI YAZILIYOR: çağrı düştü · kitle yok · kitleler geldi.
              Eskiden ilk ikisi aynı cümleye çıkıyordu ve gerçek hata
              yalnızca sunucu logunda kalıyordu.
            */}
            {kitleHata !== null && (
              <p className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-[11px] text-danger">
                Kayıtlı kitleler alınamadı — {kitleHata}
                <br />
                Aşağıdan lokasyon ve yaş seçerek devam edebilirsin.
              </p>
            )}
            {kitleHata === null && kitleler && kitleler.items.length === 0 && (
              <p className="text-[11px] text-ink-muted">
                Ads Manager’da kayıtlı kitle bulunamadı — aşağıdan lokasyon ve yaş
                seçebilirsin.
              </p>
            )}

            {kitleSecili ? (
              <p className="rounded-lg border border-line bg-surface-muted p-3 text-xs text-ink-muted">
                Kayıtlı kitle seçildi. Lokasyon, yaş ve cinsiyet{' '}
                <b className="text-ink">kitlenin kendi tanımından</b> geliyor — burada
                ayrıca seçilmiyor, çünkü ikisini birleştirmek kitlenin tanımını sessizce
                değiştirirdi.
              </p>
            ) : (
              <ManualTargeting
                sehirler={sehirler}
                setSehirler={setSehirler}
                arama={arama}
                setArama={setArama}
                sonuclar={sonuclar}
                aramaDurum={aramaDurum}
                aramaHata={aramaHata}
                yasMin={yasMin}
                setYasMin={setYasMin}
                yasMax={yasMax}
                setYasMax={setYasMax}
                cinsiyet={cinsiyet}
                setCinsiyet={setCinsiyet}
              />
            )}
          </Blok>

          <Blok no={5} baslik="Yayınla" alt="Ara onay yok — bu düğme parayı harcıyor.">
            {secili.warning && (
              <p className="rounded-lg border border-line bg-surface-muted p-3 text-xs text-warn">
                {secili.warning}
              </p>
            )}
            {/*
              K19 — TUTAR GÖRÜLMEDEN KARAR VERİLMESİN. Ara ekran değil, aynı
              ekranın son satırı; ama çıplak gri metin değil, kendi yüzeyinde:
              para taahhüdü olan tek satır kart zemininden ayrılıyor.
            */}
            {spend && <SpendLine spend={spend} eklenecek={toplamMicros} />}
            {hata && (
              <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
                {hata}
              </p>
            )}
            <button
              type="button"
              onClick={yayinla}
              disabled={busy || toplamMicros === 0n}
              className="rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy
                ? 'Yayınlanıyor…'
                : `${formatMoney(toplamMicros.toString(), 'TRY')} harca ve yayınla`}
            </button>
          </Blok>
        </>
      )}
    </section>
  );
}

/**
 * Numaralı adım — hızlı reklam sihirbazındaki `Blok` deseninin aynısı.
 *
 * Dört adımlı bir akışın adımları numara rozetiyle gösteriliyor; boost ekranı
 * da aynı akış olduğu için aynı görünmeli.
 */
function Blok({
  no,
  baslik,
  alt,
  children,
}: {
  no: number;
  baslik: string;
  alt?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 border-t border-line pt-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">
          {no}
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">{baslik}</h3>
          {alt && <p className="text-xs text-ink-muted">{alt}</p>}
        </div>
      </div>
      <div className="mt-2 min-w-0 space-y-2 sm:pl-7">{children}</div>
    </div>
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
function PostRow({
  post,
  secili,
  onSec,
}: {
  post: BoostablePostRecord;
  secili: boolean;
  onSec: () => void;
}) {
  const engelli = post.blockedReason !== null;
  const [gorselDustu, setGorselDustu] = useState(false);
  const gorselVar = post.thumbnailUrl !== null && !gorselDustu;

  return (
    <button
      type="button"
      onClick={onSec}
      disabled={engelli}
      aria-pressed={secili}
      className={`flex w-full min-w-0 items-start gap-3 px-3 py-2.5 text-left transition ${
        secili ? 'bg-brand-soft' : 'hover:bg-surface-sunken'
      } ${engelli ? 'cursor-not-allowed opacity-60 hover:bg-transparent' : ''}`}
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

      {secili && (
        <Chip cls="bg-emerald-50 text-emerald-700 ring-emerald-200">Seçildi</Chip>
      )}
    </button>
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
/**
 * Kampanya seçim satırı (K21).
 *
 * BÜTÜN SATIR TIKLANABİLİR, küçük bir radyo düğmesi değil — `PostRow` ile aynı
 * gerekçe: 16 pikselkare bir hedefe nişan almak dokunmatik ekranda ve fareyle
 * gereksiz zor.
 *
 * KAPALI SATIR GİZLENMİYOR, SEBEBİ YAZILIYOR. Seçilemeyen kampanyayı listeden
 * çıkarmak "kampanyam nerede?" sorusunu doğururdu; bırakıp sebebini söylemek
 * yapılacak işi de söylüyor (Ads Manager'da yayına al).
 */
function KampanyaSecim({
  secili,
  onSec,
  baslik,
  alt,
  kapali = false,
  kapaliSebep,
}: {
  secili: boolean;
  onSec: () => void;
  baslik: string;
  alt: string;
  kapali?: boolean;
  kapaliSebep?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSec}
      disabled={kapali}
      className={`flex w-full min-w-0 items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition ${
        kapali
          ? 'cursor-not-allowed border-line bg-surface-sunken opacity-60'
          : secili
            ? 'border-brand bg-brand-soft'
            : 'border-line hover:bg-surface-sunken'
      }`}
    >
      <span
        aria-hidden
        className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border ${
          secili ? 'border-brand' : 'border-line'
        }`}
      >
        {secili && <span className="size-2 rounded-full bg-brand" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-ink">{baslik}</span>
        <span className="block text-[11px] text-ink-muted">{alt}</span>
        {kapali && kapaliSebep && (
          <span className="block pt-0.5 text-[11px] text-danger">{kapaliSebep}</span>
        )}
      </span>
    </button>
  );
}

function Chip({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${cls}`}
    >
      {children}
    </span>
  );
}

function ManualTargeting(p: {
  sehirler: GeoLocationOption[];
  setSehirler: (v: GeoLocationOption[]) => void;
  arama: string;
  setArama: (v: string) => void;
  sonuclar: GeoLocationOption[];
  aramaDurum: 'bos' | 'kisa' | 'araniyor' | 'bitti';
  aramaHata: string | null;
  yasMin: number;
  setYasMin: (v: number) => void;
  yasMax: number;
  setYasMax: (v: number) => void;
  cinsiyet: 'all' | 'male' | 'female';
  setCinsiyet: (v: 'all' | 'male' | 'female') => void;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <div className="min-w-0">
        <label className="block max-w-sm">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            Lokasyon ara
          </span>
          <input
            value={p.arama}
            onChange={(e) => p.setArama(e.target.value)}
            placeholder="İzmir, Ankara…"
            className={input}
          />
        </label>

        {/*
          DÖRT HÂL AYRI YAZILIYOR. Boş bir alan bırakmak kullanıcıya
          "çalışmıyor" göstermek ve sebebini saklamak demek — bu ekranda daha
          önce tam olarak bu oldu.
        */}
        {p.aramaDurum === 'kisa' && (
          <p className="mt-1.5 text-[11px] text-ink-muted">
            Aramak için en az iki harf yaz.
          </p>
        )}
        {p.aramaDurum === 'araniyor' && (
          <p className="mt-1.5 text-[11px] text-ink-muted">Lokasyon aranıyor…</p>
        )}
        {p.aramaHata && (
          <p className="mt-1.5 text-[11px] text-danger">
            {p.aramaHata} Lokasyon seçmeden devam edersen boost{' '}
            <strong>Türkiye geneline</strong> gider.
          </p>
        )}
        {p.aramaDurum === 'bitti' && !p.aramaHata && p.sonuclar.length === 0 && (
          <p className="mt-1.5 text-[11px] text-ink-muted">
            “{p.arama.trim()}” için Meta’da eşleşme bulunamadı.
          </p>
        )}

        {p.sonuclar.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {p.sonuclar.slice(0, 8).map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => {
                  if (!p.sehirler.some((x) => x.key === s.key)) {
                    p.setSehirler([...p.sehirler, s]);
                  }
                  p.setArama('');
                }}
                className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-sunken"
              >
                + {LOKASYON_TURU[s.type] ?? s.type} · {s.label}
              </button>
            ))}
          </div>
        )}

        {p.sehirler.length > 0 && (
          <>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {p.sehirler.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => p.setSehirler(p.sehirler.filter((x) => x.key !== s.key))}
                  title="Kaldır"
                  className="rounded-lg border border-brand bg-brand-soft px-2.5 py-1 text-xs font-medium text-ink"
                >
                  {LOKASYON_TURU[s.type] ?? s.type} · {s.label} ✕
                </button>
              ))}
            </div>
            {/*
              ÜLKE GENELİNİN KAPANDIĞI YAZILIYOR. Meta lokasyon kovalarını
              BİRLEŞİM olarak uyguluyor: "Türkiye + İzmir" demek Türkiye geneli
              demek. Bu yüzden lokasyon seçilince ülke geneli gönderilmiyor —
              ve kullanıcı bunu ekranda görmeli, yoksa "hem Türkiye hem İzmir"
              sandığı bir daraltma yapıyor.
            */}
            <p className="mt-1 text-[11px] text-ink-muted">
              Yalnızca bu {p.sehirler.length} lokasyona gösterilecek — ülke geneli
              kapanıyor.
            </p>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            Yaş
          </span>
          <span className="flex items-center gap-1">
            <input
              value={p.yasMin}
              onChange={(e) => p.setYasMin(Number(e.target.value) || 18)}
              type="number"
              min={18}
              max={65}
              className={`${input} w-20`}
            />
            <span className="text-ink-muted">–</span>
            <input
              value={p.yasMax}
              onChange={(e) => p.setYasMax(Number(e.target.value) || 65)}
              type="number"
              min={18}
              max={65}
              className={`${input} w-20`}
            />
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            Cinsiyet
          </span>
          <select
            value={p.cinsiyet}
            onChange={(e) => p.setCinsiyet(e.target.value as 'all' | 'male' | 'female')}
            className={input}
          >
            <option value="all">Hepsi</option>
            <option value="male">Erkek</option>
            <option value="female">Kadın</option>
          </select>
        </label>
      </div>
    </div>
  );
}

/**
 * K19 — bu ay boost'a ne gitti.
 *
 * SERT TAVAN YOK; bu satır engellemiyor, gösteriyor. Aylık bütçe tanımlı
 * değilse oran YAZILMIYOR: tanımsız bir bütçeye göre yüzde hesaplamak
 * uydurma bir sayı üretmek olurdu.
 */
function SpendLine({
  spend,
  eklenecek,
}: {
  spend: BoostSpendSummary;
  eklenecek: bigint;
}) {
  const sonra = BigInt(spend.committedThisMonthMicros) + eklenecek;
  const butce = spend.monthlyBudgetMicros ? BigInt(spend.monthlyBudgetMicros) : null;

  return (
    <div className="rounded-lg border border-line bg-surface-muted p-3">
      <p className="text-xs text-ink">
        Bu boost’la birlikte bu ay boost’a giden toplam{' '}
        <strong>{formatMoney(sonra.toString(), spend.currency)}</strong> olacak.
      </p>
      <p className="mt-0.5 text-[11px] text-ink-muted">
        Şu ana kadar {formatMoney(spend.committedThisMonthMicros, spend.currency)}.{' '}
        {butce !== null ? (
          <>
            Aylık bütçe {formatMoney(butce.toString(), spend.currency)} — bunun %
            {Number((sonra * 100n) / (butce > 0n ? butce : 1n))}’i.
          </>
        ) : (
          <>Bu müşteride aylık bütçe tanımlı değil.</>
        )}
      </p>
    </div>
  );
}
