/**
 * Lead formu derleyicisi (TASARIM.md § 06.4 M-37..M-43, § 10.7 FRM-*).
 *
 * TEK form yolu: bugünkü kodda iki vardı (gömülü + kütüphane) ve ikisi
 * farklı davranıyordu. Form zincirde İLK kurulur ve hemen geri okunur;
 * farkta başka nesne kurulmaz. Meta'da form SİLİNEMİYOR ve DÜZENLENEMİYOR,
 * yani yanlış kurulmuş bir form yalnız arşivlenebilir.
 *
 * KVKK metinlerinin kendisini Advetics üretmiyor: ajansın hukuk danışmanının
 * standart metni girdi olarak geliyor; burada yalnız YERİ ve BİÇİMİ
 * denetleniyor.
 */
import { formAdi } from './adlandirma';
import type { MetaGovdesi } from './derle';

/** Meta'nın standart soru türleri; Acemi'de kullanılanlar. */
export const STANDART_SORULAR = ['FULL_NAME', 'PHONE', 'EMAIL', 'CITY'] as const;
export type StandartSoru = (typeof STANDART_SORULAR)[number];

export type FormSorusu = { tur: 'standart'; kod: StandartSoru } | { tur: 'ozel'; anahtar: string; etiket: string };

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
  kaliteOdakli: boolean;
  smsDogrulama: boolean;
}

export interface FormProfili {
  workspaceKisaAdi: string;
  /** Müşterinin HTML aydınlatma sayfası; giriş anında doğrulanmış olmalı. */
  aydinlatmaAdresi: string | null;
  aydinlatmaBaglantiMetni: string;
}

/**
 * FRM-04: özel bildirim eklenince Meta bildirimin kendisini KABUL ÖN ŞARTI
 * yapıyor. Gövdede aydınlatma özeti ya da "onaylıyorum" olursa isteğe bağlı
 * kutu fiilen zorunlu olur. Tek nötr cümle, sabit.
 */
export const FORM_NOTR_BILDIRIM = 'Aşağıdaki izin isteğe bağlıdır, işaretlemeden de gönderebilirsiniz.';
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

export function derleForm(s: FormSablonu, p: FormProfili, sayfaPlatformId: string): FormDerlemeSonucu {
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
  if (!s.hukukiSebep) retler.push({ kod: 'FRM-07', mesaj: 'Hukuki sebep seçilmedi.' });
  const anahtarlar = new Set<string>();
  for (const q of s.sorular) {
    if (q.tur !== 'ozel') continue;
    const konu = yasakSoruKonusu(q.etiket);
    if (konu) retler.push({ kod: 'FRM-05', mesaj: `"${q.etiket}": ${konu} sorulamaz.` });
    if (!/^[a-z0-9_]{1,40}$/.test(q.anahtar) || anahtarlar.has(q.anahtar)) {
      retler.push({ kod: 'FRM-SORU', mesaj: `"${q.etiket}": soru anahtarı geçersiz ya da tekrarlı.` });
    }
    anahtarlar.add(q.anahtar);
  }
  if (s.pazarlamaIzniMetni !== null && !s.pazarlamaIzniMetni.trim()) {
    retler.push({ kod: 'FRM-03', mesaj: 'Pazarlama izni kutusunun metni boş.' });
  }
  if (retler.length > 0) return { tur: 'ret', retler };

  const alanlar: Record<string, unknown> = {
    name: formAdi(p.workspaceKisaAdi, s.surum),
    // Gönderilmezse form İngilizce açılıyor.
    locale: 'TR_TR',
    privacy_policy: { url: p.aydinlatmaAdresi, link_text: baglanti },
    questions: s.sorular.map((q) =>
      q.tur === 'standart' ? { type: q.kod } : { type: 'CUSTOM', key: q.anahtar, label: q.etiket },
    ),
    is_optimized_for_quality: s.kaliteOdakli,
    is_phone_sms_verify_enabled: s.smsDogrulama,
    // Varsayılan false: form hedef dışındaki kişiye de açılıyor.
    block_display_for_non_targeted_viewer: true,
  };
  if (s.pazarlamaIzniMetni !== null) {
    // ÜST SEVİYE custom_disclaimer; bugünkü kodun legal_content sarmalayıcısı
    // referansta yok ve Meta kutuyu sessizce düşürebiliyor.
    alanlar.custom_disclaimer = {
      title: 'İletişim izni',
      body: { text: FORM_NOTR_BILDIRIM },
      checkboxes: [
        {
          key: 'pazarlama_izni',
          text: s.pazarlamaIzniMetni.trim(),
          // İKİSİ DE AÇIKÇA: is_required varsayılanı true. Yazılmazsa müşteri
          // isteğe bağlı sandığı izni zorla toplar (KVKK Kurulu 2023/692).
          is_required: false,
          is_checked_by_default: false,
        },
      ],
    };
  }
  return { tur: 'govde', govde: { nesne: 'form', ad: 'form', uc: `${sayfaPlatformId}/leadgen_forms`, alanlar } };
}
