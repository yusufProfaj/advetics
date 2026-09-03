import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ MÜŞTERİ DETAY PENCERESİ — ALAN ZİNCİRİ ═══
 *
 * Pencerenin gösterdiği her alan ÜÇ yerde birden yazılı olmak zorunda:
 *
 *   1. `clients.service.ts` → `list()` seçimi  (uç gerçekten döndürüyor mu)
 *   2. `page.tsx` → `ClientRow` tipi           (istemci ne beklediğini söylüyor)
 *   3. `musteri-karti.tsx`                     (ekranda çiziliyor)
 *
 * Üçü ayrıştığında HİÇBİR ARAÇ SES ÇIKARMIYOR. `serverApiFetch<T>` denetimsiz
 * bir dönüşüm: tipe alan eklenip uçtaki `select`e eklenmezse alan `undefined`
 * geliyor, ekran onu boş sayıyor ve pencere "vergi numarası girilmemiş"
 * diyor — oysa numara veritabanında duruyor. Belirti, veri girişiyle uğraşıp
 * hiçbir şeyin görünmediğini sanan bir kullanıcı.
 *
 * Ters yön de aynı derecede sessiz: uçta seçilip ekranda kullanılmayan alan,
 * her müşteri listesinde boşuna okunan bir kolon.
 */
const KART = readFileSync(join(__dirname, 'musteri-karti.tsx'), 'utf8');
const SAYFA = readFileSync(
  join(__dirname, '..', '..', 'app', '(dashboard)', 'ayarlar', 'musteriler', 'page.tsx'),
  'utf8',
);
const SERVIS = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'api', 'src', 'modules', 'tenancy', 'clients.service.ts'),
  'utf8',
);

/**
 * Yorum satırlarını atar.
 *
 * Üç dosya da bu zinciri ANLATAN yorumlar taşıyor ve o yorumların içinde alan
 * adları geçiyor. `toContain` yorumla kodu ayırt etmiyor: `contactEmail`i
 * seçimden silmek, iki satır yukarıdaki açıklamaya takılıp testi geçirirdi.
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

const KART_KOD = kod(KART);
const SAYFA_KOD = kod(SAYFA);
const SERVIS_KOD = kod(SERVIS);

/** Pencerede çizilen müşteri alanları — `client.<alan>` kullanımından. */
const CIZILEN = [
  ...new Set([...KART_KOD.matchAll(/\bclient\.([a-zA-Z]+)\b/g)].map((m) => m[1])),
].filter((a) => !['id', 'name', 'slug', 'status', 'adAccounts', 'socialProfiles'].includes(a));

/** `list()` gövdesi — başka metotların `select`leri iddiayı boşa düşürmesin. */
function listGovdesi(): string {
  const bas = SERVIS_KOD.indexOf('async list(');
  expect(bas, 'clients.service.ts içinde list() bulunamadı — tarama boşa düştü').toBeGreaterThan(
    -1,
  );
  const son = SERVIS_KOD.indexOf('\n  async ', bas + 10);
  return SERVIS_KOD.slice(bas, son === -1 ? undefined : son);
}

/** `ClientRow` tanımı — sayfadaki diğer tipler karışmasın. */
function clientRowGovdesi(): string {
  const bas = SAYFA_KOD.indexOf('interface ClientRow {');
  expect(bas, 'page.tsx içinde ClientRow bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
  const son = SAYFA_KOD.indexOf('\n}', bas);
  return SAYFA_KOD.slice(bas, son);
}

describe('müşteri detay penceresinin alan zinciri', () => {
  it('tarama gerçekten bir şey yakaladı', () => {
    // Dilim boşalırsa aşağıdaki "hepsi var" iddiaları BOŞ KÜMEDE doğru olur.
    expect(CIZILEN.length).toBeGreaterThan(8);
    expect(CIZILEN).toContain('contactEmails');
    expect(CIZILEN).toContain('taxNumber');
    expect(listGovdesi().length).toBeGreaterThan(200);
    expect(clientRowGovdesi().length).toBeGreaterThan(200);
  });

  /*
   * `contactEmails` ÇOĞUL ve bu zincirin ta kendisi: alan uçtan gelmezse
   * rapor gönderimi "alıcı yok" der ve kullanıcı müşteriyi düzenlemeye
   * gittiğinde alanın dolu olduğunu görür — teşhis edilemeyen bir hâl.
   */
  it.each(['contactName', 'contactEmails', 'contactPhone', 'website', 'address', 'taxOffice', 'taxNumber', 'iban', 'notes'])(
    '%s alanı uçtan geliyor, tipte tanımlı ve pencerede çiziliyor',
    (alan) => {
      expect(listGovdesi(), `${alan} list() seçiminde yok — uçtan undefined gelir`).toContain(
        `${alan}: true`,
      );
      expect(clientRowGovdesi(), `${alan} ClientRow tipinde yok`).toContain(`${alan}:`);
      expect(KART_KOD, `${alan} pencerede çizilmiyor`).toContain(`client.${alan}`);
    },
  );

  it('pencerede çizilen HER alan uçtan da geliyor', () => {
    const eksik = CIZILEN.filter(
      (a) => !listGovdesi().includes(`${a}: true`) && !clientRowGovdesi().includes(`${a}:`),
    );
    expect(eksik, `bu alanlar çiziliyor ama zincirin bir halkasında yok: ${eksik.join(', ')}`)
      .toEqual([]);
  });
});

/**
 * ═══ PENCERELER PORTAL KULLANMAK ZORUNDA ═══
 *
 * `fixed inset-0` "ekranın tamamı" DEMEK DEĞİL: `transform`, `filter` ya da
 * `backdrop-filter` taşıyan bir ata, sabit konumlu alt öğeler için KAPSAYICI
 * BLOK oluşturuyor. Yönetim paneli üst bardaki `backdrop-blur`lu `<header>`ın
 * içindeydi ve pencere 64 puntoluk başlık kutusuna sıkışıyordu — kullanıcının
 * bildirdiği hâli *"üst barda saçma sapan gözüküyor"*.
 *
 * Müşteri detayı da aynı riski taşıyor: kart bir ızgara hücresinin içinde ve
 * `hover:shadow`/geçiş sınıfları eklenen herhangi bir sarmalayıcı aynı tuzağı
 * kurabiliyor. İkisi de ağaçtan çıkıyor.
 */
describe('tam ekran pencereler', () => {
  const DETAY = readFileSync(join(__dirname, 'musteri-detay.tsx'), 'utf8');
  const YONETIM = readFileSync(join(__dirname, 'yonetim-paneli.tsx'), 'utf8');

  it.each([
    ['musteri-detay.tsx', DETAY],
    ['yonetim-paneli.tsx', YONETIM],
  ])('%s pencereyi document.body altına taşıyor', (_ad, src) => {
    const k = kod(src);
    /*
     * İDDİA ÇAĞRIYA ÇAPALI, ADA DEĞİL. İlk hâli `toContain('createPortal')`
     * diyordu ve `import { createPortal } from 'react-dom'` satırına
     * takılıyordu: çağrıyı silmek testi DÜŞÜRMÜYORDU. Parantez ve `return`
     * ile birlikte aranınca iddia gerçekten çizilen çıktıyı tutuyor.
     */
    expect(k).toContain('return createPortal(');
    expect(k).toContain('document.body');
    expect(k).toContain('fixed inset-0');
  });
});
