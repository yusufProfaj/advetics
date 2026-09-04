import type { SignatureCleanReport } from './schemas/email-account.schema';

/**
 * ═══ NEDEN `packages/shared` ALTINDA ═══
 *
 * Bu fonksiyon `apps/api` içindeydi ve mail gövdesi GÖNDERİMDE ondan
 * geçiyordu. Rapor gönderme penceresi gövdeyi artık RENDER EDEREK gösteriyor
 * (ham HTML yerine) ve CLAUDE.md'nin kuralı net: "önizleme YALAN SÖYLEMEMELİ"
 * — ekranda görülen, gönderilecek hâlin ta kendisi olmalı.
 *
 * Panel `apps/api`yi import edemiyor. Seçenekler paneldeki ikinci bir
 * temizleyici (doğduğu anda ayrışır ve önizleme sessizce yalan söylemeye
 * başlar) ya da fonksiyonu ortak pakete taşımaktı. Fonksiyon SAF — tek bir
 * tip importu dışında bağımlılığı yok, Node API kullanmıyor — yani taşımanın
 * bedeli sıfır.
 */

/**
 * ═══ İMZA HTML'İ TEMİZLENİYOR — VE NE ATILDIĞI SÖYLENİYOR ═══
 *
 * İmza kullanıcıdan geliyor, veritabanında duruyor, panelde ÖNİZLENİYOR ve
 * müşteriye giden maile gömülüyor. Üç yerin üçü de saldırı yüzeyi:
 *
 *   · Panelde önizleme → saklanmış XSS (başka bir danışmanın oturumu).
 *   · Giden mail → alıcının istemcisinde çalışabilecek içerik.
 *
 * TEMİZLİK GİRİŞTE, ÇIKIŞTA DEĞİL. Saklanan şey gönderilecek şey olmalı:
 * kullanıcı kaydettikten sonra "neyin gideceğini" görüyor. Çıkışta
 * temizleseydik, kayıtlı hâl ile gönderilen hâl ayrışır ve önizleme yalan
 * söylerdi.
 *
 * BEYAZ LİSTE, KARA LİSTE DEĞİL. Kara liste her yeni etikette güncellenmek
 * zorunda ve unutulan bir tanesi açık kapı bırakıyor.
 */
const IZINLI_ETIKETLER = new Set([
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'p', 'div', 'span', 'br', 'hr',
  'a', 'img',
  'b', 'strong', 'i', 'em', 'u', 's',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'small', 'font',
]);

/** `style` İZİNLİ: imzalar renk ve hizayı onunla taşıyor. `on*` DEĞİL. */
const IZINLI_OZNITELIKLER = new Set([
  'href', 'src', 'alt', 'title', 'width', 'height', 'align', 'valign',
  'border', 'cellspacing', 'cellpadding', 'colspan', 'rowspan',
  'style', 'target', 'rel', 'bgcolor', 'color', 'face', 'size', 'class',
]);

/**
 * GMAIL PROXY ADRESLERİ GERÇEK KAYNAĞINA ÇEVRİLİYOR.
 *
 * Gmail imza HTML'ini kopyaladığında görselleri kendi önbelleğine yönlendiren
 * adresler yazıyor:
 *
 *   https://ci3.googleusercontent.com/meips/<imza>=s0-d-e1-ft#https://profaj.com/sign/logo.jpg
 *
 * `#` işaretinden SONRASI gerçek kaynak. Proxy adresi Gmail dışında
 * güvenilir çalışmıyor: bizim gönderdiğimiz mailde görseller kırık çıkar ve
 * bu ancak alıcının ekranında görülür.
 */
const PROXY = /^https?:\/\/ci\d*\.googleusercontent\.com\/[^#\s]*#(https?:\/\/.+)$/i;

export interface TemizSonuc {
  html: string;
  rapor: SignatureCleanReport;
}

export function imzaTemizle(giris: string): TemizSonuc {
  const removedTags = new Set<string>();
  const removedAttributes = new Set<string>();
  let rewrittenImages = 0;

  // Yorumlar ve tehlikeli bloklar İÇERİĞİYLE birlikte atılıyor: `<script>`in
  // yalnızca etiketini atmak gövdesini düz metin olarak bırakırdı.
  let html = giris.replace(/<!--[\s\S]*?-->/g, '');
  html = html.replace(/<(script|style|iframe|object|embed|link|meta)\b[\s\S]*?<\/\1\s*>/gi, (_m, t) => {
    removedTags.add(String(t).toLowerCase());
    return '';
  });
  html = html.replace(/<(script|style|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, (_m, t) => {
    removedTags.add(String(t).toLowerCase());
    return '';
  });

  html = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (tam, adHam: string, oznHam: string) => {
    const ad = adHam.toLowerCase();
    if (!IZINLI_ETIKETLER.has(ad)) {
      removedTags.add(ad);
      return '';
    }
    if (tam.startsWith('</')) return `</${ad}>`;

    const oznitelikler: string[] = [];
    const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(oznHam)) !== null) {
      const anahtar = m[1]!.toLowerCase();
      let deger = m[3] ?? m[4] ?? m[5] ?? '';

      if (!IZINLI_OZNITELIKLER.has(anahtar)) {
        removedAttributes.add(anahtar);
        continue;
      }

      // `javascript:` ve `data:` ŞEMALARI ATILIYOR. `data:` görselleri de
      // kapsıyor: mail istemcilerinin çoğu onları zaten engelliyor ve
      // `data:text/html` bir açık kapı.
      /*
       * ŞEMA BEYAZ LİSTESİ DEĞİL, KARA LİSTE — ve listeye üç şema EKLENDİ.
       *
       * `javascript:`, `data:` ve `vbscript:` çalıştırma yüzeyi. `blob:`,
       * `file:` ve `cid:` ise BAŞKA bir sorun: hepsi ekranda ÇALIŞIYOR ama
       * mailde ÖLÜ. Mail gövdesi artık panelde render edildiği ve kullanıcı
       * oraya görsel yapıştırabildiği için bu, önizlemenin YALAN SÖYLEMESİ
       * demek — panelde görsel görünür, müşteriye kırık gider ve farkı
       * yalnızca alıcı görür.
       *
       * `cid:` mail içi gömülü ek referansı ve biz ek gömmüyoruz; kopyalanan
       * bir Outlook imzasından geliyor ve alıcıda hiçbir zaman çözülmüyor.
       */
      if (
        (anahtar === 'href' || anahtar === 'src') &&
        /^\s*(javascript|data|vbscript|blob|file|cid):/i.test(deger)
      ) {
        removedAttributes.add(`${anahtar}(şema)`);
        continue;
      }

      if (anahtar === 'src') {
        const p = PROXY.exec(deger);
        if (p) {
          deger = p[1]!;
          rewrittenImages++;
        }
      }

      oznitelikler.push(`${anahtar}="${deger.replace(/"/g, '&quot;')}"`);
    }

    // DIŞ BAĞLANTILARDA `rel` ZORUNLU: imzadaki bağlantılar yeni sekmede
    // açılıyor ve `noopener` olmadan hedef sayfa `window.opener` üzerinden
    // panele erişebiliyor.
    if (ad === 'a' && oznitelikler.some((o) => o.startsWith('target='))) {
      if (!oznitelikler.some((o) => o.startsWith('rel='))) {
        oznitelikler.push('rel="noopener noreferrer"');
      }
    }

    return `<${ad}${oznitelikler.length ? ' ' + oznitelikler.join(' ') : ''}>`;
  });

  return {
    html: html.trim(),
    rapor: {
      removedTags: [...removedTags].sort(),
      removedAttributes: [...removedAttributes].sort(),
      rewrittenImages,
    },
  };
}
