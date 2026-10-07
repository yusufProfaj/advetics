import { z } from 'zod/v4';
import { DERLENEN_NIYETLER, NIYET_KATALOGU, type HedefKonum, type TaslakAlanlari } from '@advetics/shared';

/**
 * YAPAY ZEKÂ İLE TASLAK — "bu görsellerle form kampanyası oluştur"
 * (kullanıcı kararı 2026-10-07: reklam oluşturma = görselleri bırak + tek
 * cümle; sistem taslağı kurar, yalnız önizlemeyi gösterir, onaya bırakır).
 *
 * MODEL ÖNERİR, KARAR VERMEZ (TASARIM § 02.5, § 12): ürettiği her alan
 * `ai_onerisi` kaynağıyla yazılır ve kullanıcı önizlemede onaylayana kadar
 * DERLENEMEZ. Model şunları ASLA yapmaz:
 *  - bütçe ya da süre TAHMİN etmek (yalnız cümlede yazan rakam; sunucu
 *    rakamın cümlede geçtiğini ayrıca doğruluyor),
 *  - adres UYDURMAK (Marka Merkezi'ndeki sayfalardan biri ya da cümlede
 *    yazan adres),
 *  - özel kategori sorusunu cevaplamak (soru önizlemede kullanıcıya),
 *  - yayınlanamayan bir amaç seçmek (kapalı liste).
 *
 * Bu dosya SAF: modelin çıktısını doğrulayıp taslak alanlarına çeviriyor.
 * Model çağrısı `ai-taslak.service.ts`te.
 */

/**
 * Modelin seçebileceği amaçlar DERLEYİCİDEN TÜRÜYOR (SENTEZ S-30). Elle
 * yazılan liste WHATSAPP ve SATIS'ı da içeriyordu: model onları seçince
 * taslak kuruluyor, kullanıcı önizlemeyi onaylıyor ve derleyici ancak o
 * zaman "bu amaç henüz kurulamıyor" diyordu. Yeni bir amaç derleyiciye
 * girdiği gün buraya kendiliğinden girer.
 */
export const AI_NIYETLERI = DERLENEN_NIYETLER;
const AI_NIYET_ACIKLAMASI = AI_NIYETLERI.map((n) => `${n} (${NIYET_KATALOGU[n].ekranAdi})`).join(', ');

export const aiCiktiSchema = z.object({
  niyet: z.enum(AI_NIYETLERI).describe('Kullanıcının istediği sonuç; kapalı liste.'),
  niyetGerekcesi: z.string().describe('Neden bu amaç: kullanıcının cümlesinden kısa bir gerekçe.'),
  hedefAdres: z
    .string()
    .nullable()
    .describe('Yalnız SITE ve SATIS için: verilen sık sayfalardan biri ya da cümlede birebir yazan adres; yoksa null.'),
  kavramlar: z
    .array(
      z.object({
        gorselSirasi: z.number().int().describe('Görselin 1’den başlayan sırası.'),
        baslik: z.string().describe('En çok 40 karakter, Türkçe.'),
        metin: z.string().describe('Ana metin, Türkçe; ilk 125 karakter en önemli bilgi.'),
      }),
    )
    .describe('Her görsel için bir fikir.'),
  butce: z
    .object({ tip: z.enum(['gunluk', 'toplam']), tutar: z.number() })
    .nullable()
    .describe('YALNIZ kullanıcı cümlede bir tutar yazdıysa; yoksa null. Tahmin etme.'),
  sureGun: z.number().int().nullable().describe('YALNIZ kullanıcı cümlede bir süre yazdıysa (gün); yoksa null.'),
  konum: z
    .enum(['marka_kitlesi', 'butun_turkiye', 'belirtilmedi'])
    .describe('Kullanıcı Türkiye geneli dediyse butun_turkiye; değilse marka kitlesi varsa marka_kitlesi; yoksa belirtilmedi.'),
  sorular: z.array(z.string()).describe('Cevaplayamadığın, kullanıcıya sorulması gereken kısa sorular.'),
});
export type AiCikti = z.infer<typeof aiCiktiSchema>;

export interface AiBaglami {
  cumle: string;
  /** Kullanıcının yüklediği/seçtiği medya, sırasıyla; video için kapak karesi. */
  varliklar: Array<{ varlikId: string; kapakVarlikId?: string }>;
  sikSayfalar: Array<{ ad: string; adres: string }>;
  markaKitlesi: HedefKonum[] | null;
  yasalUyari: string | null;
  /** Tek hesap/tek sayfa varsa "Bu workspace'in tek hesabı" kaynağıyla yazılır. */
  tekHesap: string | null;
  tekSayfa: string | null;
  bugun: string;
}

export type AlanYazimi = Partial<
  Record<keyof TaslakAlanlari, { deger: unknown; kaynak: 'ai_onerisi' | 'workspace_profili' | 'marka_merkezi' } | null>
>;

export interface AiSonucu {
  degisiklikler: AlanYazimi;
  /** Kullanıcıya gösterilecek notlar: atılan öneriler, sorular. Sessiz düşüş yok. */
  notlar: string[];
}

/** Rakamları normalleştir: "1.500 TL" → "1500", "10 gün" → "10". */
function cumledekiSayilar(cumle: string): Set<string> {
  return new Set([...cumle.replace(/(\d)\.(\d{3})/g, '$1$2').matchAll(/\d+(?:,\d+)?/g)].map((m) => m[0].replace(',', '.')));
}

function sayiCumledeMi(n: number, cumle: string): boolean {
  return cumledekiSayilar(cumle).has(String(n));
}

const BASLIK_SINIRI = 40;

export function aiCiktisiniDogrula(c: AiCikti, b: AiBaglami): AiSonucu {
  const notlar: string[] = [];
  const d: AlanYazimi = {};
  const ai = (deger: unknown) => ({ deger, kaynak: 'ai_onerisi' as const });

  d.niyet = ai(c.niyet);

  // ADRES: uydurulmuş adres reklamı yanlış sayfaya gönderir; yalnız bilinen.
  if (c.niyet === 'SITE') {
    const bilinen = b.sikSayfalar.map((s) => s.adres);
    const cumlede = c.hedefAdres !== null && b.cumle.includes(c.hedefAdres);
    if (c.hedefAdres && (bilinen.includes(c.hedefAdres) || cumlede) && /^https:\/\//.test(c.hedefAdres)) {
      d.hedefAdres = ai(c.hedefAdres);
    } else {
      if (c.hedefAdres) notlar.push(`Önerilen adres (${c.hedefAdres}) Marka Merkezi’nde ya da isteğinde yok; adresi sen seç.`);
      else notlar.push('Reklamın gideceği site adresini seç.');
    }
  }

  // KAVRAMLAR: her görsel bir fikir; sıra dışı ya da tekrar eden atılır ve söylenir.
  const kullanilan = new Set<number>();
  const kavramlar: Array<{ varlikId: string; kapakVarlikId?: string; baslik: string; metin: string }> = [];
  for (const k of c.kavramlar) {
    const varlik = b.varliklar[k.gorselSirasi - 1];
    if (!varlik || kullanilan.has(k.gorselSirasi)) continue;
    kullanilan.add(k.gorselSirasi);
    let baslik = k.baslik.trim();
    if (baslik.length > BASLIK_SINIRI) {
      baslik = baslik.slice(0, BASLIK_SINIRI).trimEnd();
      notlar.push(`Fikir ${kavramlar.length + 1}: başlık ${BASLIK_SINIRI} karakteri aşıyordu, kısaltıldı; kontrol et.`);
    }
    let metin = k.metin.trim();
    // Zorunlu uyarı modele de söylendi; eksikse eklenir ve SÖYLENİR.
    if (b.yasalUyari && !metin.includes(b.yasalUyari)) {
      metin = `${metin}\n\n${b.yasalUyari}`;
      notlar.push(`Fikir ${kavramlar.length + 1}: zorunlu yasal uyarı metne eklendi.`);
    }
    kavramlar.push({ ...varlik, baslik, metin });
  }
  const eksikGorsel = b.varliklar.length - kavramlar.length;
  if (eksikGorsel > 0) notlar.push(`${eksikGorsel} görsel için fikir üretilmedi; önizlemede ekleyebilirsin.`);
  if (kavramlar.length > 0) d.kavramlar = ai(kavramlar.slice(0, 5));
  if (kavramlar.length > 5) notlar.push('Bir reklamda en çok 5 fikir olur; ilk 5 görsel kullanıldı.');

  // BÜTÇE VE SÜRE: yalnız cümlede yazan rakam. Model rakamı "tahmin" ettiyse atılır.
  if (c.butce) {
    if (c.butce.tutar > 0 && sayiCumledeMi(c.butce.tutar, b.cumle)) {
      const micros = BigInt(Math.round(c.butce.tutar * 100)) * 10_000n;
      d.butce = ai({ tip: c.butce.tip, micros: micros.toString() });
    } else {
      notlar.push('Bütçeyi isteğinde göremedim; tutarı sen yaz.');
    }
  } else notlar.push('Günlük ya da toplam bütçeyi yaz.');
  if (c.sureGun !== null && c.sureGun > 0 && sayiCumledeMi(c.sureGun, b.cumle)) {
    const [y, a, g] = b.bugun.split('-').map(Number) as [number, number, number];
    const bitis = new Date(Date.UTC(y, a - 1, g, 12) + (c.sureGun - 1) * 86_400_000).toISOString().slice(0, 10);
    d.takvim = ai({ baslangic: b.bugun, bitis });
  } else if (c.butce?.tip === 'toplam') {
    notlar.push('Toplam bütçede bitiş tarihi gerekli; süreyi seç.');
  }

  // KONUM: marka kitlesi Marka Merkezi'nden (kaynağı da o), Türkiye geneli öneri.
  if (c.konum === 'marka_kitlesi' && b.markaKitlesi?.length) {
    d.konumlar = { deger: b.markaKitlesi, kaynak: 'marka_merkezi' };
  } else if (c.konum === 'butun_turkiye') {
    d.konumlar = ai([{ tur: 'country', key: 'TR', etiket: 'Bütün Türkiye', ulkeKodu: 'TR' }]);
  } else {
    notlar.push('Reklamın görüneceği yeri seç.');
  }

  if (b.tekHesap) d.reklamHesabiId = { deger: b.tekHesap, kaynak: 'workspace_profili' };
  if (b.tekSayfa) d.sayfaId = { deger: b.tekSayfa, kaynak: 'workspace_profili' };

  for (const s of c.sorular.slice(0, 5)) notlar.push(s);
  return { degisiklikler: d, notlar };
}

/**
 * Sistem istemi SABİT (önbellek): zaman damgası, kullanıcı ya da workspace
 * bilgisi burada YOK; hepsi kullanıcı mesajında. Türkçe, panel dilinde.
 */
export const AI_SISTEM_ISTEMI = `Bir reklam ajansının paneline gömülü reklam asistanısın. Kullanıcı reklam bilmeyen bir işletme sahibi ya da ajans çalışanı olabilir. Görevin, verilen görsellerden ve kullanıcının tek cümlesinden bir Meta (Facebook/Instagram) reklam taslağı önermek. Önerin bir taslaktır: kullanıcı önizlemede görüp onaylayacak.

Kurallar:
- Amaç yalnız şu listeden biri olabilir: ${AI_NIYET_ACIKLAMASI}. Kullanıcı listede olmayan bir şey istediyse (WhatsApp, satış, arama gibi) en yakın amacı seç ve bunu sorular listesinde açıkça söyle; kullanıcı açıkça söylemediyse cümleden en uygun olanı seç ve gerekçesini kısa yaz.
- Her görsel ya da video için bir fikir yaz (video verildiyse görselde onun kapak karesini görürsün; metni videoya göre yaz): başlık en çok 40 karakter, ana metin Türkçe, samimi ve net; en önemli bilgi ilk 125 karakterde. Görselde gördüğünü metinde kullan; görselde olmayan bir şeyi (fiyat, indirim, garanti, tarih) uydurma.
- Marka bilgileri verildiyse üsluba ve vaatlere uy. Zorunlu yasal uyarı verildiyse her ana metnin sonuna aynen ekle.
- Bütçe ve süreyi yalnız kullanıcı cümlede rakamla yazdıysa doldur; yazmadıysa null bırak. Tahmin etme.
- Site adresini yalnız verilen sayfalardan seç ya da kullanıcının yazdığı adresi aynen kullan; adres uydurma.
- Konut, iş ilanı, kredi/finans ya da siyasi konu içeren reklamlar için kategori kararı verme; bu soruyu kullanıcı cevaplayacak.
- Cevaplayamadığın şeyleri kısa sorular olarak yaz. Uzun tire kullanma.`;
