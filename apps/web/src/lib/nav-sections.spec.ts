import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS, type Permission } from '@advetics/shared';
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
    // BEŞ BÖLÜM: başlıksız hızlı erişim + üç iş bölümü + Ayarlar. Sayı
    // testte yazılı çünkü yapı iki kez değişti ve her değişim bir karardı;
    // altıncı bir bölüm eklenirse burası düşer ve karar gözden geçirilir.
    expect(SECTIONS.map((s) => s.title)).toEqual([
      undefined,
      'Reklamlar',
      'Raporlar',
      'Kütüphane',
      'Ayarlar',
    ]);
    expect(SECTIONS.flatMap((s) => s.items).filter((i) => i.perm).length).toBe(3);
  });
});

describe('MÜŞTERİ HESABI (client_viewer)', () => {
  it('KRİTİK: "Çalışma Alanı" kategorisini GÖRMÜYOR', () => {
    expect(basliklar('client_viewer')).not.toContain('Ayarlar');
  });

  it('KRİTİK: Müşteriler, Platform Bağlantıları ve Ekip & Yetkiler görünmüyor', () => {
    const gorunen = etiketler('client_viewer');
    expect(gorunen).not.toContain('Müşteriler');
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
    expect(gorunen).toContain('Bilgi Bankası');
  });
});

describe('AJANS ROLLERİ', () => {
  it('owner "Çalışma Alanı" kategorisini ve üç ekranını görüyor', () => {
    expect(basliklar('owner')).toContain('Ayarlar');
    const gorunen = etiketler('owner');
    expect(gorunen).toContain('Müşteriler');
    expect(gorunen).toContain('Platform Bağlantıları');
    expect(gorunen).toContain('Ekip & Yetkiler');
  });

  it('admin de görüyor', () => {
    expect(basliklar('admin')).toContain('Ayarlar');
  });

  it('analist ajans içi olduğu için kategoriyi görüyor ama yönetim ekranları yetkisine bağlı', () => {
    // Bu test bir DAVRANIŞI değil bir KARARI kilitliyor: analist ajans
    // çalışanı, müşteri değil. Yetki matrisi değiştiğinde burası düşerse
    // karar bilinçli olarak gözden geçirilmeli.
    const gorunen = etiketler('analyst');
    const yonetim = ['Müşteriler', 'Platform Bağlantıları', 'Ekip & Yetkiler'];
    const sahipOlduklari = yonetim.filter((y) => gorunen.includes(y));
    expect(sahipOlduklari.length).toBe(
      yonetim.filter((y) => {
        const item = SECTIONS.flatMap((s) => s.items).find((i) => i.label === y)!;
        return !item.perm || ROLE_PERMISSIONS.analyst.includes(item.perm);
      }).length,
    );
  });
});
