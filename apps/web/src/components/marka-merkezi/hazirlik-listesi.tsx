import Link from 'next/link';
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
  { baslik: string; eylem: (clientId: string) => { etiket: string; href: string } }
> = {
  reklam_hesabi: {
    baslik: 'Reklam hesabı atandı',
    eylem: () => ({ etiket: 'Hesap ata', href: '#baglantilar' }),
  },
  veri_akisi: {
    baslik: 'Veri geliyor',
    eylem: () => ({ etiket: 'Veri durumuna bak', href: '/ayarlar/senkronizasyon' }),
  },
  marka_bilgisi: {
    baslik: 'Marka bilgileri dolu',
    /*
     * `sekme=marka` ŞART: sekmesiz adres Bilgi Bankası'nın serbest metin
     * sekmesine açılıyordu, maddenin "boş" dediği alanlar (sektör, kategori,
     * ana amaç, vaatler) ise Marka sekmesinde. Kullanıcı tıklayıp aradığı
     * alanı bulamıyordu (canlı tur, 2026-10-05).
     */
    eylem: (id) => ({
      etiket: 'Bilgileri doldur',
      href: `/kutuphane/bilgi-bankasi?musteri=${id}&sekme=marka`,
    }),
  },
  logo: {
    baslik: 'Logo yüklü',
    eylem: (id) => ({
      etiket: 'Logo yükle',
      href: `/kutuphane/bilgi-bankasi?musteri=${id}&sekme=logo`,
    }),
  },
  aylik_butce: {
    baslik: 'Bu ayın bütçesi tanımlı',
    eylem: (id) => ({ etiket: 'Bütçe tanımla', href: `/butce?musteri=${id}` }),
  },
  sosyal_kanal: {
    baslik: 'Sayfa ya da kanal bağlı',
    eylem: () => ({ etiket: 'Kanal bağla', href: '#baglantilar' }),
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

export function HazirlikListesi({ veri }: { veri: WorkspaceHazirlik }) {
  const tamam = veri.maddeler.filter((m) => m.durum === 'tamam').length;
  const eksikZorunlu = veri.maddeler.filter((m) => m.zorunlu && m.durum !== 'tamam').length;

  return (
    <section
      aria-labelledby="hazirlik-baslik"
      className="rounded-2xl border border-line bg-surface"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 id="hazirlik-baslik" className="text-base font-semibold text-ink">
            {veri.hazir
              ? 'Reklama hazır'
              : `Reklama hazır değil: ${eksikZorunlu} zorunlu adım eksik`}
          </h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            {veri.maddeler.length} adımdan {tamam} tanesi tamam.
          </p>
        </div>
        {/* İLERLEME ÇUBUĞU ERİŞİLEBİLİR: değer ve etiket ekran okuyucuya gidiyor. */}
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={veri.maddeler.length}
          aria-valuenow={tamam}
          aria-label="Tamamlanan adımlar"
          className="h-2 w-40 overflow-hidden rounded-full bg-surface-sunken"
        >
          <div
            className={`h-full rounded-full ${veri.hazir ? 'bg-ok' : 'bg-warn'}`}
            style={{ width: `${(tamam / Math.max(veri.maddeler.length, 1)) * 100}%` }}
          />
        </div>
      </div>

      <ul className="divide-y divide-line">
        {veri.maddeler.map((m) => {
          const tanim = HAZIRLIK_MADDE_TANIMI[m.kod];
          const d = DURUM[m.durum];
          const eylem = tanim.eylem(veri.clientId);
          return (
            <li key={m.kod} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-3.5">
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${d.sinif}`}
              >
                {d.isaret}
              </span>
              {/*
                METİN EN AZ 14rem. Yalnızca `min-w-0 flex-1` varken dar ekranda
                metin küçülüyor, eylem bağlantısı sağda kalıyor ve açıklama
                satır başına iki kelimeye sıkışıyordu (390 px'te ölçüldü). Alt
                sınırla `flex-wrap` bağlantıyı alta indiriyor.
              */}
              <div className="min-w-[14rem] flex-1">
                <p className="text-sm font-medium text-ink">
                  <span className="sr-only">{d.okunus}: </span>
                  {tanim.baslik}
                  {!m.zorunlu && (
                    <span className="ml-2 text-xs font-normal text-ink-muted">önerilen</span>
                  )}
                </p>
                <p className="mt-0.5 break-words text-sm text-ink-muted">{m.aciklama}</p>
              </div>
              {/* TAMAM OLAN MADDEDE EYLEM YOK: yapılacak bir şey yokken
                  düğme göstermek, dikkati eksik olandan çalıyor. */}
              {m.durum === 'eksik' && (
                <Link
                  href={eylem.href}
                  className="ml-10 shrink-0 self-center rounded-lg px-2.5 py-1.5 sm:ml-0 text-sm font-medium text-brand-strong transition-colors hover:bg-brand-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  {eylem.etiket} →
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
