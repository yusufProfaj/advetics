import { sayfaWorkspaceId, workspaceSecimVerisi } from '@/lib/sayfa-workspace';
import { WorkspaceGerekli } from '@/components/workspace-gerekli';
import Link from 'next/link';
import type { ReklamHazirligi } from '@advetics/shared';
import { hasPermission, requireSession } from '@/lib/session';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { Baslik, Kutu, dugmeSinifi } from '@/reklam/ui';
import { YeniReklamAkisi } from '@/reklam/akis/yeni-reklam-akisi';

export const metadata = { title: 'Yeni Reklam (önizleme) · Advetics' };
export const dynamic = 'force-dynamic';

/**
 * Yeni Reklam Oluştur — Acemi akışının PANEL İÇİNDEKİ önizlemesi
 * (docs/meta-reklam-brief/tasarim/TASARIM.md § 03-04).
 *
 * YENİ REKLAM MODÜLÜ (`apps/web/src/reklam/`, kullanıcı kararı 2026-10-07:
 * "tamamen ayrı modül"). Eski Reklam Oluştur / Hızlı Reklam / ad-builder
 * koduna HİÇBİR ŞEY eklemiyor ve onlardan hiçbir bileşen almıyor; Aşama 7'de
 * eskiler silinince bu modül etkilenmemeli.
 *
 * MENÜDE YOK, BİLEREK: yayın motoru bağlı değil ve menüye konan bir ekran
 * "kullanılabilir" sözü verir. Adres doğrudan: /reklam/yeni.
 *
 * Hazırlık verisi modülün kendi ucundan, TEK istekte (`GET /reklam/hazirlik`).
 * Eski uçlara (bağlantılar, varlıklar, profil, kitle) gidilmiyor.
 */
export default async function YeniReklamPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const clientId = sayfaWorkspaceId(session, first(params.musteri));

  if (!clientId) {
    return (
      <WorkspaceGerekli
        ekran="Yeni Reklam"
        neden="Reklam bir workspace’in reklam hesabında kuruluyor."
        {...workspaceSecimVerisi(session)}
      />
    );
  }
  if (!hasPermission(session, 'bulk.write')) {
    return <Kutu ton="uyari" baslik="Reklam oluşturma yetkin yok">Workspace yöneticine danış.</Kutu>;
  }

  const client = session.availableClients.find((c) => c.id === clientId);

  let hazirlik: ReklamHazirligi;
  try {
    hazirlik = await serverApiFetch<ReklamHazirligi>(`/reklam/hazirlik?clientId=${clientId}`);
  } catch (e) {
    return (
      <Kutu ton="tehlike" baslik="Reklam hazırlığı okunamadı">
        {hata(e)} Sayfayı yenilemeyi dene.
      </Kutu>
    );
  }
  const { hesaplar, sayfalar } = hazirlik;

  const ust = (
    <Link href={`/reklam-olustur?musteri=${clientId}`} className="text-xs text-ink-muted hover:text-ink">
      ← Reklam Oluştur
    </Link>
  );

  // Boş hâl NEDENİNİ söylüyor: hesap yok ile sayfa yok farklı iş.
  if (hesaplar.length === 0 || sayfalar.length === 0) {
    return (
      <div className="space-y-5">
        <Baslik ust={ust} baslik="Yeni Reklam" />
        <Kutu
          ton="uyari"
          baslik={hesaplar.length === 0 ? 'Bu workspace’e Meta reklam hesabı atanmamış' : 'Bu workspace’te Facebook sayfası yok'}
          eylem={
            <Link href={`/marka-merkezi?bolum=baglantilar&musteri=${clientId}`} className={dugmeSinifi('ikincil', true)}>
              Bağlantılara git
            </Link>
          }
        >
          Reklam hazırlığı Marka Merkezi’nde bir kez yapılır.
        </Kutu>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Baslik
        ust={ust}
        baslik="Yeni Reklam"
        aciklama={
          <>
            <strong className="text-ink">{client?.name ?? 'Workspace'}</strong> · beş soru, bir kontrol ekranı.
          </>
        }
      />
      <Kutu ton="bilgi" baslik="Önizleme">
        Yeni reklam akışı yapım aşamasında. Seçimlerin kaydedilmez ve Meta’ya hiçbir şey gönderilmez.
      </Kutu>
      {!hazirlik.marka.profilVar && (
        <Kutu ton="uyari" baslik="Marka profili kurulmamış">
          Metin şablonları ve yasal uyarı Marka Merkezi’nden gelir; şu an boş.
        </Kutu>
      )}
      <YeniReklamAkisi clientId={clientId} workspaceAdi={client?.name ?? 'Workspace'} hazirlik={hazirlik} />
    </div>
  );
}

function hata(e: unknown): string {
  return e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.';
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
