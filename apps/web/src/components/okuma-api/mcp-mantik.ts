/**
 * Yapay zekâ bağlantısı panelinin SAF kararları (`docs/okuma-api/MCP-YAZMA-MIMARI.md`).
 * Bileşenden ayrı: süre kuralı ve durum rozeti sunucunun kuralıyla aynı
 * kalmalı ve render edilmeden sınanabilmeli.
 */
import {
  OKUMA_ANAHTARI_SURELERI,
  YAZMA_ANAHTARI_SURELERI,
  type AnahtarYetkisi,
  type McpOnayOzeti,
} from '@advetics/shared';
import type { DurumHali } from '@/components/ui/rozet';

/**
 * Seçilebilir süreler. YAZMA ANAHTARINDA SÜRESİZ YOK ve en çok 90 gün:
 * sunucu (`okumaAnahtariOlusturSchema`) zaten reddediyor; seçeneği göstermek
 * kullanıcıyı ancak düğmeye basınca öğreneceği bir hataya götürürdü.
 */
export function sureSecenekleri(yetki: AnahtarYetkisi): Array<number | 'suresiz'> {
  return yetki === 'yazma' ? [...YAZMA_ANAHTARI_SURELERI] : [...OKUMA_ANAHTARI_SURELERI, 'suresiz'];
}

/**
 * Yetki değişince seçili süre yeni listede yoksa EN YAKIN İZİNLİ değere
 * iner (süresiz/365 → 90). Sessizce süresize çıkmaz: yazmadan okumaya
 * geçişte seçim aynen kalır.
 */
export function sureyiUyarla(yetki: AnahtarYetkisi, sure: string): string {
  const izinli = sureSecenekleri(yetki).map(String);
  if (izinli.includes(sure)) return sure;
  return String(YAZMA_ANAHTARI_SURELERI[YAZMA_ANAHTARI_SURELERI.length - 1]);
}

/**
 * Durum rozeti. Yeşil YALNIZ uygulanan işlemde (kılavuz: yeşil yalnız durum).
 * Başarısız = kırmızı; bekleyen ve süren = gri yuvarlak; vazgeçilen ve
 * süresi dolan = gri kare (yapılmadı, bitti).
 */
export const ONAY_DURUM_HALI: Record<McpOnayOzeti['durum'], DurumHali> = {
  uygulandi: 'ok',
  basarisiz: 'hata',
  bekliyor: 'taslak',
  uygulaniyor: 'taslak',
  vazgecildi: 'dur',
  suresi_doldu: 'dur',
};

/**
 * Özetin tabloya sığan iki satırı. Sunucunun özeti "Workspace: …" ile
 * başlıyor, ikinci satır işin kendisi (amaç ya da kampanya adı), üçüncü
 * satır değişiklik ("Durum: Yayında → Duraklatıldı", "Bütçe: … → …").
 * Kalan satırlar `tam`da: hücrenin başlığında okunuyor, yok sayılmıyor.
 */
export function ozetSatirlari(ozet: string[]): { ana: string; alt: string; tam: string } {
  const [workspace = '', is = '', degisiklik = ''] = ozet;
  return {
    ana: is || workspace,
    alt: [workspace, degisiklik].filter(Boolean).join(' · '),
    tam: ozet.join('\n'),
  };
}
