import type { ReactNode } from 'react';
import type { Dil } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Serit } from '@/components/ui/hal';
import { DurumNoktasi, type DurumHali } from '@/components/ui/rozet';
import { yazmaHatasiSinifla } from '../hesap';

/**
 * ═══ AdvStrategy v2 ORTAK PARÇALAR — YALNIZ KILAVUZ RENKLERİ ═══
 *
 * Kutu, şerit ve durum noktası ortak bileşenlerden (`components/ui`): bu
 * modülün kendi kopyaları vardı ve panelin geri kalanından ayrışıyordu.
 * Buradaki sarmalayıcılar yalnız modülün eski adlarını ortak bileşene
 * bağlıyor; çağıranlar ve kaynak taramaları değişmesin diye.
 */

/**
 * Kaynak etiketi ("Yapay zekâ", "Ajans yazdı", "Hesap verisi"). DURUM
 * DEĞİL, nereden geldiğini söyleyen etiket: durum için `ui/rozet` kullanılır.
 */
export function Etiket({ children, ton = 'cizgi' }: { children: ReactNode; ton?: 'cizgi' | 'kirmizi' | 'dolu' }) {
  const t =
    ton === 'kirmizi' ? 'border-brand text-brand-strong' : ton === 'dolu' ? 'border-ink bg-ink text-surface' : 'border-line text-ink-muted';
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-px text-11 font-semibold ${t}`}>{children}</span>;
}

/**
 * Modülün üç tonu ortak durum hâline: dikkat isteyen (onayda, revizyon)
 * KIRMIZI kalır; eskiden de marka kırmızısı noktaydı.
 */
export function durumHali(ton: 'ok' | 'uyari' | 'notr'): DurumHali {
  return ton === 'ok' ? 'ok' : ton === 'uyari' ? 'hata' : 'taslak';
}

/** Durum noktası. Yeşil yalnız `ok` (yayında, hazır, sayılıyor). */
export function Nokta({ ton, etiket }: { ton: 'ok' | 'uyari' | 'notr'; etiket?: string }) {
  return <DurumNoktasi hal={durumHali(ton)} etiket={etiket} />;
}

/**
 * Bildirim: ortak `Serit` (beyaz zemin, sol kırmızı çizgi). Hata da bu
 * kutuyla ve `role="alert"` ile; başlıksız çağrıda metin başlık olur.
 */
export function Bildirim({ children, baslik, hata = false, eylem }: { children?: ReactNode; baslik?: ReactNode; hata?: boolean; eylem?: ReactNode }) {
  return (
    <Serit ton={hata ? 'hata' : 'uyari'} baslik={baslik ?? children} eylemler={eylem}>
      {baslik ? children : undefined}
    </Serit>
  );
}

/** Giriş ve gönder kartlarının iki ikonu: rapor (belge) ve yeni strateji (yükselen çizgi). */
export function StratejiIkonu({ ad }: { ad: 'rapor' | 'yeni' }) {
  return ad === 'rapor' ? (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M7 3h7l5 5v13H7z M14 3v5h5 M10 13h6 M10 17h6" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 18l6-6 4 4 6-8 M14 8h6v6" />
    </svg>
  );
}

export const GIRDI = 'w-full min-w-0 rounded-alan border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand disabled:bg-surface-muted disabled:text-ink-muted';

/** Yazma sonucu: üç hâl ayrı (çakışma ≠ hata). */
export type Yazma<T> = { tur: 'tamam'; veri: T } | { tur: 'cakisma'; mesaj: string } | { tur: 'hata'; mesaj: string };

/**
 * TEK YAZMA YOLU. 409'da plan yeniden okunur ve sürüm gönderilenden
 * FARKLIYSA "başkası değiştirdi"; aynıysa sunucunun kendi cümlesi (v1
 * `yazmaHatasiSinifla` gerekçesi: 409 beş ayrı durumda dönüyor).
 */
export async function yaz<T>(
  yol: string,
  yontem: 'POST' | 'PUT' | 'PATCH',
  govde: unknown,
  tazeSurum: () => Promise<number | null>,
  gonderilenSurum: number | null,
  dil: Dil = 'tr',
): Promise<Yazma<T>> {
  try {
    const veri = await apiFetch<T>(yol, { method: yontem, body: JSON.stringify(govde) });
    return { tur: 'tamam', veri };
  } catch (err) {
    const taze = err instanceof ApiRequestError && err.status === 409 ? await tazeSurum() : null;
    const s = yazmaHatasiSinifla(err, gonderilenSurum, taze, dil);
    return s.cakisma ? { tur: 'cakisma', mesaj: s.mesaj } : { tur: 'hata', mesaj: s.mesaj };
  }
}
