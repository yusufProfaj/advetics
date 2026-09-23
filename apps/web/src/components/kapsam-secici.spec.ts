import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ TEK KAPSAM SEÇİCİ — ÜST HESAP › ŞİRKET › WORKSPACE ═══
 *
 * Üst barda İKİ seçici vardı: solda `UstHesapSecici`, sağda `KapsamSecici`.
 * Kullanıcının tarifi *"üst hesap ikinci bir search barda görünüyor, bu da
 * kafa karıştırıcı"*. Bugün tek kutu ve tek arama var; üst hesap seviyesi
 * aynı ağacın bir bölümü.
 *
 * BU DOSYA KAYNAK TARAMASI YAPIYOR ve sebebi yapısal: panelde bileşen
 * render eden bir test altyapısı yok (`vitest.config.ts` bunu bilinçli
 * reddediyor). Tarama YORUMSUZ kaynakta yapılıyor — bir kuralı ANLATAN
 * yorum aynı dosyada duruyor ve `toContain` ikisini ayırt etmiyor; kural
 * silinse bile yorum eşleşip test yeşil kalırdı.
 */
function kod(yol: string): string {
  return readFileSync(join(__dirname, '..', yol), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}

const SECICI = kod('components/kapsam-secici.tsx');
const LAYOUT = kod('app/(dashboard)/layout.tsx');

describe('tarama boşa düşmüyor', () => {
  it('kaynaklar okundu ve yorumlar ayıklandı', () => {
    expect(SECICI).toContain('export function KapsamSecici');
    expect(LAYOUT).toContain('export default async function DashboardLayout');
    // Yorum ayıklayıcı gövdeyi de silmiş olsaydı aşağıdaki bütün "yok"
    // iddiaları bedavaya geçerdi.
    expect(SECICI.length).toBeGreaterThan(3000);
    expect(LAYOUT.length).toBeGreaterThan(1500);
  });
});

describe('KRİTİK: üst barda TEK seçici var', () => {
  it('ikinci seçici bileşeni kaldırıldı', () => {
    /*
     * İki kutu = iki arama kutusu = "hangisine yazayım". Bileşen dosyasıyla
     * birlikte silindi; burada kilitlenen şey layout'un onu geri
     * getirmemesi.
     */
    expect(LAYOUT).not.toContain('UstHesapSecici');
    expect(LAYOUT).not.toContain('ust-hesap-secici');
  });

  it('kapsam seçici üst hesap listesini oturumdan alıyor', () => {
    expect(LAYOUT).toContain('<KapsamSecici');
    expect(LAYOUT).toContain('ustHesaplar={session.secilebilirUstHesaplar}');
    expect(LAYOUT).toContain('aktifUstHesapId={session.managerAccount?.id ?? null}');
  });

  it('üst barda tek açılır kutu çiziliyor', () => {
    // `<Kapsam`/`<UstHesap` gibi seçici bileşenlerin sayısı: mobil menü ve
    // bildirim zili bu iddianın dışında (ikisi de kapsam seçmiyor).
    const secidiler = LAYOUT.match(/<[A-Z][A-Za-z]*Secici/g) ?? [];
    expect(secidiler).toEqual(['<KapsamSecici']);
  });
});

describe('KRİTİK: üst hesap geçişi', () => {
  it('doğru uca gidiyor', () => {
    expect(SECICI).toContain("'/auth/switch-manager'");
    expect(SECICI).toContain('{ managerAccountId: h.id }');
  });

  it('TAM SAYFA — ve aynı sayfada kalıyor', () => {
    /*
     * Yeni hesabın altında eski şirket ve workspace kimlikleri geçersiz;
     * `router.refresh()` istemci state'inde önceki ağacın kimliklerini
     * bırakır ve sessizce boş listeler üretir. `/dashboard` sabiti yazmak
     * ise kullanıcıyı her geçişte genel bakışa atardı.
     */
    const govde = ustHesabaGecGovdesi();
    expect(govde).toContain("'/auth/switch-manager'");
    expect(govde).toContain('true');
    expect(SECICI).toContain('gecisHedefi(pathname,');
    expect(SECICI).not.toContain("assign('/dashboard')");
  });

  it('AKTİF HESAP LİSTEDE TEKRARLANMIYOR', () => {
    // Aktif hesap zaten ağacın kökü: adı en üstteki "tüm şirketler"
    // satırında. İkinci kez listelemek "bu ikisi farklı mı" sorusunu açardı.
    expect(SECICI).toContain('ustHesaplar.filter((h) => h.id !== aktifUstHesapId)');
  });

  it('PAKET ve ŞİRKET SAYISI satırda yazıyor', () => {
    expect(SECICI).toContain('PAKET_SINIRLARI[h.paket].etiket');
    expect(SECICI).toContain('{h.sirketSayisi} şirket');
  });
});

describe('KRİTİK: aramanın kapsamı EKRANDA yazıyor', () => {
  it('başka üst hesap varken aramanın hangi ağaçta yapıldığı söyleniyor', () => {
    /*
     * Ağaç yalnızca AKTİF üst hesabın şirketlerini taşıyor. Başka bir
     * hesaptaki şirketin adını arayan kullanıcı boş sonuç görür; sebebi
     * yazmazsa o şirketin silindiğini sanar. Sessiz boş liste bu depoda
     * yasak (CLAUDE.md).
     */
    expect(SECICI).toContain('ağacında yapıldı');
    // İDDİA ŞARTA ÇAPALI: cümle her zaman basılsaydı tek hesaplı
    // kullanıcıya hiçbir işe yaramayan bir uyarı gösterilirdi.
    expect(SECICI).toContain('{ajans && digerUstHesaplar.length > 0 && (');
  });

  it('şirket sayacı duruyor', () => {
    expect(SECICI).toContain('şirketten ${suzulmus.length} tanesi gösteriliyor');
  });

  it('BOŞ SONUÇ üst hesap eşleşmesini de sayıyor', () => {
    // Yalnızca `suzulmus.length === 0` baksaydı, aranan ad bir ÜST HESAP
    // adıyla eşleştiğinde ekran hem "eşleşen yok" der hem de o satırı
    // çizerdi.
    expect(SECICI).toContain('suzulmus.length === 0 && digerUstHesaplar.length === 0');
  });
});

describe('KRİTİK: menü kapalıyken hangi ağaçta olduğu görünüyor', () => {
  it('birden çok üst hesapta ajans adı düğmede', () => {
    /*
     * Ayrı seçici kaldırılınca "hangi danışmanlığın ağacındayım" sorusunun
     * cevabı ekrandan kalkmıştı. İki farklı üst hesapta aynı adlı şirket
     * olabilir ve yanlış ağaçta iş yapmak bu seçicinin engellemesi gereken
     * hatanın ta kendisi.
     */
    expect(SECICI).toContain('ustHesaplar.length > 1 && !tumSirketler');
    expect(SECICI).toContain('`${ajans} · ${altBaslikGovdesi}`');
  });
});

describe('KRİTİK: alttaki sabit sekmeler', () => {
  it('yönetim paneli duruyor ve yetkisize basılmıyor', () => {
    expect(SECICI).toContain('href="/ayarlar/ust-hesap"');
    expect(SECICI).toContain('Yönetim paneli');
  });

  it('üst hesap ayarları YALNIZCA birden çok hesapta', () => {
    /*
     * Hesaplar ARASINDA çalışan bir ekran. Tek hesaplı kullanıcıda kenar
     * çubuğundaki aynı bağlantının kopyasından ibaret olurdu.
     */
    expect(SECICI).toContain('yonetimGorunur && ustHesaplar.length > 1 && (');
    expect(SECICI).toContain('href="/ayarlar/ust-hesaplar"');
  });
});

/**
 * `ustHesabaGec` içindeki `git(...)` ÇAĞRISININ ARGÜMANLARI — parantez
 * sayarak.
 *
 * Sabit uzunluklu bir dilim (`indexOf(...) + 400`) komşu fonksiyonun içine
 * taşar ve oradaki çağrıya eşleşir; bu depoda bir kez tam olarak böyle
 * boşa düşmüş bir test var.
 *
 * DİLİM FONKSİYONUN KENDİSİNDEN DEĞİL, `git(`DEN BAŞLIYOR: ok fonksiyonunun
 * kendi parametre parantezi hemen kapanıyor ve oradan saymak bir karakterlik
 * bir dilim üretiyordu — testin ilk yazımı tam olarak buna düştü ve iddia
 * BOŞ bir dilimde çalışıyordu. Bulunamazsa HATA FIRLATIYOR: "yasak dizge
 * yok" iddiası boş bir dilimde her zaman doğrudur.
 */
function ustHesabaGecGovdesi(): string {
  const bas = SECICI.indexOf('const ustHesabaGec =');
  if (bas === -1) throw new Error('ustHesabaGec bulunamadı — tarama boşa düştü');
  const cagri = SECICI.indexOf('git(', bas);
  if (cagri === -1) throw new Error('ustHesabaGec içinde git() çağrısı yok');
  const acilis = SECICI.indexOf('(', cagri);
  let derinlik = 0;
  for (let i = acilis; i < SECICI.length; i += 1) {
    if (SECICI[i] === '(') derinlik += 1;
    if (SECICI[i] === ')') {
      derinlik -= 1;
      if (derinlik === 0) return SECICI.slice(acilis, i + 1);
    }
  }
  throw new Error('git() çağrısı kapanmadı');
}
