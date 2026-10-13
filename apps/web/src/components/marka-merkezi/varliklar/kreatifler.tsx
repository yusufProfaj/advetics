import type {
  AssetListResult,
  CreativeRecord,
  KreatifPerformansListesi,
} from '@advetics/shared';
import { requireSession } from '@/lib/session';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { kapi } from '@/lib/panel-adresleri';
import { Uyari } from '@/components/ui/uyari';
import { CreativeLibrary } from './creative-library';
import { IsleyenKreatifler } from './isleyen-kreatifler';


/**
 * Kreatif kütüphanesi.
 *
 * NEDEN KÜTÜPHANEDE, "Oluştur" altında değil: kreatif bir kampanyaya ait
 * değil, MÜŞTERİYE ait. Aynı metin ve görsel on kampanyada kullanılabiliyor
 * ve "geçen ayki reklamı tekrarla" ancak böyle mümkün. Formlar ve Görsel
 * Arşivi de aynı sebeple burada.
 */
/**
 * BASE › VARLIKLAR › KREATİFLER (2026-10-13). Eski `/kutuphane/kreatifler`
 * ve Marka Merkezi'nin Varlıklar bölümü buraya yönleniyor. Başlık ve
 * workspace kapısı Varlıklar sayfasında.
 */
export async function KreatiflerIcerik({
  clientId,
  params,
}: {
  clientId: string;
  params: Record<string, string | string[] | undefined>;
}) {
  const session = await requireSession();

  // SESSİZCE İLK WORKSPACE'E DÜŞÜLMÜYOR — gerekçe `lib/sayfa-workspace.ts`.

  const canWrite = kapi(session, 'varlik.yaz');

  /*
   * HATA YUTULMUYOR. Üçü de `.catch(() => …)` ile alınıyordu ve liste
   * okunamadığında ekran "kreatif yok" diyordu — kullanıcı kütüphanesinin
   * boşaldığını sanır. `allSettled`a geçilince de reddedilen sonuç `[]`a
   * çevriliyordu: aynı hata, başka sözdizimi. Her düşen çağrı aşağıda kendi
   * cümlesiyle yazıyor ve o bölüm "boş" diye çizilmiyor.
   */
  const [kreatifSonuc, arsivSonuc, performansSonuc] = await Promise.allSettled([
    serverApiFetch<CreativeRecord[]>(`/creatives?clientId=${clientId}`),
    serverApiFetch<AssetListResult>(`/assets?clientId=${clientId}&kind=image&limit=60&offset=0`),
    /*
     * GEÇMİŞTE İŞE YARAYANLAR — platformdan senkronize edilmiş, YAYINA
     * GİRMİŞ kreatiflerin performansı. Kütüphanedeki (hiç yayınlanmamış
     * olabilen) kayıtlardan ayrı bir soruya cevap veriyor.
     */
    serverApiFetch<KreatifPerformansListesi>(`/creatives/performans?clientId=${clientId}&gun=90`),
  ]);

  const hata = (r: PromiseSettledResult<unknown>) =>
    r.status === 'rejected' ? (r.reason instanceof ApiRequestError ? r.reason.message : 'Sunucuya ulaşılamadı.') : null;
  const library = arsivSonuc.status === 'fulfilled' ? arsivSonuc.value : null;
  const performans = performansSonuc.status === 'fulfilled' ? performansSonuc.value : null;

  return (
    <div className="space-y-5">
      {hata(performansSonuc) && (
        <Uyari ton="uyari" baslik="Geçmiş performans alınamadı.">
          {hata(performansSonuc)}
        </Uyari>
      )}

      {/*
        ÖNCE GEÇMİŞ, SONRA KÜTÜPHANE. Kullanıcı bu ekrana "yeni bir şey
        yazacağım" diye geliyor ve neyin işe yaradığını görmeden yazmak,
        elindeki en iyi bilgiyi kullanmamak demek.
      */}
      {performans !== null && performans.rows.length > 0 && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-ink">Geçmişte işe yarayanlar</h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                Son {performans.gun} günde yayınlanmış reklamların gerçek performansı.
                Tıklama oranına göre sıralı.
              </p>
            </div>
            {/* SESSİZ KESME YOK: yeterli gösterim almadığı için sıralanmayan
                kreatifler sayılıyor. */}
            {performans.yetersiz > 0 && (
              <span className="text-[11px] text-ink-muted">
                {performans.yetersiz} kreatif yeterli gösterim almamış, listede yok
              </span>
            )}
          </div>
          <IsleyenKreatifler liste={performans.rows} />
        </section>
      )}

      {kreatifSonuc.status === 'rejected' ? (
        <Uyari ton="tehlike" baslik="Kreatif listesi alınamadı.">
          {hata(kreatifSonuc)}
        </Uyari>
      ) : canWrite ? (
        <>
          {hata(arsivSonuc) && (
            <Uyari ton="uyari" baslik="Görsel arşivi alınamadı; kreatife arşivden görsel seçilemez.">
              {hata(arsivSonuc)}
            </Uyari>
          )}
          <CreativeLibrary
            clientId={clientId}
            creatives={kreatifSonuc.value}
            libraryAssets={library?.rows ?? []}
          />
        </>
      ) : (
        <div className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn-strong ring-1 ring-inset ring-warn/30">
          Kreatif düzenlemek için yetkin yok.
        </div>
      )}
    </div>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
