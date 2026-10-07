import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ `clients.special_ad_categories`E KİM YAZIYOR ═══
 *
 * Özel kategori bir YASAL BEYAN ve Pilot onu beyan iziyle
 * (`ozel_kategori_beyan_*`) birlikte okuyor. İzsiz yazan ikinci bir yol
 * doğarsa ya "sorulmadı" bir workspace'te liste dolar ya da eski beyan
 * zamanı yeni listeye ait görünür — ikisi de sessiz. Bu tarama apps/api
 * altında kolona yazan HER yeri listeler; liste yalnız aşağıdakiler olabilir.
 *
 * İKİ YAZICI VAR, bilerek:
 *   · `pilot/beyan.service.ts` — Veri adımının ucu (asıl yol).
 *   · `tenancy/clients.service.ts` — eski Şirketler penceresinin
 *     güncellemesi. Bugün panelde kullanılıyor; kaldırmak bir ürün kararı
 *     (devir notu). Şartı: aynı yazımda beyan izini de yazmak (aşağıda).
 *     Oluşturma yolu kategori yazar ama İZ YAZMAZ: varsayılan boş liste bir
 *     kişinin "hiçbiri" demesi değil.
 */
const KOK = join(__dirname, '../..');
const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function dosyalar(dizin: string): string[] {
  return (readdirSync(dizin, { recursive: true }) as string[])
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    .map((f) => join(dizin, f));
}

/** SQL atama (`special_ad_categories = …`) ya da Prisma `client.create/update` verisinde alan. */
function yazanMi(kaynak: string): boolean {
  if (/special_ad_categories\s*=(?!=)/.test(kaynak)) return true;
  if (/INSERT\s+INTO\s+"?clients"?[^;`]*special_ad_categories/i.test(kaynak)) return true;
  return /\.client\.(create|update|upsert|updateMany|createMany)\(/.test(kaynak) && /\bspecialAdCategories\s*:/.test(kaynak);
}

describe('özel kategori yazıcıları', () => {
  const yazanlar = dosyalar(KOK)
    .filter((f) => yazanMi(yorumsuz(readFileSync(f, 'utf8'))))
    .map((f) => relative(KOK, f))
    .sort();

  it('BOŞA DÜŞME BEKÇİSİ: tarama dosya okudu ve beyan servisini buldu', () => {
    if (!yazanlar.includes('modules/pilot/beyan.service.ts')) throw new Error('Beyan servisi taramada bulunamadı — desen boşa düşüyor');
  });

  it('KRİTİK: kolona yalnız beyan servisi ve eski Şirketler güncellemesi yazıyor', () => {
    expect(yazanlar).toEqual(['modules/pilot/beyan.service.ts', 'modules/tenancy/clients.service.ts']);
  });

  it('KRİTİK: her yazıcı beyan izini AYNI yerde yazıyor', () => {
    const beyan = yorumsuz(readFileSync(join(KOK, 'modules/pilot/beyan.service.ts'), 'utf8'));
    expect(beyan).toMatch(/special_ad_categories = [^,]+, ozel_kategori_beyan_zamani = now\(\),\s*ozel_kategori_beyan_eden =/);
    const eski = yorumsuz(readFileSync(join(KOK, 'modules/tenancy/clients.service.ts'), 'utf8'));
    const i = eski.indexOf('specialAdCategories: input.specialAdCategories,\n');
    const guncelleme = eski.indexOf('specialAdCategories: input.specialAdCategories,', eski.indexOf('async update('));
    if (i < 0 || guncelleme < 0) throw new Error('clients.service yazım satırı bulunamadı');
    const blok = eski.slice(guncelleme, eski.indexOf('}', guncelleme));
    expect(blok).toContain('ozelKategoriBeyanZamani: new Date()');
    expect(blok).toContain('ozelKategoriBeyanEden: ctx.userId');
  });
});
