import Link from 'next/link';
import { ADIMLAR, ADIM_ADLARI, kurulumAdresi, type KurulumTuru } from './kurulum-akisi';

export interface SecimKarti {
  tur: KurulumTuru;
  baslik: string;
  aciklama: string;
  /** Doluysa kart kapalı ve SEBEP kartta yazıyor. */
  engel: string | null;
}

/**
 * ═══ NE KURMAK İSTİYORSUN? ═══
 *
 * Üç sihirbaz tek kapıdan giriyor. Kullanıcının kendi cümlesi: *"bu
 * kurulumlar çok zor çünkü sürekli bir kural var, nasıl kurulum yapılacağını
 * sadece sistemi kuran kişi olarak ben biliyorum"*. İlk kural hiyerarşinin
 * KENDİSİ: üst hesap, şirket ve workspace kelimeleri panelde her yerde
 * geçiyor ama neyin neyin içinde olduğu hiçbir yerde yazmıyordu. Seçim
 * ekranı onu üç satırla anlatıyor ve her kartta adımların listesi duruyor —
 * kullanıcı başlamadan ne kadar süreceğini görüyor.
 *
 * KAPALI KART GİZLENMİYOR. "Yeni şirket" kartını paket dolu diye hiç
 * çizmemek, kullanıcının şirket eklemenin nerede olduğunu araması demekti;
 * sebebi kartın içinde yazıyor.
 */
export function KurulumSecimi({ kartlar }: { kartlar: SecimKarti[] }) {
  return (
    <div className="space-y-6">
      <ul className="grid gap-3 md:grid-cols-3">
        {kartlar.map((k) => {
          const adimlar = ADIMLAR[k.tur].filter((a) => a !== 'bitti').map((a) => ADIM_ADLARI[a]);
          const govde = (
            <>
              <span className="block text-base font-semibold text-ink">{k.baslik}</span>
              <span className="mt-1 block text-sm text-ink-muted">{k.aciklama}</span>
              <span className="mt-3 block text-xs text-ink-muted">{adimlar.join(' · ')}</span>
              {k.engel ? (
                <span className="mt-3 block text-xs font-medium text-warn-strong">{k.engel}</span>
              ) : (
                <span className="mt-3 block text-sm font-semibold text-brand-strong">Başla</span>
              )}
            </>
          );
          return (
            <li key={k.tur}>
              {k.engel ? (
                <div
                  aria-disabled="true"
                  className="h-full rounded-xl border border-line bg-surface-sunken p-4 opacity-80"
                >
                  {govde}
                </div>
              ) : (
                <Link
                  href={kurulumAdresi(k.tur, ADIMLAR[k.tur][0]!)}
                  className="block h-full rounded-xl border border-line bg-surface p-4 transition hover:border-brand hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {govde}
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">Nasıl düzenleniyor?</h2>
        <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="font-medium text-ink">Üst hesap</dt>
            <dd className="text-ink-muted">Ajansın kendisi. Bütün şirketler tek girişle yönetilir.</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Şirket</dt>
            <dd className="text-ink-muted">
              Reklamı verilen firma. Meta ve Google bağlantısı şirkete aittir.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Workspace</dt>
            <dd className="text-ink-muted">
              Firmanın bir markası ya da projesi. Reklam hesapları, raporlar ve bilgi bankası
              burada durur.
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
