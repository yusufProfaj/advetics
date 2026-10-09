import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ KAYNAK TARAMALARI — derlemenin göremediği bağlar ═══
 *
 * 1. Uçların İZNİ (MIMARI § 5, kullanıcı kararı): okuma `insights.read`,
 *    uygula/yoksay `budget.write`. İzin düz dize; biri kayarsa TypeScript
 *    susar ve müşteri hesabı ya ekranı açar ya da yönetici uygulayamaz.
 * 2. Nest modül kaydı AÇILIŞTA patlar, derlemede değil (CLAUDE.md).
 * 3. Özet kapısı: uygula yolunda özet karşılaştırması silinirse bayat kart
 *    eski bütçeyle uygulanır (davranışı `iyilestir.service.spec.ts` sınıyor;
 *    burası kapının yerini kilitliyor: platform çağrısından ÖNCE).
 */
const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const oku = (yol: string) => yorumsuz(readFileSync(join(__dirname, yol), 'utf8'));

const CONTROLLER = oku('iyilestir.controller.ts');
const MODUL = oku('iyilestir.module.ts');
const APP = oku('../../app.module.ts');
const SERVIS = oku('iyilestir.service.ts');

const BEKLENEN: Record<string, string> = {
  'GET oneriler': 'insights.read',
  'POST oneriler/:anahtar/uygula': 'budget.write',
  'POST oneriler/:anahtar/yoksay': 'budget.write',
  'POST asistan/oturumlar': 'insights.read',
  'GET asistan/oturumlar/:id': 'insights.read',
  'POST asistan/oturumlar/:id/mesajlar': 'insights.read',
};

describe('uçlar ve izinler', () => {
  it('KRİTİK: her uç beklenen izinle, eksiksiz ve fazlasız', () => {
    expect(/@Controller\('iyilestir'\)/.test(CONTROLLER)).toBe(true);
    const bulunan: Record<string, string> = {};
    for (const m of CONTROLLER.matchAll(/@(Get|Post)\('([^']*)'\)\s*@RequirePermissions\('([^']+)'\)/g)) {
      bulunan[`${m[1]!.toUpperCase()} ${m[2]}`] = m[3]!;
    }
    // İzinsiz rota taramaya hiç girmezdi; rota sayısı da eşit olmalı.
    expect([...CONTROLLER.matchAll(/@(Get|Post|Put|Patch|Delete)\(/g)]).toHaveLength(Object.keys(BEKLENEN).length);
    expect(bulunan).toEqual(BEKLENEN);
  });
});

describe('Nest kaydı', () => {
  it('KRİTİK: modül app.module içinde ve bağımlılıkları içe aktarıyor', () => {
    expect(APP).toMatch(/import \{ IyilestirModule \} from '\.\/modules\/iyilestir\/iyilestir\.module'/);
    expect(APP).toMatch(/\bIyilestirModule,/);
    for (const m of ['CampaignActionsModule', 'BudgetsModule', 'MetricsModule']) {
      expect(MODUL, m).toMatch(new RegExp(`imports:\\s*\\[[^\\]]*\\b${m}\\b`));
    }
    expect(MODUL).toMatch(/providers:\s*\[IyilestirService, AsistanService\]/);
  });

  it('bağımlı modüller servislerini DIŞA açıyor', () => {
    for (const [d, s] of [
      ['../campaign-actions/campaign-actions.module.ts', 'CampaignActionsService'],
      ['../budgets/budgets.module.ts', 'BudgetsService'],
      ['../metrics/metrics.module.ts', 'MetricsService'],
    ] as const) {
      expect(oku(d), d).toMatch(new RegExp(`exports:\\s*\\[[^\\]]*\\b${s}\\b`));
    }
  });
});

describe('uygula yolunun sırası', () => {
  it('KRİTİK: özet kapısı platform çağrısından ÖNCE', () => {
    const bas = SERVIS.indexOf('async uygula(');
    if (bas < 0) throw new Error('uygula gövdesi bulunamadı — tarama boşa düşerdi');
    const govde = SERVIS.slice(bas, SERVIS.indexOf('async yoksay(', bas));
    const kapi = govde.indexOf('o.ozet !== ozet');
    const adim = govde.indexOf('adimSinirIcinde(');
    const cagri = govde.indexOf('this.actions.uygula(');
    expect(kapi).toBeGreaterThan(0);
    expect(adim).toBeGreaterThan(0);
    expect(cagri).toBeGreaterThan(kapi);
    expect(cagri).toBeGreaterThan(adim);
  });
});
