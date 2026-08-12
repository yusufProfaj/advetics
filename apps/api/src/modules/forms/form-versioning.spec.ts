import { describe, expect, it } from 'vitest';
import type { LeadFormInput, LeadFormRecord } from '@advetics/shared';
import { contentEquals, planEdit, publishBlockers, publishWarnings } from './form-versioning';

const CLIENT = '11111111-1111-1111-1111-111111111111';
const PROFILE = '22222222-2222-2222-2222-222222222222';

function input(over: Partial<LeadFormInput> = {}): LeadFormInput {
  return {
    clientId: CLIENT,
    socialProfileId: PROFILE,
    name: 'Yaz kampanyası formu',
    formType: 'more_volume',
    prefillQuestions: ['FULL_NAME', 'PHONE'],
    customQuestions: [],
    privacyPolicyUrl: 'https://ornek.com/gizlilik',
    privacyPolicyLinkText: 'Gizlilik Politikası',
    consentBoxes: [],
    thankYouHeadline: 'Teşekkürler!',
    thankYouBody: 'Size döneceğiz.',
    thankYouCtaText: 'Siteye git',
    ...over,
  };
}

function record(over: Partial<LeadFormRecord> = {}): LeadFormRecord {
  return {
    id: 'aaa',
    clientId: CLIENT,
    socialProfileId: PROFILE,
    socialProfileName: 'Örnek Sayfa',
    name: 'Form',
    formType: 'more_volume',
    headline: null,
    intro: null,
    prefillQuestions: ['FULL_NAME', 'PHONE'],
    customQuestions: [],
    privacyPolicyUrl: 'https://ornek.com/gizlilik',
    privacyPolicyLinkText: 'Gizlilik Politikası',
    consentBoxes: [],
    thankYouHeadline: 'Teşekkürler!',
    thankYouBody: 'Size döneceğiz.',
    thankYouCtaText: 'Siteye git',
    thankYouCtaUrl: null,
    status: 'draft',
    externalFormId: null,
    version: 1,
    rootId: 'aaa',
    supersededById: null,
    error: null,
    publishedAt: null,
    createdAt: '2026-08-12T00:00:00Z',
    ...over,
  };
}

describe('içerik karşılaştırma', () => {
  it('form adı içerik sayılmıyor', () => {
    // Ad yalnızca panelde görünüyor. İçerik farkı sayılsaydı, bir formu yeniden
    // adlandırmak Meta'da yeni bir form oluştururdu.
    expect(contentEquals(input({ name: 'A' }), input({ name: 'B' }))).toBe(true);
  });

  it('anahtar sırası farkı içerik farkı sayılmıyor', () => {
    // Bu tuzağın somut hâli: aynı nesne farklı sırada gelirse JSON.stringify
    // farklı çıkar ve HİÇBİR ŞEY DEĞİŞMEDEN her kaydetme yeni sürüm üretir.
    const a = input({ consentBoxes: [{ text: 'KVKK', required: true }] });
    const b = input({
      consentBoxes: [{ required: true, text: 'KVKK' } as { text: string; required: boolean }],
    });
    expect(contentEquals(a, b)).toBe(true);
  });

  it('soru değişikliği içerik farkı', () => {
    expect(
      contentEquals(input(), input({ prefillQuestions: ['FULL_NAME', 'PHONE', 'EMAIL'] })),
    ).toBe(false);
  });

  it('onay metni değişikliği içerik farkı', () => {
    // En kritik hâli: kullanıcının onayladığı metin değişiyorsa yeni form şart.
    expect(
      contentEquals(input(), input({ consentBoxes: [{ text: 'Yeni metin', required: true }] })),
    ).toBe(false);
  });
});

describe('düzenleme planı', () => {
  it('taslak yerinde güncelleniyor', () => {
    const plan = planEdit(
      { status: 'draft', version: 1 },
      input(),
      input({ prefillQuestions: ['FULL_NAME'] }),
    );
    expect(plan.inPlace).toBe(true);
    expect(plan.nextVersion).toBeNull();
  });

  it('başarısız form yerinde güncelleniyor', () => {
    // Yayınlanamamış formun Meta'da karşılığı yok; sürüm oluşturmak anlamsız.
    const plan = planEdit(
      { status: 'failed', version: 1 },
      input(),
      input({ prefillQuestions: ['FULL_NAME'] }),
    );
    expect(plan.inPlace).toBe(true);
  });

  it('yayınlanmış formda içerik değişince yeni sürüm', () => {
    const plan = planEdit(
      { status: 'published', version: 1 },
      input(),
      input({ prefillQuestions: ['FULL_NAME'] }),
    );
    expect(plan.inPlace).toBe(false);
    expect(plan.nextVersion).toBe(2);
  });

  it('yayınlanmış formda yalnızca ad değişince yeni sürüm YOK', () => {
    // Bu olmasaydı yazım hatası düzeltmek Meta'da çöp form biriktirirdi.
    const plan = planEdit(
      { status: 'published', version: 3 },
      input({ name: 'Eski ad' }),
      input({ name: 'Yeni ad' }),
    );
    expect(plan.inPlace).toBe(true);
    expect(plan.nextVersion).toBeNull();
    expect(plan.explanation).toContain('panelde görünüyor');
  });

  it('yeni sürüm yayındaki reklamları etkilemiyor', () => {
    // Meta çalışan bir reklamın form kimliğini değiştirmiyor. Bunu söylemek
    // arayüzün sorumluluğu; burası kaynağı.
    const plan = planEdit(
      { status: 'published', version: 1 },
      input(),
      input({ prefillQuestions: ['EMAIL'] }),
    );
    expect(plan.affectsLiveAds).toBe(false);
  });

  it('sürüm numarası artıyor', () => {
    const plan = planEdit(
      { status: 'published', version: 7 },
      input(),
      input({ prefillQuestions: ['EMAIL'] }),
    );
    expect(plan.nextVersion).toBe(8);
  });
});

describe('yayın engelleyicileri', () => {
  it('yayındaki form yeniden yayınlanamıyor', () => {
    expect(publishBlockers(record({ status: 'published' }))).toContain('Bu form zaten yayında.');
  });

  it('eski sürüm yayınlanamıyor', () => {
    const blockers = publishBlockers(record({ status: 'superseded', supersededById: 'bbb' }));
    expect(blockers.join(' ')).toContain('daha yeni bir sürümü');
  });

  it('taslak temiz form engellenmiyor', () => {
    expect(publishBlockers(record())).toEqual([]);
  });

  it('gizlilik adresi olmadan yayın engelleniyor', () => {
    // Meta da reddediyor ama hatayı yayın anında almak geç.
    expect(publishBlockers(record({ privacyPolicyUrl: '' })).join(' ')).toContain(
      'Gizlilik politikası',
    );
  });
});

describe('yayın uyarıları', () => {
  it('telefon sorusu yoksa uyarıyor ama ENGELLEMİYOR', () => {
    const form = record({ prefillQuestions: ['EMAIL'] });
    expect(publishWarnings(form).join(' ')).toContain('Telefon');
    // Ayrım önemli: bu ajansın bilinçli kararı olabilir.
    expect(publishBlockers(form)).toEqual([]);
  });

  it('KVKK onayı yoksa uyarıyor', () => {
    expect(publishWarnings(record()).join(' ')).toContain('KVKK');
  });

  it('KVKK onayı varsa uyarmıyor', () => {
    const form = record({ consentBoxes: [{ text: 'KVKK onayı', required: true }] });
    expect(publishWarnings(form).join(' ')).not.toContain('KVKK açık rıza');
  });

  it('çok sayıda zorunlu onay kutusu uyarı üretiyor', () => {
    const form = record({
      consentBoxes: [
        { text: 'a', required: true },
        { text: 'b', required: true },
        { text: 'c', required: true },
      ],
    });
    expect(publishWarnings(form).join(' ')).toContain('3 zorunlu onay kutusu');
  });

  it('çok sayıda özel soru uyarı üretiyor', () => {
    const form = record({
      customQuestions: [
        { type: 'short_answer', label: 'a', options: [] },
        { type: 'short_answer', label: 'b', options: [] },
        { type: 'short_answer', label: 'c', options: [] },
        { type: 'short_answer', label: 'd', options: [] },
      ],
    });
    expect(publishWarnings(form).join(' ')).toContain('4 özel soru');
  });
});
