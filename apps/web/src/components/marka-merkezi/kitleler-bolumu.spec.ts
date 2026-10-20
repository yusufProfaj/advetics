import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { markaMerkeziVeriSozlugu } from '@/dil/sozlukler/marka-merkezi-veri';
import { kitleSablonuInputSchema } from '@advetics/shared';
import { kitleGovdesi } from './kitleler-bolumu';

const WS = '11111111-1111-4111-8111-111111111111';
const ILGI = { id: '6003', name: 'Gayrimenkul' };
const GOOGLE = { ilgiler: [{ id: '80432', ad: 'Real Estate', tur: 'in_market' as const }], kelimeler: ['izmir daire'] };
const OZEL = { id: '238', name: 'Site ziyaretçileri', tip: 'ozel' as const, mod: 'haric' as const, hesapId: WS, hesapAdi: 'Hesap' };
const FORM = {
  platform: 'meta' as 'meta' | 'google',
  name: 'Kitle',
  locations: [],
  ageMin: 18,
  ageMax: 65,
  genders: 'all' as const,
  interests: [],
  ozelKitleler: [],
  google: { ilgiler: [], kelimeler: [] },
};

/** Marka Merkezi → Kitleler. Render altyapısı yok; YORUMSUZ kaynak taranıyor. */
const K = readFileSync(resolve(__dirname, 'kitleler-bolumu.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const SECICI = readFileSync(resolve(__dirname, '../autoboost/hedefleme-secici.tsx'), 'utf8');

describe('Kitleler bölümü', () => {
  it('KRİTİK: kayıt sunucuyla AYNI şemadan geçmeden gönderilmiyor', () => {
    const bas = K.indexOf('async function kaydet(');
    const kontrol = K.indexOf('kitleSablonuInputSchema.safeParse(govde)', bas);
    const istek = K.indexOf("'/audience-templates'", bas);
    expect(kontrol).toBeGreaterThan(bas);
    expect(istek).toBeGreaterThan(kontrol);
  });

  it('dört hâl ayrı: yükleniyor, hata, boş (sebebiyle), liste', () => {
    expect(K).toContain("durum.tur === 'yukleniyor'");
    expect(K).toContain("durum.tur === 'hata'");
    // Boş liste NEDENİNİ söylüyor: kitle yoksa reklamın kime gideceği.
    expect(K).toContain('<BosDurum');
    expect(K).toContain('{m.bosNedenOnce}');
    expect(K).toContain('{m.bosNedenVurgu}');
    expect(markaMerkeziVeriSozlugu.tr.kitleler.bosNedenOnce).toContain('Kitle olmadan reklam');
    expect(markaMerkeziVeriSozlugu.tr.kitleler.bosNedenVurgu).toBe('Türkiye geneli, 18 yaş ve üzeri');
    expect(K).not.toMatch(/\.catch\(\(\) => set/);
  });

  it('konum araması İKİNCİ KEZ yazılmadı — mevcut seçici kayıtlı kitle olmadan kullanılıyor', () => {
    expect(K).toContain('<HedeflemeSecici');
    expect(K).toContain('kayitliKitle={false}');
    expect(K).not.toContain('/connections/targeting/locations');
    expect(SECICI).toContain('if (!hesap || !kayitliKitle) return;');
  });

  it('silme iki adımlı; ekran "yalnızca Meta" kısıtını söylüyor', () => {
    // 2026-10-14: ⋯ menüsü (1. adım) + onay penceresi (2. adım); silme
    // çağrısı YALNIZ pencerenin tehlike düğmesinde.
    expect(K).toContain('baslik={m.silBaslik}');
    expect(markaMerkeziVeriSozlugu.tr.kitleler.silBaslik).toBe('Kitle silinsin mi?');
    const pencere = K.slice(K.indexOf('baslik={m.silBaslik}'));
    expect(pencere.slice(0, pencere.indexOf('/>'))).toContain("method: 'DELETE'");
    expect(K.match(/method: 'DELETE'/g)?.length).toBe(1);
    expect(K).toContain('onClick={() => setSilinecek(k.id)}');
    // 2026-10-16: kısıt değişti, Google karşılığı da tutuluyor; cümle sözlükte.
    expect(K).toContain('{dk.kullanimNotu}');
  });

  it('Tarif et önerisi FORMA dolduruluyor, KAYDEDİLMİYOR; bulunamayan ve kurulamayan yazıyor', () => {
    const bas = K.indexOf('async function oner(');
    const govde = K.slice(bas, K.indexOf('return (', bas));
    expect(govde).toContain("'/audience-templates/ai-oneri'");
    expect(govde).toContain('uygula({');
    expect(govde).not.toContain("'/audience-templates',");
    expect(K).toContain('oneri.eslesmeyen.length > 0');
    expect(K).toContain('oneri.uygulanamayan.length > 0');
  });

  it('ilgi alanları kaydedilen gövdede (yalnız Meta kitlesinde)', () => {
    const bas = K.indexOf('async function kaydet(');
    expect(K.slice(bas, K.indexOf('kitleSablonuInputSchema.safeParse', bas))).toContain('const govde = kitleGovdesi(clientId, form);');
    expect(kitleGovdesi(WS, { ...FORM, interests: [ILGI] }).interests).toEqual([ILGI]);
  });

  it('özel kitle seçicisi aynı hesap hook\'unu kullanıyor, hazır olmayan kitle seçilemiyor', () => {
    const O = readFileSync(resolve(__dirname, 'ozel-kitle-secici.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(O).toContain('useIzlenenMetaHesabi(clientId)');
    expect(O).toContain('const kapali = o.hazir === false;');
    expect(O).toContain('disabled={kapali || dolu}');
    expect(O).toContain('hesapId: hesap.id, hesapAdi: hesap.name');
    expect(O).not.toMatch(/\.catch\(\(\) => set/);
    expect(K).toContain("ozelKitleler: f.platform === 'meta' ? f.ozelKitleler : []");
  });
});

describe('Google karşılığı (2026-10-16)', () => {
  it('KRİTİK: form Google bölümünü çiziyor, kayıt ve öneri onu taşıyor', () => {
    expect(K).toContain('<GoogleKarsiligi google={f.google} degis={(g) => degis({ google: g })} />');
    expect(K).toContain("google: f.platform === 'google' ? f.google : { ilgiler: [], kelimeler: [] },");
    expect(K).toContain('google: { ilgiler: o.google.ilgiler.map((g) => ({ id: g.id, ad: g.ad, tur: g.tur })), kelimeler: o.google.kelimeler },');
    // Okunamayan Google karşılığı NEDENİYLE yazıyor (boş liste ile ayrı).
    expect(K).toContain('{dk.googleOkunamadi}: {oneri.google.hata}');
  });

  it('Reklam Yöneticisi’nden gelen "Hedef kitle" yeni kitle formunu açık getiriyor', () => {
    expect(K).toContain('if (yeniAc && !yeniAcildi && yazabilir && durum.tur === \'hazir\')');
  });
});

describe('kitlenin platformu (2026-10-20)', () => {
  it('KRİTİK: gövde YALNIZ seçili platformun alanlarını taşıyor ve sunucu şemasından geçiyor', () => {
    // Formda öbür platformdan kalmış değer olsa da (platform değiştirildi) gönderilmiyor.
    const dolu = { ...FORM, interests: [ILGI], ozelKitleler: [OZEL], google: GOOGLE };
    const meta = kitleGovdesi(WS, { ...dolu, platform: 'meta' });
    expect(meta).toMatchObject({ platform: 'meta', interests: [ILGI], ozelKitleler: [OZEL], google: { ilgiler: [], kelimeler: [] } });
    const google = kitleGovdesi(WS, { ...dolu, platform: 'google' });
    expect(google).toMatchObject({ platform: 'google', interests: [], ozelKitleler: [], google: GOOGLE });
    expect(kitleSablonuInputSchema.safeParse(meta).success).toBe(true);
    expect(kitleSablonuInputSchema.safeParse(google).success).toBe(true);
  });

  it('platform değişince öbür platformun alanları boşalıyor; düzenlemede platform seçici yok', () => {
    expect(K).toContain("degis({ platform: pl, interests: [], ozelKitleler: [], google: { ilgiler: [], kelimeler: [] } })");
    expect(K).toMatch(/f\.id \? \(\s*<PlatformEtiketi platform=\{f\.platform\} \/>/);
  });

  it('KRİTİK: liste platform sütunu ve sayılı süzgeç taşıyor; süzülünce boş liste NEDENİYLE', () => {
    expect(K).toContain("{ anahtar: 'platform', baslik: dk.platform");
    expect(K).toContain("tumu.filter((k) => k.platform === suzgec)");
    expect(K).toContain('baslik={dk.suzgecBos(PLATFORM_ADI[suzgec])}');
    expect(K).toContain('satirlar={gorunen}');
    expect(K).toContain('<SayfalamaCubugu bas={1} son={gorunen.length} toplam={gorunen.length} />');
  });
});
