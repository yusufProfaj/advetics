/**
 * ═══ ŞİFRE SIFIRLAMA MAİLİ — GÖVDE ═══
 *
 * Saf fonksiyon: token ve panel adresinden HTML üretiyor, hiçbir şey
 * göndermiyor. `odeme-maili.ts` ile aynı gerekçe — bir mail şablonunu
 * "gözle kontrol ettim" ile geçmek, kırık bir bağlantının kullanıcıya
 * gitmesi ve arızanın yalnızca ALICI tarafından görülmesi demek.
 */

export interface SifirlamaMailIcerigi {
  konu: string;
  html: string;
  /** Testin ve log'un okuduğu hâl — HTML'in içinden çekip almak kırılgan. */
  baglanti: string;
}

/** Sıfırlama linkinin ömrü. `auth.service.ts` ile AYNI olmak zorunda. */
export const SIFIRLAMA_GECERLILIK_DK = 60;

export function sifirlamaBaglantisi(panelUrl: string, token: string): string {
  /*
   * `encodeURIComponent` ZORUNLU DEĞİL AMA VAR. Token `base64url` üretiliyor
   * ve o alfabe zaten URL güvenli; ama kodlamayı çağıranın bilgisine
   * bırakmak, token üretimi bir gün `base64`e dönerse (`+` ve `/` taşır)
   * sessizce bozulan bir bağlantı demek. Bozulma belirtisi "link çalışmıyor"
   * ve sebebi hiçbir logda görünmez.
   */
  return `${panelUrl.replace(/\/+$/, '')}/sifre-sifirla?token=${encodeURIComponent(token)}`;
}

export function sifirlamaMailiOlustur(panelUrl: string, token: string): SifirlamaMailIcerigi {
  const baglanti = sifirlamaBaglantisi(panelUrl, token);

  return {
    konu: 'Advetics — şifre sıfırlama',
    baglanti,
    html: `<!doctype html>
<html lang="tr"><body style="margin:0;background:#f6f7f9;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2430">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px">
    <h1 style="margin:0 0 12px;font-size:18px;font-weight:600">Şifreni sıfırla</h1>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6">
      Advetics panelinde şifre sıfırlama talebinde bulunuldu. Yeni şifreni
      belirlemek için aşağıdaki düğmeye tıkla.
    </p>
    <p style="margin:0 0 20px">
      <a href="${baglanti}" style="display:inline-block;background:#1f2430;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600">Yeni şifre belirle</a>
    </p>
    <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#5b6472">
      Bu bağlantı <strong>${SIFIRLAMA_GECERLILIK_DK} dakika</strong> geçerli ve
      yalnızca bir kez kullanılabilir. Süre dolarsa giriş ekranından yeni bir
      talep oluşturabilirsin.
    </p>
    <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#5b6472">
      Düğme çalışmazsa bu adresi tarayıcına yapıştır:<br>
      <span style="word-break:break-all;color:#1f2430">${baglanti}</span>
    </p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#5b6472">
      Bu talebi sen oluşturmadıysan bu maili yok sayabilirsin — şifren
      değişmedi ve açık oturumların etkilenmedi.
    </p>
  </div>
</body></html>`,
  };
}
