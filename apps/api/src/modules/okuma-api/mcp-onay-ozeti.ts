import {
  REHBER_AMACLARI,
  formatMoney,
  type RehberHazirligi,
  type RehberKaydi,
} from '@advetics/shared';

/**
 * ═══ ONAY ÖZETİ — KULLANICIYA "ŞUNU YAPACAĞIM" — SAF ═══
 *
 * Kullanıcının onayladığı şey BU satırlar. Ç-4 (`MCP-YAZMA-MIMARI.md`):
 * MCP'nin yazdığı alanlar `kullanici` kaynağıyla yazılıyor ve bunun tek
 * dayanağı, para ve hukuk sözü taşıyan HER yapısal alanın burada açıkça
 * yazması. Bir alan bu listeden düşerse kullanıcı görmediği bir değeri
 * onaylamış olur: yeni yapısal alan eklendiğinde buraya da eklenmeli.
 *
 * Boş alan "yok" diye YAZILIYOR, satır atlanmıyor: "Özel kategori" satırının
 * hiç olmaması ile "Özel kategori: yok" yazması kullanıcı için farklı şey.
 */

const SEVIYE_ADI = { campaign: 'Kampanya', ad_group: 'Reklam seti', ad: 'Reklam' } as const;
const PLATFORM_ADI: Record<string, string> = { meta: 'Meta', google: 'Google', linkedin: 'LinkedIn' };
const DURUM_ADI: Record<string, string> = { active: 'Yayında', paused: 'Duraklatıldı', deleted: 'Silinmiş', archived: 'Arşivde' };

/** İYİLEŞTİR'İN SINIRI. MCP onu uygulamıyor (Ç-9) ama aşıldığını SÖYLÜYOR. */
export const BUTCE_UYARI_ESIGI_YUZDE = 20;

/** Listeyi kısaltırken kaç tanesinin gizlendiğini yaz (sessiz kesme yok). */
function liste(ogeler: string[], en = 5): string {
  if (ogeler.length === 0) return 'yok';
  const gorunen = ogeler.slice(0, en).join(', ');
  return ogeler.length > en ? `${gorunen} ve ${ogeler.length - en} tane daha` : gorunen;
}

function kisalt(metin: string, en = 90): string {
  const tek = metin.replace(/\s+/g, ' ').trim();
  return tek.length > en ? `${tek.slice(0, en - 1)}…` : tek;
}

export function rehberOnayOzeti(r: RehberKaydi, h: RehberHazirligi, workspaceAdi: string): string[] {
  const a = r.alanlar;
  const satir: string[] = [`Workspace: ${workspaceAdi}`];
  const amac = a.amac?.deger;
  satir.push(`Amaç: ${amac ? REHBER_AMACLARI[amac].ekranAdi : 'seçilmedi'}`);

  const p = a.platformlar?.deger ?? { meta: false, google: false };
  const metaHesap = h.hesaplar.find((x) => x.id === a.metaHesabiId?.deger);
  const googleHesap = h.googleHesaplari.find((x) => x.id === a.googleHesabiId?.deger);
  if (p.meta) {
    satir.push(`Meta hesabı: ${metaHesap ? `${metaHesap.ad}${metaHesap.disKimlik ? ` (${metaHesap.disKimlik})` : ''}` : 'seçilmedi'}`);
    const sayfa = h.sayfalar.find((x) => x.id === a.sayfaId?.deger);
    const ig = h.instagramHesaplari.find((x) => x.id === a.instagramId?.deger);
    satir.push(`Facebook sayfası: ${sayfa?.ad ?? 'seçilmedi'} · Instagram: ${ig?.ad ?? 'yok'}`);
  }
  if (p.google) satir.push(`Google Ads hesabı: ${googleHesap ? `${googleHesap.ad} (${googleHesap.musteriNo})` : 'seçilmedi'}`);
  if (!p.meta && !p.google) satir.push('Platform: seçilmedi');

  const butce = a.butce?.deger;
  const paraBirimi = metaHesap?.paraBirimi ?? googleHesap?.paraBirimi ?? 'TRY';
  if (butce) {
    const pay = p.meta && p.google ? ` (Meta %${a.metaPayiYuzde?.deger ?? 50}, Google %${100 - (a.metaPayiYuzde?.deger ?? 50)})` : '';
    satir.push(`Bütçe: ${formatMoney(butce.micros, paraBirimi)} ${butce.tip === 'gunluk' ? '/ gün' : 'toplam'}${pay}`);
  } else {
    satir.push('Bütçe: girilmedi');
  }
  const takvim = a.takvim?.deger;
  satir.push(`Takvim: ${takvim ? `${takvim.baslangic} → ${takvim.bitis ?? 'bitiş yok'}` : 'girilmedi'}`);
  satir.push(`Konum: ${liste((a.konumlar?.deger ?? []).map((k) => (k.yaricapKm ? `${k.etiket} (+${k.yaricapKm} km)` : k.etiket)))}`);
  const yas = a.yasAraligi?.deger;
  satir.push(`Yaş: ${yas ? `${yas.min}–${yas.max}` : `${a.enDusukYas?.deger ?? 18}+`}`);
  satir.push(`Özel kategori: ${liste(a.ekKategoriler?.deger ?? [])}`);
  if (a.hedefAdres?.deger) satir.push(`Hedef adres: ${a.hedefAdres.deger}`);
  if (a.telefon?.deger) satir.push(`Telefon: ${a.telefon.deger}`);
  if (a.whatsappNumarasi?.deger) satir.push(`WhatsApp: ${a.whatsappNumarasi.deger}`);
  if (a.formSablonuId?.deger) satir.push(`Form: ${a.formSablonuId.deger}`);
  if (a.pikselId?.deger) satir.push(`Piksel: ${a.pikselId.deger}`);
  satir.push(`Görsel / video: ${(a.medya?.deger ?? []).length} adet${a.youtubeVideo?.deger ? ` · YouTube: ${a.youtubeVideo.deger.baslik}` : ''}`);
  const m = a.metin?.deger;
  if (m) {
    satir.push(`Ana metin: ${kisalt(m.anaMetin)}`);
    satir.push(`Başlıklar: ${liste(m.basliklar.map((x) => kisalt(x, 40)), 3)}`);
  } else {
    satir.push('Metin: girilmedi');
  }
  const kelime = a.anahtarKelimeler?.deger ?? [];
  if (p.google && kelime.length) satir.push(`Anahtar kelimeler: ${liste(kelime.map((k) => k.metin))}`);
  satir.push('Kurulum DURAKLATILMIŞ: harcama, ayrıca onaylanan bir "başlat" olmadan başlamaz.');
  return satir;
}

export interface VarlikOnizlemesi {
  platform: string;
  varlikAdi: string;
  once: { status: string; budgetMode: string; budgetAmountMicros: string | null };
  currency: string;
}

export type VarlikIslemi =
  | { tur: 'durdur' }
  | { tur: 'etkinlestir' }
  | { tur: 'butce'; micros: bigint; tip: 'gunluk' | 'toplam' };

export function varlikOnayOzeti(
  seviye: keyof typeof SEVIYE_ADI,
  v: VarlikOnizlemesi,
  islem: VarlikIslemi,
  workspaceAdi: string,
): string[] {
  const satir = [`Workspace: ${workspaceAdi}`, `${SEVIYE_ADI[seviye]}: ${v.varlikAdi} (${PLATFORM_ADI[v.platform] ?? v.platform})`];
  const durum = DURUM_ADI[v.once.status] ?? v.once.status;
  if (islem.tur === 'durdur') {
    satir.push(`Durum: ${durum} → Duraklatıldı`);
    satir.push('Harcama durur; istediğinde yeniden başlatılabilir.');
  } else if (islem.tur === 'etkinlestir') {
    satir.push(`Durum: ${durum} → Yayında`);
    satir.push('HARCAMA BAŞLAR. Üst seviyesi (kampanya / set) duraklatılmışsa reklam yine gösterilmez.');
  } else {
    const yeniMod = islem.tip === 'gunluk' ? 'daily' : 'lifetime';
    const ek = (mod: string) => (mod === 'daily' ? ' / gün' : mod === 'lifetime' ? ' toplam' : '');
    const eski = v.once.budgetAmountMicros;
    const eskiMetin = eski ? `${formatMoney(eski, v.currency)}${ek(v.once.budgetMode)}` : 'bütçe bu seviyede değil';
    satir.push(`Bütçe: ${eskiMetin} → ${formatMoney(islem.micros.toString(), v.currency)}${ek(yeniMod)}`);
    if (eski && v.once.budgetMode === yeniMod && BigInt(eski) > 0n) {
      const fark = Number(((islem.micros - BigInt(eski)) * 1000n) / BigInt(eski)) / 10;
      satir.push(`Değişim: ${fark > 0 ? '+' : ''}${fark.toLocaleString('tr-TR')}%`);
      if (Math.abs(fark) > BUTCE_UYARI_ESIGI_YUZDE) {
        satir.push(`Uyarı: %${BUTCE_UYARI_ESIGI_YUZDE}'den büyük değişiklik platformun öğrenmesini sıfırlayabilir.`);
      }
    } else if (eski && v.once.budgetMode !== yeniMod) {
      satir.push('Uyarı: bütçe türü değişiyor (günlük ↔ toplam).');
    }
    satir.push('Aylık bütçe planı kontrol edilmedi.');
  }
  return satir;
}
