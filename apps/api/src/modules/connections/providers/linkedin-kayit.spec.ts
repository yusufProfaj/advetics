import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLATFORMS } from '@advetics/shared';

/**
 * ═══ ÜÇÜNCÜ PLATFORMUN SESSİZCE KAYBOLACAĞI YERLER ═══
 *
 * `Record<Platform, ...>` taşıyan yerleri TypeScript koruyor — LinkedIn
 * eklenirken `provider.registry.ts` gerçekten derlemede kırıldı ve kaydı
 * unutmak imkânsız oldu.
 *
 * Bu dosya TypeScript'in GÖRMEDİĞİ yerleri kilitliyor:
 *
 *  1. NEST MODÜL KAYDI — sağlayıcı sınıfı `connections.module.ts` listesinde
 *     yoksa DERLEME GEÇİYOR, hata AÇILIŞTA geliyor ve deploy'un ortasında
 *     görünüyor. CLAUDE.md bunu adı konmuş bir tuzak olarak yazıyor.
 *  2. ENUM MIGRATION'I — `schema.prisma`ya değer eklemek yetmiyor; Postgres
 *     enum'ı ayrı bir migration istiyor ve yoksa üretimde `invalid input
 *     value for enum` ile patlıyor.
 *  3. ELLE YAZILMIŞ PLATFORM LİSTELERİ — panel ve rapor tarafında
 *     `['meta','google']` biçiminde donmuş listeler.
 */

const PROVIDERS = __dirname;
const CONNECTIONS = join(PROVIDERS, '..');
const API_SRC = join(CONNECTIONS, '..', '..');

/** Yorumsuz kaynak — iddia açıklamaya değil KODA çapalanmalı. */
function kod(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('LinkedIn sağlayıcısı kayıtlı', () => {
  const MODUL = kod(readFileSync(join(CONNECTIONS, 'connections.module.ts'), 'utf8'));
  const REGISTRY = kod(readFileSync(join(CONNECTIONS, 'provider.registry.ts'), 'utf8'));

  it('tarama gerçekten bir şey yakaladı', () => {
    /*
     * Dosya taşınır ya da sınıf adı değişirse aşağıdaki iddialar BOŞ KÜMEDE
     * doğru olur. Bu depoda kaynak taramaları tam bu yüzden boşa düştü.
     */
    expect(MODUL).toContain('MetaProvider');
    expect(REGISTRY).toContain('GoogleProvider');
  });

  it('KRİTİK: `connections.module.ts` sağlayıcı listesinde LinkedInProvider var', () => {
    /*
     * BU TEST DERLEMENİN YAKALAYAMADIĞI TEK ŞEYİ TUTUYOR. Nest bağımlılık
     * grafiğini AÇILIŞTA çözüyor: sınıf `providers` listesinde yoksa
     * `nest build` başarılı olur, uygulama ayağa kalkmaz ve hata dağıtımın
     * ortasında görünür.
     *
     * İDDİA `providers` DİZİSİNE ÇAPALI, DOSYAYA DEĞİL. İlk yazışımda
     * `expect(MODUL).toContain('LinkedInProvider')` yazmıştım ve MUTASYON
     * BOŞA DÜŞTÜ: `providers` listesinden satırı sildim, test yine GEÇTİ —
     * çünkü sınıf adı `import` satırında da geçiyor. CLAUDE.md'nin adı konmuş
     * tuzağı ("iddia import satırına çapalandı, çağrıya değil") ve bu depoda
     * en az dört kez yaşandı.
     */
    const dizi = /providers:\s*\[([^\]]*)\]/.exec(MODUL)?.[1];
    expect(dizi, '`providers` dizisi bulunamadı — tarama boşa düştü').toBeDefined();
    expect(dizi).toContain('LinkedInProvider');

    // Import ayrıca duruyor mu — sınıf listeye yazılıp import edilmezse
    // derleme kırılır, ama iddiayı tam yazmak ucuz.
    expect(MODUL).toMatch(/import \{ LinkedInProvider \} from '\.\/providers\/linkedin\.provider'/);
  });

  it('KRİTİK: kayıt defteri üç sağlayıcıyı da enjekte ediyor', () => {
    expect(REGISTRY).toMatch(/constructor\([^)]*linkedin: LinkedInProvider[^)]*\)/);
    expect(REGISTRY).toContain('{ meta, google, linkedin }');
  });
});

describe('Platform enum migration\'ı', () => {
  const DIZIN = join(API_SRC, '..', 'prisma', 'migrations');

  it('KRİTİK: `linkedin` için AYRI bir migration dosyası var', () => {
    /*
     * `schema.prisma`ya değer eklemek veritabanını DEĞİŞTİRMİYOR. Migration
     * yoksa Prisma istemcisi `linkedin`i tanır, Postgres tanımaz ve ilk
     * INSERT `invalid input value for enum "Platform"` ile patlar — üretimde,
     * ilk bağlantı denemesinde.
     */
    const dosyalar = readdirSync(DIZIN).filter((d) => d.includes('platform_linkedin'));
    expect(dosyalar.length, 'LinkedIn enum migration\'ı bulunamadı').toBe(1);

    const sql = readFileSync(join(DIZIN, dosyalar[0]!, 'migration.sql'), 'utf8');
    expect(sql).toMatch(/ALTER TYPE "Platform" ADD VALUE/);
  });

  it('KRİTİK: migration dosyası SADECE enum komutu taşıyor', () => {
    /*
     * `ALTER TYPE ... ADD VALUE` aynı transaction içinde KULLANILAMIYOR ve
     * Prisma her dosyayı tek transaction'da koşturuyor. Aynı dosyaya bu
     * değeri kullanan bir INSERT ya da CHECK eklemek "unsafe use of new
     * value" ile düşerdi — ve bunu ancak migration koşarken öğrenirdik.
     */
    const dosyalar = readdirSync(DIZIN).filter((d) => d.includes('platform_linkedin'));
    const sql = readFileSync(join(DIZIN, dosyalar[0]!, 'migration.sql'), 'utf8');
    const komutlar = sql
      .split('\n')
      .filter((l) => !l.trim().startsWith('--') && l.trim() !== '')
      .join(' ')
      .split(';')
      .filter((k) => k.trim() !== '');
    expect(komutlar.length, 'enum migration\'ında birden çok komut var').toBe(1);
  });

  it('schema.prisma enum\'ı `PLATFORMS` ile aynı', () => {
    /*
     * İki liste ayrı dosyada ve ayrışabilir: şemada olmayan bir değer
     * Prisma'da tip hatası vermiyor (string olarak geçiyor) ama veritabanında
     * patlıyor.
     */
    const sema = readFileSync(join(API_SRC, '..', 'prisma', 'schema.prisma'), 'utf8');
    const blok = /enum Platform \{([^}]+)\}/.exec(sema)?.[1];
    expect(blok, 'Platform enum\'ı bulunamadı — tarama boşa düştü').toBeDefined();

    const semaDegerleri = blok!
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '' && !l.startsWith('//'))
      .sort();
    expect(semaDegerleri).toEqual([...PLATFORMS].sort());
  });
});

describe('elle yazılmış platform listeleri', () => {
  it('KRİTİK: rapor PDF\'i platform sırasını `PLATFORMS`tan alıyor', () => {
    /*
     * EN SİNSİ KAYIP BURADAYDI. `PLATFORM_SIRASI = ['meta','google']` elle
     * yazılıydı: LinkedIn verisi veritabanında DURUR, rapor bloğu ÜRETİLİR,
     * ama bu döngü onu gezmediği için PDF'e HİÇ ÇİZİLMEZ. Hata yok, log yok
     * — eksik sayfa yalnızca müşteriye giden belgede görünür.
     */
    const pdf = kod(readFileSync(join(API_SRC, 'modules', 'reports', 'rapor-pdf.service.ts'), 'utf8'));
    expect(pdf).toContain('const PLATFORM_SIRASI = PLATFORMS;');
    expect(pdf, 'elle yazılmış platform sırası geri gelmiş').not.toMatch(
      /PLATFORM_SIRASI = \[\s*'meta'/,
    );
  });

  it('KRİTİK: bağlantı ekranının platform listesi `PLATFORMS`tan türüyor', () => {
    /*
     * `availability()` iki nesneyi ELLE sayıyordu ve LinkedIn o ekranda hiç
     * görünmeyecekti: bağlantı sayfasında OLMAYAN bir platform, hata mesajı
     * olmayan bir arıza.
     */
    const svc = kod(readFileSync(join(CONNECTIONS, 'connections.service.ts'), 'utf8'));
    expect(svc).toContain('return PLATFORMS.map((platform)');
    expect(svc).toContain('Record<Platform, string[]>');
  });
});

/**
 * ═══ İKİ YOLLU PLATFORM DALLANMASI KALMADI ═══
 *
 * Bu bloğun sebebi bir eksik tarama. Bir önceki turda "üçüncü platformun
 * sessizce kaybolduğu yerleri kapattım" dedim ve ON YER daha vardı; hepsi
 * `p === 'google' ? ... : ...` biçimindeydi, yani LinkedIn'e "Meta" diyorlardı.
 * `Record<Platform, ...>` taşımadıkları için TypeScript hiçbirini görmedi.
 *
 * Daha kötüsü, düzeltmeye çalışırken KENDİM bir gerileme açtım: panelin rapor
 * başlığını `PLATFORM_LABELS`a bağladım, PDF ikizi elle kaldı ve ikisi
 * ayrıştı ("Meta (Facebook / Instagram)" / "Meta Ads").
 *
 * Bu tarama gözle gözden geçirmenin yakalayamadığı şeyi yakalıyor: deseni
 * ARAYIP sayıyor.
 */
describe('iki yollu platform dallanması', () => {
  const KOK = join(API_SRC, '..', '..', '..');

  /** Kaynak dosyaları topla — testler ve derleme çıktıları hariç. */
  function kaynaklar(...dizinler: string[]): Array<{ yol: string; icerik: string }> {
    const sonuc: Array<{ yol: string; icerik: string }> = [];
    const gez = (d: string): void => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const tam = join(d, e.name);
        if (e.isDirectory()) {
          if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.next') continue;
          gez(tam);
        } else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.spec.ts')) {
          sonuc.push({ yol: tam, icerik: kod(readFileSync(tam, 'utf8')) });
        }
      }
    };
    for (const d of dizinler) gez(join(KOK, d));
    return sonuc;
  }

  it('tarama gerçekten dosya buldu', () => {
    // Dizin yapısı değişirse aşağıdaki iddia BOŞ KÜMEDE doğru olur.
    const hepsi = kaynaklar('apps/api/src', 'apps/web/src', 'packages/shared/src');
    expect(hepsi.length).toBeGreaterThan(200);
  });

  /**
   * BİLEREK DAR KALAN YAZMA YOLLARI.
   *
   * Bu dosyalar iki yollu dallanmayı SÜRDÜRÜYOR ve doğrusu bu: hepsi
   * `DRAFT_PLATFORMS` / `autoBoostPlatformSchema` gibi kasıtlı olarak dar
   * listelerle besleniyor ve LinkedIn verisi onlara ULAŞMIYOR — LinkedIn'de
   * yazma kodu yok. Genişletmek, çalışmayan bir seçeneği arayüzde göstermek
   * olurdu.
   *
   * LİSTE AÇIK ve kısa tutuluyor: buraya bir dosya eklemek, "bu ekran
   * LinkedIn'i gerçekten görmüyor" diye BİLİNÇLİ bir karar vermek demek.
   * Sessizce geçen bir istisna, istisna olmaktan çıkar.
   */
  const YAZMA_YOLU_ISTISNALARI = [
    'apps/web/src/components/ad-builder/expert-builder.tsx',
    'apps/web/src/components/ad-builder/duplicate-panel.tsx',
    'apps/web/src/components/ad-builder/draft-group-list.tsx',
    // Auto-Boost bildirim maili: dallanma platform ETİKETİ değil, sosyal
    // profil türü (YouTube / Instagram). LinkedIn'de karşılığı yok.
    'apps/api/src/modules/autoboost/yeni-icerik-maili.ts',
  ];

  it('KRİTİK: iki yollu platform dallanması yalnızca yazma yollarında', () => {
    /*
     * Bu desenin tamamı aynı hatayı taşıyor: "google değilse Meta". Üçüncü
     * platform geldiğinde yanlış etiket, yanlış logo ya da yanlış havuz
     * üretiyor — ve yanlış rozet, EKSİK rozetten kötü: kullanıcı sorgulamıyor.
     *
     * Bu tarama BİR EKSİK TARAMADAN doğdu: elle bakıp "hepsini kapattım"
     * dedim, on yer daha vardı ve hiçbirini TypeScript görmüyordu.
     */
    const suclular = kaynaklar('apps/api/src', 'apps/web/src', 'packages/shared/src')
      .filter((f) => /===\s*'google'\s*\?[^:]*:\s*'/.test(f.icerik))
      .map((f) => f.yol.replace(KOK + '/', ''))
      .filter((y) => !YAZMA_YOLU_ISTISNALARI.includes(y));
    expect(suclular, 'okuma yolunda iki yollu platform dallanması var').toEqual([]);
  });

  it('istisna listesi ÖLÜ GİRDİ taşımıyor', () => {
    /*
     * İstisna listesi bir kez yazılıp unutulan türden. Dosya taşınır ya da
     * dallanma düzeltilirse girdi ölü kalır ve liste "burada bilinçli bir
     * istisna var" diye yalan söylemeye devam eder.
     */
    const desenliler = new Set(
      kaynaklar('apps/api/src', 'apps/web/src', 'packages/shared/src')
        .filter((f) => /===\s*'google'\s*\?[^:]*:\s*'/.test(f.icerik))
        .map((f) => f.yol.replace(KOK + '/', '')),
    );
    const oluler = YAZMA_YOLU_ISTISNALARI.filter((y) => !desenliler.has(y));
    expect(oluler, 'istisna listesinde artık gereksiz girdi var').toEqual([]);
  });

  it('KRİTİK: rapor PDF\'i ve panel AYNI kısa ad tablosundan okuyor', () => {
    /*
     * BENİM AÇTIĞIM GERİLEMENİN BEKÇİSİ. İkisi ayrı tablodan okuduğunda
     * hiçbir test düşmüyordu; fark yalnızca müşteriye giden belgeyle ekranı
     * yan yana koyunca görünüyordu.
     */
    const pdf = kod(readFileSync(join(API_SRC, 'modules', 'reports', 'rapor-pdf.service.ts'), 'utf8'));
    const panel = kod(
      readFileSync(join(KOK, 'apps/web/src/components/report/report-document.tsx'), 'utf8'),
    );
    expect(pdf).toContain('PLATFORM_ADI = PLATFORM_KISA_ADLARI');
    expect(panel).toContain('PLATFORM_ADI: Record<string, string> = PLATFORM_KISA_ADLARI');
  });
});
