import {
  ISO_HAFTA_DESENI,
  PLAN_SONUC_LABELS,
  isoHaftaAraligi,
  sec,
  type Dil,
  oncekiHafta,
  ozetHaftasi,
  type HaftalikOzetOnizleme,
  type OzetKitlesi,
} from '@advetics/shared';
import { baglanti } from '@/lib/baglanti';
import { raporlarSozlugu } from '@/dil/sozlukler/raporlar';

/**
 * ═══ HAFTALIK ÖZET SEKMESİ — SAF KARARLAR (Paket B, Ajan 3) ═══
 *
 * Panelde bileşen render eden test altyapısı yok (CLAUDE.md "react
 * effect'inin içindeki karar test edilemiyor — dışarı çıkar"); sekmenin
 * verdiği her karar burada ve `haftalik-ozet.spec.ts` çalıştırarak sınıyor.
 */

/**
 * Hafta aralığı, ekranın dilinde ("5-11 Ekim" / "Oct 5-11"). Shared'daki
 * `aralikMetni` ay adlarını Türkçe sabitten alıyor; İngilizce ekranda
 * "Ekim" görünmesin diye ay adı `Intl`den, UTC (gün dizesi saat dilimi
 * kaydırmasın).
 */
export function aralikMetni(a: NonNullable<ReturnType<typeof isoHaftaAraligi>>, dil: Dil = 'tr'): string {
  const [, ay1, g1] = a.bas.split('-').map(Number) as [number, number, number];
  const [, ay2, g2] = a.son.split('-').map(Number) as [number, number, number];
  const ay = (m: number) =>
    new Date(Date.UTC(2026, m - 1, 1)).toLocaleDateString(dil === 'en' ? 'en-US' : 'tr-TR', {
      month: 'long',
      timeZone: 'UTC',
    });
  if (dil === 'en') return ay1 === ay2 ? `${ay(ay2)} ${g1}-${g2}` : `${ay(ay1)} ${g1} - ${ay(ay2)} ${g2}`;
  return ay1 === ay2 ? `${g1}-${g2} ${ay(ay2)}` : `${g1} ${ay(ay1)} - ${g2} ${ay(ay2)}`;
}

/** Seçicide gösterilen geçmiş hafta sayısı (son tamamlanan dahil). */
export const HAFTA_SECENEK_SAYISI = 8;

export interface HaftaSecenegi {
  kod: string;
  etiket: string;
}

/**
 * Son TAMAMLANMIŞ haftadan geriye. Bu hafta listede YOK: yarım haftayı tam
 * haftayla kıyaslamak her seferinde "düştü" der ve sunucu onu zaten 400 ile
 * reddediyor; seçilemeyen bir seçenek göstermek kullanıcıyı hataya sokmak.
 */
export function haftaSecenekleri(simdi: Date, n = HAFTA_SECENEK_SAYISI, dil: Dil = 'tr'): HaftaSecenegi[] {
  const d = sec(raporlarSozlugu, dil).ozetLib;
  const sonuc: HaftaSecenegi[] = [];
  let kod = ozetHaftasi(simdi);
  for (let i = 0; i < n; i++) {
    const a = isoHaftaAraligi(kod)!;
    sonuc.push({ kod, etiket: i === 0 ? `${aralikMetni(a, dil)} (${d.gecenHafta})` : aralikMetni(a, dil) });
    kod = oncekiHafta(kod)!;
  }
  return sonuc;
}

/**
 * URL'deki hafta: listede varsa o, yoksa son tamamlanan. Tanınmayan değer
 * SESSİZCE yok sayılmıyor: `duzeltildi` true döner ve ekran "istenen hafta
 * gösterilemiyor" diye yazar (paylaşılan eski bir bağlantı başka bir haftayı
 * açtığında kullanıcı fark etsin).
 */
export function haftaSec(param: string | undefined, secenekler: readonly HaftaSecenegi[]): { kod: string; duzeltildi: boolean } {
  const varsayilan = secenekler[0]!.kod;
  if (!param) return { kod: varsayilan, duzeltildi: false };
  if (ISO_HAFTA_DESENI.test(param) && secenekler.some((s) => s.kod === param)) return { kod: param, duzeltildi: false };
  return { kod: varsayilan, duzeltildi: true };
}

export function onizlemeYolu(clientId: string, kitle: OzetKitlesi, hafta: string): string {
  return baglanti('/haftalik-ozet/onizleme', { clientId, kitle, hafta });
}

/** Sekmenin dört hâli: ayrı ayrı yazılıyor (`.catch(() => setX([]))` yasağı). */
export type OzetHali = 'yukleniyor' | 'hata' | 'bos' | 'dolu';

export function ozetHali(g: { yukleniyor: boolean; hata: string | null; veri: HaftalikOzetOnizleme | null }): OzetHali {
  if (g.hata !== null) return 'hata';
  if (g.yukleniyor || g.veri === null) return 'yukleniyor';
  return g.veri.ozet.hacim === 'bos' ? 'bos' : 'dolu';
}

const TARIH: Record<Dil, Intl.DateTimeFormat> = {
  tr: new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: 'numeric',
    month: 'long',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }),
  en: new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Istanbul',
    day: 'numeric',
    month: 'long',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }),
};

export function zamanMetni(iso: string, dil: Dil = 'tr'): string {
  return TARIH[dil].format(new Date(iso));
}

/** Müşteri planının bu haftaki durumu, tek cümle. */
export function musteriGonderimMetni(m: HaftalikOzetOnizleme['gonderim']['musteri'], dil: Dil = 'tr'): string {
  const d = sec(raporlarSozlugu, dil).ozetLib;
  switch (m.durum) {
    case 'kapali':
      return d.musteriKapali;
    case 'planli':
      return m.zaman ? d.musteriPlanli(zamanMetni(m.zaman, dil)) : d.musteriPlanliZamansiz;
    default:
      return `${PLAN_SONUC_LABELS[m.durum]}${m.zaman ? ` · ${zamanMetni(m.zaman, dil)}` : ''}`;
  }
}

export function kanalDurumMetni(
  durum: HaftalikOzetOnizleme['gonderim']['kanallar'][number]['durum'],
  dil: Dil = 'tr',
): string {
  const d = sec(raporlarSozlugu, dil).ozetLib;
  const metin: Record<typeof durum, string> = {
    planli: d.kanalPlanli,
    bekliyor: d.kanalBekliyor,
    gonderildi: d.kanalGonderildi,
    basarisiz: d.kanalBasarisiz,
    vazgecildi: d.kanalVazgecildi,
  };
  return metin[durum];
}

/**
 * İframe'in içeriği: API'nin ürettiği mail, bağlantılar YENİ SEKMEDE.
 * Mail HTML'i panelde ikinci kez yazılmıyor (önizleme borcu); yalnız
 * `<base target="_blank">` ekleniyor, yoksa "Panelde aç" çerçevenin İÇİNDE
 * paneli açardı.
 */
export function cerceveIcerigi(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"></head><body style="margin:0">${html}</body></html>`;
}
