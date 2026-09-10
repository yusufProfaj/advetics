import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { advantageIsaretiyle, metaTargetingFrom } from './meta-targeting';

/**
 * ═══ ADVANTAGE HEDEF KİTLESİ İŞARETİ ═══
 *
 * CANLIDA ÖĞRENİLDİ. Meta ad set oluşturmayı reddetti:
 *
 *   "Advantage Hedef Kitlesi İşareti Gerekiyor · … targeting_automation
 *    alanında advantage_audience işaretini 1 veya 0 olarak ayarlayarak
 *    yapılabilir." (subcode 1870227)
 *
 * AMAÇLA İLGİSİ YOK: etkileşim, erişim ya da video görüntüleme seçmek
 * sonucu değiştirmiyor — istek ad set seviyesinde bu işaretin AÇIKÇA
 * yazılmasını istiyor. `optimization_goal` ile karıştırmak, teşhisi
 * saatlerce yanlış yere götürürdü.
 *
 * CLAUDE.md: "PLATFORMUN VARSAYILANINA GÜVENME — bir alanı göndermemek,
 * kararı hesabın ayarına bırakmak demek."
 */

describe('advantageIsaretiyle', () => {
  it('KRİTİK: işaret 0 olarak EKLENİYOR', () => {
    /*
     * `1` Meta'ya "seçtiğim kitlenin DIŞINA da çık" demek. Kullanıcı şehri
     * ve yaş aralığını açıkça seçiyor; genişletmeye izin vermek, panelde
     * "İzmir, 26-65" yazarken paranın başka yere gitmesi olurdu.
     */
    const t = advantageIsaretiyle({ geo_locations: { countries: ['TR'] } });
    expect(t.targeting_automation).toEqual({ advantage_audience: 0 });
  });

  it('KRİTİK: VAR OLAN değer EZİLMİYOR', () => {
    /*
     * Kayıtlı kitle seçildiğinde hedefleme Meta'dan olduğu gibi geliyor ve
     * kendi işaretini taşıyabiliyor. Ezmek, Ads Manager'da kurulmuş bir
     * kararı panelin sessizce geri alması demekti.
     */
    const t = advantageIsaretiyle({
      geo_locations: { countries: ['TR'] },
      targeting_automation: { advantage_audience: 1 },
    });
    expect(t.targeting_automation).toEqual({ advantage_audience: 1 });
  });

  it('targeting_automation içindeki DİĞER alanlar korunuyor', () => {
    const t = advantageIsaretiyle({
      targeting_automation: { some_other_flag: 1 },
    });
    expect(t.targeting_automation).toEqual({ some_other_flag: 1, advantage_audience: 0 });
  });

  it('BOZUK `targeting_automation` değeri PATLATMIYOR', () => {
    // Meta'dan gelen kayıtlı kitle nesnesi denetimsiz; dizi ya da null
    // geldiğinde çökmek, yayını hiç denememek olurdu.
    expect(advantageIsaretiyle({ targeting_automation: null }).targeting_automation).toEqual({
      advantage_audience: 0,
    });
    expect(advantageIsaretiyle({ targeting_automation: [1] }).targeting_automation).toEqual({
      advantage_audience: 0,
    });
  });

  it('HEDEFLEMENİN GERİ KALANINA dokunmuyor', () => {
    const temel = metaTargetingFrom({
      locations: [{ key: '3684', type: 'city' }],
      ageMin: 26,
      ageMax: 65,
      genders: 'all',
    });
    const t = advantageIsaretiyle(temel);
    expect(t.geo_locations).toEqual({ cities: [{ key: '3684' }] });
    expect(t.age_min).toBe(26);
    // 65 = "65 ve üzeri": `age_max` gönderilmiyor ve bu kural KORUNUYOR.
    expect(t.age_max).toBeUndefined();
  });
});

describe('sağlayıcı işareti GERÇEKTEN gönderiyor', () => {
  const KAYNAK = readFileSync(
    resolve(__dirname, '..', 'connections', 'providers', 'meta.provider.ts'),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '');

  it('BOŞA DÜŞME BEKÇİSİ: kaynak okundu', () => {
    expect(KAYNAK).toContain('buildBoostAdSetParams');
  });

  it('KRİTİK: BOOST ad set’i işareti taşıyor', () => {
    expect(KAYNAK).toContain(
      'targeting: JSON.stringify(advantageIsaretiyle({ ...targeting, ...yerlesim }))',
    );
  });

  it('KRİTİK: REKLAM OLUŞTURUCU ad set’i de işareti taşıyor', () => {
    /*
     * İki yol AYNI uca yazıyor. Yalnızca birine eklemek, diğerinin ilk
     * gerçek çağrıda aynı hatayla düşmesi ve o hatayı ikinci kez bulmak
     * zorunda kalmamız demekti.
     */
    expect(KAYNAK).toContain(
      'targeting: JSON.stringify(advantageIsaretiyle({ ...req.targeting, ...req.placements }))',
    );
  });

  it('KRİTİK: İŞARETİ ÜRETEN İKİNCİ BİR YER YOK', () => {
    /*
     * `meta-targeting.ts` bu depoda "hedefleme nesnesini üreten TEK yer"
     * olarak duruyor ve dosyanın var olma sebebi bu. Sağlayıcının kendi
     * kopyasını yazması, `geo_locations` ile bir kez yaşanan ayrışmanın
     * tekrarı olurdu.
     */
    expect(KAYNAK).not.toContain('advantage_audience');
  });
});
