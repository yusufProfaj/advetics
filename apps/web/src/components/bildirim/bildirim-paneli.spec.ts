import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sureMetni } from './bildirim-zili';

/**
 * ═══ BİLDİRİM PANELİ — PANEL KARARLARI ═══
 *
 * Bileşen burada render edilmiyor (`vitest.config.ts` bunu bilinçli
 * reddediyor); iddialar kaynağa çapalı ama her biri TEK bir karara.
 *
 * Bir bildirim sisteminde en pahalı hata SESSİZ olanı: gösterilmeyen bir
 * onay, hiç istenmemiş onayla aynı. İkinci pahalı hata gürültü: her gün
 * dürten bir bildirim, kullanıcıyı bütün bildirimleri görmezden gelmeye
 * alıştırıyor — kullanıcının bildirdiği arıza (*"sürekli şimdi yetkilendir
 * bildirimi gözüküp duruyor"*) tam olarak ikincisiydi.
 */
function kod(src: string): string {
  return src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

const ZIL = kod(readFileSync(join(__dirname, 'bildirim-zili.tsx'), 'utf8'));
const SAGLAYICI = kod(readFileSync(join(__dirname, 'bildirim-verisi.tsx'), 'utf8'));

describe('tarama boşa düşmüyor', () => {
  it('iki dosya da okundu ve gövdelerini taşıyor', () => {
    expect(ZIL).toContain('export function BildirimZili');
    expect(SAGLAYICI).toContain('export function BildirimSaglayici');
    expect(ZIL.length).toBeGreaterThan(2000);
  });
});

describe('KRİTİK: boost ÖN PLANDA', () => {
  it('boost bölümü sorunlardan ÖNCE çiziliyor', () => {
    /*
     * Kullanıcının isteği birebir: *"hangi şirketteysem ya da ekrandaysam
     * bu bildirim panelinde boostun da ön planda olması gerekicek."*
     * Onay bekleyen boost tek "yapılacak iş" türü; diğer iki bölüm bir
     * DURUM bildiriyor.
     */
    const boost = ZIL.indexOf('<BoostBolumu');
    const sorun = ZIL.indexOf('<SorunBolumu');
    const durum = ZIL.indexOf('<DurumBolumu');
    expect(boost, 'boost bölümü çizilmiyor').toBeGreaterThan(-1);
    expect(boost).toBeLessThan(sorun);
    expect(sorun).toBeLessThan(durum);
  });

  it('KRİTİK: yalnızca ONAY BEKLEYEN kartlar sayılıyor', () => {
    // Onaylanmış ya da reddedilmiş kartı rozete katmak, hiçbir zaman
    // sıfırlanmayan bir sayaç üretirdi.
    expect(ZIL).toContain("boostKuyrugu?.items.filter((i) => i.status === 'pending')");
  });
});

describe('KRİTİK: rozet EYLEM GEREKTİREN işi sayıyor', () => {
  it('durum satırları sayıma GİRMİYOR', () => {
    /*
     * Yetkinin 47 gün sonra dolacağı bir yapılacak iş değil. Rozette
     * görünmesi, kullanıcıyı hiçbir zaman sıfırlanmayan bir sayıya
     * alıştırırdı — bu depoda "481 hesap izlenmiyor" sayacıyla aynı hata.
     */
    const bas = ZIL.indexOf('const sayac =');
    expect(bas, 'sayaç bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const dilim = ZIL.slice(bas, ZIL.indexOf(';', bas));
    expect(dilim).toContain('bekleyenBoost.length');
    expect(dilim).toContain('sorunlar.length');
    expect(dilim).not.toContain('baglantilar');
  });
});

describe('KRİTİK: boş liste SEBEBİNİ söylüyor', () => {
  it('boost bölümü DÖRT hâli ayrı ayrı yazıyor', () => {
    /*
     * "istenmedi", "kapsam dışı", "hata" ve "gerçekten boş" dördü ayrı iş.
     * Aynı boş alana çevirmek, bekleyen bir onayın "yok" sanılması demek.
     */
    expect(ZIL).toContain('Boost kuyruğu alınamadı');
    expect(ZIL).toContain('Boost kuyruğu workspace bazlı');
    expect(ZIL).toContain('bosSebebi ?? ');
  });

  it('KRİTİK: sağlayıcı "istenmedi" ile "boş"u AYIRIYOR', () => {
    // `null` = istenmedi/istenemez, boş dizi = istendi ve yok. Aynı değere
    // indirgemek dördüncü hâli kaybetmek olurdu.
    expect(SAGLAYICI).toContain('boostKuyrugu: AutoBoostQueueList | null');
    // Ve panel bu ayrımı GERÇEKTEN kullanıyor: `null` "istenmedi",
    // boş dizi "istendi ve yok".
    expect(ZIL).toContain('istendi={boostKuyrugu !== null}');
  });
});

describe('KRİTİK: boost kuyruğu UYDURMA kapsamla istenmiyor', () => {
  it('workspace seçili değilse çağrı HİÇ yapılmıyor', () => {
    /*
     * `/autoboost/queue` zorunlu bir `clientId` alıyor. Ajans ya da şirket
     * geneli görünümde "ilk workspace"i seçmek, kullanıcıya BAŞKA birinin
     * kuyruğunu göstermek olurdu.
     */
    const bas = SAGLAYICI.indexOf('apiFetch<AutoBoostQueueList>');
    expect(bas, 'boost çağrısı bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    expect(SAGLAYICI).toContain('if (aktifWorkspaceId === null || !boostGorunur) return;');
  });

  it('kapsam değişince kuyruk SIFIRLANIYOR', () => {
    // Eski workspace'in kartları yeni kapsamda ekranda kalsaydı, kullanıcı
    // başka bir müşterinin gönderisini onaylayabilirdi.
    const bas = SAGLAYICI.indexOf('setBoostKuyrugu(null);');
    expect(bas).toBeGreaterThan(-1);
    expect(SAGLAYICI).toContain('}, [aktifWorkspaceId, boostGorunur]);');
  });
});

describe('sureMetni', () => {
  it('KRİTİK: DOLMUŞ süre "0 gün" değil, ne kadar önce dolduğu', () => {
    /*
     * Sıfıra kırpmak, üç gün önce dolmuş bir bağlantıyı bugün dolmuş gibi
     * gösterirdi ve "acaba şimdi mi oldu" diye baktırırdı.
     */
    expect(sureMetni({ durum: 'active', kalanGun: -3 })).toBe('3 gün önce doldu');
    expect(sureMetni({ durum: 'active', kalanGun: 0 })).toBe('bugün doluyor');
    expect(sureMetni({ durum: 'active', kalanGun: 47 })).toBe('47 gün');
  });

  it('KRİTİK: son tarihi olmayan bağlantı "süresiz" DEMİYOR', () => {
    /*
     * "Süresiz" okuyan "hiç dokunmam gerekmeyecek" diye anlıyor; oysa
     * iptal edilen bir yetki her platformda mümkün.
     */
    expect(sureMetni({ durum: 'active', kalanGun: null })).toBe('otomatik');
  });

  it('bozuk bağlantıda süre DEĞİL, yapılacak iş yazıyor', () => {
    expect(sureMetni({ durum: 'needs_reauth', kalanGun: 40 })).toBe('yetki gerekiyor');
  });
});
