import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ BAĞLANTI UYARISI SERVİSTE DE TEKİL OLMAK ZORUNDA ═══
 *
 * Kural fonksiyonunun (`baglantiUyarilari`) doğru olması yetmiyor: onu
 * hesap döngüsünün İÇİNDEN çağırmak, düzeltilen arızayı birebir geri
 * getirirdi — ajansın tek Meta bağlantısı onlarca hesaba hizmet ediyor ve
 * her hesap için bir kopya üretilirdi.
 *
 * Bu testi MUTASYON yazdırdı: `alerts.service.ts` içindeki çağrıyı tamamen
 * sildiğimde hiçbir test düşmedi. Servis gerçek bir veritabanı ve kiracı
 * bağlamı istiyor; karar kaynak taramasıyla kilitleniyor ve iddialar
 * `list()` gövdesine çapalı.
 */
const KAYNAK = readFileSync(resolve(__dirname, 'alerts.service.ts'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

const GOVDE = (() => {
  const bas = KAYNAK.indexOf('async list(');
  if (bas < 0) throw new Error('`list()` gövdesi bulunamadı — tarama boşa düştü');
  return KAYNAK.slice(bas);
})();

describe('tarama boşa düşmüyor', () => {
  it('gövde okundu ve hesap döngüsünü taşıyor', () => {
    expect(GOVDE).toContain('for (const h of hesaplar)');
    expect(GOVDE.length).toBeGreaterThan(1000);
  });
});

describe('KRİTİK: bağlantı uyarısı BAĞLANTI BAŞINA üretiliyor', () => {
  it('çağrı bağlantı döngüsünde, hesap döngüsünde DEĞİL', () => {
    expect(GOVDE).toContain('baglantiUyarilari(b, simdi)');
    // Hesap satırı `h`; bağlantı uyarısının `h` ile çağrılması, kopyaların
    // geri gelmesi demekti.
    expect(GOVDE).not.toContain('baglantiUyarilari(h');
  });

  it('bağlantılar KİMLİĞE göre tekilleştiriliyor', () => {
    /*
     * Dizi kullanıp `push` etmek aynı bağlantıyı onlarca kez eklerdi ve
     * `Map` olmadan bunu hiçbir şey engellemezdi.
     */
    expect(GOVDE).toContain('new Map<string, UyariBaglantisi>()');
    expect(GOVDE).toContain('baglantilar.get(h.connection.id)');
  });

  it('KRİTİK: ETKİLENEN HESAP sayılıyor', () => {
    // Sayı uyarının ağırlığı: "bir bağlantı koptu" ile "kırk hesabın verisi
    // durdu" aynı aciliyette değil.
    expect(GOVDE).toContain('mevcut.etkilenenHesap += 1');
  });

  it('şifreli token kolonları HÂLÂ çekilmiyor', () => {
    /*
     * `connection` seçimi genişletildi (id, platform, accountLabel…) ve
     * `include`a kaymak ya da token kolonu eklemek, 481 hesaplı bir havuzda
     * her sayfa yüklemesinde şifreli token'ları belleğe almak demekti.
     */
    expect(GOVDE).not.toContain('accessTokenEnc');
    expect(GOVDE).not.toContain('pageAccessTokenEnc');
    expect(GOVDE).not.toContain('connection: true');
  });
});
