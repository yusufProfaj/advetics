import {
  ISO_HAFTA_DESENI,
  PLAN_SONUC_LABELS,
  aralikMetni,
  isoHaftaAraligi,
  oncekiHafta,
  ozetHaftasi,
  type HaftalikOzetOnizleme,
  type OzetKitlesi,
} from '@advetics/shared';
import { baglanti } from '@/lib/baglanti';

/**
 * ═══ HAFTALIK ÖZET SEKMESİ — SAF KARARLAR (Paket B, Ajan 3) ═══
 *
 * Panelde bileşen render eden test altyapısı yok (CLAUDE.md "react
 * effect'inin içindeki karar test edilemiyor — dışarı çıkar"); sekmenin
 * verdiği her karar burada ve `haftalik-ozet.spec.ts` çalıştırarak sınıyor.
 */

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
export function haftaSecenekleri(simdi: Date, n = HAFTA_SECENEK_SAYISI): HaftaSecenegi[] {
  const sonuc: HaftaSecenegi[] = [];
  let kod = ozetHaftasi(simdi);
  for (let i = 0; i < n; i++) {
    const a = isoHaftaAraligi(kod)!;
    sonuc.push({ kod, etiket: i === 0 ? `${aralikMetni(a)} (geçen hafta)` : aralikMetni(a) });
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

const TARIH = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  day: 'numeric',
  month: 'long',
  weekday: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

export function zamanMetni(iso: string): string {
  return TARIH.format(new Date(iso));
}

/** Müşteri planının bu haftaki durumu, tek cümle. */
export function musteriGonderimMetni(m: HaftalikOzetOnizleme['gonderim']['musteri']): string {
  switch (m.durum) {
    case 'kapali':
      return 'Müşteri özeti kapalı; bu hafta müşteriye mail gitmez.';
    case 'planli':
      return m.zaman ? `Müşteriye giden mail: ${zamanMetni(m.zaman)}` : 'Müşteriye giden mail planlı.';
    default:
      return `${PLAN_SONUC_LABELS[m.durum]}${m.zaman ? ` · ${zamanMetni(m.zaman)}` : ''}`;
  }
}

const KANAL_DURUMU: Record<HaftalikOzetOnizleme['gonderim']['kanallar'][number]['durum'], string> = {
  planli: 'Pazartesi 09:00’da gidecek',
  bekliyor: 'Gönderiliyor',
  gonderildi: 'Gönderildi',
  basarisiz: 'Gönderilemedi, yeniden denenecek',
  vazgecildi: 'Gönderilemedi',
};

export function kanalDurumMetni(d: HaftalikOzetOnizleme['gonderim']['kanallar'][number]['durum']): string {
  return KANAL_DURUMU[d];
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
