import { AYARLAR_SEKMELERI } from '@advetics/shared';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PANEL_KAPILARI, ROLE_PERMISSIONS, STRATEJI_SAYFA_IZNI, kapiAcikMi, type Permission } from '@advetics/shared';
import { MARKA_MERKEZI_IZNI, VARLIKLAR_IZNI } from './panel-adresleri';
import { SECTIONS, menuBolumuEtiketi, visibleSections } from './nav-sections';

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
  visibleSections(izinler(rol), { ustHesapGorunur: true, platformSahibi: false }).map((s) => s.title);

const etiketler = (rol: keyof typeof ROLE_PERMISSIONS): string[] =>
  visibleSections(izinler(rol), { ustHesapGorunur: true, platformSahibi: false }).flatMap((s) => s.items.map((i) => i.label));

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
    // (Şirketler, Ekip) o adı yanlış yapıyordu.
    // YEDİ BÖLÜM + AYARLAR (2026-10-09, kullanıcı kararı): bir reklamın
    // hayatının sırası. Adlar Türkçe; "Base" onaylanmış istisna.
    expect(SECTIONS.map((s) => s.title)).toEqual([
      undefined,
      'Planla',
      'Oluştur',
      'Yönet',
      'İyileştir',
      'Raporlar',
      // "Kütüphane" 2026-10-06'da "Base" oldu (kullanıcı kararı).
      'Base',
      'Ayarlar',
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
      // ŞİRKETLER VE WORKSPACE'LER (2026-10-13): eski Şirketler, workspace
      // listesi ve Üst hesaplar tek sekmede. Yetkisiz kalırsa müşteri hesabı
      // ajansın şirket ağacını görürdü.
      '/ayarlar/sirketler',
      '/ayarlar/baglantilar',
      '/ayarlar/ekip',
      // Bilgi Bankası'nın içeriği Marka Merkezi'ne taşındı (2026-10-06);
      // kapı oradan devam ediyor: yetkisiz kalırsa müşteri hesabı Base'i görür.
      '/marka-merkezi',
    ]) {
      expect(korumali, `${zorunlu} yetkisiz kalmış`).toContain(zorunlu);
    }
    // Tarama boşa düşmesin: liste gerçekten dolu.
    expect(korumali.length).toBeGreaterThanOrEqual(4);
  });

  it('Base iki satır: Marka Merkezi ve Varlıklar — Bilgi Bankası ayrı satır değil', () => {
    /*
     * Kullanıcı: "nereye nereden girdiğimi unutuyorum" (2026-10-06). Bilgi
     * Bankası aynı workspace profilinin yarısını ayrı bir sayfada
     * gösteriyordu; içeriği Marka Merkezi › Marka'ya taşındı. 2026-10-13'ten
     * beri Varlıklar (görsel, kreatif, form, kitle) ayrı satır (Karar B,
     * docs/panel-sadelestirme/MIMARI.md): her gün açılan malzeme bir kurulum
     * ekranının iç menüsünde durmamalı.
     */
    const base = SECTIONS.find((s) => s.title === 'Base');
    expect(base, 'Base bölümü yok — tarama boşa düştü').toBeDefined();
    expect(base!.items.map((i) => i.label)).toEqual(['Marka Merkezi', 'Varlıklar']);
    expect(SECTIONS.flatMap((s) => s.items).some((i) => i.label === 'Bilgi Bankası')).toBe(false);
  });

  it('KRİTİK: Marka Merkezi ve Varlıklar satırları sözleşmenin kapısını taşıyor', () => {
    // Müşteri hesabı (client.read) iki ekranı da görmüyor; kullanıcı sınırı
    // dört ekranla çizdi. Satırın izni sayfanın kapısıyla AYNI sabitten.
    const satir = (href: string) => SECTIONS.flatMap((s) => s.items).find((i) => i.href === href);
    expect(satir('/marka-merkezi')?.perm).toBe(MARKA_MERKEZI_IZNI);
    expect(MARKA_MERKEZI_IZNI).toBe('client.write');
    expect(satir('/varliklar')?.perm).toBe(VARLIKLAR_IZNI);
    for (const izin of [MARKA_MERKEZI_IZNI, VARLIKLAR_IZNI]) {
      expect(ROLE_PERMISSIONS.client_viewer).not.toContain(izin);
    }
  });

  it('KRİTİK: iş bölümlerinin HER satırı yetki taşıyor', () => {
    /*
     * Süzme opt-in: yetkisiz satır herkese görünüyor. Müşteri hesabının
     * "reklam kısmını görmemesi" bu bölümlerde yetkisiz satır kalmamasına
     * bağlı — biri düşerse müşteri menüde Kurallar'ı görür.
     */
    const isBolumleri = ['Planla', 'Oluştur', 'Yönet', 'İyileştir', 'Base'];
    // Tarama boşa düşmesin: beşi de gerçekten var.
    expect(SECTIONS.filter((s) => isBolumleri.includes(s.title ?? '')).length).toBe(isBolumleri.length);
    for (const bolum of SECTIONS.filter((s) => isBolumleri.includes(s.title ?? ''))) {
      for (const i of bolum.items) {
        expect(i.perm, `${i.href} yetkisiz`).toBeTruthy();
      }
    }
  });
});

describe('MENÜDEKİ AD İLE SAYFANIN ADI AYNI', () => {
  it('KRİTİK: her menü öğesinin etiketi kendi sayfasında geçiyor', () => {
    /*
     * Bu kural iki kez ÇİĞNENDİ ve ikisini de kullanıcı fark etti:
     * menüde "Akıllı Boost" yazarken sayfa "Auto-Boost" başlığıyla,
     * menüde "Reklam Oluştur" yazarken sayfa "Reklamlar" başlığıyla
     * açılıyordu. Aynı şeyin iki adı olması kullanıcıya yanlış sayfaya
     * düştüğünü düşündürüyor ve panelin dilini de bozuyor.
     *
     * TypeScript bunu göremiyor: etiket bir dize, başlık başka bir dize.
     * İddia sayfanın KAYNAĞINDA etiketin geçmesini istiyor — ilk `h1`e
     * bakmak yanlış olurdu, çünkü çoğu sayfa önce "Önce bir workspace seç"
     * koruma ekranını basıyor.
     */
    const kok = join(__dirname, '..', 'app', '(dashboard)');
    const eksik: string[] = [];
    for (const bolum of SECTIONS) {
      for (const oge of bolum.items) {
        const dosya = join(kok, oge.href.replace(/^\//, ''), 'page.tsx');
        // Sayfanın VARLIĞINI başka bir test kilitliyor; burada yokluk
        // sessizce atlanmamalı, iddiaya girmeli.
        if (!existsSync(dosya)) {
          eksik.push(`${oge.href}: sayfa yok`);
          continue;
        }
        /*
         * TARAMA YORUMSUZ KAYNAKTA. İlk yazımda ham kaynağa bakıyordu ve
         * mutasyon testinde BOŞ ÇIKTI: başlığı eski hâline döndürdüğümde
         * test yeşil kaldı, çünkü kuralı ANLATAN yorum ("menüde 'Reklam
         * Oluştur' yazıyordu…") aynı dosyada duruyor ve `includes` ikisini
         * ayırt etmiyor. CLAUDE.md'de adı konmuş tuzak.
         */
        const kod = readFileSync(dosya, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
          .replace(/^\s*\/\/.*$/gm, '');
        /*
         * İKİ DİL (D2): sözlüğe geçen sayfa adını düz dize olarak değil
         * menünün KENDİ çevirisinden alıyor: menü satırı için
         * `menuEtiketiCevir('satir', '<etiket>', …)`, Ayarlar sekmesi için
         * `ayarSekmesiAdi('<kod>', …)` (menü de onu okuyor). O zaman ad iki
         * dilde de menüyle aynı ve iddia "aynı kaynak hem sayfa başlığında
         * hem sekme başlığında (generateMetadata) kullanılıyor" oluyor.
         */
        const sekme = AYARLAR_SEKMELERI.find((s) => s.yol === oge.href);
        const tekKaynak = sekme ? `ayarSekmesiAdi('${sekme.kod}'` : `menuSatiriEtiketi('${oge.href}'`;
        if (kod.includes(tekKaynak)) {
          const metaBlok = /export async function generateMetadata[\s\S]*?\n}/.exec(kod)?.[0] ?? '';
          if (!metaBlok.includes(tekKaynak)) eksik.push(`${oge.href}: generateMetadata başlığı ${tekKaynak}… kullanmıyor`);
          if (kod.split(tekKaynak).length - 1 < 2) eksik.push(`${oge.href}: ${tekKaynak}… yalnız bir yerde (sayfa başlığında yok)`);
          continue;
        }
        if (!kod.includes(oge.label)) {
          eksik.push(`${oge.href}: sayfada "${oge.label}" geçmiyor`);
          continue;
        }

        /*
         * SEKME BAŞLIĞI DA AYNI ADI TAŞIYOR.
         *
         * Kaynakta geçmesi tek başına gevşek: ad bir yardım cümlesinde
         * geçiyor olabilir ve başlık hâlâ başka bir şey diyebilir. Tarayıcı
         * sekmesi kullanıcının menüden sonra gördüğü ikinci ad; ikisi
         * ayrışırsa yer imleri ve sekme listesi menüden bağımsız bir isim
         * kümesi üretiyor.
         */
        const baslik = /metadata\s*=\s*\{\s*title:\s*'([^']+)'/.exec(kod)?.[1];
        if (baslik === undefined) eksik.push(`${oge.href}: metadata.title yok`);
        else if (!baslik.includes(oge.label)) {
          eksik.push(`${oge.href}: sekme başlığı "${baslik}" etiketi taşımıyor`);
        }

        /*
         * ALT ÖĞELER AYNI SAYFAYI AÇIYOR — adları o sayfada geçmeli.
         *
         * "Meta AI" ve "Google Ads AI" tek bir ekranın iki bağlamı; sayfa
         * hangisinde olduğunu YAZMAK zorunda, yoksa kullanıcı menüden
         * seçtiği asistanla konuşup konuşmadığını bilemez.
         */
        for (const alt of oge.children ?? []) {
          /*
           * ADI TEK KAYNAKTAN TÜRETEN SAYFA ZATEN UYUMLU. Etiket hem menüde
           * hem sayfada `ASISTAN_PLATFORM_ETIKETI`den geliyor; düz dize
           * aramak, doğru çözümü (tek kaynak) yanlış gösterirdi.
           */
          if (!kod.includes(alt.label) && !kod.includes('ASISTAN_PLATFORM_ETIKETI')) {
            eksik.push(`${oge.href}: alt öğe "${alt.label}" sayfada geçmiyor`);
          }
        }
      }
    }
    expect(eksik).toEqual([]);
  });
});

describe('ADVCAMPAIGN SATIRI', () => {
  /*
   * Reklam Oluştur, AI Asistan ve Toplu Oluştur kaldırıldı (kullanıcı kararı
   * 2026-10-07); reklam kurmanın tek yolu AdvCampaign. Eski satırların bir
   * gün geri dönmesi, kullanıcıyı ikinci (eski, hatalı) bir yayın yoluna
   * götürmek olurdu.
   */
  const satirlar = SECTIONS.flatMap((s) => s.items);

  it('KRİTİK: /reklam\'a gidiyor ve bulk.write istiyor — müşteri hesabı GÖRMÜYOR', () => {
    const adv = satirlar.find((i) => i.label === 'AdvCampaign');
    expect(adv?.href).toBe('/reklam');
    expect(adv?.perm).toBe('bulk.write');
    expect(etiketler('client_viewer')).not.toContain('AdvCampaign');
  });

  it('KRİTİK: eski reklam oluşturma satırları menüde YOK', () => {
    const tumu = satirlar.flatMap((i) => [i, ...(i.children ?? [])]);
    for (const i of tumu) {
      expect(i.href).not.toMatch(/^\/(reklam-olustur|toplu-olustur)/);
      expect(i.label).not.toMatch(/Reklam Oluştur|AI Asistan|Toplu/);
    }
  });
});

describe('İYİLEŞTİR SATIRI (Aşama 4)', () => {
  /*
   * Öneriler, AI Asistan ve Kurallar TEK sayfanın sekmeleri. Kurallar
   * satırının menüye geri dönmesi aynı ekrana iki kapı demek ve kullanıcının
   * "nereye nereden girdiğimi unutuyorum" şikâyetinin sebebi tam buydu.
   */
  const bolum = SECTIONS.find((s) => s.title === 'İyileştir');

  it('KRİTİK: tek satır, /iyilestir, sayfa kapısıyla aynı yetki (rule.read)', () => {
    expect(bolum, 'İyileştir bölümü yok — tarama boşa düştü').toBeDefined();
    expect(bolum!.items.map((i) => [i.href, i.label, i.perm])).toEqual([['/iyilestir', 'İyileştir', 'rule.read']]);
    const sayfa = readFileSync(join(__dirname, '..', 'app', '(dashboard)', 'iyilestir', 'page.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(sayfa).toContain(`hasPermission(session, '${bolum!.items[0]!.perm}')`);
  });

  it('KRİTİK: müşteri hesabı GÖRMÜYOR, ajans rolleri görüyor', () => {
    expect(ROLE_PERMISSIONS.client_viewer).not.toContain('rule.read');
    expect(etiketler('client_viewer')).not.toContain('İyileştir');
    expect(etiketler('ad_manager')).toContain('İyileştir');
    expect(etiketler('admin')).toContain('İyileştir');
  });

  it('eski /kurallar satırı menüde YOK', () => {
    const tumu = SECTIONS.flatMap((s) => s.items);
    expect(tumu.some((i) => i.href === '/kurallar' || i.label === 'Kurallar')).toBe(false);
  });
});

describe('ADVSTRATEGY SATIRI', () => {
  const satirlar = SECTIONS.flatMap((s) => s.items);

  it('KRİTİK: /strateji\'ye gidiyor ve izni sözleşmenin sayfa izninden alıyor', () => {
    const satir = satirlar.find((i) => i.label === 'AdvStrategy');
    expect(satir?.href).toBe('/strateji');
    expect(satir?.perm).toBe(STRATEJI_SAYFA_IZNI);
    expect(STRATEJI_SAYFA_IZNI).toBe('strategy.read');
  });

  it('KRİTİK: menü satırı izni ELLE yazılmamış — sabit içe aktarılıyor', () => {
    /*
     * Değer aynı olsa bile elle yazılmış 'strategy.read' sözleşme değişince
     * menüyü ve sayfa kapısını ayrıştırırdı. Yorumsuz kaynakta sabitin adı
     * geçmeli, dizgenin kendisi geçmemeli.
     */
    const kod = readFileSync(join(__dirname, 'nav-sections.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(kod).toContain('perm: STRATEJI_SAYFA_IZNI');
    expect(kod).not.toContain("'strategy.read'");
  });

  it('KRİTİK: sayfa kapısı da AYNI sabiti okuyor', () => {
    const kod = readFileSync(join(__dirname, '..', 'app', '(dashboard)', 'strateji', 'page.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(kod).toContain('hasPermission(session, STRATEJI_SAYFA_IZNI)');
  });

  it('Planla’da ve Planla, AdvCampaign’in bulunduğu Oluştur’dan HEMEN önce', () => {
    // Onaylanan plan AdvCampaign'e aktarılıyor: iki ekran aynı işin ardışık
    // adımları. Eskiden aynı bölümde alt altaydı; 2026-10-09'dan beri
    // ardışık iki bölümde.
    const basliklar = SECTIONS.map((s) => s.title);
    const planla = SECTIONS.find((s) => s.title === 'Planla');
    const olustur = SECTIONS.find((s) => s.title === 'Oluştur');
    expect(planla?.items.map((i) => i.label)).toContain('AdvStrategy');
    expect(olustur?.items.map((i) => i.label)).toContain('AdvCampaign');
    expect(basliklar.indexOf('Oluştur')).toBe(basliklar.indexOf('Planla') + 1);
  });

  it('KRİTİK: Aylık Bütçe Planla’da ve menüde yazma yetkisiyle (client_viewer forma gitmesin)', () => {
    const satir = SECTIONS.find((s) => s.title === 'Planla')?.items.find((i) => i.href === '/butce');
    expect(satir?.label).toBe('Aylık Bütçe');
    expect(satir?.perm).toBe('budget.write');
    expect(ROLE_PERMISSIONS.client_viewer).not.toContain('budget.write');
  });

  it('ajans rolleri görüyor', () => {
    expect(etiketler('admin')).toContain('AdvStrategy');
    expect(etiketler('ad_manager')).toContain('AdvStrategy');
  });
});

describe('MÜŞTERİ HESABI (client_viewer)', () => {
  it('KRİTİK: "Çalışma Alanı" kategorisini GÖRMÜYOR', () => {
    expect(basliklar('client_viewer')).not.toContain('Ayarlar');
  });

  it('KRİTİK: Şirketler ve workspace’ler, Platform bağlantıları ve Ekip ve güvenlik görünmüyor', () => {
    const gorunen = etiketler('client_viewer');
    // Etiketler SÖZLEŞMEDEN: düz dizge yazmak, ad değişince "görünmüyor"
    // iddiasını sessizce her zaman doğru yapardı (eski adlar böyle kaldı).
    const ayarlar = SECTIONS.find((s) => s.title === 'Ayarlar')!.items.map((i) => i.label);
    expect(ayarlar).toEqual(['Şirketler ve workspace’ler', 'Platform bağlantıları', 'Ekip ve güvenlik']);
    for (const etiket of ayarlar) expect(gorunen).not.toContain(etiket);
  });

  it('KRİTİK: TAM OLARAK dört ekran görüyor — Genel Bakış, Reklam Yöneticisi, AdvStrategy, Raporlar', () => {
    /*
     * Kullanıcının tanımı: "müşteri = sadece genel bakış, reklam keşfi ve
     * raporlar kısmını görebilir". AdvStrategy SONRADAN eklendi ve kararı
     * ayrı: medya planı müşteriye PANEL İÇİNDEN onaylatılıyor (Ç-5,
     * 2026-10-08) ve rol `strategy.read` + `strategy.approve` taşıyor.
     * Yazma (`strategy.write`) yok; yani bu satır "reklam kısmı" değil,
     * müşterinin kendi kararını verdiği yer.
     *
     * `toEqual`: fazladan bir satır (Akıllı Boost, Kurallar, AdvCampaign) da
     * eksik bir satır da düşürür. Ters yöndeki hata da gerçek: her şeyi
     * gizleyen bir süzgeç "görmüyor" testlerini geçerdi.
     */
    // Sıra 2026-10-09'dan beri bölüm sırasından: Planla, Yönet'ten önce.
    expect(etiketler('client_viewer')).toEqual(['Genel Bakış', 'AdvStrategy', 'Reklam Yöneticisi', 'Raporlar']);
    expect(basliklar('client_viewer')).toEqual([undefined, 'Planla', 'Yönet', 'Raporlar']);
  });

  it('Bilgi Bankası GÖRÜNMÜYOR — karar değişti', () => {
    /*
     * Burada tersi kilitliydi ("workspace'in kendi bilgisi, müşteri görsün").
     * Kullanıcı rolleri yeniden tanımlarken müşteri hesabına üç ekran
     * bıraktı; Kütüphane onlardan değil. Okuma yetkisi (`client.read`)
     * duruyor — Genel Bakış'ın workspace adını okuması ona bağlı — ama
     * sayfa kapısı artık `client.write`.
     */
    expect(etiketler('client_viewer')).not.toContain('Bilgi Bankası');
    expect(ROLE_PERMISSIONS.client_viewer).toContain('client.read');
    expect(ROLE_PERMISSIONS.client_viewer).not.toContain('client.write');
  });
});

describe('AJANS ROLLERİ', () => {
  it('Yönetici "Ayarlar" bölümünü ve üç sekmeyi görüyor', () => {
    expect(basliklar('admin')).toContain('Ayarlar');
    const gorunen = etiketler('admin');
    // Workspace listesi, Üst hesaplar, Senkronizasyon, E-posta ve Okuma API
    // AYRI SATIR DEĞİL — sekmelerin ve Marka Merkezi'nin içinde.
    expect(gorunen).toContain('Şirketler ve workspace’ler');
    expect(gorunen).toContain('Platform bağlantıları');
    expect(gorunen).toContain('Ekip ve güvenlik');
  });

  it('KRİTİK: Reklam Yöneticisi Şirketler ve workspace’ler sekmesini GÖRÜYOR (MIMARI Ç-2)', () => {
    /*
     * KARAR DEĞİŞTİ (2026-10-13). Sekme `org.write` ile kapalıydı; reklam
     * yöneticisi workspace AÇABİLİYOR (`client.write`, rolün tanımı) ama
     * listeye giremiyordu. Sekme kapısı artık `client.write`; şirket
     * kartları ve şirket işlemleri sayfanın İÇİNDE `sirket.yonet` ile
     * kapalı (org yöneticisi) — şirket kümesini değiştirmek hâlâ onun işi.
     */
    const gorunen = etiketler('ad_manager');
    expect(gorunen).toContain('Şirketler ve workspace’ler');
    expect(gorunen).toContain('Platform bağlantıları');
    expect(gorunen).toContain('AdvCampaign');
    expect(gorunen).toContain('İyileştir');
    // `user.read`: listeyi görür, değiştiremez (`ekip.yonet` org yöneticisi).
    expect(gorunen).toContain('Ekip ve güvenlik');
    expect(ROLE_PERMISSIONS.ad_manager).not.toContain('org.write');
  });
});

describe('KRİTİK: "Üst hesaplar" menü satırı DEĞİL — Şirketler sekmesinde, yalnız platform sahibine', () => {
  /*
   * Eskiden ayrı bir menü satırıydı ve üyelikle (`ustHesapGorunur`)
   * açılıyordu. Kullanıcı kararı (2026-10-13): üst hesabın kendisini
   * (ad, paket, silme) yalnız Advetics yönetir; kart Şirketler ve
   * workspace'ler sekmesinin içinde `ustHesap.yonet` ile çiziliyor.
   */
  const menu = (ustHesapGorunur: boolean): string[] =>
    visibleSections(izinler('admin'), { ustHesapGorunur, platformSahibi: false }).flatMap((s) => s.items.map((i) => i.label));

  it('üyelik bayrağı hiçbir menü satırını saklamıyor ya da açmıyor', () => {
    expect(menu(true)).toEqual(menu(false));
    expect(menu(true)).toContain('Şirketler ve workspace’ler');
  });

  it('KRİTİK: sayfa kartı platform sahibi kapısıyla çiziyor', () => {
    const kod = readFileSync(join(__dirname, '..', 'app', '(dashboard)', 'ayarlar', 'sirketler', 'page.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(kod).toContain("const ustHesapYonetir = kapi(session, 'ustHesap.yonet');");
    const kart = kod.indexOf('id="ust-hesaplar"');
    expect(kart, 'üst hesaplar kartı bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    // Kart, kapının koşulu içinde: koşul ile kart arasında başka bir JSX dalı yok.
    /*
     * KOŞUL BULUNMAZSA `slice(-1, …)` BOŞ DİLİM verir ve "arada `)}` yok"
     * iddiası HER ZAMAN doğru olur — mutasyonla yakalandı (koşul silinince
     * test yeşil kalıyordu). Önce koşulun varlığı.
     */
    const kosul = kod.lastIndexOf('{ustHesapYonetir && (', kart);
    expect(kosul, 'kart kapının içinde değil').toBeGreaterThan(-1);
    expect(kod.slice(kosul, kart)).not.toContain(')}');
  });
});

describe('AKILLI BOOST — Oluştur bölümünün öne çıkarılmış ilk satırı', () => {
  it('KRİTİK: Oluştur bölümünde, en üstte ve vurgulu', () => {
    // Kullanıcının isteği (2026-09-30): reklamların alt satırı ve
    // diğerlerinden daha belirgin. 2026-10-09'dan beri bölüm Oluştur.
    const olustur = SECTIONS.find((s) => s.title === 'Oluştur');
    expect(olustur?.items[0]?.label).toBe('Akıllı Boost');
    expect(olustur?.items[0]?.vurgu).toBeTruthy();
  });

  it('vurgu TEK satırda — iki vurgu hiçbirini belirgin yapmaz', () => {
    const vurgulu = SECTIONS.flatMap((s) => s.items).filter((i) => i.vurgu);
    expect(vurgulu.map((i) => i.label)).toEqual(['Akıllı Boost']);
  });
});

describe('KRİTİK: "Okuma API" yalnızca platform sahibine — Hesabım’ın kartı', () => {
  /*
   * Kullanıcının isteği: "sadece bu hesapla (platform sahibi) giriş
   * yaptığımda ayarlarda API kontrol paneli olsun". 2026-10-13'ten beri
   * ayrı menü satırı değil, Hesabım'ın `#okuma-api` kartı. Yetki anahtarı
   * bunu anlatamıyor: admin bütün izinleri taşıyabilir ama Sahip değil —
   * kapı bayrak (`PANEL_KAPILARI['okumaApi.yonet'].platformSahibi`).
   */
  const menu = (platformSahibi: boolean): string[] =>
    visibleSections(izinler('admin'), { ustHesapGorunur: true, platformSahibi }).flatMap((s) =>
      s.items.map((i) => i.label),
    );
  const HESABIM = readFileSync(
    join(__dirname, '..', 'app', '(dashboard)', 'ayarlar', 'hesabim', 'page.tsx'),
    'utf8',
  )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('menüde kimse için ayrı satır yok; platform sahibi bayrağı hiçbir satırı açmıyor', () => {
    expect(menu(true)).not.toContain('Okuma API');
    expect(menu(true)).toEqual(menu(false));
  });

  it('KRİTİK: kapı bayrak — bütün izinleri taşıyan admin açamıyor', () => {
    expect(PANEL_KAPILARI['okumaApi.yonet']).toMatchObject({ izinler: [], platformSahibi: true });
    const admin = { permissions: izinler('admin'), isOrgAdmin: true, platformAdmin: false, managerAccount: null };
    expect(kapiAcikMi(admin, 'okumaApi.yonet')).toBe(false);
    expect(kapiAcikMi({ ...admin, platformAdmin: true }, 'okumaApi.yonet')).toBe(true);
  });

  it('KRİTİK: Hesabım kartı ve anahtar isteği AYNI kapının içinde', () => {
    expect(HESABIM).toContain("const okumaApiAcik = kapi(session, 'okumaApi.yonet');");
    const kart = HESABIM.indexOf('id="okuma-api"');
    expect(kart, 'okuma API kartı bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    // Koşulun VARLIĞI önce: bulunamazsa `slice(-1, …)` boş dilim verir ve iddia boşa geçer (mutasyonla yakalandı).
    const kosul = HESABIM.lastIndexOf('{okumaApiAcik && (', kart);
    expect(kosul, 'kart kapının içinde değil').toBeGreaterThan(-1);
    expect(HESABIM.slice(kosul, kart)).not.toContain(')}');
    // Anahtarlar kapı kapalıyken İSTENMİYOR bile (uç 403 verirdi).
    expect(HESABIM).toMatch(/okumaApiAcik\s*\?\s*serverApiFetch<OkumaAnahtariOzeti\[\]>\('\/okuma-api\/anahtarlar'\)/);
  });

  it('eski adres herkesi Hesabım’a yönlendiriyor (kart yoksa varlık sızmıyor)', () => {
    const eski = readFileSync(join(__dirname, '..', 'app', '(dashboard)', 'ayarlar', 'okuma-api', 'page.tsx'), 'utf8');
    expect(eski).toContain("redirect(eskiAdresYonu('ayarlar/okuma-api'));");
  });
});

describe('sayfa başlığının bölüm adı menüden (D3)', () => {
  it('KRİTİK: bölüm adı satırın menüdeki bölümünden, iki dilde', () => {
    // Elle yazılan "Yönet" satır başka bölüme taşınınca eski bölümü söylerdi.
    expect(menuBolumuEtiketi('/ads-explorer', 'tr')).toBe('Yönet');
    expect(menuBolumuEtiketi('/ads-explorer', 'en')).toBe('Manage');
    expect(() => menuBolumuEtiketi('/yok', 'tr')).toThrow();
  });
});
