const TR_MAP: Record<string, string> = {
  ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', İ: 'i',
  ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u',
};

/**
 * Türkçe karakterleri de doğru çeviren slug üretimi.
 *
 * `String.normalize('NFD')` Türkçe 'ı' ve 'İ' için doğru sonuç vermez,
 * bu yüzden açık bir eşleme tablosu kullanıyoruz.
 */
export function slugify(input: string, maxLength = 60): string {
  return input
    .split('')
    .map((ch) => TR_MAP[ch] ?? ch)
    .join('')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength);
}

/**
 * Çakışma durumunda sonuna sayı ekleyerek benzersiz slug üretir.
 * `exists` fonksiyonu, adayın kullanımda olup olmadığını sorgulamalıdır.
 */
export async function uniqueSlug(
  base: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base) || 'kayit';
  if (!(await exists(root))) return root;

  for (let i = 2; i <= 99; i++) {
    const candidate = `${root.slice(0, 56)}-${i}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${root.slice(0, 52)}-${Date.now().toString(36)}`;
}
