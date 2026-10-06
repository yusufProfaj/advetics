import Link from 'next/link';
import { mmAdresi } from './bolumler';
import type { HazirlikDurumu, HazirlikKodu, WorkspaceHazirlik } from '@advetics/shared';

/**
 * ═══ "BU WORKSPACE REKLAMA HAZIR MI?" ═══
 *
 * Bir workspace'in kurulumu dokuz ekrana dağılmıştı ve hangisinin eksik
 * olduğunu söyleyen tek bir yer yoktu. Liste her maddenin durumunu,
 * NEDENİNİ (sunucudan, `aciklama`) ve nereden tamamlanacağını (burada)
 * gösteriyor.
 *
 * BAŞLIK VE BAĞLANTI PANELDE, `Record<HazirlikKodu, …>` İLE. Sunucuya yeni
 * bir madde eklendiğinde bu harita derlemede kırılıyor; eklenmeden kalsaydı
 * madde ekranda başlıksız bir satır olurdu.
 */
export const HAZIRLIK_MADDE_TANIMI: Record<
  HazirlikKodu,
  {
    baslik: string;
    /**
     * EKSİK LİSTESİNDEKİ AD. Başlıklar olumlu cümle ("Logo yüklü") ve
     * "Eksik: Logo yüklü" tam tersini söylüyordu.
     */
    kisa: string;
    eylem: (clientId: string) => { etiket: string; href: string };
  }
> = {
  reklam_hesabi: {
    baslik: 'Reklam hesabı atandı',
    kisa: 'Reklam hesabı',
    eylem: (id) => ({ etiket: 'Hesap ata', href: mmAdresi(id, 'baglantilar') }),
  },
  veri_akisi: {
    baslik: 'Veri geliyor',
    kisa: 'Veri akışı',
    eylem: () => ({ etiket: 'Veri durumuna bak', href: '/ayarlar/senkronizasyon' }),
  },
  marka_bilgisi: {
    baslik: 'Marka bilgileri dolu',
    kisa: 'Marka bilgileri',
    /*
     * MARKA BÖLÜMÜNÜN MARKA BİLGİLERİ KARTINA. Eskiden Bilgi Bankası'nın
     * serbest metin sekmesine açılıyordu, maddenin "boş" dediği alanlar ise
     * başka sekmedeydi (canlı tur, 2026-10-05). 2026-10-06'dan beri hazırlık
     * bağlantıları SAYFADAN ÇIKARMIYOR: Marka Merkezi'nin kendi bölümüne.
     */
    eylem: (id) => ({
      etiket: 'Bilgileri doldur',
      href: mmAdresi(id, 'marka', {}, 'marka-bilgileri'),
    }),
  },
  logo: {
    baslik: 'Logo yüklü',
    kisa: 'Logo',
    eylem: (id) => ({
      etiket: 'Logo yükle',
      href: mmAdresi(id, 'marka', {}, 'logo'),
    }),
  },
  aylik_butce: {
    baslik: 'Bu ayın bütçesi tanımlı',
    kisa: 'Bu ayın bütçesi',
    eylem: (id) => ({ etiket: 'Bütçe tanımla', href: mmAdresi(id, 'butce') }),
  },
  sosyal_kanal: {
    baslik: 'Sayfa ya da kanal bağlı',
    kisa: 'Sayfa ya da kanal',
    eylem: (id) => ({ etiket: 'Kanal bağla', href: mmAdresi(id, 'baglantilar') }),
  },
};

/*
 * DURUM YALNIZCA RENKTEN OKUNMUYOR: her hâlin kendi işareti ve ekran
 * okuyucu için kendi metni var. Renk körlüğünde yeşil ile kırmızı ayırt
 * edilemiyor.
 */
const DURUM: Record<HazirlikDurumu, { isaret: string; sinif: string; okunus: string }> = {
  tamam: { isaret: '✓', sinif: 'bg-ok-soft text-ok-strong', okunus: 'Tamam' },
  eksik: { isaret: '!', sinif: 'bg-warn-soft text-warn-strong', okunus: 'Eksik' },
  bilinmiyor: { isaret: '?', sinif: 'bg-surface-sunken text-ink-muted', okunus: 'Bilinmiyor' },
};

/**
 * ═══ HAZIRLIK ŞERİDİ — TEK SATIR, AYRINTI İSTEYENE ═══
 *
 * Altı maddenin hepsi açıklamasıyla alt alta duruyordu ve sayfanın ilk
 * ekranını kaplıyordu; kullanıcının tarifi "görüntü kirliliği" (2026-10-06).
 * Oysa sorunun cevabı tek satır: hazır mı, değilse NE eksik.
 *
 *   · Kapalı: halka göstergesi, durum cümlesi ve YALNIZCA eksik maddeler,
 *     her biri doğrudan gidilecek yere bağlantı. Tamam olan maddeler
 *     kalabalık etmiyor.
 *   · Açık (`<details>`): eksiklerin nedenleri ve tamamlananların tek satırlık
 *     listesi. JS yok; sayfa sunucuda çiziliyor.
 *
 * ZORUNLU ADIM EKSİKSE AÇIK BAŞLIYOR: reklam çıkmayacaksa sebebi bir tık
 * arkasına saklanmamalı. Her şey tamamsa şerit yeşil ve tek satır.
 */
export function HazirlikListesi({ veri }: { veri: WorkspaceHazirlik }) {
  const toplam = veri.maddeler.length;
  const tamam = veri.maddeler.filter((m) => m.durum === 'tamam').length;
  const eksikler = veri.maddeler.filter((m) => m.durum !== 'tamam');
  const tamamlar = veri.maddeler.filter((m) => m.durum === 'tamam');
  const eksikZorunlu = eksikler.filter((m) => m.zorunlu).length;
  const yuzde = Math.round((tamam / Math.max(toplam, 1)) * 100);
  const renk = eksikZorunlu > 0 ? 'var(--danger)' : eksikler.length > 0 ? 'var(--warn)' : 'var(--ok)';

  const durumCumlesi = !veri.hazir
    ? `Reklama hazır değil · ${eksikZorunlu} zorunlu adım eksik`
    : eksikler.length > 0
      ? `Reklama hazır · ${eksikler.length} önerilen adım kaldı`
      : 'Reklama hazır · bütün adımlar tamam';

  return (
    <section aria-labelledby="hazirlik-baslik" className="rounded-xl border border-line bg-surface">
      <details open={eksikZorunlu > 0} className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          {/* HALKA GÖSTERGE — değer ve etiket ekran okuyucuya gidiyor. */}
          <span
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={toplam}
            aria-valuenow={tamam}
            aria-label="Tamamlanan adımlar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ background: `conic-gradient(${renk} ${yuzde}%, var(--surface-sunken) 0)` }}
          >
            <span className="flex h-[1.95rem] w-[1.95rem] items-center justify-center rounded-full bg-surface text-[0.75rem] font-bold tabular-nums text-ink">
              {tamam}/{toplam}
            </span>
          </span>

          <span className="min-w-0 flex-1">
            <span id="hazirlik-baslik" className="block text-sm font-semibold text-ink">
              {durumCumlesi}
            </span>
            {/* EKSİKLER DOĞRUDAN BAĞLANTI: ayrıntıyı açmadan gidilecek yer. */}
            {eksikler.length > 0 && (
              <span className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
                <span>Eksik:</span>
                {eksikler.map((m) => (
                  <Link
                    key={m.kod}
                    href={HAZIRLIK_MADDE_TANIMI[m.kod].eylem(veri.clientId).href}
                    className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn-strong transition-colors hover:bg-warn/20"
                  >
                    {HAZIRLIK_MADDE_TANIMI[m.kod].kisa}
                  </Link>
                ))}
              </span>
            )}
          </span>

          {eksikler.length > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink">
              <span className="group-open:hidden">Ayrıntı</span>
              <span className="hidden group-open:inline">Gizle</span>
              <span aria-hidden="true" className="transition-transform group-open:rotate-180">
                ▾
              </span>
            </span>
          )}
        </summary>

        {eksikler.length > 0 && (
          <div className="border-t border-line">
            <ul className="divide-y divide-line">
              {eksikler.map((m) => {
                const tanim = HAZIRLIK_MADDE_TANIMI[m.kod];
                const d = DURUM[m.durum];
                const eylem = tanim.eylem(veri.clientId);
                return (
                  <li key={m.kod} className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3">
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.75rem] font-bold ${d.sinif}`}
                    >
                      {d.isaret}
                    </span>
                    <div className="min-w-[14rem] flex-1">
                      <p className="text-sm font-medium text-ink">
                        <span className="sr-only">{d.okunus}: </span>
                        {tanim.baslik}
                        {m.zorunlu && (
                          <span className="ml-2 rounded-full bg-danger-soft px-1.5 py-0.5 text-xs font-semibold text-danger-strong">
                            zorunlu
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-sm text-ink-muted">{m.aciklama}</p>
                    </div>
                    {/* EYLEM YALNIZCA EKSİK MADDEDE — tamam olanlar burada listelenmiyor. */}
                    {m.durum === 'eksik' && (
                      <Link
                        href={eylem.href}
                        className="ml-8 shrink-0 self-center rounded-lg px-2.5 py-1 text-sm font-semibold text-brand-strong transition-colors hover:bg-brand-soft sm:ml-0"
                      >
                        {eylem.etiket} →
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
            {tamamlar.length > 0 && (
              <p className="border-t border-line px-4 py-2.5 text-sm text-ink-muted">
                <span className="font-medium text-ok-strong">✓ Tamam:</span>{' '}
                {tamamlar.map((m) => HAZIRLIK_MADDE_TANIMI[m.kod].kisa).join(' · ')}
              </p>
            )}
          </div>
        )}
      </details>
    </section>
  );
}
