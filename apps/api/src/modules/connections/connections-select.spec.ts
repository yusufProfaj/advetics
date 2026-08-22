import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `/connections` LİSTESİ AĞIR KOLONLARI ÇEKMİYOR.
 *
 * Sorgu `include` kullanıyordu ve `include` ilişkinin BÜTÜN skaler
 * kolonlarını çekiyor. Havuzda 481 reklam hesabı ve 199 sayfa varken şunlar
 * da okunup Node'a taşınıyor ve `toSummary` içinde ATILIYORDU:
 *
 *   · `ad_accounts.raw` — her hesabın tam platform yanıtı (JSONB)
 *   · `ad_accounts.rate_limit_state` (JSONB)
 *   · `social_profiles.raw` (JSONB)
 *   · `social_profiles.page_access_token_enc` — ŞİFRELİ SAYFA TOKEN'I
 *   · `platform_connections.access_token_enc` / `refresh_token_enc`
 *
 * Yük yanıtta GÖRÜNMÜYORDU — yanıt zaten doğruydu; pahalı olan ona giden yol.
 * Bu tarama, bir gün `select`in tekrar `include`a dönmesini engelliyor.
 */
const KAYNAK = readFileSync(join(__dirname, 'connections.service.ts'), 'utf8');

const yorumsuz = (m: string): string =>
  m.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** `list()` gövdesi — tarama yalnızca orada geçerli. */
function listeGovdesi(): string {
  const kod = yorumsuz(KAYNAK);
  const bas = kod.indexOf('tx.platformConnection.findMany({');
  const son = kod.indexOf('return rows.map', bas);
  if (bas === -1 || son === -1 || son <= bas) {
    throw new Error('list() sorgusu bulunamadı — tarama boşa düştü.');
  }
  return kod.slice(bas, son);
}

describe('tarama boşa düşmüyor', () => {
  it('sorgu dilimi gerçekten yakalanıyor', () => {
    const g = listeGovdesi();
    expect(g.length).toBeGreaterThan(200);
    expect(g).toContain('adAccounts');
    expect(g).toContain('socialProfiles');
  });
});

describe('ağır kolonlar çekilmiyor', () => {
  it('KRİTİK: ilişkiler `select` ile çekiliyor, `include` ile DEĞİL', () => {
    const g = listeGovdesi();
    expect(g).toContain('select:');
    expect(g).not.toContain('include:');
  });

  it('KRİTİK: ham JSON ve şifreli kolonlar alan listesinde YOK', () => {
    const kod = yorumsuz(KAYNAK);
    const bas = kod.indexOf('const HESAP_ALANLARI');
    const son = kod.indexOf('type BaglantiSatiri', bas);
    if (bas === -1 || son === -1) {
      throw new Error('alan listeleri bulunamadı — tarama boşa düştü.');
    }
    const alanlar = kod.slice(bas, son);

    for (const yasak of [
      'raw',
      'rateLimitState',
      'pageAccessTokenEnc',
      'accessTokenEnc',
      'refreshTokenEnc',
    ]) {
      expect(alanlar, `${yasak} alan listesine girmiş`).not.toContain(yasak);
    }
  });
});

describe('tip alan listesinden türetiliyor', () => {
  it('KRİTİK: toSummary kendi alan listesini YAZMIYOR', () => {
    /*
     * Sorgu ile tip ayrı yazılsaydı, biri güncellenmediğinde TypeScript
     * susardı ve alan `undefined` gelirdi — `$queryRaw<T>` için CLAUDE.md'de
     * yazılı olan tuzağın Prisma karşılığı.
     */
    const kod = yorumsuz(KAYNAK);
    expect(kod).toContain('type BaglantiSatiri = Prisma.PlatformConnectionGetPayload<{');
    expect(kod).toContain('select: typeof BAGLANTI_ALANLARI');
    expect(kod).toContain('c: BaglantiSatiri,');
  });

  it('alan listeleri `satisfies` ile şemaya bağlı', () => {
    // Yanlış yazılmış bir kolon adı derlemede yakalanıyor.
    const kod = yorumsuz(KAYNAK);
    expect(kod).toContain('satisfies Prisma.AdAccountSelect');
    expect(kod).toContain('satisfies Prisma.SocialProfileSelect');
    expect(kod).toContain('satisfies Prisma.PlatformConnectionSelect');
  });
});
