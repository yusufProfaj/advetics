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
import { AcilirListe, ILK_SATIR } from './acilir-liste';

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
  const satir = (is: (typeof yanit.isler)[number]) => {
    const yas = bekleyenIsYasi(is.enEski);
    return (
      <li key={`${is.tur}:${is.clientId}`}>
        {/*
          TEK SATIR: ad, cümle ve yaş aynı satırda, taşan cümle kırpılıyor
          ve tamamı `title`da. Satırın iki satıra kırılması kartı yeniden
          uzatıyordu.
        */}
        <Link
          href={bekleyenIsAdresi(is)}
          title={`${is.clientAdi} · ${bekleyenIsCumlesi(is, onayYetkisi)}`}
          className="group flex items-center gap-2 px-4 py-1.5 text-[13px] transition-colors duration-200 hover:bg-surface-muted"
        >
          <span className="max-w-[40%] shrink-0 truncate font-semibold text-ink">{is.clientAdi}</span>
          <span className="min-w-0 flex-1 truncate text-ink-muted">{bekleyenIsCumlesi(is, onayYetkisi)}</span>
          {yas && <span className="shrink-0 text-[11px] tabular-nums text-ink-muted">{yas}</span>}
          <span
            className="shrink-0 text-xs font-semibold text-brand-strong transition-transform duration-200 ease-[var(--ease-out)] group-hover:translate-x-0.5 motion-reduce:transition-none"
            aria-hidden
          >
            →
          </span>
        </Link>
      </li>
    );
  };

  return (
    /*
      AYRI, DAR KART (kullanıcı, 2026-10-09): tam genişlik bir liste sayfanın
      ortasında bir tablo gibi duruyordu. Genişlik `max-w-xl`, satırlar tek
      satır; Google Ads'in hesap teşhisi kartı da sayfanın bir köşesinde.
    */
    <section
      aria-labelledby="bekleyen-isler-baslik"
      className="w-full max-w-xl overflow-hidden rounded-xl border border-line bg-surface"
    >
      <h2 id="bekleyen-isler-baslik" className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-ink">
        Bekleyen işler
        {hal === 'dolu' && (
          <span className="rounded-full bg-brand-soft px-1.5 text-[11px] font-semibold tabular-nums text-brand-strong">
            {yanit.isler.length}
          </span>
        )}
      </h2>

      {hal === 'bos' && <p className="-mt-1 px-4 pb-2.5 text-sm text-ink-muted">Bekleyen iş yok</p>}

      {hal === 'dolu' && (
        <div className="border-t border-line">
          {/* İlk satırlar her zaman görünür, kalanı "Tümünü göster" ile (`AcilirListe`). */}
          <AcilirListe
            toplam={yanit.isler.length}
            ilk={<ul className="divide-y divide-line">{yanit.isler.slice(0, ILK_SATIR).map(satir)}</ul>}
            kalan={<ul className="divide-y divide-line border-t border-line">{yanit.isler.slice(ILK_SATIR).map(satir)}</ul>}
          />
        </div>
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
    <section aria-busy="true" className="w-full max-w-xl rounded-xl border border-line bg-surface px-4 py-2.5">
      <h2 className="text-sm font-semibold text-ink">Bekleyen işler</h2>
      <p className="text-sm text-ink-muted">Yükleniyor…</p>
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
