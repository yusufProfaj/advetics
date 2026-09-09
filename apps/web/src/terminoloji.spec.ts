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
  { neden: 'KİŞİ — "müşteri hesabı" = client_viewer rolüyle açılmış giriş hesabı', desen: /müşteri hesa[bp]/ },
  { neden: 'KİŞİ — beyaz etiket tanıtımı: paneli GÖREN kişi', desen: /Müşteriniz|Müşterileriniz|müşterilerinize/ },
  { neden: 'KİŞİ — gizlilik metninde veri sahibi', desen: /müşterilerin veya reklam izleyicilerinin|müşteriye görünmez/ },
  { neden: 'KİŞİ — “sistem bozulmuş” diye okuyan insan', desen: /müşteriye “sistem/ },
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

  it('KRİTİK: menüdeki ekran adı "Workspace’ler"', () => {
    const nav = readFileSync(join(KOK, 'apps/web/src/lib/nav-sections.ts'), 'utf8');
    expect(nav).toContain("label: 'Workspace’ler'");
    // "Potansiyel Müşteriler" AYRI bir ekran ve adı DEĞİŞMEDİ; onu da
    // yanlışlıkla yeniden adlandırmadığımızı burada kilitliyoruz.
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
