import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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
    expect(K).toContain('Kitle olmadan reklam');
    expect(K).toContain('Türkiye geneli, 18 yaş ve üzeri');
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
    expect(K).toContain('baslik="Kitle silinsin mi?"');
    const pencere = K.slice(K.indexOf('baslik="Kitle silinsin mi?"'));
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

  it('ilgi alanları kaydedilen gövdede', () => {
    const bas = K.indexOf('async function kaydet(');
    expect(K.slice(bas, K.indexOf('kitleSablonuInputSchema.safeParse', bas))).toContain('interests: form.interests');
  });

  it('özel kitle seçicisi aynı hesap hook\'unu kullanıyor, hazır olmayan kitle seçilemiyor', () => {
    const O = readFileSync(resolve(__dirname, 'ozel-kitle-secici.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(O).toContain('useIzlenenMetaHesabi(clientId)');
    expect(O).toContain('const kapali = o.hazir === false;');
    expect(O).toContain('disabled={kapali || dolu}');
    expect(O).toContain('hesapId: hesap.id, hesapAdi: hesap.name');
    expect(O).not.toMatch(/\.catch\(\(\) => set/);
    expect(K).toContain('ozelKitleler: form.ozelKitleler');
  });
});

describe('Google karşılığı (2026-10-16)', () => {
  it('KRİTİK: form Google bölümünü çiziyor, kayıt ve öneri onu taşıyor', () => {
    expect(K).toContain('<GoogleKarsiligi google={f.google} degis={(g) => degis({ google: g })} />');
    expect(K).toContain('google: form.google,');
    expect(K).toContain('google: { ilgiler: o.google.ilgiler.map((g) => ({ id: g.id, ad: g.ad, tur: g.tur })), kelimeler: o.google.kelimeler },');
    // Okunamayan Google karşılığı NEDENİYLE yazıyor (boş liste ile ayrı).
    expect(K).toContain('{dk.googleOkunamadi}: {oneri.google.hata}');
  });

  it('Reklam Yöneticisi’nden gelen "Hedef kitle" yeni kitle formunu açık getiriyor', () => {
    expect(K).toContain('if (yeniAc && !yeniAcildi && yazabilir && durum.tur === \'hazir\')');
  });
});
