import type { ClientChannels, WorkspaceHazirlik } from '@advetics/shared';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { hasPermission, requireSession } from '@/lib/session';
import { sayfaWorkspaceId, workspaceSecimVerisi } from '@/lib/sayfa-workspace';
import { WorkspaceGerekli } from '@/components/workspace-gerekli';
import { SayfaBasligi } from '@/components/ui/sayfa-basligi';
import { Uyari } from '@/components/ui/uyari';
import { HazirlikListesi } from '@/components/marka-merkezi/hazirlik-listesi';
import { BagliKanallar } from '@/components/tenancy/bagli-kanallar';

export const metadata = { title: 'Marka Merkezi · Advetics' };
export const dynamic = 'force-dynamic';

/**
 * ═══ MARKA MERKEZİ — WORKSPACE'İN "BEYNİ" ═══
 *
 * Kaynak kurgu: BASE modülü taslağı (`docs/BASE-PLANI.md`). Bir workspace
 * sisteme girdiğinde önce burası dolduruluyor; reklam oluşturma, AI asistan
 * ve raporlar kararlarını buradan okuyor.
 *
 * BU BÖLÜMDE İKİ PARÇA VAR: hazırlık listesi ve bağlantılar. Marka,
 * varlıklar, kitleler ve koruma kuralları sonraki bölümlerde bu sayfaya
 * giriyor. Henüz ekranı olmayan bir sekmeyi göstermek, kenar çubuğundan bir
 * kez temizlenmiş "ekranı olmayan satır" hatasını geri getirirdi.
 *
 * İKİ ÇAĞRI AYRI HATA TAŞIYOR. Biri düşerse öteki çizilmeye devam ediyor ve
 * düşenin YERİNDE sunucunun kendi cümlesi yazıyor. Tek bir "yüklenemedi"
 * kutusu, hangisinin düştüğünü gizlerdi.
 */
export default async function MarkaMerkeziPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  // SESSİZCE İLK WORKSPACE'E DÜŞÜLMÜYOR — gerekçe `lib/sayfa-workspace.ts`.
  const clientId = sayfaWorkspaceId(session, first(params.musteri));
  if (!clientId) {
    return (
      <WorkspaceGerekli
        ekran="Marka Merkezi"
        neden="Marka Merkezi bir workspace’in hesaplarını, bilgilerini ve kurulum durumunu gösteriyor."
        {...workspaceSecimVerisi(session)}
      />
    );
  }

  const [hazirlik, kanallar] = await Promise.all([
    serverApiFetch<WorkspaceHazirlik>(`/clients/${clientId}/hazirlik`).then(
      (v) => ({ ok: true as const, v }),
      (e: unknown) => ({ ok: false as const, hata: hataMetni(e) }),
    ),
    serverApiFetch<ClientChannels>(`/clients/${clientId}/channels`).then(
      (v) => ({ ok: true as const, v }),
      (e: unknown) => ({ ok: false as const, hata: hataMetni(e) }),
    ),
  ]);

  const ad = hazirlik.ok ? hazirlik.v.clientName : kanallar.ok ? kanallar.v.clientName : null;
  // Atama `connection.write` istiyor; sunucu da reddediyor ama düğmeyi
  // çalışmayacağı bilinen birine göstermek "tıkladım, 403" demek.
  const atayabilir = hasPermission(session, 'connection.write');

  return (
    <div className="space-y-6">
      <SayfaBasligi
        baslik="Marka Merkezi"
        aciklama={
          <>
            {ad && <strong className="font-medium text-ink">{ad}</strong>}
            {ad && ' · '}
            Reklamların, raporların ve AI asistanın okuduğu her şey tek yerde.
          </>
        }
      />

      {hazirlik.ok ? (
        <HazirlikListesi veri={hazirlik.v} />
      ) : (
        <Uyari ton="tehlike" baslik="Kurulum durumu alınamadı.">
          {hazirlik.hata}
        </Uyari>
      )}

      <section id="baglantilar" aria-labelledby="baglantilar-baslik" className="scroll-mt-24">
        <div className="mb-3">
          <h2 id="baglantilar-baslik" className="text-base font-semibold text-ink">
            Bağlantılar
          </h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            Bu workspace’in reklam hesapları, sayfaları ve kanalları. Eklediğin an izleme açılır ve
            son 90 günün verisi çekilmeye başlar.
          </p>
        </div>
        {!kanallar.ok ? (
          <Uyari ton="tehlike" baslik="Bağlantılar alınamadı.">
            {kanallar.hata}
          </Uyari>
        ) : atayabilir ? (
          <BagliKanallar data={kanallar.v} ajansUyesi={session.managerAccount !== null} />
        ) : (
          /*
           * YETKİSİZ KİŞİYE SALT OKUNUR LİSTE. Ekle ve Kaldır düğmeleri
           * sunucuda reddedilecek; onları göstermek yerine ne bağlı olduğunu
           * söylemek yetiyor.
           */
          <SaltOkunurKanallar data={kanallar.v} />
        )}
      </section>
    </div>
  );
}

function SaltOkunurKanallar({ data }: { data: ClientChannels }) {
  const bagli = data.groups.flatMap((g) => g.connected.map((i) => ({ ...i, kind: g.kind })));
  if (bagli.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line bg-surface p-6 text-sm text-ink-muted">
        Bu workspace’e bağlı hesap ya da kanal yok. Eklemek için ajansının yöneticisine yaz.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
      {bagli.map((i) => (
        <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
          <span className="min-w-0 truncate text-ink">{i.name}</span>
          <span className="shrink-0 text-xs text-ink-muted" translate="no">
            {i.externalId}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Platformun ya da sunucunun kendi cümlesi ekranda görünmeli (CLAUDE.md). */
function hataMetni(e: unknown): string {
  return e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.';
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
