import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ MÜŞTERİ ARAMA VE YÖNETİM PANELİ ═══
 *
 * Üç yüzey: üst bardaki seçicinin içindeki arama, Müşteriler ekranının arama
 * barı ve seçiciden açılan Yönetim paneli penceresi. Üçü de liste büyüdükçe
 * "aradığım müşteri ekranın dışında" sorununu çözüyor.
 *
 * Bileşenler DOM'da sınanmıyor (kurulum yok); iddialar kaynağa çapalı ama her
 * biri tek bir karara ve o kararın koddaki tek satırına.
 */
const ARAMA = readFileSync(join(__dirname, 'musteri-arama.tsx'), 'utf8');
const PANEL = readFileSync(join(__dirname, 'yonetim-paneli.tsx'), 'utf8');
const SECICI = readFileSync(join(__dirname, '..', 'client-switcher.tsx'), 'utf8');

/** Yorum satırlarını atar — iddia yoruma değil koda çapalanmalı. */
function kod(src: string): string {
  return src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

describe('müşteri arama', () => {
  it('KRİTİK: üç yüzeyde de TÜRKÇE küçültme kullanılıyor', () => {
    /*
     * Varsayılan `toLowerCase()` "İ" harfini "i̇" (i + birleşen nokta)
     * yapıyor; "İkon" araması "ikon" ile EŞLEŞMİYOR. Türkçe adlarda sessiz
     * ve şaşırtıcı bir boş sonuç — ve bu panelin bütün müşteri adları
     * Türkçe.
     */
    for (const [ad, src] of [
      ['müşteri arama', ARAMA],
      ['yönetim paneli', PANEL],
      ['seçici', SECICI],
    ] as const) {
      expect(kod(src), `${ad} varsayılan küçültme kullanıyor`).not.toMatch(/\.toLowerCase\(\)/);
      expect(kod(src), `${ad} Türkçe küçültme kullanmıyor`).toContain("toLocaleLowerCase('tr')");
    }
  });

  it('KRİTİK: seçicide arama EN ÜSTTE', () => {
    // Liste büyüdükçe aranan ad ekranın dışında kalıyor.
    const i = kod(SECICI).indexOf('role="listbox"');
    expect(i, 'açılır liste bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const dilim = kod(SECICI).slice(i);
    expect(dilim.indexOf('type="search"')).toBeLessThan(dilim.indexOf('<Option'));
  });

  it('KRİTİK: "Yönetim paneli" bir EYLEM — listenin üyesi gibi görünmüyor', () => {
    /*
     * Marka renginde dolu ve beyaz yazılı: bir workspace SEÇMİYOR, yeni bir
     * pencere açıyor. Diğer satırlarla aynı görünseydi "bu da bir müşteri
     * mi" diye okunurdu.
     */
    const i = kod(SECICI).indexOf('Yönetim paneli');
    expect(i, 'yönetim paneli girişi bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const dugme = kod(SECICI).slice(kod(SECICI).lastIndexOf('<button', i), i);
    expect(dugme).toContain('bg-brand');
    expect(dugme).toContain('text-white');
  });

  it('KRİTİK: arama HER AÇILIŞTA sıfırlanıyor', () => {
    // Önceki aramayla açılan liste, kullanıcının aradığı müşteriyi "yok"
    // gibi gösteriyor.
    expect(kod(SECICI)).toContain("setArama('');");
  });

  it('KRİTİK: boş sonuç SEBEBİYLE yazılıyor', () => {
    /*
     * Sessiz boş liste "müşteri yok" ile "arama tutmadı" hâllerini aynı
     * ekrana çeviriyor — bu projenin tekrar eden hata deseni.
     */
    for (const [ad, src] of [
      ['seçici', SECICI],
      ['müşteri arama', ARAMA],
      ['yönetim paneli', PANEL],
    ] as const) {
      expect(kod(src), `${ad} boş sonucu açıklamıyor`).toContain('ile eşleşen');
    }
  });

  it('KRİTİK: yönetim paneli veriyi AÇILDIĞINDA çekiyor', () => {
    /*
     * Pencere çoğu oturumda hiç açılmıyor ve `/clients` her müşterinin hesap
     * listesini taşıyor; her sayfa yüklemesinde çekmek ilk ekranı
     * yavaşlatırdı.
     */
    const i = kod(PANEL).indexOf('useEffect');
    expect(i).toBeGreaterThan(-1);
    const dilim = kod(PANEL).slice(i, kod(PANEL).indexOf('}, [acik, veri]);'));
    expect(dilim).toContain('if (!acik || veri !== null) return;');
  });

  it('KRİTİK: yönetim panelinde hata YUTULMUYOR', () => {
    /*
     * `.catch(() => setVeri([]))` yazmak "henüz yüklenmedi", "hiç müşteri
     * yok" ve "çağrı düştü" hâllerini AYNI boş pencereye çevirirdi.
     */
    expect(kod(PANEL)).toContain("setHata('Müşteri listesi alınamadı.')");
    expect(kod(PANEL)).not.toContain('setVeri([])');
  });

  it('yönetim paneli ESC ile kapanıyor', () => {
    expect(kod(PANEL)).toContain("if (e.key === 'Escape') onKapat();");
  });

  it('KRİTİK: müşteri kartları SUNUCUDA kuruluyor', () => {
    /*
     * Kartların kendisini istemciye taşımak, içlerindeki sunucu tarafı veri
     * çözümlerini de taşımak olurdu; istemci yalnızca HANGİ kartın
     * görüneceğine karar veriyor.
     */
    expect(kod(ARAMA)).toContain('icerik: ReactNode');
    const sayfa = readFileSync(
      join(__dirname, '..', '..', 'app', '(dashboard)', 'ayarlar', 'musteriler', 'page.tsx'),
      'utf8',
    );
    expect(kod(sayfa)).toContain('<MusteriArama');
    expect(kod(sayfa)).toContain('icerik: (');
  });
});
