import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ BOOST AYARININ TEK KAYNAĞI ÖN AYAR ═══
 *
 * "Gönderi öne çıkar" ekranı bir zamanlar beş adımlı bir formdu ve aynı
 * satırda İKİ farklı bütçe davranışı taşıyordu:
 *
 *   · satıra tıklamak → formu besliyor  → `POST /boosts/manual` (form ayarı)
 *   · satırın sağındaki "Yayınla"       → `POST /autoboost/posts/:id/launch`
 *                                          (ÖN AYAR ayarı)
 *
 * İki ayrı API ucu, iki ayrı ayar kümesi, tek ekran. Kullanıcının "çok
 * karmaşık görünüyor" dediği şeyin merkezi buydu ve asıl tehlike görsel
 * değildi: aynı gönderi, hangi düğmeye bastığına göre FARKLI BÜTÇEYLE para
 * harcıyordu.
 *
 * Karar: ÖN AYAR GEÇERLİ, form kaldırıldı.
 *
 * Bu tarama kararı kilitliyor. Form geri gelirse (ya da biri panele ikinci
 * bir yayın yolu eklerse) burada düşer — kod incelemesinde gözden kaçması
 * kolay, üretimde bedeli para olan bir sapma.
 */
const DOSYA = join(__dirname, 'manual-boost.tsx');
const KAYNAK = readFileSync(DOSYA, 'utf8');

describe('elle boost ekranı — ön ayar tek kaynak', () => {
  it('tarama BOŞA DÜŞMÜYOR — dosya gerçekten elle boost ekranı', () => {
    /*
     * Bu iddia olmadan aşağıdakiler bir gün dosya yeniden adlandırıldığında
     * SESSİZCE geçer. CLAUDE.md: "dilim bulunamazsa HATA FIRLAT."
     */
    expect(KAYNAK).toContain('function ManualBoostForm');
    expect(KAYNAK).toContain('/boosts/posts');
  });

  it('KRİTİK: panel `/boosts/manual` ucunu ÇAĞIRMIYOR', () => {
    /*
     * O uç ön ayarı yok sayıp gövdedeki bütçe ve hedeflemeyi uyguluyor.
     * Panelden çağrılması, kullanıcının ön ayarda kurduğu bütçenin sessizce
     * atlanması demek.
     */
    expect(KAYNAK).not.toContain('/boosts/manual');
  });

  it('KRİTİK: ekranda bütçe/süre girdisi YOK — ikisi de ön ayardan geliyor', () => {
    // Bir bütçe kutusu geri gelirse, hangi değerin geçerli olduğu yine
    // belirsizleşir.
    expect(KAYNAK).not.toMatch(/setButce|setGun\b/);
  });

  it('KRİTİK: ekranda hedefleme seçimi YOK — şehir/yaş/kitle ön ayarda', () => {
    expect(KAYNAK).not.toMatch(/setSehirler|setYasMin|setYasMax|setCinsiyet/);
  });

  it('yayın yolu TEK: ön ayarla çalışan `/autoboost/posts/:id/launch`', () => {
    expect(KAYNAK).toContain('/autoboost/posts/');
  });

  it('ön ayar yoksa SEBEBİ yazılıyor — düğme sessizce kapanmıyor', () => {
    /*
     * Form kalktığı için ön ayar artık bir ÖN KOŞUL. Kapalı bir düğme
     * gösterip sebebini söylememek, kullanıcıya "çalışmıyor" göstermek
     * olurdu.
     */
    expect(KAYNAK).toContain('presetReady');
    expect(KAYNAK).toContain('Boost ön ayarı');
  });
});
