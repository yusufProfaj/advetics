import { describe, expect, it, vi } from 'vitest';
import { GORU_AYARI, goruBicimi } from '@advetics/shared';
import { goruIcinIndir, gorselIndir } from '../reports/kreatif-gorseli';

/**
 * ═══ GÖRÜ İÇİN İNDİRME — RAPORLA AYNI KORUMALAR, GENİŞ BİÇİM ═══
 *
 * WebP görüye giriyor ama rapor yoluna (pdf-lib) girmiyor; iki yol aynı
 * çekirdekten. İddialar SEBEBE çapalı: "reddedildi" demek yetmez, neden
 * reddedildiği (CLAUDE.md, kreatif-gorseli mutasyon dersi).
 */

const AYAR = { maxBayt: GORU_AYARI.maxBayt, zamanAsimiMs: 1000, bicimAnla: goruBicimi, bicimHatasi: 'desteklenmeyen biçim' };
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1, 2, 3, 4]);
const yanit = (govde: Uint8Array, durum = 200) => vi.fn(async () => new Response(govde, { status: durum }));

describe('goruIcinIndir', () => {
  it('KRİTİK: WebP görüde kabul, rapor yolunda RET (iki yol tek çekirdek, farklı biçim listesi)', async () => {
    const getir = yanit(WEBP);
    const g = await goruIcinIndir('https://scontent.fbcdn.net/x.webp', AYAR, { getir: getir as never });
    expect(g).toMatchObject({ ok: true, tur: 'webp' });
    const r = await gorselIndir('https://scontent.fbcdn.net/x.webp', { getir: yanit(WEBP) as never });
    expect(r.ok === false && r.sebep).toContain('JPEG/PNG');
  });

  it('KRİTİK: beyaz liste ve IP reddi rapordakiyle AYNI; kod "adres", istek HİÇ atılmıyor', async () => {
    const getir = yanit(WEBP);
    const ip = await goruIcinIndir('https://169.254.169.254/latest', AYAR, { getir: getir as never });
    expect(ip).toMatchObject({ ok: false, kod: 'adres' });
    expect(ip.ok === false && ip.sebep).toContain('IP adresi');
    const yabanci = await goruIcinIndir('https://x.fbcdn.net.evil.com/a.jpg', AYAR, { getir: getir as never });
    expect(yabanci.ok === false && yabanci.sebep).toContain('bilinmeyen sunucu');
    expect(getir).not.toHaveBeenCalled();
  });

  it('boyut sınırı GÖVDE okunurken (kod "boyut", kalıcı), yönlendirme izlenmiyor (kod "ag")', async () => {
    const dev = await goruIcinIndir('https://scontent.fbcdn.net/b.jpg', { ...AYAR, maxBayt: 8 }, { getir: yanit(WEBP) as never });
    expect(dev).toMatchObject({ ok: false, kod: 'boyut', sebep: 'görsel çok büyük' });
    const yon = await goruIcinIndir('https://scontent.fbcdn.net/c.jpg', AYAR, {
      getir: vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://evil.com' } })) as never,
    });
    expect(yon).toMatchObject({ ok: false, kod: 'ag', sebep: 'yönlendirme izlenmiyor' });
  });
});
