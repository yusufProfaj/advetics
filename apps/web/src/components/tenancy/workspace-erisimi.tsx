import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { ayarlarYolu } from '@/lib/panel-adresleri';
import { TeamManager, type MemberRow } from '@/components/tenancy/team-manager';
import { DanismanAta } from '@/components/tenancy/danisman-ata';

/**
 * ═══ BİR WORKSPACE'İN ERİŞİM LİSTESİ — EKİBİN İÇİNDE, AYRI SAYFADA DEĞİL ═══
 *
 * Eskiden `/ayarlar/musteriler/<id>/ekip` ayrı bir sayfaydı ve aynı kişiler
 * ayrıca Marka Merkezi › Workspace ayarları'nda TAM düzenleyiciyle
 * duruyordu: üç ayrı yerden yetki verilebiliyordu (MIMARI Ç-14). Ekip TEK
 * yerde: Ayarlar › Ekip ve güvenlik, `?workspace=` süzgeciyle. Marka
 * Merkezi'ndeki erişim listesi salt okunur ve buraya bağlanıyor.
 *
 * Müşterinin kendi giriş hesapları (client_viewer) ajans ekibi listesinde
 * BİLEREK görünmüyor; burada görünüyor. Uç ikisini `?clientId=` ile ayırıyor.
 */
export async function WorkspaceErisimi({
  workspaceler,
  secili,
  currentUserId,
  yonetebilir,
  neden,
}: {
  /** Kullanıcının görebildiği workspace'ler (`/clients`). */
  workspaceler: Array<{ id: string; name: string }>;
  /** Adresteki `?workspace=`; yoksa `null`. */
  secili: string | null;
  currentUserId: string;
  /** `PANEL_KAPILARI['ekip.yonet']`. */
  yonetebilir: boolean;
  /** Kapı kapalıyken yazan cümle. */
  neden: string;
}) {
  const workspace = secili ? (workspaceler.find((w) => w.id === secili) ?? null) : null;

  /*
   * HATA YUTULMUYOR. Eski sayfa `.catch(() => [])` ile "bu workspace'e
   * atanmış kimse yok" diyordu — liste OKUNAMADIĞINDA da. Kullanıcı var olan
   * erişimi yok sanıp ikinci kez atıyordu.
   */
  let uyeler: MemberRow[] = [];
  let hata: string | null = null;
  if (workspace) {
    try {
      uyeler = (await serverApiFetch<MemberRow[]>(`/members?clientId=${encodeURIComponent(workspace.id)}`)) ?? [];
    } catch (e) {
      hata = e instanceof ApiRequestError ? e.message : 'Bağlantı kurulamadı';
    }
  }

  return (
    <section id="workspace-erisimi" className="scroll-mt-4 rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Workspace erişimi</h2>
          <p className="text-xs text-ink-muted">Bir workspace’i kimin gördüğü; workspace’in kendi giriş hesapları dahil.</p>
        </div>
        {/*
          SÜZGEÇ BİR FORM, İSTEMCİ DURUMU DEĞİL: seçim adreste duruyor
          (`?workspace=`), yani paylaşılabilir ve Marka Merkezi'nden gelen
          bağlantı doğrudan bu hâli açıyor. Sorgu tek parametre; `ayarlarYolu`
          sekmenin yolunu sözleşmeden veriyor.
        */}
        <form method="get" action={ayarlarYolu('ekip')} className="flex flex-wrap items-center gap-2">
          <label htmlFor="ekip-workspace" className="sr-only">
            Workspace seç
          </label>
          <select
            id="ekip-workspace"
            name="workspace"
            defaultValue={workspace?.id ?? ''}
            className="min-w-[14rem] rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
          >
            <option value="">Workspace seç…</option>
            {workspaceler.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-8 rounded-lg border border-line bg-surface px-3 text-xs font-semibold text-ink hover:bg-surface-muted"
          >
            Göster
          </button>
        </form>
      </div>

      <div className="px-4 py-3">
        {secili && !workspace ? (
          /* Erişimi olmayan ya da arşivlenmiş bir kimlik: listede yok. Sebep yazılıyor. */
          <p className="text-sm text-ink-muted">Bu workspace bulunamadı ya da görme yetkin yok.</p>
        ) : !workspace ? (
          <p className="text-sm text-ink-muted">Erişimini görmek istediğin workspace’i seç.</p>
        ) : hata !== null ? (
          <p role="alert" className="text-sm text-danger-strong">
            Erişim listesi okunamadı: {hata}
          </p>
        ) : (
          <div className="space-y-3">
            {/* SESSİZ KESME YOK: kaç kişi listelendiği yazılı. */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span>
                <strong>{uyeler.length}</strong> kişinin <strong>{workspace.name}</strong> workspace’ine erişimi var
              </span>
              {yonetebilir ? (
                <DanismanAta clientId={workspace.id} clientName={workspace.name} mevcutUyeIdleri={uyeler.map((m) => m.id)} />
              ) : (
                <span className="text-xs text-ink-muted">{neden}</span>
              )}
            </div>
            {/*
              TEK WORKSPACE VERİLİYOR: bu listeden başka bir workspace'e yetki
              verilememeli; "Ege'nin ekibi"nden Fenbay'a erişim açılırdı.
            */}
            <TeamManager members={uyeler} clients={[workspace]} currentUserId={currentUserId} />
          </div>
        )}
      </div>
    </section>
  );
}
