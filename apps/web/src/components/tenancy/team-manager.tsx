'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ROLES, type Role } from '@advetics/shared';
import { apiFetch } from '@/lib/api';

/**
 * Ekip yönetimi — kullanıcı ekleme, rol değiştirme, yetki kaldırma.
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
 * Sunucudaki `createMemberSchema` da aynı kuralı uyguluyor; burada
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
  clients,
  currentUserId,
}: {
  members: MemberRow[];
  clients: ClientOption[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('manager');
  const [clientId, setClientId] = useState<string>('');
  const [notice, setNotice] = useState<string | null>(null);

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

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes('@')) {
      setError('Geçerli bir e-posta adresi girin.');
      return;
    }
    if (fullName.trim().length < 2) {
      setError('Ad soyad girin.');
      return;
    }
    // Sunucudaki kuralın AYNISI. Formu gönderip 400 almak yerine burada
    // durmak, kullanıcıya parolayı yeniden yazdırmıyor.
    if (password.length < 12 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Parola en az 12 karakter olmalı ve harf ile rakam içermeli.');
      return;
    }
    // Org geneli seçimi yalnızca izin veren rollerde gönderilir; diğerlerinde
    // müşteri seçilmesi ZORUNLU, çünkü müşterisiz bir manager hiçbir şey
    // göremez ve bu sessizce "çalışmıyor" gibi görünür.
    if (!clientId && !orgWideAllowed) {
      setError('Bu rol için bir müşteri seçin.');
      return;
    }

    await run('add', async () => {
      const res = await apiFetch<{ created: boolean }>('/members', {
        method: 'POST',
        body: JSON.stringify({
          email: trimmed,
          fullName: fullName.trim(),
          password,
          role,
          clientId: clientId || null,
        }),
      });
      setEmail('');
      setFullName('');
      setPassword('');
      if (!res.created) {
        setNotice(
          `${trimmed} zaten kayıtlıydı — yalnızca yeni yetki eklendi. ` +
            'Yazdığın parola KULLANILMADI, kullanıcı eski parolasıyla giriyor.',
        );
      }
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
      {/* Kullanıcı ekle                                                   */}
      {/* ---------------------------------------------------------------- */}
      <form onSubmit={addMember} className="rounded-xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink">Kullanıcı ekle</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Kullanıcı ANINDA oluşur — davet gönderilmiyor. Parolayı sen belirliyorsun ve
          kullanıcıya kendin iletiyorsun.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Ad Soyad"
            disabled={busy !== null}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted disabled:opacity-60"
          />

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ornek@sirket.com"
            disabled={busy !== null}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted disabled:opacity-60"
          />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {/*
            PAROLA GİZLENMİYOR (type="text").

            Bunu yönetici kullanıcıya ELDEN iletecek; göremediği bir şeyi
            doğru iletemez. Gizlemek "bir daha yaz" alanı ya da göz simgesi
            gerektirirdi ve ikisi de aynı bilgiyi ekrana getirmenin daha
            dolambaçlı yolu. Kendi parolası değil, üçüncü birinin geçici
            parolası.
          */}
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Parola (en az 12 karakter)"
            autoComplete="off"
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
            {busy === 'add' ? 'Ekleniyor…' : 'Kullanıcıyı Ekle'}
          </button>
          <span className="text-xs text-ink-muted">
            İlk girişte parola değiştirme ZORLANMIYOR — belirlediğin parola sen
            söylemedikçe geçerli kalır.
          </span>
        </div>

        {/*
          MEVCUT KULLANICIYA YETKİ EKLENDİYSE BUNU SÖYLÜYORUZ.

          Aynı e-posta zaten kayıtlıysa sunucu yeni kullanıcı OLUŞTURMUYOR,
          yalnızca yeni yetkiyi ekliyor ve parolaya dokunmuyor. Söylenmezse
          yönetici yazdığı parolanın geçerli olduğunu sanır ve kullanıcı giriş
          yapamayınca ikisi de yanlış yerde arar.
        */}
        {notice && (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50/60 px-3 py-2 text-xs text-amber-900">
            {notice}
          </p>
        )}
      </form>

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
