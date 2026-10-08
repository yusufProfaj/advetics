import { describe, expect, it } from 'vitest';
import { youtubeIzleri } from './youtube-site-baglantilari';

describe('sitedeki YouTube izleri', () => {
  it('kanal bağlantısının dört biçimi', () => {
    const iz = youtubeIzleri(`
      <a href="https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv">kanal</a>
      <a href="https://youtube.com/@EgeBirlik">tanıtıcı</a>
      <a href="//m.youtube.com/user/egebirlikyapi">eski</a>
      <a href="https://www.youtube.com/c/EgeBirlikYap%C4%B1">özel</a>`);
    expect(iz.kanalKimlikleri).toEqual(['UCabcdefghijklmnopqrstuv']);
    expect(iz.tanitcilar).toEqual(['egebirlik']);
    expect(iz.kullaniciAdlari).toEqual(['egebirlikyapi']);
    expect(iz.ozelAdlar).toEqual(['EgeBirlikYapı']);
  });

  it('gömülü ve bağlantılı videolar: embed, nocookie, watch (&amp; ile), youtu.be, shorts', () => {
    const iz = youtubeIzleri(`
      <iframe src="https://www.youtube.com/embed/AAAAAAAAAAA?rel=0"></iframe>
      <iframe src="https://www.youtube-nocookie.com/embed/BBBBBBBBBBB"></iframe>
      <a href="https://www.youtube.com/watch?list=x&amp;v=CCCCCCCCCCC">izle</a>
      <a href="https://youtu.be/DDDDDDDDDDD">kısa</a>
      <a href="https://youtube.com/shorts/EEEEEEEEEEE">shorts</a>`);
    expect(iz.videoKimlikleri.sort()).toEqual(['AAAAAAAAAAA', 'BBBBBBBBBBB', 'CCCCCCCCCCC', 'DDDDDDDDDDD', 'EEEEEEEEEEE']);
  });

  it('aynı bağlantı her sayfada tekrar etse de bir kez; tanıtıcı büyük/küçük harf duyarsız', () => {
    const iz = youtubeIzleri('<a href="https://youtube.com/@Ege">x</a>'.repeat(30) + '<a href="https://youtube.com/@ege">y</a>');
    expect(iz.tanitcilar).toEqual(['ege']);
  });

  it('sınırlı: en çok 5 kanal (önce kesin biçim) ve 10 video', () => {
    const kimlikler = Array.from({ length: 4 }, (_, i) => `https://youtube.com/channel/UC${String(i).repeat(22)}`);
    const tanitcilar = Array.from({ length: 4 }, (_, i) => `https://youtube.com/@kanal${i}`);
    const videolar = Array.from({ length: 15 }, (_, i) => `https://youtu.be/${String(i).padStart(11, 'v')}`);
    const iz = youtubeIzleri([...kimlikler, ...tanitcilar, ...videolar].map((u) => `<a href="${u}">x</a>`).join(''));
    expect(iz.kanalKimlikleri).toHaveLength(4);
    expect(iz.tanitcilar).toHaveLength(1);
    expect(iz.videoKimlikleri).toHaveLength(10);
  });

  it('YouTube olmayan bağlantıları yok sayıyor', () => {
    const iz = youtubeIzleri('<a href="https://notyoutube.com/@x">x</a><a href="https://instagram.com/ege">i</a>');
    expect(iz).toEqual({ kanalKimlikleri: [], tanitcilar: [], kullaniciAdlari: [], ozelAdlar: [], videoKimlikleri: [] });
  });
});
