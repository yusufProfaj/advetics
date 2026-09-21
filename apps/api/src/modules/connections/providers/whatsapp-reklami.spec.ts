import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ CLICK-TO-WHATSAPP: NUMARA SORULMUYOR ═══
 *
 * Kullanıcının cümlesi: "en ufak örneği whatsapp numarasını elimle yazmamam
 * gerekiyor, metadan çekmesi lazım". Meta'nın belgesine göre doğrusu çekmek
 * bile değil — HİÇ SORMAMAK:
 *
 *   · Ad set: `destination_type: WHATSAPP` + `promoted_object.page_id`
 *   · Kreatif bağlantısı SABİT: `https://api.whatsapp.com/send`
 *   · CTA değeri `{ app_destination: 'WHATSAPP' }`
 *
 * Numarayı Meta, sayfaya BAĞLI WhatsApp hesabından alıyor.
 *
 * ÖNCEKİ HÂL `wa.me/<numara>` kuruyordu ve numarayı kullanıcıya yazdırıyordu.
 * İki sorunu vardı: Meta'da zaten tanımlı bir bilgiyi ikinci kez ve hatalı
 * girme fırsatı, ve yazılan numara ile sayfaya bağlı numara ayrıştığında
 * reklamın başka bir hatta düşmesi — hiçbir hata vermeden.
 *
 * Canlı çağrı yapan bir test yok ve olamaz; karar kaynak taramasıyla
 * kilitleniyor.
 */
const KAYNAK = readFileSync(join(__dirname, 'meta.provider.ts'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

describe('tarama boşa düşmüyor', () => {
  it('kreatif kurucusu yakalandı', () => {
    expect(KAYNAK).toContain('function buildCreativeSpec(');
  });
});

describe('numara hiç kullanılmıyor', () => {
  it('KRİTİK: `wa.me` KALMADI', () => {
    // Geri gelirse numara yeniden bir zorunluluk olur.
    expect(KAYNAK).not.toContain('wa.me');
  });

  it('KRİTİK: bağlantı Meta’nın belgelediği SABİT adres', () => {
    expect(KAYNAK).toContain("'https://api.whatsapp.com/send'");
  });

  it('KRİTİK: `whatsappNumber` alanı DEPODA KALMADI', () => {
    /*
     * Alanı bırakıp okumamak daha kötü olurdu: kullanıcı dolduruyor, hiçbir
     * şey değişmiyor ve bunu ancak reklam yanlış hatta düştüğünde anlıyor.
     */
    const govde = readFileSync(join(__dirname, '..', 'provider.types.ts'), 'utf8');
    expect(govde).not.toContain('whatsappNumber');
  });
});

describe('CTA değeri', () => {
  it('KRİTİK: WhatsApp’ta `app_destination` gidiyor', () => {
    /*
     * `{ link }` vermek belgelenen biçim DEĞİL ve Meta onu sessizce kabul
     * edip butonu tarayıcıya yönlendirebiliyor: reklam yayınlanır, tıklayan
     * kişi WhatsApp yerine bir web sayfası görür, hiçbir hata düşmez.
     */
    expect(KAYNAK).toContain("{ app_destination: 'WHATSAPP' }");
    expect(KAYNAK).toContain("req.spec.destinationType === 'WHATSAPP'");
  });

  it('form kampanyasında lead form kimliği DEĞİŞMEDİ', () => {
    // WhatsApp dalını eklerken form dalını bozmak, canlıda öğrenilmiş bir
    // yolu kaybetmek olurdu.
    expect(KAYNAK).toContain('{ lead_gen_form_id: leadFormId }');
  });
});
