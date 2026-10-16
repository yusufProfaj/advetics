import { sayfaWorkspaceId, workspaceSecimVerisi } from '@/lib/sayfa-workspace';
import { WorkspaceGerekli } from '@/components/workspace-gerekli';
import {
  LEAD_STATUSES,
  type GeriBeslemeAyari,
  type LeadFormRecord,
  type LeadListResult,
} from '@advetics/shared';
import { GeriBeslemeSeridi } from '@/components/leads/geri-besleme-seridi';
import { GonderimlerSekmesi } from '@/components/leads/gonderimler-sekmesi';
import { potansiyelAdresi, type AyarSonucu } from '@/lib/geri-besleme';
import { hasPermission, requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { LeadTable } from '@/components/leads/lead-table';
import { Son30Gun } from '@/components/leads/son-30-gun';
import { hataMetni } from '@/lib/sayfa-yardimcilari';
import { SayfaIskeleti } from '@/components/ui/sayfa-basligi';
import { SayfaIcDuzen, SayfaIcMenu } from '@/components/ui/sayfa-ic-menu';
import { BosDurum, HataDurumu, Serit } from '@/components/ui/hal';
import { dugmeSinifi } from '@/components/ui/dugme';
import { sec } from '@advetics/shared';
import { dilAl } from '@/dil/sunucu';
import { leadsSozlugu } from '@/dil/sozlukler/leads';
import { menuBolumuEtiketi, menuSatiriEtiketi } from '@/lib/nav-sections';

/** Başlık istek anında: dil çerezden okunuyor; ad menünün kendi çevirisinden. */
export async function generateMetadata() {
  return { title: `${menuSatiriEtiketi('/potansiyel-musteriler', await dilAl())} · Advetics` };
}
export const dynamic = 'force-dynamic';

/**
 * Potansiyel müşteriler.
 *
 * BU EKRANIN İKİ İŞİ VAR ve ikincisi kolay atlanan:
 *
 *   1. Kayıtları göstermek ve durumlarını ilerletmek.
 *   2. VERİ HATTININ SAĞLIĞINI göstermek. Boş bir liste iki anlama geliyor —
 *      "kimse form doldurmadı" ya da "sistem çalışmıyor" — ve ikisi
 *      birbirinden ayırt edilemezse ajans günlerce bekler.
 *
 * Mutabakat oranı bu ayrımı yapıyor: kayıtlar tarama ile geliyorsa webhook
 * o sayfa için ölmüş demektir ve bu, başka hiçbir yerde görünmeyecek bir arıza.
 */
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const dil = await dilAl();
  const d = sec(leadsSozlugu, dil).sayfa;
  const sayfaAdi = menuSatiriEtiketi('/potansiyel-musteriler', dil);

  // SESSİZCE İLK WORKSPACE'E DÜŞÜLMÜYOR — gerekçe `lib/sayfa-workspace.ts`.
  const clientId = sayfaWorkspaceId(session, first(params.musteri));

  if (!clientId) {
    return (
      <WorkspaceGerekli
        ekran={sayfaAdi}
        neden={d.neden}
        {...workspaceSecimVerisi(session)}
      />
    );
  }

  const status = first(params.durum);
  const search = first(params.ara);
  const formId = first(params.form);

  const query = new URLSearchParams({ clientId, limit: '50', offset: '0' });
  if (status && (LEAD_STATUSES as readonly string[]).includes(status)) {
    query.set('status', status);
  }
  if (search) query.set('search', search);
  if (formId) query.set('leadFormId', formId);

  const sekme = first(params.sekme) === 'gonderimler' ? 'gonderimler' : 'kayitlar';

  /*
   * HATA YUTULMUYOR: kayıt listesi düşerse sunucunun cümlesi ekranda
   * (`.catch(() => null)` "Kayıtlar yüklenemedi" diyordu ve nedenini
   * söylemiyordu). Form listesi düşerse süzgeç kaybolmuyor, nedeni şeritte:
   * boş bir form listesi "hiç form yok" diye okunurdu.
   */
  let listeHatasi: string | null = null;
  let formHatasi: string | null = null;
  const [result, forms, ayar] = await Promise.all([
    serverApiFetch<LeadListResult>(`/leads?${query.toString()}`).catch((e: unknown) => {
      listeHatasi = hataMetni(e);
      return null;
    }),
    serverApiFetch<LeadFormRecord[]>(`/lead-forms?clientId=${clientId}`).catch((e: unknown): LeadFormRecord[] => {
      formHatasi = hataMetni(e);
      return [];
    }),
    /*
     * META'YA BİLDİRİM AYARI (Paket E). Çağrı düşerse şerit "kapalı" DEMİYOR,
     * sunucunun cümlesini gösteriyor: açık ve çalışan bir gönderimi kapalı
     * sandırmak, kullanıcıyı onu yeniden açmaya gönderirdi.
     */
    serverApiFetch<GeriBeslemeAyari>(`/geri-besleme/ayar?clientId=${clientId}`).then(
      (a): AyarSonucu => ({ durum: 'tamam', ayar: a }),
      (e: unknown): AyarSonucu => ({ durum: 'hata', mesaj: e instanceof Error ? e.message : d.ayarOkunamadi }),
    ),
  ]);

  const canWrite = hasPermission(session, 'lead.write');
  const canExport = hasPermission(session, 'lead.export');
  const canManage = hasPermission(session, 'connection.manage');
  const total = result ? Object.values(result.byStatus).reduce((a, b) => a + b, 0) : 0;
  const sorunlu =
    ayar.durum === 'tamam' ? ayar.ayar.sayilar.reddedildi + ayar.ayar.sayilar.vazgecildi + ayar.ayar.sayilar.suresi_doldu : 0;

  return (
    <SayfaIskeleti
      bolum={menuBolumuEtiketi('/potansiyel-musteriler', dil)}
      baslik={sayfaAdi}
      /*
        AÇIKLAMA KAPSAMI DA SÖYLÜYOR: ekran bir süre yalnızca panelde
        üretilmiş formların kayıtlarını topluyordu ve cümle bunu hiç
        yazmıyordu; Meta Ads Manager'da kurulmuş formların kayıtları hiç
        gelmiyor, kullanıcı da sebebini bilmiyordu.
      */
      aciklama={d.aciklama}
      eylemler={
        <>
          {/*
            DÜĞME LİSTE BOŞKEN DE DURUYOR: asıl gerekli olduğu an o. Kayıt
            varken gizlemek, "gelmiyor" diyen kullanıcıya hiçbir şey
            bırakmamak olurdu.
          */}
          {canWrite && <Son30Gun clientId={clientId} />}
          {/* CSV BİRİNCİL EYLEM (onaylı taslak `#leads`): ekranın tek kırmızı düğmesi. */}
          {canExport && total > 0 && (
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL ?? ''}/leads/export?${query.toString()}`}
              className={dugmeSinifi('birincil')}
            >
              {d.csvIndir}
            </a>
          )}
        </>
      }
    >
      {/* VERİ HATTI SAĞLIĞI: liste boşken de görünüyor. */}
      {result && result.reconciledRatio > 0.3 && (
        <Serit baslik={d.gecikmeBaslik}>{d.gecikme(Math.round(result.reconciledRatio * 100))}</Serit>
      )}

      {/* META'YA BİLDİRİM ŞERİDİ: liste boşken de görünüyor (ayar lead'den önce açılabilir). */}
      <GeriBeslemeSeridi clientId={clientId} sonuc={ayar} canManage={canManage} />

      {/*
        İKİ BÖLÜM, AYNI SAYFA, SAYFA İÇİ YAN MENÜDE (kullanıcı kararı
        2026-10-14): gönderim geçmişi lead'in kendisiyle aynı işin parçası;
        ayrı sayfa "nereye nereden girdiğimi unutuyorum" şikâyetinin
        sebebiydi. Adres üreticiden (`potansiyelAdresi`): geri tuşu çalışsın.
      */}
      <SayfaIcDuzen
        menu={
          <SayfaIcMenu
            etiket={d.bolumlerEtiketi}
            secili={sekme}
            ogeler={[
              { deger: 'kayitlar', etiket: d.kayitlar, sayi: total, href: potansiyelAdresi(clientId, 'kayitlar') },
              {
                deger: 'gonderimler',
                etiket: d.gonderimler,
                uyari: sorunlu > 0,
                href: potansiyelAdresi(clientId, 'gonderimler'),
              },
            ]}
          />
        }
      >
        {formHatasi && sekme === 'kayitlar' && (
          <Serit baslik={d.formListesiBaslik}>{d.formSuzgeciYok(formHatasi)}</Serit>
        )}
        {sekme === 'gonderimler' ? (
          <GonderimlerSekmesi clientId={clientId} canWrite={canWrite} />
        ) : !result ? (
          <HataDurumu baslik={d.kayitlarYuklenemedi} mesaj={listeHatasi ?? d.sebepYok} />
        ) : total === 0 ? (
          /*
            ═══ BOŞ LİSTE SEBEBİNİ SÖYLÜYOR ═══
            Burada tek bir cümle vardı ve DÖRT ayrı hâli aynı kefeye koyuyordu:
            sayfa atanmamış · sayfa token'ı yok · tarama hiç koşmamış ·
            gerçekten kayıt yok. Sebep artık sunucudan geliyor.
          */
          <BosDurum baslik={d.henuzKayitYok} neden={result.emptyReason} />
        ) : (
          <LeadTable
            initial={result}
            clientId={clientId}
            forms={forms}
            activeStatus={status ?? null}
            activeSearch={search ?? ''}
            activeFormId={formId ?? null}
            canWrite={canWrite}
          />
        )}
      </SayfaIcDuzen>
    </SayfaIskeleti>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
