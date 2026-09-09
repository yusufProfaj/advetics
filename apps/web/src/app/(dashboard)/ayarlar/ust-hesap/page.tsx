import { redirect } from 'next/navigation';
import type { ManagerAccountTree } from '@advetics/shared';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { hasPermission, requireSession } from '@/lib/session';
import { UstHesapEkrani } from '@/components/ust-hesap/ust-hesap-ekrani';

export const metadata = { title: 'Üst Hesap — Advetics' };

/**
 * ÜST HESAP (MCC) — birden çok ŞİRKETİ tek girişle yönetme katmanı.
 *
 * Hiyerarşi: Üst Hesap → Şirket → Workspace → Reklam Hesabı → Kampanya.
 *
 * YETKİ SAYFADA DA KONTROL EDİLİYOR, yalnızca menüde değil: menü süzgeci
 * bağlantıyı gizliyor ama adresi bilen biri yine girebilir. Asıl kapı API
 * tarafında (`assertOrgAdmin`) — buradaki kontrol, yetkisiz kullanıcının
 * boş bir ekrana bakıp "bozuk" sanmasını engelliyor.
 */
export default async function UstHesapPage() {
  const session = await requireSession();

  if (!hasPermission(session, 'org.write')) {
    redirect('/dashboard');
  }

  /*
   * HATA YUTULMUYOR (CLAUDE.md: `.catch(() => setX([]))` yasak).
   *
   * `null` ile hata AYNI ŞEY DEĞİL: birincisi "üst hesabın yok, kurabilirsin",
   * ikincisi "okuyamadık". İkisini aynı boş ekrana çevirmek, kullanıcının
   * var olan bir üst hesabın üstüne ikincisini kurmaya çalışması demekti.
   */
  let agac: ManagerAccountTree | null = null;
  let yuklemeHatasi: string | null = null;
  try {
    agac = await serverApiFetch<ManagerAccountTree | null>('/manager-account');
  } catch (e) {
    yuklemeHatasi = e instanceof ApiRequestError ? e.message : 'Bağlantı kurulamadı';
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Üst Hesap</h1>
        <p className="mt-1 max-w-prose text-sm text-ink-muted">
          Google&apos;ın Müşteri Merkezi (MCC) karşılığı: bir danışmanlık, altındaki birden çok
          şirketi tek girişle yönetir. Her şirketin kendi workspace&apos;leri, kendi reklam
          hesapları ve kendi ekibi olur.
        </p>
      </header>

      <UstHesapEkrani ilkAgac={agac} yuklemeHatasi={yuklemeHatasi} />
    </div>
  );
}
