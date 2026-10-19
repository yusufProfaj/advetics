import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * ═══ MARKA MERKEZİ TELEFONDA SAĞA TAŞMIYOR ═══
 * 2026-10-19, canlı: Workspace bilgileri 375 piksellik ekranda 780 piksel
 * çiziliyordu. Son işler tablosu `overflow-x-auto` içindeydi ama atalarındaki
 * SÜTUNSUZ ızgaralar (`grid gap-4`) örtük bir `auto` sütun açıyor ve o sütun
 * en geniş çocuğun min-content'inden daralmıyor; kaydırma kabı da kendi
 * içeriğinin genişliğini ataya bildiriyor. Yanında iki kaynak daha: kırılmayan
 * rapor alıcıları satırı ve tek satırlık "Kaydet ve deneme mesajı gönder".
 *
 * Kaynak taraması yorumsuz kaynakta (docs/kurallar/test.md): yorumdaki bir
 * `grid gap-4` örneği testi yanıltmasın.
 */
const yorumsuz = (yol: string) =>
  readFileSync(join(__dirname, yol), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const SAYFA = yorumsuz('../../app/(dashboard)/marka-merkezi/page.tsx');

/** `className="..."` içindeki sınıf listeleri; `grid` taşıyanlar. */
function izgaralar(kaynak: string): string[] {
  const hepsi = [...kaynak.matchAll(/className=["`{]+([^"`]*)["`]/g)].map((m) => m[1]);
  return hepsi.filter((s) => s.split(/\s+/).includes('grid'));
}

describe('Marka Merkezi dar ekran taşması', () => {
  it('KRİTİK: sayfadaki her ızgara sütununu yazıyor (örtük auto sütun yok)', () => {
    const liste = izgaralar(SAYFA);
    // Dilim boşalırsa test boşuna yeşil kalmasın: sayfada en az altı ızgara var.
    if (liste.length < 6) throw new Error(`page.tsx'te ${liste.length} ızgara bulundu; tarama bozulmuş olabilir`);
    const sutunsuz = liste.filter((s) => !/(^|\s)grid-cols-/.test(s));
    expect(sutunsuz).toEqual([]);
  });

  it('KRİTİK: iç düzenin içerik sütunu çocuklarını da daraltıyor', () => {
    expect(yorumsuz('../ui/sayfa-ic-menu.tsx')).toContain(
      '<div className="grid min-w-0 grid-cols-1 content-start gap-5">{children}</div>',
    );
  });

  it('KRİTİK: detay satırının değeri kırılıyor, etiketi küçülmüyor', () => {
    const k = yorumsuz('../tenancy/musteri-detay.tsx');
    expect(k).toContain('<span className="shrink-0 text-xs text-ink-muted">{etiket}</span>');
    expect(k).toContain('min-w-0 text-right text-xs [overflow-wrap:anywhere]');
  });

  it('firma ızgarası telefonda tek ve daralabilen sütun', () => {
    const k = yorumsuz('firma-bilgileri.tsx');
    expect(k).toContain('<div className="grid grid-cols-1 gap-4 md:grid-cols-2">');
    expect(k.match(/<div className="min-w-0">\s*<p className="mb-1 text-xs font-semibold text-ink">/g)?.length).toBe(2);
  });

  it('kanal formunun düğmeleri telefonda alt alta ve sarılabiliyor', () => {
    const k = yorumsuz('bildirimler-bolumu.tsx');
    expect(k).toContain('<div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">');
    expect(k).toContain('max-sm:!whitespace-normal');
    expect(k).toContain('grid grid-cols-1 items-center gap-x-3');
  });
});
