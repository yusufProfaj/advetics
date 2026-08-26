import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverApiFetch } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { TeamManager, type MemberRow } from '@/components/tenancy/team-manager';
import { DanismanAta } from '@/components/tenancy/danisman-ata';

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
    /*
     * 5xl'DEN 7xl'E. Üye kartları dikey yığındaydı ve geniş ekranda her kart
     * satırın tamamını kaplayıp sağda ölü alan bırakıyordu — kanallar
     * ekranındaki şikâyetin aynısı. Kartlar artık ızgarada; genişlik onlara
     * yarıyor.
     *
     * TAM GENİŞLİK DEĞİL: bu ekranda yetki açıklamaları ve rol metinleri var
     * ve tam genişlikte satır başına çok fazla karakter düşüyor.
     */
    <div className="mx-auto max-w-7xl space-y-6">
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

      {/*
        Sessiz kesme yok — kaç kişi listelendiği yazılı.

        "DANIŞMAN ATA" SAYAÇ BANDININ İÇİNDE, müşteriler ekranındaki "Yeni
        müşteri" ile aynı yerde. Ayrı bir satırda tek başına duran bir düğme
        kendi şeridini kaplıyor ve bandın sağı boş kalıyordu.

        YALNIZCA ORG YÖNETİCİSİNE: `POST /memberships` zaten org yöneticisi
        istiyor. Düğmeyi herkese gösterip 403 aldırmak, yapılamayacak bir işi
        yapılabilir göstermek olurdu.
      */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-5 py-3.5 text-sm">
        <span>
          <strong>{members.length}</strong> kişinin bu workspace’e erişimi var
        </span>
        {session.isOrgAdmin && (
          <DanismanAta
            clientId={client.id}
            clientName={client.name}
            mevcutUyeIdleri={members.map((m) => m.id)}
          />
        )}
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
