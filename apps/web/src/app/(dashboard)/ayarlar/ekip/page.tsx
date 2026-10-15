import { redirect } from 'next/navigation';
import {
  ayarSekmesiAdi,
  kapiNedeni,
  sec,
  type IkiAdimDurumu,
  type ManagerAccountTree,
  type UstHesapUyesi,
} from '@advetics/shared';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { kapi } from '@/lib/panel-adresleri';
import { ayarSekmesiAcik } from '@/lib/ayar-kapilari';
import { Serit } from '@/components/ui/hal';
import { AyarKapsami, AyarlarSayfasi, aktifSirketAdi } from '@/components/ayar-kapsam';
import type { MemberRow } from '@/components/tenancy/team-manager';
import { KullaniciEkle, TeamScreen } from '@/components/tenancy/team-screen';
import { WorkspaceErisimi } from '@/components/tenancy/workspace-erisimi';
import { IkiAdimSirketAyari } from '@/components/tenancy/iki-adim-sirket-ayari';
import { dilAl } from '@/dil/sunucu';
import { ayarlarSozlugu } from '@/dil/sozlukler/ayarlar';

/** Sekme başlığı = menü satırı = sayfa başlığı, hepsi `ayarSekmesiAdi`ndan (`ayarlar.spec.ts`). */
export async function generateMetadata() {
  return { title: `${ayarSekmesiAdi('ekip', await dilAl())} · Advetics` };
}

interface ClientRow {
  id: string;
  name: string;
}

/** Hata mesajını çıkarır — platformun kendi cümlesi ekranda görünmeli. */
function hataMetni(e: unknown, yedek: string): string {
  return e instanceof ApiRequestError ? e.message : yedek;
}

/**
 * ═══ EKİP VE GÜVENLİK — EKİBİN TEK YERİ ═══
 *
 * Yetki MÜŞTERİ BAZINDA veriliyor: bir kişi A workspace'inde kampanya
 * yöneticisi, B'de yalnızca görüntüleyici olabilir. Bu sekme kişileri
 * (ajans personeli), bir workspace'in erişimini (`?workspace=`, müşterinin
 * kendi hesapları dahil), üst hesap ekibini, rol tablosunu ve şirketin iki
 * adımlı doğrulama kuralını taşıyor.
 *
 * EKİP TEK YERDE (MIMARI Ç-14). Workspace ekibi üç yerde düzenlenebiliyordu:
 * bu sayfa, `/ayarlar/musteriler/<id>/ekip` ve Marka Merkezi › Workspace
 * ayarları. İkincisi buraya yönleniyor, üçüncüsü salt okunur oldu ve
 * buraya bağlanıyor.
 *
 * KAPILAR `PANEL_KAPILARI`NDAN: kişi eklemek `ekip.yonet`, üst hesap ekibi
 * `ustHesapEkibi.yonet`, şirket 2FA kuralı `ikiAdim.sirketZorunlulugu`.
 * Kişisel 2FA bu sekmede DEĞİL, Hesabım'da (herkesin kendi hesabı).
 */
export default async function EkipSayfasi({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  if (!ayarSekmesiAcik(session, 'ekip')) redirect('/dashboard');
  const dil = await dilAl();
  const t = sec(ayarlarSozlugu, dil);
  const d = t.ekipSayfasi;
  const yedek = t.ortak.baglantiKurulamadi;
  const p = await searchParams;
  const secili = (Array.isArray(p.workspace) ? p.workspace[0] : p.workspace) ?? null;

  const ekipYonetir = kapi(session, 'ekip.yonet');
  const sirket2fa = kapi(session, 'ikiAdim.sirketZorunlulugu');

  /*
   * HATA YUTULMUYOR (`.catch(() => [])` yasak): "henüz yok", "yüklenemedi"
   * ve "yetkin yok" aynı boş ekrana çevriliyordu; canlıda "Danışman ata"
   * listesi boş göründü ve kullanıcı hiç kimsenin olmadığını sandı. Sebep
   * ekranda yazıyor ve diğer bölümler çalışmaya devam ediyor.
   */
  const [uyeSonuc, workspaceSonuc, agacSonuc, ustEkipSonuc, ikiAdimSonuc] = await Promise.allSettled([
    serverApiFetch<MemberRow[]>('/members'),
    serverApiFetch<ClientRow[]>('/clients'),
    /* `?? null` ÇAĞRININ YANINDA: uç `null` döndüğünde gövde boş geliyor. */
    serverApiFetch<ManagerAccountTree | null>('/manager-account').then((x) => x ?? null),
    session.managerAccount
      ? serverApiFetch<UstHesapUyesi[]>('/manager-account/members').then((x) => x ?? [])
      : Promise.resolve<UstHesapUyesi[]>([]),
    sirket2fa ? serverApiFetch<IkiAdimDurumu>('/auth/2fa') : Promise.resolve<IkiAdimDurumu | null>(null),
  ]);

  const members = uyeSonuc.status === 'fulfilled' ? (uyeSonuc.value ?? []) : [];
  const clients = workspaceSonuc.status === 'fulfilled' ? (workspaceSonuc.value ?? []) : [];

  /*
   * ŞİRKET LİSTESİ — "Danışman ata" penceresi buraya yetki veriyor. Üst
   * hesap yoksa TEK ELEMANLI kuruluyor: pencere tek bir şekil biliyor.
   */
  const agac = agacSonuc.status === 'fulfilled' ? (agacSonuc.value ?? null) : null;
  const sirketler = agac
    ? agac.organizations.map((o) => ({ id: o.id, name: o.name }))
    : [{ id: session.activeOrganizationId, name: session.organization.name }];

  const ustHesap = session.managerAccount
    ? {
        hesapAdi: session.managerAccount.name,
        uyeler: ustEkipSonuc.status === 'fulfilled' ? ustEkipSonuc.value : [],
        yonetebilir: kapi(session, 'ustHesapEkibi.yonet'),
        yuklemeHatasi: ustEkipSonuc.status === 'rejected' ? hataMetni(ustEkipSonuc.reason, yedek) : null,
      }
    : null;

  const yuklemeHatalari = [
    uyeSonuc.status === 'rejected' ? d.ekipListesi(hataMetni(uyeSonuc.reason, yedek)) : null,
    workspaceSonuc.status === 'rejected' ? d.workspaceListesi(hataMetni(workspaceSonuc.reason, yedek)) : null,
    agacSonuc.status === 'rejected' ? d.sirketListesi(hataMetni(agacSonuc.reason, yedek)) : null,
    ikiAdimSonuc.status === 'rejected' ? d.ikiAdimAyari(hataMetni(ikiAdimSonuc.reason, yedek)) : null,
  ].filter((x): x is string => x !== null);

  return (
    <AyarlarSayfasi
      session={session}
      ust={<AyarKapsami duzey="sirket" ad={aktifSirketAdi(session)} />}
      baslik={ayarSekmesiAdi('ekip', dil)}
      aciklama={d.aciklama}
      /* BÖLÜMÜN BİRİNCİL EYLEMİ BAŞLIĞIN SAĞINDA; kapı kapalıysa sebebi listenin altında. */
      eylemler={ekipYonetir ? <KullaniciEkle clients={clients} /> : undefined}
    >
      {yuklemeHatalari.length > 0 && (
        <Serit ton="hata" baslik={d.bazilariOkunamadi}>
          {yuklemeHatalari.join(' · ')}
        </Serit>
      )}

      {/* Kişiler (#kisiler), üst hesap ekibi (#ust-hesap-ekibi) ve roller (#roller) bu bileşenin içinde. */}
      <TeamScreen
        members={members}
        clients={clients}
        sirketler={sirketler}
        currentUserId={session.user.id}
        canManage={ekipYonetir}
        ustHesap={ustHesap}
      />
      {!ekipYonetir && <p className="m-0 text-12 text-ink-muted">{kapiNedeni('ekip.yonet', dil)}</p>}

      <WorkspaceErisimi
        workspaceler={clients}
        secili={secili}
        currentUserId={session.user.id}
        yonetebilir={ekipYonetir}
        neden={kapiNedeni('ekip.yonet', dil)}
      />

      <section id="iki-adim-zorunlulugu" className="scroll-mt-24">
        {!sirket2fa ? (
          <Serit ton="bilgi" baslik={d.ikiAdim}>
            {kapiNedeni('ikiAdim.sirketZorunlulugu', dil)}
          </Serit>
        ) : ikiAdimSonuc.status === 'fulfilled' && ikiAdimSonuc.value ? (
          <IkiAdimSirketAyari durum={ikiAdimSonuc.value} />
        ) : null}
      </section>
    </AyarlarSayfasi>
  );
}
