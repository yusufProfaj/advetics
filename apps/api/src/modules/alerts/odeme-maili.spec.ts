import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Uyari } from '@advetics/shared';
import { anahtar, odemeMailiOlustur } from './odeme-maili';
import { NOT_SINIRI, notOlustur } from './hesap-durumu-kontrol.service';

/**
 * ═══ ÖDEME UYARISI MAİLİ ═══
 *
 * Bu mail ajansa günde iki kez gidebiliyor ve içeriği bir kez yanlış olursa
 * kullanıcı yanlış müşteriyi arar. Gövde saf bir fonksiyondan üretiliyor ki
 * "gözle kontrol ettim" ile geçilmesin.
 */
function uyari(over: Partial<Uyari> = {}): Uyari {
  return {
    kod: 'hesap_odeme_sorunu',
    siddet: 'error',
    baslik: 'Reklamlar yayınlanmıyor — ödeme sorunu',
    detay: 'Hesabın ödenmemiş bakiyesi var.',
    clientId: 'c1',
    clientName: 'A Firması',
    adAccountId: 'a1',
    adAccountName: 'A Meta Hesabı',
    platform: 'meta',
    eylem: null,
    veriZamani: '2026-08-27T08:05:00.000Z',
    ...over,
  };
}

describe('mail gövdesi', () => {
  it('etkilenen hesap ve workspace adı gövdede', () => {
    const { html } = odemeMailiOlustur([uyari()], new Set(), 'https://x');
    expect(html).toContain('A Firması');
    expect(html).toContain('A Meta Hesabı');
  });

  it('KRİTİK: konuda SAYI var', () => {
    /*
     * "Ödeme uyarısı" konulu bir mail, açılmadan hangi ölçekte bir sorun
     * olduğunu söylemiyor; gelen kutusunda arka arkaya duran iki mailin
     * farkı da görünmüyor.
     */
    const { konu } = odemeMailiOlustur([uyari(), uyari({ adAccountId: 'a2' })], new Set(), 'https://x');
    expect(konu).toContain('2');
  });

  it('KRİTİK: YENİ olanlar işaretleniyor', () => {
    /*
     * Aynı sorun düzelene kadar günde iki kez mail gidiyor ve dördüncü
     * mailden sonra kimse okumuyor. "Bu sabah eklenen" bilgisi o maili
     * yeniden okunur kılan tek şey.
     */
    const eski = uyari({ adAccountId: 'a1' });
    const yeni = uyari({ adAccountId: 'a2', adAccountName: 'B Google' });
    const { html, konu } = odemeMailiOlustur(
      [eski, yeni],
      new Set([anahtar(yeni)]),
      'https://x',
    );
    expect(konu).toContain('1 yeni');
    // İşaret YALNIZCA yeni satırda.
    const bSatiri = html.slice(html.indexOf('B Google'));
    expect(bSatiri).toContain('YENİ');
    const aSatiri = html.slice(html.indexOf('A Meta Hesabı'), html.indexOf('B Google'));
    expect(aSatiri).not.toContain('YENİ');
  });

  it('yeni yoksa konu "sürüyor" diyor', () => {
    const { konu } = odemeMailiOlustur([uyari()], new Set(), 'https://x');
    expect(konu).toContain('sürüyor');
    expect(konu).not.toContain('yeni');
  });

  it('aynı workspace’in hesapları TEK başlık altında', () => {
    // Mail müşteri müşteri okunuyor; aynı firmanın iki hesabını iki ayrı
    // başlıkta göstermek "iki müşteride sorun var" gibi okunurdu.
    const { html } = odemeMailiOlustur(
      [uyari({ adAccountId: 'a1' }), uyari({ adAccountId: 'a2', adAccountName: 'A Google' })],
      new Set(),
      'https://x',
    );
    expect(html.split('A Firması').length - 1).toBe(1);
  });

  it('KRİTİK: müşteri adı HTML olarak kaçırılıyor', () => {
    /*
     * Ad kullanıcı girdisi ve maile gömülüyor. `&` içeren bir firma adı
     * ("A & B Yapı") kaçırılmazsa gövdeyi bozuyor, `<` içeren bir ad ise
     * doğrudan enjeksiyon — alıcının istemcisinde çalışan bir etiket.
     */
    const { html } = odemeMailiOlustur(
      [uyari({ clientName: 'A & B <script>x</script>' })],
      new Set(),
      'https://x',
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&amp;');
    expect(html).toContain('&lt;script&gt;');
  });

  it('platform adı okunur yazılıyor', () => {
    const { html } = odemeMailiOlustur([uyari({ platform: 'google' })], new Set(), 'https://x');
    expect(html).toContain('Google Ads');
  });
});

describe('not sınırı', () => {
  it('anahtarlar nota gömülüyor ve geri okunabiliyor', () => {
    const not = notOlustur('gövde', ['k:1', 'k:2']);
    expect(not).toContain('[anahtarlar:k:1,k:2]');
  });

  it('KRİTİK: not 500 karakteri AŞMIYOR', () => {
    /*
     * `sync_jobs.note` VarChar(500). Sınırı aşan bir yazma Postgres'te HATA
     * veriyor, sessizce kırpmıyor — yani çok sayıda sorunlu hesapta işin
     * TAMAMI düşerdi ve hesap durumu hiç tazelenmezdi.
     */
    const cokAnahtar = Array.from({ length: 200 }, (_, i) => `hesap_odeme_sorunu:uuid-${i}`);
    const not = notOlustur('x'.repeat(200), cokAnahtar);
    expect(not.length).toBeLessThanOrEqual(NOT_SINIRI);
  });

  it('KRİTİK: sığmayan anahtar sayısı SÖYLENİYOR', () => {
    // Sessiz kesme yok. Sığmayanlar bir sonraki turda "yeni" görünecek ve
    // bu, kaybolmalarından iyi — ama görünmez olmamalı.
    const cok = Array.from({ length: 200 }, (_, i) => `hesap_odeme_sorunu:uuid-${i}`);
    expect(notOlustur('kısa gövde', cok)).toMatch(/\+\d+ sığmadı/);
  });

  it('gövde tek başına sınırı aşıyorsa anahtar yazılmıyor', () => {
    const not = notOlustur('y'.repeat(600), ['k:1']);
    expect(not.length).toBeLessThanOrEqual(NOT_SINIRI);
    expect(not).not.toContain('[anahtarlar:');
  });
});

/**
 * ═══ ZAMANLAMA VE BAĞLANTI ═══
 *
 * Kaynak taraması: zamanlayıcı kaydı ve işleyici dalı birlikte var olmak
 * zorunda. Biri olmadan diğeri sessiz bir hata üretiyor — `sweep:keywords`
 * tam bunu yaptı ve Google anahtar kelime verisi aylarca hiç toplanmadı.
 */
describe('zamanlanmış iş', () => {
  const KUYRUK = readFileSync(join(__dirname, '..', '..', 'queue', 'sync-queue.service.ts'), 'utf8');
  const ISLEYICI = readFileSync(
    join(__dirname, '..', '..', 'queue', 'sync-processor.service.ts'),
    'utf8',
  );

  /** Yorum satırlarını atar — iki dosya da bu kuralları anlatan yorumlar taşıyor. */
  function kod(src: string): string {
    return src
      .split('\n')
      .filter((l) => {
        const t = l.trim();
        return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
      })
      .join('\n');
  }

  it('tarama gerçekten bir şey yakaladı', () => {
    expect(kod(KUYRUK)).toContain('installSchedules');
    expect(kod(ISLEYICI)).toContain('jobType');
  });

  it('KRİTİK: günde iki kez — 08 ve 13', () => {
    expect(kod(KUYRUK)).toContain("pattern: '5 8,13 * * *'");
  });

  it('KRİTİK: saat dilimi Europe/Istanbul — UTC DEĞİL', () => {
    /*
     * Diğer bütün süpürmeler UTC ve bu doğru: onlar veri penceresi hakkında.
     * Bu iş İNSANIN OKUDUĞU bir mail üretiyor — 08:00 UTC, İstanbul'da 11:00
     * demek ve "sabah kontrol" isteği karşılanmamış olurdu.
     */
    const k = kod(KUYRUK);
    const i = k.indexOf("name: 'sweep:account-status'");
    expect(i, 'zamanlayıcıda account-status yok — tarama boşa düştü').toBeGreaterThan(-1);
    expect(k.slice(i, i + 260)).toContain("tz: 'Europe/Istanbul'");
  });

  it('KRİTİK: zamanlayıcının saat dilimi GERÇEKTEN kuruluyor', () => {
    // Alan yazılıp `upsertJobScheduler`a geçirilmezse hiçbir şey demiyor ve
    // iş yine UTC'de koşuyordu — sessiz.
    expect(kod(KUYRUK)).toContain("tz: s.tz ?? 'UTC'");
  });

  it('KRİTİK: işleyicide karşılık dalı VAR', () => {
    // Dal olmadan iş her turda "bilinmeyen tür" ile düşerdi ve tek iz
    // `sync_jobs` olurdu.
    expect(kod(ISLEYICI)).toContain("payload.jobType === 'account_status'");
    expect(kod(ISLEYICI)).toContain('hesapDurumu.kontrolEt()');
  });

  it('KRİTİK: hesap DÖNGÜSÜNÜN DIŞINDA — döngü başlamadan dönüyor', () => {
    /*
     * `listAdAccounts` bir bağlantının BÜTÜN hesaplarını tek çağrıda
     * getiriyor. Dal hesap döngüsünün İÇİNE düşerse aynı bağlantı hesap
     * sayısı kadar çağrılır ve 481 hesaplı bir havuzda kota bir turda yanar.
     *
     * İDDİA DÖNGÜNÜN AÇILDIĞI SATIRA ÇAPALI. İlk hâli `datesForJob`a
     * çapalıydı ve dalı döngünün İÇİNE, o satırın hemen üstüne taşıyan
     * mutasyonda HAYATTA KALDI — "ondan önce" olmak döngü dışında olmak
     * demek değil.
     */
    const k = kod(ISLEYICI);
    const dal = k.indexOf("payload.jobType === 'account_status'");
    const donguBasi = k.indexOf('for (const acct of accounts) {');
    expect(dal, 'işleyicide account_status dalı yok — tarama boşa düştü').toBeGreaterThan(-1);
    expect(donguBasi, 'hesap döngüsü bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    expect(dal).toBeLessThan(donguBasi);
  });
});
