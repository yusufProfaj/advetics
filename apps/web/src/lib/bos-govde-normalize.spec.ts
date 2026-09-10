import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ `null` DÖNEBİLEN UÇLAR `?? null` İLE NORMALLEŞTİRİLMEK ZORUNDA ═══
 *
 * NestJS bir uç `null` döndürdüğünde gövdeyi BOŞ bırakıyor ve durum kodu 200
 * kalıyor. `lib/api.ts` içindeki `handle()` boş gövdede `undefined` dönüyor —
 * doğru davranış, çünkü `JSON.parse('')` "Unexpected end of JSON input" ile
 * patlıyordu ve o hata canlıda "E-posta ayarları alınamadı" olarak görünmüştü.
 *
 * AMA TİP YALAN SÖYLÜYOR: `serverApiFetch<T | null>` yazan çağıran `null`
 * bekliyor, eline `undefined` geliyor ve TypeScript hiçbir şey demiyor
 * (`serverApiFetch<T>` denetimsiz bir dönüşüm — CLAUDE.md).
 *
 * BU CANLIDA PATLADI: `/ayarlar/ust-hesap` sayfası `agac === null` diye
 * kontrol ediyordu, `undefined` için false kaldı, ekran ağacı çizmeye
 * çalıştı ve kullanıcı "Bu ekran yüklenemedi" gördü. Aynı desen
 * `/ayarlar/e-posta`da BAŞINDAN BERİ doğruydu — yani kural vardı, yazılı
 * değildi. Artık yazılı.
 */
const WEB_SRC = join(__dirname, '..');

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

/**
 * `serverApiFetch<X | null>(...)` ve `apiFetch<X | null>(...)` çağrıları.
 *
 * İKİ AD AYRI YAZILI, `(?:server)?apiFetch` DEĞİL: sunucu tarafındaki adın
 * ortasında BÜYÜK `A` var (`serverApiFetch`) ve o kısayol hiçbir şeyi
 * eşleştirmiyordu. İlk yazımda tam olarak öyleydi ve tarama SIFIR eşleşme
 * buldu — boşa düşme bekçisi olmasaydı bu paket hiçbir şey ölçmeden yeşil
 * kalırdı.
 */
const CAGRI = /(?:serverApiFetch|apiFetch)<[^>]*\|\s*null>\s*\(/g;

const TARANAN = dosyalar(WEB_SRC).filter((f) => !f.endsWith('bos-govde-normalize.spec.ts'));

describe('boş gövde normalizasyonu', () => {
  it('BOŞA DÜŞME BEKÇİSİ: tarama dosya okudu ve en az bir çağrı buldu', () => {
    expect(TARANAN.length).toBeGreaterThan(100);
    const toplam = TARANAN.reduce(
      (n, f) => n + (readFileSync(f, 'utf8').match(CAGRI)?.length ?? 0),
      0,
    );
    // Desen ya da yardımcı adı değişirse liste boşalır ve aşağıdaki iddia
    // HER ZAMAN doğru olurdu.
    expect(toplam).toBeGreaterThanOrEqual(2);
  });

  it('KRİTİK: `| null` dönen her çağrı `?? null` ile normalleştirilmiş', () => {
    const eksik: string[] = [];

    for (const dosya of TARANAN) {
      const kaynak = readFileSync(dosya, 'utf8');
      for (const m of kaynak.matchAll(CAGRI)) {
        /*
         * DİLİM PARANTEZ SAYARAK ÇIKARILIYOR. Sabit uzunluklu bir pencere
         * komşu satırdaki `?? null`ı yakalayıp iddiayı sessizce geçirirdi
         * (CLAUDE.md: "sabit uzunluklu dilim komşuyu yakalıyor").
         */
        const acilis = kaynak.indexOf('(', m.index! + m[0].length - 1);
        let derinlik = 0;
        let kapanis = -1;
        for (let i = acilis; i < kaynak.length; i++) {
          if (kaynak[i] === '(') derinlik++;
          else if (kaynak[i] === ')') {
            derinlik--;
            if (derinlik === 0) {
              kapanis = i;
              break;
            }
          }
        }
        /*
         * Çağrıdan SONRAKİ kuyrukta `?? null` aranıyor.
         *
         * ARADA İKİ ŞEY OLABİLİYOR ve ikisi de meşru:
         *   1. KAPANIŞ PARANTEZLERİ — `(await fetch(...)) ?? null`
         *   2. `.catch(...)` ZİNCİRİ — `(await fetch(...).catch(() => null)) ?? null`
         *
         * İkisi de ilk yazımda kuyruğu kaçırdı ve DOĞRU yazılmış çağrıları
         * "eksik" saydı. Kuyruk artık zinciri atlayarak okunuyor; pencere
         * yine DAR tutuluyor — geniş bir pencere, ilgisiz bir `?? null`ı
         * yakalayıp iddiayı anlamsız yapardı.
         */
        /*
         * ZİNCİR ATLANIYOR — VE İÇİ DE SAYILIYOR.
         *
         * Normalizasyon üç biçimde yazılabiliyor ve üçü de meşru:
         *   `(await fetch(...)) ?? null`
         *   `(await fetch(...).catch(() => null)) ?? null`
         *   `fetch(...).then((x) => x ?? null)`
         * Üçüncüsünde `?? null` çağrının ardında DEĞİL, zincirin İÇİNDE.
         * Görmemek, doğru yazılmış bir çağrıyı "eksik" saymak olurdu.
         */
        let i = kapanis + 1;
        let zincirdeVar = false;

        for (;;) {
          while (i < kaynak.length && /[\s)]/.test(kaynak[i] ?? '')) i++;
          const halka = ['.catch(', '.then('].find((h) => kaynak.startsWith(h, i));
          if (!halka) break;

          let d = 0;
          let kapandi = -1;
          for (let j = i + halka.length - 1; j < kaynak.length; j++) {
            if (kaynak[j] === '(') d++;
            else if (kaynak[j] === ')' && --d === 0) {
              kapandi = j;
              break;
            }
          }
          if (kapandi === -1) break;
          if (/\?\?\s*null/.test(kaynak.slice(i, kapandi + 1))) zincirdeVar = true;
          i = kapandi + 1;
        }

        if (zincirdeVar) continue;

        /*
         * PENCERE 32 KARAKTER. 12 ile başlamıştı ve doğru yazılmış bir
         * çağrıyı kaçırdı: `?? null` satır sonuna sarıldığında araya satır
         * başı ve girinti giriyor. Dar tutulmaya devam ediyor — geniş bir
         * pencere ilgisiz bir `?? null`ı yakalayıp iddiayı anlamsız yapardı.
         */
        const kuyruk = kaynak.slice(i, i + 32);
        if (!/^[\s)]*\?\?\s*null/.test(kuyruk)) {
          eksik.push(`${dosya.slice(WEB_SRC.length + 1)}: ${m[0]}`);
        }
      }
    }

    expect(eksik).toEqual([]);
  });
});
