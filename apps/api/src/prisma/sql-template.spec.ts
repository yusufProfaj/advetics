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

/**
 * ŞABLON ERKEN KAPANDI MI?
 *
 * `offendingLines` yalnızca `--` satırlarına bakıyor ve BU YETMİYOR: aynı
 * hataya `/* *\/` blok yorumuyla ve sorgunun üstündeki JSDoc'la da düşülüyor
 * — ikisi de aynı şablonun İÇİNDE. Tek oturumda üç kez oldu ve tarama üçünü
 * de kaçırdı, çünkü hiçbiri `--` ile başlamıyordu.
 *
 * BU DEDEKTÖR YORUM BİÇİMİNE HİÇ BAKMIYOR. Doğru sinyal daha genel: bir
 * `Prisma.sql` şablonu kapandıktan SONRA gelen ilk anlamlı karakter `)`, `,`
 * ya da `;` olmak zorunda. Şablon ortasından kapandıysa oradan itibaren SQL
 * metni JavaScript olarak okunuyor ve o karakter SQL'in bir parçası oluyor.
 *
 * Böylece ters tırnağın hangi yorum türünde olduğu ÖNEMSİZ hâle geliyor.
 */
export function erkenKapananSablonlar(source: string): number[] {
  const bad: number[] = [];
  const ACIL = 'Prisma.sql`';
  let i = source.indexOf(ACIL);
  while (i !== -1) {
    const kapanis = yorumIcinde(source, i) ? -1 : sablonSonu(source, i + ACIL.length);
    if (kapanis !== -1) {
      if (sqlGibiDevam(source.slice(kapanis + 1))) {
        bad.push(source.slice(0, kapanis).split('\n').length);
      }
      i = source.indexOf(ACIL, kapanis + 1);
    } else {
      i = source.indexOf(ACIL, i + ACIL.length);
    }
  }
  return bad;
}

/**
 * Şablon kapandıktan sonra gelen metin SQL'in DEVAMI gibi mi görünüyor?
 *
 * İlk denemem "sonrası `)`, `,` ya da `;` olmalı" idi ve on dört yanlış alarm
 * verdi: bu kod tabanında `kosul ? Prisma.sql`…` : Prisma.empty` deseni her
 * yerde. Ayırt eden şey daha dar: şablon ortasından kapandığında geriye kalan
 * SQL METNİ oluyor ve o bir HARFLE ya da tırnakla başlıyor. JavaScript'te bir
 * template literal'den sonra harf gelen tek meşru durum `as`/`satisfies`.
 */
function sqlGibiDevam(sonrasi: string): boolean {
  const t = sonrasi.trimStart();
  if (t.length === 0) return false;
  if (/^(as|satisfies)\b/.test(t)) return false;
  return /^["'\w]/.test(t);
}

/**
 * Açılış bir TypeScript YORUMUNUN içinde mi?
 *
 * JSDoc'ta `Prisma.sql` tuzağından bahseden satırlar var ve onlar birer açılış
 * DEĞİL. Yorumu tespit etmek için satırın başına bakmak yetiyor: bu kod
 * tabanında blok yorumları hep `*` ile hizalı.
 */
function yorumIcinde(source: string, i: number): boolean {
  const satirBasi = source.lastIndexOf('\n', i) + 1;
  return /^\s*(\*|\/\/|\/\*)/.test(source.slice(satirBasi, i));
}

/**
 * Şablonun kapanış ters tırnağının konumu — `${…}` bölgeleri ATLANARAK.
 *
 * İlk yazımda "açılıştan sonraki ilk ters tırnak" diyordum ve otuz yanlış
 * alarm verdi: bu kod tabanında `${Prisma.sql`…`}` iç içe geçiyor ve iç
 * şablonun açılışı dış şablonun kapanışı sanılıyordu. Yanlış alarm veren bir
 * dedektör, kapatılan bir dedektördür.
 */
function sablonSonu(source: string, basla: number): number {
  for (let k = basla; k < source.length; k++) {
    const c = source[k];
    if (c === '\\') {
      k++;
      continue;
    }
    if (c === '`') return k;
    if (c === '$' && source[k + 1] === '{') {
      let derinlik = 1;
      k += 2;
      while (k < source.length && derinlik > 0) {
        if (source[k] === '{') derinlik++;
        else if (source[k] === '}') derinlik--;
        else if (source[k] === '`') {
          // İç şablonu bütünüyle atla — kendi `${…}`leriyle birlikte.
          const ic = sablonSonu(source, k + 1);
          if (ic === -1) return -1;
          k = ic;
        }
        k++;
      }
      k--;
    }
  }
  return -1;
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

  it('KRİTİK: hiçbir Prisma.sql şablonu ortasından kapanmıyor', () => {
    /*
     * YORUM BİÇİMİNDEN BAĞIMSIZ KONTROL. Yukarıdaki tarama yalnızca `--`
     * satırlarını görüyor; blok yorumu ve JSDoc de aynı şablonun içinde
     * olabiliyor ve aynı hatayı üretiyor.
     */
    const problems: string[] = [];
    for (const file of tsFiles(SRC)) {
      const source = readFileSync(file, 'utf8');
      if (!source.includes('Prisma.sql`')) continue;
      for (const line of erkenKapananSablonlar(source)) {
        problems.push(`${relative(SRC, file)}:${line}`);
      }
    }
    expect(
      problems,
      'Prisma.sql şablonu beklenenden erken kapanıyor — içindeki bir yorumda ' +
        'ters tırnak var (yorum `--`, /* */ ya da JSDoc olabilir)',
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

    it('erken kapanmayı yorum biçiminden bağımsız yakalar', () => {
      const blok = 'Prisma.sql`SELECT 1 /* bkz. ' + '`' + 'kolon' + '`' + ' */ FROM t`';
      expect(erkenKapananSablonlar(blok)).toHaveLength(1);
    });

    it('düzgün kapanan şablonu geçirir', () => {
      expect(erkenKapananSablonlar('Prisma.sql`SELECT 1 FROM t`)')).toEqual([]);
      expect(erkenKapananSablonlar('Prisma.sql`SELECT 1`,')).toEqual([]);
      expect(erkenKapananSablonlar('const q = Prisma.sql`SELECT 1`;')).toEqual([]);
      // Bu kod tabanının her yerinde olan desen — yanlış alarm vermemeli.
      expect(erkenKapananSablonlar('x ? Prisma.sql`SELECT 1` : Prisma.empty;')).toEqual([]);
      expect(erkenKapananSablonlar('const p = [Prisma.sql`SELECT 1`];')).toEqual([]);
    });

    it('JSDoc içinde geçen `Prisma.sql` bir açılış sayılmıyor', () => {
      expect(erkenKapananSablonlar('   * bkz. Prisma.sql`` tuzağı\n   */')).toEqual([]);
    });

    it('iç içe şablonu dış şablonun kapanışı sanmıyor', () => {
      const ic = 'Prisma.sql`SELECT ${cond ? Prisma.sql`a` : Prisma.sql`b`} FROM t`)';
      expect(erkenKapananSablonlar(ic)).toEqual([]);
    });

    it('tire ile başlayan ama yorum olmayan satırı kapsamaz', () => {
      // `--x` bir SQL yorumu değil (boşluk gerekli).
      expect(offendingLines('  --x `y`')).toEqual([]);
    });
  });
});
