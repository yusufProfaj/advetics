import Link from 'next/link';
import type { ConnectionSummary } from '@advetics/shared';
import { markaMerkeziAdresi } from '@/lib/panel-adresleri';
import { Kart } from '@/components/ui/kart';
import { BosDurum, Serit } from '@/components/ui/hal';
import { AdHucresi, Tablo } from '@/components/ui/tablo';

/**
 * İZLENEN HESAPLAR — ÖZET KART, tam liste DEĞİL.
 *
 * Bu ekran bir süre bütün hesapları satır satır basıyordu ve 284 hesapta
 * metrelerce uzuyordu. Ama tam listeyi buradan kaldırmak bir bilgiyi de
 * götürüyordu: "kaç hesap gerçekten veri çekiyor". O soru burada tek satırda
 * cevaplanıyor; hesabın kendisi workspace'in Marka Merkezi › Kurulum ›
 * hesaplar ve kanallar bloğunda (eski "Bağlı kanallar" ekranı, 2026-10-13).
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

  /** Müşteri başına kaç hesap — hangi workspace’in kurulu olduğunu gösteriyor. */
  const musteriBasina = clients
    .map((c) => ({
      ...c,
      hesap: atanmisHesap.filter((a) => a.clientId === c.id).length,
      profil: atanmisProfil.filter((p) => p.clientId === c.id).length,
    }))
    .filter((c) => c.hesap + c.profil > 0);

  return (
    <Kart
      dolgu={false}
      baslik="İzlenen hesaplar"
      baslikEki={`${izlenenHesap.length} reklam hesabı · ${izlenenProfil.length} sayfa / kanal`}
    >
      {/* SESSİZ KALMASI EN KOLAY DURUM: atanmış ama izlemesi kapalı hesap
          panelde "bağlı" görünür ve hiç veri getirmez. */}
      {(kapaliHesap > 0 || kapaliProfil > 0) && (
        <div className="border-b border-line p-4">
          <Serit
            baslik={
              <>
                {kapaliHesap > 0 && <>{kapaliHesap} reklam hesabı</>}
                {kapaliHesap > 0 && kapaliProfil > 0 && ' ve '}
                {kapaliProfil > 0 && <>{kapaliProfil} sayfa</>} atanmış ama izlemesi KAPALI
              </>
            }
          >
            Bunlardan veri çekilmiyor. Workspace’i aşağıdan aç ve Kurulum’daki hesaplar bölümünden izlemeyi aç.
          </Serit>
        </div>
      )}

      <Tablo
        etiket="İzlenen hesaplar"
        satirlar={musteriBasina}
        satirAnahtari={(c) => c.id}
        sutunlar={[
          {
            anahtar: 'ws',
            baslik: 'Workspace',
            hucre: (c) => (
              <AdHucresi ad={<Link href={markaMerkeziAdresi('kurulum', c.id, 'kanallar')}>{c.name}</Link>} />
            ),
          },
          { anahtar: 'hesap', baslik: 'Reklam hesabı', sayi: true, hucre: (c) => c.hesap },
          { anahtar: 'profil', baslik: 'Sayfa / kanal', sayi: true, hucre: (c) => c.profil },
        ]}
        bos={
          <BosDurum
            baslik="Henüz atanmış hesap yok"
            neden="Hiçbir workspace’e hesap atanmamış. Yukarıdaki Atanmamış hesaplar tablosundan ata."
          />
        }
        sayfalama={{ bas: musteriBasina.length === 0 ? 0 : 1, son: musteriBasina.length, toplam: musteriBasina.length }}
      />
    </Kart>
  );
}
