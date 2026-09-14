import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { UstHesapOzeti } from '@advetics/shared';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { hasPermission, requireSession } from '@/lib/session';
import { UstHesapYonetimi } from '@/components/ust-hesap/ust-hesap-yonetimi';

export const metadata = { title: 'Üst Hesaplar · Advetics' };

/**
 * ═══ ÜST HESAPLAR — hesabın KENDİSİNİN yönetildiği yer ═══
 *
 * Şirketler ekranı bir üst hesabın ALTINI gösteriyor (şirketler,
 * workspace'ler); burası hesabın kendisini: ad, paket, ekip büyüklüğü,
 * doluluk, silme ve yeni hesap açma.
 *
 * İKİSİ AYRI SAYFA VE BU BİR TERCİH DEĞİL, KAPSAM FARKI. Şirketler ekranı
 * AKTİF hesabın ağacını çiziyor ve yazma yolları `ctx.orgId`ye çivili; bu
 * ekran ise hesaplar ARASINDA çalışıyor — aktif olmayan bir hesabı
 * düzenlemek ya da silmek, ona geçmeyi gerektirmemeli.
 *
 * YETKİ: `org.write`. Menüde de aynı anahtar (`nav-sections.ts`) — ikisinin
 * ayrışması, menüde görünen ama açılmayan (ya da gizlenip çalışan) bir satır
 * demekti. Asıl kapı API tarafında: platform sahibi bütün hesapları görüyor,
 * diğerleri yalnızca üyesi olduklarını; silme yalnızca platform sahibinde.
 * Buradaki kontrol, yetkisiz kullanıcının boş bir ekrana bakıp "bozuk"
 * sanmasını engelliyor.
 */
export default async function UstHesaplarPage() {
  const session = await requireSession();

  if (!hasPermission(session, 'org.write')) {
    redirect('/dashboard');
  }

  /*
   * HATA YUTULMUYOR (CLAUDE.md: `.catch(() => setX([]))` yasak). "Hesabın
   * yok" ile "liste okunamadı" farklı şeyler ve ikisi aynı boş ekrana
   * çevrilirse kullanıcı var olan bir hesabın üstüne ikincisini kurmaya
   * çalışır.
   */
  let hesaplar: UstHesapOzeti[] = [];
  let yuklemeHatasi: string | null = null;
  try {
    hesaplar = (await serverApiFetch<UstHesapOzeti[]>('/manager-account/liste')) ?? [];
  } catch (e) {
    yuklemeHatasi = e instanceof ApiRequestError ? e.message : 'Bağlantı kurulamadı';
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Üst Hesaplar</h1>
        <p className="mt-1 max-w-prose text-sm text-ink-muted">
          Üst hesap, Google&apos;ın Müşteri Merkezi (MCC) karşılığı: bir danışmanlık, altındaki
          birden çok şirketi tek girişle yönetir. Burada hesabın kendisini yönetiyorsun — adı,
          paketi, ekibi ve silinmesi. Bir hesabın{' '}
          <strong>altındaki şirketler ve workspace&apos;ler</strong> için{' '}
          <Link
            href="/ayarlar/ust-hesap"
            className="font-medium text-brand-strong hover:underline"
          >
            Şirketler
          </Link>{' '}
          ekranına geç.
        </p>
      </header>

      <UstHesapYonetimi
        hesaplar={hesaplar}
        platformAdmin={session.platformAdmin}
        yuklemeHatasi={yuklemeHatasi}
      />

      <p className="text-xs text-ink-muted">
        Bir üst hesaba kişi eklemek için o hesaba geçip{' '}
        <Link href="/ayarlar/ekip" className="font-medium text-brand-strong hover:underline">
          Ekip &amp; Yetkiler
        </Link>{' '}
        ekranındaki &ldquo;Üst hesap ekibi&rdquo; bölümünü kullan.
      </p>
    </div>
  );
}
