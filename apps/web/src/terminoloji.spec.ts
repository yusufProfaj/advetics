import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ "MÜŞTERİ" → "WORKSPACE" — TERMİNOLOJİ BEKÇİSİ ═══
 *
 * Panelde workspace'i anlatan her metin "Workspace" diyor. Ama "müşteri"
 * kelimesi ÜÇ ayrı şeyi anlatıyor ve ikisi workspace DEĞİL:
 *
 *   1. WORKSPACE      → yeniden adlandırıldı
 *   2. LEAD           → "potansiyel müşteri", workspace'in KENDİ müşteri adayı
 *   3. KİŞİ           → raporu alan, mail atılan, parola teslim edilen insan
 *
 * Toplu geçiş 2. ve 3. grubu da yakaladı ve şu cümleler üretti:
 * *"Workspace yalnızca kendi workspace'ini görür"*, *"bunlardan gelen
 * potansiyel workspace"*, *"Raporu workspace'e gönder"*. Üçü de derleniyor,
 * üçü de testten geçiyor ve üçü de yalnızca ekrana bakan kişiye saçma
 * görünüyor — yani hiçbir otomatik kontrol yakalamıyor.
 *
 * BU TEST ONAY LİSTESİ TUTUYOR. Yeni bir "müşteri" metni eklendiğinde
 * düşüyor ve yazan kişiyi üç gruptan birine sokmaya zorluyor. Kelimeyi
 * yasaklamıyor — sınıflandırmaya zorluyor.
 */
const KOK = join(__dirname, '../../..');

/**
 * TARAMA DIŞI ve NEDENLERİ — hiçbiri paneldeki workspace kavramı değil.
 *
 * `ai-assistant/`: sistem promptu. Modelin ne SÖYLEYECEĞİNİ değiştiriyor;
 *   terminoloji kararı ayrı verilmeli, kaynak taramasıyla dayatılmamalı.
 * `providers/`: "Google müşteri 123-456" = Google'ın customer ID'si.
 * `google-check.ts`: geliştirici teşhis aracı, panelde görünmüyor.
 */
const DISARIDA = [
  /*
   * TANITIM SİTESİ (2026-10-12): panel değil, panele HİÇ girmemiş ziyaretçinin
   * dili. "Workspace" panelin iç kavramı ve sitenin okuru (reklam bilmeyen
   * işletme sahibi, ajans) onu tanımıyor; ajansın müşterisi orada "müşteri".
   * Panele geçen kişi "Workspace"i panelde öğreniyor.
   *
   * 2026-10-14: bütün `components/landing/` (sahneler, fiyat). Sahnedeki
   * "Müşteriye gönder", "Müşteri planı onayladı" panelin değil vitrinin
   * cümlesi; fiyat paketlerinde ajansın müşterisi yine "müşteri".
   */
  'app/(site)/',
  'components/landing/',
  // Tanıtım sitesinin METNİ 2026-10-15'te sözlüğe taşındı (iki dil); kapsam
  // aynı kaldı: sitede "müşteri" ajansın müşterisi anlamında serbest.
  'dil/sozlukler/site.',
  'dil/sozlukler/site-arayuz.ts',
  'dil/sozlukler/fiyat.ts',
  'dil/sozlukler/simulasyon.ts',
  'ai-assistant/',
  'providers/',
  'google-check.ts',
  // BU DOSYA: onay listesindeki desenler kelimenin kendisini taşıyor.
  'terminoloji.spec.ts',
];

const BLOK = /\/\*[\s\S]*?\*\//g;
const SATIR = /^\s*\/\/.*$/gm;
const SONU = /(?<![:\w])\/\/[^\n"'`]*$/gm;
/** Prisma.sql şablonlarının içindeki `--` satırları da yorum. */
const SQL = /^\s*--.*$/gm;

function yorumsuz(s: string): string {
  return s.replace(BLOK, '').replace(SATIR, '').replace(SONU, '').replace(SQL, '');
}

function dosyalar(dizin: string, biriktir: string[] = []): string[] {
  for (const g of readdirSync(dizin, { withFileTypes: true })) {
    const yol = join(dizin, g.name);
    if (g.isDirectory()) {
      if (g.name !== 'node_modules' && g.name !== 'dist') dosyalar(yol, biriktir);
    } else if (/\.tsx?$/.test(g.name)) {
      biriktir.push(yol);
    }
  }
  return biriktir;
}

const TARANAN = ['apps/web/src', 'apps/api/src', 'packages/shared/src']
  .flatMap((d) => dosyalar(join(KOK, d)))
  .filter((f) => !DISARIDA.some((d) => f.includes(d)));

/** İZİN VERİLEN kalıplar — her biri yukarıdaki 2. ya da 3. gruptan. */
const IZINLI: Array<{ neden: string; desen: RegExp }> = [
  { neden: 'LEAD — workspace’in kendi müşteri adayı', desen: /[Pp]otansiyel [Mm]üşteri/ },
  { neden: 'LEAD — nitelikli form/havuz', desen: /nitelikli müşteri|müşteri havuzu|müşteri listesi/ },
  { neden: 'KİŞİ — raporun/mailin ALICISI bir insan', desen: /müşteriye (gönder|mail|gitm|giden)|[Mm]üşteriye gönderdiğin|rapor müşteriye/ },
  { neden: 'KİŞİ — parolayı teslim alan insan', desen: /parolayı müşteriye/ },
  /*
   * ADVSTRATEGY v2: stratejiyi okuyup ONAYLAYAN insan (panelde müşteri
   * hesabı, girişsiz onay bağlantısında adını yazan kişi). Desenler ekran
   * cümlelerine çapalı; serbest bir "müşteri" metni bu izinden geçmez.
   */
  {
    neden: 'KİŞİ — stratejiyi okuyup onaylayan insan (AdvStrategy v2)',
    // Adım adım akış (2026-10-13): "Müşteri adına onayla", "Müşteri onaylamadan",
    // "Müşteri değişiklik istedi", "Müşterinin okuyacağı" aynı kişi.
    desen: /[Mm]üşteriye gönder|[Mm]üşterinin (göreceği|belgesine|onayını|okuyacağı)|Müşteri (revizyon istedi|onaylayınca|panele girmeden|onaylamadan|giriş yapmadan|onayını|değişiklik istedi)|[Mm]üşteri adına onayla|müşteri yalnız onay bekleyen|Müşteriye bağlantı/,
  },
  /*
   * "+ OLUŞTUR" MENÜSÜ (menü kararı 2026-10-14, kullanıcının onayladığı
   * metin): Strateji seçeneğinin açıklaması; onaylayan yine yukarıdaki insan.
   */
  { neden: 'KİŞİ — "+ Oluştur" menüsünde stratejiyi onaylayan insan', desen: /'Plan, rapor ve müşteri onayı'/ },
  { neden: 'KİŞİ — "müşteri hesabı" = client_viewer rolüyle açılmış giriş hesabı', desen: /[Mm]üşteri hesa[bp]/ },  // cümle başında da geçiyor
  {
    /*
     * ROL ETİKETİ. Kullanıcı rolü "müşteri" diye adlandırdı ve etiket TEK
     * yerde tanımlı (`rol-matrisi.ts`); bütün ekranlar oradan okuyor. Desen
     * o tanım satırına çapalı — ekrana serpiştirilmiş yeni bir "Müşteri"
     * metni bu izinden geçmez, yine sınıflandırılmak zorunda.
     */
    neden: 'KİŞİ — client_viewer rolünün ekran adı, tek tanım satırı',
    desen: /client_viewer: 'Müşteri',/,
  },
  { neden: 'KİŞİ — Müşteri rolünün "Müşteri seç" yönlendirmesi', desen: /rolü <strong>Müşteri<\/strong> seç/ },
  { neden: 'KİŞİ — beyaz etiket tanıtımı: paneli GÖREN kişi', desen: /Müşteriniz|Müşterileriniz|müşterilerinize/ },
  { neden: 'KİŞİ — gizlilik metninde veri sahibi', desen: /müşterilerin veya reklam izleyicilerinin|müşteriye görünmez/ },
  { neden: 'KİŞİ — “sistem bozulmuş” diye okuyan insan', desen: /müşteriye “sistem/ },
  /*
   * LEAD'İN SATIŞ AŞAMASI (Paket E, geri besleme): "müşteri oldu" lead'in
   * kendisinin satışa dönmesi; workspace değil. Desen aşama adına çapalı.
   */
  { neden: 'LEAD — satışa dönen aday (geri besleme aşaması)', desen: /[Mm]üşteri oldu/ },
  /*
   * HAFTALIK ÖZETİN İKİ GÖRÜNÜMÜ (Paket B): ajansa giden ve müşteriye (rapor
   * alıcısı İNSAN) giden mail. "Müşteri görünümü / özet planı / mailine"
   * hep o alıcıyı anlatıyor.
   */
  {
    neden: 'KİŞİ — haftalık özetin müşteri (alıcı) görünümü',
    desen: /[Mm]üşteriye giden|[Mm]üşteri görünüm|[Mm]üşteri özet planı|ajansının müşterisine giden|müşteriye \{\{x\}\} gitmez/,
  },
  /*
   * MAĞAZANIN SATICISI (Paket F3): Shopify'da "müşteri mağazası" ajansın
   * müşterisinin MAĞAZASI = workspace'in dış sistemi; panel metni değil,
   * dağıtım kısıtının açıklaması.
   */
  { neden: 'KİŞİ — Shopify dağıtım kısıtında ajansın müşterisinin mağazası', desen: /müşteri mağazası için App Store/ },
  {
    /*
     * GOOGLE'IN ÜRÜN ADI. MCC'nin Türkçe arayüzdeki karşılığı "Müşteri
     * Merkezi"; üst hesap ekranı kavramı tanıtırken o adı veriyor çünkü
     * kullanıcı onu Google Ads'te tam olarak öyle görüyor. "Workspace
     * Merkezi" diye bir şey yok ve olsaydı da kimse aratmazdı.
     */
    neden: "GOOGLE ÜRÜN ADI — MCC'nin Türkçe karşılığı",
    desen: /Müşteri Merkezi/,
  },
];

describe('terminoloji: workspace ↔ müşteri', () => {
  it('BOŞA DÜŞME BEKÇİSİ: tarama gerçekten dosya okudu', () => {
    // Dizin adı ya da uzantı deseni değişirse liste boşalır ve aşağıdaki
    // "hepsi izinli" iddiası HER ZAMAN doğru olurdu.
    expect(TARANAN.length).toBeGreaterThan(300);
  });

  it('KRİTİK: kalan her "müşteri" metni sınıflandırılmış', () => {
    const siniflandirilmamis: string[] = [];
    let toplamKalan = 0;

    for (const dosya of TARANAN) {
      for (const satir of yorumsuz(readFileSync(dosya, 'utf8')).split('\n')) {
        if (!satir.includes('üşteri')) continue;
        toplamKalan++;
        if (!IZINLI.some((k) => k.desen.test(satir))) {
          siniflandirilmamis.push(`${dosya.slice(KOK.length + 1)}: ${satir.trim().slice(0, 90)}`);
        }
      }
    }

    // İKİNCİ BOŞA DÜŞME BEKÇİSİ: kalanlar sıfırlanırsa (ör. yorum ayıklayıcı
    // her şeyi silerse) iddia yine boşa geçerdi.
    expect(toplamKalan).toBeGreaterThanOrEqual(20);
    expect(siniflandirilmamis).toEqual([]);
  });

  it('KRİTİK: ekrandaki bölüm adı "Workspace’ler" — "Müşteriler" değil', () => {
    /*
     * BU İDDİA YER DEĞİŞTİRDİ, KURAL DEĞİŞMEDİ.
     *
     * "Workspace'ler" bir MENÜ SATIRIYDI; workspace listesi Şirketler
     * sayfasının içine taşınınca satır kalktı ve iddia menüde boşa düştü.
     * Korunan şey satırın YERİ değil, kullanıcının gördüğü KELİME: bölüm
     * başlığı hâlâ "Workspace'ler" ve "Müşteriler"e geri dönmemeli.
     */
    const bolum = readFileSync(
      join(KOK, 'apps/web/src/components/tenancy/workspace-bolumu.tsx'),
      'utf8',
    );
    expect(bolum).toContain('Workspace’ler</h2>');

    // "Potansiyel Müşteriler" AYRI bir ekran ve adı DEĞİŞMEDİ; onu da
    // yanlışlıkla yeniden adlandırmadığımızı burada kilitliyoruz.
    const nav = readFileSync(join(KOK, 'apps/web/src/lib/nav-sections.ts'), 'utf8');
    expect(nav).toContain("label: 'Potansiyel Müşteriler'");
  });

  it('KRİTİK: API artık "Müşteri bulunamadı" demiyor', () => {
    /*
     * Bu mesaj panele OLDUĞU GİBİ çıkıyor (`AllExceptionsFilter`), yani
     * menüde "Workspace" yazarken hata kutusunda "Müşteri" yazması
     * kullanıcıya iki ayrı kavram varmış gibi görünürdü.
     */
    const api = TARANAN.filter((f) => f.includes('apps/api/src'));
    expect(api.length).toBeGreaterThan(100); // boşa düşme bekçisi
    // YORUMSUZ kaynakta aranıyor: geçmiş bir arızayı ANLATAN yorum bu mesajı
    // alıntılayabilir ve kod doğruyken testi kırmızı verirdi (CLAUDE.md).
    const suclular = api.filter((f) => yorumsuz(readFileSync(f, 'utf8')).includes('Müşteri bulunamadı'));
    expect(suclular).toEqual([]);
  });
});
