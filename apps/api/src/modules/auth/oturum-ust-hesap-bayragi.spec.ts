import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ OTURUM "EV ŞİRKETİ BİR ÜST HESABA BAĞLI MI"YI TAŞIYOR ═══
 *
 * Panel "Üst hesap kur" formunu buna bakarak gösteriyor. `managerAccount`
 * alanı müşteri şirketinin admininde `null` ve o `null`, bağımsız şirketle
 * (kurabilir) ajansın müşteri şirketini (kuramaz) aynı hâle çeviriyordu.
 *
 * İKİ İDDİA: bayrak doğru kaynaktan türüyor VE üst hesabın KİMLİĞİ yanıta
 * gitmiyor. Üyeliği olmayan birine ajansın hesap kimliğini taşımak gereksiz
 * bir sızıntı olurdu ve panelin ihtiyacı yalnızca olgu.
 */
const KAYNAK = readFileSync(join(__dirname, 'auth.service.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

function oturumOrgBlogu(): string {
  const bas = KAYNAK.indexOf('      organization: {\n        id: org.id,');
  if (bas === -1) throw new Error('oturumun organization bloğu bulunamadı — tarama boşa düştü');
  return KAYNAK.slice(bas, KAYNAK.indexOf('},', bas) + 2);
}

describe('oturum — ustHesabaBagli', () => {
  it('blok yakalandı', () => {
    expect(oturumOrgBlogu()).toContain('plan: org.plan');
  });

  it('KRİTİK: bayrak EV şirketinin managerAccountId’sinden türüyor', () => {
    expect(KAYNAK).toContain(
      "where: { id: identity.actor.orgId },\n        select: { id: true, name: true, slug: true, plan: true, managerAccountId: true },",
    );
    expect(oturumOrgBlogu()).toContain('ustHesabaBagli: org.managerAccountId !== null');
  });

  it('KRİTİK: üst hesabın kimliği yanıta GİTMİYOR', () => {
    // `organization: org` gibi toptan bir aktarım geri gelirse kimlik de
    // gider; alanlar tek tek yazılmak zorunda.
    expect(oturumOrgBlogu()).not.toContain('managerAccountId:');
    expect(KAYNAK).not.toContain('      organization: org,');
  });
});
