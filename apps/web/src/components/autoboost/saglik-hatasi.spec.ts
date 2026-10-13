import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ABONELİK SAĞLIĞI HATASI YUTULMUYOR (2026-10-14, Grup 2 tasarım geçişi).
 * `.catch(() => setSaglik([]))` "abonelikler sağlam" ile "sağlık okunamadı"yı
 * aynı boş listeye çeviriyordu (CLAUDE.md §3); boş liste ekranda hiçbir uyarı
 * üretmediği için Instagram aboneliği ölmüş bir müşteri "her şey yolunda"
 * görüyordu. Bileşen render edilmiyor, kural YORUMSUZ kaynakta taranıyor.
 */
const KAYNAK = readFileSync(join(__dirname, 'bildirim-havuzu.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('Akıllı Boost: abonelik sağlığı okunamazsa söyleniyor', () => {
  it('BOŞA DÜŞME BEKÇİSİ: sağlık çağrısı kaynakta', () => {
    expect(KAYNAK).toContain('/autoboost/subscriptions/health?clientId=');
  });

  it('KRİTİK: hata boş listeye çevrilmiyor; mesaj ekranda', () => {
    expect(KAYNAK).not.toMatch(/\.catch\(\(\)\s*=>\s*setSaglik/);
    expect(KAYNAK).toMatch(/setSaglikHatasi\(e instanceof ApiRequestError \? e\.message/);
    expect(KAYNAK).toMatch(/\{saglikHatasi && \(\s*<Serit/);
  });
});
