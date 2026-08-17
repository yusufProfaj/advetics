import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decideCampaignReuse } from './meta.provider';

/**
 * VAR OLAN KAMPANYANIN ALTINA GÖNDERİ EKLEME — K21.
 *
 * İstenen kurgu: ilk gönderi için kampanya oluşsun, sonraki gönderiler AYNI
 * kampanyanın altına kendi ad set'i ve reklamıyla eklenebilsin.
 *
 * BU DOSYADAKİ TESTLERİN TAMAMI TEK BİR SORUYA BAKIYOR: kampanya seviyesindeki
 * ayarlar sonradan DEĞİŞTİRİLEMİYOR, dolayısıyla yeniden kullanılan bir
 * kampanya altına eklenen her gönderiye kendi ayarlarını dayatıyor. Dördü de
 * sessiz hataya açık ve biri para/politika riski taşıyor.
 */

const KAMPANYA = {
  id: '120210000000000001',
  objective: 'OUTCOME_ENGAGEMENT',
  effective_status: 'ACTIVE',
  special_ad_categories: [] as string[],
  account_id: '1602474151544739',
};

const ISTEK = {
  objectiveWanted: 'OUTCOME_ENGAGEMENT',
  categoriesWanted: [] as string[],
  adAccountWanted: '1602474151544739',
};

describe('decideCampaignReuse', () => {
  it('her şey uyuşuyorsa geçiyor', () => {
    expect(decideCampaignReuse({ ...ISTEK, campaign: KAMPANYA })).toEqual({ ok: true });
  });

  it('KRİTİK: AMACI farklı kampanya reddediliyor', () => {
    /*
     * `POST_ENGAGEMENT` optimizasyonu ve `ON_POST` hedefi yalnızca
     * OUTCOME_ENGAGEMENT altında geçerli. Trafik kampanyasına eklemek ya hata
     * ya da Meta'nın kabul edip başka bir şey yapması — ikincisi para harcayan
     * ve hiçbir yerde görünmeyen tür.
     */
    const k = decideCampaignReuse({
      ...ISTEK,
      campaign: { ...KAMPANYA, objective: 'OUTCOME_TRAFFIC' },
    });
    expect(k.ok).toBe(false);
    expect(!k.ok && k.message).toMatch(/amacı/);
    // Mesaj ÇÖZÜMÜ de söylüyor: kullanıcı ne yapacağını bilmeli.
    expect(!k.ok && k.message).toMatch(/yeni bir kampanya/);
  });

  it('KRİTİK: ÖZEL REKLAM KATEGORİSİ uyuşmazlığı reddediliyor', () => {
    /*
     * LİSTEDEKİ EN PAHALI HATA. Beyan kampanyada ve değiştirilemiyor;
     * müşterinin beyanı sonradan "konut" olduysa eski kampanyaya eklenen
     * reklam BEYANSIZ yayınlanır. Cezası kampanya seviyesinde değil HESAP
     * seviyesinde — ajansın o hesaptaki bütün kampanyaları riske giriyor.
     */
    const k = decideCampaignReuse({
      ...ISTEK,
      categoriesWanted: ['HOUSING'],
      campaign: { ...KAMPANYA, special_ad_categories: [] },
    });
    expect(k.ok).toBe(false);
    expect(!k.ok && k.message).toMatch(/hesap\s+seviyesinde/);
  });

  it('KRİTİK: kampanyada beyan VAR, müşteride YOK — bu da reddediliyor', () => {
    // Ters yön de yanlış: konut beyanlı kampanya yaş/cinsiyet daraltmasını
    // kabul etmiyor ve normal bir gönderi orada beklenmedik şekilde kısıtlanır.
    const k = decideCampaignReuse({
      ...ISTEK,
      categoriesWanted: [],
      campaign: { ...KAMPANYA, special_ad_categories: ['HOUSING'] },
    });
    expect(k.ok).toBe(false);
  });

  it('kategori karşılaştırması SIRAYA DUYARLI DEĞİL', () => {
    // Meta sırayı korumuyor. Sıraya duyarlı bir kontrol aynı beyanı "farklı"
    // sayıp çalışan bir yolu kapatırdı.
    expect(
      decideCampaignReuse({
        ...ISTEK,
        categoriesWanted: ['CREDIT', 'HOUSING'],
        campaign: { ...KAMPANYA, special_ad_categories: ['HOUSING', 'CREDIT'] },
      }),
    ).toEqual({ ok: true });
  });

  it('KRİTİK: BAŞKA REKLAM HESABINDAKİ kampanya reddediliyor', () => {
    // Kampanya tek bir hesapta yaşıyor ve hesaplar arasında taşınamıyor.
    // Sayfanın faturalandırma hesabı değiştiyse para başka müşterinin
    // hesabından çıkardı.
    const k = decideCampaignReuse({
      ...ISTEK,
      campaign: { ...KAMPANYA, account_id: '9999999999' },
    });
    expect(k.ok).toBe(false);
    expect(!k.ok && k.message).toMatch(/başka bir reklam hesabında/);
  });

  it('KRİTİK: `act_` öneki karşılaştırmayı BOZMUYOR', () => {
    /*
     * Meta `account_id`'yi öneksiz döndürüyor, bizim kaydımızda önekli
     * duruyor. Çıplak karşılaştırma her seferinde uyuşmazlık verir ve özellik
     * HİÇ çalışmazdı — hata mesajı da "başka hesap" diyeceği için sebebi
     * aranırken yanlış yere bakılırdı.
     */
    expect(
      decideCampaignReuse({
        ...ISTEK,
        adAccountWanted: 'act_1602474151544739',
        campaign: { ...KAMPANYA, account_id: '1602474151544739' },
      }),
    ).toEqual({ ok: true });
  });

  it('KRİTİK: DURAKLATILMIŞ kampanya reddediliyor', () => {
    /*
     * Bu projenin baş belası olan tür: duraklatılmış kampanyanın altındaki
     * yeni ad set HİÇ HARCAMIYOR, panelde boost "yayında" görünüyor ve hiçbir
     * hata yazılmıyor.
     */
    const k = decideCampaignReuse({
      ...ISTEK,
      campaign: { ...KAMPANYA, effective_status: 'PAUSED' },
    });
    expect(k.ok).toBe(false);
    expect(!k.ok && k.message).toMatch(/yayında değil/);
    expect(!k.ok && k.message).toMatch(/hiç harcamıyor/i);
  });

  it('KRİTİK: durum HİÇ okunamadıysa da reddediliyor', () => {
    // Bilinmeyen durumu "yayında" saymak, harcamayan bir boost'u yayında
    // göstermek olurdu. Eksik bilgi geçiş sebebi değil.
    const k = decideCampaignReuse({
      ...ISTEK,
      campaign: { id: KAMPANYA.id, objective: KAMPANYA.objective },
    });
    expect(k.ok).toBe(false);
    expect(!k.ok && k.message).toMatch(/bilinmiyor/);
  });

  it('`effective_status` YOKSA `status` kullanılıyor', () => {
    // İkisi farklı şeyler: `status` kampanyanın kendi durumu, `effective_status`
    // üst seviyelerin etkisini de içeriyor. Tercih `effective_status` ama
    // dönmediğinde elde olanla karar vermek, hiç karar vermemekten iyi.
    expect(
      decideCampaignReuse({
        ...ISTEK,
        campaign: {
          id: KAMPANYA.id,
          objective: KAMPANYA.objective,
          status: 'ACTIVE',
          special_ad_categories: [],
          account_id: KAMPANYA.account_id,
        },
      }),
    ).toEqual({ ok: true });
  });

  it('KRİTİK: sıra — kategori uyuşmazlığı DURUM kontrolünden ÖNCE', () => {
    /*
     * Hem beyanı uyuşmayan hem duraklatılmış bir kampanyada kullanıcıya
     * söylenecek şey politika riski, "yayına al" değil. "Yayına al" mesajını
     * görüp kampanyayı açan kullanıcı, beyansız reklam yayınlamaya bir adım
     * daha yaklaşırdı.
     */
    const k = decideCampaignReuse({
      ...ISTEK,
      categoriesWanted: ['HOUSING'],
      campaign: { ...KAMPANYA, special_ad_categories: [], effective_status: 'PAUSED' },
    });
    expect(k.ok).toBe(false);
    expect(!k.ok && k.message).toMatch(/beyan/);
  });
});

/**
 * GERİ ALMA — bu özelliğin TEK GERİ DÖNÜLEMEZ hatası.
 *
 * `createBoost` hata durumunda oluşturduğu her varlığı siliyor. Paylaşılan bir
 * kampanya o listeye girerse, BAŞARISIZ bir ikinci boost BİRİNCİ boost'un
 * yayındaki reklamını siler — harcanmış para geri gelmez ve müşterinin
 * kampanyası sessizce kaybolur.
 *
 * Birim testiyle yakalanamıyor (gerçek HTTP çağrısı gerekirdi), o yüzden
 * kaynak taraması: proje bu deseni canlıda öğrenilen ve testle
 * yakalanamayan kurallar için kullanıyor.
 */
describe('geri alma — paylaşılan kampanya SİLİNEMEZ', () => {
  const SOURCE = readFileSync(join(__dirname, 'meta.provider.ts'), 'utf8');

  const GOVDE = (() => {
    const imza = 'async createBoost(ctx: FetchContext, request: BoostRequest)';
    const bas = SOURCE.indexOf(imza);
    if (bas < 0) throw new Error('createBoost bulunamadı — tarama boşa düşer');
    const i = SOURCE.indexOf('{', bas);
    let derinlik = 0;
    for (let j = i; j < SOURCE.length; j++) {
      if (SOURCE[j] === '{') derinlik++;
      else if (SOURCE[j] === '}') {
        derinlik--;
        if (derinlik === 0) return SOURCE.slice(i, j + 1);
      }
    }
    throw new Error('createBoost gövdesi kapanmadı');
  })();

  it('tarama BOŞA DÜŞMÜYOR', () => {
    expect(GOVDE.length).toBeGreaterThan(1200);
    expect(GOVDE).toContain('created.reverse()');
    expect(GOVDE).toContain('assertReusableCampaign');
  });

  it('KRİTİK: `createBoost` içinde kampanya `created` listesine EKLENMİYOR', () => {
    /*
     * Ekleme TEK YERDE — `createBoostCampaign` metodunda — ve o metot yalnızca
     * YENİ kampanya açan dalda çağrılıyor. `createBoost` gövdesinde
     * `created.push({ ... 'kampanya' })` görmek, var olan kampanyanın da o
     * listeye girebileceği bir yol açıldığı anlamına gelir.
     */
    expect(GOVDE).not.toMatch(/created\.push\([^)]*kampanya/);
  });

  it('KRİTİK: var olan kampanya yolu `created`a HİÇ dokunmuyor', () => {
    /*
     * `assertReusableCampaign` çağrısının bulunduğu satırda `created` geçmiyor
     * ve metodun kendisi `created` parametresi ALMIYOR — tip imzası bunu
     * zorluyor. Bu test imzanın değişmesini yakalıyor.
     */
    const imza = SOURCE.slice(
      SOURCE.indexOf('private async assertReusableCampaign('),
      SOURCE.indexOf('): Promise<string> {', SOURCE.indexOf('private async assertReusableCampaign(')),
    );
    expect(imza.length).toBeGreaterThan(40);
    expect(imza).not.toContain('created');
  });

  it('KRİTİK: var olan kampanyanın DURUMU değiştirilmiyor', () => {
    /*
     * Yeni kampanya PAUSED açılıp yayına alınıyor. Var olan kampanya için o
     * çağrı yapılmıyor: kullanıcı kampanyayı bilerek duraklatmış olabilir ve
     * paylaşılan bir nesneyi sessizce yayına almak onun kararını geri almak
     * olurdu. Çağrı `mode === 'new'` koşulunun içinde.
     */
    const i = GOVDE.indexOf("status: 'ACTIVE' }");
    expect(i).toBeGreaterThan(0);
    // Çağrıdan hemen önceki blokta yeni-kampanya koşulu olmak zorunda.
    const once = GOVDE.slice(Math.max(0, i - 400), i);
    expect(once).toMatch(/mode === 'new'/);
  });
});
