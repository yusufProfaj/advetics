import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { actPath } from './meta.provider';

/**
 * Reklam hesabı yolu — ÇİFT ÖNEK TUZAĞI.
 *
 * `ad_accounts.external_id` Meta'dan `act_` ÖNEKİYLE geliyor. Önek
 * körlemesine eklendiğinde `act_act_1602474151544739` çıkıyor ve Meta bunu
 * şöyle reddediyor:
 *
 *   "Object with ID 'act_act_...' does not exist, cannot be loaded due to
 *    missing permissions, or does not support this operation."
 *
 * MESAJ YETKİ SORUNU GİBİ OKUNUYOR. Bu projede `ads_management` onayı zaten
 * beklendiği için hata "demek ki izin gelmemiş" diye yorumlanmaya son derece
 * müsait — sebebi bulmak saatler alabilir.
 *
 * Tuzağa BİR KEZ düşülmüş ve koruma yalnızca okuma yoluna konmuştu; dört
 * yazma yolu korumasız kaldı ve `ads_management` olmadan hiç çalıştırılamadığı
 * için yıllarca görünmeyebilirdi.
 *
 * Bu dosya iki şeyi kilitliyor: yardımcının davranışı ve KAYNAK TARAMASI —
 * biri yeni bir yazma yolu ekleyip yine körlemesine önek koyarsa test düşer.
 */

const SOURCE = readFileSync(join(__dirname, 'meta.provider.ts'), 'utf8');

describe('actPath', () => {
  it('öneksiz kimliğe önek ekliyor', () => {
    expect(actPath('1602474151544739')).toBe('act_1602474151544739');
  });

  it('ÖNEKLİ kimliğe İKİNCİ KEZ eklemiyor', () => {
    expect(actPath('act_1602474151544739')).toBe('act_1602474151544739');
  });

  it('idempotent — iki kez uygulamak sonucu değiştirmiyor', () => {
    expect(actPath(actPath('1602474151544739'))).toBe('act_1602474151544739');
  });
});

describe('kaynak taraması', () => {
  it('KÖRLEMESİNE önek ekleyen başka yer YOK', () => {
    /**
     * `act_${...}` kalıbı yalnızca yardımcının kendi gövdesinde geçebilir.
     * Başka bir yerde geçmesi, korumanın atlandığı yeni bir yol demek.
     */
    const occurrences = SOURCE.split('\n')
      .map((line, i) => ({ line: line.trim(), no: i + 1 }))
      .filter((l) => /act_\$\{/.test(l.line));

    // Tek meşru geçiş: `actPath` içindeki dönüş satırı.
    expect(occurrences.map((o) => o.line)).toEqual([
      "return externalId.startsWith('act_') ? externalId : `act_${externalId}`;",
    ]);
  });

  it('hesap yolu kuran her yer actPath kullanıyor', () => {
    // Kampanya, ad set, reklam, kreatif ve görsel yükleme uçlarının hepsi
    // hesap kimliğiyle kuruluyor; hiçbiri elle önek koymamalı.
    const uses = SOURCE.match(/actPath\(/g) ?? [];
    // Tanım + okuma (2) + yazma yolları (4).
    expect(uses.length).toBeGreaterThanOrEqual(6);
  });
});

describe('kampanya oluşturmanın zorunlu alanları', () => {
  /**
   * Meta bu alanları eksik bırakılan isteği REDDEDİYOR ve hangi alanın eksik
   * olduğunu ancak canlı çağrıda öğreniyoruz — birim testi bir HTTP yanıtı
   * üretmiyor. Bu yüzden koruma kaynak taraması: kampanya kuran her yer aynı
   * zorunlu alanları taşımalı.
   *
   * `is_adset_budget_sharing_enabled` bunlardan biri ve canlıda öğrenildi:
   * kampanya seviyesinde bütçe kullanılmadığında Meta alanı zorunlu tutuyor
   * (subcode 4834011).
   */
  const campaignCalls = SOURCE.split('`${act}/campaigns`').length - 1;

  it('iki yerde kampanya kuruluyor — boost ve reklam oluşturucu', () => {
    expect(campaignCalls).toBe(2);
  });

  it('HER kampanya çağrısı bütçe paylaşımı alanını taşıyor', () => {
    const withField = SOURCE.split('is_adset_budget_sharing_enabled: ADSET_BUDGET_SHARING').length - 1;
    expect(withField).toBe(campaignCalls);
  });

  it('paylaşım KAPALI — tek ad set var ve bütçe takibi kaymamalı', () => {
    // `true` olsaydı Meta bütçenin %20'sini ad set'ler arasında taşıyabilir
    // ve panelde yazan dağılımla gerçek ayrışırdı.
    expect(SOURCE).toContain("const ADSET_BUDGET_SHARING = 'false';");
  });
});

describe('anlık form kreatife bağlanıyor, ad set\'e değil', () => {
  /**
   * Meta `promoted_object` içinde `leadgen_form_id` kabul etmiyor:
   * `(#100) Invalid keys "leadgen_form_id" were found in param
   * "promoted_object"`. Ad set yalnızca hangi SAYFA adına yayınlandığını
   * biliyor; form kreatife ait.
   *
   * Bu canlıda öğrenildi ve tekrar etmemesi için kaynak taranıyor.
   */
  it('promoted_object form kimliği TAŞIMIYOR', () => {
    // Yalnızca hatayı anlatan yorum satırında geçebilir.
    const codeLines = SOURCE.split('\n').filter(
      (l) => l.includes('leadgen_form_id') && !l.trim().startsWith('*'),
    );
    expect(codeLines).toEqual([]);
  });

  it('kreatif form kimliğini call_to_action içinde taşıyor', () => {
    expect(SOURCE).toContain('lead_gen_form_id: leadFormId');
  });

  it('FORM kampanyası tek görselli kreatife düşüyor', () => {
    /**
     * Çok görselli yolda (`asset_feed_spec`) form kimliğinin nereye yazılacağı
     * doğrulanmadı. Yanlış alana yazmak Meta'nın onu sessizce görmezden
     * gelmesi ve butonun hiçbir yere gitmemesi demek olabilirdi.
     */
    expect(SOURCE).toContain('if (req.images.length <= 1 || leadFormId) {');
  });
});

describe('teklif stratejisi açıkça gönderiliyor', () => {
  /**
   * Strateji söylenmezse Meta hesabın varsayılanına düşüyor. O varsayılan
   * tavanlı bir strateji ise istek reddediliyor ("Teklif Stratejisi İçin
   * Teklif Tutarı veya Teklif Sınırı Gerekiyor", subcode 2490487) — ama daha
   * kötüsü, reddedilmediği durumda kampanyanın NASIL teklif verdiği hesap
   * ayarına göre değişiyor ve aynı taslak iki müşteride farklı davranıyor.
   */
  it('reklam oluşturucu varsayılanı açıkça yazıyor', () => {
    expect(SOURCE).toContain(
      "adSetFields.bid_strategy = req.bidStrategy ?? 'LOWEST_COST_WITHOUT_CAP';",
    );
  });

  it('boost da açıkça yazıyor', () => {
    expect(SOURCE).toContain("bid_strategy: 'LOWEST_COST_WITHOUT_CAP',");
  });

  it('tavan tutarı YALNIZCA tavanlı stratejide gidiyor', () => {
    // `LOWEST_COST_WITHOUT_CAP` ile `bid_amount` göndermek Meta tarafından
    // reddediliyor: strateji tavan tanımıyor.
    expect(SOURCE).toContain("adSetFields.bid_strategy !== 'LOWEST_COST_WITHOUT_CAP' &&");
  });
});
