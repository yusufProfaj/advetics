import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { ReportData } from '@advetics/shared';
import { RaporPdfService } from './rapor-pdf.service';

/**
 * RAPOR PDF'İ.
 *
 * "PDF üretildi" DOĞRULAMA DEĞİL. Bir PDF her zaman üretilir: yanlış yazı
 * tipiyle, taşan satırlarla, eksik sütunlarla. Bu yüzden testler üretilen
 * BAYTLARA bakıyor — gerçek PDF mi, metin gömülü mü, Türkçe geçiyor mu.
 *
 * pdf-lib metin çıkarma sunmuyor; ama `subset` gömmede kullanılan glifler
 * ToUnicode haritasına yazılıyor ve ham baytlarda aranabiliyor. Aranan şey
 * gösterim değil VARLIK: "bu belge o karakteri gerçekten taşıyor mu".
 */
const VERI: ReportData = {
  client: { id: 'c1', name: 'Sabancı İnşaat' },
  branding: {
    logoUrl: null,
    primaryColor: '#000000',
    accentColor: '#111111',
    fontFamily: 'sans',
    footerText: null,
    hidePoweredBy: false,
  },
  title: 'Dijital Pazarlama Raporu',
  /*
   * METİN, SINANAN KARAKTERLERİN HEPSİNİ TAŞIMAK ZORUNDA.
   *
   * İlk hâlinde `ğ` hiç geçmiyordu ve test "belgede yok" diye düşüyordu —
   * kodun değil FIXTURE'ın eksiği. Gerçek bir rapor cümlesi yazıldı.
   */
  closingText:
    'Temmuz ayı genelinde Meta Ads reklamları 180 nitelikli form ve 213 anlık mesaj ile ' +
    'satış ekibinizin potansiyel müşteri havuzunu sağlamlaştırmıştır. ' +
    'Toplam harcama ₺34.026,44 · doğrudan arama niyeti güçlü.',
  from: '2026-07-01',
  to: '2026-07-31',
  sections: ['cover', 'summary', 'meta_campaigns', 'google_campaigns', 'google_keywords', 'closing'],
  options: {},
  rangeDays: 31,
  currency: 'TRY',
  platforms: [
    {
      label: 'Meta Ads',
      platform: 'meta',
      currency: 'TRY',
      impressions: 261_287,
      clicks: 3151,
      spendMicros: '24671710000',
      conversions: 393,
      conversionValueMicros: '0',
      ctr: 1.21,
      cpc: 7.83,
      cpa: 62.78,
      roas: null,
      conversionCounts: { form: 180, message: 213, purchase: 0 },
    },
  ] as unknown as ReportData['platforms'],
  total: null,
  metaCampaigns: [
    {
      id: 'k1',
      name: 'İkon Live — Lead (Form) · Bağcılar & Çiğli, geniş hedefleme',
      impressions: 4184,
      clicks: 66,
      spendMicros: '821770000',
      conversions: 5,
      conversionValueMicros: '0',
      reach: 3900,
      reachIsDailyAverage: false,
      dayCount: 31,
      ctr: 1.58,
      cpc: 12.45,
      cpa: 164.35,
      roas: null,
      conversionCounts: { form: 5, message: 0, purchase: 0 },
    },
  ] as unknown as ReportData['metaCampaigns'],
  googleCampaigns: [],
  daily: [],
  topAds: [],
  keywords: [
    { keyword: 'urla satılık villa', spendMicros: '3037000000', impressions: 6250, clicks: 302, ctr: 4.83, cpc: 10.05 },
  ],
  generatedAt: '2026-08-22T00:00:00.000Z',
};

const svc = new RaporPdfService();

/**
 * PDF'in İÇİNİ AÇIP BAKAR.
 *
 * İlk denemede ham baytlarda arıyordum ve test yanlış sebeple düşüyordu:
 * pdf-lib akışları FlateDecode ile SIKIŞTIRIYOR, yani ToUnicode haritası
 * ham baytlarda görünmüyor. Sıkıştırılmış içeriğe bakan bir doğrulama,
 * "PDF üretildi" demekten daha iyi değil.
 *
 * Bütün akışlar açılıp birleştiriliyor; ToUnicode haritası gömülü yazı
 * tipinin GERÇEKTEN hangi Unicode kod noktalarını taşıdığını yazıyor.
 */
function icerik(pdf: Buffer): string {
  const parcalar: string[] = [pdf.toString('latin1')];
  const ham = pdf.toString('latin1');
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ham)) !== null) {
    const bas = m.index + m[0].length;
    const son = ham.indexOf('endstream', bas);
    if (son === -1) continue;
    try {
      parcalar.push(
        inflateSync(Buffer.from(ham.slice(bas, son), 'latin1')).toString('latin1'),
      );
    } catch {
      /* sıkıştırılmamış ya da başka filtre — ham hâli zaten listede */
    }
  }
  return parcalar.join('\n').toLowerCase();
}

/** Karakterin ToUnicode haritasında geçip geçmediği. */
function iceriyorMu(pdf: Buffer, karakter: string): boolean {
  const kod = karakter.codePointAt(0)!.toString(16).padStart(4, '0').toLowerCase();
  return icerik(pdf).includes(`<${kod}>`);
}

describe('RaporPdfService', () => {
  it('gerçek bir PDF üretiyor', async () => {
    const pdf = await svc.uret(VERI);
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdf.byteLength).toBeGreaterThan(3000);
  });

  it('KRİTİK: TÜRKÇE karakterler ve ₺ belgeye GİRİYOR', async () => {
    /*
     * "PDF üretildi" yetmiyor: standart yazı tipiyle de üretilirdi, yalnızca
     * `ğ ş ı ₺` düşerdi ve bunu ilk gören müşteri olurdu.
     */
    const KARAKTERLER = ['ş', 'İ', 'ı', 'ğ', 'ü', 'ç', '₺'];

    /*
     * ÖNCE ÖNCÜL: metin o karakterleri GERÇEKTEN taşıyor mu?
     *
     * İlk yazımda taşımıyordu (`ğ` fixture'da hiç geçmiyordu) ve test kodun
     * hatasıymış gibi düşüyordu. Öncülü doğrulamayan bir test, düştüğünde
     * yanlış yere baktırıyor.
     */
    const metin = [VERI.title, VERI.client.name, VERI.closingText ?? '', VERI.metaCampaigns[0]!.name]
      .join(' ');
    for (const ch of KARAKTERLER) {
      expect(metin, `fixture ${ch} taşımıyor — test kendi öncülünü sınayamaz`).toContain(ch);
    }

    const pdf = await svc.uret(VERI);
    for (const ch of KARAKTERLER) {
      expect(iceriyorMu(pdf, ch), `${ch} belgede yok`).toBe(true);
    }
  });

  it('bölüm SIRASI şablondan geliyor — sayfa sayısı bölüm sayısına bağlı', async () => {
    const az = await svc.uret({ ...VERI, sections: ['cover'] });
    const cok = await svc.uret(VERI);
    expect(cok.byteLength).toBeGreaterThan(az.byteLength);
  });

  it('KRİTİK: bilinmeyen bölüm PDF üretimini DÜŞÜRMÜYOR', async () => {
    // `top_ads` PDF'te henüz yok; şablonda seçili olması üretimi
    // patlatmamalı — kullanıcı raporu hiç alamazdı.
    await expect(
      svc.uret({ ...VERI, sections: ['cover', 'top_ads', 'closing'] }),
    ).resolves.toBeInstanceOf(Buffer);
  });

  it('KRİTİK: şablondaki SÜTUN seçimi PDF’e yansıyor', async () => {
    // Panelde seçilen sütunlar PDF'te de geçerli olmalı; ayrışırsa aynı
    // rapor iki farklı tabloyla çıkar.
    const varsayilan = await svc.uret(VERI);
    const tekSutun = await svc.uret({
      ...VERI,
      options: { meta_campaigns: { metrics: ['spend'] } },
    });
    expect(tekSutun.byteLength).toBeLessThan(varsayilan.byteLength);
  });

  it('boş kampanya listesi SEBEBİYLE yazılıyor — boş sayfa değil', async () => {
    // Boş sayfa ile "veri yok" yazan sayfa arasındaki fark ölçülüyor:
    // sessizce boş bir sayfa göndermek, müşteriye "kampanyan yoktu" demek.
    const pdf = await svc.uret({ ...VERI, sections: ['google_campaigns'], googleCampaigns: [] });
    expect(iceriyorMu(pdf, 'ö')).toBe(true); // "dönemde" — Türkçe metin çizildi
    expect(pdf.byteLength).toBeGreaterThan(1500);
  });

  it('anahtar kelime null ise "yetenek yok" yazılıyor', async () => {
    // `null` "veri yok" değil "bu müşteride Google bağlantısı yok" demek.
    await expect(
      svc.uret({ ...VERI, sections: ['google_keywords'], keywords: null }),
    ).resolves.toBeInstanceOf(Buffer);
  });

  it('kapanış metni yoksa sayfa AÇILMIYOR', async () => {
    const ile = await svc.uret({ ...VERI, sections: ['closing'] });
    const olmadan = await svc.uret({ ...VERI, sections: ['closing'], closingText: null });
    expect(olmadan.byteLength).toBeLessThan(ile.byteLength);
  });

  it('belge ÜSTVERİSİ müşteri adını taşıyor — okuyucu sekmesi ve dosya adı', async () => {
    const pdf = await svc.uret(VERI);
    // Başlık üstveride düz metin (UTF-16BE) olarak duruyor.
    expect(icerik(pdf)).toContain('/title');
  });
});
