import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_GOALS,
  MARKA_SINIRLARI,
  adDraftInputSchema,
  hedefAdresiGecerli,
  upsertClientProfileSchema,
} from '@advetics/shared';

/**
 * ═══ YAPILANDIRILMIŞ MARKA ALANLARI — İKİ LİSTE AYRIŞAMAZ ═══
 *
 * Ana amaç iki yerde listeleniyor: paylaşılan şema (`CAMPAIGN_GOALS`) ve
 * veritabanı CHECK kısıtı. Ayrışırlarsa ya panelde seçilen bir amaç
 * üretimde INSERT'te patlar ya da kurulamayan bir amaç kaydedilir.
 * Kolon genişlikleri de `MARKA_SINIRLARI` ile aynı olmalı: panel 150
 * karaktere izin verip veritabanı 120'de keserse kayıt sunucuda düşer.
 */
const MIGRATION = readFileSync(
  resolve(__dirname, '../../../prisma/migrations/20260929120000_marka_alanlari/migration.sql'),
  'utf8',
);

describe('migration ile paylaşılan şema aynı', () => {
  it('ana amaç CHECK listesi CAMPAIGN_GOALS ile birebir', () => {
    const m = /"ana_amac" IN \(([^)]+)\)/.exec(MIGRATION);
    if (!m) throw new Error('ana_amac CHECK kısıtı bulunamadı — tarama boşa düştü.');
    const liste = [...m[1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
    expect(liste).toEqual([...CAMPAIGN_GOALS].sort());
  });

  it('kolon genişlikleri MARKA_SINIRLARI ile aynı', () => {
    const genislik = (kolon: string) => {
      const m = new RegExp(`"${kolon}"\\s+VARCHAR\\((\\d+)\\)`).exec(MIGRATION);
      if (!m) throw new Error(`${kolon} bulunamadı — tarama boşa düştü.`);
      return Number(m[1]);
    };
    expect(genislik('marka_adi')).toBe(MARKA_SINIRLARI.markaAdi);
    expect(genislik('sektor')).toBe(MARKA_SINIRLARI.sektor);
    expect(genislik('uslup')).toBe(MARKA_SINIRLARI.uslup);
  });
});

const gecer = (g: Record<string, unknown>) =>
  upsertClientProfileSchema.safeParse({ clientId: '11111111-1111-1111-1111-111111111111', ...g }).success;

describe('giriş doğrulaması', () => {
  it('sayfa adresi: yalnızca http(s) ve tam adres', () => {
    expect(gecer({ sikSayfalar: [{ ad: 'A', url: 'https://a.com/x' }] })).toBe(true);
    expect(gecer({ sikSayfalar: [{ ad: 'A', url: 'a.com' }] })).toBe(false);
    expect(gecer({ sikSayfalar: [{ ad: 'A', url: 'javascript:alert(1)' }] })).toBe(false);
    expect(gecer({ sikSayfalar: [{ ad: '', url: 'https://a.com' }] })).toBe(false);
  });

  it('aynı adres iki kez eklenemiyor (büyük/küçük harf fark etmez)', () => {
    expect(
      gecer({ sikSayfalar: [{ ad: 'A', url: 'https://a.com' }, { ad: 'B', url: 'HTTPS://A.COM' }] }),
    ).toBe(false);
  });

  it('listelerde tekrar ve sınır aşımı reddediliyor', () => {
    expect(gecer({ vaatler: ['Hızlı', 'hızlı'] })).toBe(false);
    expect(gecer({ urunKategorileri: Array.from({ length: MARKA_SINIRLARI.kategori.adet + 1 }, (_, i) => `k${i}`) })).toBe(false);
    expect(gecer({ urunKategorileri: Array.from({ length: MARKA_SINIRLARI.kategori.adet }, (_, i) => `k${i}`) })).toBe(true);
  });

  it('sistemin kuramadığı amaç reddediliyor', () => {
    expect(gecer({ anaAmac: 'satis' })).toBe(false);
    expect(gecer({ anaAmac: 'form' })).toBe(true);
    expect(gecer({ anaAmac: null })).toBe(true);
  });
});

describe('sayfa listesi ile reklam hedefi AYNI kuralı kullanıyor', () => {
  it('reklam taslağı şeması adres kontrolünü paylaşılan fonksiyondan yapıyor', () => {
    const kaynak = readFileSync(
      resolve(__dirname, '../../../../../packages/shared/src/schemas/ad-builder.schema.ts'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(kaynak).toContain('!hedefAdresiGecerli(url)');
    expect(kaynak).not.toMatch(/https\?:\\\/\\\/\.\+\\\.\.\+\/i\.test\(url\)/);
  });

  it('listede kabul edilen adres reklam taslağında da kabul ediliyor', () => {
    const url = 'https://ornek.com.tr/kampanya?utm=1';
    expect(hedefAdresiGecerli(url)).toBe(true);
    expect(gecer({ sikSayfalar: [{ ad: 'K', url }] })).toBe(true);
    const r = adDraftInputSchema.safeParse({ goal: 'website', linkUrl: url });
    const linkHatasi = r.success ? [] : r.error.issues.filter((i) => i.path[0] === 'linkUrl');
    expect(linkHatasi).toEqual([]);
  });
});
