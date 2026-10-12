/**
 * CLICK-TO-WHATSAPP KARŞILAMA MESAJI (`page_welcome_message`) — SENTEZ D-M6.
 *
 * NEDEN VAR: alan gönderilmezse kişinin WhatsApp kutusuna düşen hazır cümle
 * Meta'nın varsayılanı ve İNGİLİZCE (*"Hello! Can I get more info on
 * this?"*, brief 06). Türk müşteride reklamın ilk mesajı İngilizce çıkıyor,
 * hata yok: bunu ilk gören, mesajı alan işletme.
 *
 * BİÇİM RESMÎ BELGEDEN (Click-to-WhatsApp, v25.0, 2026-10-12'de yeniden
 * okundu): `type: VISUAL_EDITOR`, `version: 2`, `landing_screen_type:
 * welcome_message`, `media_type: text`, `text_format.customer_action_type`
 * ve `text_format.message`. İki örnek var ve TEK bir `customer_action_type`
 * taşıyorlar:
 * - `autofill_message`: `message.autofill_message.content` + `message.text`
 * - `ice_breakers`: `message.text` + `message.ice_breakers[{title}]`
 * İkisinin BİRLİKTE gönderilebildiği yazmıyor; birleşik bir gövde uydurmak
 * Meta'nın birini sessizce atması ihtimalini açardı. Hızlı soru varsa
 * `ice_breakers`, yoksa `autofill_message` (tahmin etmektense kısıtla).
 *
 * ÖLÇÜLMEDİ (canlı ölçüm listesi):
 * - KONUM: oluşturma örneği alanı `link_data` içine koyuyor; okuma örneği
 *   `object_story_spec` köküne. Video için örnek YOK; yönetici kararıyla
 *   `video_data` içine aynı biçimde gidiyor. Geri okuma iki yere de bakıyor.
 * - NESNE Mİ DİZGE Mİ: oluşturma örneğinde yer tutucu dizge, okuma
 *   örneğinde nesne. Nesne gönderiliyor; dizge dönerse çözülüp kıyaslanıyor.
 * - `autofill_message` dalında `message.text`in kişiye nerede göründüğü:
 *   belge `<GREETING_MESSAGE>` diyor; aynı cümle iki alana yazılıyor ki
 *   hangisi görünürse görünsün Türkçe olsun.
 * - SINIRLAR: WhatsApp için yazılmamış. Messenger sayfasının sınırları
 *   (mesaj ≤ 300, soru başlığı ≤ 80) DAR taraf olarak uygulanıyor.
 *
 * BANNER SETİ (`asset_feed_spec`) YOLUNDA GÖNDERİLMİYOR: belge bu alanın
 * varlık akışındaki yerini hiç göstermiyor (yalnız iş ortağı akışının
 * `partner_app_welcome_message_flow_id`si var, o başka bir şey). Konumu
 * tahmin etmek yerine gönderilmiyor ve karar tablosu bunu SÖYLÜYOR
 * (`KARSILAMA_SETTE_YOK_CUMLESI`).
 *
 * İÇERİK UYDURULMAZ: Marka Merkezi'nde karşılama ya da hazır soru alanı
 * YOK (2026-10-12, `client_profiles` tarandı). Hazır mesaj sade bir Türkçe
 * varsayılan; hızlı soru YALNIZ kullanıcı yazarsa. Yapay zekâ soru üretmiyor:
 * müşteriye "fiyat listesi var mı" düğmesi koymak, işletmenin vermediği bir
 * sözü vermek olabilir.
 */
import { z } from 'zod';

export const WHATSAPP_VARSAYILAN_MESAJ = 'Merhaba, reklamınızı gördüm, bilgi almak istiyorum.';
export const KARSILAMA_MESAJ_SINIRI = 300;
export const HIZLI_SORU_SINIRI = 80;
export const HIZLI_SORU_EN_COK = 3;

export const whatsappKarsilamaSchema = z.object({
  mesaj: z.string().max(KARSILAMA_MESAJ_SINIRI),
  hizliSorular: z.array(z.string().max(HIZLI_SORU_SINIRI)).max(HIZLI_SORU_EN_COK),
});
export type WhatsappKarsilama = z.infer<typeof whatsappKarsilamaSchema>;

export interface CozulmusKarsilama {
  mesaj: string;
  hizliSorular: string[];
  /** Ekranda: "Varsayılan Türkçe mesaj" ya da "Senin yazdığın". */
  kaynak: 'varsayilan' | 'kullanici';
}

/**
 * Kayıtlı değerden gidecek içerik. Boş mesaj VARSAYILANA döner: boş bir
 * karşılama gönderilemez ve gönderilmezse Meta İngilizce yazar — boşu
 * "kullanıcı mesaj istemedi" diye okumak tam da kaçtığımız sonuç olurdu.
 * Boş sorular atılır (ekranın boş kutusu bir soru değil).
 */
export function karsilamaCoz(k: WhatsappKarsilama | null | undefined): CozulmusKarsilama {
  const mesaj = k?.mesaj.trim() ?? '';
  const hizliSorular = (k?.hizliSorular ?? []).map((x) => x.trim()).filter(Boolean).slice(0, HIZLI_SORU_EN_COK);
  return {
    mesaj: mesaj || WHATSAPP_VARSAYILAN_MESAJ,
    hizliSorular,
    kaynak: mesaj || hizliSorular.length ? 'kullanici' : 'varsayilan',
  };
}

/** Kreatife giden gövde (resmî belgedeki iki örnekten biri, birebir yapı). */
export function sayfaKarsilamaMesaji(k: CozulmusKarsilama): Record<string, unknown> {
  const ortak = { type: 'VISUAL_EDITOR', version: 2, landing_screen_type: 'welcome_message', media_type: 'text' };
  if (k.hizliSorular.length > 0) {
    return {
      ...ortak,
      text_format: {
        customer_action_type: 'ice_breakers',
        message: { text: k.mesaj, ice_breakers: k.hizliSorular.map((title) => ({ title })) },
      },
    };
  }
  return {
    ...ortak,
    text_format: {
      customer_action_type: 'autofill_message',
      message: { autofill_message: { content: k.mesaj }, text: k.mesaj },
    },
  };
}

/** Karar tablosu ve derleyici notu: banner setinde karşılama gönderilemiyor. */
export const KARSILAMA_SETTE_YOK_CUMLESI =
  "Bu reklam biçiminde karşılama mesajı Meta tarafından desteklenmiyor; ilk mesaj Meta'nın varsayılanı olacak";

/**
 * Geri okumada ANLAMCA kıyas: eylem türü, metin, hazır mesaj ve soru
 * başlıkları. Meta'nın ekleyebileceği başka anahtarlar (sürüm, kimlik)
 * kıyasa girmiyor; zaten uyuşmazlık yayını durdurmuyor (yanki.ts N-20).
 * Dizge dönerse JSON olarak çözülür; çözülemezse uyuşmaz sayılır.
 */
export function karsilamaOzu(v: unknown): string | null {
  let o = v;
  if (typeof o === 'string') {
    try {
      o = JSON.parse(o);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== 'object') return null;
  const tf = (o as Record<string, unknown>).text_format as Record<string, unknown> | undefined;
  const m = (tf?.message ?? {}) as Record<string, unknown>;
  const sorular = Array.isArray(m.ice_breakers) ? m.ice_breakers.map((x) => String((x as { title?: unknown })?.title ?? '')) : [];
  return JSON.stringify([
    String((o as Record<string, unknown>).landing_screen_type ?? ''),
    String(tf?.customer_action_type ?? ''),
    String(m.text ?? ''),
    String((m.autofill_message as { content?: unknown } | undefined)?.content ?? ''),
    sorular,
  ]);
}
