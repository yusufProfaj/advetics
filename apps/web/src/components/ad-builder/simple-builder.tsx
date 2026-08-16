'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  CAMPAIGN_GOALS,
  GOAL_META,
  GOAL_PLATFORM_SUPPORT,
  matchRatio,
  type AssetRecord,
  type CampaignGoal,
  type CreativeRecord,
  type DraftGroupRecord,
  type PublishCheck,
} from '@advetics/shared';
import { API_URL, ApiRequestError, apiFetch } from '@/lib/api';

/**
 * Basit yüzey — tek ekran, sıralı bloklar.
 *
 * ESKİ SİHİRBAZDAN FARKLARI ve her birinin gerekçesi:
 *
 *   · PLATFORM SORULMUYOR. Hedef kartının altında hangi platformlarda
 *     çalışacağı YAZIYOR. Kullanıcı Meta'nın ne yaptığını bilmiyor; ona
 *     platform sormak cevabını bilmediği bir soruyu sormak.
 *
 *   · "KONTROL ET" KAPISI YOK. Eski akışta kullanıcı her şeyi doldurup bir
 *     düğmeye basıyor ve ancak o zaman eksikleri öğreniyordu. Burada eksikler
 *     yazarken görünüyor; taslak oluşturulduktan sonra da sunucu kontrolü
 *     kendiliğinden çalışıyor.
 *
 *   · TASLAK TEK SEFERDE OLUŞUYOR. Eski akışta taslak görsel yüklenirken
 *     sessizce kaydediliyordu ve metin yazıp çıkan kullanıcı yazdığını
 *     kaybediyordu. Burada kayıt tek bir eylemle yapılıyor, yarım durum yok.
 *
 *   · ÜÇ ORAN KUTUSU YOK. Kreatif bir görsel HAVUZU: hangi görselin hangi
 *     yerleşime gideceğine `coverageFor` ölçülen boyutlardan karar veriyor.
 */

type Step = 'form' | 'created';

const BUDGET_PRESETS = [
  { label: 'Küçük başla', value: '100', hint: 'Sonuçları görmek için yeterli.' },
  { label: 'Dengeli', value: '250', hint: 'Çoğu kampanyanın başladığı yer.' },
  { label: 'Hızlı sonuç', value: '500', hint: 'Daha çok kişiye daha çabuk ulaşır.' },
] as const;

export function SimpleAdBuilder({
  clientId,
  accounts,
  pages,
  libraryAssets,
  libraryTotal,
}: {
  clientId: string;
  accounts: Array<{ id: string; name: string; currency: string }>;
  pages: Array<{ id: string; name: string }>;
  libraryAssets: AssetRecord[];
  libraryTotal: number;
}) {
  const router = useRouter();

  const [goal, setGoal] = useState<CampaignGoal | null>(null);
  const [name, setName] = useState('');
  const [adAccountId, setAdAccountId] = useState(accounts[0]?.id ?? '');
  const [pageId, setPageId] = useState(pages[0]?.id ?? '');
  const [primaryText, setPrimaryText] = useState('');
  const [headline, setHeadline] = useState('');
  const [description, setDescription] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [dailyBudget, setDailyBudget] = useState<string>(BUDGET_PRESETS[1].value);
  const [durationDays, setDurationDays] = useState('7');

  const [step, setStep] = useState<Step>('form');
  const [group, setGroup] = useState<DraftGroupRecord | null>(null);
  const [check, setCheck] = useState<PublishCheck | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currency = accounts.find((a) => a.id === adAccountId)?.currency ?? 'TRY';

  /**
   * Eksikler YAZARKEN hesaplanıyor, düğmeye basınca değil.
   *
   * Bu liste sunucunun kontrolünün yerini almıyor — sunucu son söz sahibi ve
   * taslak oluşturulduktan sonra `check` yine çalışıyor. Buradaki amaç
   * kullanıcının bir düğmeye basıp "olmadı" öğrenmesini engellemek.
   */
  const eksikler = useMemo(() => {
    const list: string[] = [];
    if (!goal) list.push('Ne istediğini seç.');
    if (!name.trim()) list.push('Kampanyaya bir ad ver.');
    if (!primaryText.trim()) list.push('Reklamın ana metnini yaz.');
    if (goal === 'website' && !linkUrl.trim()) list.push('Web sitesi adresini yaz.');
    if (assetIds.length === 0) list.push('En az bir görsel seç.');
    return list;
  }, [goal, name, primaryText, linkUrl, assetIds]);

  /**
   * Kullanılabilir görseller — SEÇİLEMEYEN GÖRSELİN SEBEBİ YAZIYOR.
   *
   * Arşiv her oranı kabul ediyor (Google 1.91:1 ve 4:5 istiyor, logo 4:1) ama
   * Meta reklamı kare, 9:16 ve 16:9 kovalarına oturuyor. Telefondan çekilmiş
   * 4:3 bir fotoğraf hiçbirine girmiyor ve bunu tıklamadan önce görmeli.
   */
  const uymayanSayisi = libraryAssets.filter(
    (a) => matchRatio(a.width, a.height) === null,
  ).length;

  async function olustur(): Promise<void> {
    if (!goal) return;
    setBusy('create');
    setError(null);
    try {
      /**
       * ÖNCE KREATİF, SONRA AĞAÇ.
       *
       * İki çağrı çünkü kreatif kütüphaneye ait: aynı metin ve görsel ikinci
       * bir kampanyada yeniden kullanılabilsin. Tek çağrıya sıkıştırmak,
       * kreatifi kampanyaya bağlıymış gibi göstermek olurdu.
       */
      const creative = await apiFetch<CreativeRecord>('/creatives', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          name: name.trim(),
          texts: {
            primaryText: primaryText.trim(),
            headlines: headline.trim() ? [headline.trim()] : [],
            longHeadlines: [],
            descriptions: description.trim() ? [description.trim()] : [],
          },
          assetIds,
        }),
      });

      const created = await apiFetch<DraftGroupRecord>('/draft-campaigns/simple', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          name: name.trim(),
          goal,
          targets: [{ platform: 'meta', adAccountId, dailyBudget }],
          socialProfileId: pageId,
          creativeId: creative.id,
          durationDays: Number(durationDays),
          linkUrl: linkUrl.trim() || undefined,
          whatsappNumber: whatsappNumber.trim() || undefined,
        }),
      });

      setGroup(created);
      setStep('created');

      // KONTROL KENDİLİĞİNDEN ÇALIŞIYOR. Kullanıcının ayrı bir düğmeye
      // basması gerekmiyor; "hazır mı" sorusunun cevabı hemen ekranda.
      const first = created.campaigns[0];
      if (first) setCheck(await apiFetch<PublishCheck>(`/draft-campaigns/${first.id}/check`));
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Taslak oluşturulamadı');
    } finally {
      setBusy(null);
    }
  }

  async function yayinla(): Promise<void> {
    if (!group?.campaigns[0]) return;
    setBusy('publish');
    setError(null);
    try {
      /**
       * GRUP YAYINI — her platform BAĞIMSIZ.
       *
       * Uç nokta hata fırlatmıyor: Meta çıkıp Google düştüğünde tek bir hata
       * göstermek, yayına girmiş ve o anda para harcamaya başlamış kampanyayı
       * gizlemek olurdu. Yanıt her platformun kendi durumunu taşıyor.
       */
      const result = await apiFetch<DraftGroupRecord>(
        `/draft-campaigns/${group.campaigns[0].id}/publish-group`,
        { method: 'POST' },
      );
      setGroup(result);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Reklam yayınlanamadı');
    } finally {
      setBusy(null);
    }
  }

  if (step === 'created' && group) {
    return (
      <Sonuc
        group={group}
        check={check}
        busy={busy}
        error={error}
        onPublish={yayinla}
        onReset={() => {
          setStep('form');
          setGroup(null);
          setCheck(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* 1. Ne istiyorsun */}
      <Blok no={1} baslik="Ne olsun?">
        <div className="grid gap-2 sm:grid-cols-3">
          {CAMPAIGN_GOALS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGoal(g)}
              className={`rounded-xl border p-3 text-left transition ${
                goal === g ? 'border-brand bg-brand-soft' : 'border-line hover:bg-surface-sunken'
              }`}
            >
              <span className="block text-sm font-semibold text-ink">{GOAL_META[g].label}</span>
              <span className="mt-1 block text-xs text-ink-muted">{GOAL_META[g].promise}</span>
              {/* PLATFORM SORU DEĞİL, SONUÇ. */}
              <span className="mt-2 block text-[11px] font-medium text-ink-muted">
                {platformEtiketi(g)}
              </span>
            </button>
          ))}
        </div>
      </Blok>

      {goal && (
        <>
          <Blok no={2} baslik="Kampanyaya bir ad ver">
            <div className="grid gap-3 sm:grid-cols-2">
              <Alan label="Kampanya adı" ipucu="Yalnızca sen göreceksin, müşteriler görmez.">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ağustos — Teklif Kampanyası"
                  className={input}
                />
              </Alan>

              {/* HESAP VE SAYFA YALNIZCA BİRDEN FAZLAYSA SORULUYOR.
                  Tek seçenek varken açılır liste göstermek, kullanıcıya
                  cevabı belli bir soru sormak. Eski sihirbaz her zaman
                  soruyordu ve sessizce ilk elemanı seçiyordu. */}
              {accounts.length > 1 && (
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
              )}
              {pages.length > 1 && (
                <Alan label="Hangi sayfa adına yayınlansın">
                  <select
                    value={pageId}
                    onChange={(e) => setPageId(e.target.value)}
                    className={input}
                  >
                    {pages.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Alan>
              )}

              {goal === 'website' && (
                <Alan label="Web sitesi adresi">
                  <input
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://siteniz.com/urun"
                    className={input}
                  />
                </Alan>
              )}
              {goal === 'whatsapp' && (
                <Alan
                  label="WhatsApp numarası (opsiyonel)"
                  ipucu="Boş bırakırsan sayfaya bağlı numara kullanılır."
                >
                  <input
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="905551112233"
                    className={input}
                  />
                </Alan>
              )}
            </div>

            {(accounts.length === 1 || pages.length === 1) && (
              <p className="mt-2 text-[11px] text-ink-muted">
                {accounts.length === 1 && `Reklam hesabı: ${accounts[0]!.name}. `}
                {pages.length === 1 && `Sayfa: ${pages[0]!.name}.`}
              </p>
            )}
          </Blok>

          {/* 3. Görseller — HAVUZ, oran kutusu değil */}
          <Blok
            no={3}
            baslik="Görselleri seç"
            altBaslik="Birden fazla seçebilirsin; hangisinin nereye gideceğine biz karar veririz."
          >
            {libraryAssets.length === 0 ? (
              <p className="rounded-lg bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
                Arşivde henüz görsel yok. <strong>Kütüphane → Görsel Arşivi</strong> bölümünden
                yükleyebilirsin.
              </p>
            ) : (
              <>
                <ul className="grid gap-2 sm:grid-cols-6">
                  {libraryAssets.map((a) => {
                    const oran = matchRatio(a.width, a.height);
                    const secili = assetIds.includes(a.id);
                    return (
                      <li key={a.id}>
                        <button
                          type="button"
                          disabled={oran === null}
                          onClick={() =>
                            setAssetIds((prev) =>
                              prev.includes(a.id)
                                ? prev.filter((x) => x !== a.id)
                                : [...prev, a.id],
                            )
                          }
                          title={
                            oran
                              ? `${a.name} · ${a.width}×${a.height}`
                              : `${a.name} · ${a.width}×${a.height} — bu oran Meta reklamında kullanılamıyor`
                          }
                          className={`block w-full overflow-hidden rounded-lg border-2 bg-surface-sunken transition ${
                            secili
                              ? 'border-brand'
                              : oran
                                ? 'border-transparent hover:border-line'
                                : 'cursor-not-allowed border-transparent opacity-35'
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`${API_URL}${a.previewUrl}`}
                            alt={a.name}
                            className="aspect-square w-full object-contain"
                            loading="lazy"
                          />
                          <span className="block truncate px-1 pb-1 text-[10px] text-ink-muted">
                            {secili ? `✓ ${assetIds.indexOf(a.id) + 1}.` : oran ? a.name : 'oran uymuyor'}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {/* SESSİZ ELEME YOK: kaç görsel gösteriliyor, kaçı neden
                    kullanılamıyor ve toplam kaç tane var — üçü de yazıyor. */}
                <p className="mt-2 text-[11px] text-ink-muted">
                  {libraryAssets.length} görsel gösteriliyor
                  {libraryTotal > libraryAssets.length && ` (arşivde toplam ${libraryTotal})`}.
                  {uymayanSayisi > 0 &&
                    ` Soluk görünen ${uymayanSayisi} tanesi Meta reklamına uymayan oranlarda ` +
                      '(ör. 4:3 fotoğraflar).'}
                </p>
              </>
            )}
          </Blok>

          {/* 4. Metin + önizleme */}
          <Blok no={4} baslik="Ne yazalım?">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <MetinAlani
                  label="Ana metin"
                  ipucu="Reklamın üstünde görünen yazı."
                  value={primaryText}
                  onChange={setPrimaryText}
                  limit={125}
                  rows={4}
                />
                <MetinAlani
                  label="Başlık"
                  ipucu="Görselin altında kalın yazıyla görünür."
                  value={headline}
                  onChange={setHeadline}
                  limit={40}
                />
                <MetinAlani
                  label="Açıklama"
                  ipucu="Başlığın altında küçük yazı. Boş bırakılabilir."
                  value={description}
                  onChange={setDescription}
                  limit={30}
                />
              </div>

              <Onizleme
                pageName={pages.find((p) => p.id === pageId)?.name ?? 'Sayfan'}
                primaryText={primaryText}
                headline={headline}
                description={description}
                goal={goal}
                asset={libraryAssets.find((a) => a.id === assetIds[0])}
              />
            </div>
          </Blok>

          {/* 5. Bütçe — HAZIR KARTLAR */}
          <Blok no={5} baslik="Günde ne kadar harcayalım?">
            <div className="grid gap-2 sm:grid-cols-3">
              {BUDGET_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setDailyBudget(p.value)}
                  className={`rounded-xl border p-3 text-left transition ${
                    dailyBudget === p.value
                      ? 'border-brand bg-brand-soft'
                      : 'border-line hover:bg-surface-sunken'
                  }`}
                >
                  <span className="block text-sm font-semibold text-ink">
                    {p.value} {currency}
                    <span className="font-normal text-ink-muted"> / gün</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-muted">{p.label}</span>
                  <span className="mt-1 block text-[11px] text-ink-muted">{p.hint}</span>
                </button>
              ))}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Alan label={`Başka bir tutar (${currency})`}>
                <input
                  value={dailyBudget}
                  onChange={(e) => setDailyBudget(e.target.value)}
                  inputMode="decimal"
                  className={input}
                />
              </Alan>
              <Alan
                label="Kaç gün yayında kalsın"
                ipucu="0 yazarsan süresiz olur ve sen durdurana kadar harcar."
              >
                <input
                  type="number"
                  min={0}
                  max={90}
                  value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value)}
                  className={input}
                />
              </Alan>
            </div>

            {/* NE SEÇTİĞİMİZİ SÖYLÜYORUZ. "Biz hallederiz" demek yeterli
                değil: kullanıcı neyin kararını devrettiğini bilmeli. */}
            <p className="mt-3 text-xs text-ink-muted">{bizNeSectik(goal)}</p>
          </Blok>

          {/* Eksikler ve oluştur */}
          <div className="rounded-xl border border-line bg-surface p-4">
            {eksikler.length > 0 ? (
              <>
                <p className="text-xs font-medium text-ink">Devam etmek için:</p>
                <ul className="mt-1.5 space-y-0.5">
                  {eksikler.map((e) => (
                    <li key={e} className="text-xs text-ink-muted">
                      · {e}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-xs text-emerald-700">Her şey hazır.</p>
            )}

            <button
              type="button"
              onClick={olustur}
              disabled={eksikler.length > 0 || busy !== null}
              className="mt-3 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy === 'create' ? 'Hazırlanıyor…' : 'Reklamı hazırla'}
            </button>
          </div>
        </>
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
 * Oluşturulmuş taslak ve yayın.
 *
 * KISMİ BAŞARI BURADA GÖRÜNÜYOR: her platform kendi satırında, kendi
 * durumuyla ve kendi hatasıyla. Tek bir "yayınlandı/yayınlanamadı" göstermek,
 * yayına girmiş ve para harcamaya başlamış bir kampanyayı gizlemek olurdu.
 */
function Sonuc({
  group,
  check,
  busy,
  error,
  onPublish,
  onReset,
}: {
  group: DraftGroupRecord;
  check: PublishCheck | null;
  busy: string | null;
  error: string | null;
  onPublish: () => void;
  onReset: () => void;
}) {
  const yayinlanan = group.campaigns.filter((c) => c.status === 'published');
  const hepsiYayinda = yayinlanan.length === group.campaigns.length;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">{group.name}</h2>

        <ul className="mt-3 space-y-2">
          {group.campaigns.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-sunken px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-ink">
                  {c.platform === 'google' ? 'Google Ads' : 'Meta'}
                  <span className="ml-1.5 font-normal text-ink-muted">{c.adAccountName}</span>
                </p>
                {c.error && <p className="mt-0.5 text-[11px] text-rose-700">{c.error}</p>}
              </div>
              <span className={`shrink-0 text-[11px] font-medium ${durumRengi(c.status)}`}>
                {DURUM[c.status]}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {check && !hepsiYayinda && (
        <section className="rounded-xl border border-line bg-surface p-4">
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

          <button
            type="button"
            onClick={onPublish}
            disabled={!check.ok || busy !== null}
            className="mt-3 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy === 'publish' ? 'Yayınlanıyor…' : 'Yayınla'}
          </button>
        </section>
      )}

      {hepsiYayinda && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <h3 className="text-sm font-semibold text-emerald-900">Reklamın yayında</h3>
          <p className="mt-1 text-sm text-emerald-800">
            Meta reklamı onaylayana kadar birkaç saat geçebilir. Onaylandığında yayına girer ve
            harcamaya başlar. Sonuçları <strong>Genel Bakış</strong> ekranından izleyebilirsin.
          </p>
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-inset ring-rose-200">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onReset}
        className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken"
      >
        Yeni reklam oluştur
      </button>
    </div>
  );
}

const DURUM: Record<string, string> = {
  draft: 'Hazır, yayınlanmadı',
  publishing: 'Yayınlanıyor…',
  published: 'Yayında',
  failed: 'Başarısız',
};

function durumRengi(status: string): string {
  if (status === 'published') return 'text-emerald-700';
  if (status === 'failed') return 'text-rose-700';
  return 'text-ink-muted';
}

/**
 * Hedefin hangi platformlarda çalıştığı.
 *
 * Kaynak `GOAL_PLATFORM_SUPPORT` — sunucunun kullandığı tablonun aynısı. İki
 * yerde ayrı liste tutmak, arayüzün "Google'da da çıkar" deyip sunucunun onu
 * atlaması demek olurdu.
 */
function platformEtiketi(goal: CampaignGoal): string {
  const calisanlar = (['meta', 'google'] as const).filter(
    (p) => GOAL_PLATFORM_SUPPORT[goal][p].support === 'yes',
  );
  const adlar = calisanlar.map((p) => (p === 'meta' ? 'Facebook · Instagram' : 'Google'));
  return adlar.join(' · ');
}

/** Bizim kullanıcı adına verdiğimiz kararların düz Türkçe özeti. */
function bizNeSectik(goal: CampaignGoal): string {
  const ortak =
    'Kitle: Türkiye, 18+, daraltma yok. Yerleşim: seçtiğin görsel oranlarına göre. ' +
    'Teklif: en düşük maliyet.';
  switch (goal) {
    case 'form':
      return `Hedef: potansiyel müşteri, form dolduranlara göre optimize. ${ortak}`;
    case 'whatsapp':
      return `Hedef: potansiyel müşteri, mesaj yazanlara göre optimize. ${ortak}`;
    case 'website':
      return `Hedef: trafik, sayfayı gerçekten açanlara göre optimize. ${ortak}`;
  }
}

function Onizleme({
  pageName,
  primaryText,
  headline,
  description,
  goal,
  asset,
}: {
  pageName: string;
  primaryText: string;
  headline: string;
  description: string;
  goal: CampaignGoal;
  asset: AssetRecord | undefined;
}) {
  const cta =
    goal === 'whatsapp'
      ? 'WhatsApp’tan Mesaj Gönder'
      : goal === 'form'
        ? 'Kaydol'
        : 'Daha Fazla Bilgi';

  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
        Önizleme
      </p>
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex items-center gap-2 p-3">
          <span className="h-8 w-8 shrink-0 rounded-full bg-surface-sunken" />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-ink">{pageName}</p>
            <p className="text-[10px] text-ink-muted">Sponsorlu</p>
          </div>
        </div>

        <p className="whitespace-pre-wrap px-3 pb-2 text-xs text-ink">
          {primaryText || 'Ana metin burada görünecek.'}
        </p>

        <div className="aspect-square w-full bg-surface-sunken">
          {asset && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${API_URL}${asset.previewUrl}`}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-2 bg-surface-sunken p-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-ink">{headline || 'Başlık'}</p>
            {description && (
              <p className="truncate text-[11px] text-ink-muted">{description}</p>
            )}
          </div>
          <span className="shrink-0 rounded bg-surface px-2 py-1 text-[10px] font-medium text-ink ring-1 ring-line">
            {cta}
          </span>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-ink-muted">
        Yaklaşık görünüm. Gerçek reklam yerleşime göre biraz farklı olabilir.
      </p>
    </div>
  );
}

function MetinAlani({
  label,
  ipucu,
  value,
  onChange,
  limit,
  rows,
}: {
  label: string;
  ipucu: string;
  value: string;
  onChange: (v: string) => void;
  limit: number;
  rows?: number;
}) {
  // SAYAC KIRPILMA SINIRINA GÖRE, teknik sınıra göre değil.
  const asildi = value.length > limit;
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
          {label}
        </span>
        <span className={`text-[11px] ${asildi ? 'text-amber-700' : 'text-ink-muted'}`}>
          {value.length}/{limit}
        </span>
      </span>
      {rows ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          className={input}
        />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className={input} />
      )}
      <span className="mt-0.5 block text-[11px] text-ink-muted">
        {asildi ? `${limit} karakterden sonrası akışta kısaltılır.` : ipucu}
      </span>
    </label>
  );
}

function Blok({
  no,
  baslik,
  altBaslik,
  children,
}: {
  no: number;
  baslik: string;
  altBaslik?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-baseline gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">
          {no}
        </span>
        <div>
          <h2 className="text-sm font-semibold text-ink">{baslik}</h2>
          {altBaslik && <p className="text-xs text-ink-muted">{altBaslik}</p>}
        </div>
      </div>
      {children}
    </section>
  );
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
