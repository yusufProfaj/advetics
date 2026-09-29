import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { baslangicSecimi, kitleHedefi, varsayilanAdres } from './marka-varsayilanlari';

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

describe('kitle şablonu (Bölüm 4)', () => {
  const K = {
    id: '11111111-1111-1111-1111-111111111111',
    clientId: 'c',
    name: 'İzmir kadın',
    locations: [{ key: '2622', type: 'region' as const, label: 'İzmir, Türkiye', countryCode: 'TR' }],
    ageMin: 25,
    ageMax: 45,
    genders: 'female' as const,
    interests: [{ id: '6003', name: 'Lüks araçlar' }],
    varsayilan: true,
    updatedAt: '',
  };

  it('seçilen şablon taslağa KOPYA olarak gidiyor', () => {
    const r = kitleHedefi([K], K.id);
    expect(r.hedef).toEqual({
      sablonId: K.id,
      name: 'İzmir kadın',
      locations: K.locations,
      ageMin: 25,
      ageMax: 45,
      genders: 'female',
      interests: [{ id: '6003', name: 'Lüks araçlar' }],
    });
    expect(r.ozet).toBe('İzmir, Türkiye · 25-45 yaş · Kadın · ilgi: Lüks araçlar');
  });

  it('boş seçim şablonsuz: Türkiye geneli', () => {
    expect(kitleHedefi([K], '')).toEqual({ hedef: null, ozet: 'Türkiye geneli · 18+ yaş', hata: null });
  });

  it('KRİTİK: silinmiş şablon HATA — sessizce Türkiye geneline düşmüyor', () => {
    const r = kitleHedefi([], K.id);
    expect(r.hedef).toBeNull();
    expect(r.hata).toContain('artık yok');
  });

  const yorumsuz = (yol: string) =>
    readFileSync(resolve(__dirname, yol), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const SIHIRBAZ = yorumsuz('simple-builder.tsx');
  const SAYFA = yorumsuz('../../app/(dashboard)/reklam-olustur/basit/page.tsx');

  it('varsayılan kitle seçili geliyor, taslağa gidiyor ve eksik listesine giriyor', () => {
    expect(SIHIRBAZ).toContain("useState(varsayilanKitleId ?? '')");
    expect(SIHIRBAZ).toContain('kitle: kitle.hedef,');
    expect(SIHIRBAZ).toContain('if (kitle.hata) list.push(kitle.hata);');
    expect(SIHIRBAZ).toContain('bizNeSectik(goal, kitle.ozet)');
  });

  it('sayfa kitleleri çekiyor ve düşerse SÖYLÜYOR', () => {
    expect(SAYFA).toContain('serverApiFetch<KitleSablonuListesi>(`/audience-templates?clientId=${clientId}`)');
    expect(SAYFA).toContain("kitleSonuc.status === 'rejected' && (");
    expect(SAYFA).toContain("kitleSonuc.status === 'fulfilled' ? kitleSonuc.value.varsayilanId : null");
  });
});

