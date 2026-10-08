import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ═══ ÖNCEKİ DEPLOY'UN db:rls'İ SONRAKİ TABLOLARI BİLMİYORDU ═══
 *
 * Üretim sırası testleri (`*-uretim-sirasi.spec.ts`) önceki deploy'un
 * hâlini kurmak için BUGÜNKÜ `02_rls.sql`i koşuyor. Bugünkü dosya, sınanan
 * migration'dan SONRA eklenen tabloları da adıyla anıyor ve o tablolar o
 * anda yok: test "relation does not exist" ile düşüyor. Okuma API tablosu
 * eklenince iki AdvStrategy testi tam böyle kırıldı — sınadıkları şeyle
 * hiçbir ilgisi olmadan.
 *
 * Çare GENEL: sonraki migration'ların `CREATE TABLE` ettiği her tablonun
 * RLS dizisindeki satırı ve `CREATE POLICY ... ON <tablo>` deyimleri
 * önceki hâlden çıkarılıyor. Her yeni tabloda testleri elle yamamak
 * gerekmesin diye; çıkarılan bir şey bulunamazsa sessiz değil, çağıran
 * `bulunamayan`a bakıp patlayabilir.
 */
export function sonrakiTablolar(migrationKoku: string, sonrakiler: string[]): string[] {
  const tablolar: string[] = [];
  for (const d of sonrakiler) {
    const sql = readFileSync(join(migrationKoku, d, 'migration.sql'), 'utf8');
    for (const m of sql.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?"?(\w+)"?/gi)) tablolar.push(m[1]!);
  }
  return tablolar;
}

export function tablolarsizRls(rls: string, tablolar: string[]): { sql: string; bulunamayan: string[] } {
  let s = rls;
  const bulunamayan: string[] = [];
  for (const t of tablolar) {
    const dizi = new RegExp(`^\\s*'${t}',?[ \\t]*\\n`, 'm');
    const politika = new RegExp(`CREATE POLICY \\w+ ON ${t}\\b[\\s\\S]*?;`, 'g');
    if (!dizi.test(s)) bulunamayan.push(t);
    s = s.replace(dizi, '').replace(politika, '');
  }
  return { sql: s, bulunamayan };
}
