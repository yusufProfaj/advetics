import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  autoBoostDecisionSchema,
  autoBoostQueueOverrideSchema,
  type AutoBoostPresetSettings,
  type AutoBoostQueueOverride,
} from '@advetics/shared';
import {
  butceKipi,
  butceyiCoz,
  hedeflemeyiCoz,
  kartPlatformu,
  toMicros,
} from './kart-ozellestirme';

/**
 * ═══ KART BAZINDA ÖZELLEŞTİRME ═══
 *
 * Kullanıcının isteği: "sadece o gönderi için kaç gün, toplamda kaç TL,
 * hangi hedef kitle ve şehir". Bu katman o isteği ÖN AYARIN ÜSTÜNE
 * bindiriyor ve verdiği her karar sessizce yanlış olabilecek türden:
 *
 *   · VERİLMEYEN ALAN ÖN AYARDAN GELMELİ — yarısı boş bir nesne, boş
 *     bırakılan alanları sıfırlamak anlamına gelmiyor.
 *   · KİP DEĞİŞİNCE DİĞER KOLON NULL'LANMALI — iki bütçe kolonu birden
 *     dolu kalırsa `boosts_budget_chk` ham bir kısıt hatası veriyor.
 *   · KAYITLI KİTLE SEÇİLİYSE ŞEHİR/YAŞ TAŞINMAMALI — Meta ikisini
 *     BİRLEŞİM olarak uyguluyor ve HİÇBİR HATA VERMİYOR; yanlış cevap
 *     sessizce yanlış kitleye para harcıyor.
 *
 * Bu kod para harcıyor; kararlar çalıştırılarak sınanıyor.
 */

const META_ON_AYAR: AutoBoostPresetSettings = {
  platform: 'meta',
  goal: 'engagement',
  savedAudienceId: null,
  locations: [{ key: '1234', type: 'city' }],
  ageMin: 25,
  ageMax: 45,
  genders: 'female',
};

const ON_AYAR_BUTCE = {
  budgetMode: 'daily' as const,
  dailyBudgetMicros: 100_000_000n,
  totalBudgetMicros: null,
  durationDays: 5,
};

describe('toMicros', () => {
  it('virgüllü ve noktalı yazımı aynı sayıya çeviriyor', () => {
    expect(toMicros('300,50')).toBe(300_500_000n);
    expect(toMicros('300.50')).toBe(300_500_000n);
  });

  it('KRİTİK: kesirli çarpımda PATLAMIYOR — önce yuvarlıyor', () => {
    // `BigInt(300.5 * 1e6)` kesirli sayıda hata fırlatıyor ve mesaj sebebi
    // söylemiyor.
    expect(() => toMicros('0,07')).not.toThrow();
    expect(toMicros('0,07')).toBe(70_000n);
  });

  it('sıfır ve geçersiz değer REDDEDİLİYOR', () => {
    // Sıfır bütçeli bir boost, platformda anlamsız bir kampanya açardı.
    expect(() => toMicros('0')).toThrow();
    expect(() => toMicros('abc')).toThrow();
  });
});

describe('kartPlatformu', () => {
  it('bilinen platformları geçiriyor', () => {
    expect(kartPlatformu('meta')).toBe('meta');
    expect(kartPlatformu('google')).toBe('google');
  });

  it('KRİTİK: TANINMAYAN platform SESSİZCE Meta sayılmıyor', () => {
    /*
     * `=== 'google' ? 'google' : 'meta'` yazsaydık üçüncü platform sessizce
     * Meta olurdu ve bütçe kuralı (Google'da toplam bütçe yok) yanlış
     * tarafa uygulanırdı. Bu depoda o desen adı konmuş bir hata ve
     * `linkedin-kayit.spec.ts` onu tarıyor.
     */
    expect(() => kartPlatformu('linkedin')).toThrow(/Tanınmayan platform/);
  });
});

describe('butceKipi', () => {
  it('bilinen kipleri geçiriyor, NULL’ı koruyor', () => {
    expect(butceKipi('daily')).toBe('daily');
    expect(butceKipi('lifetime')).toBe('lifetime');
    expect(butceKipi(null)).toBeNull();
  });

  it('KRİTİK: TANINMAYAN kipte patlıyor — sessizce geçmiyor', () => {
    /*
     * `$queryRaw` denetimsiz bir dönüşüm: kolon iki değerli bir enum ama
     * tipe `string` geliyor. `as` ile susturmak, bir gün eklenen üçüncü
     * değerin sessizce sızması demekti — bütçe kipi yanlışsa harcanan para
     * da yanlış.
     */
    expect(() => butceKipi('weekly')).toThrow();
  });
});

describe('butceyiCoz', () => {
  it('KRİTİK: özelleştirme YOKSA ön ayar AYNEN geçiyor', () => {
    expect(butceyiCoz(ON_AYAR_BUTCE, 'meta', undefined)).toEqual(ON_AYAR_BUTCE);
    expect(butceyiCoz(ON_AYAR_BUTCE, 'meta', { targeting: undefined })).toEqual(ON_AYAR_BUTCE);
  });

  it('KRİTİK: KİP DEĞİŞİNCE diğer kolon NULL’lanıyor', () => {
    /*
     * Ön ayar günlük bütçeliyken kullanıcı toplam bütçeye geçerse,
     * `daily_budget_micros` eski değeriyle kalırsa `boosts_budget_chk`
     * kısıtı ham bir hata veriyor — kullanıcıya hiçbir şey anlatmayan
     * cinsten.
     */
    const sonuc = butceyiCoz(ON_AYAR_BUTCE, 'meta', {
      budget: { mode: 'lifetime', amount: '750', durationDays: 7 },
    });
    expect(sonuc).toEqual({
      budgetMode: 'lifetime',
      dailyBudgetMicros: null,
      totalBudgetMicros: 750_000_000n,
      durationDays: 7,
    });
  });

  it('günlük kipte TOPLAM kolonu null kalıyor', () => {
    const sonuc = butceyiCoz(
      { ...ON_AYAR_BUTCE, budgetMode: 'lifetime', totalBudgetMicros: 9n, dailyBudgetMicros: null },
      'meta',
      { budget: { mode: 'daily', amount: '120', durationDays: 3 } },
    );
    expect(sonuc.dailyBudgetMicros).toBe(120_000_000n);
    expect(sonuc.totalBudgetMicros).toBeNull();
  });

  it('KRİTİK: GOOGLE’da toplam bütçe REDDEDİLİYOR', () => {
    /*
     * Google'da bütçe ayrı bir kaynak (`CampaignBudget`) ve günlük. Kabul
     * edip günlüğe bölmek, ekranda yazan tutar ile gerçek harcamanın
     * ayrışması demekti.
     */
    expect(() =>
      butceyiCoz(ON_AYAR_BUTCE, 'google', {
        budget: { mode: 'lifetime', amount: '500', durationDays: 5 },
      }),
    ).toThrow(/toplam bütçe yok/i);
  });

  it('Google’da günlük bütçe geçiyor', () => {
    const sonuc = butceyiCoz(ON_AYAR_BUTCE, 'google', {
      budget: { mode: 'daily', amount: '90', durationDays: 4 },
    });
    expect(sonuc.dailyBudgetMicros).toBe(90_000_000n);
    expect(sonuc.durationDays).toBe(4);
  });
});

describe('hedeflemeyiCoz', () => {
  it('KRİTİK: özelleştirme YOKSA ön ayar AYNEN geçiyor', () => {
    expect(hedeflemeyiCoz(META_ON_AYAR, undefined)).toEqual(META_ON_AYAR);
    expect(hedeflemeyiCoz(META_ON_AYAR, { budget: undefined })).toEqual(META_ON_AYAR);
  });

  it('şehir, yaş ve cinsiyet değiştiriliyor', () => {
    const sonuc = hedeflemeyiCoz(META_ON_AYAR, {
      targeting: {
        savedAudienceId: null,
        locations: [{ key: '9999', type: 'city' }],
        ageMin: 18,
        ageMax: 30,
        genders: 'all',
      },
    });
    expect(sonuc).toMatchObject({
      platform: 'meta',
      savedAudienceId: null,
      locations: [{ key: '9999', type: 'city' }],
      ageMin: 18,
      ageMax: 30,
      genders: 'all',
    });
    // ÖN AYARIN DİĞER ALANLARI KORUNUYOR: hedefleme dışındaki hiçbir şey
    // bu pencereden gelmiyor.
    expect(sonuc).toMatchObject({ goal: 'engagement' });
  });

  it('KRİTİK: KAYITLI KİTLE seçilince şehir SIFIRLANIYOR', () => {
    /*
     * Meta kitleyi kendi tanımıyla uyguluyor ve yanına lokasyon göndermek
     * "kesişim mi birleşim mi" sorusunu bizim cevaplamamız demek. Ön ayar
     * formunda ekranda da böyle yazıyor ("kullanılmıyor"); ikisinin
     * ayrışması, ekranın yalan söylemesi olurdu.
     */
    const sonuc = hedeflemeyiCoz(META_ON_AYAR, {
      targeting: {
        savedAudienceId: 'aud-1',
        locations: [{ key: '9999', type: 'city' }],
        ageMin: 18,
        ageMax: 30,
        genders: 'all',
      },
    });
    expect(sonuc).toMatchObject({ savedAudienceId: 'aud-1', locations: [] });
  });

  it('KRİTİK: GOOGLE ön ayarında hedefleme özelleştirmesi REDDEDİLİYOR', () => {
    // Kabul edip yok saymak, kullanıcıya çalışan bir alan göstermek olurdu.
    const google = { platform: 'google' } as unknown as AutoBoostPresetSettings;
    expect(() =>
      hedeflemeyiCoz(google, {
        targeting: {
          savedAudienceId: null,
          locations: [],
          ageMin: 18,
          ageMax: 65,
          genders: 'all',
        },
      }),
    ).toThrow(/yalnızca Instagram/i);
  });
});

describe('şema — karar gövdesi', () => {
  it('KRİTİK: REDDEDERKEN özelleştirme gönderilemiyor', () => {
    /*
     * Sessiz bırakmak tehlikeli: kullanıcı bütçeyi düzenleyip yanlışlıkla
     * "Reddet"e basarsa, düzenlemesinin hiçbir yere gitmediğini hiçbir
     * yerde görmezdi.
     */
    const r = autoBoostDecisionSchema.safeParse({
      approve: false,
      override: { budget: { mode: 'daily', amount: '50', durationDays: 2 } },
    });
    expect(r.success).toBe(false);
  });

  it('onaysız düz gövde geçerli — özelleştirme İSTEĞE BAĞLI', () => {
    expect(autoBoostDecisionSchema.safeParse({ approve: true }).success).toBe(true);
    expect(autoBoostDecisionSchema.safeParse({ approve: false }).success).toBe(true);
  });

  it('KRİTİK: alt yaş üst yaştan büyük olamıyor', () => {
    const r = autoBoostQueueOverrideSchema.safeParse({
      targeting: {
        savedAudienceId: null,
        locations: [],
        ageMin: 50,
        ageMax: 30,
        genders: 'all',
      },
    });
    expect(r.success).toBe(false);
  });

  it('KRİTİK: TANINMAYAN ALAN reddediliyor — şema `.strict()`', () => {
    /*
     * Gevşek bir şema, panelin gönderdiği ama sunucunun okumadığı bir
     * alanı SESSİZCE yutardı: kullanıcı ayarladığını sanır, hiçbir şey
     * değişmez.
     */
    const r = autoBoostQueueOverrideSchema.safeParse({
      budget: { mode: 'daily', amount: '50', durationDays: 2 },
      objective: 'reach',
    });
    expect(r.success).toBe(false);
  });

  it('EN AZ 20 ₺ kuralı özelleştirmede de geçerli', () => {
    // Daha küçük bütçe Meta'da dağıtım almıyor; ön ayarla aynı kural,
    // çünkü aynı şema kullanılıyor.
    const r = autoBoostQueueOverrideSchema.safeParse({
      budget: { mode: 'daily', amount: '5', durationDays: 2 },
    });
    expect(r.success).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// YAYIN YOLU — özelleştirme GERÇEKTEN uygulanıyor mu
// -----------------------------------------------------------------------------

describe('yayın yolu özelleştirmeyi uyguluyor', () => {
  const KAYNAK = readFileSync(resolve(__dirname, 'autoboost-launch.service.ts'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

  it('BOŞA DÜŞME BEKÇİSİ: kaynak okundu', () => {
    expect(KAYNAK).toContain('async decide(');
  });

  it('KRİTİK: bütçe DALLARDAN ÖNCE çözülüyor — iki dal da aynı değeri görüyor', () => {
    /*
     * İki yayın dalına ayrı ayrı yazmak, birinin bir gün diğerini
     * tutmaması demekti: Google dalı bütçeyi ön ayardan okumaya devam eder
     * ve kullanıcının girdiği tutar SESSİZCE yok sayılırdı.
     */
    const butce = KAYNAK.indexOf('butceyiCoz(');
    const dal = KAYNAK.indexOf("if (kayit.platform === 'google') return this.launchGoogle(");
    expect(butce).toBeGreaterThan(-1);
    expect(dal).toBeGreaterThan(butce);
  });

  it('KRİTİK: iki dal da ÖZELLEŞTİRİLMİŞ satırı alıyor', () => {
    expect(KAYNAK).toContain('this.launchGoogle(ctx, scoped, ozellestirilmis)');
    expect(KAYNAK).toContain('this.launchMeta(ctx, scoped, ozellestirilmis, override)');
  });

  it('KRİTİK: hedefleme ÖN AYAR AYRIŞTIRILDIKTAN SONRA birleşiyor', () => {
    /*
     * Ters sırada, bozuk bir ön ayarın üstüne yazılan geçerli bir
     * hedefleme şemadan geçmiş gibi görünürdü.
     */
    const parse = KAYNAK.indexOf('autoBoostPresetSettingsSchema.safeParse(kayit.settings)');
    const birlestir = KAYNAK.indexOf('hedeflemeyiCoz(ayar.data, override)');
    expect(parse).toBeGreaterThan(-1);
    expect(birlestir).toBeGreaterThan(parse);
  });

  it('KRİTİK: uç nokta özelleştirmeyi SERVİSE geçiriyor', () => {
    // Gövdede okunup servise verilmezse, panel gönderir ve hiçbir şey olmaz.
    const uc = readFileSync(resolve(__dirname, 'autoboost.controller.ts'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    expect(uc).toContain('this.launch.decide(ctx, id, body.approve, body.override)');
  });
});

/** Tip kontrolü: `AutoBoostQueueOverride` gerçekten dışa açık. */
const _tip: AutoBoostQueueOverride = {};
void _tip;
