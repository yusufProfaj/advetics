import Link from 'next/link';
import type { ConnectionSummary } from '@advetics/shared';

/**
 * İZLENEN HESAPLAR — ÖZET KART, tam liste DEĞİL.
 *
 * Bu ekran bir süre bütün hesapları satır satır basıyordu ve 284 hesapta
 * metrelerce uzuyordu. Ama tam listeyi buradan kaldırmak bir bilgiyi de
 * götürüyordu: "kaç hesap gerçekten veri çekiyor". O soru burada tek satırda
 * cevaplanıyor; hesabın kendisi müşterisinin "Bağlı kanallar" ekranında.
 *
 * ATANMIŞ AMA İZLEMESİ KAPALI HESAP AYRICA SAYILIYOR. İkisini tek sayıda
 * toplamak, "atadım ama veri gelmiyor" hâlini görünmez yapardı — bu üründe
 * en sık çıkan sessiz arıza.
 */
export function IzlenenHesaplar({
  connections,
  clients,
}: {
  connections: ConnectionSummary[];
  clients: Array<{ id: string; name: string }>;
}) {
  const hesaplar = connections.flatMap((c) => c.adAccounts);
  const profiller = connections.flatMap((c) => c.socialProfiles);

  const atanmisHesap = hesaplar.filter((a) => a.clientId !== null);
  const izlenenHesap = atanmisHesap.filter((a) => a.syncEnabled);
  const atanmisProfil = profiller.filter((p) => p.clientId !== null);
  const izlenenProfil = atanmisProfil.filter((p) => p.syncEnabled);

  const kapaliHesap = atanmisHesap.length - izlenenHesap.length;
  const kapaliProfil = atanmisProfil.length - izlenenProfil.length;

  /** Müşteri başına kaç hesap — hangi workspace'in kurulu olduğunu gösteriyor. */
  const musteriBasina = clients
    .map((c) => ({
      ...c,
      hesap: atanmisHesap.filter((a) => a.clientId === c.id).length,
      profil: atanmisProfil.filter((p) => p.clientId === c.id).length,
    }))
    .filter((c) => c.hesap + c.profil > 0);

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink">İzlenen hesaplar</h3>

      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>
          <strong className="text-ink">{izlenenHesap.length}</strong>
          <span className="text-ink-muted"> reklam hesabı</span>
        </span>
        <span>
          <strong className="text-ink">{izlenenProfil.length}</strong>
          <span className="text-ink-muted"> sayfa / kanal</span>
        </span>
      </div>

      {/* SESSİZ KALMASI EN KOLAY DURUM: atanmış ama izlemesi kapalı hesap
          panelde "bağlı" görünür ve hiç veri getirmez. */}
      {(kapaliHesap > 0 || kapaliProfil > 0) && (
        <p className="mt-2 rounded-lg bg-warn/10 px-3 py-2 text-[11px] text-warn">
          {kapaliHesap > 0 && <>{kapaliHesap} reklam hesabı</>}
          {kapaliHesap > 0 && kapaliProfil > 0 && ' ve '}
          {kapaliProfil > 0 && <>{kapaliProfil} sayfa</>} atanmış ama izlemesi
          KAPALI — bunlardan veri çekilmiyor. Müşterinin “Bağlı kanallar”
          ekranından kaldırıp yeniden ekle.
        </p>
      )}

      {musteriBasina.length === 0 ? (
        <p className="mt-2 text-[11px] text-ink-muted">
          Henüz hiçbir müşteriye hesap atanmamış. Yukarıdaki havuz
          kartlarından ata.
        </p>
      ) : (
        <ul className="mt-3 space-y-1">
          {musteriBasina.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
              <Link
                href={`/ayarlar/musteriler/${c.id}/kanallar`}
                className="truncate text-brand-strong hover:underline"
              >
                {c.name}
              </Link>
              <span className="shrink-0 text-[11px] text-ink-muted">
                {c.hesap} hesap · {c.profil} sayfa
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
