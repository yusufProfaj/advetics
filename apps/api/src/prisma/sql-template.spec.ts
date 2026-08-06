import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * SQL yorumlarında TERS TIRNAK avcısı.
 *
 * NEDEN BU TEST VAR: bu hatayı İKİ KEZ yaptım. `Prisma.sql` etiketli bir
 * template literal ve içine `-- \`kolon_adi\` notu` biçiminde bir SQL yorumu
 * yazmak template'i ortasında KAPATIYOR. Kalan SQL metni JavaScript kodu
 * olarak ayrıştırılmaya çalışılıyor ve hata şu oluyor:
 *
 *     error TS1005: ';' expected.
 *
 * Satır numarası şablonun içini gösteriyor; insan orada geçerli SQL görüp
 * kafası karışıyor. Derleyici yakalıyor ama MESAJI sebebi hiç anlatmıyor.
 *
 * DEDEKTÖRÜN İLK HÂLİ YANLIŞTI ve sebebi öğretici: şablonun içine bakıp ters
 * tırnak aramak işe yaramıyor, çünkü template ilk ters tırnakta kapanıyor ve
 * KESİLMİŞ ŞABLONUN KENDİSİ GEÇERLİ görünüyor. Hata, şablonun içinde değil
 * ondan sonrasında ortaya çıkıyor.
 *
 * Doğru sinyal daha basit: SQL yorum satırı (`--` ile başlayan) içinde ters
 * tırnak. SQL yorumları yalnızca SQL şablonlarının içinde bulunuyor, dolayısıyla
 * yanlış alarm oranı çok düşük. TypeScript yorumları `//` ya da ` * ` ile
 * başladığı için kapsam dışında kalıyor.
 */

const SRC = join(__dirname, '..');

/** SQL yorum satırında ters tırnak: `-- ... ` ... ` */
const SQL_COMMENT_WITH_BACKTICK = /^\s*--\s.*`/;

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      tsFiles(full, out);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

export function offendingLines(source: string): number[] {
  const bad: number[] = [];
  source.split('\n').forEach((line, i) => {
    if (SQL_COMMENT_WITH_BACKTICK.test(line)) bad.push(i + 1);
  });
  return bad;
}

describe('SQL yorumlarında ters tırnak', () => {
  it('kaynak dosyalarda yok', () => {
    const problems: string[] = [];

    for (const file of tsFiles(SRC)) {
      const source = readFileSync(file, 'utf8');
      // Yalnızca SQL şablonu olan dosyalar; diğerlerinde `--` ile başlayan bir
      // satır SQL yorumu olmayabilir.
      if (!source.includes('Prisma.sql`')) continue;

      for (const line of offendingLines(source)) {
        problems.push(`${relative(SRC, file)}:${line}`);
      }
    }

    expect(
      problems,
      'SQL yorumunda ters tırnak var — kolon adını ters tırnakla sarmayın, ' +
        'template literal orada kapanıyor ve hata "TS1005: ; expected" olarak çıkıyor',
    ).toEqual([]);
  });

  describe('dedektörün kendisi', () => {
    // Kendi kontrolünü doğrulamayan bir dedektör, olmayan bir dedektördür.
    it('SQL yorumundaki ters tırnağı yakalar', () => {
      expect(offendingLines('  -- `kolon_adi` boş olabilir')).toEqual([1]);
      expect(offendingLines('SELECT 1\n  -- bkz. `raw_metrics`\nFROM t')).toEqual([2]);
    });

    it('ters tırnaksız SQL yorumunu geçirir', () => {
      expect(offendingLines('  -- kolon_adi boş olabilir')).toEqual([]);
    });

    it('TypeScript yorumlarını KAPSAMAZ', () => {
      // Bunlar template literal içinde değil; ters tırnak orada güvenli.
      expect(offendingLines('  // `kolon` güvenli')).toEqual([]);
      expect(offendingLines('   * `kolon` JSDoc içinde güvenli')).toEqual([]);
      expect(offendingLines('  /** `kolon` */')).toEqual([]);
    });

    it('tire ile başlayan ama yorum olmayan satırı kapsamaz', () => {
      // `--x` bir SQL yorumu değil (boşluk gerekli).
      expect(offendingLines('  --x `y`')).toEqual([]);
    });
  });
});
