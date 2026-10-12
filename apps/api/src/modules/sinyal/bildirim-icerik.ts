import { ozetPanelAdresi } from '@advetics/shared';

/**
 * ═══ BİLDİRİM İÇERİĞİ — KANALDAN BAĞIMSIZ GÖVDE + ÜÇ BİÇİMLEYİCİ (§ 7) ═══
 *
 * Gövde `bildirim_gonderimleri.govde`de KANALDAN BAĞIMSIZ saklanıyor;
 * Slack bloğu, Teams kartı ve HTML gönderim anında bundan üretiliyor.
 * Yeniden denemede AYNI içerik gidiyor (sayılar özet anında donmuş) ve bir
 * biçimleyici düzeltilince bekleyen satırlar düzeltilmiş hâliyle gidiyor.
 *
 * SESSİZ KESME YOK: en çok `GOVDE_SATIR_SINIRI` satır, fazlası "ve N sinyal
 * daha" + panel bağlantısı. Marka Advetics (beyaz etiket kuralı, rapor
 * kapağıyla aynı karar): gövdede ajans adı yok.
 */

export const GOVDE_SATIR_SINIRI = 10;

export interface GovdeSatiri {
  /** Kalın ön ek (workspace / varlık adı). */
  etiket: string;
  metin: string;
}

export interface BildirimGovdesi {
  baslik: string;
  satirlar: GovdeSatiri[];
  /** Gövdeye sığmayan satır sayısı. */
  fazla: number;
  fazlaBirimi: string;
  baglanti: { metin: string; adres: string } | null;
  /** E-postanın konu satırı (Slack/Teams'te başlık). */
  konu: string;
}

/**
 * SAKLANAN gövde: bağlantı ADRES değil HEDEF olarak duruyor. Adresin kökü
 * (`APP_URL`) gönderim anında ekleniyor; kural motoru yapılandırmayı
 * bilmiyor ve kök değişirse bekleyen satırlar eski adrese gitmesin.
 */
export type SaklananGovde = Omit<BildirimGovdesi, 'baglanti'> & {
  baglanti: { metin: string; yol: 'sinyaller' | 'kurallar' | 'haftalik_ozet'; hafta?: string } | null;
  /**
   * Haftalık özet (Paket B): e-posta kanalı kısa sürüm DEĞİL, özetin TAM
   * mailini alıyor. Gövde HTML'i saklamıyor, HAFTAYI saklıyor; HTML gönderim
   * anında saklanan (değişmez) özetten üretiliyor, böylece adres kökü de
   * gönderim anının kökü oluyor.
   */
  ozetHaftasi?: string;
};

/** Saklanan gövdeyi gönderilecek gövdeye çevirir. */
export function govdeCoz(g: SaklananGovde, appUrl: string, clientId: string): BildirimGovdesi {
  const { ozetHaftasi: _h, ...govde } = g;
  return {
    ...govde,
    baglanti: g.baglanti
      ? { metin: g.baglanti.metin, adres: panelBaglantisi(appUrl, g.baglanti.yol, clientId, g.baglanti.hafta) }
      : null,
  };
}

/** Satırları sınırla, fazlasını SAY. */
export function govdeKur(p: {
  baslik: string;
  konu: string;
  satirlar: GovdeSatiri[];
  fazlaBirimi: string;
  baglanti: SaklananGovde['baglanti'];
}): SaklananGovde {
  return {
    baslik: p.baslik,
    konu: p.konu,
    satirlar: p.satirlar.slice(0, GOVDE_SATIR_SINIRI),
    fazla: Math.max(0, p.satirlar.length - GOVDE_SATIR_SINIRI),
    fazlaBirimi: p.fazlaBirimi,
    baglanti: p.baglanti,
  };
}

function fazlaMetni(g: BildirimGovdesi): string | null {
  return g.fazla > 0 ? `ve ${g.fazla} ${g.fazlaBirimi} daha` : null;
}

// ─── Slack ──────────────────────────────────────────────────────────────────

/**
 * KULLANICI KAYNAKLI ADLAR (kural, workspace, kampanya) KAÇIŞLANIYOR.
 *
 * Slack mrkdwn'da `<...>` bir KOMUT: `<!channel>`/`<!here>` bütün kanalı
 * uyarıyor, `<@U123>` birini etiketliyor, `<https://x|metin>` başka bir
 * adrese bağlanıyor. Kampanyasına "<!channel> ACİL" adını veren biri her
 * sabah bütün kanalı çaldırırdı (Ajan 4, N-e). Slack belgesinin kaçışı üç
 * karakter: `&`, `<`, `>`; bunlar kaçışlanınca komut düz metne dönüyor.
 * `text` alanı DA mrkdwn olarak okunuyor (telefon bildirimi): o da kaçışlı.
 */
export function slackKac(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Teams (MessageCard markdown + Adaptive Card TextBlock markdown): bağlantı
 * sözdizimi `[metin](adres)`, vurgu ve HTML. Ters bölüyle kaçışlanıyor;
 * eski bağlayıcıda `<`/`>`/`&` ayrıca varlık (MessageCard sınırlı HTML yorumluyor).
 */
export function teamsKac(s: string, aile: 'baglayici' | 'workflows'): string {
  const md = s.replace(/[\\`*_[\]()#~|!]/g, (c) => `\\${c}`);
  // Adaptive Card HTML yorumlamıyor: varlık orada "&lt;" diye GÖRÜNÜRDÜ.
  return aile === 'baglayici' ? md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : md;
}

/*
 * ETİKETSİZ SATIR: haftalık özetin kısa sürümünde ("ve 2 satır daha
 * panelde") kalın ön ek yok; boş etiket `**` olarak görünmesin.
 */
export function slackGovdesi(g: BildirimGovdesi): Record<string, unknown> {
  const satirlar = g.satirlar.map((s) => `• ${s.etiket ? `*${slackKac(s.etiket)}* · ` : ''}${slackKac(s.metin)}`);
  const fazla = fazlaMetni(g);
  if (fazla) satirlar.push(`_${slackKac(fazla)}_`);
  const blocks: Array<Record<string, unknown>> = [
    { type: 'section', text: { type: 'mrkdwn', text: `*${slackKac(g.baslik)}*` } },
  ];
  if (satirlar.length > 0) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: satirlar.join('\n') } });
  if (g.baglanti) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `<${g.baglanti.adres}|${slackKac(g.baglanti.metin)}>` },
    });
  }
  // `text` BİLDİRİMİN KENDİSİ (telefon bildirimi, ekran okuyucu); blok
  // desteklemeyen istemci yalnız onu gösterir.
  return { text: slackKac(g.baslik), blocks };
}

// ─── Teams ──────────────────────────────────────────────────────────────────

/**
 * İKİ AİLE (MIMARI Ç-5): eski bağlayıcı (`*.webhook.office.com`) MessageCard,
 * Workflows (`*.logic.azure.com`) Adaptive Card ister. Hangisinin bugün
 * çalıştığı ÖLÇÜLMEDİ; Ajan 5 ikisini de gerçek bir kanala gönderip gözle
 * doğrulayacak.
 */
export function teamsGovdesi(g: BildirimGovdesi, aile: 'baglayici' | 'workflows'): Record<string, unknown> {
  const satirlar = g.satirlar.map((s) => `${s.etiket ? `**${teamsKac(s.etiket, aile)}** · ` : ''}${teamsKac(s.metin, aile)}`);
  const fazla = fazlaMetni(g);
  if (fazla) satirlar.push(`_${teamsKac(fazla, aile)}_`);
  const baslik = teamsKac(g.baslik, aile);
  if (aile === 'baglayici') {
    return {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      // `summary` bildirim önizlemesinde DÜZ metin: kaçışsız ham başlık.
      summary: g.baslik,
      title: baslik,
      text: satirlar.join('\n\n'),
      ...(g.baglanti
        ? { potentialAction: [{ '@type': 'OpenUri', name: g.baglanti.metin, targets: [{ os: 'default', uri: g.baglanti.adres }] }] }
        : {}),
    };
  }
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            { type: 'TextBlock', text: baslik, weight: 'Bolder', size: 'Medium', wrap: true },
            ...satirlar.map((t) => ({ type: 'TextBlock', text: t, wrap: true, spacing: 'Small' })),
          ],
          ...(g.baglanti ? { actions: [{ type: 'Action.OpenUrl', title: g.baglanti.metin, url: g.baglanti.adres }] } : {}),
        },
      },
    ],
  };
}

// ─── E-posta ────────────────────────────────────────────────────────────────

function htmlKac(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Düz, tablosuz HTML: kurumsal posta istemcileri stil dosyasını atıyor.
 * Renkler kurumsal kılavuzdan (siyah, gri `#302e2d`, kırmızı `#ff2400`).
 */
export function epostaHtml(g: BildirimGovdesi): string {
  const satirlar = g.satirlar
    .map((s) => `<li style="margin:0 0 6px 0">${s.etiket ? `<strong>${htmlKac(s.etiket)}</strong> · ` : ''}${htmlKac(s.metin)}</li>`)
    .join('');
  const fazla = fazlaMetni(g);
  return [
    '<div style="font-family:\'Open Sans\',Arial,sans-serif;color:#302e2d;font-size:14px;line-height:1.5">',
    `<p style="font-family:Montserrat,Arial,sans-serif;font-size:16px;font-weight:700;color:#000000;margin:0 0 12px 0">${htmlKac(g.baslik)}</p>`,
    satirlar ? `<ul style="padding-left:18px;margin:0 0 12px 0">${satirlar}</ul>` : '',
    fazla ? `<p style="margin:0 0 12px 0"><em>${htmlKac(fazla)}</em></p>` : '',
    g.baglanti
      ? `<p style="margin:0 0 12px 0"><a href="${htmlKac(g.baglanti.adres)}" style="color:#ff2400">${htmlKac(g.baglanti.metin)}</a></p>`
      : '',
    '<p style="margin:16px 0 0 0;font-size:12px;color:#302e2d">Advetics</p>',
    '</div>',
  ].join('');
}

/** Panel bağlantısı TEK YERDE (CLAUDE.md "bağlantıyı elle birleştirme"). */
export function panelBaglantisi(
  appUrl: string,
  yol: 'sinyaller' | 'kurallar' | 'haftalik_ozet',
  clientId: string,
  hafta?: string,
): string {
  // Haftalık özetin adresi kendi tek üreticisinden (shared, Paket B).
  if (yol === 'haftalik_ozet') return ozetPanelAdresi(appUrl, clientId, hafta);
  const kok = appUrl.replace(/\/+$/, '');
  const q = new URLSearchParams({ musteri: clientId });
  if (yol === 'sinyaller') {
    q.set('sekme', 'sinyaller');
    return `${kok}/iyilestir?${q.toString()}`;
  }
  return `${kok}/kurallar?${q.toString()}`;
}
