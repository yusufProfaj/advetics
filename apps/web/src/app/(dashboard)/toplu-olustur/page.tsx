import Link from 'next/link';
import type { CanliKampanyaListesi, CreativeRecord, DraftGroupRecord } from '@advetics/shared';
import { hasPermission, requireSession } from '@/lib/session';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { CanliKampanyalar } from '@/components/ad-builder/canli-kampanyalar';
import { DuplicatePanel } from '@/components/ad-builder/duplicate-panel';

export const metadata = { title: 'Toplu Oluştur · Advetics' };
export const dynamic = 'force-dynamic';

/**
 * Toplu oluşturma — ARTIK BİR TABLO DEĞİL.
 *
 * ESKİSİ ŞUNU İSTİYORDU: Excel'de sekiz sütun hazırla, panele yapıştır,
 * üstelik Meta ad set kimliğiyle Facebook sayfa kimliğini ELLE yaz — ikisi de
 * zaten veritabanımızda duruyorken. Sütun kayması en yaygın hataydı ve
 * yapıştırmadan önce görünmüyordu.
 *
 * YENİSİ: çalışan bir kampanyayı seç, ondan N varyasyon üret. Ajansın
 * gerçekte yaptığı iş bu — sıfırdan altmış farklı reklam değil, aynı yapının
 * farklı bütçe/kreatif/kelime denemeleri. Kaynak zaten doğrulanmış bir ağaç,
 * yani hesap-sayfa-platform uyumu bir kez kontrol edildi.
 */
export default async function BulkPage({
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
        <h1 className="text-sm font-semibold text-ink">Önce bir workspace seç</h1>
      </div>
    );
  }

  const canWrite = hasPermission(session, 'bulk.write');
  /*
   * KOPYALAMA CANLI KAMPANYAYA DOKUNUYOR: yetki `budget.write` ve uç
   * noktanın kendi izniyle aynı. `bulk.write` taslak yazma yetkisi;
   * ikisini karıştırmak, sunucunun reddedeceği bir düğme göstermek olurdu.
   */
  const canManageCampaigns = hasPermission(session, 'budget.write');
  const client = session.availableClients.find((c) => c.id === clientId);

  /*
   * HATA YUTULMUYOR. Kampanya listesi boş kalınca bu ekran "kaynak kampanya
   * yok" diyor ve kullanıcıyı sıfırdan kampanya kurmaya gönderiyordu — oysa
   * kaynak duruyor, yalnızca istek düşmüştü.
   */
  const [kampanyaSonuc, kreatifSonuc, canliSonuc] = await Promise.allSettled([
    serverApiFetch<DraftGroupRecord[]>(`/draft-campaigns?clientId=${clientId}`),
    serverApiFetch<CreativeRecord[]>(`/creatives?clientId=${clientId}`),
    /*
     * YAYINDAKİ KAMPANYALAR — kullanıcının bildirdiği eksik.
     *
     * "toplu oluşturda sadece boostlar var ama aktif olan reklam
     * kampanyalarını seçemiyorum." Taslak çoğaltma yalnızca Advetics'in
     * kurduklarını görüyor; yayındakiler ayrı bir yolla (platformun kendi
     * kopyalama ucu) çoğaltılıyor.
     */
    serverApiFetch<CanliKampanyaListesi>(`/campaigns?clientId=${clientId}`),
  ]);

  if (kampanyaSonuc.status === 'rejected') {
    return (
      <div
        role="alert"
        className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger-strong"
      >
        <strong>Kampanya listesi okunamadı.</strong>{' '}
        {kampanyaSonuc.reason instanceof ApiRequestError
          ? kampanyaSonuc.reason.message
          : 'Sunucuya ulaşılamadı.'}
      </div>
    );
  }

  const groups = kampanyaSonuc.value;
  const creatives = kreatifSonuc.status === 'fulfilled' ? kreatifSonuc.value : [];
  const canli = canliSonuc.status === 'fulfilled' ? canliSonuc.value : null;

  /**
   * KAYNAK OLARAK YAYINLANMIŞLAR DA GEÇERLİ.
   *
   * "Geçen ayki kampanyayı bu ay tekrar ver" ajansın en sık işi ve o kampanya
   * yayınlanmış olanı. Yalnızca taslakları listelemek, aracın en değerli
   * kullanımını kapatırdı.
   */
  const campaigns = groups.flatMap((g) => g.campaigns);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Toplu Oluştur</h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            <strong className="text-ink">{client?.name ?? 'Workspace'}</strong> · bir kampanyadan
            varyasyonlar üret. Yazmadığın her alan kaynaktan gelir.
          </p>
        </div>
        <Link
          href={`/reklam-olustur/uzman?musteri=${clientId}`}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken"
        >
          Sıfırdan kampanya kur
        </Link>
      </header>

      {/*
        ═══ İKİ AYRI ÇOĞALTMA YOLU, ÇÜNKÜ İKİ AYRI KAYNAK ═══

        Advetics'te kurulan taslak BİZİM modelimizde duruyor: varyasyonları
        biz üretiyoruz, metni ve bütçeyi tek tek değiştirebiliyoruz.

        Yayındaki kampanya PLATFORMUN modelinde duruyor ve hedeflemesi
        Meta'nın ham biçiminde. Onu bizim şemamıza çevirip çoğaltmak,
        kaynağıyla aynı sanılan ama farklı hedefleyen bir kampanya üretmek
        olurdu; o yüzden kopyayı platformun kendi ucu çıkarıyor.
      */}
      {canli !== null && canli.rows.length > 0 && (
        <CanliKampanyalar
          rows={canli.rows}
          toplam={canli.toplam}
          canManage={canManageCampaigns}
          baslik="Yayındaki kampanyadan çoğalt"
          aciklama="Kopyayı platform çıkarıyor: hedefleme, reklam setleri ve reklamlar aynı kalıyor. Kopya duraklatılmış açılıyor."
        />
      )}

      {canWrite ? (
        <DuplicatePanel campaigns={campaigns} creatives={creatives} />
      ) : (
        <div className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn-strong ring-1 ring-inset ring-warn/30">
          Toplu oluşturmak için yetkin yok.
        </div>
      )}
    </div>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
