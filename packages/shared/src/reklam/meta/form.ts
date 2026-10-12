/**
 * Lead formu derleyicisi (TASARIM.md § 06.4 M-37..M-43, § 10.7 FRM-*).
 *
 * TEK FORM ÜRETİCİSİ. Meta'da form açan her yol (Marka Merkezi › Formlar'ın
 * "Meta'da yayınla"sı, AdvCampaign zinciri) gövdeyi BURADAN alır; sağlayıcı
 * yalnız gönderir. Önceden üç üretici vardı ve üçü ayrışmıştı:
 * - kütüphane yolu (`MetaProvider.createLeadForm`) onay kutularını Graph'in
 *   `leadgen_forms` belgesinde OLMAYAN bir `legal_content` sarmalayıcısıyla
 *   gönderiyordu (KVKK kutuları sessizce düşüyor olabilirdi), `locale` ve
 *   `block_display_for_non_targeted_viewer` göndermiyordu (form İngilizce ve
 *   hedef dışındaki kişiye açık) ve `is_optimized_for_quality`yi yalnız
 *   `true` iken yazıyordu;
 * - gömülü yol (`createEmbeddedLeadForm`) müşterinin sitesi yoksa Advetics'in
 *   gizlilik sayfasına düşüyordu (FRM-01: yanlış veri sorumlusu);
 * - bu fonksiyon ise hiç çağrılmıyordu.
 * `form-uretici-tek.spec.ts` ikinci bir üreticiyi kaynak taramasıyla yasaklıyor.
 *
 * Meta'da form SİLİNEMİYOR ve DÜZENLENEMİYOR, yani yanlış kurulmuş bir form
 * yalnız arşivlenebilir: yayından hemen sonra GERİ OKUNUR
 * (`formGeriOkumaDenetimi`).
 *
 * KVKK metinlerinin kendisini Advetics üretmiyor: ajansın hukuk danışmanının
 * standart metni girdi olarak geliyor; burada yalnız YERİ ve BİÇİMİ
 * denetleniyor.
 */
import { formAdi } from './adlandirma';
import type { MetaGovdesi } from './derle';
import { TELEFON_E164 } from '../taslak-alanlari';

/** Meta'nın standart soru türleri; Acemi'de kullanılanlar. */
export const STANDART_SORULAR = ['FULL_NAME', 'PHONE', 'EMAIL', 'CITY'] as const;
export type StandartSoru = (typeof STANDART_SORULAR)[number];

/**
 * Standart soru kodu: kütüphane formu Meta'nın ön doldurduğu beş türü
 * taşıyor (`PREFILL_QUESTIONS`, COMPANY_NAME dahil) ve hepsi aynı gövdeden
 * geçiyor.
 */
export type FormSorusu =
  | { tur: 'standart'; kod: StandartSoru | 'COMPANY_NAME' }
  | {
      tur: 'ozel';
      anahtar: string;
      etiket: string;
      /** Çoktan seçmeli soruda seçenekler; yoksa kısa cevap. */
      secenekler?: string[];
    };

/** FRM-07: hukuki sebep listeden seçilir, tahminle doldurulmaz. */
export const HUKUKI_SEBEPLER = ['acik_riza', 'sozlesme', 'mesru_menfaat'] as const;
export type HukukiSebep = (typeof HUKUKI_SEBEPLER)[number];

export interface FormSablonu {
  /** FRM-08: yayınlanan sürüm değişmez; düzeltme yeni sürüm. */
  surum: number;
  sorular: FormSorusu[];
  hukukiSebep: HukukiSebep | null;
  /** Ayrı pazarlama/ticari ileti izni; metin kanalları ADIYLA yazmalı. */
  pazarlamaIzniMetni: string | null;
  /**
   * Ek onay kutuları (kütüphane formu: KVKK açık rıza, ticari ileti). Her
   * kutunun zorunluluğu AÇIKÇA yazılıyor; Meta'nın varsayılanı ZORUNLU.
   */
  onayKutulari?: Array<{ metin: string; zorunlu: boolean }>;
  /**
   * `true` = "daha yüksek niyet" (`higher_intent`): gönder demeden önce bir
   * onay adımı. HER İKİ hâlde de açıkça gönderiliyor: Meta'nın varsayılanı
   * `false` ve varsayılana bırakmak, varsayılan değiştiğinde formun türünün
   * haber vermeden değişmesi demek.
   */
  kaliteOdakli: boolean;
  smsDogrulama: boolean;
  /** Meta'daki ad; verilmezse `formAdi(workspace, sürüm)`. */
  ad?: string;
  /** Giriş kartı (`context_card`); yoksa form doğrudan sorularla açılır. */
  giris?: { baslik: string; aciklama: string | null; stil: 'LIST_STYLE' | 'PARAGRAPH_STYLE' } | null;
  /** Teşekkür ekranı; yoksa Meta'nın kendi ekranı. */
  tesekkur?: FormTesekkur | null;
}

/**
 * Teşekkür ekranının düğmesi. ÜÇ TÜR ve her biri kendi zorunlu alanıyla:
 * bağlantısız bir VIEW_WEBSITE ya da numarasız bir CALL_BUSINESS göndermek
 * düğmeyi Meta'nın tahminine bırakmak olurdu.
 */
export type FormTesekkurDugmesi =
  | { tur: 'VIEW_WEBSITE'; metin: string; adres: string }
  | { tur: 'CALL_BUSINESS'; metin: string; telefon: string }
  | { tur: 'NONE' };

export interface FormTesekkur {
  baslik: string;
  govde: string;
  dugme: FormTesekkurDugmesi;
}

export interface FormProfili {
  workspaceKisaAdi: string;
  /** Müşterinin HTML aydınlatma sayfası; giriş anında doğrulanmış olmalı. */
  aydinlatmaAdresi: string | null;
  aydinlatmaBaglantiMetni: string;
}

/** Derleme seçenekleri: yalnız KAYNAĞIN farkını taşır, gövdeyi değil. */
export interface FormDerlemeSecenekleri {
  /**
   * FRM-07 (hukuki sebep) zorunlu mu. Kütüphane formunda hukuki sebep alanı
   * YOK; o form KVKK'yı kullanıcının yazdığı onay kutularıyla taşıyor. Oraya
   * bir sebep UYDURMAK (FRM-07 "tahminle doldurulmaz") yerine kütüphane yolu
   * kontrolü adıyla kapatıyor. Gövdeye etkisi yok: sebep Meta'ya gitmiyor.
   */
  hukukiSebepZorunlu?: boolean;
}

/**
 * FRM-04: özel bildirim eklenince Meta bildirimin kendisini KABUL ÖN ŞARTI
 * yapıyor. Gövdede aydınlatma özeti ya da "onaylıyorum" olursa isteğe bağlı
 * kutu fiilen zorunlu olur. Tek nötr cümle, sabit.
 */
export const FORM_NOTR_BILDIRIM = 'Aşağıdaki izin isteğe bağlıdır, işaretlemeden de gönderebilirsiniz.';
/**
 * Zorunlu kutu VARKEN nötr bildirim yalan söylerdi ("işaretlemeden de
 * gönderebilirsiniz"). Bu da "onaylıyorum" içermiyor (FRM-04).
 */
export const FORM_ZORUNLU_BILDIRIM = 'Formu göndermek için zorunlu kutuları işaretlemeniz gerekir.';
export const FORM_EN_COK_SORU = 15;
export const FORM_BAGLANTI_METNI_SINIRI = 70;

/**
 * FRM-05 yasak soru sözlüğü. Eşleşme küçük harfe çevrilmiş Türkçe metinde
 * KELİME BAŞINDAN: "din" "dinlenme"yi yakalamasın diye kelimenin tamamı ya da
 * belirgin bir kök yazılıyor.
 *
 * `\b` KULLANILMIYOR: JavaScript'te `u` bayrağıyla bile `\b` yalnız ASCII
 * harfi tanıyor ve "çocuğunuzun" gibi Türkçe harfle başlayan kelimenin
 * önünde sınır GÖRMÜYOR — yasak soru sessizce geçiyordu (testte yakalandı).
 * Sınır Unicode harf/rakam bakışıyla kuruluyor.
 */
export const FORM_YASAK_SORU_SOZLUGU: ReadonlyArray<{ desen: RegExp; konu: string }> = [
  { desen: /(?<![\p{L}\p{N}])(sağlık|hastalı|tedavi|teşhis|ilaç|ameliyat)/u, konu: 'sağlık ve tedavi' },
  { desen: /(?<![\p{L}\p{N}])sigorta/u, konu: 'sigorta' },
  { desen: /(?<![\p{L}\p{N}])(gelir|maaş|borç|kredi notu|findeks)/u, konu: 'gelir ve borç' },
  { desen: /(?<![\p{L}\p{N}])(t\.?c\.?\s*(kimlik)?\s*no|kimlik (no|numara)|tckn)/u, konu: 'kimlik numarası' },
  { desen: /(?<![\p{L}\p{N}])(iban|hesap numara|kart numara)/u, konu: 'hesap numarası' },
  { desen: /(?<![\p{L}\p{N}])sabıka/u, konu: 'sabıka' },
  { desen: /(?<![\p{L}\p{N}])(din|dini|mezhep|inanç)(?![\p{L}\p{N}])/u, konu: 'din' },
  { desen: /(?<![\p{L}\p{N}])(siyasi|parti|oy verdi)/u, konu: 'siyaset' },
  { desen: /(?<![\p{L}\p{N}])(cinsel|yönelim)/u, konu: 'cinsel yönelim' },
  { desen: /(?<![\p{L}\p{N}])sendika/u, konu: 'sendika' },
  { desen: /(?<![\p{L}\p{N}])(çocuğ\w* doğum|çocuğ\w* yaş)/u, konu: 'çocuğun doğum tarihi' },
];

/**
 * İKİ KÜÇÜLTME: Türkçe kural "IBAN"ı "ıban" (noktasız ı) yapıyor ve Latin
 * kısaltma eşleşmiyor; Latin kural "SAĞLIK"ı "sağlik" yapıyor ve Türkçe kök
 * eşleşmiyor. Biri yakalarsa yeter.
 */
export function yasakSoruKonusu(etiket: string): string | null {
  const adaylar = [etiket.toLocaleLowerCase('tr-TR'), etiket.toLowerCase()];
  return FORM_YASAK_SORU_SOZLUGU.find((y) => adaylar.some((a) => y.desen.test(a)))?.konu ?? null;
}

export type FormDerlemeSonucu =
  | { tur: 'govde'; govde: MetaGovdesi }
  | { tur: 'ret'; retler: Array<{ kod: string; mesaj: string }> };

export function derleForm(
  s: FormSablonu,
  p: FormProfili,
  sayfaPlatformId: string,
  secenek: FormDerlemeSecenekleri = {},
): FormDerlemeSonucu {
  const retler: Array<{ kod: string; mesaj: string }> = [];
  // Advetics'in gizlilik sayfasına ya da reklamın açılış adresine DÜŞMEK
  // YASAK: rıza metni yanlış veri sorumlusunu gösterir.
  if (!p.aydinlatmaAdresi || !/^https:\/\//.test(p.aydinlatmaAdresi)) {
    retler.push({ kod: 'FRM-01', mesaj: 'Aydınlatma sayfası tanımlı değil.' });
  } else if (/advetics\./i.test(p.aydinlatmaAdresi)) {
    retler.push({ kod: 'FRM-01', mesaj: "Aydınlatma sayfası işletmenin kendi sayfası olmalı, Advetics'inki değil." });
  }
  const baglanti = p.aydinlatmaBaglantiMetni.trim();
  if (!baglanti || baglanti.length > FORM_BAGLANTI_METNI_SINIRI) {
    retler.push({ kod: 'FRM-09', mesaj: `Aydınlatma bağlantı metni 1-${FORM_BAGLANTI_METNI_SINIRI} karakter olmalı.` });
  }
  if (s.sorular.length === 0) retler.push({ kod: 'FRM-06', mesaj: 'Formda en az bir soru olmalı.' });
  if (s.sorular.length > FORM_EN_COK_SORU) {
    retler.push({ kod: 'FRM-06', mesaj: `Formda en çok ${FORM_EN_COK_SORU} soru olabilir (önden dolanlar dahil).` });
  }
  if ((secenek.hukukiSebepZorunlu ?? true) && !s.hukukiSebep) retler.push({ kod: 'FRM-07', mesaj: 'Hukuki sebep seçilmedi.' });
  const anahtarlar = new Set<string>();
  for (const q of s.sorular) {
    if (q.tur !== 'ozel') continue;
    const konu = yasakSoruKonusu(q.etiket);
    if (konu) retler.push({ kod: 'FRM-05', mesaj: `"${q.etiket}": ${konu} sorulamaz.` });
    if (!/^[a-z0-9_]{1,40}$/.test(q.anahtar) || anahtarlar.has(q.anahtar)) {
      retler.push({ kod: 'FRM-SORU', mesaj: `"${q.etiket}": soru anahtarı geçersiz ya da tekrarlı.` });
    }
    anahtarlar.add(q.anahtar);
    if (q.secenekler && (q.secenekler.length < 2 || q.secenekler.some((x) => !x.trim()))) {
      retler.push({ kod: 'FRM-SECENEK', mesaj: `"${q.etiket}": çoktan seçmeli soruda en az iki dolu seçenek olmalı.` });
    }
  }
  if (s.pazarlamaIzniMetni !== null && !s.pazarlamaIzniMetni.trim()) {
    retler.push({ kod: 'FRM-03', mesaj: 'Pazarlama izni kutusunun metni boş.' });
  }
  for (const k of s.onayKutulari ?? []) {
    if (!k.metin.trim()) retler.push({ kod: 'FRM-03', mesaj: 'Bir onay kutusunun metni boş.' });
  }
  const dugme = s.tesekkur?.dugme;
  if (dugme?.tur === 'VIEW_WEBSITE' && !/^https:\/\/\S+\.\S+/.test(dugme.adres)) {
    retler.push({ kod: 'FRM-TESEKKUR', mesaj: 'Teşekkür ekranındaki site adresi https:// ile başlamalı.' });
  }
  // E.164 ZORUNLU: ülke kodsuz numara Meta'da başka bir ülkenin numarası
  // sayılabilir ve "Ara" düğmesi yanlış yere çalar, hata vermeden.
  if (dugme?.tur === 'CALL_BUSINESS' && !TELEFON_E164.test(dugme.telefon)) {
    retler.push({ kod: 'FRM-TESEKKUR', mesaj: 'Teşekkür ekranındaki telefon +90 ile başlamalı.' });
  }
  if (retler.length > 0) return { tur: 'ret', retler };

  const ad = s.ad?.trim() || formAdi(p.workspaceKisaAdi, s.surum);
  const alanlar: Record<string, unknown> = {
    name: ad,
    // Gönderilmezse form İngilizce açılıyor.
    locale: 'TR_TR',
    privacy_policy: { url: p.aydinlatmaAdresi, link_text: baglanti },
    questions: s.sorular.map((q) =>
      q.tur === 'standart'
        ? { type: q.kod }
        : q.secenekler
          ? {
              type: 'CUSTOM',
              key: q.anahtar,
              label: q.etiket,
              options: q.secenekler.map((o, i) => ({ value: o.trim(), key: `${q.anahtar}_${i + 1}` })),
            }
          : { type: 'CUSTOM', key: q.anahtar, label: q.etiket },
    ),
    // HER İKİ HÂLDE AÇIKÇA (bkz. `FormSablonu.kaliteOdakli`).
    is_optimized_for_quality: s.kaliteOdakli,
    is_phone_sms_verify_enabled: s.smsDogrulama,
    // Varsayılan false: form hedef dışındaki kişiye de açılıyor.
    block_display_for_non_targeted_viewer: true,
  };

  const kutular: FormOnayKutusu[] = (s.onayKutulari ?? []).map((k, i) => ({
    key: `onay_${i + 1}`,
    text: k.metin.trim(),
    // İKİSİ DE AÇIKÇA: is_required varsayılanı true (Graph belgesi). Yazılmazsa
    // isteğe bağlı sanılan izin zorla toplanır (KVKK Kurulu 2023/692).
    is_required: k.zorunlu,
    is_checked_by_default: false,
  }));
  if (s.pazarlamaIzniMetni !== null) {
    kutular.push({ key: 'pazarlama_izni', text: s.pazarlamaIzniMetni.trim(), is_required: false, is_checked_by_default: false });
  }
  if (kutular.length > 0) {
    // ÜST SEVİYE custom_disclaimer: Graph `/{page}/leadgen_forms` oluşturma
    // parametresi bu (v25.0 belgesi 2026-10-12'de yeniden okundu);
    // `legal_content` sarmalayıcısı parametreler arasında YOK.
    const yalnizPazarlama = (s.onayKutulari ?? []).length === 0;
    alanlar.custom_disclaimer = {
      title: yalnizPazarlama ? 'İletişim izni' : 'Onaylar',
      body: { text: kutular.some((k) => k.is_required) ? FORM_ZORUNLU_BILDIRIM : FORM_NOTR_BILDIRIM },
      checkboxes: kutular,
    };
  }
  if (s.giris && (s.giris.baslik.trim() || s.giris.aciklama?.trim())) {
    alanlar.context_card = {
      title: s.giris.baslik.trim() || ad,
      content: s.giris.aciklama?.trim() ? [s.giris.aciklama.trim()] : [],
      style: s.giris.stil,
      button_text: 'Devam',
    };
  }
  if (s.tesekkur) {
    const d = s.tesekkur.dugme;
    alanlar.thank_you_page = {
      title: s.tesekkur.baslik,
      body: s.tesekkur.govde,
      button_type: d.tur,
      ...(d.tur === 'VIEW_WEBSITE' ? { button_text: d.metin, website_url: d.adres } : {}),
      // Numara E.164, `+` ile. Meta'nın bunu mu yoksa `country_code` + yerel
      // numarayı mı beklediği CANLIDA ÖLÇÜLMEDİ; reddederse hata mesajı
      // ekranda görünür (sessiz değil).
      ...(d.tur === 'CALL_BUSINESS' ? { button_text: d.metin, business_phone_number: d.telefon } : {}),
    };
  }
  return { tur: 'govde', govde: { nesne: 'form', ad: 'form', uc: `${sayfaPlatformId}/leadgen_forms`, alanlar } };
}

interface FormOnayKutusu {
  key: string;
  text: string;
  is_required: boolean;
  is_checked_by_default: boolean;
}

// ─── Geri okuma ─────────────────────────────────────────────────────────────

/**
 * Yayından sonra okunacak alanlar. Onay kutuları OKUMADA `legal_content`
 * altında bekleniyor (oluşturma parametresi üst seviye `custom_disclaimer`,
 * okunan düğüm alanı farklı adı taşıyor); hangisinin döndüğü CANLIDA
 * ÖLÇÜLMEDİ, karşılaştırıcı ikisini de arıyor. Alan reddedilirse okuma
 * hatası "doğrulanamadı" olarak yazılır, "temiz" sayılmaz.
 */
export const FORM_GERI_OKUMA_ALANLARI = 'id,locale,status,is_optimized_for_quality,block_display_for_non_targeted_viewer,legal_content{custom_disclaimer}';

export type FormGeriOkumaSonucu =
  | { sonuc: 'temiz' }
  /** Meta formu kurdu ama gönderilenden FARKLI sakladı: KVKK ya da dil sözü tutmuyor. */
  | { sonuc: 'fark'; satirlar: string[] }
  /** Okuma yapılamadı ya da alan dönmedi: bilinmiyor, "temiz" DEĞİL. */
  | { sonuc: 'dogrulanamadi'; satirlar: string[] };

function okunanKutular(okunan: Record<string, unknown>): FormOnayKutusu[] | null {
  const ust = okunan.custom_disclaimer as { checkboxes?: unknown } | undefined;
  const yasal = (okunan.legal_content as { custom_disclaimer?: { checkboxes?: unknown } } | undefined)?.custom_disclaimer;
  const kutular = ust?.checkboxes ?? yasal?.checkboxes;
  if (kutular === undefined) return null;
  // Graph liste alanlarını `{ data: [...] }` sarmalıyla da döndürebiliyor.
  const dizi = Array.isArray(kutular) ? kutular : Array.isArray((kutular as { data?: unknown }).data) ? (kutular as { data: unknown[] }).data : null;
  return dizi as FormOnayKutusu[] | null;
}

/**
 * Gönderilen form gövdesini Meta'nın sakladığıyla karşılaştırır. "200
 * döndü" doğrulama değil: Meta tanımadığı alanı kabul edip yok sayabiliyor
 * ve bunun KVKK kutusundaki karşılığı izinsiz toplanan veri ya da hiç
 * toplanmayan rıza. Bakılanlar: dil, kalite adımı, hedef dışına kapalılık
 * ve onay kutularının her biri (anahtar, metin, zorunluluk).
 */
export function formGeriOkumaDenetimi(gonderilen: Record<string, unknown>, okunan: Record<string, unknown> | null, okumaHatasi: string | null = null): FormGeriOkumaSonucu {
  if (!okunan) return { sonuc: 'dogrulanamadi', satirlar: [`Form Meta'dan geri okunamadı${okumaHatasi ? `: ${okumaHatasi}` : ''}.`] };
  const fark: string[] = [];
  const bilinmiyor: string[] = [];
  const tekil = (alan: string, etiket: string) => {
    if (!(alan in gonderilen)) return;
    if (!(alan in okunan)) bilinmiyor.push(`${etiket} Meta'dan okunamadı.`);
    // Graph boolean'ı bazen dizge döndürüyor: karşılaştırma dizgeyle.
    else if (String(okunan[alan]) !== String(gonderilen[alan])) fark.push(`${etiket}: gönderilen ${String(gonderilen[alan])}, Meta'da ${String(okunan[alan])}.`);
  };
  tekil('locale', 'Form dili');
  tekil('is_optimized_for_quality', 'Daha yüksek niyet adımı');
  tekil('block_display_for_non_targeted_viewer', 'Formu yalnız hedef kitle görür');

  const gidenKutular = (gonderilen.custom_disclaimer as { checkboxes?: FormOnayKutusu[] } | undefined)?.checkboxes ?? [];
  if (gidenKutular.length > 0) {
    const donen = okunanKutular(okunan);
    if (donen === null) bilinmiyor.push("Onay kutuları Meta'dan okunamadı; KVKK kutularının formda durduğu doğrulanamadı.");
    else {
      for (const k of gidenKutular) {
        const d = donen.find((x) => x.key === k.key) ?? donen.find((x) => x.text?.trim() === k.text);
        if (!d) fark.push(`Onay kutusu formda YOK: "${k.text}".`);
        else {
          if (d.text?.trim() !== k.text) fark.push(`Onay kutusunun metni farklı: "${k.text}".`);
          // Zorunluluk dönmediyse bilinmiyor; döndüyse birebir aynı olmalı.
          if (d.is_required === undefined) bilinmiyor.push(`"${k.text}" kutusunun zorunlu olup olmadığı okunamadı.`);
          else if (String(d.is_required) !== String(k.is_required)) {
            fark.push(`"${k.text}" kutusu ${k.is_required ? 'zorunlu' : 'isteğe bağlı'} gönderildi, Meta'da ${String(d.is_required) === 'true' ? 'zorunlu' : 'isteğe bağlı'}.`);
          }
        }
      }
      if (donen.length > gidenKutular.length) fark.push(`Meta'daki formda ${donen.length - gidenKutular.length} fazladan onay kutusu var.`);
    }
  }
  if (fark.length > 0) return { sonuc: 'fark', satirlar: [...fark, ...bilinmiyor] };
  if (bilinmiyor.length > 0) return { sonuc: 'dogrulanamadi', satirlar: bilinmiyor };
  return { sonuc: 'temiz' };
}

/** Ekranda (form kaydının uyarısı) tek cümle; `temiz`de `null`. */
export function formGeriOkumaUyarisi(r: FormGeriOkumaSonucu): string | null {
  if (r.sonuc === 'temiz') return null;
  const bas = r.sonuc === 'fark' ? "Form yayınlandı ama Meta'da farklı duruyor" : "Form yayınlandı ama Meta'da doğrulanamadı";
  return `${bas}: ${r.satirlar.join(' ')}`;
}
