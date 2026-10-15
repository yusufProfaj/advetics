import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { etkinSatiriGoster } from './kaydirilan-menu';

/* Alçak ekranda etkin menü satırı solmanın altında kalıyordu (canlı denetim). */
describe('kenar menüsünde etkin satır', () => {
  it('KRİTİK: etkin satır en yakın kenara kaydırılıyor (görünürse kıpırdamıyor)', () => {
    const kaydir = vi.fn();
    const sorgu = vi.fn(() => ({ scrollIntoView: kaydir }));
    etkinSatiriGoster({ querySelector: sorgu } as unknown as HTMLElement);
    expect(sorgu).toHaveBeenCalledWith('[aria-current="page"]');
    expect(kaydir).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('etkin satır yoksa ya da kap yoksa hata vermiyor', () => {
    expect(() => etkinSatiriGoster(null)).not.toThrow();
    expect(() => etkinSatiriGoster({ querySelector: () => null } as unknown as HTMLElement)).not.toThrow();
  });

  it('KRİTİK: kenar çubuğu menüyü bu sarmalayıcıyla ve solma payıyla çiziyor', () => {
    const k = readFileSync(join(__dirname, 'kenar-cubugu.tsx'), 'utf8');
    expect(k).toContain('<KaydirilanMenu');
    expect(k).toContain('scroll-pb-8 overflow-y-auto');
  });
});
