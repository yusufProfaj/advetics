import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { onizlemeAcikMi } from './breakdown-table';

/**
 * ═══ REKLAM ÖNİZLEMESİ — HİYERARŞİNİN SON BASAMAĞI ═══
 *
 * Kullanıcının isteği birebir: "reklam seti › reklam › reklam önizlemesi",
 * dropdown şeklinde ve "farklı reklamın önizlemesini görmek istediğimde
 * diğerinin kapanıp tıkladığım reklamın açılması".
 *
 * Tabloda reklamın yalnızca adı ve sayıları duruyordu; "bu reklam neye
 * benziyor" sorusunun cevabı için Reklam Keşfi ekranına gidip aynı reklamı
 * yeniden bulmak gerekiyordu.
 *
 * Bileşen render edilmiyor (`vitest.config.ts` bunu bilinçli reddediyor),
 * o yüzden kararlar kaynak taramasıyla sınanıyor.
 */
const DIR = __dirname;

function kod(yol: string): string {
  return readFileSync(join(DIR, yol), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const ONIZLEME = kod('reklam-onizleme.tsx');
const TABLO = kod('breakdown-table.tsx');

describe('tarama boşa düşmüyor', () => {
  it('iki kaynak da okundu', () => {
    expect(ONIZLEME).toContain('ReklamOnizleme');
    expect(TABLO).toContain('BreakdownTable');
  });
});

describe('açılır önizleme', () => {
  /*
   * 2026-10-09: anahtar eklendi ("açınca hepsi açık, kapatınca hepsi kapalı,
   * tek tek elle de açılmalı"). Eski "aynı anda tek önizleme" isteği anahtar
   * KAPALIYKEN hâlâ geçerli. Karar saf fonksiyonda ve ÇALIŞTIRILARAK
   * sınanıyor: kaynak taraması kuralı değil yalnızca yazımı kilitlerdi.
   */
  const bos = new Set<string>();
  it('KRİTİK: anahtar KAPALIYKEN aynı anda tek önizleme açık', () => {
    const d = { hepsiAcik: false, tekAcik: 'a', kapatilan: bos };
    expect(onizlemeAcikMi(d, 'a')).toBe(true);
    expect(onizlemeAcikMi(d, 'b')).toBe(false);
    // Başka satıra tıklamak tek kimliği DEĞİŞTİRİYOR, kümeye eklemiyor.
    expect(TABLO).toContain('kurVeAc([id], () => setTekAcik(id));');
  });

  it('KRİTİK: anahtar AÇIKKEN hepsi açık, tek tek kapatılan kapalı', () => {
    const d = { hepsiAcik: true, tekAcik: null, kapatilan: new Set(['b']) };
    expect(onizlemeAcikMi(d, 'a')).toBe(true);
    expect(onizlemeAcikMi(d, 'b')).toBe(false);
  });

  it('KRİTİK: anahtar değişince tek tek seçimler sıfırlanıyor', () => {
    // Yoksa "hepsini kapat" deyip bir satırı açık bulmak mümkün olurdu.
    const g = TABLO.slice(TABLO.indexOf('function hepsiniDegistir()'));
    expect(g.length).toBeGreaterThan(50);
    expect(g.slice(0, 200)).toContain('setKapatilan(new Set());');
    expect(g.slice(0, 200)).toContain('setTekAcik(null);');
  });

  it('KRİTİK: anahtar ve satır açma yalnızca REKLAM seviyesinde', () => {
    // Kampanya ve reklam setinde satır bir ALT LİSTEYE gidiyor; orada
    // açılır kutu, iki farklı tıklama anlamı demekti.
    expect(TABLO).toContain(": level === 'ad' ? (");
    expect(TABLO).toContain("{level === 'ad' && rows.length > 0 && (");
  });

  it('KRİTİK: durum ERİŞİLEBİLİR olarak duyuruluyor', () => {
    expect(TABLO).toContain('aria-expanded={acikMi(r.entityId)}');
    expect(TABLO).toContain('role="switch"');
    expect(TABLO).toContain('aria-checked={hepsiAcik}');
  });

  it("KRİTİK: animasyon hatasız — açılmış önizleme DOM'da kalıyor, kapalıyken inert", () => {
    expect(TABLO).toContain('{(acilmis.has(r.entityId) || acikMi(r.entityId)) && (');
    expect(TABLO).toContain('inert={!acikMi(r.entityId)}');
    expect(TABLO).toContain('transition-[grid-template-rows]');
    expect(TABLO).toContain('requestAnimationFrame(() => requestAnimationFrame(ac));');
  });

  it('KRİTİK: önizleme KENDİ SATIRINDA, colSpan ile', () => {
    /*
     * Hücrenin içine koymak tabloyu bozuyor: kart sütun genişliğine sıkışıp
     * okunmaz hâle geliyor ve komşu hücrelerin yüksekliğini şişiriyor.
     */
    expect(TABLO).toContain('colSpan={showRoas ? 9 : 8}');
  });
});

describe('önizleme verisi', () => {
  it('KRİTİK: KART YENİDEN YAZILMADI — `AdCard` kullanılıyor', () => {
    /*
     * `AdCard` içinde canlıda öğrenilmiş kararlar var: arama reklamının
     * kreatifi METNİDİR, görsel `contain` ile çiziliyor, "görsel yok" üç
     * ayrı hâli ayırıyor, platform önizlemesine bağlantı veriyor. İkinci
     * bir önizleme yazmak bunların hepsini ikinci kez öğrenmekti.
     */
    expect(ONIZLEME).toContain("import { AdCard } from '@/components/ad-card'");
    expect(ONIZLEME).toContain('<AdCard ad={reklam}');
  });

  it('KRİTİK: veri AÇILDIĞINDA çekiliyor — önden değil', () => {
    // Tabloda yirmi beş satır var; hepsinin kreatifini önden çekmek yirmi
    // beş istek demek.
    expect(ONIZLEME).toContain('useEffect');
    expect(ONIZLEME).toContain('`/ads/${adId}?from=${from}&to=${to}`');
  });

  it('KRİTİK: YARIŞAN İSTEK ATILIYOR', () => {
    /*
     * Kullanıcı hızlıca iki reklam açarsa geç gelen cevap YENİ satırın
     * altına ESKİ reklamı çizerdi — hata vermeden yanlış önizleme.
     */
    expect(ONIZLEME).toContain('let birakildi = false;');
    expect(ONIZLEME).toContain('if (!birakildi) setReklam(r);');
  });

  it('KRİTİK: hata YUTULMUYOR ve yükleniyor hâlinden AYRI', () => {
    /*
     * `.catch(() => null)` yazmak "yükleniyor" ile "çağrı düştü"yü aynı boş
     * alana çevirirdi; bu depoda adı konmuş yasak.
     */
    expect(ONIZLEME).toContain('ApiRequestError');
    expect(ONIZLEME).toContain('Önizleme yükleniyor…');
    expect(ONIZLEME).toContain("role=\"alert\"");
  });
});
