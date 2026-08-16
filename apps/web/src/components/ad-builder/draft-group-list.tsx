import type { DraftGroupRecord } from '@advetics/shared';
import { formatRelative } from '@/lib/format';

/**
 * Önceki taslaklar — GRUPLANMIŞ.
 *
 * Kullanıcı iki kampanya değil BİR kampanya kurduğunu düşünüyor; aynı niyetin
 * iki platformdaki hâlini iki satır olarak göstermek, ikinci bir şey açtığını
 * sanmasına yol açardı.
 *
 * AMA DURUMLAR AYRI DURUYOR. Kısmi başarının bütün mesele olduğu yer burası:
 * "Meta yayında · Google başarısız" tek bir rozete indirgenemez. İndirgemek,
 * ya yayına girmiş ve para harcayan bir kampanyayı gizlemek ya da hiç
 * oluşmamış bir kampanyayı var göstermek olurdu.
 */
export function DraftGroupList({ groups }: { groups: DraftGroupRecord[] }) {
  return (
    <section className="rounded-xl border border-line bg-surface">
      <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
        Önceki reklamların
        <span className="ml-1.5 font-normal text-ink-muted">({groups.length})</span>
      </h2>
      <ul>
        {groups.map((g) => (
          <li
            key={g.groupId ?? g.campaigns[0]?.id}
            className="border-b border-line/60 px-4 py-2.5 last:border-0"
          >
            <p className="truncate text-sm font-medium text-ink">{g.name}</p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {g.campaigns.map((c) => (
                <span key={c.id} className="text-[11px] text-ink-muted">
                  <span className="font-medium text-ink">
                    {c.platform === 'google' ? 'Google' : 'Meta'}
                  </span>{' '}
                  <span className={durumRengi(c.status)}>{DURUM[c.status] ?? c.status}</span>
                  {' · '}
                  {formatRelative(c.createdAt)}
                  {/* HATA SATIRIN YANINDA. Ayrı bir yere koymak, hangi
                      platformun neden düştüğünü belirsiz bırakırdı. */}
                  {c.error && <span className="text-rose-700"> · {c.error}</span>}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const DURUM: Record<string, string> = {
  draft: 'hazır, yayınlanmadı',
  publishing: 'yayınlanıyor',
  published: 'yayında',
  failed: 'başarısız',
};

function durumRengi(status: string): string {
  if (status === 'published') return 'text-emerald-700';
  if (status === 'failed') return 'text-rose-700';
  return 'text-ink-muted';
}
