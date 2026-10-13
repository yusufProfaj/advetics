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
import { dugmeSinifi } from '@/components/ui/dugme';
import { SayfaIcDuzen, SayfaIcMenu } from '@/components/ui/sayfa-ic-menu';
import { VarlikBirincilEylem } from '@/components/marka-merkezi/varliklar/birincil-eylem';
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
        <SayfaBasligi bolum="Base" baslik="Varlıklar" />
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
        <SayfaBasligi bolum="Base" baslik="Varlıklar" />
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

  /*
   * BİRİNCİL EYLEMİN YERİ SABİT, METNİ BÖLÜMDEN (taslak `#varlik`). Kapı
   * bölümün kendi yazma kapısı: görsel, kreatif ve form `varlik.yaz`,
   * kitle `kitle.yaz`. Yetkisi olmayan düğmeyi KAPALI ve nedeniyle görüyor;
   * gizlemek "buradan nasıl eklenir" sorusunu cevapsız bırakırdı.
   *
   * FORM ADRESLE AÇILIYOR (`?form=yeni`): form oluşturucu zaten adresteki
   * `form` parametresiyle düzenlemeye açılıyordu; yeni form da aynı yol.
   * Geri tuşu oluşturucuyu kapatıyor, yer imi doğrudan oraya götürüyor.
   */
  const yazmaNedeni = (k: 'varlik.yaz' | 'kitle.yaz') => (kapi(session, k) ? null : PANEL_KAPILARI[k].neden);
  const eylem =
    sekme === 'gorseller' ? (
      <VarlikBirincilEylem bolum="gorseller" etiket="Görsel yükle" kapaliNedeni={yazmaNedeni('varlik.yaz')} />
    ) : sekme === 'kreatifler' ? (
      <VarlikBirincilEylem bolum="kreatifler" etiket="Yeni kreatif" kapaliNedeni={yazmaNedeni('varlik.yaz')} />
    ) : sekme === 'formlar' ? (
      yazmaNedeni('varlik.yaz') ? (
        <VarlikBirincilEylem bolum="formlar" etiket="Yeni form" kapaliNedeni={yazmaNedeni('varlik.yaz')} />
      ) : (
        <Link href={varliklarAdresi('formlar', clientId, { form: 'yeni' })} className={dugmeSinifi('birincil')} scroll={false}>
          <span aria-hidden="true">＋</span> Yeni form
        </Link>
      )
    ) : sekme === 'kitleler' ? (
      <VarlikBirincilEylem bolum="kitleler" etiket="Yeni kitle" kapaliNedeni={yazmaNedeni('kitle.yaz')} />
    ) : null;

  return (
    <div className="grid gap-6">
      <SayfaBasligi
        bolum="Base"
        baslik="Varlıklar"
        aciklama={
          <>
            {workspaceAdi && <strong className="font-semibold text-ink">{workspaceAdi}</strong>}
            {workspaceAdi && ' · '}
            Reklamlarda kullanılan görseller, kreatifler, formlar ve kitleler.
          </>
        }
        eylemler={eylem}
      />

      {/*
        BÖLÜMLER SAYFA İÇİ YAN MENÜDE (BILESENLER § 9): eskiden başlığın
        altında alt çizgili sekme şeridiydi. Seçim yine ADRESTE (`?sekme=`),
        menü öğeleri bağlantı; geri tuşu bölümler arasında çalışıyor.
      */}
      <SayfaIcDuzen
        menu={
          <SayfaIcMenu
            etiket="Varlık türü"
            secili={sekme ?? ''}
            ogeler={sekmeler.map((k) => ({ deger: k, etiket: varlikSekmeAdi(k), href: varliklarAdresi(k, clientId) }))}
          />
        }
      >
        {/* `key` SEKMEDEN: içerik değiştiği hissedilsin (geçiş animasyonu). */}
        <div key={sekme ?? 'yok'} className="bolum-gecis grid min-w-0 content-start gap-4">
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
      </SayfaIcDuzen>
    </div>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
