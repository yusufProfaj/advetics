'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  MEDIA_TYPE_LABELS,
  type BoostablePostList,
  type BoostablePostRecord,
  type BoostSpendSummary,
  type GeoLocationOption,
  type SavedAudienceList,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { formatMoney, formatNumber } from '@/lib/format';

/**
 * ELLE BOOST — "gönderi seç → bütçe ve süre → nereye/kime → yayınla".
 *
 * DÖRT ADIM, TEK EKRAN, ARA ONAY YOK (§7.2). Kural yolundaki "aday → onay"
 * adımı burada yok çünkü kararı zaten kullanıcı veriyor; ikinci kez sormak
 * istenen akışı bozmak olurdu.
 *
 * EKRANIN TAŞIDIĞI TEK MESAJ: bu düğme para harcıyor ve ne kadar harcadığı
 * düğmenin ÜSTÜNDE yazıyor (K19). Sert bir tavan yok — karar kullanıcının —
 * ama tutarı görmeden verilen bir karar olmasın.
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

  if (!acik) {
    return (
      <button
        type="button"
        onClick={() => setAcik(true)}
        className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white"
      >
        Gönderi öne çıkar
      </button>
    );
  }

  return (
    <ManualBoostForm
      clientId={clientId}
      onClose={() => setAcik(false)}
      onDone={() => {
        setAcik(false);
        router.refresh();
      }}
    />
  );
}

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
  const [yasMin, setYasMin] = useState(18);
  const [yasMax, setYasMax] = useState(65);
  const [cinsiyet, setCinsiyet] = useState<'all' | 'male' | 'female'>('all');

  const [kitleler, setKitleler] = useState<SavedAudienceList | null>(null);
  const [kitle, setKitle] = useState<string>('');

  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<BoostablePostList>(`/boosts/posts?clientId=${clientId}`)
      .then(setPosts)
      .catch(() => setPosts({ items: [], total: 0, limit: 0 }));
    void apiFetch<BoostSpendSummary>(`/boosts/spend?clientId=${clientId}`)
      .then(setSpend)
      .catch(() => setSpend(null));
  }, [clientId]);

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
    void apiFetch<SavedAudienceList>(
      `/connections/targeting/saved-audiences?adAccountId=${secili.adAccountId}`,
    )
      .then(setKitleler)
      .catch(() => setKitleler({ items: [], total: 0 }));
  }, [secili?.adAccountId]);

  // Şehir araması: en az iki harf ve yazma durunca. Her tuşa istek atmak
  // Meta kotasını boşuna yakar.
  useEffect(() => {
    if (arama.trim().length < 2 || !secili?.adAccountId) {
      setSonuclar([]);
      return;
    }
    const t = setTimeout(() => {
      void apiFetch<GeoLocationOption[]>(
        `/connections/targeting/locations?adAccountId=${secili.adAccountId}&q=${encodeURIComponent(arama.trim())}`,
      )
        .then(setSonuclar)
        .catch(() => setSonuclar([]));
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
          targeting: kitleSecili
            ? { countries: ['TR'], cityKeys: [], ageMin: 18, ageMax: 65, genders: 'all', savedAudienceId: kitle }
            : {
                countries: ['TR'],
                cityKeys: sehirler.map((s) => s.key),
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
    <section className="space-y-4 rounded-xl border border-line bg-surface p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Gönderi öne çıkar</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Kural kurmadan, seçtiğin gönderiyi hemen yayına alır.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink"
        >
          Kapat
        </button>
      </header>

      {/* 1. adım — gönderi */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          1 · Gönderi
        </h3>
        {posts === null && <p className="text-xs text-ink-muted">Gönderiler yükleniyor…</p>}
        {posts && posts.items.length === 0 && (
          <p className="text-xs text-ink-muted">
            Bu müşteride henüz çekilmiş gönderi yok. Sayfa bir müşteriye atanmış ve
            senkronizasyonu açık olmalı.
          </p>
        )}
        <div className="space-y-1.5">
          {posts?.items.map((p) => (
            <PostRow
              key={p.id}
              post={p}
              secili={secili?.id === p.id}
              onSec={() => setSecili(p)}
            />
          ))}
        </div>
        {/* SESSİZ KESME YOK: kaç gösterildiği ve toplamın kaç olduğu yazılı. */}
        {posts && posts.total > posts.items.length && (
          <p className="text-xs text-ink-muted">
            {posts.items.length} / {posts.total} gönderi gösteriliyor — en yeniler.
          </p>
        )}
      </div>

      {secili && (
        <>
          {/* 2. adım — bütçe ve süre */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              2 · Bütçe ve süre
            </h3>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-ink-muted">
                Toplam bütçe (₺)
                <input
                  value={butce}
                  onChange={(e) => setButce(e.target.value)}
                  inputMode="decimal"
                  className="mt-1 block w-32 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink"
                />
              </label>
              <label className="text-xs text-ink-muted">
                Süre (gün)
                <input
                  value={gun}
                  onChange={(e) => setGun(Number(e.target.value) || 1)}
                  type="number"
                  min={1}
                  max={30}
                  className="mt-1 block w-24 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink"
                />
              </label>
              <p className="pb-1.5 text-xs text-ink-muted">
                Günde yaklaşık {formatMoney(gunlukMicros.toString(), 'TRY')} harcanır.
              </p>
            </div>
          </div>

          {/* 3. adım — kime */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              3 · Kime gösterilsin
            </h3>

            {kitleler && kitleler.items.length > 0 && (
              <label className="block text-xs text-ink-muted">
                Kayıtlı kitle
                <select
                  value={kitle}
                  onChange={(e) => setKitle(e.target.value)}
                  className="mt-1 block w-full max-w-sm rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink"
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
            {/* BOŞ AÇILIR LİSTE GÖSTERİLMİYOR — kullanıcı kendi kurulumunda bir
                şey eksik olduğunu sanmasın (K16). */}
            {kitleler && kitleler.items.length === 0 && (
              <p className="text-xs text-ink-muted">
                Ads Manager’da kayıtlı kitle bulunamadı — aşağıdan lokasyon ve yaş
                seçebilirsin.
              </p>
            )}

            {kitleSecili ? (
              <p className="rounded-lg bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
                Kayıtlı kitle seçildi. Lokasyon, yaş ve cinsiyet <b>kitlenin kendi
                tanımından</b> geliyor — burada ayrıca seçilmiyor, çünkü ikisini
                birleştirmek kitlenin tanımını sessizce değiştirirdi.
              </p>
            ) : (
              <ManualTargeting
                sehirler={sehirler}
                setSehirler={setSehirler}
                arama={arama}
                setArama={setArama}
                sonuclar={sonuclar}
                yasMin={yasMin}
                setYasMin={setYasMin}
                yasMax={yasMax}
                setYasMax={setYasMax}
                cinsiyet={cinsiyet}
                setCinsiyet={setCinsiyet}
              />
            )}
          </div>

          {/* 4. adım — yayınla */}
          <div className="space-y-2 border-t border-line pt-3">
            {secili.warning && (
              <p className="text-xs text-amber-700">{secili.warning}</p>
            )}
            {/* K19 — TUTAR GÖRÜLMEDEN KARAR VERİLMESİN. Ara ekran değil, aynı
                ekranın son satırı. */}
            {spend && <SpendLine spend={spend} eklenecek={toplamMicros} />}
            {hata && <p className="text-xs text-rose-700">{hata}</p>}
            <button
              type="button"
              onClick={yayinla}
              disabled={busy || toplamMicros === 0n}
              className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy
                ? 'Yayınlanıyor…'
                : `${formatMoney(toplamMicros.toString(), 'TRY')} harca ve yayınla`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/** Bir gönderi satırı — engelliyse SEBEBİYLE gösteriliyor, gizlenmiyor. */
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

  return (
    <div
      className={`rounded-lg border p-2.5 ${
        secili ? 'border-brand bg-surface-sunken' : 'border-line'
      } ${engelli ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-ink">
            {post.message ?? `${MEDIA_TYPE_LABELS[post.mediaType]} gönderisi`}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {post.socialProfileName} · {formatNumber(post.reach)} erişim ·{' '}
            {formatNumber(post.engagements)} etkileşim
            {post.engagementRate !== null && ` · %${post.engagementRate.toFixed(1)}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onSec}
          disabled={engelli}
          className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink disabled:opacity-50"
        >
          {secili ? 'Seçildi' : 'Seç'}
        </button>
      </div>
      {post.blockedReason && (
        <p className="mt-1.5 text-xs text-ink-muted">{post.blockedReason}</p>
      )}
    </div>
  );
}

function ManualTargeting(p: {
  sehirler: GeoLocationOption[];
  setSehirler: (v: GeoLocationOption[]) => void;
  arama: string;
  setArama: (v: string) => void;
  sonuclar: GeoLocationOption[];
  yasMin: number;
  setYasMin: (v: number) => void;
  yasMax: number;
  setYasMax: (v: number) => void;
  cinsiyet: 'all' | 'male' | 'female';
  setCinsiyet: (v: 'all' | 'male' | 'female') => void;
}) {
  return (
    <div className="space-y-2">
      <div>
        <label className="text-xs text-ink-muted">
          Lokasyon ara (boş bırakırsan Türkiye geneli)
          <input
            value={p.arama}
            onChange={(e) => p.setArama(e.target.value)}
            placeholder="İzmir, Ankara…"
            className="mt-1 block w-full max-w-sm rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink"
          />
        </label>
        {p.sonuclar.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
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
                className="rounded-full border border-line px-2 py-0.5 text-xs text-ink hover:bg-surface-sunken"
              >
                + {s.label}
              </button>
            ))}
          </div>
        )}
        {p.sehirler.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {p.sehirler.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => p.setSehirler(p.sehirler.filter((x) => x.key !== s.key))}
                className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-ink"
              >
                {s.label} ✕
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-ink-muted">
          Yaş
          <div className="mt-1 flex items-center gap-1">
            <input
              value={p.yasMin}
              onChange={(e) => p.setYasMin(Number(e.target.value) || 18)}
              type="number"
              min={18}
              max={65}
              className="w-16 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink"
            />
            <span className="text-ink-muted">–</span>
            <input
              value={p.yasMax}
              onChange={(e) => p.setYasMax(Number(e.target.value) || 65)}
              type="number"
              min={18}
              max={65}
              className="w-16 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink"
            />
          </div>
        </label>
        <label className="text-xs text-ink-muted">
          Cinsiyet
          <select
            value={p.cinsiyet}
            onChange={(e) => p.setCinsiyet(e.target.value as 'all' | 'male' | 'female')}
            className="mt-1 block rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink"
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
    <p className="text-xs text-ink-muted">
      Bu ay boost’a {formatMoney(spend.committedThisMonthMicros, spend.currency)} gitti;
      bununla birlikte {formatMoney(sonra.toString(), spend.currency)} olacak.{' '}
      {butce !== null ? (
        <>
          Aylık bütçe {formatMoney(butce.toString(), spend.currency)} — bunun{' '}
          %{Number((sonra * 100n) / (butce > 0n ? butce : 1n))}’i.
        </>
      ) : (
        <>Bu müşteride aylık bütçe tanımlı değil.</>
      )}
    </p>
  );
}
