'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ROLES, type Role } from '@advetics/shared';
import { apiFetch } from '@/lib/api';

/**
 * Ekip yönetimi — davet, rol değiştirme, yetki kaldırma.
 *
 * Yetki MÜŞTERİ BAZINDA veriliyor. Bir kişi A müşterisinde kampanya yöneticisi,
 * B'de yalnızca görüntüleyici olabilir; bu yüzden düzenlenen şey kullanıcı
 * değil, kullanıcı × müşteri eşleşmesi (membership).
 */
export const ROLE_TR: Record<Role, string> = {
  owner: 'Sahip',
  admin: 'Yönetici',
  manager: 'Kampanya Yöneticisi',
  analyst: 'Analist',
  client_viewer: 'Görüntüleyici',
};

/** Rolün ne yapabildiği — seçerken tahmin ettirmemek için. */
const ROLE_HINT: Record<Role, string> = {
  owner: 'Her şey + faturalama + organizasyonu silme',
  admin: 'Her şey, faturalama hariç',
  manager: 'Kampanya kurar, kural yazar, bütçe değiştirir',
  analyst: 'Okur ve rapor üretir; canlıda aksiyon alamaz',
  client_viewer: 'Yalnızca kendi verisini okur',
};

/**
 * Org geneli erişim (tüm müşteriler) YALNIZCA bu roller için.
 * Sunucudaki `createInvitationSchema` da aynı kuralı uyguluyor; burada
 * tekrarlanmasının sebebi, kullanıcının geçersiz kombinasyonu SEÇEBİLMESİNİ
 * engellemek. Sonradan hata göstermek, o hatayı yapmasına izin vermektir.
 */
const ORG_WIDE_ROLES: readonly Role[] = ['owner', 'admin'];

interface ClientOption {
  id: string;
  name: string;
}

interface MembershipRow {
  id: string;
  role: Role;
  clientId: string | null;
  client: { id: string; name: string } | null;
}

export interface MemberRow {
  id: string;
  email: string;
  fullName: string | null;
  status: string;
  lastLoginAt: string | null;
  memberships: MembershipRow[];
}

export interface InvitationRow {
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

export function TeamManager({
  members,
  invitations,
  clients,
  currentUserId,
}: {
  members: MemberRow[];
  invitations: InvitationRow[];
  clients: ClientOption[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('manager');
  const [clientId, setClientId] = useState<string>('');

  const orgWideAllowed = ORG_WIDE_ROLES.includes(role);

  async function run(key: string, fn: () => Promise<unknown>): Promise<void> {
    setBusy(key);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İşlem tamamlanamadı.');
    } finally {
      setBusy(null);
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes('@')) {
      setError('Geçerli bir e-posta adresi girin.');
      return;
    }
    // Org geneli seçimi yalnızca izin veren rollerde gönderilir; diğerlerinde
    // müşteri seçilmesi ZORUNLU, çünkü müşterisiz bir manager hiçbir şey
    // göremez ve bu sessizce "çalışmıyor" gibi görünür.
    if (!clientId && !orgWideAllowed) {
      setError('Bu rol için bir müşteri seçin.');
      return;
    }

    await run('invite', async () => {
      await apiFetch('/invitations', {
        method: 'POST',
        body: JSON.stringify({ email: trimmed, role, clientId: clientId || null }),
      });
      setEmail('');
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Davet                                                            */}
      {/* ---------------------------------------------------------------- */}
      <form onSubmit={invite} className="rounded-xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink">Kullanıcı davet et</h2>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ornek@sirket.com"
            disabled={busy !== null}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted disabled:opacity-60"
          />

          <select
            value={role}
            onChange={(e) => {
              const next = e.target.value as Role;
              setRole(next);
              // Rol org geneline izin vermiyorsa ve "tüm müşteriler" seçiliyse
              // seçimi temizle — geçersiz bir kombinasyonun ekranda durması
              // kullanıcıya kaydedilebilirmiş gibi görünür.
              if (!ORG_WIDE_ROLES.includes(next) && clientId === '') setClientId('');
            }}
            disabled={busy !== null}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink disabled:opacity-60"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_TR[r]}
              </option>
            ))}
          </select>

          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            disabled={busy !== null}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink disabled:opacity-60"
          >
            {/* Uyumsuz seçenek HİÇ GÖSTERİLMİYOR. Gösterip sonra reddetmek,
                kullanıcının o hatayı yapmasına izin vermek demek. */}
            {orgWideAllowed && <option value="">Tüm müşteriler</option>}
            {!orgWideAllowed && <option value="">Müşteri seçin…</option>}
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <p className="mt-2 text-xs text-ink-muted">{ROLE_HINT[role]}</p>

        <div className="mt-3 flex items-center gap-3">
          <button
            type="submit"
            disabled={busy !== null || email.trim().length === 0}
            className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === 'invite' ? 'Gönderiliyor…' : 'Davet Gönder'}
          </button>
          <span className="text-xs text-ink-muted">
            Davet bağlantısı e-postayla GÖNDERİLMİYOR — bildirim altyapısı henüz yok.
            Bağlantıyı listeden alıp kendiniz iletmeniz gerekiyor.
          </span>
        </div>
      </form>

      {/* ---------------------------------------------------------------- */}
      {/* Bekleyen davetler                                                */}
      {/* ---------------------------------------------------------------- */}
      {invitations.length > 0 && (
        <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-ink">
            Bekleyen davetler ({invitations.length})
          </h2>
          <ul className="mt-3 space-y-2">
            {invitations.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm"
              >
                <span className="text-ink">{inv.email}</span>
                <span className="text-xs text-ink-muted">
                  {inv.client?.name ?? 'tüm müşteriler'} · {ROLE_TR[inv.role] ?? inv.role} · son
                  geçerlilik {formatDate(inv.expiresAt)}
                </span>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    run(`inv-${inv.id}`, () =>
                      apiFetch(`/invitations/${inv.id}`, { method: 'DELETE' }),
                    )
                  }
                  className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
                >
                  {busy === `inv-${inv.id}` ? 'İptal ediliyor…' : 'İptal et'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Kullanıcılar                                                     */}
      {/* ---------------------------------------------------------------- */}
      <ul className="space-y-3">
        {members.map((member) => {
          const isSelf = member.id === currentUserId;

          return (
            <li key={member.id} className="rounded-xl border border-line bg-surface p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">
                    {member.fullName ?? member.email}
                    {isSelf && <span className="ml-2 text-xs text-ink-muted">(siz)</span>}
                  </p>
                  <p className="truncate text-sm text-ink-muted">{member.email}</p>
                </div>
                <p className="text-xs text-ink-muted">Son giriş: {formatDate(member.lastLoginAt)}</p>
              </div>

              <div className="mt-4 space-y-2">
                {member.memberships.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2"
                  >
                    <span className="flex-1 text-sm font-medium text-ink">
                      {m.client?.name ?? 'Tüm müşteriler'}
                    </span>

                    <select
                      value={m.role}
                      disabled={busy !== null || isSelf}
                      onChange={(e) =>
                        run(`m-${m.id}`, () =>
                          apiFetch(`/memberships/${m.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ role: e.target.value }),
                          }),
                        )
                      }
                      className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink disabled:opacity-50"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_TR[r]}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      disabled={busy !== null || isSelf}
                      onClick={() =>
                        run(`d-${m.id}`, () =>
                          apiFetch(`/memberships/${m.id}`, { method: 'DELETE' }),
                        )
                      }
                      className="text-xs font-medium text-danger hover:underline disabled:opacity-40"
                    >
                      Kaldır
                    </button>
                  </div>
                ))}

                {/*
                  KENDİ YETKİNİ DEĞİŞTİREMİYORSUN ve bu bilinçli. Tek yöneticinin
                  kendini analiste düşürmesi ya da yetkisini kaldırması, kimsenin
                  geri alamayacağı bir kilitlenme üretir — düzeltmek için
                  sunucuda SQL çalıştırmak gerekir.
                */}
                {isSelf && (
                  <p className="text-xs text-ink-muted">
                    Kendi yetkinizi bu ekrandan değiştiremezsiniz — yanlışlıkla erişiminizi
                    kapatmanız hâlinde geri almanın panelden yolu olmazdı.
                  </p>
                )}

                {member.memberships.length === 0 && (
                  <p className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-ink-muted">
                    Hiçbir müşteriye yetkisi yok — giriş yapabilir ama panelde hiçbir veri
                    göremez.
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
