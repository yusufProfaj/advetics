import { MARKA_MERKEZI_BOLUMLERI, markaMerkeziAdresi, type MarkaMerkeziBolumKodu } from '@/lib/panel-adresleri';
import { SayfaIcMenu } from '@/components/ui/sayfa-ic-menu';
import { MM_ALT_BASLIKLARI } from './bolumler';

export type RozetTonu = 'tamam' | 'eksik' | 'notr';
export type BolumRozetleri = Partial<Record<MarkaMerkeziBolumKodu, { metin: string; ton: RozetTonu }>>;

/**
 * ═══ MARKA MERKEZİ'NİN İÇ MENÜSÜ — ÜÇ BÖLÜM, "NEREDEYİM" HER AN GÖRÜNÜR ═══
 *
 * Kurulum · Marka · Workspace bilgileri (docs/panel-sadelestirme/MIMARI.md).
 * 2026-10-14'ten beri ortak sayfa içi yan menü (`SayfaIcMenu`, BILESENLER
 * § 9): Reklam Yöneticisi, İyileştir ve Varlıklar'la aynı yerde, aynı
 * görünüşte. Kendi menü kopyası bir ekranda bölüm değiştirmeyi diğerinden
 * farklı bir kontrolle yaptırıyordu.
 *
 * EKSİK = KIRMIZI NOKTA (taslak). Kurulum rozeti TEK SAYAÇTAN
 * (`kurulumSayaci`); "8 / 10" metni artık noktanın ekran okuyucu adında ve
 * `title`ında, sayının kendisi Kurulum listesinin başında. Eskiden menü,
 * şerit ve liste üç ayrı sayı söylüyordu; menüde ikinci bir görünür sayı
 * aynı ayrışmayı geri getirirdi. `notr` (bilinmiyor) nokta ÜRETMEZ:
 * okunamayan adımı "eksik" diye işaretlemek yanlış alarm olur.
 *
 * BAĞLANTI, DÜĞME DEĞİL: seçim adreste (`?bolum=`), sayfa sunucuda
 * çiziliyor ve geri tuşu bölümler arasında çalışıyor.
 *
 * ALT BAŞLIKLAR (çapalar) KORUNDU: seçili bölümün kartlarına atlama
 * bağlantıları menünün altında, yalnız geniş ekranda (dar ekranda menü yatay
 * hap şeridi ve ikinci bir satır okunmazdı).
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
    <>
      <SayfaIcMenu
        etiket="Marka Merkezi bölümleri"
        secili={aktif}
        ogeler={MARKA_MERKEZI_BOLUMLERI.map((b) => {
          const rozet = rozetler[b.kod];
          return {
            deger: b.kod,
            href: markaMerkeziAdresi(b.kod, clientId),
            uyari: rozet?.ton === 'eksik',
            etiket: (
              <span title={rozet ? `${b.ad}: ${rozet.metin}` : undefined}>
                {b.ad}
                {rozet && <span className="sr-only"> ({rozet.metin})</span>}
              </span>
            ),
          };
        })}
      />
      <ul aria-label="Bu bölümde" className="mt-3 hidden border-l border-line pl-2 min-[900px]:block">
        {(MM_ALT_BASLIKLARI[aktif] as ReadonlyArray<{ capa: string; ad: string }>).map((a) => (
          <li key={a.capa}>
            <a
              href={`#${a.capa}`}
              className="block rounded-alan px-2 py-1.5 text-12 text-ink-muted no-underline transition-colors hover:bg-surface-sunken hover:text-ink motion-reduce:transition-none"
            >
              {a.ad}
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
