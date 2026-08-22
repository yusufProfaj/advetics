import { describe, expect, it } from 'vitest';
import type { ReportData } from '@advetics/shared';
import { raporMailTaslagi } from './rapor-mail';

/**
 * RAPOR MAİLİ.
 *
 * Ajansın elle yazdığı mailde platform toplamları genel toplamı TUTMUYORDU
 * (₺34.001,64 vs ₺34.026,44; 341.398 vs 322.754 gösterim). Otomatik üretilen
 * mailin tek işi bu tür sapmaları imkânsız kılmak — sayılar rapordan birebir
 * geliyor.
 *
 * ANLATI ÜRETİLMİYOR: "Urla bölgesindeki konut aramalarında..." gibi cümleler
 * veriden çıkarılamaz ve uydurmak müşteriye yanlış bir strateji anlatmak
 * olurdu. Taslak düzenlenebilir.
 */
const blok = (over: Record<string, unknown> = {}) =>
  ({
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
    ...over,
  }) as unknown as ReportData['platforms'][number];

const VERI: ReportData = {
  client: { id: 'c1', name: 'Sabancı İnşaat' },
  branding: {} as ReportData['branding'],
  title: 'Dijital Pazarlama Raporu',
  closingText: 'Temmuz ayı genelinde satış ekibinizin havuzu güçlendi.',
  from: '2026-07-01',
  to: '2026-07-31',
  sections: [],
  options: {},
  rangeDays: 31,
  currency: 'TRY',
  platforms: [blok()],
  total: blok({ label: 'TOPLAM', spendMicros: '34026440000', impressions: 322_754, clicks: 3714, conversions: 424, cpc: 9.16 }),
  metaCampaigns: [
    {
      id: 'k1',
      name: 'Urla Villa Kampanyası',
      impressions: 6250,
      clicks: 460,
      spendMicros: '4453540000',
      conversions: 20,
      conversionValueMicros: '0',
      reach: 5000,
      reachIsDailyAverage: false,
      dayCount: 31,
      ctr: 7.36,
      cpc: 9.68,
      cpa: 222.67,
      roas: null,
      conversionCounts: { form: 20, message: 0, purchase: 0 },
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

describe('raporMailTaslagi', () => {
  it('konu müşteri adını ve dönemi taşıyor', () => {
    const t = raporMailTaslagi(VERI, 'Yusuf Algan');
    expect(t.subject).toContain('Sabancı İnşaat');
    expect(t.subject).toContain('Temmuz 2026');
  });

  it('aynı aydaki dönem AYI BİR KEZ yazıyor', () => {
    expect(raporMailTaslagi(VERI, 'x').subject).toContain('1 - 31 Temmuz 2026');
  });

  it('farklı aylara yayılan dönem iki ayı da yazıyor', () => {
    const t = raporMailTaslagi({ ...VERI, from: '2026-06-15', to: '2026-07-14' }, 'x');
    expect(t.subject).toContain('15 Haziran - 14 Temmuz 2026');
  });

  it('KRİTİK: genel toplam RAPORDAN geliyor — elle yazılan mailde tutmuyordu', () => {
    const t = raporMailTaslagi(VERI, 'x');
    expect(t.html).toContain('34.026,44');
    expect(t.html).toContain('322.754');
  });

  it('platform bloğu form ve mesaj DÖKÜMÜNÜ yazıyor', () => {
    const t = raporMailTaslagi(VERI, 'x');
    expect(t.html).toContain('180');
    expect(t.html).toContain('213');
    expect(t.html).toContain('nitelikli müşteri formu');
  });

  it('KRİTİK: dökümü OLMAYAN platformda "0 form" YAZILMIYOR', () => {
    /*
     * Google `actions` dizisi döndürmüyor. "0 form, 0 mesaj" yazmak "hiç
     * form gelmedi" gibi okunur; oysa o platformda bu döküm diye bir şey yok.
     */
    const google = blok({
      label: 'Google Ads',
      platform: 'google',
      conversions: 28,
      conversionCounts: { form: 0, message: 0, purchase: 0 },
    });
    const t = raporMailTaslagi({ ...VERI, platforms: [google] }, 'x');
    expect(t.html).not.toContain('nitelikli müşteri formu');
    expect(t.html).toContain('Toplam Dönüşüm');
  });

  it('öne çıkan kampanya ve anahtar kelime listeleniyor', () => {
    const t = raporMailTaslagi(VERI, 'x');
    expect(t.html).toContain('Urla Villa Kampanyası');
    expect(t.html).toContain('urla satılık villa');
  });

  it('genel değerlendirme ŞABLONUN kapanış metninden geliyor — uydurulmuyor', () => {
    // Anlatı veriden çıkarılamaz; uydurmak müşteriye yanlış bir strateji
    // anlatmak olurdu.
    expect(raporMailTaslagi(VERI, 'x').html).toContain('satış ekibinizin havuzu güçlendi');
  });

  it('KRİTİK: kampanya adı HTML olarak KAÇIRILIYOR', () => {
    // Kampanya adını reklam veren yazıyor; kaçırmadan gömmek giden mailde
    // bozuk işaretleme ve alıcının istemcisinde bir enjeksiyon yüzeyi demek.
    const t = raporMailTaslagi(
      {
        ...VERI,
        client: { id: 'c1', name: '<script>alert(1)</script>' },
      },
      'x',
    );
    expect(t.html).not.toContain('<script>');
    expect(t.html).toContain('&lt;script&gt;');
  });

  it('danışman adı imzanın üstünde yazıyor', () => {
    expect(raporMailTaslagi(VERI, 'Yusuf Algan').html).toContain('Yusuf Algan');
  });
});
