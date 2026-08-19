import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ClientChannels } from '@advetics/shared';
import { serverApiFetch } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { BagliKanallar } from '@/components/tenancy/bagli-kanallar';

export const metadata = { title: 'Bağlı kanallar — Advetics' };

/**
 * BİR WORKSPACE'İN BAĞLI KANALLARI.
 *
 * Platform Bağlantıları ekranı AJANSIN işi: Meta ve Google'a bir kez
 * bağlanmak. Bu ekran MÜŞTERİNİN işi: o bağlantıdan gelen hesaplardan
 * hangilerinin bu müşteriye ait olduğunu söylemek.
 *
 * İkisinin ayrılması, bağlantı ekranının onlarca müşterinin hesabını yan yana
 * göstermesini bitiriyor — hangi hesabın kime ait olduğu ancak satır satır
 * okunarak anlaşılıyordu.
 */
export default async function ClientChannelsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireSession();

  const data = await serverApiFetch<ClientChannels>(`/clients/${id}/channels`).catch(
    () => null,
  );
  // Erişimi olmayan bir kimlik sunucuda 404 dönüyor.
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href="/ayarlar/musteriler"
          className="text-xs font-medium text-brand-strong hover:underline"
        >
          ← Müşteriler
        </Link>
        <h1 className="mt-1.5 text-2xl font-semibold">{data.clientName} — Bağlı Kanallar</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Bir kanalı eklediğin an izleme açılıyor ve son 90 günün verisi çekilmeye
          başlıyor. Ayrıca bir şey yapman gerekmiyor.
        </p>
      </div>

      <BagliKanallar data={data} />

      <p className="text-xs text-ink-muted">
        Hesaplar burada görünmüyorsa ajansın platform bağlantısı eksik olabilir —{' '}
        <Link
          href="/ayarlar/baglantilar"
          className="font-medium text-brand-strong hover:underline"
        >
          Platform Bağlantıları
        </Link>
        .
      </p>
    </div>
  );
}
