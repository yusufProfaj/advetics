import type { SpecialAdCategory } from '@advetics/shared';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { hasPermission, type SessionResponse } from '@/lib/session';
import { Uyari } from '@/components/ui/uyari';
import { SpecialCategoryPicker } from '@/components/tenancy/special-category-picker';
import { TeamManager, type MemberRow } from '@/components/tenancy/team-manager';
import { DanismanAta } from '@/components/tenancy/danisman-ata';
import type { MusteriBilgileri } from '@/components/tenancy/musteri-bilgi-formu';
import { FirmaBilgileri } from './firma-bilgileri';

/**
 * `GET /clients/:id` satırının bu ekranın okuduğu kısmı.
 *
 * `serverApiFetch<T>` DENETİMSİZ bir dönüşüm: uç `findById` satırın bütün
 * kolonlarını döndürüyor (Prisma `include`, `select` değil), yani buradaki
 * alanlar uçta zaten var. Uç bir gün `select`e geçerse bu tip yalan söyler ve
 * ekranda "—" görünür; `clients.service.ts#findById` ile birlikte değiştir.
 */
interface WorkspaceDetay extends MusteriBilgileri {
  id: string;
  timezone: string;
  reportingCurrency: string;
  specialAdCategories: SpecialAdCategory[] | null;
}

/**
 * ═══ WORKSPACE AYARLARI — MARKA MERKEZİ'NİN İÇİNDE ═══
 *
 * Kullanıcı: "buraya sadece ayarlardan şirketler ve workspace ayarlarından
 * gelebiliyorum; workspace'e geçiş yaptığımda doldurulması gereken her yeri
 * Marka Merkezi kısmından halletmek istiyorum" (2026-10-06). Şirketler
 * ekranındaki pencerede duran üç şey buraya geldi: iletişim/firma bilgileri
 * (rapor alıcıları dahil), Meta özel reklam kategorisi ve ekip. Pencere
 * yerinde kalıyor; ajans şirketler arasında gezerken orayı kullanıyor.
 *
 * ARŞİVLEME BURADA YOK: şirket düzeyinde bir karar ve yanlışlıkla basılması
 * pahalı; kurulum ekranına koymak "doldurulacak alanlar"ın arasına bir
 * yıkıcı düğme koymak olurdu.
 *
 * Her kart KENDİ hatasını gösteriyor: ekip listesi alınamadı diye firma
 * bilgileri de kaybolmamalı.
 */
export async function WorkspaceAyarlari({
  clientId,
  session,
}: {
  clientId: string;
  session: SessionResponse;
}) {
  const yaz = (izin: Parameters<typeof hasPermission>[1]) => hasPermission(session, izin);
  const ekipGorunur = yaz('user.read');

  const [detay, uyeler] = await Promise.all([
    serverApiFetch<WorkspaceDetay>(`/clients/${clientId}`).then(
      (v) => ({ ok: true as const, v }),
      (e: unknown) => ({ ok: false as const, hata: hataMetni(e) }),
    ),
    ekipGorunur
      ? serverApiFetch<MemberRow[]>(`/members?clientId=${encodeURIComponent(clientId)}`).then(
          (v) => ({ ok: true as const, v }),
          (e: unknown) => ({ ok: false as const, hata: hataMetni(e) }),
        )
      : Promise.resolve(null),
  ]);

  return (
    <section aria-labelledby="ayarlar-baslik" className="space-y-4">
      <div>
        <h2 id="ayarlar-baslik" className="font-baslik text-lg font-semibold text-ink">
          Workspace ayarları
        </h2>
        <p className="mt-0.5 text-sm text-ink-muted">
          İletişim, fatura bilgileri, reklam kategorisi ve bu workspace’e erişen kişiler.
        </p>
      </div>

      {!detay.ok ? (
        <Uyari ton="tehlike" baslik="Workspace bilgileri alınamadı.">
          {detay.hata}
        </Uyari>
      ) : (
        <>
          <Kart id="firma" baslik="İletişim ve firma">
            <FirmaBilgileri
              clientId={clientId}
              bilgi={detay.v}
              saatDilimi={detay.v.timezone}
              paraBirimi={detay.v.reportingCurrency}
              canManage={yaz('client.write')}
            />
          </Kart>

          {/* ÇERÇEVESİZ VE BAŞLIKSIZ: seçici kendi çerçevesini, başlığını ve
              durumunu ("beyan yok") taşıyor; kartın içine koymak kutu içinde
              kutu ve iki kez yazan bir başlık üretiyordu. */}
          <section id="kategori" className="scroll-mt-24 rounded-xl bg-surface">
            <SpecialCategoryPicker
              clientId={clientId}
              value={detay.v.specialAdCategories ?? []}
              canManage={yaz('client.write')}
            />
          </section>
        </>
      )}

      {uyeler !== null && (
        <Kart id="ekip" baslik="Ekip">
          {!uyeler.ok ? (
            <Uyari ton="tehlike" baslik="Ekip listesi alınamadı.">
              {uyeler.hata}
            </Uyari>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span>
                  <strong>{uyeler.v.length}</strong> kişinin bu workspace’e erişimi var
                </span>
                {/* YALNIZCA ORG YÖNETİCİSİNE: `POST /memberships` onu istiyor;
                    düğmeyi herkese gösterip 403 aldırmak olmaz. */}
                {session.isOrgAdmin && detay.ok && (
                  <DanismanAta
                    clientId={clientId}
                    clientName={detay.v.name}
                    mevcutUyeIdleri={uyeler.v.map((m) => m.id)}
                  />
                )}
              </div>
              {/* TEK WORKSPACE VERİLİYOR: bu ekrandan başka bir workspace'e
                  yetki açılamamalı. */}
              {detay.ok && (
                <TeamManager
                  members={uyeler.v}
                  clients={[{ id: clientId, name: detay.v.name }]}
                  currentUserId={session.user.id}
                  ekleKapali
                />
              )}
            </div>
          )}
        </Kart>
      )}
    </section>
  );
}

function Kart({ id, baslik, children }: { id: string; baslik: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-xl border border-line bg-surface p-5">
      <h3 className="mb-3 text-sm font-semibold text-ink">{baslik}</h3>
      {children}
    </section>
  );
}

function hataMetni(e: unknown): string {
  return e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.';
}
