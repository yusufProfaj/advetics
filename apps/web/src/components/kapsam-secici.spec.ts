import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAKET_SINIRLARI, paketEtiketi } from '@advetics/shared';
import { kapsamSozlugu } from '@/dil/sozlukler/kapsam';

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
    // Props tek nesnede (`kapsam`): seçici masaüstünde menüde, telefonda üst barda.
    expect(LAYOUT).toContain('ustHesaplar: session.secilebilirUstHesaplar,');
    expect(LAYOUT).toContain('aktifUstHesapId: session.managerAccount?.id ?? null,');
  });

  it('ekranda tek açılır kutu çiziliyor', () => {
    // `<Kapsam`/`<UstHesap` gibi seçici bileşenlerin sayısı: mobil menü ve
    // bildirim zili bu iddianın dışında (ikisi de kapsam seçmiyor). İki
    // `<KapsamSecici` var ama AYNI ANDA görünmüyor: biri masaüstü menüsünde
    // (`lg:flex`), öbürü telefon çekmecesinde (`lg:hidden`), props aynı nesne.
    const secidiler = LAYOUT.match(/<[A-Z][A-Za-z]*Secici/g) ?? [];
    expect(secidiler).toEqual(['<KapsamSecici', '<KapsamSecici']);
    expect(LAYOUT.match(/<KapsamSecici \{\.\.\.kapsam\}/g)).toHaveLength(2);
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
    // Etiketler dile göre (D2): paket adı shared'daki çevirmenden, sayı sözlükten.
    expect(SECICI).toContain('{paketEtiketi(h.paket, dil).etiket} · {d.sirketSayisi(h.sirketSayisi)}');
    // Türkçe paket adı hâlâ TEK kaynaktan (PAKET_SINIRLARI) geliyor.
    const paket = Object.keys(PAKET_SINIRLARI)[0] as keyof typeof PAKET_SINIRLARI;
    expect(paketEtiketi(paket, 'tr').etiket).toBe(PAKET_SINIRLARI[paket].etiket);
    expect(kapsamSozlugu.tr.sirketSayisi(4)).toBe('4 şirket');
    expect(kapsamSozlugu.en.sirketSayisi(4)).toBe('4 companies');
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
    // Cümle sözlükte (D2); aramada bu anahtar basılıyor.
    expect(SECICI).toContain('? d.aramaKapsami(ajans)');
    expect(kapsamSozlugu.tr.aramaKapsami('Profaj')).toContain('Profaj ağacında yapıldı');
    expect(kapsamSozlugu.en.aramaKapsami('Profaj')).toContain('Profaj');
    expect(kapsamSozlugu.en.aramaKapsami('Profaj')).not.toBe(kapsamSozlugu.tr.aramaKapsami('Profaj'));
    // İDDİA ŞARTA ÇAPALI: cümle her zaman basılsaydı tek hesaplı
    // kullanıcıya hiçbir işe yaramayan bir uyarı gösterilirdi.
    expect(SECICI).toContain('{ajans && digerUstHesaplar.length > 0 && (');
  });

  it('şirket sayacı duruyor', () => {
    // Sıra (toplam, görünen) — tersine çağrılırsa "6 şirketten 49 tanesi" yazar.
    expect(SECICI).toContain('d.gosteriliyor(sirketler.length, suzulmus.length)');
    expect(kapsamSozlugu.tr.gosteriliyor(49, 6)).toBe('49 şirketten 6 tanesi gösteriliyor');
    expect(kapsamSozlugu.en.gosteriliyor(49, 6)).toBe('Showing 6 of 49 companies');
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
    expect(SECICI).toContain("href={ayarlarAdresi('sirketler')}");
    expect(SECICI).toContain('{d.sirketleriYonet}');
    expect(kapsamSozlugu.tr.sirketleriYonet).toBe('Şirketleri yönet');
    expect(kapsamSozlugu.en.sirketleriYonet).toBeTruthy();
    expect(kapsamSozlugu.en.sirketleriYonet).not.toBe('Şirketleri yönet');
    expect(SECICI).toContain('{yonetimGorunur && (');
  });

  it('KRİTİK: alt satır iki temada da okunuyor — `bg-ink text-white` yok', () => {
    // Karanlık temada `ink` açık renge dönüyor: açık zemine beyaz yazı.
    expect(SECICI).not.toContain('bg-ink');
  });

  it('üst hesap ayarları YALNIZCA platform sahibine ve birden çok hesapta', () => {
    /*
     * Hesaplar ARASINDA çalışan bir kart (Şirketler sekmesinin
     * `#ust-hesaplar`ı) ve 2026-10-13'ten beri yalnız platform sahibine
     * çiziliyor. Tek hesaplı kullanıcıda da gidilecek ikinci hesap yok.
     */
    const blok = SECICI.slice(SECICI.indexOf('{yonetimGorunur && ('));
    expect(blok).toContain('{ustHesaplarGorunur && ustHesaplar.length > 1 && (');
    expect(SECICI).toContain("href={ayarlarAdresi('sirketler', { capa: 'ust-hesaplar' })}");
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
