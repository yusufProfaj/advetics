import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ManagerAccountTree, UstHesapOzeti } from '@advetics/shared';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { acilisAdresi, kapi } from '@/lib/panel-adresleri';
import { ayarSekmesiAcik } from '@/lib/ayar-kapilari';
import { dugmeSinifi } from '@/components/ui/dugme';
import { BosDurum } from '@/components/ui/hal';
import { AyarKapsami, AyarlarSayfasi, aktifSirketAdi } from '@/components/ayar-kapsam';
import { UstHesapEkrani } from '@/components/ust-hesap/ust-hesap-ekrani';
import { UstHesapYonetimi } from '@/components/ust-hesap/ust-hesap-yonetimi';
import { WorkspaceBolumu } from '@/components/tenancy/workspace-bolumu';

export const metadata = { title: 'Şirketler ve workspace’ler · Advetics' };

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
}

function hataMetni(e: unknown): string {
  return e instanceof ApiRequestError ? e.message : 'Bağlantı kurulamadı';
}

/**
 * ═══ ŞİRKETLER VE WORKSPACE'LER (Ayarlar'ın ilk sekmesi) ═══
 *
 * Hiyerarşi: Üst hesap → Şirket → Workspace → Reklam hesabı → Kampanya.
 * Google Ads "Yönetici hesabı" ekranının karşılığı: solda şirketler, sağda
 * seçili şirketin workspace'leri satır satır, en altta arşiv ve (yalnız
 * platform sahibine) üst hesaplar.
 *
 * ÜÇ ESKİ SAYFA BURADA BİRLEŞTİ (2026-10-13): `/ayarlar/ust-hesap`
 * (Şirketler), `/ayarlar/musteriler` (workspace'ler) ve `/ayarlar/ust-
 * hesaplar` (Üst hesaplar). Üçü de yönleniyor (`ESKI_ADRESLER`).
 *
 * KAPI `client.write`, eskisi gibi `org.write` DEĞİL (MIMARI Ç-2): Reklam
 * Yöneticisi workspace AÇABİLİYOR ama `org.write` taşımadığı için workspace
 * listesine hiç giremiyordu. Şirket kartları ve şirket işlemleri sayfanın
 * İÇİNDE `sirket.yonet` ile kapalı; sekme kapısı menüyle AYNI kaynaktan.
 */
export default async function SirketlerPage() {
  const session = await requireSession();
  if (!ayarSekmesiAcik(session, 'sirketler')) redirect('/dashboard');

  const sirketYonetir = kapi(session, 'sirket.yonet');
  const ustHesapYonetir = kapi(session, 'ustHesap.yonet');

  /*
   * HATA YUTULMUYOR (CLAUDE.md: `.catch(() => setX([]))` yasak). `null` ile
   * hata AYNI ŞEY DEĞİL: birincisi "üst hesabın yok, kurabilirsin",
   * ikincisi "okuyamadık". `?? null` ŞART: uç `null` döndüğünde NestJS
   * gövdeyi boş bırakıyor ve `serverApiFetch` `undefined` veriyor.
   */
  let agac: ManagerAccountTree | null = null;
  let agacHatasi: string | null = null;
  if (sirketYonetir) {
    try {
      agac = (await serverApiFetch<ManagerAccountTree | null>('/manager-account')) ?? null;
    } catch (e) {
      agacHatasi = hataMetni(e);
    }
  }

  /*
   * "TÜM ŞİRKETLER" MODUNDA TEK BİR AKTİF ŞİRKET YOK: `/clients` ajansın
   * BÜTÜN workspace'lerini döndürüyor ve satırda şirket yazmıyor;
   * `/organization` ise EV şirketini düzenlerdi. Workspace bölümü o modda
   * çizilmiyor ve sebebi yazılıyor.
   */
  const sirketKapsami = !session.tumSirketler;

  let sirket: OrganizationRow | null = null;
  let sirketHatasi: string | null = null;
  if (sirketYonetir && sirketKapsami) {
    try {
      sirket = (await serverApiFetch<OrganizationRow | null>('/organization')) ?? null;
    } catch (e) {
      sirketHatasi = hataMetni(e);
    }
  }

  /*
   * ÜST HESAPLAR — YALNIZ PLATFORM SAHİBİ (kullanıcı kararı, MIMARI Ç-3).
   * Ajans yöneticisi kendi üst hesabının adını buradan artık değiştirmiyor;
   * üst hesap EKİBİ Ekip ve güvenlik sekmesinde onda kalıyor.
   */
  let ustHesaplar: UstHesapOzeti[] = [];
  let ustHesaplarHatasi: string | null = null;
  if (ustHesapYonetir) {
    try {
      ustHesaplar = (await serverApiFetch<UstHesapOzeti[]>('/manager-account/liste')) ?? [];
    } catch (e) {
      ustHesaplarHatasi = hataMetni(e);
    }
  }

  /* Workspace'in taşınabileceği şirketler: ağaçtaki DİĞER şirketler. */
  const tasiHedefleri = (agac?.organizations ?? [])
    .filter((o) => o.id !== session.activeOrganizationId)
    .map((o) => ({ id: o.id, name: o.name }));

  const workspaceler = !sirketKapsami ? (
    /*
     * BU BİR UYARI DEĞİL, YÖNERGE. Çerçeveli kutu hata sanıldı
     * (*"bu uyarıyı veriyo"*); metin şirkete tıklamanın ŞİRKETİ
     * DEĞİŞTİRDİĞİNİ söylemek zorunda.
     */
    <div id="workspaceler" className="scroll-mt-24">
      <BosDurum
        baslik="Workspace’leri görmek için bir şirket seç"
        neden={`Şu an bütün şirketleri birlikte görüyorsun. ${
          sirketYonetir ? 'Soldaki listeden' : 'Üstteki seçiciden'
        } bir şirkete tıklamak seni o şirkete geçirir.`}
      />
    </div>
  ) : (
    <WorkspaceBolumu session={session} tasiHedefleri={tasiHedefleri} />
  );

  /*
   * BÖLÜMÜN BİRİNCİL EYLEMİ BAŞLIĞIN SAĞINDA (taslak `#ayarlar`): "Yeni
   * workspace". Yalnız TEK ŞİRKET kapsamında: "tüm şirketler" modunda yeni
   * workspace EV şirketine kurulurdu ve kimse söylemezdi (sihirbaz o modda
   * önce şirket soruyor, ama düğmeyi burada göstermek o soruyu davet eder).
   * Kapı kapalıysa sebebi workspace listesinin altında yazıyor.
   */
  const eylemler =
    sirketKapsami && kapi(session, 'workspace.ekle') ? (
      <Link href={acilisAdresi('workspace')} className={dugmeSinifi('birincil')}>
        + Yeni workspace
      </Link>
    ) : undefined;

  return (
    <AyarlarSayfasi
      session={session}
      ust={
        sirketYonetir && session.managerAccount ? (
          <AyarKapsami duzey="ajans" ad={session.managerAccount.name} />
        ) : (
          <AyarKapsami duzey="sirket" ad={aktifSirketAdi(session)} />
        )
      }
      baslik="Şirketler ve workspace’ler"
      aciklama={
        sirketYonetir
          ? 'Soldan bir şirkete geç, sağda o şirketin workspace’lerini yönet. Bir workspace’in hesapları, markası ve bilgileri Marka Merkezi’nde.'
          : 'Bu şirketin workspace’leri. Bir workspace’in hesapları, markası ve bilgileri Marka Merkezi’nde.'
      }
      eylemler={eylemler}
    >
      {sirketYonetir ? (
        <div id="sirketler" className="scroll-mt-24">
          <UstHesapEkrani
            ilkAgac={agac}
            aktifOrgId={session.activeOrganizationId}
            yuklemeHatasi={agacHatasi}
            sirket={sirketKapsami ? sirket : null}
            sirketHatasi={sirketKapsami ? sirketHatasi : null}
            platformAdmin={session.platformAdmin}
            ustHesapKurabilir={session.platformAdmin || !session.organization.ustHesabaBagli}
          >
            {workspaceler}
          </UstHesapEkrani>
        </div>
      ) : (
        workspaceler
      )}

      {ustHesapYonetir && (
        <section id="ust-hesaplar" className="grid scroll-mt-24 gap-3">
          <UstHesapYonetimi
            hesaplar={ustHesaplar}
            platformAdmin={session.platformAdmin}
            yuklemeHatasi={ustHesaplarHatasi}
          />
        </section>
      )}
    </AyarlarSayfasi>
  );
}
