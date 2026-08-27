import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ BEKLEME GÖSTERGESİ ═══
 *
 * Kullanıcının bildirdiği hâl: *"ufak veri getirme beklemesi yaşıyoruz bu
 * normal ama bunu belirten herhangi bir görsel yok"*.
 *
 * ARKASINDA GERÇEK BİR ARIZA VARDI ve bu paketin asıl konusu o: gösterge
 * eksik değildi, YANLIŞ PENCEREDE açıktı. `router.refresh()` beklenebilir
 * bir şey döndürmüyor — çağrı hemen geri geliyor, sunucu render'ı arkada
 * sürüyor. `finally` içindeki `setPending(false)` bu yüzden asıl beklemenin
 * BAŞINDA koşuyordu: bayrak, kullanıcının beklediği saniyelerde kapalıydı.
 * Bir spinner eklemek tek başına hiçbir şeyi düzeltmezdi — spinner da aynı
 * anda sönerdi.
 */
const YUK = readFileSync(join(__dirname, 'yukleniyor.tsx'), 'utf8');
const SECICI = readFileSync(join(__dirname, 'client-switcher.tsx'), 'utf8');
const TABLO = readFileSync(join(__dirname, 'musteri-tablosu.tsx'), 'utf8');
const SIHIRBAZ = readFileSync(
  join(__dirname, 'tenancy', 'client-setup-wizard.tsx'),
  'utf8',
);
const CSS = readFileSync(join(__dirname, '..', 'app', 'globals.css'), 'utf8');

/** Yorum satırlarını atar — dosyalar bu kuralları ANLATAN yorumlar taşıyor. */
function kod(src: string): string {
  return src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

const SECICI_KOD = kod(SECICI);
const TABLO_KOD = kod(TABLO);
const SIHIRBAZ_KOD = kod(SIHIRBAZ);

describe('tarama gerçekten bir şey yakaladı', () => {
  it('dilimler boş değil', () => {
    expect(kod(YUK).length).toBeGreaterThan(800);
    expect(SECICI_KOD).toContain('switch-client');
  });
});

describe('KRİTİK: bekleme penceresi tazelemeyi kapsıyor', () => {
  /*
   * Bu üç iddia bu değişikliğin tamamı. Gösterge bileşeni silinse testler
   * yine düşer — çünkü sınanan şey görsel değil, göstergenin AÇIK OLDUĞU
   * ZAMAN ARALIĞI.
   */
  it('müşteri seçici: refresh startTransition içinde', () => {
    expect(SECICI_KOD).toContain('startTransition(() => router.refresh())');
  });

  it('müşteri seçici: gösterge İKİ bayrağı da okuyor', () => {
    // Yalnızca `pending`e bakmak, ağ isteği bitip tazeleme sürerken
    // göstergeyi söndürüyordu — düzeltilen arızanın ta kendisi.
    expect(SECICI_KOD).toContain('const bekliyor = pending || isPending;');
    expect(SECICI_KOD).toContain('{bekliyor && (');
  });

  it('kurulum sihirbazı: refresh startTransition içinde', () => {
    expect(SIHIRBAZ_KOD).toContain('startTransition(() => router.refresh())');
    expect(SIHIRBAZ_KOD).toContain('busy || isPending');
  });

  it('müşteri tablosu: geçiş sırasında örtü var', () => {
    expect(TABLO_KOD).toContain('{(gecilen !== null || isPending) && (');
    expect(TABLO_KOD).toContain('TamEkranYukleniyor');
  });
});

describe('KRİTİK: geçiş hatası yutulmuyor', () => {
  it('müşteri seçicide catch VAR ve mesaj ekrana yazılıyor', () => {
    /*
     * Önceki hâlde `catch` HİÇ YOKTU: istek düşünce tıklama sessizce hiçbir
     * şey yapmıyor, üst bar eski müşteriyi göstermeye devam ediyordu.
     * İddia CATCH GÖVDESİNE çapalı — `setHata` adı dosyanın başka yerinde de
     * geçiyor ve ona bakan bir iddia catch silindiğinde de tutardı.
     */
    const i = SECICI_KOD.indexOf('} catch (e) {');
    expect(i, 'select() içinde catch yok — tarama boşa düştü').toBeGreaterThan(-1);
    const yakala = SECICI_KOD.slice(i, SECICI_KOD.indexOf('\n    }', i));
    expect(yakala).toContain('setHata(');
    expect(SECICI_KOD).toContain('role="alert"');
  });
});

describe('göstergenin kendisi', () => {
  it('KRİTİK: ne beklendiği YAZILI — sadece "yükleniyor" değil', () => {
    /*
     * "Yükleniyor…" tek başına, üç saniye sonra "takıldı mı" sorusunu
     * doğuruyor; hedefin adı bekleyişi anlamlı kılıyor ve yanlış satıra
     * tıklandığını hemen gösteriyor.
     */
    expect(kod(YUK)).toContain('{ mesaj }');
    expect(SECICI_KOD).toContain('görünümüne geçiliyor…');
    expect(TABLO_KOD).toContain('görünümüne geçiliyor…');
  });

  it('marka rengini kullanıyor — genel bir spinner değil', () => {
    expect(kod(YUK)).toContain('var(--brand-primary)');
    expect(kod(YUK)).toContain('/advetics-logo.png');
  });

  it('KRİTİK: animasyonlar prefers-reduced-motion altında', () => {
    /*
     * Hareket duyarlılığı olan kullanıcı için animasyonun DURMASI doğru
     * davranış. Gösterge kaybolmuyor — nokta ve bant duruyor, yalnızca
     * kıpırdamıyor: sınıflar dışarıda tanımlı, animasyon içeride.
     */
    const i = CSS.indexOf('@media (prefers-reduced-motion: no-preference)', CSS.indexOf('advetics-nokta'));
    expect(i).toBeGreaterThan(-1);
    const blok = CSS.slice(i, i + 400);
    for (const s of ['.advetics-nokta', '.advetics-tarama', '.advetics-donus']) {
      expect(blok, `${s} hareket bloğunun dışında`).toContain(s);
    }
  });

  it('ekran okuyucuya duyuruluyor', () => {
    const k = kod(YUK);
    expect(k).toContain('role="status"');
    expect(k).toContain('aria-busy="true"');
    expect(k).toContain('aria-live="polite"');
  });
});
