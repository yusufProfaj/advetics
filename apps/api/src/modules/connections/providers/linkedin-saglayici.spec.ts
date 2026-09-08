import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ LINKEDIN SAĞLAYICISI — ÖLÇÜLEN GERÇEKLER KİLİTLENİYOR ═══
 *
 * Buradaki her iddia 2026-09-08 ölçüm turunda CANLI olarak görüldü. Kaynak
 * taraması kullanılıyor çünkü sağlayıcı ağ çağrısı yapıyor ve bu depoda ağ
 * mock'layan bir altyapı yok; kilitlenmek istenen şey de zaten DAVRANIŞ değil
 * KARAR — hangi ucun, hangi sorgu adının, hangi pivotun seçildiği.
 */

const KAYNAK = readFileSync(join(__dirname, 'linkedin.provider.ts'), 'utf8');

/** Yorumsuz kaynak — iddia açıklamaya değil KODA çapalanmalı. */
const KOD = KAYNAK.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * Bir metodun gövdesi — süslü parantez sayarak.
 *
 * DİLİM TANIMDAN BAŞLIYOR, ÇAĞRIDAN DEĞİL. İlk yazışımda regex `private`
 * önekini hesaba katmıyordu ve `indexOf('tutar(')` yedeğine düşüyordu; o da
 * tanımı değil bir ÇAĞRI NOKTASINI (`this.tutar(...)`) buluyordu. Dilim
 * yanlış yerden başlayınca iddia yanlış gövdeyi sınıyor — bu depoda adı
 * konmuş tuzak ("sabit uzunluklu dilim komşuyu yakalıyor") ve mutasyon
 * olmadan fark edilmiyordu.
 *
 * Yedek `indexOf` KALDIRILDI: bulunamayan metot artık sessizce komşuya
 * kaymak yerine PATLIYOR.
 */
function govde(ad: string): string {
  // JS satır içi `(?m)` bayrağını DESTEKLEMİYOR — bayrak argüman olarak veriliyor.
  const m = new RegExp(
    `^\\s{2}(?:private\\s+|protected\\s+|public\\s+)?(?:async\\s+)?${ad}[\\s(<]`,
    'm',
  ).exec(KOD);
  const i = m ? m.index : -1;
  if (i < 0) throw new Error(`${ad} TANIMI bulunamadı — tarama boşa düştü.`);
  const bas = KOD.indexOf('{', KOD.indexOf(')', i));
  let d = 0;
  for (let j = bas; j < KOD.length; j++) {
    if (KOD[j] === '{') d++;
    else if (KOD[j] === '}') {
      d--;
      if (d === 0) return KOD.slice(bas, j);
    }
  }
  throw new Error(`${ad} gövdesi kapanmadı — tarama boşa düştü.`);
}

describe('tarama boşa düşmüyor', () => {
  it('kaynak ve metotlar bulunuyor', () => {
    expect(KAYNAK.length).toBeGreaterThan(20_000);
    for (const m of ['listAdAccounts', 'fetchStructure', 'fetchInsights']) {
      expect(govde(m).length, `${m} gövdesi boş`).toBeGreaterThan(200);
    }
  });
});

describe('SEVİYE EŞLEMESİ — iki yerde AYNI', () => {
  it('KRİTİK: pivot tablosu Campaign Group→campaign, Campaign→ad_group, Creative→ad', () => {
    /*
     * ÖLÇÜMLE KANITLANDI. LinkedIn Campaign `targetingCriteria` +
     * `dailyBudget` + `unitCost` taşıyor (canlı veri), Campaign Group ise
     * hedefleme ve bütçe TAŞIMIYOR. Yani LinkedIn Campaign, Meta'nın ad
     * set'i. İsme bakarak eşlemek dört seviyeyi üçe sıkıştırır, `ad` seviyesi
     * hiç dolmaz ve metrikler bağlanamaz.
     */
    const tablo = /LINKEDIN_PIVOT[^=]*=\s*\{([^}]*)\}/.exec(KOD)?.[1];
    expect(tablo, 'pivot tablosu bulunamadı — tarama boşa düştü').toBeDefined();
    expect(tablo).toMatch(/campaign:\s*'CAMPAIGN_GROUP'/);
    expect(tablo).toMatch(/ad_group:\s*'CAMPAIGN'/);
    expect(tablo).toMatch(/ad:\s*'CREATIVE'/);
  });

  it('KRİTİK: yapı taraması ile pivot AYRIŞMIYOR', () => {
    /*
     * İkisi ayrı yazılıp biri kaysaydı metrikler hiçbir satıra bağlanamaz ve
     * iş `succeeded` + `rows = 0` dönerdi. Yapı `adCampaignGroups`ı
     * `campaigns`e, `adCampaigns`ı `adGroups`a yazıyor; pivot da aynısını
     * söylemek zorunda.
     */
    const g = govde('fetchStructure');
    expect(g).toContain('adCampaignGroups');
    expect(g).toContain('adCampaigns');
    // Kampanya grubu `campaigns` dizisine, kampanya `adGroups` dizisine.
    expect(g).toMatch(/const campaigns: DiscoveredCampaign\[\]/);
    expect(g).toMatch(/const adGroups: DiscoveredAdGroup\[\]/);
    // Kampanyanın ÜSTÜ kampanya grubu.
    expect(g).toContain('campaignExternalId: this.sayisal(k.campaignGroup)');
  });
});

describe('ölçülen uç noktalar', () => {
  it('KRİTİK: hesap keşfi `adAccounts?q=search` — `adAccountUsers` DEĞİL', () => {
    /*
     * ÖLÇÜLDÜ: `adAccountUsers` DOKUZ satır döndürdü, ikisi (513078368,
     * 513079337) doğrudan çekilince 404 — silinmiş hesapların artık kalmış
     * ilişki satırları. `adAccounts?q=search` yedi gerçek hesap veriyor.
     * Yanlışını seçmek, her senkronizasyonda 404 üreten iki hayalet hesap
     * demekti.
     */
    const g = govde('listAdAccounts');
    expect(g).toContain('/adAccounts?q=search');
    expect(g, 'hayalet hesap üreten uç geri gelmiş').not.toContain('adAccountUsers');
  });

  it('KRİTİK: kreatif `q=criteria` — `q=search` 404 veriyor', () => {
    // Aynı API'de kampanya `q=search`, kreatif `q=criteria` istiyor. Ölçüldü:
    // `creatives?q=search` → HTTP 404 "No virtual resource found".
    const g = govde('fetchStructure');
    expect(g).toContain('/creatives?q=criteria');
    expect(g, 'kreatifte q=search geri gelmiş').not.toMatch(/creatives\?q=search/);
  });

  it('KRİTİK: metrikler `timeGranularity=DAILY`', () => {
    // Günlük metrik modelinin temeli. `ALL` tek toplam satır döndürür ve
    // geri düzeltmeyi imkânsız kılar.
    expect(govde('fetchInsights')).toContain('timeGranularity=DAILY');
  });

  it('KRİTİK: `fields` AÇIKÇA yazılıyor', () => {
    /*
     * Doküman: "otherwise only impressions and clicks are returned by
     * default". İstemezsek HARCAMA sessizce gelmez ve rapor sıfır gösterir.
     */
    const g = govde('fetchInsights');
    expect(g).toContain('costInLocalCurrency');
    expect(g).toContain('externalWebsiteConversions');
    expect(g).toContain('oneClickLeads');
  });

  it('KRİTİK: dönüşüm İKİ kaynaktan toplanıyor', () => {
    /*
     * LinkedIn'de site dönüşümü ve tek tıkla form AYRI alanlar. Yalnızca
     * birini saymak B2B raporunda dönüşümlerin yarısını kaybettirir.
     */
    expect(govde('fetchInsights')).toContain(
      '(e.externalWebsiteConversions ?? 0) + (e.oneClickLeads ?? 0)',
    );
  });
});

describe('ölçülen tuzaklar', () => {
  it('KRİTİK: sürüm başlığı SABİTTEN, takvimden DEĞİL', () => {
    /*
     * ÖLÇÜLDÜ: başlık yoksa HTTP 400, ölü sürümse 426 — ve `202512` gerçekten
     * 426 döndü. LinkedIn'in ARALIK SÜRÜMÜ YOK; takvim ayından sürüm üreten
     * bir kod HER ARALIK bütün istekleri düşürürdü.
     */
    expect(KOD).toContain('linkedin.apiVersion');
    expect(KOD, 'sürüm takvimden türetiliyor').not.toMatch(
      /getMonth\(\)|new Date\(\)[^;]*month|toISOString\(\)[^;]*slice/,
    );
  });

  it('KRİTİK: para `linkedinTutarMicros` ile — parseFloat YOK', () => {
    /*
     * ÖLÇÜLEN DEĞER: "539.700000000000192784" — ON SEKİZ ondalık.
     * `parseFloat(...) * 1e6` = 539700000.0000002 ve `BigInt()` bunu
     * REDDEDİYOR, yani kayan noktalı bir çözümleyici çalışma anında patlardı.
     */
    expect(KOD).toContain('linkedinTutarMicros');
    expect(KOD, 'kayan nokta ile para çevirisi geri gelmiş').not.toMatch(
      /parseFloat|Number\([^)]*costInLocalCurrency/,
    );
  });

  it('KRİTİK: kimlik SAYIYA indirgeniyor — kreatif URN, kampanya sayı', () => {
    /*
     * Aynı API'de iki konvansiyon: kampanya `id` SAYI, kreatif `id` TAM URN
     * (`urn:li:sponsoredCreative:915033233`). Ham yazmak `ad` satırlarını
     * kreatiflere bağlayan eşleştirmeyi sessizce bozardı.
     */
    expect(govde('sayisal')).toContain("lastIndexOf(':')");
    const g = govde('fetchStructure');
    expect(g).toContain('this.sayisal(c.id)');
  });

  it('KRİTİK: hesap saat dilimi UTC — ajansın yereli DEĞİL', () => {
    /*
     * LinkedIn hesap nesnesinde saat dilimi alanı YOK (ölçülen tam alan
     * listesinde geçmiyor) ve `adAnalytics` tarihleri UTC. Yerel saat yazmak
     * her günlük metriği saatlerce kaydırırdı.
     */
    expect(govde('listAdAccounts')).toContain("timezone: 'UTC'");
  });

  it('KRİTİK: tarih parçalama ORTAK fonksiyondan', () => {
    /*
     * `adAnalytics` SAYFALAMA DESTEKLEMİYOR ve 15.000 elemanla sınırlı; aşımda
     * ne olduğu belgelenmemiş, yani SESSİZ KESME ihtimali açık. İkinci bir
     * parçalayıcı yazmak bir günlük boşluk (eksik veri) ya da örtüşme (boşa
     * çağrı) demekti.
     */
    expect(KOD).toContain('istekPencereleri');
    expect(govde('fetchInsights')).toContain('istekPencereleri(request.level');
  });

  it('KRİTİK: 15.000 tavanına değen yanıt KISMİ işaretleniyor', () => {
    // Sessizce tam saymak, eksik veriyi "silinmiş" sandırırdı.
    expect(govde('fetchInsights')).toContain('15_000');
    expect(govde('fetchInsights')).toContain('complete = false');
  });

  it('KRİTİK: token doğrulaması introspection DEĞİL, gerçek çağrı', () => {
    /*
     * ÖLÇÜLDÜ: `introspectToken` bir REFRESH token'a da `active: true` dedi;
     * aynı token bearer olarak 401 aldı. Introspection ile doğrulamak
     * çalışmayan bir bağlantıyı sağlıklı gösterirdi.
     */
    expect(govde('verifyToken')).toContain('uyeKimligi');
    expect(KOD, 'introspection ile doğrulamaya dönülmüş').not.toContain('introspectToken');
  });

  it('KRİTİK: iptal REFRESH token\'ı da kapsıyor', () => {
    /*
     * Access 60 gün, refresh 365 gün (ölçüldü). Yalnızca access'i iptal etmek,
     * bir yıl boyunca yeni token üretebilen bir refresh'i ayakta bırakırdı —
     * "erişim durdu" beyanının tam tersi.
     */
    expect(govde('revokeToken')).toContain('tokens.refreshToken');
    expect(govde('revokeToken')).toContain('oauth/v2/revoke');
  });

  it('KRİTİK: `r_basicprofile` zorunlu scope listesinde', () => {
    /*
     * Bağlantının ADI `/rest/me`den geliyor ve o uç bu scope olmadan 403
     * ACCESS_DENIED veriyor (ölçüldü). Eksikse bağlantı adsız kaydedilir.
     */
    const m = /requiredScopes = \[([^\]]*)\]/.exec(KOD)?.[1];
    expect(m, 'requiredScopes bulunamadı — tarama boşa düştü').toBeDefined();
    expect(m).toContain('r_basicprofile');
    expect(m).toContain('r_ads');
    expect(m).toContain('r_ads_reporting');
  });
});

describe('sessiz hata üretmeyen dallar', () => {
  it('KRİTİK: grupsuz kampanya ve kampanyasız kreatif NOT ile bildiriliyor', () => {
    /*
     * Bağı olmayan satır yazılamıyor ve atlanıyor — ama SESSİZCE değil.
     * Sessizce atmak, o kampanyanın harcamasını rapordan düşürmek olurdu.
     */
    const g = govde('fetchStructure');
    expect(g).toContain('notlar.push');
    expect(g).toContain('notes: notlar');
  });

  it('KRİTİK: eksik bütçe `undefined` — 0 DEĞİL', () => {
    /*
     * Sıfır yazmak bütçe bekçisine "harcanabilir tavan bitti" demek olurdu.
     * `budgetMode: 'none'` ile "bu seviyede bütçe kavramı yok" ayrı.
     */
    expect(govde('tutar')).toContain('return undefined');
    expect(govde('fetchStructure')).toContain("budgetMode: 'none'");
  });

  it('KRİTİK: ROAS geliri UYDURULMUYOR', () => {
    /*
     * `conversionValueInLocalCurrency` ölçümde İSTENDİ AMA GELMEDİ — yedi alan
     * istendi, altı döndü, hata yok. Uydurulmuş bir gelir yanlış bir ROAS'tan
     * beter olurdu.
     */
    expect(govde('fetchInsights')).toContain('conversionValueMicros: 0n');
  });
});
