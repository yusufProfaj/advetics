import Link from 'next/link';
import type { ReactNode } from 'react';
import { Uyari } from '@/components/ui/uyari';
import { dugmeSinifi } from '@/components/ui/dugme';
import {
  bekleyenIsAdresi,
  bekleyenIsCumlesi,
  bekleyenIsYasi,
  bekleyenKutuHali,
  boostRozeti,
  kaynakHataMetni,
  kesmeMetni,
  type BekleyenIslerSonucu,
} from '@/lib/bekleyen-isler';
import type { HizliErisimOgesi } from '@/lib/hizli-erisim';

/**
 * ═══ GENEL BAKIŞ › BEKLEYEN İŞLER ═══
 *
 * "Bugün ne yapmalıyım" sorusunun cevabı, başlığın hemen altında
 * (MIMARI § 1). DÖRT HÂL AYRI ÇİZİLİYOR (CLAUDE.md `.catch(() => setX([]))`
 * yasağı): yükleniyor (`BekleyenIslerIskeleti`, Suspense sınırının yedeği),
 * hata (sunucunun cümlesi), boş, dolu. Bir de `yalniz_hata`: satır yok ama
 * bir kaynak okunamadı; orada "Bekleyen iş yok" yazmak yalan olurdu.
 *
 * SÖZ (Promise) ALIYOR, VERİ DEĞİL: sayfa çağrıyı diğer okumalarla paralel
 * başlatıyor ve bu bileşen kendi Suspense sınırının içinde bekliyor. Yavaş
 * bir bekleyenler ucu sayfanın geri kalanını tutmuyor; hızlıysa kutu
 * sayfayla birlikte geliyor. Söz hiçbir zaman reddedilmiyor: hata, sonuç
 * nesnesinin içinde (`BekleyenIslerSonucu`).
 */
export async function BekleyenIslerKutusu({
  sonuc,
  onayYetkisi,
}: {
  sonuc: Promise<BekleyenIslerSonucu>;
  /** `strategy.approve` — strateji onay satırının cümlesi buna göre. */
  onayYetkisi: boolean;
}) {
  const s = await sonuc;
  const hal = bekleyenKutuHali(s);

  if (s.durum === 'hata') {
    return (
      <Uyari ton="tehlike">
        <strong>Bekleyen işler alınamadı.</strong> <span>{s.mesaj}</span>
      </Uyari>
    );
  }

  const { yanit } = s;
  const kesme = kesmeMetni(yanit);

  return (
    <section aria-labelledby="bekleyen-isler-baslik" className="rounded-xl border border-line bg-surface">
      <h2 id="bekleyen-isler-baslik" className="px-4 pt-3 text-sm font-semibold text-ink">
        Bekleyen işler
      </h2>

      {hal === 'bos' && <p className="px-4 pb-3 pt-1 text-sm text-ink-muted">Bekleyen iş yok</p>}

      {hal === 'dolu' && (
        <ul className="mt-2 divide-y divide-line border-t border-line">
          {yanit.isler.map((is) => {
            const yas = bekleyenIsYasi(is.enEski);
            return (
              <li key={`${is.tur}:${is.clientId}`}>
                <Link
                  href={bekleyenIsAdresi(is)}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-4 py-2 text-sm transition-colors hover:bg-surface-muted"
                >
                  <span className="font-semibold text-ink">{is.clientAdi}</span>
                  <span className="text-ink-muted" aria-hidden>
                    ·
                  </span>
                  <span className="min-w-0 flex-1 text-ink">{bekleyenIsCumlesi(is, onayYetkisi)}</span>
                  {yas && <span className="text-xs tabular-nums text-ink-muted">{yas}</span>}
                  <span className="text-xs font-semibold text-brand-strong" aria-hidden>
                    →
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/*
        KISMİ HATA VE KESME ALTTA: satırlar geliyor, eksik kalan söyleniyor.
        Düşen kaynağın satırını sessizce atlamak, o işin hiç olmadığını
        söylemekle aynıydı.
      */}
      {(yanit.hatalar.length > 0 || kesme) && (
        <div className="space-y-0.5 border-t border-line px-4 py-2 text-xs">
          {yanit.hatalar.map((h) => (
            <p key={h.tur} role="alert" className="text-danger-strong">
              {kaynakHataMetni(h)}
            </p>
          ))}
          {kesme && <p className="text-ink-muted">{kesme}</p>}
        </div>
      )}
    </section>
  );
}

/** Yükleniyor hâli — kutunun Suspense yedeği. Boş bir alan "iş yok" gibi okunurdu. */
export function BekleyenIslerIskeleti() {
  return (
    <section aria-busy="true" className="rounded-xl border border-line bg-surface px-4 py-3">
      <h2 className="text-sm font-semibold text-ink">Bekleyen işler</h2>
      <p className="mt-1 text-sm text-ink-muted">Yükleniyor…</p>
    </section>
  );
}

/**
 * ═══ HIZLI ERİŞİM DÜĞMELERİ ═══
 *
 * Görünür liste çağırandan geliyor ve menünün süzgecinden türüyor
 * (`hizliErisim(visibleSections(...))`); burada yetki kararı yok.
 * Akıllı Boost rozeti kutuyla AYNI sözden okunuyor ve kendi Suspense
 * sınırında: rozet gelmeden düğme çizilmiş oluyor.
 */
export function HizliErisim({
  ogeler,
  rozet,
}: {
  ogeler: readonly HizliErisimOgesi[];
  rozet: ReactNode;
}) {
  if (ogeler.length === 0) return null;
  return (
    <nav aria-label="Hızlı erişim" className="flex flex-wrap items-center gap-1.5">
      {ogeler.map((o) => (
        <Link key={o.href} href={o.href} className={dugmeSinifi('ikincil', 'kucuk')}>
          {o.etiket}
          {o.boostRozeti && rozet}
        </Link>
      ))}
    </nav>
  );
}

/** Akıllı Boost düğmesindeki bekleyen sayısı. Sıfırsa rozet yok. */
export async function BoostRozeti({ sonuc }: { sonuc: Promise<BekleyenIslerSonucu> }) {
  const r = boostRozeti(await sonuc);
  if (!r) return null;
  return (
    <span
      title={r.baslik}
      aria-label={r.baslik}
      className="rounded-full bg-brand-soft px-1.5 text-[11px] font-semibold tabular-nums text-brand-strong"
    >
      {r.metin}
    </span>
  );
}
