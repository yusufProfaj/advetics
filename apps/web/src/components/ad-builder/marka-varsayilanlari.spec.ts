import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { baslangicSecimi, varsayilanAdres } from './marka-varsayilanlari';

/**
 * ═══ REKLAM OLUŞTUR, MARKA MERKEZİ'NİN BİLDİĞİNİ SORMUYOR ═══
 */
const SAYFALAR = [
  { ad: 'Projeler', url: 'https://a.com/projeler' },
  { ad: 'İletişim', url: 'https://a.com/iletisim' },
];

describe('varsayilanAdres', () => {
  it('kayıtlı sayfa varsa İLKİ, siteden önce', () => {
    expect(varsayilanAdres(SAYFALAR, 'https://a.com')).toBe('https://a.com/projeler');
  });
  it('sayfa yoksa workspace sitesi, o da yoksa BOŞ — adres uydurulmuyor', () => {
    expect(varsayilanAdres([], 'https://a.com')).toBe('https://a.com');
    expect(varsayilanAdres([], null)).toBe('');
  });
});

describe('baslangicSecimi', () => {
  it('ana amaç seçili geliyor', () => {
    expect(baslangicSecimi({ anaAmac: 'form', sikSayfalar: SAYFALAR, clientWebsite: null })).toEqual({
      goal: 'form',
      linkUrl: '',
    });
  });
  it('adres YALNIZCA amaç site ise dolduruluyor — başka amaçta gönderilmeyecek alan dolu görünmesin', () => {
    expect(baslangicSecimi({ anaAmac: 'website', sikSayfalar: SAYFALAR, clientWebsite: null }).linkUrl).toBe(
      'https://a.com/projeler',
    );
    expect(baslangicSecimi({ anaAmac: 'whatsapp', sikSayfalar: SAYFALAR, clientWebsite: 'https://a.com' }).linkUrl).toBe('');
  });
  it('amaç kayıtlı değilse eski davranış: hiçbir şey seçili değil', () => {
    expect(baslangicSecimi({ anaAmac: null, sikSayfalar: SAYFALAR, clientWebsite: 'https://a.com' })).toEqual({
      goal: null,
      linkUrl: '',
    });
  });
});

describe('bağlantı — saf fonksiyon GERÇEKTEN kullanılıyor', () => {
  const yorumsuz = (yol: string) =>
    readFileSync(resolve(__dirname, yol), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const SIHIRBAZ = yorumsuz('simple-builder.tsx');
  const SAYFA = yorumsuz('../../app/(dashboard)/reklam-olustur/basit/page.tsx');

  it('sihirbazın ilk durumu baslangicSecimi\'nden', () => {
    expect(SIHIRBAZ).toContain('useState(() => baslangicSecimi({ anaAmac, sikSayfalar, clientWebsite }))');
    expect(SIHIRBAZ).toContain('useState<CampaignGoal | null>(baslangic.goal)');
    expect(SIHIRBAZ).toContain('useState(baslangic.linkUrl)');
  });

  it('hedef sonradan "site" seçilince de aynı adres kuralı', () => {
    expect(SIHIRBAZ).toContain('const adres = varsayilanAdres(sikSayfalar, clientWebsite);');
  });

  it('sayfa profili çekip iletiyor ve düşerse bunu SÖYLÜYOR', () => {
    expect(SAYFA).toContain('serverApiFetch<ClientProfileRecord>(`/client-profile?clientId=${clientId}`)');
    expect(SAYFA).toContain("markaSonuc.status === 'fulfilled' ? markaSonuc.value.anaAmac : null");
    expect(SAYFA).toContain("markaSonuc.status === 'rejected' && (");
  });
});

describe('yasal uyarı ve metin şablonları (Bölüm 3b)', () => {
  const yorumsuz = (yol: string) =>
    readFileSync(resolve(__dirname, yol), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const SIHIRBAZ = yorumsuz('simple-builder.tsx');
  const SAYFA = yorumsuz('../../app/(dashboard)/reklam-olustur/basit/page.tsx');

  it('KRİTİK: kreatife giden metin uyarıyı içeren metin — kutuda yazan değil', () => {
    expect(SIHIRBAZ).toContain('const gonderilecekMetin = yasalUyariEkle(primaryText.trim(), yasalUyari);');
    expect(SIHIRBAZ).toContain('primaryText: gonderilecekMetin,');
    expect(SIHIRBAZ).not.toContain('primaryText: primaryText.trim(),');
  });

  it('önizleme ve özet YAYINA ÇIKACAK metni gösteriyor', () => {
    expect(SIHIRBAZ).toMatch(/<Onizleme[\s\S]{0,120}primaryText=\{gonderilecekMetin\}/);
    expect(SIHIRBAZ).toMatch(/gorselSayisi=\{assetIds\.length\}\s*primaryText=\{gonderilecekMetin\}/);
  });

  it('şablonlar tek tıkla ana metne ekleniyor; sayfa ikisini de profilden iletiyor', () => {
    expect(SIHIRBAZ).toContain('metinSablonlari.map((t) => (');
    expect(SAYFA).toContain("markaSonuc.status === 'fulfilled' ? markaSonuc.value.metinSablonlari : []");
    expect(SAYFA).toContain("markaSonuc.status === 'fulfilled' ? markaSonuc.value.yasalUyari : null");
  });
});

