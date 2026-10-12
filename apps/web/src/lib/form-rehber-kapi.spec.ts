import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LeadFormRecord } from '@advetics/shared';
import { yayinSonrasiSecim } from './form-onizleme';

/**
 * AJAN 4 KAPISI — rehberdeki "Form oluştur" akışı.
 *
 * Geri okuma uyarısı (`readbackWarning`: "KVKK kutusu formda YOK") yalnız
 * Marka Merkezi › Formlar listesinde görünüyor. Rehberde form yayınlanınca
 * `yayinSonrasiSecim` uyarıya bakmadan formu reklama SEÇİYOR ve ekrana
 * "yayınlandı ve bu reklam için seçildi" yazıyor: KVKK kutusu düşmüş bir form
 * sessizce reklama bağlanır. KIRMIZI bırakıldı.
 */
const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('B-2: rehberde geri okuma uyarısı sessiz kalmamalı', () => {
  it('uyarılı yayın "sec" dönse bile uyarıyı TAŞIMALI (ekran söyleyebilsin)', () => {
    const uyari = "Form yayınlandı ama Meta'da farklı duruyor: Onay kutusu formda YOK: \"KVKK metnini okudum.\".";
    const r = yayinSonrasiSecim({ status: 'published', externalFormId: '777', error: null, readbackWarning: uyari } as LeadFormRecord);
    expect(JSON.stringify(r)).toContain('Onay kutusu formda YOK');
  });

  it('rehber bileşeni readbackWarning okuyor (kaynak taraması)', () => {
    const k = yorumsuz(readFileSync(join(__dirname, '../components/rehber/adim-reklam.tsx'), 'utf8'));
    expect(k.length).toBeGreaterThan(1000);
    expect(k).toContain('readbackWarning');
  });
});

describe('Ö-1: gömülü oluşturucu Marka Merkezi telefonunu almıyor', () => {
  it('rehberdeki <FormBuilder> telefonOnerisi geçiriyor (Bizi ara önden dolsun)', () => {
    const k = yorumsuz(readFileSync(join(__dirname, '../components/rehber/adim-reklam.tsx'), 'utf8'));
    const bas = k.indexOf('<FormBuilder');
    expect(bas).toBeGreaterThan(0);
    const son = k.indexOf('/>', bas);
    expect(k.slice(bas, son)).toContain('telefonOnerisi');
  });
});
