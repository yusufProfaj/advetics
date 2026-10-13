import Link from 'next/link';
import { MARKA_MERKEZI_BOLUMLERI, markaMerkeziAdresi, type MarkaMerkeziBolumKodu } from '@/lib/panel-adresleri';
import { MM_ALT_BASLIKLARI } from './bolumler';

export type RozetTonu = 'tamam' | 'eksik' | 'notr';
export type BolumRozetleri = Partial<Record<MarkaMerkeziBolumKodu, { metin: string; ton: RozetTonu }>>;

const ROZET: Record<RozetTonu, string> = {
  tamam: 'bg-ok-soft text-ok-strong',
  eksik: 'bg-warn-soft text-warn-strong',
  notr: 'bg-surface-sunken text-ink-muted',
};

/**
 * ═══ MARKA MERKEZİ'NİN İÇ MENÜSÜ — ÜÇ BÖLÜM, "NEREDEYİM" HER AN GÖRÜNÜR ═══
 *
 * Kurulum · Marka · Workspace bilgileri (docs/panel-sadelestirme/MIMARI.md).
 * Eski yedi bölüm burada sekiz satır ve iki girinti demekti; kullanıcı
 * kurulumun hangi bölümde bittiğini menüden okuyamıyordu.
 *
 * KURULUM ROZETİ TEK SAYAÇTAN (`kurulumSayaci`): eskiden menü "5 bağlı",
 * hazırlık şeridi "4/7", kurulum bölümü "9/15" diyordu — üç sayı, tek soru.
 * Bölüm başına ayrı görünme kapısı YOK: sayfanın tek kapısı
 * `MARKA_MERKEZI_IZNI`; kartların kapısı bölümün içinde.
 *
 * BAĞLANTI, DÜĞME DEĞİL: seçim adreste (`?bolum=`), sayfa sunucuda çiziliyor
 * ve geri tuşu bölümler arasında çalışıyor. Dar ekranda menü yatay kayan bir
 * şeride dönüşüyor; sayfa yatay kaymıyor.
 */
export function IcMenu({
  clientId,
  aktif,
  rozetler,
}: {
  clientId: string;
  aktif: MarkaMerkeziBolumKodu;
  rozetler: BolumRozetleri;
}) {
  return (
    <nav aria-label="Marka Merkezi bölümleri" className="-mx-1 overflow-x-auto px-1 lg:mx-0 lg:overflow-visible lg:px-0">
      <ul className="flex gap-1 lg:sticky lg:top-24 lg:flex-col lg:rounded-xl lg:border lg:border-line lg:bg-surface lg:p-2">
        {MARKA_MERKEZI_BOLUMLERI.map((b) => {
          const secili = b.kod === aktif;
          const rozet = rozetler[b.kod];
          return (
            <li key={b.kod} className="shrink-0">
              <Link
                href={markaMerkeziAdresi(b.kod, clientId)}
                aria-current={secili ? 'page' : undefined}
                className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors motion-reduce:transition-none ${
                  secili ? 'bg-brand-soft font-semibold text-brand-strong' : 'font-medium text-ink hover:bg-surface-sunken/70'
                }`}
              >
                <span>{b.ad}</span>
                {rozet && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ROZET[rozet.ton]}`}>{rozet.metin}</span>}
              </Link>
              {/* ALT BAŞLIKLAR YALNIZ SEÇİLİ BÖLÜMDE ve geniş ekranda: dar
                  ekranda yatay şeridi ikinci bir satıra bölmek okunmazdı. */}
              {secili && (
                <ul className="mb-1 ml-3 mt-0.5 hidden border-l-2 border-line pl-2 lg:block">
                  {(MM_ALT_BASLIKLARI[b.kod] as ReadonlyArray<{ capa: string; ad: string }>).map((a) => (
                    <li key={a.capa}>
                      <a href={`#${a.capa}`} className="block rounded-md px-2 py-1.5 text-sm text-ink-muted hover:text-ink">
                        {a.ad}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
