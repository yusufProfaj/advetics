import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PilotPlanDetayi } from '@advetics/shared';
import { altCubuk, donemSecenekleri } from './hesap';

/**
 * ═══ AJAN 4 · TIKLAMA SAYIMI (AJAN-PLANI §2 hedefi: 3) ═══
 *
 * Planı hazırla · Müşteriye gönder · [müşteri] Onayla. Sayım iki parçadan
 * kuruluyor ve İKİSİ DE gerekli: (a) her adımda birincil düğme o eylemi
 * taşıyor (saf `altCubuk`, çalıştırılarak), (b) o düğmenin tıklaması araya
 * pencere/onay kutusu koymadan isteği gönderiyor (kaynak taraması). Biri
 * olmadan sayı yalan söyler: düğme doğru etiketle durup bir pencere açabilir.
 *
 * Varsayım: Aylık Bütçe, Marka Merkezi beyanı ve hesap ataması önceden
 * yapılmış (Veri adımı, sayıma girmez). Uyarı işareti gerekiyorsa +1
 * tıklama: bu sayım temiz uyum yolunu ölçüyor.
 */
const KOK = __dirname;
function yorumsuz(ad: string): string {
  return readFileSync(join(KOK, ad), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** Bir fonksiyon/case gövdesini süslü parantez sayarak keser; bulunamazsa PATLAR. */
function govde(kaynak: string, baslangic: string): string {
  const i = kaynak.indexOf(baslangic);
  if (i < 0) throw new Error(`Tarama boşa düştü: ${baslangic}`);
  const ac = kaynak.indexOf('{', i);
  let derinlik = 0;
  for (let j = ac; j < kaynak.length; j++) {
    if (kaynak[j] === '{') derinlik++;
    else if (kaynak[j] === '}' && --derinlik === 0) return kaynak.slice(i, j + 1);
  }
  throw new Error(`Gövde kapanmadı: ${baslangic}`);
}

function detay(durum: PilotPlanDetayi['plan']['durum'], rol: 'musteri' | 'ajans', yapilabilir: PilotPlanDetayi['yapilabilir']) {
  return {
    rol,
    yapilabilir,
    musteriOzeti: null,
    onayKapisi: null,
    plan: { id: 'p', clientId: 'c', donem: '2026-11', durum, surum: 1, icerikOzeti: 'a'.repeat(64), yayinKipi: null, onay: null, musteriNotu: null, guncellendi: '2026-10-07T00:00:00Z' },
    icerik: { satirlar: [], takvim: { baslangic: '2026-11-01', bitis: '2026-11-30' } },
  } as unknown as Parameters<typeof altCubuk>[0];
}

describe('tıklama sayımı: plan → müşteri onayı = 3', () => {
  it('1. "Planı hazırla": dönem ÖNSEÇİLİ, tek düğme isteği gönderiyor (dönem seçimi tıklama değil)', () => {
    expect(donemSecenekleri('2026-10-07').varsayilan).toMatch(/^\d{4}-\d{2}$/);
    const k = yorumsuz('plan-hazirla.tsx');
    expect(k).toContain('useState(secenek.varsayilan)');
    const h = govde(k, 'async function hazirla()');
    expect(h).toContain("pilotUcAdresi('/pilot/planlar/hazirla')");
    expect(h).not.toMatch(/confirm\(|setAcik/);
  });

  it('2. taslakta ajansın BİRİNCİL düğmesi "Müşteriye gönder" ve tıklaması doğrudan istek', () => {
    const c = altCubuk(detay('taslak', 'ajans', ['degistir', 'yeniden_hazirla', 'musteriye_gonder', 'iptal']));
    expect(c.birincil?.eylem).toBe('musteriye_gonder');
    const e = govde(yorumsuz('plan-belgesi.tsx'), 'function eylemYap(');
    const dal = e.slice(e.indexOf("case 'musteriye_gonder'"), e.indexOf("case 'onayla'"));
    expect(dal).toContain('void yaz(');
    expect(dal).not.toContain('setAcikKutu');
  });

  it('3. müşteride müşterinin BİRİNCİL düğmesi "Onayla" ve tıklaması pencere açmadan istek', () => {
    const c = altCubuk(detay('musteride', 'musteri', ['degisiklik_iste', 'onayla']));
    expect(c.birincil?.eylem).toBe('onayla');
    const e = govde(yorumsuz('plan-belgesi.tsx'), 'function eylemYap(');
    const dal = e.slice(e.indexOf("case 'onayla'"));
    const satir = dal.split('\n').find((s) => s.includes('if (musteri)'));
    expect(satir).toBeDefined();
    expect(satir).toContain('void yaz(');
    expect(satir).not.toContain('setAcikKutu');
  });

  it('birincil düğme eylemYap’a bağlı (etiket ile davranış ayrışmıyor)', () => {
    const k = yorumsuz('plan-belgesi.tsx');
    expect(k).toContain('onClick={() => eylemYap(cubuk.birincil!.eylem)}');
  });

  it('ajans müşteri adına onayda birincil düğme YOK (gerekçe kutusu ikincilde): müşterinin yerine geçen evet ayrı yol', () => {
    const c = altCubuk(detay('musteride', 'ajans', ['geri_cek', 'onayla', 'iptal']));
    expect(c.birincil).toBeNull();
    expect(c.ikincil.map((x) => x.eylem)).toContain('onayla');
  });
});
