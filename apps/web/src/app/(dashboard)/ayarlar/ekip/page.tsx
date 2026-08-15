import Link from 'next/link';
import { serverApiFetch } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { TeamManager, type MemberRow } from '@/components/tenancy/team-manager';

export const metadata = { title: 'Ekip & Yetkiler — Advetics' };

interface ClientRow {
  id: string;
  name: string;
}

/**
 * Ekip & Yetkiler — kurulumun ÜÇÜNCÜ adımı.
 *
 * Yetki MÜŞTERİ BAZINDA veriliyor, kullanıcı bazında değil: bir kişi A
 * müşterisinde kampanya yöneticisi, B'de yalnızca görüntüleyici olabilir.
 * Ekranın merkezinde bu yüzden kullanıcı değil, kullanıcı × müşteri eşleşmesi
 * var.
 *
 * Veri sunucuda çekiliyor, eylemler istemcide. Kullanıcı EKLEME uç noktası
 * (`POST /members`) yalnızca org yöneticisine açık; portföy yöneticisi
 * listeyi görür ama ekleyemez.
 *
 * DAVET AKIŞI KALDIRILDI: token üretiliyor, hash'lenip saklanıyor ve düz
 * metni atılıyordu — e-posta altyapısı olmadığı için üretimde kimse daveti
 * kabul edemiyordu. Kullanıcı artık doğrudan oluşuyor.
 */
export default async function TeamPage() {
  const session = await requireSession();

  const [members, clients] = await Promise.all([
    serverApiFetch<MemberRow[]>('/members').catch(() => []),
    serverApiFetch<ClientRow[]>('/clients').catch(() => []),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ekip &amp; Yetkiler</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Yetki müşteri bazında verilir: bir kişi bir müşteride yönetici, başka bir
          müşteride yalnızca görüntüleyici olabilir.
        </p>
      </div>

      {/* Sessiz kesme yok — kaç kişi listelendiği yazılı. */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-xl border border-line bg-surface px-5 py-3.5 text-sm">
        <span>
          <strong>{members.length}</strong> kullanıcı
        </span>
        <span className="text-ink-muted">
          <strong className="text-ink">{clients.length}</strong> müşteri
        </span>
      </div>

      {members.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface p-8 text-center">
          <p className="text-sm font-medium text-ink">Kullanıcı bulunamadı</p>
          <p className="mt-1.5 text-sm text-ink-muted">
            Listenin boş görünmesi yetkinin yetersiz olmasından da kaynaklanabilir.
          </p>
        </div>
      ) : (
        <TeamManager
          members={members}
          clients={clients}
          currentUserId={session.user.id}
        />
      )}

      <p className="text-xs text-ink-muted">
        Yeni müşteri açmak için{' '}
        <Link href="/ayarlar/musteriler" className="font-medium text-brand-strong hover:underline">
          Müşteriler
        </Link>
        , reklam hesabı bağlamak için{' '}
        <Link href="/ayarlar/baglantilar" className="font-medium text-brand-strong hover:underline">
          Platform Bağlantıları
        </Link>
        .
      </p>
    </div>
  );
}
