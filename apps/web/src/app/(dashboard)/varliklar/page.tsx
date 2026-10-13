import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { sayfaWorkspaceId, workspaceSecimVerisi, workspaceUyumu } from '@/lib/sayfa-workspace';
import {
  PANEL_KAPILARI,
  kapi,
  markaMerkeziAdresi,
  varliklarAdresi,
  varliklarSekmesi,
} from '@/lib/panel-adresleri';
import { WorkspaceGerekli } from '@/components/workspace-gerekli';
import { WorkspaceGec } from '@/components/workspace-gec';
import { SayfaBasligi } from '@/components/ui/sayfa-basligi';
import { Uyari } from '@/components/ui/uyari';
import { gorunurVarlikSekmeleri, varlikSekmeAdi, varlikSekmesiCoz } from '@/components/marka-merkezi/bolumler';
import { GorsellerIcerik } from '@/components/marka-merkezi/varliklar/gorseller';
import { KreatiflerIcerik } from '@/components/marka-merkezi/varliklar/kreatifler';
import { FormlarIcerik } from '@/components/marka-merkezi/varliklar/formlar';
import { KitlelerBolumu } from '@/components/marka-merkezi/kitleler-bolumu';

export const metadata = { title: 'Varlıklar · Advetics' };
export const dynamic = 'force-dynamic';

/**
 * ═══ BASE › VARLIKLAR — GÖRSELLER · KREATİFLER · FORMLAR · KİTLELER ═══
 * (docs/panel-sadelestirme/MIMARI.md, Karar B, kullanıcı 2026-10-13)
 *
 * Reklam kurarken her gün açılan malzeme. Marka Merkezi'nin iç menüsünde
 * dururken "malzeme nerede" sorusu bir kurulum ekranının içinde
 * cevaplanıyordu; artık menüde ayrı satır ve Google Ads'in "Öğe kitaplığı"
 * gibi sekmeli tek sayfa.
 *
 * LOGO BURADA DEĞİL (Ç-11): evi Marka Merkezi › Marka › Logo. Eski
 * `?tur=logo` bağlantıları oraya gidiyor; Görseller'de logo süzgeci yok ve
 * logo sayısı listenin altında bağlantıyla yazıyor (sessiz kesme yok).
 *
 * KİTLELER 4. SEKME (Ç-26): AdvCampaign'de görsel ve form gibi SEÇİLEN
 * malzeme. Varsayılan kitle burada değişmiyor; rozet salt okunur ve evi
 * Kurulum › Reklam varsayılanları.
 */
export default async function VarliklarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const musteriParam = first(params.musteri);

  // Logonun evi Marka › Logo — boş bir "logo" süzgeci açmak yerine oraya.
  if (first(params.tur) === 'logo') redirect(markaMerkeziAdresi('marka', musteriParam, 'logo'));

  if (!kapi(session, 'varliklar.gor')) {
    return (
      <div className="space-y-5">
        <SayfaBasligi baslik="Varlıklar" />
        <Uyari ton="uyari" baslik={PANEL_KAPILARI['varliklar.gor'].neden}>
          Görseller, kreatifler ve formlar ajans tarafında yönetiliyor. Yöneticine sor.
        </Uyari>
      </div>
    );
  }

  const clientId = sayfaWorkspaceId(session, first(params.musteri));
  if (!clientId) {
    return (
      <WorkspaceGerekli
        ekran="Varlıklar"
        neden="Görseller, kreatifler, formlar ve kitleler bir workspace’e ait."
        {...workspaceSecimVerisi(session)}
      />
    );
  }

  /*
   * ADRES ≠ SEÇİM: üstte başka workspace seçiliyken liste RLS'ten BOŞ gelir
   * ("henüz görsel yok" gibi okunur). İçerik çizilmiyor, tek tıkla geçiş
   * (`workspaceUyumu`). Seçim hiç yoksa okuma doğru; Varlıklar'ın yazmaları
   * seçim istemiyor, o yüzden uyarı yalnız `farkli` hâlinde.
   */
  const uyum = workspaceUyumu(session, clientId);
  if (uyum === 'farkli') {
    return (
      <div className="space-y-5">
        <SayfaBasligi baslik="Varlıklar" />
        <WorkspaceGec
          clientId={clientId}
          workspaceAdi={session.availableClients.find((c) => c.id === clientId)?.name ?? null}
          aktifAdi={session.availableClients.find((c) => c.id === session.activeClientId)?.name ?? null}
          ekran="Varlıklar"
          uyum={uyum}
        />
      </div>
    );
  }

  const sekmeler = gorunurVarlikSekmeleri(session.permissions);
  const sekme = varlikSekmesiCoz(varliklarSekmesi(first(params.sekme)), session.permissions);
  const workspaceAdi = session.availableClients.find((c) => c.id === clientId)?.name ?? null;

  return (
    <div className="space-y-5">
      <SayfaBasligi
        ust={
          <nav aria-label="Konum" className="flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
            <span>Base</span>
            <span aria-hidden="true">›</span>
            <span>Varlıklar</span>
            {sekme && (
              <>
                <span aria-hidden="true">›</span>
                <span className="font-semibold text-ink">{varlikSekmeAdi(sekme)}</span>
              </>
            )}
          </nav>
        }
        baslik="Varlıklar"
        aciklama={
          <>
            {workspaceAdi && <strong className="font-medium text-ink">{workspaceAdi}</strong>}
            {workspaceAdi && ' · '}
            Reklamlarda kullanılan görseller, kreatifler, formlar ve kitleler.
          </>
        }
      />

      {/* SEKME ÇUBUĞU: dar ekranda yatay kayar, sayfa kaymaz. */}
      <nav aria-label="Varlık türü" className="-mx-1 overflow-x-auto px-1">
        <ul className="flex min-w-max gap-1 border-b border-line">
          {sekmeler.map((k) => (
            <li key={k}>
              <Link
                href={varliklarAdresi(k, clientId)}
                aria-current={k === sekme ? 'page' : undefined}
                className={`-mb-px inline-block border-b-2 px-3 py-2 text-sm transition-colors motion-reduce:transition-none ${
                  k === sekme ? 'border-brand font-semibold text-ink' : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                {varlikSekmeAdi(k)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* `key` SEKMEDEN: içerik değiştiği hissedilsin (geçiş animasyonu). */}
      <div key={sekme ?? 'yok'} className="bolum-gecis min-w-0 space-y-4">
        {sekme === null && (
          <Uyari ton="uyari" baslik="Görebileceğin bir varlık sekmesi yok.">
            Yöneticine sor.
          </Uyari>
        )}
        {sekme === 'gorseller' && <GorsellerIcerik clientId={clientId} params={params} />}
        {sekme === 'kreatifler' && <KreatiflerIcerik clientId={clientId} params={params} />}
        {sekme === 'formlar' && <FormlarIcerik clientId={clientId} params={params} />}
        {sekme === 'kitleler' && (
          <KitlelerBolumu
            clientId={clientId}
            yazabilir={kapi(session, 'kitle.yaz')}
            varsayilanAdresi={kapi(session, 'markaMerkezi.gor') ? markaMerkeziAdresi('kurulum', clientId, 'varsayilanlar') : null}
          />
        )}
      </div>
    </div>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
