import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MARKA_SINIRLARI, yasalUyariEkle, yasalUyariVar } from '@advetics/shared';
import { googleUyarisi, yasalUyariEngeli } from './yasal-uyari';

/**
 * ═══ ZORUNLU YASAL UYARI ═══
 *
 * Aynı karşılaştırmayı ekran (Hızlı Reklam) ve sunucu (yayın öncesi kontrol)
 * yapıyor; biri boşluğa duyarlı öbürü değil olsaydı ekran "tamam" deyip yayın
 * "eksik" diye dururdu.
 */
const U = 'Kampanya koşulları için bankanıza danışın.';

describe('yasalUyariVar', () => {
  it('boşluk ve büyük/küçük harf farkı önemsiz', () => {
    expect(yasalUyariVar(`Metin.\n\nKAMPANYA  koşulları\niçin bankanıza danışın.`, U)).toBe(true);
  });
  it('kelime değişirse artık o uyarı değil', () => {
    expect(yasalUyariVar('Kampanya şartları için bankanıza danışın.', U)).toBe(false);
  });
  it('uyarı tanımlı değilse zorunluluk yok', () => {
    expect(yasalUyariVar('herhangi', null)).toBe(true);
    expect(yasalUyariVar('herhangi', '   ')).toBe(true);
  });
});

describe('yasalUyariEkle', () => {
  it('ayrı paragraf olarak sona ekler', () => {
    expect(yasalUyariEkle('Yaz indirimi', U)).toBe(`Yaz indirimi\n\n${U}`);
  });
  it('zaten varsa metne DOKUNMUYOR — iki kez eklenmiyor', () => {
    const m = `Yaz indirimi\n\n${U}`;
    expect(yasalUyariEkle(m, U)).toBe(m);
    expect(yasalUyariEkle(yasalUyariEkle('x', U), U)).toBe(`x\n\n${U}`);
  });
  it('boş metin: yalnızca uyarı', () => {
    expect(yasalUyariEkle('', U)).toBe(U);
  });
});

describe('sunucu mesajları', () => {
  it('engel mesajı uyarının kendisini ve nereden geldiğini söylüyor', () => {
    const m = yasalUyariEngeli('Yaz indirimi', U, '2. reklam: ');
    expect(m).toContain('2. reklam: ');
    expect(m).toContain(U);
    expect(m).toContain('Marka Merkezi');
    expect(yasalUyariEngeli(`Yaz\n${U}`, U)).toBeNull();
  });
  it('Google kısıtı SÖYLENİYOR, tahminle bir alana yazılmıyor', () => {
    expect(googleUyarisi(U)).toContain('Google reklamında otomatik denetlenmiyor');
    expect(googleUyarisi(null)).toBeNull();
  });
});

describe('iki yayın yolu da aynı kapıdan geçiyor', () => {
  const yorumsuz = (y: string) =>
    readFileSync(resolve(__dirname, y), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  it('taslak ağacı kontrolü', () => {
    const k = yorumsuz('../draft-tree/draft-publish.service.ts');
    expect(k).toContain('yasalUyariOku(this.prisma, ctx, campaign.clientId)');
    expect(k).toContain('yasalUyariEngeli(packed.primaryText, yasalUyari, etiket)');
  });
  it('eski tek reklam taslağı kontrolü', () => {
    const k = yorumsuz('../ad-builder/ad-builder.service.ts');
    expect(k).toMatch(/yasalUyariEngeli\(\s*draft\.primaryText,\s*await yasalUyariOku\(this\.prisma, ctx, draft\.clientId\)/);
  });
  it('kolon genişliği MARKA_SINIRLARI ile aynı', () => {
    const m = readFileSync(
      resolve(__dirname, '../../../prisma/migrations/20260929180000_metin_sablonlari/migration.sql'),
      'utf8',
    );
    expect(m).toContain(`"yasal_uyari"      VARCHAR(${MARKA_SINIRLARI.yasalUyari})`);
  });
});
