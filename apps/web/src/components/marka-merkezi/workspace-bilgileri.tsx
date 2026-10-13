import Link from 'next/link';
import { ROL_ETIKETI, type SyncStatusResponse } from '@advetics/shared';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import type { SessionResponse } from '@/lib/session';
import { PANEL_KAPILARI, ayarlarAdresi, hesaplarAdresi, kapi } from '@/lib/panel-adresleri';
import { Uyari } from '@/components/ui/uyari';
import { Kart as OrtakKart } from '@/components/ui/kart';
import type { MemberRow } from '@/components/tenancy/team-manager';
import type { MusteriBilgileri } from '@/components/tenancy/musteri-bilgi-formu';
import { SenkronDurumu } from '@/components/sync/senkron-durumu';
import { FirmaBilgileri } from './firma-bilgileri';
import { BildirimlerBolumu } from './bildirimler-bolumu';

/**
 * `GET /clients/:id` satırının bu ekranın okuduğu kısmı. `serverApiFetch<T>`
 * DENETİMSİZ bir dönüşüm: uç satırın bütün kolonlarını döndürüyor; uç bir
 * gün `select`e geçerse bu tip yalan söyler ve ekranda "—" görünür.
 */
export interface WorkspaceDetay extends MusteriBilgileri {
  id: string;
  name: string;
  orgId: string;
  timezone: string;
  reportingCurrency: string;
  specialAdCategories: string[] | null;
}

/**
 * ═══ MARKA MERKEZİ › WORKSPACE BİLGİLERİ (docs/panel-sadelestirme/MIMARI.md) ═══
 *
 * Eski "Workspace ayarları" + "Bildirimler" + Ayarlar'daki "Senkronizasyon
 * Durumu" tek bölümde, dört kartla:
 *
 *   · `#firma` — iletişim, rapor alıcıları, adres + harita konumu, vergi.
 *     Saat dilimi ve para birimi SALT OKUNUR (Ç-16 ⚠): metrik günleri ve
 *     tutarlar o dilim/birimle yazıldı, değiştirmek raporları sessizce
 *     kaydırırdı.
 *   · `#erisim` — bu workspace'i görenler, SALT OKUNUR (Ç-14). Ekip TEK
 *     yerde (Ayarlar › Ekip ve güvenlik); burada tam yönetici durduğunda
 *     aynı kişinin yetkisi iki ekrandan değişiyordu.
 *   · `#bildirimler` — sinyal ve kural bildirim kanalları (Ç-13).
 *   · `#veri-durumu` — eski Senkronizasyon ekranı (Ç-12). Uç ADRESTEKİ
 *     workspace'i okuyor (`?clientId=`); oturumdaki seçimi okusaydı başka
 *     sekmede başka workspace seçmiş kullanıcı bu sayfada onun verisini
 *     görürdü.
 *
 * ÖZEL REKLAM KATEGORİSİ BURADA DEĞİL: evi Kurulum › Reklam varsayılanları
 * (Ç-10). Eski `#kategori` bağlantısı oraya istemcide çevriliyor.
 *
 * Her kart KENDİ hatasını gösteriyor ve kapısı kapalıysa kartın yerinde
 * NEDENİ yazıyor (boş alan değil, MIMARI § 6).
 */
export async function WorkspaceBilgileri({
  clientId,
  session,
  detay,
}: {
  clientId: string;
  session: SessionResponse;
  detay: { ok: true; v: WorkspaceDetay } | { ok: false; hata: string };
}) {
  const erisimGorunur = kapi(session, 'erisim.gor');
  const veriGorunur = kapi(session, 'veriDurumu.gor');

  const [uyeler, veri] = await Promise.all([
    erisimGorunur
      ? serverApiFetch<MemberRow[]>(`/members?clientId=${encodeURIComponent(clientId)}`).then(
          (v) => ({ ok: true as const, v }),
          (e: unknown) => ({ ok: false as const, hata: hataMetni(e) }),
        )
      : Promise.resolve(null),
    veriGorunur
      ? serverApiFetch<SyncStatusResponse>(`/sync/status?clientId=${encodeURIComponent(clientId)}`).then(
          (v) => ({ ok: true as const, v }),
          (e: unknown) => ({ ok: false as const, hata: hataMetni(e) }),
        )
      : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-4">
      <Kart id="firma" baslik="İletişim ve firma">
        {!detay.ok ? (
          <Uyari ton="tehlike" baslik="Workspace bilgileri alınamadı.">
            {detay.hata}
          </Uyari>
        ) : (
          <FirmaBilgileri
            clientId={clientId}
            bilgi={detay.v}
            saatDilimi={detay.v.timezone}
            paraBirimi={detay.v.reportingCurrency}
            canManage={kapi(session, 'firma.yaz')}
          />
        )}
      </Kart>

      <Kart id="erisim" baslik="Erişim">
        {uyeler === null ? (
          <p className="text-sm text-ink-muted">{PANEL_KAPILARI['erisim.gor'].neden}</p>
        ) : !uyeler.ok ? (
          <Uyari ton="tehlike" baslik="Erişim listesi alınamadı.">
            {uyeler.hata}
          </Uyari>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-ink-muted">
                <strong className="text-ink">{uyeler.v.length}</strong> kişi bu workspace’i görüyor.
              </span>
              <Link
                href={ayarlarAdresi('ekip', { workspace: clientId, capa: 'workspace-erisimi' })}
                className="text-sm font-semibold text-ink underline-offset-2 hover:underline"
              >
                Ayarlar › Ekip ve güvenlik’te yönet
              </Link>
            </div>
            {uyeler.v.length === 0 ? (
              <p className="rounded-alan border border-dashed border-line p-4 text-sm text-ink-muted">
                Bu workspace’e atanmış kimse yok. Şirket yöneticileri yine de görür; kişi eklemek Ayarlar › Ekip ve güvenlik’te.
              </p>
            ) : (
              <ul className="divide-y divide-line rounded-alan border border-line">
                {uyeler.v.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{m.fullName ?? m.email}</span>
                      {m.fullName && <span className="block truncate text-xs text-ink-muted">{m.email}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-ink-muted">{rolMetni(m, clientId)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Kart>

      <Kart id="bildirimler" baslik="Bildirimler">
        {kapi(session, 'bildirim.gor') ? (
          <>
            <p className="mb-3 text-xs text-ink-muted">
              Sinyaller ve kural bildirimleri bu kanallara gider. Bir kanal, deneme mesajı gelene kadar doğrulanmamış sayılır.
            </p>
            <BildirimlerBolumu clientId={clientId} yazabilir={kapi(session, 'bildirim.yaz')} ajansAdresi={session.user.email} />
          </>
        ) : (
          <p className="text-sm text-ink-muted">{PANEL_KAPILARI['bildirim.gor'].neden}</p>
        )}
      </Kart>

      <Kart id="veri-durumu" baslik="Veri durumu">
        {veri === null ? (
          <p className="text-sm text-ink-muted">{PANEL_KAPILARI['veriDurumu.gor'].neden}</p>
        ) : !veri.ok ? (
          <Uyari ton="tehlike" baslik="Veri durumu alınamadı.">
            {veri.hata}
          </Uyari>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-ink-muted">
              Bu workspace’in reklam hesapları, veri çekme işlerinin sonucu ve bir hesap için veri gelmiyorsa nedeni.
              {veri.v.accounts.length === 0 && (
                <>
                  {' '}
                  <Link href={hesaplarAdresi(clientId)} className="font-semibold text-ink underline-offset-2 hover:underline">
                    Kurulum’da hesap ata
                  </Link>
                </>
              )}
            </p>
            <SenkronDurumu data={veri.v} />
          </div>
        )}
      </Kart>
    </div>
  );
}

/** Kişinin BU workspace'teki rolü; workspace'e özel üyelik yoksa şirket rolü. */
function rolMetni(m: MemberRow, clientId: string): string {
  const ozel = m.memberships.find((u) => u.clientId === clientId);
  if (ozel) return ROL_ETIKETI[ozel.role];
  const genel = m.memberships.find((u) => u.clientId === null);
  return genel ? `${ROL_ETIKETI[genel.role]} (şirket geneli)` : '—';
}

/*
 * Bölüm kartı ortak `Kart`; burada yalnız çapa (`id`) ve kaydırma payı
 * ekleniyor. `#firma` gibi bağlantılar bu kimliklere iniyor (bolumler.spec).
 */
function Kart({ id, baslik, children }: { id: string; baslik: string; children: React.ReactNode }) {
  return (
    <OrtakKart id={id} baslik={baslik} className="scroll-mt-24">
      {children}
    </OrtakKart>
  );
}

function hataMetni(e: unknown): string {
  return e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.';
}
