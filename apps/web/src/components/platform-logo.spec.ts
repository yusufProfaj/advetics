import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHANNEL_KINDS } from '@advetics/shared';
import { adAccountKanali, profilKanali } from './platform-logo';

/**
 * PLATFORM LOGOLARI — eşleme ve kapsam.
 *
 * Yanlış logo sessiz bir hata: bir Google hesabının yanında Meta işareti
 * görmek, kullanıcının yanlış hesabı atadığını düşünmesine ya da doğru olanı
 * atlamasına yol açar. Eşleme tek yerde ve burada kilitleniyor.
 */
const KAYNAK = readFileSync(join(__dirname, 'platform-logo.tsx'), 'utf8');

const yorumsuz = (m: string): string =>
  m.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('tarama boşa düşmüyor', () => {
  it('kaynak okunuyor ve çizimleri taşıyor', () => {
    expect(KAYNAK.length).toBeGreaterThan(1500);
    expect(yorumsuz(KAYNAK)).toContain('<svg');
  });
});

describe('kapsam', () => {
  it('KRİTİK: BEŞ kanalın hepsinin çizimi var', () => {
    /*
     * Eksik bir dal `switch`ten `undefined` döndürür ve React hiçbir şey
     * basmaz — rozet sessizce boş kalır. TypeScript'in exhaustive kontrolü
     * `ChannelKind` genişlerse yakalar ama dal SİLİNİRSE dönüş tipi
     * `undefined` olur ve derleme geçer.
     */
    const kod = yorumsuz(KAYNAK);
    for (const k of CHANNEL_KINDS) {
      expect(kod, `${k} dalı yok`).toContain(`case '${k}':`);
    }
  });
});

describe('eşleme', () => {
  it('KRİTİK: reklam hesabı platformu doğru kanala gidiyor', () => {
    expect(adAccountKanali('google')).toBe('google_ads');
    expect(adAccountKanali('meta')).toBe('meta_ads');
  });

  it('bilinmeyen platform Metaya düşüyor — boş rozet değil', () => {
    // Sessiz boşluk yerine bilinen bir işaret: yeni bir platform eklenirse
    // rozet yanlış olur ama GÖRÜNÜR, yani fark edilir.
    expect(adAccountKanali('tiktok')).toBe('meta_ads');
  });

  it('KRİTİK: üç profil tipi ÜÇ AYRI logoya gidiyor', () => {
    expect(profilKanali('facebook_page')).toBe('facebook');
    expect(profilKanali('instagram_business')).toBe('instagram');
    expect(profilKanali('youtube_channel')).toBe('youtube');
  });
});

describe('erişilebilirlik', () => {
  it('logolar aria-hidden — yanlarındaki metin okunuyor', () => {
    // İşaretler dekoratif: hesabın adı ve kanal başlığı zaten metin olarak
    // duruyor. Ekran okuyucuya iki kez "Instagram" dedirtmek gürültü.
    expect(yorumsuz(KAYNAK)).toContain("'aria-hidden'");
  });
});
