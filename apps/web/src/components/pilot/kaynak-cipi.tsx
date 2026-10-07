import Link from 'next/link';
import type { BosNedeni, Hucre, Kaynak } from '@advetics/shared';
import { BOS_NEDENI_METNI, bosNedeniBaglantisi, kaynakEtiketi, kaynakHedefi } from './hesap';

/**
 * ═══ KAYNAK ÇİPİ — HER SAYININ YANINDA ═══
 *
 * Pilot'un tek görsel imzası: kesikli çerçeve ve nokta. "Bu sayı nereden
 * geldi?" sorusunun cevabı her hücrede yazılı (`Kaynakli<T>`). Yapay zekâ
 * metni marka renginde noktayla ayrılıyor: kullanıcı modelin yazdığı ile
 * veriden gelen arasındaki farkı bir bakışta görmeli.
 *
 * AÇIKLAMA GÖRÜNÜR METİN, `title` DEĞİL. `title` dokunmatik ekranda hiç
 * açılmıyor (`terim.tsx` dersi); "Meta payı %62 × yeni kitle %60" gibi bir
 * açıklama tam ona ihtiyacı olan kişiden saklanırdı.
 */
export function KaynakCipi({
  kaynak,
  clientId,
  aciklamaGoster = false,
  baglantisiz = false,
}: {
  kaynak: Kaynak;
  clientId: string;
  aciklamaGoster?: boolean;
  /**
   * Müşteri görünümünde çip BAĞLANTI DEĞİL: kaynak ekranları (Marka Merkezi,
   * Aylık Bütçe) müşteri hesabına kapalı ve tıklanınca yetki ekranı açılırdı.
   */
  baglantisiz?: boolean;
}) {
  const hedef = baglantisiz ? null : kaynakHedefi(kaynak, clientId);
  const yz = kaynak.tur === 'yz_metin';
  const ic = (
    <>
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${yz ? 'bg-brand' : 'bg-ink-muted/60'}`} />
      <span className="truncate">{kaynakEtiketi(kaynak)}</span>
    </>
  );
  const sinif =
    'inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-dashed border-ink-muted/35 px-2 py-px text-[11.5px] leading-5 text-ink-muted';
  return (
    <span className="inline-flex min-w-0 max-w-full flex-wrap items-baseline gap-x-2">
      {hedef ? (
        <Link href={hedef} className={`${sinif} hover:border-ink-muted hover:text-ink`}>
          {ic}
        </Link>
      ) : (
        <span className={sinif}>{ic}</span>
      )}
      {aciklamaGoster && kaynak.aciklama && <span className="min-w-0 text-xs text-ink-muted">{kaynak.aciklama}</span>}
    </span>
  );
}

/**
 * BOŞ HÜCRE: neden + ne yapmalı. Cümleler `BOS_NEDENI_METNI`nden (tek tablo);
 * bileşen yalnız çiziyor. "Veri yok" diye tek bir cümle yazmak, hepsinin işi
 * farklı olan yirmi nedeni aynı boş alana çevirirdi.
 */
export function BosHucre({ neden, clientId, kisa = false }: { neden: BosNedeni; clientId: string; kisa?: boolean }) {
  const m = BOS_NEDENI_METNI[neden];
  const hedef = bosNedeniBaglantisi(neden, clientId);
  return (
    <span className="inline-flex min-w-0 flex-col gap-0.5 text-sm">
      <span className="font-medium text-ink">{m.ne}</span>
      {!kisa && (
        <span className="text-xs text-ink-muted">
          {hedef ? (
            <Link href={hedef} className="underline decoration-ink-muted/40 underline-offset-2 hover:text-ink">
              {m.neYapmali}
            </Link>
          ) : (
            m.neYapmali
          )}
        </span>
      )}
    </span>
  );
}

/** Dolu hücre: değer + çip; boş hücre: neden. Üçüncü hâl yok (sözleşme `Hucre`). */
export function HucreDegeri<T>({
  hucre,
  clientId,
  goster,
  sinif = '',
  baglantisiz = false,
}: {
  hucre: Hucre<T>;
  clientId: string;
  goster: (v: T) => string;
  sinif?: string;
  baglantisiz?: boolean;
}) {
  if (!hucre.dolu) return <BosHucre neden={hucre.emptyReason} clientId={clientId} />;
  return (
    <span className="flex min-w-0 flex-col items-start gap-1.5">
      <span className={`tabular-nums ${sinif}`}>{goster(hucre.deger)}</span>
      <KaynakCipi kaynak={hucre.kaynak} clientId={clientId} baglantisiz={baglantisiz} />
    </span>
  );
}
