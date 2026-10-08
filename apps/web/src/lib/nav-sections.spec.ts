import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS, STRATEJI_SAYFA_IZNI, type Permission } from '@advetics/shared';
import { SAYFA_GIRIS_IZNI } from '@/components/bilgi-bankasi/sekmeler';
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
    expect(SECTIONS.map((s) => s.title)).toEqual([
      undefined,
      'Reklamlar',
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
      // WORKSPACE'LER ARTIK BU SAYFANIN İÇİNDE — `/ayarlar/musteriler`
      // menüden kalktı ve yönlendirmeye düştü.
      '/ayarlar/ust-hesap',
      // ÜST HESAPLAR (çoğul) — hesabın KENDİSİNİ yöneten sayfa. Yetkisiz
      // kalırsa müşteri hesabı menüde satılan hesapların varlığını görürdü.
      '/ayarlar/ust-hesaplar',
      '/ayarlar/baglantilar',
      '/ayarlar/senkronizasyon',
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

  it('Base bölümünün TEK kapısı Marka Merkezi — Bilgi Bankası ayrı satır değil', () => {
    /*
     * Kullanıcı: "nereye nereden girdiğimi unutuyorum" (2026-10-06). Bilgi
     * Bankası aynı workspace profilinin yarısını ayrı bir sayfada
     * gösteriyordu; içeriği Marka Merkezi › Marka'ya taşındı ve eski adres
     * oraya yönleniyor. Satırın geri gelmesi, iki kapılı yapının geri
     * gelmesi demek.
     */
    const base = SECTIONS.find((s) => s.title === 'Base');
    expect(base, 'Base bölümü yok — tarama boşa düştü').toBeDefined();
    expect(base!.items.map((i) => i.label)).toEqual(['Marka Merkezi']);
    expect(SECTIONS.flatMap((s) => s.items).some((i) => i.label === 'Bilgi Bankası')).toBe(false);
  });

  it('KRİTİK: Marka Merkezi satırı eski Bilgi Bankası kapısını (client.write) taşıyor', () => {
    // Müşteri hesabı (client.read) bu ekranı görmüyor; kullanıcı sınırı üç
    // ekranla çizdi. Eski Bilgi Bankası'nın kapısı da buydu.
    const satir = SECTIONS.flatMap((s) => s.items).find((i) => i.href === '/marka-merkezi');
    expect(satir?.perm).toBe(SAYFA_GIRIS_IZNI);
    expect(SAYFA_GIRIS_IZNI).toBe('client.write');
  });

  it('KRİTİK: Reklamlar ve Base bölümlerinin HER satırı yetki taşıyor', () => {
    /*
     * Süzme opt-in: yetkisiz satır herkese görünüyor. Müşteri hesabının
     * "reklam kısmını görmemesi" bu bölümlerde yetkisiz satır kalmamasına
     * bağlı — biri düşerse müşteri menüde Kurallar'ı görür.
     */
    for (const bolum of SECTIONS.filter((s) => s.title === 'Reklamlar' || s.title === 'Base')) {
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

  it('AdvCampaign\'in hemen altında, aynı bölümde', () => {
    const reklamlar = SECTIONS.find((s) => s.title === 'Reklamlar');
    const adlar = reklamlar?.items.map((i) => i.label) ?? [];
    expect(adlar.indexOf('AdvStrategy')).toBe(adlar.indexOf('AdvCampaign') + 1);
    expect(adlar.indexOf('AdvCampaign')).toBeGreaterThan(-1);
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

  it('KRİTİK: Şirketler, Platform Bağlantıları ve Ekip & Yetkiler görünmüyor', () => {
    const gorunen = etiketler('client_viewer');
    // Şirketler sayfası workspace listesini de İÇERİYOR — tek satır
    // kapanınca ikisi birden kapanıyor.
    expect(gorunen).not.toContain('Şirketler');
    expect(gorunen).not.toContain('Platform Bağlantıları');
    expect(gorunen).not.toContain('Ekip & Yetkiler');
  });

  it('KRİTİK: TAM OLARAK dört ekran görüyor — Genel Bakış, Reklam Keşfi, AdvStrategy, Raporlar', () => {
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
    expect(etiketler('client_viewer')).toEqual(['Genel Bakış', 'Reklam Keşfi', 'AdvStrategy', 'Raporlar']);
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
  it('Yönetici "Ayarlar" bölümünü ve ekranlarını görüyor', () => {
    expect(basliklar('admin')).toContain('Ayarlar');
    const gorunen = etiketler('admin');
    // "Workspace'ler" ARTIK BİR MENÜ SATIRI DEĞİL: workspace listesi
    // Şirketler sayfasının içinde bir bölüm.
    expect(gorunen).toContain('Şirketler');
    expect(gorunen).toContain('Platform Bağlantıları');
    expect(gorunen).toContain('Ekip & Yetkiler');
  });

  it('Reklam Yöneticisi: Ayarlar bölümünü görüyor, Şirketler ve kişi yönetimi hariç', () => {
    /*
     * Bu test bir DAVRANIŞI değil bir KARARI kilitliyor: reklam yöneticisi
     * ajans çalışanı, müşteri değil — Platform Bağlantıları'nı görmeli
     * (hesap atıyor). Ama Şirketler `org.write` ile kapalı: şirket açmak
     * erişilebilen şirket kümesini değiştiriyor ve o Yönetici işi. Ekip &
     * Yetkiler görünüyor (`user.read`) — listeyi görür, değiştiremez.
     */
    const gorunen = etiketler('ad_manager');
    expect(gorunen).toContain('Platform Bağlantıları');
    // Üst Hesaplar da `org.write` ile kapalı: hesabın kendisini yönetmek
    // Yönetici işi.
    expect(gorunen).not.toContain('Üst Hesaplar');
    expect(gorunen).toContain('AdvCampaign');
    expect(gorunen).toContain('Kurallar');
    expect(gorunen).toContain('Ekip & Yetkiler');
    expect(gorunen).not.toContain('Şirketler');
  });
});

describe('KRİTİK: "Üst Hesaplar" üyelikle açılıyor, yetkiyle değil', () => {
  /*
   * Müşteri şirketinin admini `org.write` taşıyor ama üst hesaba üye değil.
   * Menüde "Üst Hesaplar"ı görüyor ve içeride boş bir liste buluyordu:
   * üstünde bir katman olduğunu öğrenip giremediği bir ekran.
   */
  const menu = (ustHesapGorunur: boolean): string[] =>
    visibleSections(izinler('admin'), { ustHesapGorunur, platformSahibi: false }).flatMap((s) => s.items.map((i) => i.label));

  it('üyeliği olmayan admin "Üst Hesaplar"ı GÖRMÜYOR', () => {
    expect(menu(false)).not.toContain('Üst Hesaplar');
  });

  it('KRİTİK: aynı admin "Şirketler"i GÖRÜYOR — kendi workspace’lerini orada yönetiyor', () => {
    // İki satırı birlikte gizlemek kolaydı ve yanlıştı: workspace yönetimi
    // Şirketler sayfasının içinde.
    expect(menu(false)).toContain('Şirketler');
  });

  it('üyesi olan admin ikisini de görüyor', () => {
    expect(menu(true)).toEqual(expect.arrayContaining(['Şirketler', 'Üst Hesaplar']));
  });

  it('bayrak yalnızca "Üst Hesaplar" satırında — başka hiçbir satırı saklamıyor', () => {
    // Bayrağın yanlış satıra kopyalanması, üyeliği olmayan birinden çalışan
    // bir ekranı sessizce gizlerdi.
    const farki = menu(true).filter((l) => !menu(false).includes(l));
    expect(farki).toEqual(['Üst Hesaplar']);
  });
});

describe('AKILLI BOOST — Reklamlar bölümünün öne çıkarılmış ilk satırı', () => {
  it('KRİTİK: Reklamlar bölümünde, en üstte ve vurgulu', () => {
    // Kullanıcının isteği (2026-09-30): reklamların alt satırı ve
    // diğerlerinden daha belirgin.
    const reklamlar = SECTIONS.find((s) => s.title === 'Reklamlar');
    expect(reklamlar?.items[0]?.label).toBe('Akıllı Boost');
    expect(reklamlar?.items[0]?.vurgu).toBeTruthy();
  });

  it('vurgu TEK satırda — iki vurgu hiçbirini belirgin yapmaz', () => {
    const vurgulu = SECTIONS.flatMap((s) => s.items).filter((i) => i.vurgu);
    expect(vurgulu.map((i) => i.label)).toEqual(['Akıllı Boost']);
  });
});

describe('KRİTİK: "Okuma API" yalnızca platform sahibine', () => {
  /*
   * Kullanıcının isteği: "sadece bu hesapla (platform sahibi) giriş
   * yaptığımda ayarlarda API kontrol paneli olsun". Yetki anahtarı bunu
   * anlatamıyor: admin bütün izinleri taşıyabilir ama Sahip değil.
   */
  const menu = (platformSahibi: boolean): string[] =>
    visibleSections(izinler('admin'), { ustHesapGorunur: true, platformSahibi }).flatMap((s) =>
      s.items.map((i) => i.label),
    );

  it('KRİTİK: bütün izinleri taşıyan admin GÖRMÜYOR', () => {
    expect(menu(false)).not.toContain('Okuma API');
  });

  it('platform sahibi Ayarlar altında görüyor', () => {
    expect(menu(true)).toContain('Okuma API');
    const ayar = SECTIONS.find((s) => s.title === 'Ayarlar')!.items.map((i) => i.href);
    expect(ayar).toContain('/ayarlar/okuma-api');
  });

  it('bayrak yalnızca o satırda — başka hiçbir satırı saklamıyor', () => {
    expect(menu(true).filter((l) => !menu(false).includes(l))).toEqual(['Okuma API']);
  });

  it('KRİTİK: sayfa da bayrağı okuyor — adresi bilen 404 alıyor', () => {
    const kod = readFileSync(
      join(__dirname, '..', 'app', '(dashboard)', 'ayarlar', 'okuma-api', 'page.tsx'),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(kod).toContain('if (!session.platformAdmin) notFound();');
  });
});
