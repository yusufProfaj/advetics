import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ KREATİF ANGARYASI ═══
 *
 * "Minimum angarya" hedefinin en somut iki maddesi: görseli sohbete
 * bırakabilmek ve neyin işe yaradığını görebilmek. İkisi de bugün
 * yapılamıyordu: görsel için dosya seçtirme penceresi, "ne yazayım" için
 * hiçbir şey.
 */
const yorumsuz = (m: string): string =>
  m
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const SOHBET = yorumsuz(
  readFileSync(join(__dirname, '..', 'ai-asistan', 'ai-asistan-sohbeti.tsx'), 'utf8'),
);
const KARTLAR = yorumsuz(readFileSync(join(__dirname, 'isleyen-kreatifler.tsx'), 'utf8'));
const SAYFA = yorumsuz(
  readFileSync(
    join(__dirname, '..', '..', 'app', '(dashboard)', 'kutuphane', 'kreatifler', 'page.tsx'),
    'utf8',
  ),
);

describe('tarama boşa düşmüyor', () => {
  it('kaynaklar okundu', () => {
    expect(SOHBET).toContain('export function AiAsistanSohbeti');
    expect(KARTLAR).toContain('export function IsleyenKreatifler');
    expect(SAYFA).toContain('<IsleyenKreatifler');
  });
});

describe('görsel eklemenin ÜÇ yolu', () => {
  it('KRİTİK: sürükle-bırak var ve tarayıcı varsayılanı ENGELLENİYOR', () => {
    /*
     * `onDragOver`da `preventDefault` çağrılmazsa tarayıcı bırakılan dosyayı
     * SEKMEDE AÇIYOR ve kullanıcı sohbetten çıkıyor. Bu, sürükle-bırak
     * yazıp hiç denememenin klasik sonucu.
     */
    const i = SOHBET.indexOf('onDragOver=');
    expect(i, 'sürükle-bırak yok').toBeGreaterThan(-1);
    // Dilim BİR SONRAKİ işleyiciye kadar: sabit uzunluklu bir pencere komşu
    // işleyicinin `preventDefault`ını yakalayıp yanlış yeşil verirdi.
    const dilim = SOHBET.slice(i, SOHBET.indexOf('onDragLeave=', i));
    expect(dilim).toContain('e.preventDefault()');
  });

  it('KRİTİK: yapıştırma var ve YALNIZCA görselde araya giriyor', () => {
    /*
     * Metin yapıştırmayı da engellemek, kullanıcının kopyaladığı brief'i
     * kutuya yazamaması demekti.
     */
    const i = SOHBET.indexOf('onPaste=');
    expect(i, 'yapıştırma yok').toBeGreaterThan(-1);
    const dilim = SOHBET.slice(i, SOHBET.indexOf('onKeyDown=', i));
    expect(dilim).toContain("i.type.startsWith('image/')");
    expect(dilim).toContain('if (gorseller.length === 0) return;');
  });

  it('KRİTİK: üç yol da AYNI fonksiyona giriyor', () => {
    // Ayrı ayrı yazmak, birinde doğrulama ya da hata gösterimi unutulunca
    // kullanıcının neden yükleyemediğini anlamaması demekti.
    expect(SOHBET).toContain('void ekle(e.dataTransfer.files)');
    expect(SOHBET).toContain('void ekle(gorseller)');
    expect(SOHBET).toContain('void ekle(e.target.files)');
  });

  it('KRİTİK: görsel olmayan dosya SUNUCUYA GİTMEDEN eleniyor', () => {
    // Sürüklemede ve yapıştırmada kullanıcı ne bıraktığını seçmiyor; bir PDF
    // de gelebiliyor ve sunucunun sebebi belirsiz hatası yerine dosya adıyla
    // söylemek gerekiyor.
    expect(SOHBET).toContain("!file.type.startsWith('image/')");
    expect(SOHBET).toContain('bir görsel değil, eklenmedi');
  });
});

describe('geçmişte işe yarayanlar', () => {
  it('KRİTİK: eşiğin altındakiler SAYILIYOR — sessiz kesme yok', () => {
    /*
     * İDDİA ÇİZİM KOŞULUNA ÇAPALI. İlk hâli yalnızca alan adını arıyordu ve
     * bloğun TAMAMINI kapatan bir mutasyonda bile geçti: dize bloğun içinde
     * duruyor, çizilip çizilmediğini söylemiyor.
     */
    expect(SAYFA).toContain('{performans.yetersiz > 0 && (');
    expect(SAYFA).toContain('yeterli gösterim almamış, listede yok');
  });

  it('KRİTİK: bölüm kütüphanenin ÜSTÜNDE', () => {
    // Kullanıcı bu ekrana "yeni bir şey yazacağım" diye geliyor; neyin işe
    // yaradığını görmeden yazmak elindeki en iyi bilgiyi kullanmamak demek.
    expect(SAYFA.indexOf('<IsleyenKreatifler')).toBeLessThan(SAYFA.indexOf('<CreativeLibrary'));
  });

  it('KRİTİK: ölü görsel adresi kartı BOZMUYOR', () => {
    // Platform CDN adresi imzalı ve süresi doluyor; kırık görsel kutusu
    // göstermek yerine metne yer açılıyor — kartın değeri zaten metin.
    expect(KARTLAR).toContain('onError={() => setGorselDustu(true)}');
    expect(KARTLAR).toContain('referrerPolicy="no-referrer"');
  });

  it('metin kopyalanabiliyor', () => {
    expect(KARTLAR).toContain('navigator.clipboard');
    expect(KARTLAR).toContain('Metni kopyala');
  });

  it('hata yutulmuyor', () => {
    expect(SAYFA).toContain('allSettled');
    expect(SAYFA).not.toContain('.catch(() => [])');
  });
});
