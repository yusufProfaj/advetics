import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { autoBoostPresetSettingsSchema, boostHedefi } from '@advetics/shared';

/*
 * ═══ KART BOOST'UN NEYİ ÖLÇTÜĞÜNÜ SÖYLÜYOR (pazar araştırması 2026-10-15) ═══
 * Ön ayardaki amaç Meta'ya GİTMİYOR: yayın yolu her zaman POST_ENGAGEMENT
 * yazıyor. Kart seçileni değil yazılanı gösteriyor ve farkı söylüyor.
 */
const meta = (goal: string) => autoBoostPresetSettingsSchema.parse({ platform: 'meta', goal });
const KOK = join(__dirname, '../../../../..');
const yorumsuz = (yol: string) => readFileSync(join(KOK, yol), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

describe('boostHedefi', () => {
  it('KRİTİK: "Erişim" seçili ön ayarda kart etkileşimi gösterip farkı söylüyor', () => {
    const h = boostHedefi(meta('reach'));
    expect(h.deger).toBe('Etkileşim (beğeni, yorum, kaydetme)');
    expect(h.fark).toBe('Ön ayarda “Erişim” seçili ama boost bugün etkileşime göre kuruluyor');
  });

  it('etkileşim seçiliyse fark yok', () => {
    expect(boostHedefi(meta('engagement')).fark).toBeNull();
  });

  it('Google: tıklama, fark yok', () => {
    expect(boostHedefi(autoBoostPresetSettingsSchema.parse({ platform: 'google' }))).toEqual({ deger: 'Tıklama (YouTube izleyicisi)', fark: null });
  });

  it('KRİTİK: kartın varsayımı yayın yoluyla aynı — boost reklam seti POST_ENGAGEMENT yazıyor', () => {
    // Biri amacı yayına bağlarsa bu test düşer ve kart metni de güncellenmeli.
    const k = yorumsuz('apps/api/src/modules/connections/providers/meta.provider.ts');
    const i = k.indexOf("destination_type: 'ON_POST'");
    expect(i).toBeGreaterThan(0);
    expect(k.slice(k.lastIndexOf('const params', i), i)).toContain("optimization_goal: 'POST_ENGAGEMENT'");
  });

  it('kart satırı ortak fonksiyondan ve yalnız onay bekleyen kartta', () => {
    const k = yorumsuz('apps/web/src/components/autoboost/bildirim-havuzu.tsx');
    expect(k).toContain('const h = boostHedefi(kayit.preset.settings);');
    expect(k).toContain('{BOOST_ADVCAMPAIGN_NOTU}');
  });
});
