import { Logger } from '@nestjs/common';
import {
  HUNI_ETIKETLERI,
  planDegisikligiSchema,
  tutarAyristir,
  tutarGoster,
  yzMetniEkle,
  type PlanDegisikligi,
  type PlanOnerisi,
} from '@advetics/shared';
import { metinIste, type MetinUretici } from '../../yapay-zeka/gemini';

const logger = new Logger('PilotPlanMetni');

/**
 * ═══ PLANIN YAPAY ZEKÂ YÜZÜ (M-8 a ve b) ═══
 *
 * MODEL SAYI ÜRETMEZ. İki iş:
 *   (a) gerekçe paragrafı: plandaki sayıların dışında sayı taşıyamaz
 *       (`yzMetniEkle` reddeder ve plan gerekçesiz kalır),
 *   (b) "değiştir" cümlesini `PlanDegisikligi[]`ye çevirmek: çeviri
 *       sunucuda `degisiklikCumleyleUyumluMu` ile KULLANICININ CÜMLESİNE
 *       karşı doğrulanır ("5.000" → 50.000 yazan model reddedilir).
 *
 * MODEL DÜŞERSE PLAN YİNE ÜRETİLİR: gerekçe `yz_yazmadi` kalır ve ekran
 * bunu söyler. Değiştir cümlesinde düşüş ise İSTEĞİN reddi: cümle yapay
 * zekâsız uygulanamaz ve sessizce "hiçbir şey değişmedi" demek, kullanıcının
 * isteğini yutmak olurdu.
 */

function planOzetMetni(p: PlanOnerisi): string {
  const para = p.paraBirimi ?? 'TRY';
  const satirlar = p.satirlar.map(
    (s) => `- ${s.anahtar} | ${s.platform} | ${HUNI_ETIKETLERI[s.katman]} | ${s.ad} | ${tutarGoster(BigInt(s.tutar.deger), para)}`,
  );
  return [
    `Dönem: ${p.donem}`,
    p.toplam.dolu ? `Toplam: ${tutarGoster(BigInt(p.toplam.deger), para)}` : 'Toplam: yok',
    p.takvim ? `Takvim: ${p.takvim.baslangic} - ${p.takvim.bitis}` : '',
    ...p.platformlar.map((x) => `Platform ${x.platform}: pay %${Math.floor(x.payBaz.deger / 100)}, ${x.gerekce}`),
    p.beklenenSonuc.dolu ? `Beklenen sonuç: ${p.beklenenSonuc.deger}` : 'Beklenen sonuç: hesaplanamadı',
    'Satırlar (anahtar | platform | katman | ad | tutar):',
    ...satirlar,
  ]
    .filter(Boolean)
    .join('\n');
}

const GEREKCE_SISTEMI = [
  'Bir reklam ajansının aylık medya planına 2-4 cümlelik Türkçe gerekçe yazıyorsun.',
  'Kural: plandaki sayıların DIŞINDA hiçbir sayı yazma; tahmin, yüzde, tarih uydurma.',
  'Okuyan reklamcılık bilmiyor: sade, kısa, uzun tire kullanmadan yaz.',
  '"Yayında", "kuruldu" gibi durum kelimeleri kullanma; plan henüz onaylanmadı.',
].join(' ');

export async function gerekceEkle(u: MetinUretici | null, p: PlanOnerisi, zaman: string): Promise<PlanOnerisi> {
  if (!u || !p.toplam.dolu || p.satirlar.length === 0) return p;
  try {
    const r = await metinIste(u, { sistem: GEREKCE_SISTEMI, metin: planOzetMetni(p), enCokCikti: 600 });
    if (r.tur !== 'tamam') {
      logger.warn(`Gerekçe yazılmadı (${r.tur}): ${r.mesaj}`);
      return p;
    }
    const metin = r.metin.trim().slice(0, 1200);
    const s = yzMetniEkle(p, metin, { model: u.model, zaman });
    if (s.tur === 'ret') {
      // Uydurulan sayı log'a yazılıyor; plan gerekçesiz kalır ve sayılar hücrelerde.
      logger.warn(`Gerekçe reddedildi, uydurulan sayılar: ${s.uydurulanSayilar.join(', ')}`);
      return p;
    }
    return s.plan;
  } catch (e) {
    logger.warn(`Gerekçe çağrısı düştü: ${(e as Error).message}`);
    return p;
  }
}

/** Modelin JSON çıktısı: tutar TL olarak, CÜMLEDE YAZILDIĞI GİBİ (dizge). */
const CEVIRI_SEMASI = {
  type: 'object',
  properties: {
    degisiklikler: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tur: { type: 'string', enum: ['satir_tutari', 'satir_tutari_fark', 'satir_cikar', 'varlik_cikar'] },
          anahtar: { type: 'string', description: 'Plan satırının anahtarı; listede olmalı.' },
          tutar: { type: 'string', description: 'Kullanıcının cümlesinde yazan tutar, aynen ("5.000"). Yalnız tutar türlerinde.' },
          yon: { type: 'string', enum: ['artir', 'azalt'] },
          varlikId: { type: 'string' },
        },
        required: ['tur', 'anahtar'],
      },
    },
    anlasilmadi: { type: 'string', description: 'Cümle plana çevrilemiyorsa nedeni; çevrildiyse boş.' },
  },
  required: ['degisiklikler'],
} as const;

const CEVIRI_SISTEMI = [
  'Kullanıcının Türkçe cümlesini plan değişikliklerine çeviriyorsun.',
  'Yalnız verilen satır anahtarlarını kullan. Tutarı KENDİN HESAPLAMA: cümlede yazan tutarı aynen "tutar" alanına koy.',
  '"X TL daha ayır" ya da "X TL azalt" göreli değişikliktir (satir_tutari_fark + yon). "X TL olsun" mutlaktır (satir_tutari).',
  'Cümle bir satıra eşlenemiyorsa degisiklikler boş kalsın ve anlasilmadi alanına nedenini yaz.',
].join(' ');

export type CeviriSonucu = { tur: 'tamam'; degisiklikler: PlanDegisikligi[] } | { tur: 'ret'; mesaj: string };

export async function cumleyiCevir(u: MetinUretici | null, cumle: string, p: PlanOnerisi): Promise<CeviriSonucu> {
  if (!u) return { tur: 'ret', mesaj: 'Yapay zekâ bağlı değil; değişikliği elle yap.' };
  const para = p.paraBirimi ?? 'TRY';
  let r: Awaited<ReturnType<typeof metinIste>>;
  try {
    r = await metinIste(u, {
      sistem: CEVIRI_SISTEMI,
      metin: `${planOzetMetni(p)}\n\nVarlıklar: ${p.satirlar.flatMap((s) => (s.varliklar?.dolu ? s.varliklar.deger.map((v) => `${s.anahtar}:${v.deger.id}(${v.deger.ad})`) : [])).join(', ') || 'yok'}\n\nCümle: ${cumle}`,
      enCokCikti: 800,
      jsonSemasi: CEVIRI_SEMASI as unknown as Record<string, unknown>,
    });
  } catch (e) {
    return { tur: 'ret', mesaj: `Yapay zekâya ulaşılamadı: ${(e as Error).message}` };
  }
  if (r.tur !== 'tamam') return { tur: 'ret', mesaj: r.mesaj };
  let ham: { degisiklikler?: Array<Record<string, unknown>>; anlasilmadi?: string };
  try {
    ham = JSON.parse(r.metin);
  } catch {
    return { tur: 'ret', mesaj: 'Yapay zekânın cevabı okunamadı; cümleyi farklı yaz.' };
  }
  const liste = ham.degisiklikler ?? [];
  if (liste.length === 0) return { tur: 'ret', mesaj: ham.anlasilmadi?.trim() || 'Cümle plandaki bir satıra eşlenemedi.' };
  const sonuc: PlanDegisikligi[] = [];
  for (const d of liste) {
    let aday: unknown = d;
    if (d.tur === 'satir_tutari' || d.tur === 'satir_tutari_fark') {
      // Tutar SUNUCUDA çevriliyor: model micros yazsaydı sıfır kaydırması
      // (5.000 → 5.000.000.000) doğrulanamazdı.
      const t = tutarAyristir(String(d.tutar ?? ''), para);
      if (t.tur === 'hata') return { tur: 'ret', mesaj: `Tutar okunamadı (${String(d.tutar ?? '')}): ${t.mesaj}` };
      aday =
        d.tur === 'satir_tutari'
          ? { tur: 'satir_tutari', anahtar: d.anahtar, tutarMicros: t.micros.toString() }
          : { tur: 'satir_tutari_fark', anahtar: d.anahtar, farkMicros: t.micros.toString(), yon: d.yon };
    } else if (d.tur === 'satir_cikar') aday = { tur: 'satir_cikar', anahtar: d.anahtar };
    else if (d.tur === 'varlik_cikar') aday = { tur: 'varlik_cikar', anahtar: d.anahtar, varlikId: d.varlikId };
    const v = planDegisikligiSchema.safeParse(aday);
    if (!v.success) return { tur: 'ret', mesaj: 'Yapay zekânın önerdiği değişiklik geçersiz; cümleyi daha açık yaz.' };
    sonuc.push(v.data);
  }
  return { tur: 'tamam', degisiklikler: sonuc };
}
