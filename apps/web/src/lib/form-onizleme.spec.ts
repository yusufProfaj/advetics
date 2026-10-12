import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FormOnizlemesi, LeadFormRecord } from '@advetics/shared';
import {
  formOlusturmaDurumu,
  gizlilikOnerisi,
  kayittanOnizleme,
  onizlemeEkranlari,
  sayfaTaslaklari,
  yayinSonrasiSecim,
  type FormTaslagi,
} from './form-onizleme';

/**
 * FORM ÖNİZLEMESİ ve REHBERDEKİ FORM AKIŞI.
 *
 * Kritik iddialar: (1) verisi olmayan ekran çizilmez, okunamayan ekran
 * "okunamadı" der (boş kutu değil); (2) Advetics taslağının önizlemesi
 * Meta'ya gidecek hâlin aynası; (3) yayından sonra yalnız yayında formun
 * Meta kimliği seçilir; (4) rehberde İKİNCİ bir oluşturucu ve İKİNCİ bir
 * önizleme yok.
 */

const META: FormOnizlemesi = {
  kaynak: 'meta',
  ad: 'Keşif',
  durum: 'ACTIVE',
  giris: { baslik: 'Ücretsiz keşif', maddeler: ['24 saatte dönüş'], dugme: 'Devam' },
  soruBasligi: null,
  sorular: [{ tur: 'FULL_NAME', etiket: 'Ad soyad', otomatikDolu: true, secenekler: [] }],
  gizlilik: { adres: 'https://o.com/kvkk', metin: null },
  onaylar: null,
  tesekkur: { baslik: 'Teşekkürler', metin: null, dugme: null, adres: null },
  okunamayanlar: [],
};

const TASLAK: FormTaslagi = {
  name: 'Yaz formu',
  headline: '',
  intro: '',
  prefillQuestions: ['FULL_NAME', 'PHONE'],
  customQuestions: [{ type: 'multiple_choice', label: 'Bütçe?', options: ['1-2', '2-5'] }],
  privacyPolicyUrl: 'https://o.com/gizlilik',
  privacyPolicyLinkText: 'Gizlilik Politikası',
  consentBoxes: [{ text: 'KVKK onayı', required: true }],
  thankYouHeadline: 'Teşekkürler!',
  thankYouBody: 'Arayacağız.',
  thankYouCtaText: 'Siteyi ziyaret et',
  thankYouCtaUrl: null,
};

describe('onizlemeEkranlari', () => {
  it('KRİTİK: Meta sırasıyla dört ekran; giriş yoksa listeye HİÇ girmez', () => {
    expect(onizlemeEkranlari(META).map((e) => [e.tur, e.hal])).toEqual([
      ['giris', 'var'],
      ['sorular', 'var'],
      ['gizlilik', 'var'],
      ['tesekkur', 'var'],
    ]);
    expect(onizlemeEkranlari({ ...META, giris: null }).map((e) => e.tur)).toEqual(['sorular', 'gizlilik', 'tesekkur']);
  });

  it('KRİTİK: Meta’dan gelmeyen bölüm "okunamadı" (boş ekran değil, "yok" değil)', () => {
    const e = onizlemeEkranlari({ ...META, sorular: [], gizlilik: null, tesekkur: null, okunamayanlar: ['sorular', 'gizlilik', 'tesekkur'] });
    expect(e.filter((x) => x.tur !== 'giris').map((x) => [x.tur, x.hal])).toEqual([
      ['sorular', 'okunamadi'],
      ['gizlilik', 'okunamadi'],
      ['tesekkur', 'okunamadi'],
    ]);
    expect(e.every((x) => x.tur === 'giris' || /okunamadı/.test(x.not ?? ''))).toBe(true);
  });

  it('taslakta henüz yazılmayan bölüm "yok" ve sebebiyle; onaylar okunmadıysa söylenir', () => {
    const e = onizlemeEkranlari({ ...META, kaynak: 'advetics', sorular: [], gizlilik: null, tesekkur: null });
    expect(e.find((x) => x.tur === 'sorular')).toMatchObject({ hal: 'yok', not: 'Henüz soru seçilmedi.' });
    expect(e.find((x) => x.tur === 'gizlilik')?.not).toMatch(/Meta bu adres olmadan/);
    expect(onizlemeEkranlari(META).find((x) => x.tur === 'gizlilik')?.not).toMatch(/onay kutuları burada gösterilmiyor/);
    expect(onizlemeEkranlari({ ...META, onaylar: [] }).find((x) => x.tur === 'gizlilik')?.not).toBeNull();
  });
});

describe('kayittanOnizleme (Meta’ya gidecek hâlin aynası)', () => {
  it('KRİTİK: "Bizi ara" düğmesi numarasıyla görünür; "Düğme yok"ta adres olsa bile düğme yok', () => {
    const ara = kayittanOnizleme({ ...TASLAK, thankYouCtaType: 'CALL_BUSINESS', thankYouCtaText: '', thankYouPhone: '+902321234567' }).tesekkur;
    expect(ara).toMatchObject({ dugme: 'Bizi ara', adres: '+902321234567' });
    const yok = kayittanOnizleme({ ...TASLAK, thankYouCtaType: 'NONE', thankYouCtaUrl: 'https://o.com' }).tesekkur;
    expect(yok).toMatchObject({ dugme: null, adres: null });
    // Tür verilmeyen eski kayıt: adres varsa site düğmesi (eski kural).
    expect(kayittanOnizleme({ ...TASLAK, thankYouCtaUrl: 'https://o.com' }).tesekkur).toMatchObject({ dugme: 'Siteyi ziyaret et', adres: 'https://o.com' });
  });

  it('KRİTİK: başlık ve açıklama yoksa giriş ekranı YOK (createLeadForm context_card göndermiyor)', () => {
    expect(kayittanOnizleme(TASLAK).giris).toBeNull();
    expect(kayittanOnizleme({ ...TASLAK, intro: 'Açıklama' }).giris).toEqual({ baslik: 'Yaz formu', maddeler: ['Açıklama'], dugme: 'Devam' });
    expect(kayittanOnizleme({ ...TASLAK, headline: 'Keşif' }).giris?.baslik).toBe('Keşif');
  });

  it('KRİTİK: teşekkür düğmesi yalnız adres varsa (adres yoksa Meta düğmesiz kuruyor)', () => {
    expect(kayittanOnizleme(TASLAK).tesekkur).toEqual({ baslik: 'Teşekkürler!', metin: 'Arayacağız.', dugme: null, adres: null });
    expect(kayittanOnizleme({ ...TASLAK, thankYouCtaUrl: 'https://o.com' }).tesekkur).toMatchObject({ dugme: 'Siteyi ziyaret et', adres: 'https://o.com' });
  });

  it('sorular: standartlar otomatik dolu, özel soru seçenekleriyle; gizlilik ve onaylar taşınır', () => {
    const o = kayittanOnizleme(TASLAK);
    expect(o.sorular).toEqual([
      { tur: 'FULL_NAME', etiket: 'Ad soyad', otomatikDolu: true, secenekler: [] },
      { tur: 'PHONE', etiket: 'Telefon', otomatikDolu: true, secenekler: [] },
      { tur: 'CUSTOM', etiket: 'Bütçe?', otomatikDolu: false, secenekler: ['1-2', '2-5'] },
    ]);
    expect(o.gizlilik).toEqual({ adres: 'https://o.com/gizlilik', metin: 'Gizlilik Politikası' });
    expect(o.onaylar).toEqual([{ metin: 'KVKK onayı', zorunlu: true }]);
    expect(kayittanOnizleme({ ...TASLAK, privacyPolicyUrl: '  ' }).gizlilik).toBeNull();
  });
});

describe('rehber form akışı', () => {
  const kayit = (p: Partial<LeadFormRecord>) => ({ status: 'draft', externalFormId: null, error: null, ...p }) as LeadFormRecord;

  it('KRİTİK: yayından sonra yalnız YAYINDAKİ formun Meta kimliği seçilir; düşen yayın Meta’nın cümlesiyle', () => {
    expect(yayinSonrasiSecim(kayit({ status: 'published', externalFormId: '123456' }))).toEqual({ tur: 'sec', formId: '123456' });
    expect(yayinSonrasiSecim(kayit({ status: 'failed', error: 'OAuthException: (#200)' }))).toEqual({ tur: 'secilmedi', sebep: 'OAuthException: (#200)' });
    expect(yayinSonrasiSecim(kayit({ status: 'draft' })).tur).toBe('secilmedi');
    // Kimliği olan ama yayında OLMAYAN kayıt (yeni sürümü gelmiş) seçilmez: eski sürüme reklam bağlanırdı.
    expect(yayinSonrasiSecim(kayit({ status: 'superseded', externalFormId: '123456' })).tur).toBe('secilmedi');
    // Kimlik sayısal değilse seçilmez: derleyiciye UUID gitmesin.
    expect(yayinSonrasiSecim(kayit({ status: 'published', externalFormId: 'abc' })).tur).toBe('secilmedi');
  });

  it('KRİTİK: "Form oluştur" sayfa ve yayın yetkisi ister; yoksa NEDENİ söylenir', () => {
    expect(formOlusturmaDurumu({ sayfaId: 's', yayinIzni: true })).toEqual({ goster: true });
    expect(formOlusturmaDurumu({ sayfaId: null, yayinIzni: true })).toMatchObject({ goster: false, sebep: expect.stringMatching(/Facebook sayfasını seç/) });
    expect(formOlusturmaDurumu({ sayfaId: 's', yayinIzni: false })).toMatchObject({ goster: false, sebep: expect.stringMatching(/yayınlama yetkin yok/) });
  });

  it('gizlilik önerisi yalnız https adresten ve kaynağıyla; yoksa null (uydurulmuyor)', () => {
    expect(gizlilikOnerisi([{ id: '1', ad: 'Eski', gizlilikAdresi: 'http://o.com/k' }, { id: '2', ad: 'Teklif', gizlilikAdresi: 'https://o.com/kvkk' }])).toEqual({
      adres: 'https://o.com/kvkk',
      kaynak: '"Teklif" formundaki adres',
    });
    expect(gizlilikOnerisi([{ id: '1', ad: 'X', gizlilikAdresi: null }])).toBeNull();
  });

  it('yarım kalan formlar: yalnız SEÇİLİ sayfanın taslak/düşmüş formları, yeniden eskiye', () => {
    const l = [
      kayit({ id: 'a', socialProfileId: 'S', status: 'draft', createdAt: '2026-10-01' }),
      kayit({ id: 'b', socialProfileId: 'S', status: 'published', createdAt: '2026-10-02' }),
      kayit({ id: 'c', socialProfileId: 'S', status: 'failed', createdAt: '2026-10-03' }),
      kayit({ id: 'd', socialProfileId: 'X', status: 'draft', createdAt: '2026-10-04' }),
    ];
    expect(sayfaTaslaklari(l, 'S').map((k) => k.id)).toEqual(['c', 'a']);
    expect(sayfaTaslaklari(l, null)).toEqual([]);
  });
});

/*
 * KAYNAK TARAMALARI — yorumsuz kaynakta (kuralı anlatan yorum eşleşmesin).
 */
const yorumsuz = (yol: string) =>
  readFileSync(join(__dirname, '..', yol), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

function govde(kaynak: string, bas: string): string {
  const i = kaynak.indexOf(bas);
  if (i < 0) throw new Error(`${bas} bulunamadı: tarama boşa düşerdi`);
  // Gövde, parametre listesini kapatan parantezden sonraki İLK satır sonu
  // süslüsü: parametre nesnesi ({ b, ... }) gövde sanılmasın.
  const m = /\)(?::[^\n{]+)?(?: =>)? \{\n/.exec(kaynak.slice(i));
  if (!m) throw new Error(`${bas} gövdesi bulunamadı`);
  let derinlik = 0;
  for (let j = i + m.index + m[0].length - 2; j < kaynak.length; j++) {
    if (kaynak[j] === '{') derinlik++;
    else if (kaynak[j] === '}' && --derinlik === 0) return kaynak.slice(i, j + 1);
  }
  throw new Error(`${bas} gövdesi kapanmadı`);
}

describe('tek oluşturucu, tek önizleme (kaynak taraması)', () => {
  const REHBER = yorumsuz('components/rehber/adim-reklam.tsx');
  const SECICI = govde(REHBER, 'function FormSecici(');
  const OLUSTUR = govde(REHBER, 'function FormOlusturPenceresi(');
  const ONIZLE = govde(REHBER, 'function FormOnizlemePenceresi(');
  const BUILDER = yorumsuz('components/forms/form-builder.tsx');

  it('gövdeler gerçekten yakalandı', () => {
    expect(SECICI).toContain('form-sablonlari');
    expect(OLUSTUR).toContain('<FormBuilder');
    expect(ONIZLE).toContain('form-ayrintisi');
  });

  it('KRİTİK: rehber Marka Merkezi’nin oluşturucusunu kullanıyor, kendi form yazma çağrısı YOK', () => {
    expect(REHBER).toMatch(/import \{ FormBuilder \} from '@\/components\/forms\/form-builder'/);
    expect(OLUSTUR).toMatch(/gomulu=\{\{ varsayilanGizlilik: oneri, onYayinlandi: yayinlandi \}\}/);
    // Rehberde lead-forms'a YAZAN bir çağrı (POST/PUT/publish) ikinci oluşturucu demek.
    expect(REHBER).not.toMatch(/lead-forms[^`'"]*\/publish/);
    expect(REHBER).not.toMatch(/['"`]\/lead-forms['"`]\s*,\s*\{\s*method/);
    expect(REHBER).not.toContain('privacyPolicyUrl');
  });

  it('KRİTİK: önizleme TEK bileşen; oluşturucu ve rehber onu kullanıyor, oluşturucuda eski satır içi önizleme yok', () => {
    expect(BUILDER).toContain("import { FormOnizleme } from './form-onizleme'");
    expect(BUILDER).toMatch(/<FormOnizleme\s+onizleme=\{kayittanOnizleme\(/);
    // Eski satır içi önizlemenin imzaları: ikinci önizleme geri gelirse düşer.
    expect(BUILDER).not.toContain('>otomatik dolu<');
    expect(BUILDER).not.toContain('Kişinin göreceği form');
    expect(ONIZLE).toContain('<FormOnizleme');
  });

  it('KRİTİK: yayından sonra seçim saf karardan; gömülü oluşturucu yayını bildiriyor ve sayfayı yenilemiyor', () => {
    expect(SECICI).toMatch(/const k = yayinSonrasiSecim\(r\);\s*if \(k\.tur === 'sec'\) \{\s*yaz\(b, 'formSablonuId', k\.formId\)/);
    const yayinla = govde(BUILDER, 'async function publish(');
    expect(yayinla).toContain('gomulu?.onYayinlandi(res)');
    expect(govde(BUILDER, 'const yenile = () =>')).toContain('if (!gomulu) router.refresh()');
    // Tek yenileme noktası `yenile`: doğrudan router.refresh() rehberin yazılmamış değişikliklerini sıfırlardı.
    expect(BUILDER.match(/router\.refresh\(\)/g)).toHaveLength(1);
  });

  it('KRİTİK: hata yutulmuyor (.catch(() => ...) yok) — oluşturucu, önizleme, seçici', () => {
    for (const k of [BUILDER, SECICI, ONIZLE, yorumsuz('components/forms/form-onizleme.tsx')]) expect(k).not.toMatch(/\.catch\(\(\)\s*=>/);
  });

  it('boş listede "Form oluştur" BİRİNCİL eylem; yetki yoksa sebep yazılıyor', () => {
    const bos = SECICI.slice(SECICI.indexOf("hal.tur === 'bos' && ("), SECICI.indexOf("hal.tur === 'geldi' && ("));
    expect(bos).toContain('olusturDugmesi(true)');
    const i = SECICI.indexOf('const olusturDugmesi =');
    expect(i).toBeGreaterThan(-1);
    expect(SECICI.slice(i, SECICI.indexOf('return (', i))).toContain('olusturma.sebep');
  });

  it('rehber sayfası form yayın yetkisini bulk.publish’ten veriyor', () => {
    expect(yorumsuz('app/(dashboard)/reklam/page.tsx')).toContain("formYayinIzni={hasPermission(session, 'bulk.publish')}");
  });
});
