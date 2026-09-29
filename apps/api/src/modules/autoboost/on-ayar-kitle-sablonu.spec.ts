import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { autoBoostPresetInputSchema, autoBoostPresetSettingsSchema, hedeflemeOzeti } from '@advetics/shared';
import { metaTargetingFrom } from '../boosts/meta-targeting';
import { yabanciOzelKitle } from './kart-ozellestirme';

/**
 * AKILLI BOOST ÖN AYARI, MARKA MERKEZİ KİTLE ŞABLONUNU OKUYOR (Bölüm 4).
 *
 * Şablon ön ayara KOPYALANIYOR. Sınanan kurallar:
 *   · Alan adları `metaTargetingFrom`un okuduklarıyla aynı — ayrışırsa ilgi
 *     alanı derleme hatası vermeden istekten düşer.
 *   · Özel kitle başka hesabınsa yayın DURUYOR, boost satırı açılmadan.
 *   · Meta kayıtlı kitlesi ile şablon alanları birlikte kaydedilemiyor.
 *   · Alanlar eklenmeden kaydedilmiş eski ön ayar geçerli kalıyor.
 */

const HESAP_A = '11111111-1111-4111-8111-111111111111';
const HESAP_B = '33333333-3333-4333-8333-333333333333';
const CLIENT = '44444444-4444-4444-8444-444444444444';

const ozel = (hesapId: string, mod: 'dahil' | 'haric' = 'haric') => ({
  id: '120000000000001',
  name: 'Site ziyaretçileri',
  tip: 'ozel' as const,
  mod,
  hesapId,
  hesapAdi: hesapId === HESAP_A ? 'Hesap A' : 'Hesap B',
});

const girdi = (settings: Record<string, unknown>) => ({
  clientId: CLIENT,
  socialProfileId: null,
  enabled: true,
  budget: { mode: 'lifetime', amount: '300', durationDays: 5 },
  settings: { platform: 'meta', goal: 'engagement', savedAudienceId: null, locations: [], ...settings },
});

describe('ön ayar şeması — kitle şablonu alanları', () => {
  it('KRİTİK: alanlar olmadan kaydedilmiş ESKİ ön ayar hâlâ okunuyor', () => {
    const r = autoBoostPresetSettingsSchema.safeParse({
      platform: 'meta',
      goal: 'engagement',
      savedAudienceId: null,
      locations: [],
      ageMin: 18,
      ageMax: 65,
      genders: 'all',
    });
    expect(r.success).toBe(true);
    if (r.success && r.data.platform === 'meta') {
      expect(r.data.interests).toEqual([]);
      expect(r.data.ozelKitleler).toEqual([]);
      expect(r.data.kitleSablonuId).toBeNull();
    }
  });

  it('KRİTİK: Meta kayıtlı kitlesi + ilgi alanı birlikte REDDEDİLİYOR', () => {
    const r = autoBoostPresetInputSchema.safeParse(
      girdi({ savedAudienceId: 'aud-1', interests: [{ id: '6003107902433', name: 'Golf' }] }),
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toMatch(/kayıtlı kitlesi seçiliyken/);
  });

  it('KRİTİK: iki hesabın özel kitlesi birlikte REDDEDİLİYOR', () => {
    const r = autoBoostPresetInputSchema.safeParse(
      girdi({ ozelKitleler: [ozel(HESAP_A), { ...ozel(HESAP_B), id: '120000000000002' }] }),
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['settings', 'ozelKitleler']);
  });

  it('tek hesaplı şablon alanları kabul ediliyor', () => {
    const r = autoBoostPresetInputSchema.safeParse(
      girdi({ interests: [{ id: '6003107902433', name: 'Golf' }], ozelKitleler: [ozel(HESAP_A)] }),
    );
    expect(r.success).toBe(true);
  });
});

describe('yayın — hedefleme nesnesi ve hesap uyumu', () => {
  const ayar = () => {
    const r = autoBoostPresetSettingsSchema.parse({
      platform: 'meta',
      goal: 'engagement',
      savedAudienceId: null,
      locations: [],
      interests: [{ id: '6003107902433', name: 'Golf' }],
      ozelKitleler: [ozel(HESAP_A, 'haric')],
    });
    if (r.platform !== 'meta') throw new Error('meta bekleniyordu');
    return r;
  };

  it('KRİTİK: ön ayarın KENDİSİ üreticiye verilince ilgi ve hariç kitle istekte', () => {
    // Yayın `metaTargetingFrom(g.meta)` çağırıyor; alan adı ayrışırsa bu düşer.
    const t = metaTargetingFrom(ayar());
    expect(t.flexible_spec).toEqual([{ interests: [{ id: '6003107902433', name: 'Golf' }] }]);
    expect(t.excluded_custom_audiences).toEqual([{ id: '120000000000001' }]);
  });

  it('KRİTİK: özel kitle başka hesabınsa yakalanıyor, aynı hesapsa geçiyor', () => {
    expect(yabanciOzelKitle(ayar(), HESAP_B)?.hesapAdi).toBe('Hesap A');
    expect(yabanciOzelKitle(ayar(), HESAP_A)).toBeNull();
  });

  it('kayıtlı kitle seçiliyse özel kitle gitmiyor, ret sebebi değil', () => {
    expect(yabanciOzelKitle({ savedAudienceId: 'aud-1', ozelKitleler: [ozel(HESAP_A)] }, HESAP_B)).toBeNull();
  });

  it('eski kayıtta alan yoksa patlamıyor', () => {
    expect(
      yabanciOzelKitle({ savedAudienceId: null } as Parameters<typeof yabanciOzelKitle>[0], HESAP_A),
    ).toBeNull();
  });

  it('KRİTİK: kontrol boost satırı AÇILMADAN yapılıyor', () => {
    const k = readFileSync(join(__dirname, 'autoboost-launch.service.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*--.*$/gm, '')
      .replace(/\/\/.*$/gm, '');
    const bas = k.indexOf('private async onAyardanBoostAc(');
    if (bas === -1) throw new Error('onAyardanBoostAc bulunamadı — tarama boşa düştü');
    const govde = k.slice(bas, k.indexOf('ON CONFLICT DO NOTHING', bas));
    const kontrol = govde.indexOf('yabanciOzelKitle(g.meta, g.adAccountId)');
    expect(kontrol).toBeGreaterThan(0);
    expect(kontrol).toBeLessThan(govde.indexOf('INSERT INTO boosts'));
  });

  it('KRİTİK: ön ayar kaydı özel kitle hesabını veritabanında doğruluyor', () => {
    const k = readFileSync(join(__dirname, 'autoboost-preset.service.ts'), 'utf8').replace(/\/\/.*$/gm, '');
    const bas = k.indexOf('async upsert(');
    if (bas === -1) throw new Error('upsert bulunamadı');
    const govde = k.slice(bas, k.indexOf('INSERT INTO auto_boost_presets', bas));
    expect(govde).toContain('await ozelKitleHesabi(tx, { clientId: input.clientId, ozelKitleler: input.settings.ozelKitleler })');
  });
});

describe('kart özeti', () => {
  it('KRİTİK: şablondan gelen ilgi ve hariç kitle kartta görünüyor', () => {
    const s = autoBoostPresetSettingsSchema.parse({
      platform: 'meta',
      goal: 'engagement',
      savedAudienceId: null,
      locations: [],
      interests: [
        { id: '1', name: 'Golf' },
        { id: '2', name: 'Tenis' },
        { id: '3', name: 'Yelken' },
        { id: '4', name: 'Binicilik' },
      ],
      ozelKitleler: [ozel(HESAP_A, 'haric')],
    });
    const satir = hedeflemeOzeti(s);
    // SESSİZ KESME YOK: gizlenen sayısı yazıyor.
    expect(satir).toContainEqual({ etiket: 'İlgi', deger: 'Golf, Tenis, Yelken +1' });
    expect(satir).toContainEqual({ etiket: 'Hariç', deger: 'Site ziyaretçileri' });
  });
});
