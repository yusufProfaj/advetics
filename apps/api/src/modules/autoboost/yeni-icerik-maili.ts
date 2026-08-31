/**
 * ═══ YENİ İÇERİK BİLDİRİM MAİLİ — GÖVDE ═══
 *
 * Saf fonksiyon: onay kuyruğuna düşen yeni gönderi/videolardan HTML
 * üretiyor, hiçbir şey göndermiyor. Ayrım `odeme-maili.ts`'teki ile aynı ve
 * sebebi de aynı: bir mail şablonunu "gözle kontrol ettim" ile geçmek,
 * yanlış müşteri adının aylarca gitmesi demek.
 */

export interface YeniIcerikKarti {
  title: string | null;
  permalink: string | null;
  platform: 'meta' | 'google';
}

export interface YeniIcerikMailIcerigi {
  konu: string;
  html: string;
}

function kacar(metin: string): string {
  /*
   * HTML KAÇIŞI ZORUNLU. Gönderi metni müşterinin kendi içeriği ve maile
   * gömülüyor; `<` içeren bir başlık doğrudan enjeksiyon olurdu.
   */
  return metin
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Bildirim maili.
 *
 * TEK MAİLDE TOPLU. Bir süpürme turu birden fazla yeni gönderi bulabiliyor;
 * her biri için ayrı mail atmak `odeme-maili.ts`'in kaçındığı aynı yorgunluğu
 * üretirdi — dördüncü mailden sonra kimse okumuyor.
 */
export function yeniIcerikMailiOlustur(
  clientName: string,
  kartlar: YeniIcerikKarti[],
  panelUrl: string,
): YeniIcerikMailIcerigi {
  const konu =
    kartlar.length === 1
      ? `Advetics — ${clientName}: yeni gönderi onayı bekliyor`
      : `Advetics — ${clientName}: ${kartlar.length} yeni gönderi onayı bekliyor`;

  const satirlar = kartlar
    .map((k) => {
      const platformAdi = k.platform === 'google' ? 'YouTube' : 'Instagram';
      const baslik = kacar((k.title ?? '(başlıksız gönderi)').slice(0, 200));
      return `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;">
            ${baslik}
          </td>
          <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
            ${kacar(platformAdi)}
          </td>
          <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;">
            ${k.permalink ? `<a href="${kacar(k.permalink)}" style="color:#e11d2e;">gönderiyi gör</a>` : '—'}
          </td>
        </tr>`;
    })
    .join('');

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111827;max-width:640px;">
      <p style="margin:0 0 4px;font-size:15px;font-weight:600;">
        ${kacar(clientName)}: ${kartlar.length} yeni gönderi Auto-Boost onayında
      </p>
      <p style="margin:0 0 12px;font-size:13px;color:#6b7280;">
        Bu gönderiler reklam olarak öne çıkarılmak için onay bekliyor.
        Onaylanmadan hiçbir bütçe harcanmaz.
      </p>
      <table style="width:100%;border-collapse:collapse;">${satirlar}</table>
      <p style="margin:20px 0 0;font-size:12px;color:#6b7280;">
        <a href="${kacar(panelUrl)}" style="color:#e11d2e;">Onay kuyruğunu aç</a>
        · Bu mail yeni içerik tespit edildiğinde otomatik gönderildi.
      </p>
    </div>`;

  return { konu, html };
}
