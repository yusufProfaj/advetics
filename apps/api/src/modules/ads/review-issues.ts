import type { AdReviewIssue } from '@advetics/shared';

/**
 * Reddedilme sebeplerini ortak şekle çevirir.
 *
 * Meta ve Google bu bilgiyi TAMAMEN farklı yapılarda veriyor ve ikisi de
 * sözleşmesiz: alan adları sürüme göre değişiyor, bazen dizi bazen nesne
 * geliyor. Bu yüzden çözümleyici SAVUNMACI — beklenmeyen şekilde çökmek yerine
 * boş dizi döndürüyor.
 *
 * Neden normalize ediyoruz: arayüzün "hangi platform" bilmesi gerekmemeli.
 * Ads Explorer'da bir reklam kartı Meta'dan da Google'dan da gelebilir ve
 * reddedilme sebebi aynı yerde aynı biçimde görünmeli.
 *
 * ŞEKİLLER (canlı yanıtlardan ve dokümandan):
 *
 * Meta `ad_review_feedback`:
 *   { global: { "Politika Adı": "açıklama", ... } }
 *   { placement_specific: { instagram: { "...": "..." } } }
 *   Anahtar politika adı, değer açıklama. İç içe olabiliyor.
 *
 * Google `policy_topic_entries`:
 *   [{ topic: "ALCOHOL", type: "PROHIBITED",
 *      evidences: [{ textList: { texts: ["..."] } }] }]
 */

/** Tek bir değerden okunabilir metin çıkarır. */
function textOf(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Meta'nın iç içe geçmiş geri bildirim nesnesini düzleştirir.
 *
 * `depth` sınırı var: platformun beklenmedik derinlikte bir yapı göndermesi
 * sonsuz özyinelemeye yol açabilir ve bu, bir reklam listesini görüntülemenin
 * API sürecini düşürmesi demek olurdu.
 */
function flattenMeta(
  value: unknown,
  path: string[] = [],
  depth = 0,
  out: AdReviewIssue[] = [],
): AdReviewIssue[] {
  if (depth > 4 || out.length >= 25) return out;

  if (Array.isArray(value)) {
    for (const item of value) flattenMeta(item, path, depth + 1, out);
    return out;
  }

  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      // `global` ve `placement_specific` yapısal anahtarlar, politika adı
      // değil — başlığa katmak "global: Alkol" gibi anlamsız metin üretir.
      const structural = key === 'global' || key === 'placement_specific';
      const nextPath = structural ? path : [...path, key];

      const text = textOf(child);
      if (text) {
        out.push({ topic: nextPath.join(' · ') || key, detail: text });
      } else {
        flattenMeta(child, nextPath, depth + 1, out);
      }
      if (out.length >= 25) break;
    }
    return out;
  }

  const text = textOf(value);
  if (text && path.length > 0) out.push({ topic: path.join(' · '), detail: text });
  return out;
}

/** Google'ın `policy_topic_entries` dizisini çözer. */
function parseGoogle(entries: unknown): AdReviewIssue[] {
  if (!Array.isArray(entries)) return [];
  const out: AdReviewIssue[] = [];

  for (const entry of entries.slice(0, 25)) {
    if (!isRecord(entry)) continue;
    const topic = textOf(entry.topic) ?? textOf(entry.policyTopicEntryType) ?? 'Politika';
    const type = textOf(entry.type);

    // Kanıt metinleri `evidences[].textList.texts[]` içinde gömülü.
    const details: string[] = [];
    const evidences = entry.evidences;
    if (Array.isArray(evidences)) {
      for (const ev of evidences) {
        if (!isRecord(ev)) continue;
        const textList = isRecord(ev.textList) ? ev.textList.texts : undefined;
        if (Array.isArray(textList)) {
          for (const t of textList) {
            const text = textOf(t);
            if (text) details.push(text);
          }
        }
      }
    }

    out.push({
      topic: type ? `${topic} (${type})` : topic,
      detail: details.length > 0 ? details.join(' · ') : null,
    });
  }

  return out;
}

/**
 * Platform bazında çözümler.
 *
 * Google'da reddedilme bilgisi `policy_topic_entries`, Meta'da serbest biçimli
 * bir nesne. `disapprovalReasons` kolonunda ikisi de ham hâliyle duruyor.
 */
export function parseReviewIssues(platform: 'meta' | 'google', raw: unknown): AdReviewIssue[] {
  if (raw === null || raw === undefined) return [];

  try {
    if (platform === 'google') {
      // Google satırında ham gövde `policy_topic_entries` dizisinin kendisi ya
      // da onu saran nesne olabiliyor.
      if (Array.isArray(raw)) return parseGoogle(raw);
      if (isRecord(raw)) {
        return parseGoogle(raw.policyTopicEntries ?? raw.policy_topic_entries ?? []);
      }
      return [];
    }
    return flattenMeta(raw);
  } catch {
    // Beklenmeyen şekil bir reklam listesini düşürmemeli.
    return [];
  }
}

/**
 * Reklamın gerçekten bir inceleme sorunu var mı.
 *
 * `reviewStatus` tek başına yetmiyor: Meta'da `WITH_ISSUES` reklamın yayında
 * olduğu ama bir uyarı taşıdığı anlamına da gelebiliyor, `PENDING_REVIEW` ise
 * sorun değil normal akış. Gerçek sorun ya reddedilmiş olmak ya da somut bir
 * geri bildirim taşımak.
 */
export function hasReviewIssue(reviewStatus: string | null, issues: AdReviewIssue[]): boolean {
  if (issues.length > 0) return true;
  if (!reviewStatus) return false;
  const s = reviewStatus.toUpperCase();
  return s === 'DISAPPROVED' || s === 'WITH_ISSUES' || s.includes('DISAPPROVED');
}
