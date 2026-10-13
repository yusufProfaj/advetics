import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { HaftalikOzetOnizleme } from '@advetics/shared';
import { cerceveIcerigi, haftaSec, haftaSecenekleri, musteriGonderimMetni, onizlemeYolu, ozetHali } from './haftalik-ozet';

/**
 * Haftalık özet sekmesinin kararları (Paket B, Ajan 3). Bileşen render
 * altyapısı yok; kararlar saf fonksiyonda ve burada ÇALIŞTIRILARAK, bağlar
 * YORUMSUZ kaynak taramasıyla sınanıyor.
 */
const yorumsuz = (yol: string) =>
  readFileSync(yol, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const PAZARTESI = new Date('2026-10-12T07:00:00Z');

describe('hafta seçici', () => {
  it('KRİTİK: son TAMAMLANMIŞ haftadan başlıyor, bu hafta listede yok, sekiz hafta ardışık', () => {
    const s = haftaSecenekleri(PAZARTESI);
    expect(s).toHaveLength(8);
    expect(s[0]).toEqual({ kod: '2026-W41', etiket: '5-11 Ekim (geçen hafta)' });
    expect(s[1]).toEqual({ kod: '2026-W40', etiket: '28 Eylül - 4 Ekim' });
    expect(s.map((x) => x.kod)).not.toContain('2026-W42');
    expect(s[7]!.kod).toBe('2026-W34');
  });

  it('KRİTİK: tanınmayan / tamamlanmamış hafta SESSİZCE yok sayılmıyor (`duzeltildi`)', () => {
    const s = haftaSecenekleri(PAZARTESI);
    expect(haftaSec(undefined, s)).toEqual({ kod: '2026-W41', duzeltildi: false });
    expect(haftaSec('2026-W40', s)).toEqual({ kod: '2026-W40', duzeltildi: false });
    expect(haftaSec('2026-W42', s)).toEqual({ kod: '2026-W41', duzeltildi: true });
    expect(haftaSec('<script>', s)).toEqual({ kod: '2026-W41', duzeltildi: true });
  });

  it('önizleme yolu tek üreticiden ve kitleyi taşıyor', () => {
    expect(onizlemeYolu('c1', 'musteri', '2026-W41')).toBe('/haftalik-ozet/onizleme?clientId=c1&kitle=musteri&hafta=2026-W41');
  });
});

describe('dört hâl ayrı', () => {
  const veri = (hacim: 'bos' | 'normal') => ({ ozet: { hacim } }) as unknown as HaftalikOzetOnizleme;
  it('KRİTİK: hata, yükleniyor, boş hafta ve dolu AYRI', () => {
    expect(ozetHali({ yukleniyor: false, hata: 'Workspace bulunamadı.', veri: veri('normal') })).toBe('hata');
    expect(ozetHali({ yukleniyor: true, hata: null, veri: null })).toBe('yukleniyor');
    expect(ozetHali({ yukleniyor: false, hata: null, veri: veri('bos') })).toBe('bos');
    expect(ozetHali({ yukleniyor: false, hata: null, veri: veri('normal') })).toBe('dolu');
  });

  it('müşteri özet planı durumu tek cümle', () => {
    expect(musteriGonderimMetni({ durum: 'kapali', zaman: null, alicilar: [] })).toMatch(/kapalı/);
    expect(musteriGonderimMetni({ durum: 'sent', zaman: '2026-10-12T06:19:00Z', alicilar: [] })).toMatch(/^Gönderildi · /);
  });
});

describe('önizleme çerçevesi', () => {
  const KAYNAK = yorumsuz(join(__dirname, '..', 'components', 'report', 'haftalik-ozet.tsx'));

  it('KRİTİK: mail API HTML’i, betiksiz çerçevede; panelde ikinci şablon yok', () => {
    const i = KAYNAK.indexOf('<iframe');
    if (i < 0) throw new Error('iframe bulunamadı');
    const iframe = KAYNAK.slice(i, KAYNAK.indexOf('/>', i));
    expect(iframe).toContain('srcDoc={cerceveIcerigi(veri.eposta.html)}');
    expect(iframe).toMatch(/sandbox="[^"]*"/);
    expect(iframe).not.toContain('allow-scripts');
    expect(KAYNAK).not.toContain('dangerouslySetInnerHTML');
    expect(cerceveIcerigi('<p>x</p>')).toContain('<base target="_blank">');
  });

  it('KRİTİK: ajans görünümü düğmesi yalnız rule.read ile; sayfa izni doğru yerden', () => {
    expect(KAYNAK).toMatch(/useState<OzetKitlesi>\(ajansGorur \? 'ajans' : 'musteri'\)/);
    expect(KAYNAK).toMatch(/\{ajansGorur \? \(\s*<BolumluSecici\s+etiket="Görünüm"/);
    const sayfa = yorumsuz(join(__dirname, '..', 'app', '(dashboard)', 'raporlar', 'page.tsx'));
    expect(sayfa).toMatch(/ajansGorur=\{hasPermission\(session, 'rule\.read'\)\}/);
    expect(sayfa).toMatch(/planYetkisi=\{canShare\}/);
  });

  it('KRİTİK: hata yutulmuyor (catch boş liste/boş veri yazmıyor)', () => {
    expect(KAYNAK).not.toMatch(/\.catch\(\(\) => set\w+\((\[\]|null)\)\)/);
    expect(KAYNAK).toMatch(/setHata\(e instanceof Error \? e\.message : 'Bağlantı kurulamadı\.'\)/);
  });

  it('Genel Bakış bağlantısı tek üreticiden', () => {
    const b = yorumsuz(join(__dirname, '..', 'components', 'report', 'haftalik-ozet-baglantisi.tsx'));
    expect(b).toContain('href={ozetPanelYolu(clientId, hafta)}');
    const gb = yorumsuz(join(__dirname, '..', 'app', '(dashboard)', 'dashboard', 'page.tsx'));
    expect(gb).toContain('<HaftalikOzetBaglantisi clientId={session.activeClientId} />');
  });
});
