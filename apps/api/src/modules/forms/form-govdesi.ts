import { derleForm, tesekkurDugmesiTuru, type FormDerlemeSonucu, type FormSablonu, type FormTesekkurDugmesi, type LeadFormRecord } from '@advetics/shared';

/**
 * KÜTÜPHANE FORMU → TEK FORM ÜRETİCİSİ (`derleForm`, shared).
 *
 * Bu dosya gövde KURMAZ, yalnız kaydı derleyicinin diline çevirir: bir
 * alanın Meta'da nasıl yazılacağı (onay kutusu biçimi, dil, niyet adımı)
 * derleyicinin kararı. Önceden sağlayıcı kendi gövdesini kuruyordu ve
 * derleyiciden ayrışmıştı (`form.ts` başlığı).
 *
 * Özel soru anahtarları SIRADAN üretiliyor (`soru_1`...): kütüphane kaydında
 * anahtar yok ve Meta lead'in cevabını bu anahtarla döndürüyor. Yayınlanmış
 * form değişmediği için sıra da değişmiyor.
 */
export function kutuphaneFormuGovdesi(form: LeadFormRecord, sayfaPlatformId: string): FormDerlemeSonucu {
  const tur = tesekkurDugmesiTuru(form);
  const dugme: FormTesekkurDugmesi =
    tur === 'CALL_BUSINESS'
      ? { tur, metin: form.thankYouCtaText || 'Bizi ara', telefon: form.thankYouPhone ?? '' }
      : tur === 'VIEW_WEBSITE'
        ? { tur, metin: form.thankYouCtaText || 'Siteyi ziyaret et', adres: form.thankYouCtaUrl ?? '' }
        : { tur: 'NONE' };
  const sablon: FormSablonu = {
    surum: form.version,
    ad: form.name,
    sorular: [
      ...form.prefillQuestions.map((kod) => ({ tur: 'standart' as const, kod })),
      ...form.customQuestions.map((q, i) => ({
        tur: 'ozel' as const,
        anahtar: `soru_${i + 1}`,
        etiket: q.label,
        ...(q.type === 'multiple_choice' ? { secenekler: q.options } : {}),
      })),
    ],
    // Kütüphanede hukuki sebep alanı yok; derleyici FRM-07'yi bu yolda
    // kapatıyor (`hukukiSebepZorunlu: false`), sebep UYDURULMUYOR.
    hukukiSebep: null,
    pazarlamaIzniMetni: null,
    onayKutulari: form.consentBoxes.map((k) => ({ metin: k.text, zorunlu: k.required })),
    kaliteOdakli: form.formType === 'higher_intent',
    smsDogrulama: false,
    giris:
      form.headline || form.intro
        ? { baslik: form.headline ?? '', aciklama: form.intro, stil: form.formType === 'rich_form' ? 'PARAGRAPH_STYLE' : 'LIST_STYLE' }
        : null,
    tesekkur: { baslik: form.thankYouHeadline, govde: form.thankYouBody, dugme },
  };
  return derleForm(
    sablon,
    { workspaceKisaAdi: form.name, aydinlatmaAdresi: form.privacyPolicyUrl, aydinlatmaBaglantiMetni: form.privacyPolicyLinkText },
    sayfaPlatformId,
    { hukukiSebepZorunlu: false },
  );
}
