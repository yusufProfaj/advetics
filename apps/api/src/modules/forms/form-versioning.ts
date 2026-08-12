import type { EditPlan, LeadFormInput, LeadFormRecord, LeadFormStatus } from '@advetics/shared';

/**
 * Form sürümleme — SAF fonksiyonlar.
 *
 * Meta'da yayınlanmış bir form düzenlenemiyor. Bu dosya "düzenleme" isteğinin
 * ne anlama geldiğini karara bağlıyor: üzerine yazmak mı, yeni sürüm mü.
 *
 * Karar mantığının saf olması önemli çünkü YANLIŞ KARAR SESSİZ. Yayınlanmış
 * bir formu üzerine yazmaya çalışırsak Meta reddediyor ve kullanıcı formu
 * güncellediğini sanıyor; yeni sürüm gerekmezken oluşturursak Meta'da gereksiz
 * form birikiyor ve hangisinin canlı olduğu karışıyor.
 */

/**
 * ALANLAR İKİYE AYRILIYOR.
 *
 * `name` yalnızca panelde görünüyor — müşteri onu hiç görmüyor ve Meta'ya da
 * gitmiyor. Bir formun adını düzeltmek için yeni sürüm oluşturmak, Meta'da
 * çöp form biriktirmek olurdu.
 *
 * Geri kalan her şey MÜŞTERİYE GÖSTERİLEN içerik ve onay metninin parçası;
 * değişmesi yeni sürüm gerektiriyor.
 */
const LOCAL_ONLY_FIELDS = new Set<keyof LeadFormInput>(['name']);

/** Formun içeriğini belirleyen alanlar — hash'lenip karşılaştırılıyor. */
export function contentFields(input: LeadFormInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (LOCAL_ONLY_FIELDS.has(key as keyof LeadFormInput)) continue;
    out[key] = value;
  }
  return out;
}

/** İki girdi MÜŞTERİYE GÖRÜNEN açıdan aynı mı. */
export function contentEquals(a: LeadFormInput, b: LeadFormInput): boolean {
  return JSON.stringify(sortDeep(contentFields(a))) === JSON.stringify(sortDeep(contentFields(b)));
}

/**
 * Nesne anahtarlarını sıralar — karşılaştırma anahtar sırasına duyarlı olmasın.
 *
 * `JSON.stringify` anahtarları ekleme sırasında yazıyor ve iki eşdeğer nesne
 * farklı sıralarda gelirse eşit sayılmazlar. O durumda her kaydetme yeni bir
 * sürüm üretirdi — kullanıcı hiçbir şey değiştirmemiş olsa bile.
 */
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortDeep(v)]),
    );
  }
  return value;
}

/**
 * Düzenleme planı — KAYDETMEDEN ÖNCE.
 *
 * Arayüz bunu gösteriyor. "Düzenle"ye basıp sonra "yeni sürüm oluşturuldu"
 * mesajıyla karşılaşmak, kullanıcının istemediği bir şeyi yapmış olması demek.
 */
export function planEdit(
  current: { status: LeadFormStatus; version: number },
  currentInput: LeadFormInput,
  nextInput: LeadFormInput,
): EditPlan {
  // 1. HİÇBİR ŞEY DEĞİŞMEDİYSE hiçbir şey yapma.
  //
  //    Kullanıcı formu açıp kapatmış olabilir. Değişiklik yokken yeni sürüm
  //    oluşturmak, Meta'da aynı içerikli iki form bırakmak demek.
  if (contentEquals(currentInput, nextInput)) {
    const onlyName = currentInput.name !== nextInput.name;
    return {
      inPlace: true,
      nextVersion: null,
      explanation: onlyName
        ? 'Yalnızca form adı değişiyor. Ad panelde görünüyor, müşteriye gitmiyor — yeni sürüm gerekmiyor.'
        : 'İçerikte değişiklik yok.',
      affectsLiveAds: false,
    };
  }

  // 2. TASLAK doğrudan güncellenebiliyor — Meta'da henüz karşılığı yok.
  if (current.status === 'draft' || current.status === 'failed') {
    return {
      inPlace: true,
      nextVersion: null,
      explanation: 'Form henüz yayınlanmadı, doğrudan güncelleniyor.',
      affectsLiveAds: false,
    };
  }

  // 3. YAYINLANMIŞ form → YENİ SÜRÜM.
  return {
    inPlace: false,
    nextVersion: current.version + 1,
    explanation:
      `Yayınlanmış bir form Meta'da değiştirilemiyor — kullanıcılar mevcut metni ` +
      `onaylayarak veri verdi. Bunun yerine ${current.version + 1}. sürüm oluşturulacak; ` +
      `eski form topladığı bilgilerle birlikte duracak.`,
    /**
     * YAYINDAKİ REKLAMLARI ETKİLEMİYOR ve bu en kolay gözden kaçan nokta.
     *
     * Meta'da çalışan bir reklamın kreatifindeki form kimliği değiştirilemiyor;
     * yeni formu kullanmak için yeni bir reklam gerekiyor. Bunu söylemezsek
     * kullanıcı "düzenledim ama değişmedi" diye düşünür ve haklı olur.
     */
    affectsLiveAds: false,
  };
}

/**
 * Bir formun yayınlanabilir olup olmadığı.
 *
 * Yayın Meta'da kalıcı bir kayıt oluşturuyor ve geri alınamıyor (form
 * silinebiliyor ama topladığı lead'lerle birlikte). Engelleyiciler bu yüzden
 * yayın anında değil, formu yazarken gösteriliyor.
 */
export function publishBlockers(form: LeadFormRecord): string[] {
  const blockers: string[] = [];

  if (form.status === 'published') blockers.push('Bu form zaten yayında.');
  if (form.status === 'superseded') {
    blockers.push('Bu formun daha yeni bir sürümü var; onu yayınla.');
  }
  if (form.prefillQuestions.length === 0) {
    blockers.push('En az bir soru gerekiyor — soru olmadan form bilgi toplayamaz.');
  }
  if (!form.privacyPolicyUrl) {
    // Meta bunu kendisi de reddediyor ama hatayı yayın anında almak geç:
    // kullanıcı her şeyi doldurmuş ve bekliyor.
    blockers.push('Gizlilik politikası adresi zorunlu.');
  }

  return blockers;
}

/**
 * Engellemeyen ama söylenmesi gereken şeyler.
 *
 * Uyarı ile engelleyiciyi ayırmak önemli: "telefon sorusu yok" bir hata değil,
 * ajansın bilerek verdiği bir karar olabilir. Yayını durdurmak fazla olurdu.
 */
export function publishWarnings(form: LeadFormRecord): string[] {
  const warnings: string[] = [];

  if (!form.prefillQuestions.includes('PHONE')) {
    warnings.push(
      'Telefon sorusu yok. Türkiye’de inşaat ve sağlık müşterilerinde geri dönüşün ' +
        'neredeyse tamamı telefonla oluyor.',
    );
  }

  if (form.consentBoxes.length === 0) {
    // KVKK hukuki bir gereklilik ve yalnızca gizlilik linki vermek Türkiye'de
    // açık rıza sayılmıyor. Yine de engellemiyoruz: bu ajansın ve müşterinin
    // hukuk kararı, bizim değil.
    warnings.push(
      'KVKK açık rıza onayı eklenmemiş. Gizlilik politikası linki tek başına ' +
        'açık rıza yerine geçmiyor.',
    );
  }

  const requiredBoxes = form.consentBoxes.filter((c) => c.required).length;
  if (requiredBoxes >= 3) {
    warnings.push(
      `${requiredBoxes} zorunlu onay kutusu var. Her zorunlu kutu formu tamamlayan ` +
        'kişi sayısını düşürüyor.',
    );
  }

  if (form.customQuestions.length >= 4) {
    warnings.push(
      `${form.customQuestions.length} özel soru var. Ön doldurulan sorular tek tıkla ` +
        'onaylanıyor, özel sorular yazmak gerektiriyor ve her biri tamamlanma oranını düşürüyor.',
    );
  }

  if (form.formType === 'higher_intent') {
    warnings.push(
      'Nitelikli form seçildi: onay adımı ekleniyor, form sayısı düşüyor ama ' +
        'gelen kişiler daha ciddi oluyor.',
    );
  }

  return warnings;
}
