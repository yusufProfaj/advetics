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
import { Dugme } from '@/components/ui/dugme';
import { Kart } from '@/components/ui/kart';
import { Alan, Girdi, MetinAlani, Secim } from '@/components/ui/alan';
import { Serit } from '@/components/ui/hal';
import { Uyari } from '@/components/ui/uyari';
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
          <Uyari ton="tehlike" baslik="Yayın belirsiz: Meta'da form açılmış olabilir.">
            <p>
              Facebook sayfasının formlarında bu adla bir form var mı kontrol et. Varsa yeniden
              yayınlama; Meta formu silmiyor ve ikinci bir form açılır. Yoksa yeniden dene.
            </p>
            {canPublish && formId && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {!yenidenOnay ? (
                  <Dugme ton="ikincil" boyut="kucuk" onClick={() => setYenidenOnay(true)} disabled={busy !== null}>
                    Yeniden dene
                  </Dugme>
                ) : (
                  <>
                    <span className="text-12 font-semibold text-ink">Sayfanın formlarında bu form yok, eminim.</span>
                    <Dugme ton="koyu" boyut="kucuk" onClick={() => void publish(true)} disabled={busy !== null}>
                      {busy === 'publish' ? 'Yayınlanıyor…' : 'Evet, yeniden yayınla'}
                    </Dugme>
                    <Dugme ton="hayalet" boyut="kucuk" onClick={() => setYenidenOnay(false)} disabled={busy !== null}>
                      Vazgeç
                    </Dugme>
                  </>
                )}
              </div>
            )}
          </Uyari>
        )}
        {status === 'publishing' && (
          <Serit ton="uyari" baslik="Form yayınlanıyor.">
            Birkaç dakika sonra sayfayı yenile; yayın yarıda kaldıysa burada yazar.
          </Serit>
        )}
        {locked && !yayinYarim && (
          /**
           * DEĞİŞMEZLİK UYARISI EN ÜSTTE ve formu açar açmaz görünüyor.
           *
           * Aşağıya koymak, kullanıcının alanları doldurup en sonda öğrenmesi
           * demek olurdu.
           */
          <Uyari ton="uyari" baslik="Bu form yayında, içeriği değiştirilemiyor.">
            <p>
              Meta yayınlanmış formu güncellemiyor: bilgilerini bırakan kişiler mevcut onay
              metnini kabul etti. Değişiklik yaparsan yeni bir sürüm oluşturulur. Form adını
              değiştirmek serbest; o yalnızca burada görünüyor.
            </p>
            <p className="mt-1">
              <strong className="text-ink">Yeni sürüm yayındaki reklamları değiştirmez.</strong> Çalışan bir
              reklamın formu Meta'da değiştirilemiyor; yeni formu kullanmak için yeni bir
              reklam gerekiyor.
            </p>
          </Uyari>
        )}

        <Section n={1} title="Form tipi">
          <div className="grid gap-2 sm:grid-cols-3">
            {FORM_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                disabled={locked}
                aria-pressed={formType === t}
                onClick={() => setFormType(t)}
                className={`rounded-alan border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  formType === t ? 'border-brand bg-vurgu' : 'border-line hover:bg-surface-sunken'
                }`}
              >
                <p className="text-14 font-semibold text-ink">{FORM_TYPE_META[t].label}</p>
                <p className="mt-1 text-12 text-ink-muted">{FORM_TYPE_META[t].promise}</p>
                {/* HER SEÇİMİN BEDELİ YAZIYOR. "Daha fazla form" kulağa her
                    zaman iyi geliyor; kullanıcının neyi feda ettiğini bilmesi
                    gerekiyor. */}
                <p className="mt-1 text-12 italic text-ink-muted">
                  {FORM_TYPE_META[t].tradeoff}
                </p>
              </button>
            ))}
          </div>
        </Section>

        <Section n={2} title="Giriş ekranı">
          <Alan etiket="Form adı (yalnızca burada görünür)">
            {(id) => (
              <Girdi
                id={id}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Yaz kampanyası formu"
              />
            )}
          </Alan>
          <Alan etiket="Sayfa">
            {(id) => (
              <Secim id={id} value={pageId} onChange={(e) => setPageId(e.target.value)} disabled={locked}>
                {pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Secim>
            )}
          </Alan>
          <Alan etiket="Başlık" ipucu="Formun üstünde görünen kısa cümle.">
            {(id, aciklamaId) => (
              <Girdi
                id={id}
                aria-describedby={aciklamaId}
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                maxLength={60}
                disabled={locked}
                placeholder="Ücretsiz keşif randevusu"
              />
            )}
          </Alan>
          <Alan etiket="Açıklama">
            {(id) => (
              <MetinAlani
                id={id}
                value={intro}
                onChange={(e) => setIntro(e.target.value)}
                maxLength={1000}
                rows={3}
                disabled={locked}
                placeholder="Formu dolduran herkesi uzman ekibimiz 24 saat içinde arıyor."
              />
            )}
          </Alan>
        </Section>

        <Section n={3} title="Sorular">
          <p className="text-13 text-ink-muted">
            Bu sorular Facebook profilinden <strong className="text-ink">otomatik doluyor</strong>: kişi yazmıyor,
            onaylıyor. Bu yüzden en çok tamamlanan sorular bunlar.
          </p>
          <div role="group" aria-label="Otomatik dolan sorular" className="mt-2 flex flex-wrap gap-2">
            {PREFILL_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={locked}
                aria-pressed={prefill.includes(q)}
                onClick={() => togglePrefill(q)}
                className={hapSinifi(prefill.includes(q))}
              >
                {prefill.includes(q) ? '✓ ' : ''}
                {PREFILL_LABELS[q]}
              </button>
            ))}
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <p className="text-13 font-semibold text-ink">Kendi sorun</p>
              {!locked && custom.length < 5 && (
                <Dugme
                  ton="ikincil"
                  boyut="kucuk"
                  onClick={() =>
                    setCustom((c) => [...c, { type: 'short_answer', label: '', options: [] }])
                  }
                >
                  + Soru ekle
                </Dugme>
              )}
            </div>
            {custom.length === 0 ? (
              <p className="mt-1 text-12 text-ink-muted">
                Her ek soru formu tamamlayan kişi sayısını düşürüyor; bunlar elle
                yazılıyor.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {custom.map((q, i) => (
                  <li key={i} className="rounded-alan border border-line p-2.5">
                    <div className="flex flex-wrap gap-2">
                      <Girdi
                        aria-label={`${i + 1}. soru metni`}
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
                        className="!w-auto min-w-0 flex-1"
                      />
                      <Secim
                        aria-label={`${i + 1}. soru türü`}
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
                        className="!w-40"
                      >
                        <option value="short_answer">Kısa cevap</option>
                        <option value="multiple_choice">Çoktan seçmeli</option>
                      </Secim>
                      {!locked && (
                        <Dugme
                          ton="tehlike"
                          boyut="kucuk"
                          className="self-center"
                          onClick={() => setCustom((c) => c.filter((_, j) => j !== i))}
                        >
                          Sil
                        </Dugme>
                      )}
                    </div>
                    {q.type === 'multiple_choice' && (
                      <Girdi
                        aria-label={`${i + 1}. sorunun seçenekleri`}
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
                        className="mt-2"
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>

        {soruSayisi >= UZUN_FORM_SORU_SAYISI && (
          <Serit ton="uyari" baslik={`${soruSayisi} soru var.`}>
            Uzun form daha az doldurulur.
          </Serit>
        )}

        <Section n={4} title="Gizlilik ve onaylar">
          <Alan
            etiket="Gizlilik politikası adresi"
            ipucu={
              oneri && privacyUrl === oneri.adres
                ? `Önden dolduruldu: ${oneri.kaynak}. Bu form için doğru değilse değiştir.`
                : 'Zorunlu. Meta gizlilik politikası olmayan formu kabul etmiyor; adres https:// ile başlamalı.'
            }
          >
            {(id, aciklamaId) => (
              <Girdi
                id={id}
                aria-describedby={aciklamaId}
                value={privacyUrl}
                onChange={(e) => setPrivacyUrl(e.target.value)}
                disabled={locked}
                placeholder="https://musteri.com/gizlilik"
              />
            )}
          </Alan>
          <Alan etiket="Bağlantı metni">
            {(id) => (
              <Girdi id={id} value={privacyText} onChange={(e) => setPrivacyText(e.target.value)} disabled={locked} />
            )}
          </Alan>

          <div className="mt-3">
            <p className="text-13 font-semibold text-ink">Onay kutuları</p>
            <p className="mt-0.5 text-12 text-ink-muted">
              Türkiye'de açık rıza ayrı bir onay gerektiriyor; gizlilik politikası linki tek
              başına yeterli sayılmıyor.
            </p>
            {!locked && (
              <div className="mt-2 flex flex-wrap gap-2">
                {CONSENT_PRESETS.filter((p) => !consents.some((c) => c.text === p.text)).map(
                  (p) => (
                    <Dugme
                      key={p.key}
                      ton="ikincil"
                      boyut="kucuk"
                      onClick={() =>
                        setConsents((c) => [...c, { text: p.text, required: p.key === 'kvkk' }])
                      }
                    >
                      + {p.label}
                    </Dugme>
                  ),
                )}
              </div>
            )}
            <ul className="mt-2 space-y-2">
              {consents.map((c, i) => (
                <li key={i} className="rounded-alan border border-line p-2.5">
                  <MetinAlani
                    aria-label={`${i + 1}. onay metni`}
                    value={c.text}
                    onChange={(e) =>
                      setConsents((cs) =>
                        cs.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)),
                      )
                    }
                    rows={2}
                    disabled={locked}
                    className="!min-h-0"
                  />
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <label className="flex items-center gap-1.5 text-12 text-ink-muted">
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
                      Zorunlu: işaretlenmeden form gönderilemez
                    </label>
                    {!locked && (
                      <Dugme
                        ton="hayalet"
                        boyut="kucuk"
                        onClick={() => setConsents((cs) => cs.filter((_, j) => j !== i))}
                      >
                        Kaldır
                      </Dugme>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <Section n={5} title="Teşekkür ekranı">
          <Alan etiket="Başlık">
            {(id) => (
              <Girdi
                id={id}
                value={tyHeadline}
                onChange={(e) => setTyHeadline(e.target.value)}
                maxLength={60}
                disabled={locked}
              />
            )}
          </Alan>
          <Alan etiket="Mesaj">
            {(id) => (
              <MetinAlani
                id={id}
                value={tyBody}
                onChange={(e) => setTyBody(e.target.value)}
                maxLength={300}
                rows={2}
                disabled={locked}
              />
            )}
          </Alan>
          <div className="grid gap-1.5">
            <p className="text-13 font-semibold text-ink">Buton</p>
            <div role="group" aria-label="Teşekkür ekranı butonu" className="flex flex-wrap gap-2">
              {TESEKKUR_DUGME_TURLERI.map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={locked}
                  aria-pressed={tyCtaType === t}
                  onClick={() => dugmeTuruSec(t)}
                  className={hapSinifi(tyCtaType === t)}
                >
                  {TESEKKUR_DUGME_ETIKETI[t]}
                </button>
              ))}
            </div>
          </div>
          {tyCtaType !== 'NONE' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Alan etiket="Buton metni">
                {(id) => (
                  <Girdi
                    id={id}
                    value={tyCtaText}
                    onChange={(e) => setTyCtaText(e.target.value)}
                    maxLength={40}
                    disabled={locked}
                  />
                )}
              </Alan>
              {tyCtaType === 'VIEW_WEBSITE' ? (
                <Alan etiket="Buton adresi">
                  {(id) => (
                    <Girdi
                      id={id}
                      value={tyCtaUrl}
                      onChange={(e) => setTyCtaUrl(e.target.value)}
                      disabled={locked}
                      placeholder="https://musteri.com"
                    />
                  )}
                </Alan>
              ) : (
                <Alan
                  etiket="Aranacak numara"
                  ipucu={
                    telefonOnerisi && tyPhone === telefonOnerisi
                      ? 'Marka Merkezi’ndeki telefondan dolduruldu.'
                      : '+90 ile, boşluksuz: +905321234567'
                  }
                >
                  {(id, aciklamaId) => (
                    <Girdi
                      id={id}
                      aria-describedby={aciklamaId}
                      value={tyPhone}
                      onChange={(e) => setTyPhone(e.target.value)}
                      disabled={locked}
                      inputMode="tel"
                      placeholder="+905321234567"
                    />
                  )}
                </Alan>
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
          <Serit
            ton="uyari"
            baslik={`${plan.nextVersion}. sürüm oluşturulacak`}
            eylemler={
              <>
                <Dugme ton="hayalet" boyut="kucuk" onClick={() => setPlan(null)}>
                  Vazgeç
                </Dugme>
                <Dugme boyut="kucuk" onClick={() => void save()} disabled={busy !== null}>
                  {busy === 'save' ? 'Oluşturuluyor…' : 'Yeni sürüm oluştur'}
                </Dugme>
              </>
            }
          >
            {plan.explanation}
          </Serit>
        )}

        {warnings.length > 0 && !plan && (
          <ul className="space-y-1 rounded-alan bg-surface-sunken px-4 py-3 text-12 text-ink-muted">
            {warnings.map((w, i) => (
              <li key={i}>· {w}</li>
            ))}
          </ul>
        )}

        {error && (
          <Serit ton="hata" baslik="İşlem tamamlanamadı">
            {error}
          </Serit>
        )}

        {!plan && (
          <div className="flex flex-wrap items-center gap-2">
            <Dugme onClick={() => void save()} disabled={busy !== null || !name || !pageId}>
              {busy === 'save' || busy === 'plan' ? 'Kaydediliyor…' : 'Kaydet'}
            </Dugme>

            {formId && !locked && canPublish && (
              <Dugme ton="ikincil" onClick={() => void publish()} disabled={busy !== null}>
                {busy === 'publish' ? 'Yayınlanıyor…' : "Meta'da yayınla"}
              </Dugme>
            )}

            {formId && !locked && canPublish && (
              // YAYININ GERİ DÖNÜŞÜ OLMADIĞI BUTONUN YANINDA YAZIYOR.
              <span className="text-12 text-ink-muted">
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

/*
 * SEÇİM HAPI (`HapSecici` görünüşü). Ortak bileşen `disabled` taşımıyor ve
 * yayındaki formda seçimler KİLİTLİ olmalı; kilitsiz bir hap, değiştirilemeyen
 * bir formu değiştirilebilir gösterirdi. O yüzden aynı görünüş yerelde.
 */
function hapSinifi(secili: boolean): string {
  return `inline-flex h-[34px] items-center gap-1.5 rounded-full border px-3.5 text-13 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
    secili ? 'border-brand bg-vurgu text-ink' : 'border-line-strong bg-surface text-ink-muted hover:bg-surface-sunken'
  }`;
}

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
    <Kart
      baslik={
        <span className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-sunken text-11 text-ink-muted">
            {n}
          </span>
          {title}
        </span>
      }
    >
      <div className="space-y-3">{children}</div>
    </Kart>
  );
}
