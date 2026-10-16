import type {
  AssetListResult,
  CreativeRecord,
  KreatifPerformansListesi,
} from '@advetics/shared';
import { requireSession } from '@/lib/session';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { kapi } from '@/lib/panel-adresleri';
import { Kart } from '@/components/ui/kart';
import { HataDurumu, Serit } from '@/components/ui/hal';
import { CreativeLibrary } from './creative-library';
import { IsleyenKreatifler } from './isleyen-kreatifler';
import { sozluk } from '@/dil/sunucu';
import { varliklarSozlugu } from '@/dil/sozlukler/varliklar';


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
  const dd = await sozluk(varliklarSozlugu);
  const d = dd.kreatifler;

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
    r.status === 'rejected' ? (r.reason instanceof ApiRequestError ? r.reason.message : dd.sunucuyaUlasilamadi) : null;
  const library = arsivSonuc.status === 'fulfilled' ? arsivSonuc.value : null;
  const performans = performansSonuc.status === 'fulfilled' ? performansSonuc.value : null;

  return (
    <div className="grid gap-5">
      {hata(performansSonuc) && (
        <Serit baslik={d.gecmisAlinamadi}>
          {hata(performansSonuc)}
        </Serit>
      )}

      {/*
        ÖNCE GEÇMİŞ, SONRA KÜTÜPHANE. Kullanıcı bu ekrana "yeni bir şey
        yazacağım" diye geliyor ve neyin işe yaradığını görmeden yazmak,
        elindeki en iyi bilgiyi kullanmamak demek.
      */}
      {performans !== null && performans.rows.length > 0 && (
        <Kart
          baslik={d.gecmisBaslik}
          baslikEki={d.gecmisEki(performans.gun)}
        >
          {/* SESSİZ KESME YOK: yeterli gösterim almadığı için sıralanmayan
              kreatifler sayılıyor. */}
          <p className="m-0 mb-3 text-12 text-ink-muted">
            {d.gosteriliyor(performans.rows.length)}
            {performans.yetersiz > 0 && d.yetersiz(performans.yetersiz)}
          </p>
          <IsleyenKreatifler liste={performans.rows} />
        </Kart>
      )}

      {kreatifSonuc.status === 'rejected' ? (
        <HataDurumu baslik={d.listeAlinamadi} mesaj={hata(kreatifSonuc)} />
      ) : canWrite ? (
        <>
          {hata(arsivSonuc) && (
            <Serit baslik={d.arsivAlinamadi}>
              {hata(arsivSonuc)}
            </Serit>
          )}
          <CreativeLibrary
            clientId={clientId}
            creatives={kreatifSonuc.value}
            libraryAssets={library?.rows ?? []}
          />
        </>
      ) : (
        <Serit baslik={d.yetkiYok}>{d.yoneticineSor}</Serit>
      )}
    </div>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
