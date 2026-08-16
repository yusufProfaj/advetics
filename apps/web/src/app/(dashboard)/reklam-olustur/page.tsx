import Link from 'next/link';
import {
  AD_DRAFT_STATUS_LABELS,
  GOAL_META,
  type AdDraftRecord,
  type DraftGroupRecord,
} from '@advetics/shared';
import { hasPermission, requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { DraftGroupList } from '@/components/ad-builder/draft-group-list';

export const metadata = { title: 'Reklamlar — Advetics' };
export const dynamic = 'force-dynamic';

/**
 * Reklamlar — GİRİŞ KAPISI.
 *
 * Bu sayfa eskiden sihirbazın kendisiydi. Artık dört başlangıç noktası ve
 * kampanya listesi: kullanıcı "reklam vereceğim" diye geliyor, biz de ona
 * "elle mi, kuraldan mı, tablodan mı" diye sormak yerine ne yapmak istediğini
 * soruyoruz (tasarım belgesi §2.2).
 *
 * ESKİ SİHİRBAZ EMEKLİ. `ad_drafts` tablosu ve verisi YERİNDE — silinmedi,
 * taşınmadı. Sebebi: üretimdeki satır sayısı bilinmiyor ve bilinmeden veri
 * taşımak ya da düşürmek sorumsuzluk olurdu. Eski taslaklar aşağıda salt
 * okunur bir bölümde duruyor; yeni bir tane oluşturmanın yolu yok.
 */
export default async function AdsHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const clientId =
    first(params.musteri) ?? session.activeClientId ?? session.availableClients[0]?.id;

  if (!clientId) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
        <h1 className="text-sm font-semibold text-ink">Önce bir müşteri seç</h1>
      </div>
    );
  }

  const canWrite = hasPermission(session, 'bulk.write');
  const client = session.availableClients.find((c) => c.id === clientId);

  const [groups, legacy] = await Promise.all([
    serverApiFetch<DraftGroupRecord[]>(`/draft-campaigns?clientId=${clientId}`).catch(() => []),
    serverApiFetch<AdDraftRecord[]>(`/ad-drafts?clientId=${clientId}`).catch(() => []),
  ]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Reklamlar</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          <strong className="text-ink">{client?.name ?? 'Müşteri'}</strong> · ne yapmak
          istediğini seç.
        </p>
      </header>

      {canWrite && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Giris
            href={`/reklam-olustur/basit?musteri=${clientId}`}
            baslik="Hızlı Reklam"
            aciklama="Ne istediğini söyle, gerisini biz hallederiz. Hedef, kitle ve yerleşim sorulmuyor."
            vurgu
          />
          <Giris
            href={`/reklam-olustur/uzman?musteri=${clientId}`}
            baslik="Kampanya Kur"
            aciklama="Amaç, optimizasyon, kitle ve yerleşim üzerinde tam kontrol. Meta ve Google."
          />
          <Giris
            href={`/toplu-olustur?musteri=${clientId}`}
            baslik="Toplu Oluştur"
            aciklama="Çalışan bir kampanyadan varyasyonlar üret. Yazmadığın alan kaynaktan gelir."
          />
          <Giris
            href={`/auto-boost?musteri=${clientId}`}
            baslik="Gönderiyi Öne Çıkar"
            aciklama="Kural kur, iyi giden gönderiler onayına düşsün."
          />
        </div>
      )}

      {groups.length > 0 ? (
        <DraftGroupList groups={groups} />
      ) : (
        <p className="rounded-xl border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-ink-muted">
          Bu müşteride henüz kampanya yok.
        </p>
      )}

      {legacy.length > 0 && <EskiTaslaklar drafts={legacy} />}
    </div>
  );
}

function Giris({
  href,
  baslik,
  aciklama,
  vurgu,
}: {
  href: string;
  baslik: string;
  aciklama: string;
  vurgu?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-xl border p-4 transition ${
        vurgu ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:bg-surface-sunken'
      }`}
    >
      <span className="block text-sm font-semibold text-ink">{baslik}</span>
      <span className="mt-1 block text-xs text-ink-muted">{aciklama}</span>
    </Link>
  );
}

/**
 * Eski oluşturucuyla yapılmış reklamlar — SALT OKUNUR.
 *
 * VERİ SİLİNMEDİ VE TAŞINMADI. Taşımak cazip görünüyor ama temiz değil: eski
 * taslakların görselleri taslağa özel dosyalar (`ad_draft_assets`) ve bir
 * kısmının arşivde karşılığı yok — yani kreatif kütüphanesine dönüştürülemez.
 * Üstelik üretimdeki satır sayısı bilinmiyor.
 *
 * Bu yüzden geçmiş burada duruyor: yeni bir tane oluşturulamıyor, var olanlar
 * kayıp değil. Bölüm boşsa hiç görünmüyor — yani yeni kurulumlarda bu ekran
 * eski akıştan hiç söz etmiyor.
 */
function EskiTaslaklar({ drafts }: { drafts: AdDraftRecord[] }) {
  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">
          Eski oluşturucuyla yapılmış reklamlar
          <span className="ml-1.5 font-normal text-ink-muted">({drafts.length})</span>
        </h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          Salt okunur. Eski akış emekliye ayrıldı; bu kayıtlar silinmedi ve platformdaki
          reklamları etkilenmedi. Yeni reklamlar yukarıdaki adımlardan oluşturuluyor.
        </p>
      </div>
      <ul>
        {drafts.map((d) => (
          <li key={d.id} className="border-b border-line/60 px-4 py-2.5 last:border-0">
            <p className="truncate text-sm font-medium text-ink">{d.name}</p>
            <p className="text-[11px] text-ink-muted">
              {GOAL_META[d.goal].label} · {AD_DRAFT_STATUS_LABELS[d.status]} ·{' '}
              {formatRelative(d.createdAt)}
              {d.error && <span className="text-rose-700"> · {d.error}</span>}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
