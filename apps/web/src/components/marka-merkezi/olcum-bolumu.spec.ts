import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ MARKA MERKEZİ › ÖLÇÜM — PANEL DENETİMİ (Ajan 4, 2026-10-11) ═══
 *
 * Panelde bileşen render eden altyapı yok; iddialar YORUMSUZ kaynakta ve
 * dilim, ilgili JSX öğesinin kendisinden başlıyor (yorum eşleşip testi
 * yeşil bırakmasın).
 */
const yorumsuz = readFileSync(join(__dirname, 'olcum-bolumu.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

function dilim(baslangic: string, bitis: string): string {
  const i = yorumsuz.indexOf(baslangic);
  const j = yorumsuz.indexOf(bitis, i + baslangic.length);
  if (i < 0 || j < 0) throw new Error(`Dilim bulunamadı: ${baslangic} … ${bitis}`);
  return yorumsuz.slice(i, j);
}

describe('Ölçüm bölümü', () => {
  it('KRİTİK: hata yutulmuyor — `.catch(() => set…)` yok; çağrı hatası ayrı hâl ve mesajıyla', () => {
    expect(yorumsuz).not.toMatch(/\.catch\(\s*\(\)\s*=>\s*set/);
    expect(yorumsuz).toContain("setHal({ tur: 'hata', mesaj: hataMetni(e) })");
    expect(yorumsuz).toContain("hal.tur === 'okunuyor'");
  });

  it('KRİTİK: yazma yetkisi yoksa "Birincil yap" düğmesi HİÇ yok; varsa yazma yalnız onay düğmesinden', () => {
    const blok = dilim("{e?.tur === 'birincil_yap' && (", "{e?.tur === 'marka_merkezi' && (");
    const yetkisiz = blok.slice(blok.indexOf('{!yazabilir ? ('), blok.indexOf(') : ('));
    expect(yetkisiz).not.toContain('<Dugme');
    // birincilYap çağrısı tek yerde ve o yer "Onayla" düğmesi.
    const cagrilar = yorumsuz.match(/birincilYap\(e\.donusumId\)/g) ?? [];
    expect(cagrilar).toHaveLength(1);
    const onayla = yorumsuz.slice(yorumsuz.lastIndexOf('<Dugme', yorumsuz.indexOf('birincilYap(e.donusumId)')), yorumsuz.indexOf('Onayla'));
    expect(onayla).toContain('onClick={() => void birincilYap(e.donusumId)}');
    // İlk düğme yalnız onayı açıyor.
    expect(blok).toContain('<Dugme onClick={() => setOnay(true)}>Birincil yap</Dugme>');
  });

  it('Google işlem listesi toplamı söylüyor (sessiz kesme yok)', () => {
    expect(yorumsuz).toContain("{g.toplam} işlemin {g.satirlar.length}'i");
  });

  /*
   * BULGU (önemli): `clients.website` serbest dizge; "ege birlik.com" ya da
   * "http://" girildiğinde servis `site.adres`i ayrıştırılamaz bir dizge
   * olarak dönüyor ve bu satır TypeError fırlatıp Ölçüm bölümünü (ve sayfanın
   * hata sınırına kadar her şeyi) düşürüyor. API tarafındaki kanıt:
   * `olcum-denetim.spec.ts` › "dönen site.adres her zaman URL olarak
   * ayrıştırılabilir".
   */
  it('DÜZELDİ (Ajan 4): site kutusu `new URL(s.adres)`i korumasız çağırmıyor', () => {
    expect(yorumsuz).not.toContain('new URL(s.adres).hostname');
  });
});
