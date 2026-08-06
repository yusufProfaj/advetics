import { describe, expect, it } from 'vitest';
import { hasReviewIssue, parseReviewIssues } from './review-issues';

/**
 * Reddedilme sebebi çözümleyicisi.
 *
 * NEDEN BU TEST VAR: bu veri SÖZLEŞMESİZ. Meta `ad_review_feedback` alanını
 * serbest biçimli bir nesne olarak veriyor — anahtarlar politika adları,
 * derinlik değişken, bazen dizi bazen nesne. Google tamamen başka bir yapı
 * kullanıyor. Beklenmeyen bir şekil çözümleyiciyi çökertirse REKLAM LİSTESİ
 * açılmıyor: kullanıcı tek bir bozuk reklam yüzünden tüm ekranı kaybediyor.
 *
 * Bu yüzden iddiaların yarısı "çökmüyor" üzerine.
 */

describe('parseReviewIssues — Meta', () => {
  it('global geri bildirimi politika adı + açıklama olarak çözer', () => {
    const issues = parseReviewIssues('meta', {
      global: {
        'Kişiselleştirme Reklamları': 'Reklamınız kişisel özelliklere atıfta bulunuyor.',
      },
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.topic).toBe('Kişiselleştirme Reklamları');
    expect(issues[0]!.detail).toContain('kişisel özelliklere');
  });

  it('`global` yapısal anahtarı başlığa KATILMIYOR', () => {
    // "global · Alkol" anlamsız bir başlık olurdu.
    const issues = parseReviewIssues('meta', { global: { Alkol: 'Yaş sınırı gerekli' } });
    expect(issues[0]!.topic).toBe('Alkol');
  });

  it('yerleşim bazlı geri bildirimde yerleşim adı korunuyor', () => {
    const issues = parseReviewIssues('meta', {
      placement_specific: { instagram: { 'Metin Oranı': 'Görselde çok fazla metin var' } },
    });
    expect(issues[0]!.topic).toBe('instagram · Metin Oranı');
  });

  it('birden fazla politikayı ayrı ayrı listeler', () => {
    const issues = parseReviewIssues('meta', {
      global: { Alkol: 'a', Kumar: 'b', Sağlık: 'c' },
    });
    expect(issues).toHaveLength(3);
    expect(issues.map((i) => i.topic).sort()).toEqual(['Alkol', 'Kumar', 'Sağlık']);
  });

  it('derinliği sınırlı — sonsuz özyineleme yok', () => {
    // Beklenmedik derinlikte bir yapı API sürecini düşürmemeli.
    let deep: Record<string, unknown> = { son: 'değer' };
    for (let i = 0; i < 50; i++) deep = { [`k${i}`]: deep };
    expect(() => parseReviewIssues('meta', deep)).not.toThrow();
  });

  it('çok fazla girdide listeyi kırpıyor', () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 100; i++) many[`Politika ${i}`] = 'açıklama';
    const issues = parseReviewIssues('meta', { global: many });
    // Arayüzde 100 satır sorun göstermek okunmaz; üst sınır var.
    expect(issues.length).toBeLessThanOrEqual(25);
  });
});

describe('parseReviewIssues — Google', () => {
  it('policy_topic_entries dizisini çözer', () => {
    const issues = parseReviewIssues('google', [
      {
        topic: 'ALCOHOL',
        type: 'PROHIBITED',
        evidences: [{ textList: { texts: ['bira', 'şarap'] } }],
      },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.topic).toBe('ALCOHOL (PROHIBITED)');
    expect(issues[0]!.detail).toBe('bira · şarap');
  });

  it('saran nesne biçimini de kabul eder', () => {
    const issues = parseReviewIssues('google', {
      policyTopicEntries: [{ topic: 'TRADEMARK', type: 'LIMITED' }],
    });
    expect(issues[0]!.topic).toBe('TRADEMARK (LIMITED)');
    expect(issues[0]!.detail).toBeNull();
  });

  it('kanıt yoksa detail null', () => {
    const issues = parseReviewIssues('google', [{ topic: 'X' }]);
    expect(issues[0]!.detail).toBeNull();
  });
});

describe('dayanıklılık', () => {
  it('null, undefined ve boş değerlerde boş dizi', () => {
    expect(parseReviewIssues('meta', null)).toEqual([]);
    expect(parseReviewIssues('meta', undefined)).toEqual([]);
    expect(parseReviewIssues('google', null)).toEqual([]);
  });

  it('beklenmeyen ilkel tiplerde çökmüyor', () => {
    for (const value of ['metin', 42, true, [], {}]) {
      expect(() => parseReviewIssues('meta', value)).not.toThrow();
      expect(() => parseReviewIssues('google', value)).not.toThrow();
    }
  });

  it('boş string açıklamayı sorun saymıyor', () => {
    const issues = parseReviewIssues('meta', { global: { Alkol: '   ' } });
    expect(issues).toHaveLength(0);
  });
});

describe('hasReviewIssue', () => {
  it('somut geri bildirim varsa sorun var', () => {
    expect(hasReviewIssue(null, [{ topic: 'Alkol', detail: 'x' }])).toBe(true);
  });

  it('DISAPPROVED ve WITH_ISSUES sorun', () => {
    expect(hasReviewIssue('DISAPPROVED', [])).toBe(true);
    expect(hasReviewIssue('WITH_ISSUES', [])).toBe(true);
  });

  it('PENDING_REVIEW sorun DEĞİL — normal akış', () => {
    // İncelemede olmak bir arıza değil; kullanıcıyı boşuna telaşlandırmamak
    // için sorun listesine girmiyor.
    expect(hasReviewIssue('PENDING_REVIEW', [])).toBe(false);
    expect(hasReviewIssue('PREAPPROVED', [])).toBe(false);
  });

  it('durum yoksa sorun yok', () => {
    expect(hasReviewIssue(null, [])).toBe(false);
  });
});
