import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';

/**
 * ═══ `deploy.sh` .env BEKÇİSİ — GERÇEKTEN ÇALIŞTIRILARAK SINANIYOR ═══
 *
 * `deploy.sh` "Derleme" adımında `.env`i shell ile `source` ediyor, yani her
 * DEĞER shell-güvenli olmak zorunda. Tırnaksız bir değerdeki boşluk, shell
 * için değerin bittiği yer: `SMTP_PASS=abcd efgh` satırı `abcd` atamasını
 * yapıp `efgh`yi KOMUT olarak çalıştırıyor.
 *
 * Canlıda oldu; tek iz `./.env: line 97: ncrj: command not found` idi —
 * satır numarası var, anahtar adı yok, ve "ncrj" şifrenin ortasından bir
 * parça olduğu için hiçbir şey ifade etmiyor.
 *
 * BEKÇİ KAYNAKTAN ÇIKARILIP KOŞULUYOR, kopyalanmıyor: burada yeniden yazılan
 * bir regex, `deploy.sh`taki gerçek regex bozulduğunda yeşil kalırdı ve test
 * yalnızca KENDİNİ doğrulamış olurdu.
 *
 * `bash` her POSIX makinede var ve `deploy.sh` zaten bash script'i; bu test
 * ondan fazla bir bağımlılık getirmiyor.
 */
const DEPLOY_SH = readFileSync(join(__dirname, '../../../../scripts/deploy.sh'), 'utf8');

/** `deploy.sh` içindeki bekçi bloğunu OLDUĞU GİBİ çıkarır. */
function bekci(): string {
  const bas = DEPLOY_SH.indexOf('env_bozuk_satirlar=');
  // BOŞA DÜŞME BEKÇİSİ: blok bulunamazsa test sessizce "hiçbir şey
  // doğrulamadım" hâline geçerdi.
  if (bas === -1) {
    throw new Error('deploy.sh içinde `env_bozuk_satirlar=` bulunamadı — bekçi kaldırılmış mı?');
  }
  const son = DEPLOY_SH.indexOf('\nfi\n', bas);
  if (son === -1) throw new Error('bekçi bloğunun `fi` kapanışı bulunamadı');
  return DEPLOY_SH.slice(bas, son + 4);
}

const DIZIN = mkdtempSync(join(tmpdir(), 'advetics-env-'));
writeFileSync(join(DIZIN, 'guard.sh'), bekci());

afterAll(() => rmSync(DIZIN, { recursive: true, force: true }));

/** Bekçiyi verilen `.env` içeriğine karşı koşar. */
function kosku(envIcerigi: string): { gecti: boolean; ciktı: string } {
  writeFileSync(join(DIZIN, '.env'), envIcerigi);
  try {
    execFileSync('bash', ['-e', 'guard.sh'], { cwd: DIZIN, stdio: 'pipe' });
    return { gecti: true, ciktı: '' };
  } catch (err) {
    const e = err as { stderr?: Buffer; stdout?: Buffer };
    return { gecti: false, ciktı: `${e.stderr ?? ''}${e.stdout ?? ''}` };
  }
}

describe('deploy.sh .env bekçisi — DÜŞMESİ gerekenler', () => {
  it('KRİTİK: canlıda deploy düşüren satır yakalanıyor', () => {
    const r = kosku('SMTP_PASS=abcd ncrj efgh ijkl\n');
    expect(r.gecti).toBe(false);
  });

  it('KRİTİK: mesaj SATIR ve ANAHTAR söylüyor, DEĞERİ SÖYLEMİYOR', () => {
    /*
     * Değeri yazdırmak, parolayı deploy çıktısına düşürmek demek — ve o
     * çıktı ekran görüntüsüyle paylaşılıyor. Asıl arıza mesajının
     * (`ncrj: command not found`) sızdırdığı şey de zaten buydu.
     */
    const r = kosku('NODE_ENV=production\nAPI_PORT=3599\nSMTP_PASS=abcd ncrj efgh\n');
    expect(r.ciktı).toContain('3:SMTP_PASS');
    expect(r.ciktı).not.toContain('ncrj');
  });
});

describe('deploy.sh .env bekçisi — GEÇMESİ gerekenler', () => {
  /*
   * Yanlış alarm, bekçinin en pahalı hâli: deploy'u tamamen kilitler ve
   * sebebi "düzeltilecek bir şey yok" olur. Gerçek `.env`de bulunan biçimler
   * tek tek sınanıyor.
   */
  const gecerliler: Array<[string, string]> = [
    ['tırnak içinde boşluk', 'SMTP_PASS="abcd efgh"\n'],
    ['tek tırnak içinde boşluk', "SMTP_PASS='abcd efgh'\n"],
    ['tırnaksız sade değer', 'NODE_ENV=production\nAPI_PORT=3599\nAUTH_COOKIE_SECURE=true\n'],
    ['boş değerler', 'SMTP_HOST=""\nAPP_URL=\n'],
    ['sondaki tek boşluk — shell için zararsız', 'FOO=bar \n'],
    ['yorum satırındaki tırnaksız örnek', '# örnek: SMTP_PASS=abcd efgh\nSMTP_PASS="x"\n'],
    ['virgüllü URL listesi', 'CORS_ORIGINS="https://a.com,https://b.com"\n'],
  ];

  for (const [ad, icerik] of gecerliler) {
    it(`yanlış alarm vermiyor: ${ad}`, () => {
      expect(kosku(icerik)).toEqual({ gecti: true, ciktı: '' });
    });
  }

  it('KRİTİK: deponun kendi `.env.example`i bekçiden geçiyor', () => {
    // Örnek dosya deploy'u kilitleyen bir biçim taşıyorsa, onu kopyalayan
    // herkes ilk deploy'unda duvara çarpar.
    const ornek = readFileSync(join(__dirname, '../../../../.env.example'), 'utf8');
    expect(ornek).toContain('SMTP_PASS'); // boşa düşme bekçisi
    expect(kosku(ornek).gecti).toBe(true);
  });
});
