import Link from 'next/link';
import type { Role } from '@advetics/shared';
import { serverApiFetch } from '@/lib/api';
import { requireSession } from '@/lib/session';

export const metadata = { title: 'Ekip & Yetkiler — Advetics' };

/**
 * Rol adları İŞ DİLİNDE.
 *
 * Kod tarafındaki anahtarlar (`owner`, `client_viewer`) panelde geçmiyor;
 * arayüz Türkçe ve panelde oturan kişi bu terimleri bilmek zorunda değil.
 *
 * Etiketler burada, `packages/shared` içinde DEĞİL: shared iki tarafın da
 * kullandığı sözleşmeleri tutuyor ve API bu metinleri hiç kullanmıyor.
 * Bilinmeyen bir rol gelirse ham anahtara düşülüyor — boş göstermek, rolün
 * olmadığı izlenimi verirdi.
 */
const ROLE_TR: Record<Role, string> = {
  owner: 'Sahip',
  admin: 'Yönetici',
  manager: 'Kampanya Yöneticisi',
  analyst: 'Analist',
  client_viewer: 'Görüntüleyici',
};

const roleLabel = (role: Role): string => ROLE_TR[role] ?? role;

/**
 * Ekip & Yetkiler — kurulumun ÜÇÜNCÜ adımı.
 *
 * Yetki MÜŞTERİ BAZINDA veriliyor, kullanıcı bazında değil. Bir kişi A
 * müşterisinde yönetici, B'de yalnızca okuyucu olabilir; bu yüzden ekranın
 * merkezinde kullanıcı değil, kullanıcı × müşteri eşleşmesi var.
 *
 * ORGANİZASYON GENELİ ÜYELİK AYRI GÖSTERİLİYOR (`clientId === null`). O üyelik
 * "bütün müşteriler" demek ve listede müşteri adı olmadığı için sessizce
 * "yetkisi yok" gibi okunabiliyordu — oysa tam tersi, en geniş yetki o.
 */
interface MembershipRow {
  id: string;
  role: Role;
  clientId: string | null;
  permissions: Record<string, boolean> | null;
  client: { id: string; name: string } | null;
}

interface MemberRow {
  id: string;
  email: string;
  fullName: string | null;
  status: string;
  lastLoginAt: string | null;
  memberships: MembershipRow[];
}

interface InvitationRow {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  client: { name: string } | null;
}

function formatDate(value: string | null): string {
  if (!value) return 'hiç giriş yapmadı';
  return new Date(value).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default async function TeamPage() {
  await requireSession();

  const [members, invitations] = await Promise.all([
    serverApiFetch<MemberRow[]>('/members').catch(() => []),
    serverApiFetch<InvitationRow[]>('/invitations').catch(() => []),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ekip &amp; Yetkiler</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Yetki müşteri bazında verilir: bir kişi bir müşteride yönetici, başka bir
          müşteride yalnızca okuyucu olabilir.
        </p>
      </div>

      {/* Sessiz kesme yok — kaç kişi listelendiği yazılı. */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-xl border border-line bg-surface px-5 py-3.5 text-sm">
        <span>
          <strong>{members.length}</strong> kullanıcı
        </span>
        {invitations.length > 0 && (
          <span className="text-ink-muted">
            <strong className="text-ink">{invitations.length}</strong> bekleyen davet
          </span>
        )}
      </div>

      {members.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface p-8 text-center">
          <p className="text-sm font-medium text-ink">Kullanıcı bulunamadı</p>
          <p className="mt-1.5 text-sm text-ink-muted">
            Listenin boş görünmesi yetkinin yetersiz olmasından da kaynaklanabilir.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {members.map((member) => {
            const orgWide = member.memberships.filter((m) => m.clientId === null);
            const scoped = member.memberships.filter((m) => m.clientId !== null);

            return (
              <li
                key={member.id}
                className="rounded-xl border border-line bg-surface p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">
                      {member.fullName ?? member.email}
                    </p>
                    <p className="truncate text-sm text-ink-muted">{member.email}</p>
                  </div>
                  <div className="text-right text-xs text-ink-muted">
                    <p>Son giriş: {formatDate(member.lastLoginAt)}</p>
                    {member.status !== 'active' && (
                      <span className="mt-1 inline-block rounded bg-surface-sunken px-2 py-0.5 font-medium">
                        {member.status}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {orgWide.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-2 rounded-lg border border-brand-soft bg-brand-soft px-3 py-2 text-sm"
                    >
                      <span className="font-semibold text-brand-strong">
                        {roleLabel(m.role)}
                      </span>
                      <span className="text-ink-muted">— tüm müşteriler</span>
                    </div>
                  ))}

                  {scoped.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {scoped.map((m) => (
                        <span
                          key={m.id}
                          className="rounded-lg border border-line bg-surface-muted px-2.5 py-1 text-xs"
                        >
                          <span className="font-medium text-ink">{m.client?.name}</span>
                          <span className="text-ink-muted"> · {roleLabel(m.role)}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/*
                    Yetkisiz kullanıcı SESSİZ KALMAMALI. Portföy seed'i Ecem'i
                    bilerek boş portföyle açtı; ekranda ayrıca yazmasaydı
                    "hesabı var ama hiçbir şey göremiyor" durumu ancak o kişi
                    şikâyet edince fark edilirdi.
                  */}
                  {orgWide.length === 0 && scoped.length === 0 && (
                    <p className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-ink-muted">
                      Hiçbir müşteriye yetkisi yok — giriş yapabilir ama panelde hiçbir
                      veri göremez.
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {invitations.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-ink">Bekleyen davetler</h2>
          <ul className="mt-2 space-y-2">
            {invitations.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm"
              >
                <span className="text-ink">{inv.email}</span>
                <span className="text-xs text-ink-muted">
                  {inv.client?.name ?? 'tüm müşteriler'} · {roleLabel(inv.role)} ·
                  son geçerlilik {formatDate(inv.expiresAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
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
