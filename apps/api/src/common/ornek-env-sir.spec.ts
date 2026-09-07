import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ `.env.example` GERÇEK SIR TAŞIMAZ ═══
 *
 * DEPO HERKESE AÇIK (CLAUDE.md §2) ve örnek dosya git'te izleniyor.
 * `SEED_ADMIN_PASSWORD` bir süre somut bir varsayılan taşıdı: depoyu okuyan
 * herkesin bildiği bir parola, ve `SEED_ADMIN_EMAIL` hesabı o değeri hâlâ
 * kullanıyorsa giriş herkese açık demekti.
 *
 * Diğer bütün sır alanları (`JWT_*`, `META_APP_SECRET`, `GOOGLE_CLIENT_SECRET`,
 * `YOUTUBE_API_KEY`) yer tutucu ya da boştu — yalnızca bir satır kaçmıştı ve
 * kimse fark etmedi. Gözle gözden geçirmek bunu yakalamıyor; tarama yakalıyor.
 */
const ORNEK = readFileSync(join(__dirname, '..', '..', '..', '..', '.env.example'), 'utf8');

/** Sır taşıyan ortam değişkeni adları. */
const SIR_ADI = /(PASSWORD|SECRET|KEY|TOKEN)\s*=/;

/**
 * Yer tutucu sayılan kalıplar.
 *
 * Liste GENİŞ tutuluyor: yanlış alarm, sırrı kaçırmaktan iyi. Ama
 * `REDIS_KEY_PREFIX` gibi sır OLMAYAN alanlar da adında `KEY` taşıyor ve
 * aşağıda ayrıca elenmesi gerekiyor — ad eşleşmesi tek başına yeterli değil.
 */
const YER_TUTUCU = /(buraya|degistir|değiştir|xxx|placeholder|your|change|<|\.\.\.|örnek|ornek|TODO)/i;

/** Adında sır kelimesi geçen ama sır OLMAYAN alanlar. */
const SIR_DEGIL = new Set([
  'REDIS_KEY_PREFIX',
  'ENCRYPTION_ACTIVE_KEY_VERSION',
]);

interface Satir {
  no: number;
  ad: string;
  deger: string;
}

function sirSatirlari(): Satir[] {
  const sonuc: Satir[] = [];
  ORNEK.split('\n').forEach((l, i) => {
    const t = l.trim();
    if (t === '' || t.startsWith('#')) return;
    if (!SIR_ADI.test(l)) return;
    const [ad, ...kalan] = l.split('=');
    const adTemiz = (ad ?? '').trim();
    if (SIR_DEGIL.has(adTemiz)) return;
    sonuc.push({
      no: i + 1,
      ad: adTemiz,
      deger: kalan.join('=').trim().replace(/^["']|["']$/g, ''),
    });
  });
  return sonuc;
}

describe('.env.example', () => {
  it('tarama gerçekten bir şey yakaladı', () => {
    /*
     * Dosya taşınır ya da alan adları değişirse dilim boşalır ve aşağıdaki
     * "sır yok" iddiası BOŞ KÜMEDE her zaman doğru olur — sessiz bir bekçi,
     * olmayan bir bekçidir.
     */
    const satirlar = sirSatirlari();
    expect(satirlar.length).toBeGreaterThanOrEqual(4);
    expect(satirlar.map((s) => s.ad)).toContain('SEED_ADMIN_PASSWORD');
  });

  it('KRİTİK: aynı anahtar İKİ KEZ tanımlanmamış', () => {
    /*
     * MÜKERRER ANAHTAR SESSİZCE KAZANIYOR — ve kazanan SONUNCUSU.
     *
     * Dosyada iki `REDIS_URL` vardı: satır 21'de 6380 (docker-compose'un
     * yayınladığı port) ve satır 120'de 6379. dotenv aynı dosyadaki ikinci
     * atamayı üstüne yazıyor, yani `.env.example`i kopyalayan herkes var
     * OLMAYAN bir porta bakan bir URL alıyordu. Doğru değer dosyada duruyor
     * olmasına rağmen.
     *
     * Arıza sessiz: kota bekçisi URL'nin VARLIĞINA bakıyor,
     * ERİŞİLEBİLİRLİĞİNE değil — API kotayı "açık" sayıyor ve komutlar
     * sonsuza kadar kuyrukta bekliyor.
     */
    const gorulen = new Map<string, number[]>();
    ORNEK.split('\n').forEach((l, i) => {
      const m = /^\s*([A-Z][A-Z0-9_]*)\s*=/.exec(l);
      if (!m) return;
      const ad = m[1]!;
      gorulen.set(ad, [...(gorulen.get(ad) ?? []), i + 1]);
    });

    expect(gorulen.size, 'tarama boşa düştü — anahtar bulunamadı').toBeGreaterThan(10);

    const mukerrer = [...gorulen.entries()]
      .filter(([, satirlar]) => satirlar.length > 1)
      .map(([ad, satirlar]) => `${ad} (satır ${satirlar.join(', ')})`);
    expect(mukerrer, 'aynı anahtar birden çok kez tanımlı — SONUNCUSU kazanır').toEqual([]);
  });

  it('KRİTİK: REDIS_URL portu docker-compose ile AYNI', () => {
    /*
     * İki dosya ayrı ayrı doğru görünüp birlikte yanlış olabiliyor: örnek
     * dosyadaki port compose'un YAYINLADIĞI porta bakmak zorunda, yoksa
     * `pnpm infra:up` sonrası hiçbir şey bağlanamıyor ve hata mesajı
     * "bağlantı reddedildi" bile olmayabiliyor.
     */
    const url = /^REDIS_URL="([^"]+)"/m.exec(ORNEK)?.[1];
    expect(url, 'REDIS_URL bulunamadı — tarama boşa düştü').toBeDefined();

    const compose = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'docker-compose.yml'),
      'utf8',
    );
    const yayinlanan = /'(\d+):6379'/.exec(compose)?.[1];
    expect(yayinlanan, 'compose Redis portu bulunamadı — tarama boşa düştü').toBeDefined();
    expect(new URL(url!).port).toBe(yayinlanan);
  });

  it('KRİTİK: hiçbir sır alanı GERÇEK değer taşımıyor', () => {
    /*
     * Boş ya da yer tutucu olmak zorunda. Depo herkese açık ve buraya
     * yazılan bir değer, onu okuyan herkesin bildiği bir sır demek.
     */
    const kacanlar = sirSatirlari().filter(
      (s) => s.deger !== '' && !YER_TUTUCU.test(s.deger) && !/^\d+$/.test(s.deger),
    );
    expect(
      kacanlar.map((s) => `satır ${s.no}: ${s.ad}`),
      'örnek dosyada gerçek görünümlü sır var — boşalt ya da yer tutucu yaz',
    ).toEqual([]);
  });
});
