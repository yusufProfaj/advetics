import type { Uyari } from '@advetics/shared';

/**
 * ═══ ÖDEME UYARISI MAİLİ — GÖVDE ═══
 *
 * Saf fonksiyon: uyarı listesinden HTML üretiyor, hiçbir şey göndermiyor.
 * Gönderimden ayrı olması, gövdenin gerçekten sınanabilmesi için — bir mail
 * şablonunu "gözle kontrol ettim" ile geçmek, yanlış müşteri adının aylarca
 * gitmesi demek.
 */

export interface OdemeMailIcerigi {
  konu: string;
  html: string;
}

/** Aynı workspace'in satırları bir arada dursun — mail müşteri müşteri okunuyor. */
function workspaceBazindaGrupla(uyarilar: Uyari[]): Map<string, Uyari[]> {
  const m = new Map<string, Uyari[]>();
  for (const u of uyarilar) {
    const ad = u.clientName ?? 'Atanmamış';
    const g = m.get(ad) ?? [];
    g.push(u);
    m.set(ad, g);
  }
  return m;
}

function kacar(metin: string): string {
  /*
   * HTML KAÇIŞI ZORUNLU. Müşteri ve hesap adları kullanıcı girdisi ve maile
   * gömülüyor; `&` içeren bir firma adı ("A & B Yapı") kaçırılmazsa gövdeyi
   * bozuyor, `<` içeren bir ad ise doğrudan enjeksiyon.
   */
  return metin
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Ödeme sorunu maili.
 *
 * YENİ OLANLAR AYRICA İŞARETLİ. Aynı sorun düzelene kadar günde iki kez mail
 * gidiyor ve dördüncü mailden sonra kimse okumuyor; "bu sabah EKLENEN" bilgisi
 * o maili yeniden okunur kılan tek şey.
 */
export function odemeMailiOlustur(
  uyarilar: Uyari[],
  yeniAnahtarlar: Set<string>,
  panelUrl: string,
): OdemeMailIcerigi {
  const gruplar = workspaceBazindaGrupla(uyarilar);
  const yeniSayisi = uyarilar.filter((u) => yeniAnahtarlar.has(anahtar(u))).length;

  /*
   * KONUDA SAYI VAR. "Ödeme uyarısı" konulu bir mail, açılmadan hangi
   * ölçekte bir sorun olduğunu söylemiyor; gelen kutusunda arka arkaya duran
   * iki mailin farkı da görünmüyor.
   */
  const konu =
    yeniSayisi > 0
      ? `Advetics — ${uyarilar.length} reklam hesabında ödeme sorunu (${yeniSayisi} yeni)`
      : `Advetics — ${uyarilar.length} reklam hesabında ödeme sorunu sürüyor`;

  const satirlar = [...gruplar.entries()]
    .map(([workspace, grup]) => {
      const hucreler = grup
        .map((u) => {
          const yeni = yeniAnahtarlar.has(anahtar(u));
          return `
            <tr>
              <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;">
                ${kacar(u.adAccountName ?? '—')}
                ${yeni ? '<span style="margin-left:6px;padding:1px 6px;border-radius:9999px;background:#e11d2e;color:#fff;font-size:10px;">YENİ</span>' : ''}
              </td>
              <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;">
                ${kacar(u.platform === 'google' ? 'Google Ads' : 'Meta')}
              </td>
              <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
                ${kacar(u.detay)}
              </td>
            </tr>`;
        })
        .join('');

      return `
        <p style="margin:18px 0 6px;font-size:14px;font-weight:600;color:#111827;">
          ${kacar(workspace)}
        </p>
        <table style="width:100%;border-collapse:collapse;">${hucreler}</table>`;
    })
    .join('');

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111827;max-width:640px;">
      <p style="margin:0 0 4px;font-size:15px;font-weight:600;">
        ${uyarilar.length} reklam hesabında ödeme sorunu var
      </p>
      <p style="margin:0 0 12px;font-size:13px;color:#6b7280;">
        Bu hesaplarda reklamlar yayınlanmıyor. Ödeme platformun kendi
        arayüzünden yapılıyor — panelden çözülemiyor.
      </p>
      ${satirlar}
      <p style="margin:20px 0 0;font-size:12px;color:#6b7280;">
        <a href="${kacar(panelUrl)}" style="color:#e11d2e;">Advetics panelini aç</a>
        · Bu mail hesap durumu kontrolü sonrası otomatik gönderildi.
      </p>
    </div>`;

  return { konu, html };
}

/** Uyarının kimliği — "yeni mi" karşılaştırması ve mükerrer engeli bunu kullanıyor. */
export function anahtar(u: Uyari): string {
  return `${u.kod}:${u.adAccountId ?? u.clientId ?? '-'}`;
}
