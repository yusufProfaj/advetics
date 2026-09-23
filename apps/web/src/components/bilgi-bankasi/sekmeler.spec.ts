import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS, type Permission } from '@advetics/shared';
import { SAYFA_GIRIS_IZNI, SEKMELER, SEKME_IZINLERI, gorunurSekmeler } from './sekmeler';

/**
 * TARAMA YORUMSUZ KAYNAKTA. Bir kuralı ANLATAN yorum aynı dosyada duruyor ve
 * `toContain` ikisini ayırt etmiyor: kural silinse bile yorum eşleşip test
 * yeşil kalırdı.
 */
const WEB_SRC = join(__dirname, '..', '..');
function kod(yol: string): string {
  return readFileSync(join(WEB_SRC, yol), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/**
 * BİLGİ BANKASI SEKMELERİ — HER SEKME KENDİ YETKİSİYLE.
 *
 * NEDEN YAZILDI: sayfa tek bir `client.write` hesaplayıp bütün sekmelere
 * geçiriyordu ve sekmeler AYNI uca gitmiyor. Ölçülen sonuç: `bulk.read`
 * taşımayan `customer_service` ve `client_viewer` rollerinde Logo sekmesi
 * doğrudan arka uçtan gelen kırmızı "Yüklenemedi" kutusuyla açılıyordu —
 * kullanıcı bunu bir ARIZA sanıyor, oysa bir YETKİ kararı.
 *
 * Bu dosya panelin bileşenlerini render etmiyor (vitest.config.ts bunu
 * bilinçli reddediyor); karar zaten saf bir fonksiyona çıkarıldı ve
 * sınanan şey o.
 */

const izin = (rol: keyof typeof ROLE_PERMISSIONS): Permission[] => [...ROLE_PERMISSIONS[rol]];
const kodlar = (rol: keyof typeof ROLE_PERMISSIONS): string[] =>
  gorunurSekmeler(izin(rol)).map((s) => s.kod);

describe('sekme listesi tarama boşa düşmüyor', () => {
  it('beş sekme ve hepsinin okuma/yazma yetkisi tanımlı', () => {
    /*
     * Sayı testte yazılı: liste boşalsa ya da yetki alanları silinse
     * aşağıdaki "görünmüyor" iddialarının hepsi her zaman doğru olurdu.
     * Altıncı bir sekme eklenirse burası düşer ve yetkisi bilinçli olarak
     * kararlaştırılır.
     */
    expect(SEKMELER.map((s) => s.kod)).toEqual([
      'bilgi-bankasi',
      'butce',
      'hedef-kitle',
      'marka',
      'logo',
    ]);
    for (const s of SEKMELER) {
      expect(s.oku, `${s.kod} okuma yetkisiz`).toBeTruthy();
      expect(s.yaz, `${s.kod} yazma yetkisiz`).toBeTruthy();
    }
  });

  it('SEKME_IZINLERI listesi SEKMELER’den türüyor — elle yazılmıyor', () => {
    // Sayfa istemciye bu listeyi süzerek geçiriyor. Elle yazılsaydı yeni bir
    // sekme eklendiğinde onun yetkisi listeye girmez, sekme herkesten
    // gizlenirdi — hata yok, log yok, sadece kayıp bir sekme.
    for (const s of SEKMELER) {
      expect(SEKME_IZINLERI).toContain(s.oku);
      expect(SEKME_IZINLERI).toContain(s.yaz);
    }
    // Tekrarsız: `client.read` üç sekmede geçiyor.
    expect(new Set(SEKME_IZINLERI).size).toBe(SEKME_IZINLERI.length);
  });
});

describe('YETKİSİ OLMAYAN SEKME GÖSTERİLMİYOR', () => {
  it('KRİTİK: client_viewer Logo sekmesini GÖRMÜYOR (bulk.read yok)', () => {
    expect(ROLE_PERMISSIONS.client_viewer).not.toContain('bulk.read');
    expect(kodlar('client_viewer')).not.toContain('logo');
  });

  it('ters yön: her şeyi gizleyen bir süzgeç de yukarıdakileri geçerdi', () => {
    // client_viewer `client.read` ve `budget.read` taşıyor — dört sekmeyi
    // GÖRMELİ. Süzgeç fazla kesiyorsa müşteri kendi bilgisini göremez.
    expect(kodlar('client_viewer')).toEqual(['bilgi-bankasi', 'butce', 'hedef-kitle', 'marka']);
    // Yönetici her şeyi görüyor.
    expect(kodlar('admin')).toEqual(SEKMELER.map((s) => s.kod));
  });

  it('yetkisiz kullanıcıda liste BOŞ — sayfa bunu yazıya döküyor', () => {
    // Boş dönüş bir hata değil, bir hâl: `BilgiBankasiIcerik` bunu görünce
    // sebebini yazıyor. Sessizce boş bir sekme çubuğu çizmek "yetkin yok"
    // ile "yükleniyor"u aynı boşluğa çevirirdi.
    expect(gorunurSekmeler([])).toEqual([]);
  });
});

describe('SAYFA GİRİŞ YETKİSİ', () => {
  it('giriş yetkisi varsa EN AZ BİR sekme görünüyor', () => {
    /*
     * Menü satırı tek bir `Permission` taşıyabiliyor, sayfanın gerçek kapısı
     * ise "en az bir sekme". İkisinin ayrışma YÖNÜ kasıtlı: giriş yetkisi
     * olan biri sayfayı BOŞ bulmamalı — menüde görünen ama açılmayan bir
     * satır, `roles.ts`in yasakladığı "tıklayınca 403" durumu.
     */
    /*
     * KAPI ARTIK BİR YAZMA YETKİSİ (`client.write`), yani tek başına hiçbir
     * sekmenin `oku`suna denk gelmiyor — garanti ROL üzerinden veriliyor:
     * kapıyı taşıyan her rol ilk sekmenin okuma yetkisini de taşımalı.
     */
    for (const rol of Object.keys(ROLE_PERMISSIONS) as Array<keyof typeof ROLE_PERMISSIONS>) {
      if (!ROLE_PERMISSIONS[rol].includes(SAYFA_GIRIS_IZNI)) continue;
      expect(ROLE_PERMISSIONS[rol], `${rol} kapıyı taşıyor ama ilk sekmeyi okuyamıyor`).toContain(
        SEKMELER[0].oku,
      );
      expect(gorunurSekmeler([...ROLE_PERMISSIONS[rol]]).length).toBeGreaterThan(0);
    }
  });

  it('giriş yetkisini TAŞIYAN her rol sayfada bir şey görüyor', () => {
    for (const rol of Object.keys(ROLE_PERMISSIONS) as Array<keyof typeof ROLE_PERMISSIONS>) {
      if (!ROLE_PERMISSIONS[rol].includes(SAYFA_GIRIS_IZNI)) continue;
      expect(kodlar(rol).length, `${rol} sayfayı boş görüyor`).toBeGreaterThan(0);
    }
  });
});

/**
 * ═══ BİLGİ BANKASI WORKSPACE'E ÖZEL — VE SEÇİM AÇIK ═══
 *
 * Sayfa workspace'i SESSİZCE seçiyordu: `activeClientId ?? availableClients[0]`.
 * Şirket seçili olup workspace seçilmemişse listedeki İLK workspace açılıyor
 * ve başlıkta adı yazmıyordu — kullanıcı şirketin bilgi bankasını
 * düzenlediğini sanarken bambaşka bir workspace'in kaydını değiştiriyordu.
 * Bu kayıt reklam metnini besliyor, yani yanlış workspace'e yazılan bir cümle
 * başka bir markanın reklamında çıkıyor.
 */
describe('WORKSPACE SEÇİMİ', () => {
  const SAYFA = kod('app/(dashboard)/kutuphane/bilgi-bankasi/page.tsx');
  const SECICI = kod('components/bilgi-bankasi/workspace-secici.tsx');

  it('tarama boşa düşmüyor', () => {
    expect(SAYFA).toContain('WorkspaceSecici');
    expect(SECICI).toContain('export function WorkspaceSecici');
  });

  it('KRİTİK: LİSTENİN İLK SATIRINA DÜŞÜLMÜYOR', () => {
    expect(SAYFA).not.toContain('availableClients[0]');
    expect(SAYFA).toContain('first(params.musteri) ?? session.activeClientId ?? null');
  });

  it('KRİTİK: SEÇİM YAPILMADAN İÇERİK ÇİZİLMİYOR', () => {
    /*
     * Boş bir sekme çubuğu göstermek, "workspace seçilmedi" ile "bu
     * workspace'in bilgisi boş" hâllerini aynı ekrana çevirirdi.
     */
    expect(SAYFA).toContain('{aktifWorkspace && (');
  });

  it('KRİTİK: SEÇİLİ WORKSPACE HER ZAMAN EKRANDA', () => {
    // Hangi kaydı düzenlediğini görmeden yazmak, bu ekranda en pahalı hata.
    expect(SECICI).toContain('Workspace');
    expect(SECICI).toContain('{aktif.name}');
  });

  it('KRİTİK: TEK WORKSPACE OLSA DA OTOMATİK SEÇİLMİYOR', () => {
    /*
     * Otomatik seçim, ikinci workspace eklendiğinde davranışı sessizce
     * değiştirirdi: aynı ekran bir gün seçim sormaya başlar.
     */
    expect(SECICI).not.toContain('workspaceler.length === 1');
  });
});

/**
 * ═══ TEK TUŞLA DOLDURMA ═══
 *
 * Kullanıcının isteği: "tek tuş ile araştırma yapıp bilgileri dolduracak".
 * Kaynak modelin belleği DEĞİL işletmenin kendi sitesi — modelden bir markayı
 * hatırlamasını istemek, makul görünen ama yanlış cümleler üretiyor ve o
 * cümleler buradan reklam metnine geçiyor.
 */
describe('YAPAY ZEKÂ İLE DOLDUR', () => {
  const SAYFA = kod('app/(dashboard)/kutuphane/bilgi-bankasi/page.tsx');
  const DOLDUR = kod('components/bilgi-bankasi/ai-doldur.tsx');

  it('tarama boşa düşmüyor', () => {
    expect(DOLDUR).toContain('export function AiDoldur');
    expect(SAYFA).toContain('<AiDoldur');
  });

  it('KRİTİK: TASLAK DOĞRUDAN KAYDEDİLMİYOR', () => {
    /*
     * Yapay zekânın ürettiği ve gerçek bir işletmeyi anlatan metin, reklam
     * metnini besleyen bir kayda insan görmeden girmemeli. Taslak ekranda
     * gösteriliyor, düzenlenebiliyor ve kullanıcı kaydediyor.
     */
    expect(DOLDUR).toContain("'/client-profile/ai-taslak'");
    expect(DOLDUR).toContain('Üçünü de kaydet');
    expect(DOLDUR).toContain('onChange={(e) => alanDegistir(');
  });

  it('KRİTİK: KAYNAK EKRANDA YAZIYOR', () => {
    // "Nereden biliyor" sorusunun cevabı olmadan kullanıcı metne güvenip
    // güvenmeyeceğini bilemez.
    expect(DOLDUR).toContain('taslak.kaynak');
  });

  it('KRİTİK: BOŞ BÖLÜM KAYDEDİLMİYOR', () => {
    // Model üç bölümden ikisini üretmiş olabilir; boş dizeyi kaydetmek
    // kullanıcının elle yazdığı metni silmek olurdu.
    expect(DOLDUR).toContain('...(taslak.bilgiBankasi ? { bilgiBankasi: taslak.bilgiBankasi } : {})');
  });

  it('KRİTİK: SUNUCUNUN KENDİ CÜMLESİ GÖSTERİLİYOR', () => {
    /*
     * "Taslak üretilemedi" kullanıcıyı sebebi aramaya gönderiyor; sunucu ne
     * olduğunu söylüyor (site adresi yok, site JavaScript ile çiziliyor,
     * yönlendirme döndürdü) ve her biri farklı bir iş.
     */
    expect(DOLDUR).toContain('err instanceof ApiRequestError ? err.message');
  });

  it('KRİTİK: SEKMELERİN ÜSTÜNDE — birinin içinde değil', () => {
    // Üretilen taslak ÜÇ sekmeyi birden dolduruyor; birinin içine koymak,
    // diğer iki sekmenin oradan değiştiğini görünmez yapardı.
    const i = SAYFA.indexOf('<AiDoldur');
    const j = SAYFA.indexOf('<BilgiBankasiIcerik');
    expect(i, 'düğme bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    expect(j, 'sekmeler bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    expect(i).toBeLessThan(j);
  });

  it('KRİTİK: YETKİYE BAĞLI', () => {
    // Taslak üretmek dışarı HTTP isteği yapıyor ve model çağırıyor; okuma
    // yetkisiyle aynı kefeye konamaz.
    expect(DOLDUR).toContain('if (!canWrite) return null;');
    expect(SAYFA).toContain("canWrite={hasPermission(session, 'client.write')}");
  });
});
