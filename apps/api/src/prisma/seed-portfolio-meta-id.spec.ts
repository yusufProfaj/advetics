import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Portföy seed'inin Meta hesap araması — `act_` ÖNEK TUZAĞI, KAYNAK TARAMASI.
 *
 * NEDEN BU TEST VAR: seed ilk kez üretimde çalıştırıldığında 14 Google
 * hesabının 14'ünü buldu, 13 Meta hesabının HİÇBİRİNİ bulamadı ve hepsini
 * "VERİTABANINDA YOK" diye raporladı. Hesaplar oradaydı ve panelde
 * çalışıyordu — arama yanlıştı.
 *
 * `ad_accounts.external_id` Meta'da `act_` önekiyle saklanıyor: keşif
 * `/me/adaccounts` yanıtındaki `id` alanını olduğu gibi yazıyor ve Meta orayı
 * `act_966706145588095` diye dolduruyor. Seed ise öneksiz arıyordu.
 *
 * Bu tuzak bu projede DÖRDÜNCÜ kez çıktı. `meta-account-path.spec.ts` tam
 * bunun için yazılmıştı ama yalnızca `meta.provider.ts` dosyasını tarıyor;
 * seed `prisma/` altında olduğu için kapsam dışı kaldı. Kaynak taramasının
 * kör noktası, taradığı dosya listesidir.
 *
 * BU DOSYA SEED'İ IMPORT ETMİYOR. Seed modülünün en altında `main()` doğrudan
 * çağrılıyor; import etmek gerçek veritabanında seed'i çalıştırırdı. Bu yüzden
 * doğrulama kaynak metni üzerinden yapılıyor.
 */
const SEED_PATH = join(__dirname, '../../prisma/seed-portfolio.ts');
const SOURCE = readFileSync(SEED_PATH, 'utf8');

describe('seed-portfolio — Meta hesap kimliği araması', () => {
  it('kaynak okunabildi — tarama boşa düşmüyor', () => {
    // Dosya taşınırsa readFileSync patlar; ama boşalırsa aşağıdaki testler
    // sessizce yeşil yanardı. Boş taramanın geçmesi, testin olmamasından kötü.
    expect(SOURCE.length).toBeGreaterThan(1000);
    expect(SOURCE).toContain('PORTFOLIO');
  });

  it('Meta kimlikleri için act_ önekli biçim de aranıyor', () => {
    expect(SOURCE).toMatch(/act_\$\{bare\}|`act_\$\{/);
  });

  it('arama TEK bir external_id ile değil, aday LİSTESİYLE yapılıyor', () => {
    // `externalId: w.externalId` tek biçim arar ve tuzağın ta kendisiydi.
    // `externalId: { in: … }` iki biçimi birden kabul ediyor.
    expect(SOURCE).toMatch(/externalId:\s*\{\s*in:/);
    expect(SOURCE).not.toMatch(/where:\s*\{\s*platform:\s*w\.platform,\s*externalId:\s*w\.externalId\s*\}/);
  });

  it('Meta dalı adayları üreten yardımcıdan geçiyor', () => {
    expect(SOURCE).toMatch(/platform:\s*'meta'\s*as\s*const,\s*\n?\s*externalIds:\s*metaIdCandidates\(/);
  });

  it('yardımcı hem öneksiz hem önekli biçimi döndürüyor', () => {
    // Fonksiyonu import edemiyoruz (import = seed çalışır), bu yüzden gövdesini
    // izole edip değerlendiriyoruz. Davranışı doğrulamak, varlığını
    // doğrulamaktan daha değerli.
    const body = SOURCE.match(
      /function metaIdCandidates\(raw: string\): string\[\] \{([\s\S]*?)\n\}/,
    )?.[1];

    // `expect` ile durmuyoruz: TypeScript'i daraltmıyor ve altındaki satır
    // "possibly undefined" veriyor. Açık bir fırlatma hem tipi daraltıyor hem
    // de seed yeniden düzenlendiğinde ne olduğunu söylüyor.
    if (!body) {
      throw new Error(
        'metaIdCandidates gövdesi bulunamadı — seed-portfolio.ts yeniden düzenlenmiş olabilir. ' +
          'Bu test kaynak metnini okuyor; imza değiştiyse buradaki desen de güncellenmeli.',
      );
    }

    const fn = new Function('raw', body.replace(/: string(\[\])?/g, '')) as (
      raw: string,
    ) => string[];

    expect(fn('966706145588095')).toEqual(['966706145588095', 'act_966706145588095']);
    // Önekli girdi İKİ KEZ öneklenmemeli — act_act_… bu projenin klasik hatası.
    expect(fn('act_966706145588095')).toEqual(['966706145588095', 'act_966706145588095']);
  });

  it('Google kimlikleri tiresiz aranmaya devam ediyor', () => {
    // Google tarafı zaten çalışıyordu; Meta düzeltmesi onu bozmamalı.
    expect(SOURCE).toMatch(/externalIds:\s*\[normalizeGoogleId\(id\)\]/);
  });
});
