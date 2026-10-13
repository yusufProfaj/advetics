import {
  KURULUM_PLATFORMLARI,
  PAKET_SINIRLARI,
  paketAsildiMi,
  type ConnectionSummary,
  type EmailAccountSummary,
  type HazirlamaYaniti,
  type IkiAdimDurumu,
  type KurulumYaniti,
  type ProviderAvailability,
  type WorkspaceHazirlik,
} from '@advetics/shared';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { requireSession, type SessionResponse } from '@/lib/session';
import { beyanlariOku, type BeyanOkumasi } from '@/lib/kurulum-beyanlari';
import { adimYetkileri } from '@/lib/kurulum-yetkileri';
import { workspaceUyumu } from '@/lib/sayfa-workspace';
import { ACILIS_ADI, PANEL_YOLLARI, SIHIRBAZ_ADI, ayarlarAdresi, kapi, sirketKurulumListesi } from '@/lib/panel-adresleri';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Uyari } from '@/components/ui/uyari';
import { dugmeSinifi } from '@/components/ui/dugme';
import { SayfaBasligi } from '@/components/ui/sayfa-basligi';
import { WorkspaceGec } from '@/components/workspace-gec';
import { KurulumSihirbazi } from '@/components/kurulum/kurulum-sihirbazi';
import { SirketSec } from '@/components/kurulum/sirket-sec';
import { Baslangic } from '@/components/kurulum/baslangic';
import { Tamamlama, type TamamlamaVerisi } from '@/components/kurulum/tamamlama';
import { ADIMLAR, adimOku, turOku, type SecimKarti } from '@/components/kurulum/kurulum-akisi';
import { sihirbazModu, yanittakiBeyanlar } from '@/components/kurulum/sihirbaz-akisi';
import type { Sonuc } from '@/components/marka-merkezi/kurulum-listesi';
import type { WorkspaceDetay } from '@/components/marka-merkezi/workspace-bilgileri';

/*
 * ADI "KURULUM SİHİRBAZI" (`SIHIRBAZ_ADI`, 2026-10-13). Bir süre "Yeni şirket
 * / workspace aç" (`ACILIS_ADI`) idi: Marka Merkezi › Kurulum ile karışmasın
 * diye. Artık iki ekran AYNI listenin iki görünümü (liste ve adım adım) ve
 * karışma sebebi kalktı; `ACILIS_ADI` açılış hâlinin başlığı olarak duruyor.
 * Adres (`/kurulum`) yer imleri kırılmasın diye aynı.
 *
 * Sekme başlığı sabitten TÜRÜYOR: elle yazılmış dize, ad bir gün yeniden
 * değişince sekmede eski adı göstermeye devam ederdi (CLAUDE.md "aynı
 * ekranın menüde ve sayfada iki ayrı adı oluyor").
 */
export const metadata = { title: `${SIHIRBAZ_ADI} · Advetics` };
export const dynamic = 'force-dynamic';

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function hataMetni(e: unknown): string {
  return e instanceof ApiRequestError ? e.message : 'Bağlantı kurulamadı';
}

async function oku<T>(yol: string): Promise<Sonuc<T>> {
  return serverApiFetch<T>(yol).then(
    (v) => ({ ok: true as const, v }),
    (e: unknown) => ({ ok: false as const, hata: hataMetni(e) }),
  );
}

/**
 * ═══ KURULUM SİHİRBAZI — TEK SAYFA, ÜÇ HÂL (docs/kurulum-sihirbazi/MIMARI.md § 3) ═══
 *
 *   · `?musteri=&adim=` → TAMAMLAMA: solda şirketin 2 ve workspace'in 10
 *     adımı, sağda geçerli adım, sonunda "Hiç eksik yok".
 *   · `?tur=`           → AÇILIŞ: üst hesap / şirket / workspace AÇAR; son
 *     adımı yeni workspace'e geçip tamamlamaya döner.
 *   · hiçbiri           → BAŞLANGIÇ: "ne yapmak istiyorsun?".
 *
 * MÜŞTERİ HESABI SİHİRBAZI GÖRMEZ (dört ekran kuralı, MIMARI § 8): kurulum
 * ajansın işi; Marka Merkezi'ni göremeyen kullanıcı Genel Bakış'a döner.
 */
export default async function KurulumPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  if (!kapi(session, 'markaMerkezi.gor')) redirect('/dashboard');

  const mod = sihirbazModu({ musteri: first(params.musteri), tur: first(params.tur), adim: first(params.adim) });
  const kartlar = secimKartlari(session);

  if (mod.tur === 'acilis') return acilis(session, kartlar, mod.acilisTuru, mod.adim);
  if (mod.tur === 'baslangic') return baslangic(session, kartlar);

  const clientId = mod.musteri;
  const uyum = workspaceUyumu(session, clientId);
  const hedefAdi = session.availableClients.find((c) => c.id === clientId)?.name ?? null;
  const baslik = <SayfaBasligi baslik={SIHIRBAZ_ADI} />;
  /*
   * ADRES ≠ SEÇİM: üstte BAŞKA workspace seçiliyken RLS adresteki
   * workspace'in satırlarını gizliyor; içerik hiç okunmuyor ve tek tıkla
   * geçiş öneriliyor (Marka Merkezi'nin deseni, MIMARI Ç-8). Otomatik
   * geçiş YOK: seçim bütün sekmeleri etkiliyor.
   */
  if (uyum === 'farkli') {
    return (
      <div className="space-y-5">
        {baslik}
        <WorkspaceGec
          clientId={clientId}
          workspaceAdi={hedefAdi}
          aktifAdi={session.availableClients.find((c) => c.id === session.activeClientId)?.name ?? null}
          ekran={SIHIRBAZ_ADI}
          uyum={uyum}
        />
      </div>
    );
  }

  const epostaAcik = kapi(session, 'eposta.duzenle');
  const [kurulum, hazirlama, hazirlik, detay, baglantilar, uygunluk, ikiAdim, sirketYaniti, eposta] = await Promise.all([
    oku<KurulumYaniti>(`/clients/${clientId}/kurulum`),
    oku<HazirlamaYaniti>(`/clients/${clientId}/hazirlama`),
    oku<WorkspaceHazirlik>(`/clients/${clientId}/hazirlik`),
    oku<WorkspaceDetay>(`/clients/${clientId}`),
    /*
     * PARAMETRESİZ (MIMARI Ç-2): `?clientId=` dalı bağlantıyı "bu workspace'e
     * atanmış hesabı olan" diye süzüyor ve YENİ bir workspace'te ajansın
     * bağlantısını GİZLİYOR — şirket adımı "bağlantı yok" deyip kullanıcıyı
     * ajansın kimliğini yeniden yetkilendirmeye gönderirdi.
     */
    oku<ConnectionSummary[]>('/connections'),
    oku<ProviderAvailability[]>('/connections/availability'),
    oku<IkiAdimDurumu>('/auth/2fa'),
    oku<unknown>('/kurulum/sirket'),
    /* `?? null`: ayar yoksa uç BOŞ GÖVDE ile 200 dönüyor ve istemci `undefined` veriyor. */
    epostaAcik ? oku<EmailAccountSummary | null>('/me/email-account') : Promise.resolve(null),
  ]);
  const beyanlar = await beyanlariOku(serverApiFetch, clientId, kurulum.ok ? kurulum.v : null);

  const veri: TamamlamaVerisi = {
    kurulum,
    hazirlama,
    hazirlik,
    beyanlar,
    detay,
    baglantilar: baglantilar.ok ? { ok: true, v: baglantilar.v ?? [] } : baglantilar,
    uygunluk: uygunluk.ok ? { ok: true, v: uygunluk.v ?? [] } : uygunluk,
    ikiAdim,
    sirketBeyanlari: sirketBeyanlari(sirketYaniti),
    eposta: eposta === null ? 'yetkisiz' : !eposta.ok ? null : !eposta.v ? false : eposta.v.verifiedAt !== null,
  };

  const workspaceAdi =
    (detay.ok ? detay.v.name : null) ?? (kurulum.ok ? kurulum.v.workspaceAdi : null) ?? hedefAdi ?? 'Workspace';
  const sirket =
    session.managerAccount?.organizations.find((o) => o.id === (detay.ok ? detay.v.orgId : session.activeOrganizationId))?.name ??
    session.organization.name;
  const adim = mod.adim;

  return (
    <div className="space-y-5">
      <SayfaBasligi
        ust={
          <nav aria-label="Konum" className="flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
            <span>{sirket}</span>
            <span aria-hidden="true">›</span>
            <span className="font-semibold text-ink">{workspaceAdi}</span>
          </nav>
        }
        baslik={SIHIRBAZ_ADI}
        aciklama="Şirketin ve workspace’in reklam vermeye hazır olması için gereken her şey, sırayla. Bitmiş adımlar atlanır ama gösterilir."
      />
      <Tamamlama
        clientId={clientId}
        workspaceAdi={workspaceAdi}
        sirketAdi={sirket}
        veri={veri}
        ilkAdim={adim}
        yetki={{
          ...adimYetkileri(session),
          baglantiYetkilendir: kapi(session, 'baglanti.yetkilendir'),
          ikiAdimYonet: kapi(session, 'ikiAdim.sirketZorunlulugu'),
          sirketBeyan: kapi(session, 'sirketKurulum.beyan'),
        }}
        aktifDegil={session.activeClientId !== clientId}
        ajansAdresi={session.user.email}
        ustBant={
          uyum === 'secimYok' ? (
            <WorkspaceGec clientId={clientId} workspaceAdi={hedefAdi} aktifAdi={null} ekran={SIHIRBAZ_ADI} uyum="secimYok" />
          ) : null
        }
      />
    </div>
  );
}

/**
 * ŞİRKET BEYANLARI `GET /kurulum/sirket` yanıtında (MIMARI § 7, Ajan 2).
 * Uç okunamazsa ya da alan yoksa OKUNAMADI — "beyan yok" değil: iki adımlı
 * doğrulama kararını vermiş bir yöneticiye aynı soruyu yeniden sormak olurdu.
 */
function sirketBeyanlari(s: Sonuc<unknown>): BeyanOkumasi {
  if (!s.ok) return s;
  const b = yanittakiBeyanlar(s.v);
  return b ? { ok: true, v: b } : { ok: false, hata: 'Şirket beyanları yanıtta yok.' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Başlangıç
// ─────────────────────────────────────────────────────────────────────────────

async function baslangic(session: SessionResponse, kartlar: SecimKarti[]) {
  const sirketAdi =
    session.managerAccount?.organizations.find((o) => o.id === session.activeOrganizationId)?.name ?? session.organization.name;
  const [workspaceler, baglantilar, uygunluk, ikiAdim, sirketYaniti] = await Promise.all([
    oku<Array<{ id: string; name: string; status: string }>>('/clients'),
    oku<ConnectionSummary[]>('/connections'),
    oku<ProviderAvailability[]>('/connections/availability'),
    oku<IkiAdimDurumu>('/auth/2fa'),
    oku<unknown>('/kurulum/sirket'),
  ]);
  const sb = sirketBeyanlari(sirketYaniti);
  /*
   * BAŞLANGIÇTA WORKSPACE SEÇİLMEDİ: iki platform da "kullanılıyor" sayılır.
   * Şirket adımı burada yalnız GÖSTERİLİYOR; hüküm workspace seçilince o
   * workspace'in platform beyanıyla veriliyor (tamamlama).
   */
  const sirketAdimlari = sirketKurulumListesi({
    baglantilar: baglantilar.ok ? (baglantilar.v ?? []) : null,
    uygunluk: uygunluk.ok ? (uygunluk.v ?? []) : null,
    kullanilanPlatformlar: KURULUM_PLATFORMLARI,
    ikiAdimZorunlu: ikiAdim.ok ? (ikiAdim.v.secilenSirket?.zorunlu ?? null) : null,
    beyanlar: sb.ok ? sb.v : null,
  });
  return (
    <div className="space-y-5">
      <SayfaBasligi
        ust={<span className="text-sm text-ink-muted">{sirketAdi}</span>}
        baslik={SIHIRBAZ_ADI}
        aciklama="Yeni şirket ve workspace açar, var olanı kaldığı yerden tamamlar."
      />
      <Baslangic
        sirketAdi={sirketAdi}
        sirketAdimlari={sirketAdimlari}
        workspaceler={workspaceler.ok ? (workspaceler.v ?? []).filter((w) => w.status === 'active').map((w) => ({ id: w.id, name: w.name })) : []}
        workspaceHatasi={workspaceler.ok ? null : workspaceler.hata}
        aktifClientId={session.activeClientId}
        kartlar={kartlar}
        platformYazabilir={kapi(session, 'kurulum.yaz')}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Açılış — üst hesap / şirket / workspace AÇAR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * KAPILAR `PANEL_KAPILARI`NDAN. Üst hesap ve şirket açmak `sirket.yonet`
 * (servis `assertOrgAdmin` istiyor), workspace `workspace.ekle`.
 *
 * AJANSA BAĞLI ŞİRKETİN ADMİNİ — üst hesap üyeliği YOK, `ma` onda `null`.
 * `ma === null` iki ayrı hâl: bağımsız şirket (kendi ajansını kurabilir) ile
 * bir ajansın müşteri şirketi (kuramaz). Ayıran `organization.ustHesabaBagli`.
 */
function secimKartlari(session: SessionResponse): SecimKarti[] {
  const sirketAcar = kapi(session, 'sirket.yonet');
  const ma = session.managerAccount;
  const sirketAdi =
    ma?.organizations.find((o) => o.id === session.activeOrganizationId)?.name ?? session.organization.name;
  const sinir = ma ? PAKET_SINIRLARI[ma.paket] : null;
  const ajansaBagli = !session.platformAdmin && ma === null && session.organization.ustHesabaBagli;
  return [
    {
      tur: 'ust-hesap',
      baslik: 'Yeni üst hesap',
      aciklama: 'Yeni bir ajans ya da danışmanlık. İlk şirketi ve workspace’i de birlikte kurarsın.',
      engel: !sirketAcar
        ? 'Bunun için yönetici yetkisi gerekiyor.'
        : ajansaBagli
          ? 'Bu şirket bir ajansın üst hesabına bağlı.'
          : !session.platformAdmin && ma !== null
            ? 'Zaten bir üst hesabın var. Yeni şirket ekleyebilirsin.'
            : null,
    },
    {
      tur: 'sirket',
      baslik: 'Yeni şirket',
      aciklama: ma
        ? `${ma.name} altında yeni bir firma ve ilk workspace’i.`
        : 'Üst hesabın altında yeni bir firma ve ilk workspace’i.',
      engel: !sirketAcar
        ? 'Bunun için yönetici yetkisi gerekiyor.'
        : ajansaBagli
          ? 'Yeni şirketi bağlı olduğun ajans açabiliyor.'
          : ma === null || sinir === null
            ? 'Önce bir üst hesap kurmalısın.'
            : paketAsildiMi(sinir.maxSirket, ma.organizations.length)
              ? `${sinir.etiket} paketi en fazla ${sinir.maxSirket} şirkete izin veriyor.`
              : null,
    },
    {
      tur: 'workspace',
      baslik: 'Yeni workspace',
      aciklama: session.tumSirketler
        ? 'Bir şirketin içinde yeni bir marka ya da proje.'
        : `${sirketAdi} içinde yeni bir marka ya da proje.`,
      engel: kapi(session, 'workspace.ekle') ? null : 'Workspace kurma yetkin yok.',
    },
  ];
}

/**
 * ENGEL YALNIZCA İLK ADIMDA SINANIYOR. "Zaten bir üst hesabın var" ya da
 * "paket dolu" kuralı, üst hesabı ya da şirketi az önce KURMUŞ kullanıcıyı
 * da yakalardı: sihirbaz kurduktan sonra platform adımına tam sayfa
 * dönüyor ve o an kurallar artık "dolu" diyor. Asıl kapı sunucuda.
 */
async function acilis(session: SessionResponse, kartlar: SecimKarti[], hamTur: string, hamAdim: string | null) {
  const tur = turOku(hamTur);
  // TANINMAYAN TÜR BAŞLANGICA (eski yer imi): boş bir form çizmek yerine seçim ekranı.
  if (tur === null) redirect(PANEL_YOLLARI.acilis);
  const ilkAdim = adimOku(tur, hamAdim);
  const kart = kartlar.find((k) => k.tur === tur);
  const ilkAdimda = ilkAdim === ADIMLAR[tur][0];
  const sihirbazAcik = !(ilkAdimda && kart?.engel);
  const ma = session.managerAccount;
  const sirketAdi =
    ma?.organizations.find((o) => o.id === session.activeOrganizationId)?.name ?? session.organization.name;

  const baslik = (
    <header>
      <h1 className="sayfa-baslik">{kart?.baslik ?? ACILIS_ADI}</h1>
      <p className="mt-1.5 max-w-prose text-sm text-ink-muted">
        {kart?.aciklama} Workspace açılınca aynı sihirbaz hesapları, ölçümü ve markayı adım adım tamamlar.
      </p>
    </header>
  );

  /*
   * KAPALI TÜR: sebep yazıyor ve kullanıcı geldiği yere dönebiliyor; kart
   * gidince sebep sessizce kaybolmamalı.
   */
  if (!sihirbazAcik) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        {baslik}
        <Uyari
          ton="uyari"
          baslik="Bu kurulum şu an açılamıyor."
          eylem={
            <Link href={ayarlarAdresi('sirketler')} className={dugmeSinifi('ikincil', 'kucuk')}>
              Ayarlara dön
            </Link>
          }
        >
          {kart?.engel}
        </Uyari>
      </div>
    );
  }

  if (tur === 'workspace' && session.tumSirketler && ma) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        {baslik}
        <SirketSec sirketler={ma.organizations.map((o) => ({ id: o.id, name: o.name }))} />
      </div>
    );
  }

  /*
   * BAĞLANTILAR YALNIZCA GEREKTİĞİNDE ÇEKİLİYOR. Üst hesap ve şirket
   * adımlarında bağlantı listesi ESKİ şirketin listesi (yeni şirket henüz
   * yok); o adımlar bittiğinde sayfa zaten tam yenileniyor.
   *
   * HATA YUTULMUYOR: "hiç bağlantı yok" ile "liste okunamadı" aynı boş
   * ekrana çevrilirse kullanıcı var olan bağlantısını yeniden kurmaya
   * çalışır. PARAMETRESİZ (Ç-2).
   */
  let uygunluk: ProviderAvailability[] = [];
  let baglantilar: ConnectionSummary[] = [];
  let yuklemeHatasi: string | null = null;
  if (ilkAdim !== 'ust-hesap' && ilkAdim !== 'sirket') {
    const [u, b] = await Promise.allSettled([
      serverApiFetch<ProviderAvailability[]>('/connections/availability'),
      serverApiFetch<ConnectionSummary[]>('/connections'),
    ]);
    uygunluk = u.status === 'fulfilled' ? (u.value ?? []) : [];
    baglantilar = b.status === 'fulfilled' ? (b.value ?? []) : [];
    yuklemeHatasi =
      u.status === 'rejected' ? hataMetni(u.reason) : b.status === 'rejected' ? hataMetni(b.reason) : null;
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      {baslik}
      <KurulumSihirbazi
        tur={tur}
        ilkAdim={ilkAdim}
        baglam={{
          platformAdmin: session.platformAdmin,
          ustHesapAdi: ma?.name ?? null,
          sirketAdi,
          baglantiYonetebilir: kapi(session, 'baglanti.yetkilendir'),
        }}
        uygunluk={uygunluk}
        baglantilar={baglantilar}
        yuklemeHatasi={yuklemeHatasi}
      />
    </div>
  );
}
