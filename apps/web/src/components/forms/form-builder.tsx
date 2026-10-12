'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  CONSENT_PRESETS,
  FORM_TYPES,
  FORM_TYPE_META,
  ONERILEN_ON_DOLU_SORULAR,
  PREFILL_LABELS,
  PREFILL_QUESTIONS,
  TESEKKUR_DUGME_ETIKETI,
  TESEKKUR_DUGME_TURLERI,
  UZUN_FORM_SORU_SAYISI,
  VARSAYILAN_FORM_TURU,
  type TesekkurDugmeTuru,
  type ConsentBox,
  type CustomQuestion,
  type EditPlan,
  type FormType,
  type LeadFormRecord,
  type PrefillQuestion,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { kayittanOnizleme } from '@/lib/form-onizleme';
import { FormOnizleme } from './form-onizleme';

/**
 * Anlık form oluşturucu.
 *
 * BEŞ BÖLÜM, TEK SAYFA: tip → giriş → sorular → gizlilik → teşekkür.
 * Sihirbaz adımları arasında gidip gelmek kullanıcının ne yazdığını
 * unutturuyor; burada her şey görünür kalıyor ve sağdaki önizleme her
 * değişiklikte güncelleniyor.
 *
 * EN ÖNEMLİ DAVRANIŞ: yayınlanmış bir formda değişiklik yapıldığında,
 * KAYDETMEDEN ÖNCE ne olacağı söyleniyor. Sunucudan `plan` isteniyor ve
 * kullanıcı yeni sürüm oluşacağını onaylamadan hiçbir şey yazılmıyor.
 *
 * İKİ YERDE AYNI BİLEŞEN: Marka Merkezi › Formlar ve AdvCampaign rehberinin
 * "Form oluştur" penceresi (`gomulu`). Rehbere ikinci bir oluşturucu
 * yazılmadı: iki oluşturucu, Meta'ya giden iki ayrı form biçimi demekti.
 * Gömülü kipte sayfa yenilenmez (rehberin yazılmamış değişiklikleri
 * kaybolmasın); yayın sonucu çağırana bildirilir ve rehber yeni formu seçer.
 */
export function FormBuilder({
  clientId,
  pages,
  existing,
  canPublish,
  gomulu,
  telefonOnerisi = null,
}: {
  clientId: string;
  pages: Array<{ id: string; name: string }>;
  existing?: LeadFormRecord;
  canPublish: boolean;
  /**
   * Marka Merkezi telefonu, E.164'e çevrilmiş (`trTelefonOnerisi`). "Bizi
   * ara" düğmesine önden dolar; çözülemeyen numara `null` ve alan boş kalır
   * (yanlış numarayı önden doldurmak, aramaların başka birine gitmesi).
   */
  telefonOnerisi?: string | null;
  gomulu?: {
    /** Gizlilik adresi önerisi ve KAYNAĞI (ekranda yazılır); yoksa alan boş ve zorunlu. */
    varsayilanGizlilik?: { adres: string; kaynak: string } | null;
    onYayinlandi: (kayit: LeadFormRecord) => void;
  };
}) {
  const router = useRouter();
  const yenile = () => {
    if (!gomulu) router.refresh();
  };
  const oneri = existing ? null : (gomulu?.varsayilanGizlilik ?? null);

  const [pageId, setPageId] = useState(existing?.socialProfileId ?? pages[0]?.id ?? '');
  const [name, setName] = useState(existing?.name ?? '');
  // VARSAYILAN "daha yüksek niyet" (shared `VARSAYILAN_FORM_TURU`); şema ile
  // ekran aynı sabiti okuyor, yoksa yeni formun türü ekranda başka, kayıtta başka olurdu.
  const [formType, setFormType] = useState<FormType>(existing?.formType ?? VARSAYILAN_FORM_TURU);
  const [headline, setHeadline] = useState(existing?.headline ?? '');
  const [intro, setIntro] = useState(existing?.intro ?? '');
  const [prefill, setPrefill] = useState<PrefillQuestion[]>(
    existing?.prefillQuestions ?? [...ONERILEN_ON_DOLU_SORULAR],
  );
  // ÖNERİLEN SET: ad soyad + telefon ve TEK eleme sorusu. Eleme sorusu yeni
  // formda boş bir çoktan seçmeli satır olarak hazır duruyor; kullanıcı
  // yazmazsa forma hiç girmiyor (`body()` boş soruyu atıyor).
  const [custom, setCustom] = useState<CustomQuestion[]>(
    existing?.customQuestions ?? [{ type: 'multiple_choice', label: '', options: [] }],
  );
  const [privacyUrl, setPrivacyUrl] = useState(existing?.privacyPolicyUrl ?? oneri?.adres ?? '');
  const [privacyText, setPrivacyText] = useState(
    existing?.privacyPolicyLinkText ?? 'Gizlilik Politikası',
  );
  const [consents, setConsents] = useState<ConsentBox[]>(existing?.consentBoxes ?? []);
  const [tyHeadline, setTyHeadline] = useState(existing?.thankYouHeadline ?? 'Teşekkürler!');
  const [tyBody, setTyBody] = useState(
    existing?.thankYouBody ?? 'En kısa sürede size dönüş yapacağız.',
  );
  const [tyCtaText, setTyCtaText] = useState(existing?.thankYouCtaText ?? 'Siteyi ziyaret et');
  const [tyCtaUrl, setTyCtaUrl] = useState(existing?.thankYouCtaUrl ?? '');
  const [tyCtaType, setTyCtaType] = useState<TesekkurDugmeTuru>(
    existing?.thankYouCtaType ?? (existing ? 'NONE' : telefonOnerisi ? 'CALL_BUSINESS' : 'NONE'),
  );
  const [tyPhone, setTyPhone] = useState(existing?.thankYouPhone ?? telefonOnerisi ?? '');

  const [formId, setFormId] = useState(existing?.id ?? null);
  const [status, setStatus] = useState(existing?.status ?? 'draft');
  const [plan, setPlan] = useState<EditPlan | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const published = status === 'published';
  // Yayını süren ya da belirsiz form da kilitli: Meta'da açılmış olabilir
  // (sunucu da reddediyor).
  const yayinYarim = status === 'publishing' || status === 'uncertain';
  const locked = published || status === 'superseded' || yayinYarim;
  // "Yeniden dene" İKİ ADIMLI: ilk tık onay kutusunu açar, ikincisi yayınlar.
  // Meta'da form açılmışsa yeniden yayın İKİNCİ formu açar ve silinemez.
  const [yenidenOnay, setYenidenOnay] = useState(false);

  function body() {
    return {
      clientId,
      socialProfileId: pageId,
      name,
      formType,
      headline: headline || undefined,
      intro: intro || undefined,
      prefillQuestions: prefill,
      // Boş eleme sorusu (metin ve seçenek yok) forma girmez: "boşsa yok".
      customQuestions: custom.filter((q) => q.label.trim() || q.options.length > 0),
      privacyPolicyUrl: privacyUrl,
      privacyPolicyLinkText: privacyText,
      consentBoxes: consents,
      thankYouHeadline: tyHeadline,
      thankYouBody: tyBody,
      thankYouCtaText: tyCtaText,
      thankYouCtaUrl: tyCtaType === 'VIEW_WEBSITE' ? tyCtaUrl || undefined : undefined,
      thankYouCtaType: tyCtaType,
      thankYouPhone: tyCtaType === 'CALL_BUSINESS' ? tyPhone.trim() || undefined : undefined,
    };
  }

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
    setBusy(label);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'İşlem tamamlanamadı.');
      return null;
    } finally {
      setBusy(null);
    }
  }

  /**
   * Kaydetmeden ÖNCE plan sorulur.
   *
   * Yayınlanmış bir formda düzenleme Meta'da geri alınamayan yeni bir kayıt
   * üretiyor. Kullanıcı bunu onaylamadan hiçbir şey yazılmıyor.
   */
  async function save(): Promise<void> {
    if (!formId) {
      const created = await run('save', () =>
        apiFetch<LeadFormRecord>('/lead-forms', {
          method: 'POST',
          body: JSON.stringify(body()),
        }),
      );
      if (created) {
        setFormId(created.id);
        setStatus(created.status);
        await loadWarnings(created.id);
        yenile();
      }
      return;
    }

    if (published && !plan) {
      const p = await run('plan', () =>
        apiFetch<EditPlan>(`/lead-forms/${formId}/plan`, {
          method: 'POST',
          body: JSON.stringify(body()),
        }),
      );
      if (p && !p.inPlace) {
        setPlan(p);
        return; // Onay bekleniyor.
      }
    }

    const updated = await run('save', () =>
      apiFetch<LeadFormRecord>(`/lead-forms/${formId}`, {
        method: 'PUT',
        body: JSON.stringify(body()),
      }),
    );
    if (updated) {
      setPlan(null);
      setFormId(updated.id);
      setStatus(updated.status);
      await loadWarnings(updated.id);
      yenile();
    }
  }

  async function loadWarnings(id: string): Promise<void> {
    // HATA YUTULMUYOR: "kontrol yok" ile "kontroller okunamadı" ayrı şeyler;
    // ikincisi boş listeye çevrilirse kullanıcı formu temiz sanar.
    try {
      const res = await apiFetch<{ blockers: string[]; warnings: string[] }>(`/lead-forms/${id}/checks`);
      setWarnings([...res.blockers, ...res.warnings]);
    } catch (err) {
      setWarnings([`Yayın öncesi kontroller okunamadı: ${err instanceof ApiRequestError ? err.message : 'sunucuya ulaşılamadı'}`]);
    }
  }

  async function publish(belirsizOnayi = false): Promise<void> {
    if (!formId) return;
    const res = await run('publish', () =>
      apiFetch<LeadFormRecord>(`/lead-forms/${formId}/publish`, {
        method: 'POST',
        // Onay YALNIZ "Yeniden dene" penceresinden: normal yayın gövdesiz.
        ...(belirsizOnayi ? { body: JSON.stringify({ belirsizOnayi: true }) } : {}),
      }),
    );
    setYenidenOnay(false);
    if (res) {
      setStatus(res.status);
      yenile();
      gomulu?.onYayinlandi(res);
    }
  }

  // Uzun form uyarısı yazarken, yayından önce (karar tablosuyla aynı eşik).
  const soruSayisi = prefill.length + custom.filter((q) => q.label.trim()).length;

  function dugmeTuruSec(t: TesekkurDugmeTuru): void {
    // Düğme metni türün varsayılanıysa türle birlikte değişir; kullanıcının
    // yazdığı metne dokunulmaz.
    if (!tyCtaText || tyCtaText === TESEKKUR_DUGME_ETIKETI[tyCtaType]) setTyCtaText(t === 'NONE' ? tyCtaText : TESEKKUR_DUGME_ETIKETI[t]);
    setTyCtaType(t);
  }

  function togglePrefill(q: PrefillQuestion): void {
    setPrefill((cur) => (cur.includes(q) ? cur.filter((x) => x !== q) : [...cur, q]));
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        {status === 'uncertain' && (
          /**
           * YAYIN BELİRSİZ: Meta isteği başladı ama cevabı kayda geçmedi.
           * Üç cümle, tek eylem: kontrol et, yoksa bilinçli yeniden dene.
           */
          <div className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn-strong ring-1 ring-inset ring-warn/30" role="alert">
            <p className="font-semibold">Yayın belirsiz: Meta&apos;da form açılmış olabilir.</p>
            <p className="mt-1 text-xs">
              Facebook sayfasının formlarında bu adla bir form var mı kontrol et. Varsa yeniden
              yayınlama; Meta formu silmiyor ve ikinci bir form açılır. Yoksa yeniden dene.
            </p>
            {canPublish && formId && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {!yenidenOnay ? (
                  <button
                    type="button"
                    onClick={() => setYenidenOnay(true)}
                    disabled={busy !== null}
                    className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken disabled:opacity-40"
                  >
                    Yeniden dene
                  </button>
                ) : (
                  <>
                    <span className="text-xs font-semibold">Sayfanın formlarında bu form yok, eminim.</span>
                    <button
                      type="button"
                      onClick={() => void publish(true)}
                      disabled={busy !== null}
                      className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      {busy === 'publish' ? 'Yayınlanıyor…' : 'Evet, yeniden yayınla'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setYenidenOnay(false)}
                      disabled={busy !== null}
                      className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-40"
                    >
                      Vazgeç
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        {status === 'publishing' && (
          <div className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn-strong ring-1 ring-inset ring-warn/30" role="status">
            <p className="font-semibold">Form yayınlanıyor.</p>
            <p className="mt-1 text-xs">Birkaç dakika sonra sayfayı yenile; yayın yarıda kaldıysa burada yazar.</p>
          </div>
        )}
        {locked && !yayinYarim && (
          /**
           * DEĞİŞMEZLİK UYARISI EN ÜSTTE ve formu açar açmaz görünüyor.
           *
           * Aşağıya koymak, kullanıcının alanları doldurup en sonda öğrenmesi
           * demek olurdu.
           */
          <div className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn-strong ring-1 ring-inset ring-warn/30">
            <p className="font-semibold">Bu form yayında — içeriği değiştirilemiyor.</p>
            <p className="mt-1 text-xs">
              Meta yayınlanmış formu güncellemiyor: bilgilerini bırakan kişiler mevcut onay
              metnini kabul etti. Değişiklik yaparsan yeni bir sürüm oluşturulur. Form adını
              değiştirmek serbest — o yalnızca burada görünüyor.
            </p>
            <p className="mt-1 text-xs">
              <strong>Yeni sürüm yayındaki reklamları değiştirmez.</strong> Çalışan bir
              reklamın formu Meta'da değiştirilemiyor; yeni formu kullanmak için yeni bir
              reklam gerekiyor.
            </p>
          </div>
        )}

        <Section n={1} title="Form tipi">
          <div className="grid gap-2 sm:grid-cols-3">
            {FORM_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                disabled={locked}
                onClick={() => setFormType(t)}
                className={`rounded-lg border p-3 text-left transition disabled:opacity-50 ${
                  formType === t ? 'border-brand bg-brand/5' : 'border-line hover:bg-surface-sunken'
                }`}
              >
                <p className="text-sm font-medium text-ink">{FORM_TYPE_META[t].label}</p>
                <p className="mt-1 text-[11px] text-ink-muted">{FORM_TYPE_META[t].promise}</p>
                {/* HER SEÇİMİN BEDELİ YAZIYOR. "Daha fazla form" kulağa her
                    zaman iyi geliyor; kullanıcının neyi feda ettiğini bilmesi
                    gerekiyor. */}
                <p className="mt-1 text-[11px] text-ink-muted italic">
                  {FORM_TYPE_META[t].tradeoff}
                </p>
              </button>
            ))}
          </div>
        </Section>

        <Section n={2} title="Giriş ekranı">
          <Field label="Form adı (yalnızca burada görünür)">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Yaz kampanyası — form"
              className={inputCls}
            />
          </Field>
          <Field label="Sayfa">
            <select
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
              disabled={locked}
              className={inputCls}
            >
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Başlık" hint="Formun üstünde görünen kısa cümle.">
            <input
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              maxLength={60}
              disabled={locked}
              placeholder="Ücretsiz keşif randevusu"
              className={inputCls}
            />
          </Field>
          <Field label="Açıklama">
            <textarea
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              maxLength={1000}
              rows={3}
              disabled={locked}
              placeholder="Formu dolduran herkesi uzman ekibimiz 24 saat içinde arıyor."
              className={inputCls}
            />
          </Field>
        </Section>

        <Section n={3} title="Sorular">
          <p className="text-xs text-ink-muted">
            Bu sorular Facebook profilinden <strong>otomatik doluyor</strong> — kişi yazmıyor,
            onaylıyor. Bu yüzden en çok tamamlanan sorular bunlar.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PREFILL_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={locked}
                onClick={() => togglePrefill(q)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                  prefill.includes(q)
                    ? 'border-brand bg-brand/5 text-ink'
                    : 'border-line text-ink-muted hover:bg-surface-sunken'
                }`}
              >
                {prefill.includes(q) ? '✓ ' : ''}
                {PREFILL_LABELS[q]}
              </button>
            ))}
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-ink">Kendi sorun</p>
              {!locked && custom.length < 5 && (
                <button
                  type="button"
                  onClick={() =>
                    setCustom((c) => [...c, { type: 'short_answer', label: '', options: [] }])
                  }
                  className="rounded-lg border border-line px-2 py-1 text-[11px] text-ink hover:bg-surface-sunken"
                >
                  + Soru ekle
                </button>
              )}
            </div>
            {custom.length === 0 ? (
              <p className="mt-1 text-[11px] text-ink-muted">
                Her ek soru formu tamamlayan kişi sayısını düşürüyor — bunlar elle
                yazılıyor.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {custom.map((q, i) => (
                  <li key={i} className="rounded-lg border border-line p-2.5">
                    <div className="flex gap-2">
                      <input
                        value={q.label}
                        onChange={(e) =>
                          setCustom((c) =>
                            c.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                          )
                        }
                        disabled={locked}
                        placeholder={
                          i === 0 && q.type === 'multiple_choice'
                            ? 'Eleme sorusu (önerilir): Ne zaman almayı düşünüyorsunuz?'
                            : 'Hangi bölgede arıyorsunuz?'
                        }
                        className={`${inputCls} flex-1`}
                      />
                      <select
                        value={q.type}
                        onChange={(e) =>
                          setCustom((c) =>
                            c.map((x, j) =>
                              j === i
                                ? { ...x, type: e.target.value as CustomQuestion['type'] }
                                : x,
                            ),
                          )
                        }
                        disabled={locked}
                        className={`${inputCls} w-40`}
                      >
                        <option value="short_answer">Kısa cevap</option>
                        <option value="multiple_choice">Çoktan seçmeli</option>
                      </select>
                      {!locked && (
                        <button
                          type="button"
                          onClick={() => setCustom((c) => c.filter((_, j) => j !== i))}
                          className="rounded-lg border border-line px-2 text-xs text-ink-muted"
                        >
                          Sil
                        </button>
                      )}
                    </div>
                    {q.type === 'multiple_choice' && (
                      <input
                        value={q.options.join(', ')}
                        onChange={(e) =>
                          setCustom((c) =>
                            c.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    options: e.target.value
                                      .split(',')
                                      .map((o) => o.trim())
                                      .filter(Boolean),
                                  }
                                : x,
                            ),
                          )
                        }
                        disabled={locked}
                        placeholder="Seçenekleri virgülle ayır: 1-2 milyon, 2-5 milyon, 5 milyon+"
                        className={`${inputCls} mt-2`}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>

        {soruSayisi >= UZUN_FORM_SORU_SAYISI && (
          <p className="rounded-xl bg-warn-soft px-4 py-3 text-xs text-warn-strong ring-1 ring-inset ring-warn/30">
            {soruSayisi} soru var. Uzun form daha az doldurulur.
          </p>
        )}

        <Section n={4} title="Gizlilik ve onaylar">
          <Field
            label="Gizlilik politikası adresi"
            hint={
              oneri && privacyUrl === oneri.adres
                ? `Önden dolduruldu: ${oneri.kaynak}. Bu form için doğru değilse değiştir.`
                : 'Zorunlu. Meta gizlilik politikası olmayan formu kabul etmiyor; adres https:// ile başlamalı.'
            }
          >
            <input
              value={privacyUrl}
              onChange={(e) => setPrivacyUrl(e.target.value)}
              disabled={locked}
              placeholder="https://musteri.com/gizlilik"
              className={inputCls}
            />
          </Field>
          <Field label="Bağlantı metni">
            <input
              value={privacyText}
              onChange={(e) => setPrivacyText(e.target.value)}
              disabled={locked}
              className={inputCls}
            />
          </Field>

          <div className="mt-3">
            <p className="text-xs font-medium text-ink">Onay kutuları</p>
            <p className="mt-0.5 text-[11px] text-ink-muted">
              Türkiye'de açık rıza ayrı bir onay gerektiriyor — gizlilik politikası linki tek
              başına yeterli sayılmıyor.
            </p>
            {!locked && (
              <div className="mt-2 flex flex-wrap gap-2">
                {CONSENT_PRESETS.filter((p) => !consents.some((c) => c.text === p.text)).map(
                  (p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() =>
                        setConsents((c) => [...c, { text: p.text, required: p.key === 'kvkk' }])
                      }
                      className="rounded-lg border border-line px-2.5 py-1 text-[11px] text-ink hover:bg-surface-sunken"
                    >
                      + {p.label}
                    </button>
                  ),
                )}
              </div>
            )}
            <ul className="mt-2 space-y-2">
              {consents.map((c, i) => (
                <li key={i} className="rounded-lg border border-line p-2.5">
                  <textarea
                    value={c.text}
                    onChange={(e) =>
                      setConsents((cs) =>
                        cs.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)),
                      )
                    }
                    rows={2}
                    disabled={locked}
                    className={inputCls}
                  />
                  <div className="mt-1.5 flex items-center justify-between">
                    <label className="flex items-center gap-1.5 text-[11px] text-ink-muted">
                      <input
                        type="checkbox"
                        checked={c.required}
                        disabled={locked}
                        onChange={(e) =>
                          setConsents((cs) =>
                            cs.map((x, j) =>
                              j === i ? { ...x, required: e.target.checked } : x,
                            ),
                          )
                        }
                      />
                      Zorunlu — işaretlenmeden form gönderilemez
                    </label>
                    {!locked && (
                      <button
                        type="button"
                        onClick={() => setConsents((cs) => cs.filter((_, j) => j !== i))}
                        className="text-[11px] text-ink-muted underline"
                      >
                        Kaldır
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <Section n={5} title="Teşekkür ekranı">
          <Field label="Başlık">
            <input
              value={tyHeadline}
              onChange={(e) => setTyHeadline(e.target.value)}
              maxLength={60}
              disabled={locked}
              className={inputCls}
            />
          </Field>
          <Field label="Mesaj">
            <textarea
              value={tyBody}
              onChange={(e) => setTyBody(e.target.value)}
              maxLength={300}
              rows={2}
              disabled={locked}
              className={inputCls}
            />
          </Field>
          <Field label="Buton">
            <div className="flex flex-wrap gap-2">
              {TESEKKUR_DUGME_TURLERI.map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={locked}
                  onClick={() => dugmeTuruSec(t)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                    tyCtaType === t ? 'border-brand bg-brand/5 text-ink' : 'border-line text-ink-muted hover:bg-surface-sunken'
                  }`}
                >
                  {TESEKKUR_DUGME_ETIKETI[t]}
                </button>
              ))}
            </div>
          </Field>
          {tyCtaType !== 'NONE' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Buton metni">
                <input
                  value={tyCtaText}
                  onChange={(e) => setTyCtaText(e.target.value)}
                  maxLength={40}
                  disabled={locked}
                  className={inputCls}
                />
              </Field>
              {tyCtaType === 'VIEW_WEBSITE' ? (
                <Field label="Buton adresi">
                  <input
                    value={tyCtaUrl}
                    onChange={(e) => setTyCtaUrl(e.target.value)}
                    disabled={locked}
                    placeholder="https://musteri.com"
                    className={inputCls}
                  />
                </Field>
              ) : (
                <Field
                  label="Aranacak numara"
                  hint={
                    telefonOnerisi && tyPhone === telefonOnerisi
                      ? 'Marka Merkezi’ndeki telefondan dolduruldu.'
                      : '+90 ile, boşluksuz: +905321234567'
                  }
                >
                  <input
                    value={tyPhone}
                    onChange={(e) => setTyPhone(e.target.value)}
                    disabled={locked}
                    inputMode="tel"
                    placeholder="+905321234567"
                    className={inputCls}
                  />
                </Field>
              )}
            </div>
          )}
        </Section>

        {plan && (
          /**
           * SÜRÜM ONAYI — kaydetmeden önce.
           *
           * Kullanıcı "Düzenle"ye bastı ama olacak şey düzenleme değil: Meta'da
           * yeni bir form oluşacak. Bunu onaylamadan hiçbir şey yazılmıyor.
           */
          <div className="rounded-xl border border-warn/30 bg-warn-soft p-4">
            <p className="text-sm font-semibold text-warn-strong">
              {plan.nextVersion}. sürüm oluşturulacak
            </p>
            <p className="mt-1 text-xs text-warn-strong">{plan.explanation}</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy !== null}
                className="rounded-lg bg-warn px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {busy === 'save' ? 'Oluşturuluyor…' : 'Yeni sürüm oluştur'}
              </button>
              <button
                type="button"
                onClick={() => setPlan(null)}
                className="rounded-lg border border-warn/30 px-3 py-1.5 text-xs font-medium text-warn-strong"
              >
                Vazgeç
              </button>
            </div>
          </div>
        )}

        {warnings.length > 0 && !plan && (
          <ul className="space-y-1 rounded-xl bg-surface-sunken px-4 py-3 text-xs text-ink-muted">
            {warnings.map((w, i) => (
              <li key={i}>· {w}</li>
            ))}
          </ul>
        )}

        {error && (
          <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-strong ring-1 ring-inset ring-danger/30">
            {error}
          </p>
        )}

        {!plan && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy !== null || !name || !pageId}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy === 'save' || busy === 'plan' ? 'Kaydediliyor…' : 'Kaydet'}
            </button>

            {formId && !locked && canPublish && (
              <button
                type="button"
                onClick={() => void publish()}
                disabled={busy !== null}
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-surface-sunken disabled:opacity-40"
              >
                {busy === 'publish' ? 'Yayınlanıyor…' : "Meta'da yayınla"}
              </button>
            )}

            {formId && !locked && canPublish && (
              // YAYININ GERİ DÖNÜŞÜ OLMADIĞI BUTONUN YANINDA YAZIYOR.
              <span className="text-[11px] text-ink-muted">
                Yayınlandıktan sonra içeriği değiştirilemez.
              </span>
            )}
          </div>
        )}
      </div>

      {/* CANLI ÖNİZLEME — rehberin "Önizle" penceresiyle AYNI bileşen. */}
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <FormOnizleme
          onizleme={kayittanOnizleme({
            name,
            headline,
            intro,
            prefillQuestions: prefill,
            customQuestions: custom.filter((q) => q.label.trim() || q.options.length > 0),
            privacyPolicyUrl: privacyUrl,
            privacyPolicyLinkText: privacyText,
            consentBoxes: consents,
            thankYouHeadline: tyHeadline,
            thankYouBody: tyBody,
            thankYouCtaText: tyCtaText,
            thankYouCtaUrl: tyCtaUrl,
            thankYouCtaType: tyCtaType,
            thankYouPhone: tyPhone,
            status,
          })}
        />
      </aside>
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand disabled:bg-surface-sunken disabled:text-ink-muted';

function Section({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-sunken text-[11px] text-ink-muted">
          {n}
        </span>
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-ink-muted">{hint}</span>}
    </label>
  );
}
