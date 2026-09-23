import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CANLI_BOOST_DURUMLARI } from '@advetics/shared';
import { CANLI_BOOST_SQL } from './canli-boost';

/**
 * ═══ "CANLI BOOST VAR MI" — ALTI KOPYA VARDI ═══
 *
 * Bu liste BEŞ ayrı SQL sorgusunda elle yazılıydı ve `boosts_active_post_uniq`
 * kısmi tekil indeksi altıncı kopyaydı. Listeye `paused` eklenirken altısının
 * da güncellenmesi gerekti; biri unutulsaydı DURAKLATILMIŞ bir kampanya varken
 * aynı gönderi için ikinci bir boost açılabilir ve kullanıcı ilkini sürdürdüğü
 * anda AYNI GÖNDERİYE İKİ KAMPANYA birden harcamaya başlardı — hiçbir hata
 * vermeden.
 */
const API_SRC = join(__dirname, '..', '..');
const SQL_DIZIN = join(__dirname, '..', '..', '..', 'prisma');

function tumKaynaklar(dizin: string, biriken: string[] = []): string[] {
  for (const ad of readdirSync(dizin)) {
    const tam = join(dizin, ad);
    if (statSync(tam).isDirectory()) tumKaynaklar(tam, biriken);
    else if (/\.ts$/.test(ad) && !ad.endsWith('.spec.ts')) biriken.push(tam);
  }
  return biriken;
}

describe('canlı boost durumları — tek tanım', () => {
  it('KRİTİK: `paused` LİSTEDE', () => {
    /*
     * Duraklatılmış boost CANLI sayılıyor: kampanya Meta'da duruyor ama
     * sürdürülebilir. Listeden çıkarmak, duraklatılmışken ikinci bir boost
     * açılmasına izin vermek olurdu.
     */
    expect([...CANLI_BOOST_DURUMLARI]).toContain('paused');
  });

  it('KRİTİK: SON DURUMLAR listede DEĞİL', () => {
    // Üçü de gönderiyi yeniden boostlanabilir bırakıyor; listeye girerlerse
    // bir kez boostlanan gönderi ömür boyu kilitlenir.
    for (const d of ['rejected', 'completed', 'failed']) {
      expect([...CANLI_BOOST_DURUMLARI]).not.toContain(d);
    }
  });

  it('KRİTİK: SQL üreticisi listeyle AYNI değerleri yazıyor', () => {
    const metin = CANLI_BOOST_SQL.strings.join('');
    for (const d of CANLI_BOOST_DURUMLARI) expect(metin).toContain(`'${d}'`);
    // BAĞLI PARAMETRE YOK: `IN ($1)` Postgres'te liste değil tek değer.
    expect(CANLI_BOOST_SQL.values).toEqual([]);
  });

  it('KRİTİK: HİÇBİR KAYNAK LİSTEYİ ELLE YAZMIYOR', () => {
    /*
     * İddia dosya saymıyor, DESEN arıyor: altıncı kopyayı yazan biri de aynı
     * testten geçmemeli. Tarama yorumsuz kaynakta yapılıyor — kuralı ANLATAN
     * yorum listeyi kelimesi kelimesine yazıyor ve ham kaynakta arayan bir
     * iddia ona eşleşip kod doğruyken kırmızı verirdi.
     */
    const suclular = tumKaynaklar(API_SRC).filter((f) => {
      const kod = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      if (f.endsWith('canli-boost.ts')) return false;
      return /status IN \('candidate'/.test(kod);
    });
    expect(suclular, `listeyi elle yazan dosyalar: ${suclular.join(', ')}`).toEqual([]);
  });

  it('KRİTİK: KISMİ TEKİL İNDEKS de aynı listeyi taşıyor', () => {
    /*
     * İndeks SQL'de yaşıyor ve TypeScript'ten görünmüyor: listeye bir durum
     * eklenip indekse eklenmemesi, kodun engel saydığı bir durumu
     * veritabanının serbest bırakması demek.
     */
    const migrationlar = tumKaynaklarSql(join(SQL_DIZIN, 'migrations'));
    const sonTanim = migrationlar
      .map((f) => readFileSync(f, 'utf8'))
      .filter((m) => m.includes('CREATE UNIQUE INDEX "boosts_active_post_uniq"'))
      .pop();

    expect(sonTanim, 'indeks tanımı bulunamadı — tarama boşa düştü').toBeTruthy();
    for (const d of CANLI_BOOST_DURUMLARI) expect(sonTanim).toContain(`'${d}'`);
  });

  it('KRİTİK: CHECK kısıtı `paused` değerini KABUL EDİYOR', () => {
    // Kısıt kabul etmezse duraklatma yazma anında 23514 ile düşerdi ve mesaj
    // yalnızca kısıt adını taşırdı.
    const kisitlar = readFileSync(join(SQL_DIZIN, 'sql', '01_constraints.sql'), 'utf8');
    /*
     * DİLİM `ADD CONSTRAINT`TEN BAŞLIYOR. Yalnızca kısıt adını aramak DROP
     * satırını buluyor ve oradaki noktalı virgüle kadar olan dilim yüklemi
     * hiç içermiyor — iddia her zaman kırmızı verirdi.
     */
    const i = kisitlar.indexOf('ADD CONSTRAINT boosts_status_chk');
    expect(i, 'kısıt bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const blok = kisitlar.slice(i, kisitlar.indexOf(';', i));
    expect(blok).toContain("'paused'");
  });
});

function tumKaynaklarSql(dizin: string, biriken: string[] = []): string[] {
  for (const ad of readdirSync(dizin)) {
    const tam = join(dizin, ad);
    if (statSync(tam).isDirectory()) tumKaynaklarSql(tam, biriken);
    else if (ad.endsWith('.sql')) biriken.push(tam);
  }
  return biriken.sort();
}
