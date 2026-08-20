import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * GEZİNME GERİ BİLDİRİMİ — "tıklıyorum, gitmiyor" arızasının kilidi.
 *
 * Next App Router'da `<Link>` tıklanınca gösterilecek bir yükleme sınırı
 * YOKSA React eski ağacı ekranda tutuyor: tıklanan bağlantı rengini bile
 * değiştirmiyor ve sunucu render'ı bitene kadar panel DONMUŞ görünüyor.
 * Gezinme bir RSC isteği olduğu için tarayıcının sekme spinner'ı da dönmüyor.
 *
 * Panelde bu sınırlardan HİÇBİRİ yoktu ve bütün sayfalar dinamik.
 */
const APP = join(__dirname);
const DASH = join(APP, '(dashboard)');

const yorumsuz = (m: string): string =>
  m.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('yükleme sınırı', () => {
  it('KRİTİK: panelde loading.tsx VAR', () => {
    // Yoksa tıklama hiçbir görsel geri bildirim üretmiyor.
    expect(existsSync(join(DASH, 'loading.tsx'))).toBe(true);
  });

  it('iskelet gerçekten bir şey basıyor', () => {
    // Boş dönen bir `loading.tsx` sınırı kurar ama ekranı boşaltır —
    // "dondu" yerine "kayboldu" olurdu.
    const kod = yorumsuz(readFileSync(join(DASH, 'loading.tsx'), 'utf8'));
    expect(kod).toContain('animate-pulse');
    expect(kod.length).toBeGreaterThan(300);
  });

  it('ekran okuyucuya da bildiriliyor', () => {
    const kod = readFileSync(join(DASH, 'loading.tsx'), 'utf8');
    expect(kod).toContain('aria-busy');
    expect(kod).toContain('Sayfa yükleniyor');
  });
});

describe('hata sınırı', () => {
  it('KRİTİK: panelde error.tsx VAR', () => {
    // Yoksa bir sunucu bileşeni hatası BÜTÜN paneli Next'in genel hata
    // ekranına düşürüyor; menü ve üst bar dahil her şey gidiyor.
    expect(existsSync(join(DASH, 'error.tsx'))).toBe(true);
  });

  it('KRİTİK: ham hata mesajı gösterilmiyor', () => {
    /*
     * Sunucu hataları tablo ve kolon adı sızdırabiliyor — `AllExceptionsFilter`
     * Prisma mesajlarını tam da bu yüzden sadeleştiriyor. Sınırın onu geri
     * getirmesi o kararı boşa çıkarırdı.
     */
    const kod = yorumsuz(readFileSync(join(DASH, 'error.tsx'), 'utf8'));
    expect(kod).toContain('error.digest');
    expect(kod).not.toContain('{error.message}');
  });

  it('kurtarma yolu var', () => {
    const kod = yorumsuz(readFileSync(join(DASH, 'error.tsx'), 'utf8'));
    expect(kod).toContain('reset');
  });
});

describe('layout gidiş-dönüşleri', () => {
  it('KRİTİK: oturum ve marka PARALEL çekiliyor', () => {
    /*
     * Ardışık `await`ler her gezinmede iki tam gidiş-dönüşü SERİ olarak
     * topluyordu ve panelin her sayfası bu layout'tan geçiyor — maliyet her
     * tıklamada ödeniyordu.
     */
    const kod = yorumsuz(readFileSync(join(DASH, 'layout.tsx'), 'utf8'));
    expect(kod).toContain('Promise.all([');
    const i = kod.indexOf('Promise.all([');
    const blok = kod.slice(i, i + 220);
    expect(blok).toContain('requireSession()');
    expect(blok).toContain("'/branding'");
  });
});
