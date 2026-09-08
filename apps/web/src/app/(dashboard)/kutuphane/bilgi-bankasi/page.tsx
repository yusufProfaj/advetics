import type { Permission } from '@advetics/shared';
import { hasPermission, requireSession } from '@/lib/session';
import { BilgiBankasiIcerik } from '@/components/bilgi-bankasi/bilgi-bankasi-icerik';
import {
  SAYFA_GIRIS_IZNI,
  SEKMELER,
  SEKME_IZINLERI,
  gorunurSekmeler,
} from '@/components/bilgi-bankasi/sekmeler';

export const metadata = { title: 'Bilgi Bankası — Advetics' };
export const dynamic = 'force-dynamic';

/**
 * BİLGİ BANKASI — müşterinin GENEL profili.
 *
 * ESKİDEN BU SAYFA Akıllı Boost'un ön ayarlarıydı — o bileşen
 * (`BoostOnAyarlariFormu`) taşınmadı, hâlâ aynı dosyada; yalnızca bu
 * sayfadan çağrılması bırakıldı, tek tüketicisi artık `/auto-boost`
 * modalı. Bu sayfa artık kampanyadan/boost'tan bağımsız: müşterinin genel
 * bilgileri, bütçe hedefi, hedef kitle, marka bilgileri ve logo — reklam
 * üretiminde ve AI asistanında bağlam olarak kullanılacak.
 */
export default async function BilgiBankasiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  /*
   * ═══ SAYFA BİR OKUMA YETKİSİ İSTİYOR ═══
   *
   * Bir süre HİÇ istemiyordu ve o boşluk gerçek bir sızıntı üretti: ilk
   * sekme `clients.notes`i (ajans içi not) basıyordu ve menü satırında da
   * `perm` yoktu, yani müşterinin kendi hesabı ekip notlarını okuyabiliyordu.
   * O alan tamamen bırakıldı; kapı yine de konuyor — sekmelerin hiçbirine
   * yetkisi olmayan birine sayfayı açmanın anlamı yok.
   */
  if (!hasPermission(session, SAYFA_GIRIS_IZNI)) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
        <h1 className="text-sm font-semibold text-ink">Bu sayfaya yetkin yok</h1>
        <p className="mx-auto mt-2 max-w-lg text-xs text-ink-muted">
          Bilgi Bankası müşteri profilini gösteriyor ve müşteri okuma yetkisi
          istiyor. Yetki gerekiyorsa yöneticine sor.
        </p>
      </div>
    );
  }

  /*
   * SEKME BAŞINA YETKİ — sayfaya tek bir `canWrite` geçmek yetmiyor.
   *
   * Sekmeler farklı uçlara gidiyor (`/client-profile`, `/budgets`,
   * `/assets`) ve yetki matrisinde o üç uç ayrı: `customer_service` ve
   * `client_viewer` `bulk.read` TAŞIMIYOR, yani Logo sekmesi onlarda arka
   * uçtan gelen kırmızı bir hata kutusu olarak açılıyordu. Süzgeç
   * `sekmeler.ts` içinde ve istemci bileşeni AYNI listeyi kullanıyor.
   */
  const izinler: Permission[] = SEKME_IZINLERI.filter((p) => hasPermission(session, p));
  const gizliSekmeSayisi = SEKMELER.length - gorunurSekmeler(izinler).length;

  const clientId =
    first(params.musteri) ?? session.activeClientId ?? session.availableClients[0]?.id;

  if (!clientId) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
        <h1 className="text-sm font-semibold text-ink">Önce bir müşteri seç</h1>
        <p className="mx-auto mt-2 max-w-lg text-xs text-ink-muted">
          Bilgi Bankası müşteri başına tutuluyor: genel bilgiler, bütçe, hedef
          kitle ve marka bilgileri her müşteride farklı.
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <header className="min-w-0">
        <h1 className="text-base font-semibold text-ink">Bilgi Bankası</h1>
        <p className="mt-0.5 text-xs text-ink-muted">
          Müşterinin genel profili — reklam üretirken ve AI asistanında
          bağlam olarak kullanılıyor.
        </p>
        {/*
          GİZLENEN SEKME SAYISI YAZILI — "sessiz kesme yok".
          Yetkiye göre sekme gizlemek doğru, SESSİZCE gizlemek değil:
          ekipte iki kişinin ekranı farklı görünüyor ve eksik sekmeyi gören
          kişi bunu arıza sanıp aramaya çıkıyor. Hepsi görünüyorsa cümle
          BASILMIYOR — her ekranda duran bir uyarı okunmaz hâle gelir.
        */}
        {gizliSekmeSayisi > 0 && (
          <p className="mt-1 text-xs text-ink-muted">
            {gizliSekmeSayisi} bölüm yetkin olmadığı için gizlendi ({SEKMELER.length}{' '}
            bölümden {SEKMELER.length - gizliSekmeSayisi} tanesi görünüyor).
          </p>
        )}
      </header>

      <BilgiBankasiIcerik clientId={clientId} izinler={izinler} />
    </div>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
