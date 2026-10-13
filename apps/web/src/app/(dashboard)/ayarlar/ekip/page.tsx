import { redirect } from 'next/navigation';
import type { IkiAdimDurumu, ManagerAccountTree, UstHesapUyesi } from '@advetics/shared';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { PANEL_KAPILARI, kapi } from '@/lib/panel-adresleri';
import { ayarSekmesiAcik } from '@/lib/ayar-kapilari';
import { SayfaBasligi } from '@/components/ui/sayfa-basligi';
import { AyarKapsami, aktifSirketAdi } from '@/components/ayar-kapsam';
import type { MemberRow } from '@/components/tenancy/team-manager';
import { TeamScreen } from '@/components/tenancy/team-screen';
import { WorkspaceErisimi } from '@/components/tenancy/workspace-erisimi';
import { IkiAdimSirketAyari } from '@/components/tenancy/iki-adim-sirket-ayari';

export const metadata = { title: 'Ekip ve güvenlik · Advetics' };

interface ClientRow {
  id: string;
  name: string;
}

/** Hata mesajını çıkarır — platformun kendi cümlesi ekranda görünmeli. */
function hataMetni(e: unknown): string {
  return e instanceof ApiRequestError ? e.message : 'Bağlantı kurulamadı';
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
        yuklemeHatasi: ustEkipSonuc.status === 'rejected' ? hataMetni(ustEkipSonuc.reason) : null,
      }
    : null;

  const yuklemeHatalari = [
    uyeSonuc.status === 'rejected' ? `Ekip listesi: ${hataMetni(uyeSonuc.reason)}` : null,
    workspaceSonuc.status === 'rejected' ? `Workspace listesi: ${hataMetni(workspaceSonuc.reason)}` : null,
    agacSonuc.status === 'rejected' ? `Şirket listesi: ${hataMetni(agacSonuc.reason)}` : null,
    ikiAdimSonuc.status === 'rejected' ? `İki adımlı doğrulama ayarı: ${hataMetni(ikiAdimSonuc.reason)}` : null,
  ].filter((x): x is string => x !== null);

  return (
    /* 7xl: üye kartları ızgarada; TAM GENİŞLİK DEĞİL, rol metinleri satır başına fazla karakter alırdı. */
    <div className="mx-auto max-w-7xl space-y-6">
      <SayfaBasligi
        ust={<AyarKapsami duzey="sirket" ad={aktifSirketAdi(session)} />}
        baslik="Ekip ve güvenlik"
        aciklama="Danışmanlar şirketlere yetkilendirilir ve o şirketin bütün workspace’lerini görür. Müşteri hesapları tek bir workspace’e bağlı kalır."
      />

      {yuklemeHatalari.length > 0 && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger-strong">
          {yuklemeHatalari.map((h) => (
            <p key={h}>{h}</p>
          ))}
        </div>
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
      {!ekipYonetir && <p className="text-xs text-ink-muted">{PANEL_KAPILARI['ekip.yonet'].neden}</p>}

      <WorkspaceErisimi
        workspaceler={clients}
        secili={secili}
        currentUserId={session.user.id}
        yonetebilir={ekipYonetir}
        neden={PANEL_KAPILARI['ekip.yonet'].neden}
      />

      <section id="iki-adim-zorunlulugu" className="scroll-mt-4">
        {!sirket2fa ? (
          <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-muted">
            İki adımlı doğrulama: {PANEL_KAPILARI['ikiAdim.sirketZorunlulugu'].neden}
          </p>
        ) : ikiAdimSonuc.status === 'fulfilled' && ikiAdimSonuc.value ? (
          <IkiAdimSirketAyari durum={ikiAdimSonuc.value} />
        ) : null}
      </section>
    </div>
  );
}
