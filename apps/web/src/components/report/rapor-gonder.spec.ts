import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PAYLAŞ VE GÖNDER EKRANI.
 *
 * Bu ekrandan MÜŞTERİYE mail gidiyor: yanlış giden bir şey geri alınamıyor.
 * Kapılar hem sunucuda hem burada; ekrandaki kontrol kullanıcıyı bir hata
 * mesajıyla karşılaşmadan doğru yere yönlendiriyor.
 */
const KAYNAK = readFileSync(join(__dirname, 'rapor-gonder.tsx'), 'utf8');

describe('RaporGonder', () => {
  it('KRİTİK: DOĞRULANMAMIŞ gönderende "Gönder" KAPALI', () => {
    // Sunucu da reddediyor; ekranda söylemek kullanıcıyı hata almadan
    // Ayarlar ekranına yönlendiriyor.
    expect(KAYNAK).toContain('!taslak?.senderReady');
    expect(KAYNAK).toContain('E-posta ayarların doğrulanmamış');
  });

  it('KRİTİK: ALICI BOŞSA gönderilemiyor ve sebebi yazılı', () => {
    // Sessizce boş bırakmak, "gönder"e basınca hata almak demek.
    expect(KAYNAK).toContain('alici.trim().length === 0');
    expect(KAYNAK).toContain('kayıtlı iletişim adresi yok');
  });

  it('mail metni DÜZENLENEBİLİR — anlatı veriden üretilemiyor', () => {
    /*
     * Sayılar rapordan geliyor ama "Urla bölgesindeki konut aramalarında..."
     * gibi cümleler uydurulamaz; uydurmak müşteriye yanlış bir strateji
     * anlatmak olurdu.
     */
    expect(KAYNAK).toContain('<textarea');
    expect(KAYNAK).toContain('değerlendirme kısmını sen yaz');
  });

  it('PDF DÜZ BAĞLANTI — fetch ile belleğe alınmıyor', () => {
    // `fetch` gövdeyi belleğe alıp blob üretmek demek; tarayıcının kendi
    // indirme akışı hem ucuz hem de ilerleme gösteriyor.
    expect(KAYNAK).toContain('href={`${API_URL}/reports/pdf');
    expect(KAYNAK).not.toContain("apiFetch('/reports/pdf");
  });

  it('KRİTİK: veri yokken indirme ve paylaşma KAPALI', () => {
    /*
     * KORUMA İKİ DOSYAYA BÖLÜNDÜ ve iddia da öyle olmalı: "Müşteriye gönder"
     * düğmesi kalkıp yerine "Paylaş" menüsü geldiğinde (`share-controls.tsx`)
     * `disabled` kontrolü oraya taşındı. Yalnızca bu dosyaya bakan bir iddia,
     * korumanın kaybolduğu bir dünyada da geçerdi.
     *
     * Veri yokken üretilen bir PDF ya da paylaşım linki, müşteriye BOŞ bir
     * belge göndermek demek.
     */
    expect(KAYNAK).toContain('pointer-events-none');
    const menu = readFileSync(join(__dirname, 'share-controls.tsx'), 'utf8');
    expect(menu).toContain('disabled={busy || !hasData}');
  });

  it('sunucunun KENDİ hata mesajı gösteriliyor', () => {
    expect(KAYNAK).toContain('err instanceof ApiRequestError ? err.message');
  });

  it('gönderim sonucu ALICIYI yazıyor — "gönderildi" tek başına yetmiyor', () => {
    expect(KAYNAK).toContain('adresine gönderildi');
  });
});
