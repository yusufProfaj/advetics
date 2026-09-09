import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from './configuration';

/**
 * ═══ SİSTEM SMTP'Sİ — AÇILIŞI HİÇBİR HÂLDE DÜŞÜRMEZ ═══
 *
 * `youtube-key-optional.spec.ts` ile aynı tuzağın daha pahalı hâli:
 * `.env.example` isteğe bağlı satırları `VAR=""` olarak taşıyor ve
 * `z.string().url()` boş dizgeyi GEÇERSİZ sayıyor. Örnek dosyayı kopyalayan
 * bir sunucuda API HİÇ AÇILMAZDI — ve bu, yanında 11 canlı site barındıran
 * bir makinede deploy ortasında öğrenilecek bir şey.
 *
 * İkinci iddia: eksik SMTP `null` üretiyor AMA sessizce değil — hangi
 * değişkenin eksik olduğu ADIYLA taşınıyor.
 */

const TABAN: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  DIRECT_DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  WORKER_DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  ENCRYPTION_KEY_V1: 'ZGVnaXN0aXItYnVudS0zMi1ieXRlLWJhc2U2NC1rZXk=',
};

const orijinal = { ...process.env };

function yukle(ekstra: Record<string, string>) {
  // TAM DEĞİŞTİRME: gerçek `.env` sızarsa test yalan söyler — makinede
  // SMTP tanımlıysa "eksik" iddiası hiçbir zaman düşmezdi.
  process.env = { ...TABAN, ...ekstra } as NodeJS.ProcessEnv;
  return loadConfig();
}

afterEach(() => {
  process.env = { ...orijinal } as NodeJS.ProcessEnv;
});

describe('SMTP yapılandırması', () => {
  it('KRİTİK: `.env.example`in boş değerleri açılışı DÜŞÜRMÜYOR', () => {
    expect(() =>
      yukle({
        SMTP_HOST: '',
        SMTP_PORT: '',
        SMTP_SECURE: '',
        SMTP_USER: '',
        SMTP_PASS: '',
        SMTP_FROM_EMAIL: '',
        SMTP_FROM_NAME: '',
        APP_URL: '',
      }),
    ).not.toThrow();
  });

  it('boş değerlerde varsayılanlar devreye giriyor', () => {
    // Boş dizge "tanımlı" sayılsaydı `.default()` çalışmaz ve port 0,
    // gönderen adı '' olurdu — ikisi de gönderimi bozar.
    const c = yukle({ SMTP_PORT: '', SMTP_SECURE: '', SMTP_FROM_NAME: '' });
    expect(c.mail.smtp).toBeNull();
    expect(() => yukle({ SMTP_PORT: '' })).not.toThrow();
  });

  it('KRİTİK: eksik değişkenler ADIYLA raporlanıyor', () => {
    /*
     * Yalnızca `null` dönmek, "hiç kurulmamış" ile "yarım kurulmuş"u aynı
     * sessizliğe çevirirdi. Ekranda ad görünmesi, sunucuya girmeden
     * düzeltilebilen bir arıza demek.
     */
    const c = yukle({ SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'x@y.com' });
    expect(c.mail.smtp).toBeNull();
    expect(c.mail.eksikSmtpDegiskenleri).toEqual(['SMTP_PASS', 'SMTP_FROM_EMAIL']);
  });

  it('eksiksizken kimlik kuruluyor', () => {
    const c = yukle({
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_PORT: '587',
      SMTP_SECURE: 'false',
      SMTP_USER: 'x@y.com',
      SMTP_PASS: 'app-parolasi',
      SMTP_FROM_EMAIL: 'noreply@advetics.com',
    });
    expect(c.mail.eksikSmtpDegiskenleri).toEqual([]);
    expect(c.mail.smtp).toEqual({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      user: 'x@y.com',
      pass: 'app-parolasi',
      fromEmail: 'noreply@advetics.com',
      fromName: 'Advetics',
    });
  });
});

describe('APP_URL', () => {
  it('KRİTİK: verilmezse OAUTH_REDIRECT_BASE_URL kullanılıyor', () => {
    // İki ayrı ZORUNLU adres değişkeni, birinin güncellenip diğerinin
    // unutulduğu klasik ayrışma demekti (CLAUDE.md: aynı şeyi iki yerde yazma).
    const c = yukle({ OAUTH_REDIRECT_BASE_URL: 'https://advetics.com' });
    expect(c.mail.appUrl).toBe('https://advetics.com');
  });

  it('APP_URL verilmişse o kazanıyor', () => {
    const c = yukle({
      OAUTH_REDIRECT_BASE_URL: 'https://advetics.com',
      APP_URL: 'https://panel.advetics.com',
    });
    expect(c.mail.appUrl).toBe('https://panel.advetics.com');
  });

  it('sondaki eğik çizgi kırpılıyor', () => {
    expect(yukle({ APP_URL: 'https://advetics.com/' }).mail.appUrl).toBe('https://advetics.com');
  });

  it('ikisi de yoksa yerel adrese düşüyor — açılış YİNE patlamıyor', () => {
    expect(yukle({}).mail.appUrl).toBe('http://localhost:3000');
  });
});
