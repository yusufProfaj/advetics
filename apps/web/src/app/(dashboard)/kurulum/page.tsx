import {
  PAKET_SINIRLARI,
  paketAsildiMi,
  type ConnectionSummary,
  type ProviderAvailability,
} from '@advetics/shared';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { hasPermission, requireSession } from '@/lib/session';
import { KurulumSecimi, type SecimKarti } from '@/components/kurulum/kurulum-secimi';
import { KurulumSihirbazi } from '@/components/kurulum/kurulum-sihirbazi';
import { SirketSec } from '@/components/kurulum/sirket-sec';
import { ADIMLAR, adimOku, turOku } from '@/components/kurulum/kurulum-akisi';

export const metadata = { title: 'Kurulum Sihirbazı · Advetics' };

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function hataMetni(e: unknown): string {
  return e instanceof ApiRequestError ? e.message : 'Bağlantı kurulamadı';
}

/**
 * ═══ KURULUM SİHİRBAZI — üst hesap, şirket ve workspace TEK KAPIDAN ═══
 *
 * Kurulum dört ekrana dağılmıştı ve aralarındaki sıra yalnızca sistemi
 * kuran kişinin kafasındaydı. Bu sayfa iki hâlde açılıyor:
 *
 *   · `tur` yoksa: "Ne kurmak istiyorsun?" — üç kart ve hiyerarşinin
 *     üç satırlık anlatımı.
 *   · `tur` varsa: o türün sihirbazı, adresteki adımdan.
 *
 * ENGEL YALNIZCA İLK ADIMDA SINANIYOR. "Zaten bir üst hesabın var" ya da
 * "paket dolu" kuralı, üst hesabı ya da şirketi az önce KURMUŞ kullanıcıyı
 * da yakalardı: sihirbaz kurduktan sonra platform adımına tam sayfa
 * dönüyor ve o an kurallar artık "dolu" diyor. Asıl kapı sunucuda; buradaki
 * kontrol, kullanıcıyı sonunda reddedilecek bir forma sokmamak için.
 */
export default async function KurulumPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const orgYazar = hasPermission(session, 'org.write');
  const ma = session.managerAccount;
  const sirketAdi =
    ma?.organizations.find((o) => o.id === session.activeOrganizationId)?.name ??
    session.organization.name;

  const sinir = ma ? PAKET_SINIRLARI[ma.paket] : null;
  /*
   * AJANSA BAĞLI ŞİRKETİN ADMİNİ — üst hesap üyeliği YOK, `ma` onda `null`.
   *
   * `ma === null` iki ayrı hâl ve bu sayfa ikisini aynı okuyordu: bağımsız
   * şirket (kendi ajansını kurabilir) ile bir ajansın müşteri şirketi
   * (kuramaz). İkincisine "Yeni üst hesap" açık görünüyor, sunucu "Bu şirket
   * zaten bir üst hesaba bağlı" ile reddediyordu; "Yeni şirket" kartı ise
   * ona "Önce bir üst hesap kurmalısın" diyerek tam da yapamayacağı şeyi
   * öneriyordu. Ayıran `organization.ustHesabaBagli` — ev şirketinin
   * gerçeği, sunucudaki kapıyla aynı kaynak.
   */
  const ajansaBagli = !session.platformAdmin && ma === null && session.organization.ustHesabaBagli;
  const kartlar: SecimKarti[] = [
    {
      tur: 'ust-hesap',
      baslik: 'Yeni üst hesap',
      aciklama: 'Yeni bir ajans ya da danışmanlık. İlk şirketi ve workspace’i de birlikte kurarsın.',
      engel: !orgYazar
        ? 'Bunun için yönetici yetkisi gerekiyor.'
        : ajansaBagli
          ? 'Bu şirket bir ajansın üst hesabına bağlı.'
          : !session.platformAdmin && ma !== null
            ? 'Zaten bir üst hesabın var. Yeni şirket ekleyebilirsin.'
            : null,
    },
    {
      tur: 'sirket',
      baslik: 'Yeni şirket',
      aciklama: ma
        ? `${ma.name} altında yeni bir firma ve ilk workspace’i.`
        : 'Üst hesabın altında yeni bir firma ve ilk workspace’i.',
      engel: !orgYazar || !session.isOrgAdmin
        ? 'Bunun için yönetici yetkisi gerekiyor.'
        : ajansaBagli
          ? 'Yeni şirketi bağlı olduğun ajans açabiliyor.'
          : ma === null || sinir === null
            ? 'Önce bir üst hesap kurmalısın.'
          : paketAsildiMi(sinir.maxSirket, ma.organizations.length)
            ? `${sinir.etiket} paketi en fazla ${sinir.maxSirket} şirkete izin veriyor.`
            : null,
    },
    {
      tur: 'workspace',
      baslik: 'Yeni workspace',
      aciklama: session.tumSirketler
        ? 'Bir şirketin içinde yeni bir marka ya da proje.'
        : `${sirketAdi} içinde yeni bir marka ya da proje.`,
      engel: hasPermission(session, 'client.write') ? null : 'Workspace kurma yetkin yok.',
    },
  ];

  const tur = turOku(first(params.tur));
  const ilkAdim = tur ? adimOku(tur, first(params.adim)) : null;
  const kart = tur ? kartlar.find((k) => k.tur === tur) : undefined;
  const ilkAdimda = tur !== null && ilkAdim === ADIMLAR[tur][0];
  const sihirbazAcik = tur !== null && ilkAdim !== null && !(ilkAdimda && kart?.engel);

  const baslik = (
    <header>
      <h1 className="text-2xl font-semibold text-ink">Kurulum Sihirbazı</h1>
      <p className="mt-1 max-w-prose text-sm text-ink-muted">
        {sihirbazAcik
          ? 'Adımları sırayla tamamla. Her adımda neyin gerektiği yazıyor.'
          : 'Ne kurmak istediğini seç. Gerisini adım adım birlikte yaparız.'}
      </p>
    </header>
  );

  if (!sihirbazAcik || tur === null || ilkAdim === null) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6">
        {baslik}
        <KurulumSecimi kartlar={kartlar} />
      </div>
    );
  }

  if (tur === 'workspace' && session.tumSirketler && ma) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        {baslik}
        <SirketSec sirketler={ma.organizations.map((o) => ({ id: o.id, name: o.name }))} />
      </div>
    );
  }

  /*
   * BAĞLANTILAR YALNIZCA GEREKTİĞİNDE ÇEKİLİYOR. Üst hesap ve şirket
   * adımlarında bağlantı listesi ESKİ şirketin listesi (yeni şirket henüz
   * yok) ve havuzda yüzlerce hesap olabiliyor; o adımlar bittiğinde sayfa
   * zaten tam yenileniyor.
   *
   * HATA YUTULMUYOR: "hiç bağlantı yok" ile "liste okunamadı" aynı boş
   * ekrana çevrilirse kullanıcı var olan bağlantısını yeniden kurmaya
   * çalışır.
   */
  let uygunluk: ProviderAvailability[] = [];
  let baglantilar: ConnectionSummary[] = [];
  let yuklemeHatasi: string | null = null;
  if (ilkAdim !== 'ust-hesap' && ilkAdim !== 'sirket') {
    const [u, b] = await Promise.allSettled([
      serverApiFetch<ProviderAvailability[]>('/connections/availability'),
      serverApiFetch<ConnectionSummary[]>('/connections'),
    ]);
    uygunluk = u.status === 'fulfilled' ? (u.value ?? []) : [];
    baglantilar = b.status === 'fulfilled' ? (b.value ?? []) : [];
    yuklemeHatasi =
      u.status === 'rejected' ? hataMetni(u.reason) : b.status === 'rejected' ? hataMetni(b.reason) : null;
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      {baslik}
      <KurulumSihirbazi
        tur={tur}
        ilkAdim={ilkAdim}
        baglam={{
          platformAdmin: session.platformAdmin,
          ustHesapAdi: ma?.name ?? null,
          sirketAdi,
          baglantiYonetebilir:
            hasPermission(session, 'connection.write') &&
            hasPermission(session, 'connection.manage'),
          bilgiBankasiYazabilir: hasPermission(session, 'client.write'),
        }}
        uygunluk={uygunluk}
        baglantilar={baglantilar}
        yuklemeHatasi={yuklemeHatasi}
      />
    </div>
  );
}
