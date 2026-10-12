import { describe, expect, it } from 'vitest';
import { aciklamaMetinleriUret, aciklamaMetniSec } from '@advetics/shared';
import { metinOnerisiTemizle } from '../rehber/oneriler';

/**
 * AJAN 4 YENİDEN KAPI (4f8d7be) — Ö-C süzgeci aşırı geniş mi.
 * Olağan Türkçe açıklama metinleri geçmeli; kaynakta AYNEN geçen söz kalmalı.
 */
describe('Ö-C süzgeci: olağan metin geçer, kaynaktaki söz kalır', () => {
  it('olağan açıklama metinleri (abartı/sayı/fiyat yok) geçer', () => {
    const ok = ['Hızlı teslimat', 'Uzman kadro', 'Yerinde keşif', 'Deniz manzaralı daireler', 'Kurumsal hizmet', 'Garaj ve otopark', 'En yakın şube'];
    // Tek tek: öğe sayısı sınırı (en çok N) iddiayı karıştırmasın.
    for (const x of ok) expect(aciklamaMetinleriUret([x], '').metinler).toEqual([x]);
  });
  it('kaynakta olmayan abartı atılır (garanti, en iyi, bir numara)', () => {
    expect(aciklamaMetinleriUret(['Garantili işçilik', 'En iyi fiyat', 'Bir numara hizmet', 'GARANTİLİ'], 'konut projeleri').metinler).toEqual([]);
  });
  it('kaynakta AYNEN geçen "garanti" kalır', () => {
    expect(aciklamaMetniSec(['Garantili işçilik'], [], 'Tüm işlerimiz garantili işçilikle').metinler).toEqual(['Garantili işçilik']);
  });
  it('yapay zekâ yolu: kaynakta "ücretsiz keşif" varsa "Ücretsiz keşif" KALIR', () => {
    const r = metinOnerisiTemizle(
      { anaMetin: 'a', basliklar: [], aciklamalar: [], aciklamaMetinleri: ['Ücretsiz keşif', 'Hızlı teslimat', 'Uzman kadro'] },
      { kaynakMetin: 'Vaat: ücretsiz keşif. Marka: Ege Birlik Yapı.', yasalUyari: null },
    );
    expect(r.aciklamaMetinleri).toEqual(['Ücretsiz keşif', 'Hızlı teslimat', 'Uzman kadro']);
  });
  it('vaat yolu: Marka Merkezi vaadi "Ücretsiz keşif" KALIR', () => {
    expect(aciklamaMetniSec(undefined, ['Ücretsiz keşif', 'Uzman kadro']).metinler).toEqual(['Ücretsiz keşif', 'Uzman kadro']);
  });
});
