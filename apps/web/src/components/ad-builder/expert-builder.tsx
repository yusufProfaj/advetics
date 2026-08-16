'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  advancedDefaultsFor,
  type AdvancedSettings,
  type CreativeRecord,
  type DraftCampaignRecord,
  type LeadFormRecord,
  type PublishCheck,
} from '@advetics/shared';
import { API_URL, ApiRequestError, apiFetch } from '@/lib/api';
import { AdvancedPanel } from './advanced-panel';

/**
 * Uzman yüzeyi — kararlar KULLANICININ.
 *
 * BASİT YÜZEYİN AYNADAKİ GÖRÜNTÜSÜ DEĞİL, BAŞKA BİR İŞ. Orada Meta'nın
 * sorduğu her soruya biz cevap veriyoruz; burada kullanıcı cevaplıyor.
 *
 * META TERMİNOLOJİSİ AYNEN GEÇİYOR. Panelin geri kalanında "CENTRAL" gibi
 * mimari terimler yasak ama burada `OUTCOME_LEADS` ve `LEAD_GENERATION`
 * görünüyor — çünkü uzman bu kampanyayı Ads Manager'daki karşılığıyla
 * eşleştirmek zorunda ve bizim uydurduğumuz bir isim o eşleştirmeyi
 * imkânsız kılardı.
 *
 * `AdvancedPanel` YENİDEN KULLANILIYOR. Mevcut reklam oluşturucunun gelişmiş
 * modu zaten bu alanları render ediyor ve `objective-matrix` ile aynı
 * daraltmayı uyguluyor. İkinci bir panel yazmak, uyumsuz kombinasyonların
 * bir ekranda engellenip diğerinde geçmesi demek olurdu.
 */
export function ExpertAdBuilder({
  clientId,
  accounts,
  pages,
  creatives,
  forms,
}: {
  clientId: string;
  accounts: Array<{ id: string; name: string; currency: string }>;
  pages: Array<{ id: string; name: string }>;
  creatives: CreativeRecord[];
  forms: LeadFormRecord[];
}) {
  const router = useRouter();

  const [name, setName] = useState('');
  const [adAccountId, setAdAccountId] = useState(accounts[0]?.id ?? '');
  const [pageId, setPageId] = useState(pages[0]?.id ?? '');
  const [budget, setBudget] = useState('500');
  const [creativeIds, setCreativeIds] = useState<string[]>([]);
  const [leadFormId, setLeadFormId] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');

  /**
   * Ayarlar HIZLI MODUN KARARLARIYLA DOLU BAŞLIYOR.
   *
   * Boş bir ekran uzmanı sıfırdan kurmaya zorlar ve daha önemlisi: bizim
   * onun adına ne seçtiğimizi hiç göstermez. Dolu başlamak hem başlangıç
   * noktası veriyor hem de "biz bunu seçerdik" diyor.
   */
  const [advanced, setAdvanced] = useState<AdvancedSettings>(() =>
    advancedDefaultsFor('whatsapp'),
  );

  const [campaign, setCampaign] = useState<DraftCampaignRecord | null>(null);
  const [check, setCheck] = useState<PublishCheck | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currency = accounts.find((a) => a.id === adAccountId)?.currency ?? 'TRY';

  const eksikler = useMemo(() => {
    const list: string[] = [];
    if (!name.trim()) list.push('Kampanyaya bir ad ver.');
    if (creativeIds.length === 0) list.push('En az bir kreatif seç.');
    if (!pageId) list.push('Facebook sayfası seç.');
    if (advanced.budgetMode === 'lifetime' && !advanced.endAt) {
      list.push('Toplam bütçede bitiş tarihi zorunlu.');
    }
    return list;
  }, [name, creativeIds, pageId, advanced]);

  async function olustur(): Promise<void> {
    setBusy('create');
    setError(null);
    try {
      const created = await apiFetch<DraftCampaignRecord>('/draft-campaigns/expert', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          name: name.trim(),
          platform: 'meta',
          adAccountId,
          socialProfileId: pageId,
          leadFormId: leadFormId ?? undefined,
          budget,
          creativeIds,
          advanced,
          linkUrl: linkUrl.trim() || undefined,
          whatsappNumber: whatsappNumber.trim() || undefined,
        }),
      });
      setCampaign(created);
      setCheck(await apiFetch<PublishCheck>(`/draft-campaigns/${created.id}/check`));
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Kampanya oluşturulamadı');
    } finally {
      setBusy(null);
    }
  }

  async function yayinla(): Promise<void> {
    if (!campaign) return;
    setBusy('publish');
    setError(null);
    try {
      const sonuc = await apiFetch<DraftCampaignRecord>(
        `/draft-campaigns/${campaign.id}/publish`,
        { method: 'POST' },
      );
      setCampaign(sonuc);
      setCheck(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Kampanya yayınlanamadı');
    } finally {
      setBusy(null);
    }
  }

  if (campaign?.status === 'published') {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <h3 className="text-sm font-semibold text-emerald-900">Kampanya yayında</h3>
          <p className="mt-1 text-xs text-emerald-800">
            Meta kimliği: <code>{campaign.externalCampaignId}</code> · ad set:{' '}
            <code>{campaign.adGroups[0]?.externalAdSetId}</code>
          </p>
        </div>

        {/* VARYANT BAŞINA DURUM. Biri düşmüş olabilir ve kampanya yine
            yayında — o varyantın sebebini burada görmek gerekiyor. */}
        <ul className="space-y-1">
          {campaign.adGroups[0]?.ads.map((ad, i) => (
            <li
              key={ad.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-sunken px-3 py-2"
            >
              <span className="text-xs text-ink">
                {i + 1}. {ad.creativeName}
              </span>
              {ad.externalAdId ? (
                <code className="text-[11px] text-emerald-700">{ad.externalAdId}</code>
              ) : (
                <span className="text-[11px] text-rose-700">{ad.error ?? 'oluşturulamadı'}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">Kampanya</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Alan label="Kampanya adı">
            <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
          </Alan>
          <Alan label={`Bütçe (${currency})`} ipucu={butceIpucu(advanced.budgetMode)}>
            <input
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              inputMode="decimal"
              className={input}
            />
          </Alan>
          <Alan label="Reklam hesabı">
            <select
              value={adAccountId}
              onChange={(e) => setAdAccountId(e.target.value)}
              className={input}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Alan>
          <Alan label="Sayfa">
            <select value={pageId} onChange={(e) => setPageId(e.target.value)} className={input}>
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Alan>
          <Alan label="Hedef URL" ipucu="Trafik ve dönüşüm hedeflerinde zorunlu.">
            <input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://siteniz.com"
              className={input}
            />
          </Alan>
          <Alan label="WhatsApp numarası" ipucu="Boşsa sayfaya bağlı numara kullanılır.">
            <input
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              placeholder="905551112233"
              className={input}
            />
          </Alan>
        </div>
      </section>

      {/* Kreatifler — ÇOKLU, bu yüzeyin varlık sebeplerinden biri */}
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">
          Kreatifler
          <span className="ml-1.5 font-normal text-ink-muted">
            aynı reklam grubunda {creativeIds.length} varyant
          </span>
        </h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          Seçtiğin sıra platformdaki sıra. İlki kampanyayı ve reklam grubunu kuruyor, kalanlar
          aynı gruba ekleniyor.
        </p>

        {creatives.length === 0 ? (
          <p className="mt-3 rounded-lg bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
            Bu müşteride henüz kreatif yok. <strong>Hızlı Reklam</strong> ekranından bir tane
            oluşturduğunda burada da görünür.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-4">
            {creatives.map((c) => {
              const sira = creativeIds.indexOf(c.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setCreativeIds((prev) =>
                        prev.includes(c.id)
                          ? prev.filter((x) => x !== c.id)
                          : [...prev, c.id],
                      )
                    }
                    className={`block w-full overflow-hidden rounded-lg border-2 text-left transition ${
                      sira >= 0 ? 'border-brand' : 'border-line hover:bg-surface-sunken'
                    }`}
                  >
                    <div className="aspect-square w-full bg-surface-sunken">
                      {c.assets[0] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`${API_URL}${c.assets[0].previewUrl}`}
                          alt=""
                          className="h-full w-full object-contain"
                          loading="lazy"
                        />
                      )}
                    </div>
                    <span className="block truncate px-1.5 py-1 text-[11px] text-ink">
                      {sira >= 0 && <strong>{sira + 1}. </strong>}
                      {c.name}
                    </span>
                    <span className="block truncate px-1.5 pb-1 text-[10px] text-ink-muted">
                      {c.assets.length} görsel · {c.texts.headlines.length} başlık
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Meta ayarları — MEVCUT PANEL */}
      <AdvancedPanel
        value={advanced}
        onChange={setAdvanced}
        currency={currency}
        forms={forms}
        leadFormId={leadFormId}
        onLeadFormChange={setLeadFormId}
      />

      {!campaign ? (
        <div className="rounded-xl border border-line bg-surface p-4">
          {eksikler.length > 0 ? (
            <ul className="space-y-0.5">
              {eksikler.map((e) => (
                <li key={e} className="text-xs text-ink-muted">
                  · {e}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-emerald-700">Ayarlar hazır.</p>
          )}
          <button
            type="button"
            onClick={olustur}
            disabled={eksikler.length > 0 || busy !== null}
            className="mt-3 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy === 'create' ? 'Hazırlanıyor…' : 'Kampanyayı hazırla'}
          </button>
        </div>
      ) : (
        <section className="rounded-xl border border-line bg-surface p-4">
          {check && (
            <>
              <p className="rounded-lg bg-surface-sunken px-3 py-2 text-sm font-medium text-ink">
                {check.summary}
              </p>
              {check.blockers.map((b) => (
                <p
                  key={b}
                  className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 ring-1 ring-inset ring-rose-200"
                >
                  {b}
                </p>
              ))}
              {check.warnings.map((w) => (
                <p
                  key={w}
                  className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-inset ring-amber-200"
                >
                  {w}
                </p>
              ))}
            </>
          )}
          <button
            type="button"
            onClick={yayinla}
            disabled={!check?.ok || busy !== null}
            className="mt-3 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy === 'publish' ? 'Yayınlanıyor…' : 'Yayınla'}
          </button>
        </section>
      )}

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-inset ring-rose-200">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Bütçe alanının ipucu metni MODA GÖRE DEĞİŞİYOR.
 *
 * Eski sihirbazda etiket sabitti ("Günde ne kadar harcayalım?") ve toplam
 * bütçe seçilince yalan söylüyordu: aynı sayı iki farklı anlama geliyordu ve
 * hiçbir yerde yazmıyordu.
 */
function butceIpucu(mode: string): string {
  return mode === 'lifetime'
    ? 'TOPLAM bütçe — kampanyanın tamamı için. Meta bunu süreye böler.'
    : 'GÜNLÜK bütçe — her gün bu kadar harcanır.';
}

function Alan({
  label,
  ipucu,
  children,
}: {
  label: string;
  ipucu?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-muted">
        {label}
      </span>
      {children}
      {ipucu && <span className="mt-0.5 block text-[11px] text-ink-muted">{ipucu}</span>}
    </label>
  );
}

const input =
  'w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand';
