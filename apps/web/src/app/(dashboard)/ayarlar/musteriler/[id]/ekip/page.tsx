import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverApiFetch } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { TeamManager, type MemberRow } from '@/components/tenancy/team-manager';

export const metadata = { title: 'Workspace ekibi — Advetics' };

interface ClientRow {
  id: string;
  name: string;
}

/**
 * BİR WORKSPACE'İN ERİŞİM LİSTESİ — ajans ekibinden AYRI.
 *
 * "Ekip & Yetkiler" ajans personelini yönetiyor ve müşteri hesaplarını
 * BİLEREK dışarıda bırakıyor: ajansın kaç çalışanı olduğu o ekrandan
 * okunabilmeli. Ama müşterinin kendi giriş hesaplarının da yönetilecek bir
 * yeri olmak zorunda — yoksa oluşturulduktan sonra hiçbir ekranda
 * görünmüyorlar.
 *
 * Bu sayfa o boşluğu kapatıyor: yalnızca bu workspace'e erişimi olanlar,
 * müşterinin kendi hesapları DAHİL. Uç nokta ikisini `?clientId=` ile
 * ayırıyor.
 */
export default async function WorkspaceTeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();

  const [members, clients] = await Promise.all([
    serverApiFetch<MemberRow[]>(`/members?clientId=${encodeURIComponent(id)}`).catch(
      () => [],
    ),
    serverApiFetch<ClientRow[]>('/clients').catch(() => []),
  ]);

  const client = clients.find((c) => c.id === id);
  // Erişimi olmayan bir kimlik RLS'te boş dönüyor; 404 doğru cevap.
  if (!client) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link
          href="/ayarlar/musteriler"
          className="text-xs font-medium text-brand-strong hover:underline"
        >
          ← Müşteriler
        </Link>
        <h1 className="mt-1.5 text-2xl font-semibold">{client.name} — Ekip</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Bu workspace’e erişimi olan kişiler. Müşterinin kendi giriş hesapları da
          burada; ajans ekibi listesinde görünmüyorlar.
        </p>
      </div>

      {/* Sessiz kesme yok — kaç kişi listelendiği yazılı. */}
      <div className="rounded-xl border border-line bg-surface px-5 py-3.5 text-sm">
        <strong>{members.length}</strong> kişinin bu workspace’e erişimi var
      </div>

      {members.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface p-8 text-center">
          <p className="text-sm font-medium text-ink">Bu workspace’e atanmış kimse yok</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-muted">
            Aşağıdaki formdan bir kullanıcı ekleyebilirsin. Müşterinin kendi
            görebilmesi için rolü <strong>Görüntüleyici</strong> seç — o rol
            yalnızca bu workspace’i görür ve ajans ekranlarını hiç görmez.
          </p>
          <div className="mt-5 text-left">
            <TeamManager members={[]} clients={[client]} currentUserId={session.user.id} />
          </div>
        </div>
      ) : (
        <TeamManager
          members={members}
          // TEK MÜŞTERİ VERİLİYOR: bu ekrandan başka bir workspace'e yetki
          // verilememeli, yoksa "Ege'nin ekibi" ekranından Fenbay'a erişim
          // açılabilirdi.
          clients={[client]}
          currentUserId={session.user.id}
        />
      )}
    </div>
  );
}
