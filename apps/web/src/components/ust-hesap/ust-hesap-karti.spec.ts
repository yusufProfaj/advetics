import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dolulukMetni } from './ust-hesap-karti';

/**
 * ═══ ÜST HESAP: ŞERİT (Şirketler) + YÖNETİM (Üst Hesaplar) ═══
 *
 * ┌─ YÖNETİM AYRI SAYFAYA TAŞINDI ─────────────────────────────────────────┐
 * │ Bu paket bir zamanlar TEK bir kartı sınıyordu: ad/paket düzenleme, yeni│
 * │ hesap ve doluluk hepsi Şirketler ekranındaki karttaydı. O kart yalnızca│
 * │ AKTİF hesabı biliyor — ikinci bir hesabın adını değiştirmek için önce  │
 * │ ona GEÇMEK gerekiyordu (bağlam, açık şirket ve workspace seçimi        │
 * │ değişiyor) ve silme hiç yoktu.                                         │
 * │                                                                         │
 * │ Bugün ikiye ayrılmış durumda ve paket ikisini de tarıyor:              │
 * │   · `ust-hesap-karti.tsx`    → SALT OKUNUR şerit + ayarlara bağlantı   │
 * │   · `ust-hesap-yonetimi.tsx` → liste, düzenleme, silme, yeni hesap     │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Yetki yüzeyi de burada kilitli: paket seçimi, yeni hesap ve SİLME yalnızca
 * platform sahibinde görünmeli.
 */
/**
 * YORUMSUZ KAYNAK — ve satır önekiyle DEĞİL.
 *
 * Önceki hâl satır başındaki `//`, `*`, `/*` ile süzüyordu ve JSX
 * yorumlarının GÖVDE satırları (`{/*` sonrası düz metin) elenmiyordu. Bir
 * kuralı ANLATAN yorum aynı dosyada duruyor: *"`router.refresh()` sunucu
 * bileşenlerini tazeler ama…"* cümlesi yüzünden "kodda `router.refresh()`
 * YOK" iddiası KOD DOĞRUYKEN kırmızı verdi. CLAUDE.md bunu ayrıca yazıyor:
 * iddia yoruma değil koda çapalanır. Blok yorumları desenle söküyoruz.
 */
function kod(yol: string): string {
  return readFileSync(join(__dirname, yol), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}
/**
 * Bir bileşenin gövdesi — bir sonraki `function` tanımına kadar.
 *
 * SABİT UZUNLUKLU DİLİM KULLANILMIYOR: bu depoda `indexOf(...) + 400`
 * deseni bir kez komşu işleyicinin içindeki aynı çağrıyı yakalayıp
 * silinen kodu "hâlâ var" göstermişti.
 */
function govde(kaynak: string, ad: string): string {
  const bas = kaynak.indexOf(`function ${ad}(`);
  if (bas === -1) throw new Error(`${ad} bulunamadı — tarama boşa düştü`);
  const sonraki = kaynak.indexOf('\nfunction ', bas + 1);
  return kaynak.slice(bas, sonraki === -1 ? undefined : sonraki);
}

const KART = kod('ust-hesap-karti.tsx');
const YONETIM = kod('ust-hesap-yonetimi.tsx');
const EKRAN = kod('ust-hesap-ekrani.tsx');
const sayfa = (...yol: string[]): string =>
  readFileSync(join(__dirname, '..', '..', 'app', '(dashboard)', 'ayarlar', ...yol), 'utf8');
const SAYFA = sayfa('ust-hesap', 'page.tsx');
const YONETIM_SAYFA = sayfa('ust-hesaplar', 'page.tsx');

describe('tarama boşa düşmüyor', () => {
  it('kaynaklar okundu', () => {
    expect(KART).toContain('export function UstHesapKarti');
    expect(YONETIM).toContain('export function UstHesapYonetimi');
    expect(YONETIM.length).toBeGreaterThan(3000);
  });
});

describe('doluluk metni', () => {
  it('sınırlı pakette "mevcut / sınır"', () => {
    expect(dolulukMetni(3, 5, 'şirket')).toBe('3 / 5 şirket');
  });

  it('KRİTİK: `null` sınır SINIRSIZ — "/ 0" ya da "/ ∞" değil, sayı yalnız', () => {
    // `PAKET_SINIRLARI.ajans.maxSirket` null ve `null` sayıya çevrilince 0
    // oluyor: "49 / 0 şirket" yazan bir ekran, sınırsız paketi dolu gösterir.
    expect(dolulukMetni(49, null, 'şirket')).toBe('49 şirket');
  });
});

describe('KRİTİK: şerit SALT OKUNUR', () => {
  it('şeritte yazma yok — ne PATCH ne POST', () => {
    /*
     * Taşımanın kendisi bu: kart artık yönetmiyor. Bir düzenleme formunun
     * buraya geri sızması, iki ekranın aynı işi yapması ve birinin bir gün
     * diğerinden ayrışması demek.
     */
    expect(KART).not.toContain('apiFetch');
    expect(KART).not.toContain('method:');
  });

  it('KRİTİK: ayarlara bağlantı VAR — özellik kaybolmuş gibi görünmüyor', () => {
    // Kullanıcı hesabı bu ekranda görüp ayarını başka yerde araması
    // gerektiğini bilmiyorsa, taşıma onu özelliği kaybetmiş hissettirir.
    expect(KART).toContain('href="/ayarlar/ust-hesaplar"');
    expect(KART).toContain('Üst hesap ayarları');
  });

  it('ekran kartı şirket listesinin ÜSTÜNE koyuyor', () => {
    const kart = EKRAN.indexOf('<UstHesapKarti');
    const ray = EKRAN.indexOf('<aside');
    expect(kart).toBeGreaterThan(-1);
    expect(kart).toBeLessThan(ray);
  });
});

describe('KRİTİK: yetki yüzeyi', () => {
  it('yeni üst hesap ve SİLME yalnızca platform sahibinde', () => {
    /*
     * Kendi ajansını yöneten bir kullanıcı için ikinci bir üst hesabın
     * anlamı yok ve sunucu da reddediyor; silme ise satılan ürünü yok
     * etmek. İkisini de göstermek, tıklayınca reddedilen düğmeler olurdu.
     */
    expect(YONETIM).toContain('{platformAdmin && (');
    expect(YONETIM).toContain("{acik === 'sil' && platformAdmin && (");

    /*
     * DÜĞMENİN KENDİSİ DE KORUMALI — ve bu iddia mutasyonla kazanıldı.
     * Yukarıdaki iki satır yalnızca PANELİ kilitliyor: düğmedeki koşulu
     * sildiğimde test GEÇTİ ve ortaya herkese görünüp hiçbir şey açmayan
     * ölü bir "Sil" düğmesi çıktı. İddia düğmeye ÇAPALI: `tehlike` işaretini
     * bulup hemen üstündeki korumayı arıyor (CLAUDE.md: sabit uzunluklu
     * dilim komşuyu yakalar, iddia sınırlanan şeyin kendisinden başlamalı).
     */
    const satir = govde(YONETIM, 'HesapSatiri');
    const silDugmesi = satir.indexOf('tehlike\n');
    expect(silDugmesi, 'Sil düğmesi bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const koruma = satir.lastIndexOf('{platformAdmin && (', silDugmesi);
    expect(koruma, 'Sil düğmesi `platformAdmin` korumasız').toBeGreaterThan(-1);
    expect(silDugmesi - koruma).toBeLessThan(200);
  });

  it('paket seçici düzenlemede YALNIZCA platform sahibinde; diğerleri sebebi okuyor', () => {
    expect(YONETIM).toContain('{platformAdmin ? (');
    expect(YONETIM).toContain('Paketi yalnızca Advetics');
  });

  it('KRİTİK: paket yalnızca DEĞİŞTİYSE gönderiliyor', () => {
    /*
     * Platform sahibi OLMAYAN biri için paketi göndermek — değişmemiş olsa
     * bile — sunucuda REDDEDİLİYOR ("yalnızca platform sahibi"), yani ad
     * değişikliği de o istekle birlikte düşerdi.
     */
    expect(YONETIM).toContain('...(paket !== hesap.paket ? { paket } : {}),');
  });

  it('sayfa `platformAdmin`ı OTURUMDAN geçiriyor — istemciden gelen bir bayrak değil', () => {
    expect(YONETIM_SAYFA).toContain('platformAdmin={session.platformAdmin}');
    expect(SAYFA).toContain('platformAdmin={session.platformAdmin}');
  });

  it('KRİTİK: sayfa `org.write` istiyor ve yetkisizi yönlendiriyor', () => {
    // Menü süzgeci bağlantıyı gizliyor ama adresi bilen biri yine girebilir.
    expect(YONETIM_SAYFA).toContain("hasPermission(session, 'org.write')");
    expect(YONETIM_SAYFA).toContain("redirect('/dashboard')");
  });
});

describe('KRİTİK: silme ÖNCE ne gideceğini söylüyor', () => {
  it('özet SUNUCUDAN çekiliyor — istemcide hesaplanmıyor', () => {
    /*
     * Liste satırındaki sayılar AKTİF şirketleri sayıyor; silme pasif
     * olanları da götürüyor. İstemcide hesaplamak, kullanıcıya gerçekte
     * kaybedeceğinden AZ gösterirdi.
     */
    expect(YONETIM).toContain('/silme-ozeti');
    expect(YONETIM).toContain('UstHesapSilmeOzeti');
  });

  it('SAYI DEĞİL AD: silinecek şirketler tek tek yazılıyor', () => {
    // "3 şirket" kimseye ne kaybedeceğini söylemiyor.
    expect(YONETIM).toContain('ozet.sirketAdlari.join');
  });

  it('KRİTİK: ad onayı gerekiyorsa düğme adı birebir yazana kadar KAPALI', () => {
    expect(YONETIM).toContain("(ozet.adOnayiGerekli && onay.trim() !== ozet.name)");
  });

  it('KRİTİK: engel varsa SEBEBİ yazılı ve düğme kapalı', () => {
    // Kapalı bir düğme "neden" sorusunu ekranda bırakıyor ve kullanıcı onu
    // aramaya gidiyor.
    expect(YONETIM).toContain('{ozet.engel}');
    expect(YONETIM).toContain("ozet.engel !== null ||");
  });

  it('kullanıcı kaybı AYRICA vurgulanıyor — giriş yapamayacaklar', () => {
    expect(YONETIM).toContain('silinince giriş yapamazlar');
  });
});

describe('KRİTİK: hesap değiştiren işlemler TAM SAYFA yeniliyor', () => {
  it('geçiş, silme ve düzenleme `router.refresh()` ile yetinmiyor', () => {
    /*
     * Üst hesabın adı üst bardaki seçicide ve sayfa başlığında da duruyor;
     * ikisi OTURUM YANITINDAN besleniyor ve o yanıt yalnızca yeni bir
     * istekte tazeleniyor. `router.refresh()` sunucu bileşenlerini tazeler
     * ama çerezi okuyan istemci durumlarını değil — yarısı yenilenmiş bir
     * ekran, kullanıcıya işlemin yapılmadığını düşündürüyor.
     */
    expect(YONETIM).not.toContain('router.refresh()');
    // Yeni hesap kurma sihirbaza taşındı; geçiş, düzenleme ve silme burada.
    expect((YONETIM.match(/window\.location\.assign/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('AKTİF hesap silinince panele dönüyor — silinmiş bağlamda kalmıyor', () => {
    // Sunucu çerezleri ev hesabına taşıyor; aynı sayfada kalmak, artık var
    // olmayan bir hesabın listesine bakmak olurdu.
    expect(YONETIM).toContain("sonuc.aktifti ? '/dashboard' : '/ayarlar/ust-hesaplar'");
  });
});

describe('KRİTİK: yeni hesap SİHİRBAZDA kuruluyor', () => {
  /*
   * Buradaki form yalnızca ad ve paket soruyordu; hesap boş bir kabuk gibi
   * açılıyor, platform bağlama ve workspace kurma hiçbir yerde yazmayan bir
   * sırayla ayrı ekranlarda yapılıyordu. Kurma artık tek yolda ve o yolun
   * kararları `kurulum.spec.ts` içinde. Burada iki yolun geri doğmadığı
   * kilitli: ikinci bir kurma formu, sihirbazın eklediği adımları atlar.
   */
  it('düğme sihirbaza gidiyor ve yalnızca platform sahibinde', () => {
    expect(YONETIM).toContain('href="/kurulum?tur=ust-hesap"');
    const bag = YONETIM.indexOf('href="/kurulum?tur=ust-hesap"');
    expect(YONETIM.lastIndexOf('{platformAdmin && (', bag)).toBeGreaterThan(-1);
  });

  it('eski kurma formu KALMADI', () => {
    expect(YONETIM).not.toContain('function YeniUstHesap');
    expect(YONETIM).not.toContain("apiFetch<{ id: string }>('/manager-account'");
  });
});

describe('KRİTİK: düzenleme kimlikle çalışıyor — aktif hesapla değil', () => {
  it('PATCH yolu hesabın kimliğini taşıyor', () => {
    /*
     * Aktif hesabı düzenleyen bir uç, listedeki başka bir satırı düzenlemek
     * için önce O HESABA GEÇMEYİ zorunlu kılardı: bir ad düzeltmesi için
     * kullanıcının bağlamını değiştirmek.
     */
    expect(YONETIM).toContain('`/manager-account/${hesap.id}`');
  });
});
