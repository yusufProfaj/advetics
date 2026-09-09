import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS, type Permission } from '@advetics/shared';
import { SAYFA_GIRIS_IZNI, SEKMELER } from '@/components/bilgi-bankasi/sekmeler';
import { SECTIONS, visibleSections } from './nav-sections';

/**
 * MENÜ GÖRÜNÜRLÜĞÜ — arka uç guard'larıyla AYNI matristen.
 *
 * NEDEN YAZILDI: menü bir süre filtresiz basılıyordu ve "Çalışma Alanı"
 * kategorisi (Müşteriler, Platform Bağlantıları, Ekip & Yetkiler)
 * client_viewer rolüne de görünüyordu. Arka uç zaten reddediyordu, yani veri
 * sızmıyordu — ama kullanıcıya tıklayabildiği ve 403 alacağı bağlantılar
 * gösteriliyor, ajansın iç ekranlarının VARLIĞI müşteriye sızıyordu.
 *
 * roles.ts'in kendi başlığı bu kuralı zaten yazıyor: "Backend guard'ları ve
 * frontend UI gizleme mantığı aynı matristen beslenir — ikisinin ayrışması,
 * kullanıcıya tıklayabildiği ama 403 alacağı butonlar göstermek demektir."
 */

const izinler = (rol: keyof typeof ROLE_PERMISSIONS): Permission[] => [
  ...ROLE_PERMISSIONS[rol],
];

const basliklar = (rol: keyof typeof ROLE_PERMISSIONS): Array<string | undefined> =>
  visibleSections(izinler(rol)).map((s) => s.title);

const etiketler = (rol: keyof typeof ROLE_PERMISSIONS): string[] =>
  visibleSections(izinler(rol)).flatMap((s) => s.items.map((i) => i.label));

describe('menü verisi gerçekten okunuyor', () => {
  it('EKRANI OLMAYAN öğe menüde YOK', () => {
    /*
     * Menünün üçte biri `ready: false` idi: soluk, tıklanamaz satırlar.
     * Kullanıcı hangisinin çalıştığını denemeden bilemiyordu. Sayfası
     * yazılmamış bir öğeyi menüde tutmanın faydası yok.
     */
    const olu = SECTIONS.flatMap((s) => s.items).filter((i) => i.ready === false);
    expect(olu.map((i) => i.href)).toEqual([]);
  });

  it('aynı etiket İKİ KEZ geçmiyor', () => {
    // "Bilgi Bankası" iki satırdı: biri çalışan ekran, diğeri ekranı
    // olmayan bir kalıntı. İkisi menüde yan yana duruyordu.
    const etiket = SECTIONS.flatMap((s) => s.items).map((i) => i.label);
    expect(new Set(etiket).size).toBe(etiket.length);
  });

  it('tarama boşa düşmüyor — bölümler ve yetkili öğeler var', () => {
    // Bu dosyanın bütün iddiaları SECTIONS'a dayanıyor; dizi boşalırsa ya da
    // yetki anahtarları silinirse aşağıdaki "görünmüyor" testleri her zaman
    // doğru olurdu.
    // İKİ BÖLÜM: workspace içi işler + ajans yönetimi. Bu sayı bir kez
    // yediydi ve sadeleştirmede ikiye indi; testin onu bilmesi kasıtlı —
    // üçüncü bir bölüm eklenirse burası düşer ve karar gözden geçirilir.
    // BEŞ BÖLÜM: başlıksız hızlı erişim + üç iş bölümü + Sistem Yönetimi.
    // Sayı testte yazılı çünkü yapı iki kez değişti ve her değişim bir
    // karardı; altıncı bir bölüm eklenirse burası düşer ve karar gözden
    // geçirilir. Son bölümün adı "Ayarlar"dı; içinde ayar OLMAYAN ekranlar
    // (Şirketler, Workspace'ler, Ekip) o adı yanlış yapıyordu.
    expect(SECTIONS.map((s) => s.title)).toEqual([
      undefined,
      'Reklamlar',
      'Raporlar',
      'Kütüphane',
      'Sistem Yönetimi',
    ]);
    /*
     * YETKİYLE KAPALI ÖĞELER — ÇIPLAK SAYI YERİNE ADLARIYLA.
     *
     * Burada `.toBe(6)` yazıyordu ve menüye yeni bir korumalı öğe eklemek
     * testi "kırıyordu" — ama kırılma bir SIZINTIYI değil, yalnızca sayının
     * değiştiğini gösteriyordu. CLAUDE.md: "Sayıma dayanan iddia yazma."
     *
     * Asıl korunması gereken şey KİMLERİN kapalı olduğu: Senkronizasyon
     * Durumu platformun ham hata mesajlarını basıyor ve `perm` düşerse
     * müşteri hesabı da görürdü. Adları yazmak, hem yeni öğe eklendiğinde
     * gereksiz kırılmıyor hem de MEVCUT bir korumanın düşmesini yakalıyor.
     */
    const korumali = SECTIONS.flatMap((s) => s.items)
      .filter((i) => i.perm)
      .map((i) => i.href)
      .sort();
    for (const zorunlu of [
      '/ayarlar/musteriler',
      '/ayarlar/baglantilar',
      '/ayarlar/senkronizasyon',
      '/ayarlar/ekip',
      // Bilgi Bankası bu listeye SONRADAN girdi: yetkisiz olduğu dönemde
      // ilk sekmesi ajans içi notu basıyordu. Bugün notu basmıyor ama
      // kapının kendisi kalıcı.
      '/kutuphane/bilgi-bankasi',
    ]) {
      expect(korumali, `${zorunlu} yetkisiz kalmış`).toContain(zorunlu);
    }
    // Tarama boşa düşmesin: liste gerçekten dolu.
    expect(korumali.length).toBeGreaterThanOrEqual(4);
  });

  it('Bilgi Bankası KÜTÜPHANE bölümünde — içeriği artık workspace’in genel profili', () => {
    // Bir süre Akıllı Boost'un altında, başlıksız bölümdeydi (o zamanki
    // içeriği boost ön ayarlarıydı). İçerik değişince konum da değişti;
    // bu test kararı KİLİTLİYOR — bölüm bilinçsizce geri kaymasın.
    const bolum = SECTIONS.find((s) => s.items.some((i) => i.label === 'Bilgi Bankası'));
    expect(bolum?.title).toBe('Kütüphane');
  });

  it('KRİTİK: Bilgi Bankası satırı SAYFANIN KENDİ giriş yetkisini taşıyor', () => {
    /*
     * Bu test bir DAVRANIŞI değil bir KARARI kilitliyor.
     *
     * Satır uzun süre yetkisizdi ve bu bilinçli bir karar değildi: sayfa o
     * zaman boost ön ayarlarıydı, sonra içerik müşteri profiline döndü ve
     * ilk sekme bir süre `clients.notes`u — AJANS İÇİ notu — bastı. Sızıntı
     * üç halkanın birleşmesiydi ve biri buydu: menü satırında `perm` yok.
     *
     * İDDİA SABİT BİR DİZGEYE DEĞİL, SAYFANIN KAPISINA ÇAPALI: sayfa
     * `SAYFA_GIRIS_IZNI` ile korunuyor ve menü aynı sabiti kullanıyor. Yetki
     * bir gün değişirse ikisi BİRLİKTE değişmek zorunda; ayrışırlarsa ya
     * menüde görünüp açılmayan ya da gizlenip çalışan bir satır olur —
     * `roles.ts`in "aynı matristen beslenir" kuralının tam ihlali.
     */
    const satir = SECTIONS.flatMap((s) => s.items).find((i) => i.label === 'Bilgi Bankası');
    expect(satir, 'menüde Bilgi Bankası satırı yok — tarama boşa düştü').toBeDefined();
    expect(satir!.perm).toBe(SAYFA_GIRIS_IZNI);
    // Kapının kendisi de sekme listesinden türüyor: ilk sekmenin okuma
    // yetkisi. Elle yazılmış bir sabit, sekme listesi değiştiğinde sessizce
    // bayatlardı.
    expect(SAYFA_GIRIS_IZNI).toBe(SEKMELER[0].oku);
  });
});

describe('MÜŞTERİ HESABI (client_viewer)', () => {
  it('KRİTİK: "Çalışma Alanı" kategorisini GÖRMÜYOR', () => {
    expect(basliklar('client_viewer')).not.toContain('Sistem Yönetimi');
  });

  it('KRİTİK: Workspace’ler, Platform Bağlantıları ve Ekip & Yetkiler görünmüyor', () => {
    const gorunen = etiketler('client_viewer');
    expect(gorunen).not.toContain('Workspace’ler');
    expect(gorunen).not.toContain('Platform Bağlantıları');
    expect(gorunen).not.toContain('Ekip & Yetkiler');
  });

  it('kendi işini yapabileceği ekranları GÖRÜYOR — süzgeç fazla kesmiyor', () => {
    // Ters yöndeki hata da gerçek: her şeyi gizleyen bir süzgeç de bu
    // testlerin ilkini geçerdi.
    const gorunen = etiketler('client_viewer');
    expect(gorunen).toContain('Genel Bakış');
    expect(gorunen).toContain('Akıllı Boost');
    expect(gorunen).toContain('Raporlar');
  });

  it('Bilgi Bankası GÖRÜNÜYOR — içeriği workspace’in KENDİ bilgisi olduğu için', () => {
    /*
     * BU İDDİA AYNI KALDI AMA GEREKÇESİ TAMAMEN DEĞİŞTİ — bir DAVRANIŞ
     * değil, gözden geçirilmiş bir KARAR kilitleniyor.
     *
     * Eskiden yukarıdaki "süzgeç fazla kesmiyor" testinin bir satırıydı ve o
     * hâliyle sayfanın İÇERİĞİ boost ön ayarıydı. İçerik iki kez değişti ve
     * ikincisinde satır bir güvenlik sorusuna dönüştü: ilk sekme bir süre
     * `clients.notes`u (ajans içi not) bastı, yani müşteri hesabının o satırı
     * GÖRMESİ yanlıştı.
     *
     * Karar: sekme `clients.notes`u BIRAKTI, yerine `ClientProfile.
     * bilgiBankasi` geldi — müşterinin kendi ürün/hizmet bilgisi, sık
     * sorulanları. Bu bilgi zaten müşteriye ait, o yüzden müşteri hesabı hem
     * görüyor hem okuyor; `client.write` taşımadığı için DÜZENLEYEMİYOR.
     *
     * Satır bir gün yeniden ajans içi bir şey göstermeye başlarsa bu testin
     * DÜŞMESİ değil, elle gözden geçirilmesi gerekiyor: iddia içeriğe değil
     * yetkiye bakıyor. O yüzden gerekçe burada yazılı.
     */
    expect(etiketler('client_viewer')).toContain('Bilgi Bankası');
    // client_viewer okuyabiliyor ama YAZAMIYOR — sayfanın "Kaydet" düğmesini
    // gizleyen koşul bu.
    expect(ROLE_PERMISSIONS.client_viewer).toContain('client.read');
    expect(ROLE_PERMISSIONS.client_viewer).not.toContain('client.write');
  });
});

describe('AJANS ROLLERİ', () => {
  it('owner "Sistem Yönetimi" kategorisini ve ekranlarını görüyor', () => {
    expect(basliklar('owner')).toContain('Sistem Yönetimi');
    const gorunen = etiketler('owner');
    expect(gorunen).toContain('Workspace’ler');
    expect(gorunen).toContain('Platform Bağlantıları');
    expect(gorunen).toContain('Ekip & Yetkiler');
  });

  it('admin de görüyor', () => {
    expect(basliklar('admin')).toContain('Sistem Yönetimi');
  });

  it('analist ajans içi olduğu için kategoriyi görüyor ama yönetim ekranları yetkisine bağlı', () => {
    // Bu test bir DAVRANIŞI değil bir KARARI kilitliyor: analist ajans
    // çalışanı, müşteri değil. Yetki matrisi değiştiğinde burası düşerse
    // karar bilinçli olarak gözden geçirilmeli.
    const gorunen = etiketler('analyst');
    const yonetim = ['Workspace’ler', 'Platform Bağlantıları', 'Ekip & Yetkiler'];
    const sahipOlduklari = yonetim.filter((y) => gorunen.includes(y));
    expect(sahipOlduklari.length).toBe(
      yonetim.filter((y) => {
        const item = SECTIONS.flatMap((s) => s.items).find((i) => i.label === y)!;
        return !item.perm || ROLE_PERMISSIONS.analyst.includes(item.perm);
      }).length,
    );
  });
});
