import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * BİLDİRİM HAVUZU YAYINI, TOPLU YÜRÜTÜCÜYÜ ÇAĞIRAMAZ.
 *
 * `BoostExecutorService.createApproved(run, clientId, limit)` müşterinin
 * onaylı boost'larını `ORDER BY approved_at` ile — yani EN ESKİDEN — alıyor.
 * Kural motorundan kalmış daha eski bir onaylı satır varsa `limit=1` onu
 * yayınlar, bizim az önce yazdığımız satır `approved` kalır ve çağrı yine
 * `created: 1` döner.
 *
 * Sonuç sessiz ve iki taraflı yanlış: kart `launched` yazılır ama
 * `external_campaign_id` NULL kopyalanır (kullanıcı "yayınlandı" görür,
 * ortada o gönderinin reklamı yoktur), bizim boost ise sonra zamanlanmış
 * tarama tarafından kartla hiç ilişkilendirilmeden yayınlanır.
 *
 * Doğrusu `createOneApproved(run, boostId)` — kimliği verilen TEK satırı
 * yayınlıyor ve hata metnini geri döndürüyor.
 */
describe('bildirim havuzu yayını — yürütücü çağrısı', () => {
  const kaynak = readFileSync(
    join(__dirname, 'autoboost-launch.service.ts'),
    'utf8',
  );

  /** Yalnızca Meta dalı — Google dalı `boosts` satırı açmıyor. */
  const metaDali = (): string => {
    const bas = kaynak.indexOf('private async launchMeta(');
    const son = kaynak.indexOf('private async launchGoogle(');
    // DİLİM BULUNAMAZSA HATA. Metot adı değişirse tarama boşa düşer ve
    // aşağıdaki "yasak dizge yok" iddiası her zaman doğru olurdu.
    if (bas === -1 || son === -1 || son <= bas) {
      throw new Error(
        'launchMeta / launchGoogle dilimi bulunamadı — tarama boşa düştü.',
      );
    }
    return kaynak.slice(bas, son);
  };

  /**
   * YORUMLAR SOYULUYOR. Kodun kendisi, toplu yürütücüyü NEDEN çağırmadığını
   * anlatan bir yorum taşıyor ve o yorum "createApproved" yazıyor — yasak
   * dizge taraması yorumu koda sayarsa, doğru yazılmış kodda düşer.
   */
  const yorumsuz = (metin: string): string =>
    metin.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('dilim gerçekten yakalanıyor', () => {
    const dilim = metaDali();
    expect(dilim.length).toBeGreaterThan(500);
    // Gövde gerçekten Meta yayını mı: boost satırını o yazıyor.
    expect(dilim).toContain('INSERT INTO boosts');
  });

  it('yorum soyucu gerçekten soyuyor', () => {
    // Soyucu bozulursa "yasak dizge yok" iddiası yorum yüzünden hep
    // düşerdi ya da — ters yönde bozulursa — hep geçerdi.
    expect(yorumsuz('a /* createApproved( */ b')).toBe('a  b');
    expect(yorumsuz('a // createApproved(\nb')).toBe('a \nb');
    expect(yorumsuz('createOneApproved(x)')).toBe('createOneApproved(x)');
  });

  it('tek boost yürütücüsünü çağırıyor', () => {
    expect(yorumsuz(metaDali())).toContain('createOneApproved(');
  });

  it('toplu yürütücüyü ÇAĞIRMIYOR', () => {
    expect(yorumsuz(metaDali())).not.toContain('createApproved(');
  });

  it('yürütücüye boostId veriyor, client_id değil', () => {
    const dilim = yorumsuz(metaDali());
    const cagri = dilim.slice(
      dilim.indexOf('createOneApproved('),
      dilim.indexOf('createOneApproved(') + 200,
    );
    expect(cagri).toContain('boostId');
    expect(cagri).not.toContain('kayit.client_id');
  });
});
