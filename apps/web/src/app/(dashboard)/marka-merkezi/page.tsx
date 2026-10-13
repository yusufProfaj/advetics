import Link from 'next/link';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import type { ClientChannels, HazirlamaYaniti, KurulumYaniti, SpecialAdCategory, WorkspaceHazirlik } from '@advetics/shared';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { beyanGirdisi, beyanlariOku } from '@/lib/kurulum-beyanlari';
import { adimYetkileri } from '@/lib/kurulum-yetkileri';
import { requireSession } from '@/lib/session';
import { sayfaWorkspaceId, workspaceSecimVerisi, workspaceUyumu } from '@/lib/sayfa-workspace';
import { butceAdresi } from '@/lib/butce-adresi';
import {
  PANEL_KAPILARI,
  eskiMarkaMerkeziYonu,
  kapi,
  kurulumListesi,
  kurulumSayaci,
  markaMerkeziAdresi,
  markaMerkeziBolumu,
  platformBaglantilariAdresi,
  type MarkaMerkeziBolumKodu,
} from '@/lib/panel-adresleri';
import { WorkspaceGerekli } from '@/components/workspace-gerekli';
import { WorkspaceGec } from '@/components/workspace-gec';
import { SayfaBasligi } from '@/components/ui/sayfa-basligi';
import { Uyari } from '@/components/ui/uyari';
import { KART_BAGLANTISI, Kart as UiKart } from '@/components/ui/kart';
import { BosDurum, Serit } from '@/components/ui/hal';
import { SayfaIcDuzen } from '@/components/ui/sayfa-ic-menu';
import { BagliKanallar } from '@/components/tenancy/bagli-kanallar';
import { IcMenu, type BolumRozetleri } from '@/components/marka-merkezi/ic-menu';
import { sirketAdi } from '@/components/marka-merkezi/bolumler';
import { EskiCapaYonlendirici } from '@/components/marka-merkezi/eski-capa';
import { KurulumListesi, type Sonuc } from '@/components/marka-merkezi/kurulum-listesi';
import { rozetMetni } from '@/components/marka-merkezi/kurulum-listesi-mantik';
import { VeriKaynaklari } from '@/components/marka-merkezi/veri-kaynaklari';
import { WorkspaceBilgileri, type WorkspaceDetay } from '@/components/marka-merkezi/workspace-bilgileri';
import { AiDoldur } from '@/components/bilgi-bankasi/ai-doldur';
import { MarkaSekmesi } from '@/components/bilgi-bankasi/marka-sekmesi';
import { MetinSekmesi } from '@/components/bilgi-bankasi/metin-sekmesi';
import { LogoSekmesi } from '@/components/bilgi-bankasi/logo-sekmesi';

export const metadata = { title: 'Marka Merkezi · Advetics' };
export const dynamic = 'force-dynamic';

/**
 * ═══ MARKA MERKEZİ — YALNIZ SEÇİLİ WORKSPACE (docs/panel-sadelestirme/MIMARI.md) ═══
 *
 * Üç bölüm: Kurulum (tek sıralı liste, tek sayaç), Marka, Workspace
 * bilgileri. Görseller, kreatifler, formlar ve kitleler AYRI menü satırında
 * (Base › Varlıklar); şirket ve ajans düzeyi her şey Ayarlar'da. Başlık
 * "Şirket › Workspace": kullanıcı hangi workspace'in kurulumunu
 * değiştirdiğini sayfanın adından önce görmeli.
 *
 * TEK KAPI (`MARKA_MERKEZI_IZNI`): eskiden bölüm başına ayrı görünme kapısı
 * vardı (Kurulum `client.read`, Bağlantılar `client.write`, Bildirimler
 * `rule.read`) ve aynı kişi menüde Marka Merkezi'ni görüp içeride farklı
 * bölüm kümesine düşüyordu. Kartların ve eylemlerin kapısı `PANEL_KAPILARI`.
 *
 * ESKİ ADRESLER: `?bolum=butce` Planla › Aylık Bütçe'ye; eski bölüm kodları
 * (`baglantilar`, `olcum`, `kitleler`, `varliklar`, `ayarlar`, `bildirimler`)
 * TEK eşlemeyle (`eskiMarkaMerkeziYonu`) yeni yerine; eski çapalar
 * istemcide (`EskiCapaYonlendirici`).
 */
export default async function MarkaMerkeziPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const hamBolum = first(params.bolum);
  const musteriParam = first(params.musteri);

  // AYLIK BÜTÇE PLANLA'DA (2026-10-09); yönün tek üreticisi panelde.
  if (hamBolum === 'butce') redirect(butceAdresi(musteriParam, { ay: first(params.ay) }));
  const eski = eskiMarkaMerkeziYonu(hamBolum, {
    musteri: musteriParam,
    varlik: first(params.varlik),
    tur: first(params.tur),
    form: first(params.form),
  });
  if (eski) redirect(eski);

  if (!kapi(session, 'markaMerkezi.gor')) {
    return (
      <div className="space-y-5">
        <SayfaBasligi bolum="Base" baslik="Marka Merkezi" />
        <Uyari ton="uyari" baslik={PANEL_KAPILARI['markaMerkezi.gor'].neden}>
          Workspace’in kurulumu ve marka bilgileri ajans tarafında düzenleniyor. Yöneticine sor.
        </Uyari>
      </div>
    );
  }

  const clientId = sayfaWorkspaceId(session, first(params.musteri));
  if (!clientId) {
    return (
      <WorkspaceGerekli
        ekran="Marka Merkezi"
        neden="Marka Merkezi bir workspace’in kurulumunu, markasını ve bilgilerini gösteriyor."
        {...workspaceSecimVerisi(session)}
      />
    );
  }

  // Tanınmayan bölüm ilk bölüme (Kurulum) düşer; eski kodlar yukarıda yönlendi.
  const bolum: MarkaMerkeziBolumKodu = markaMerkeziBolumu(hamBolum) ?? 'kurulum';

  /*
   * ADRES ≠ SEÇİM (`workspaceUyumu`): üstte BAŞKA workspace seçiliyken RLS
   * adresteki workspace'in satırlarını gizliyor ve sayfa B'nin başlığıyla
   * BOŞ kartlar çiziyordu. O hâlde içerik hiç okunmuyor (beş uç, hazırlık
   * tetikleyicisi dahil) ve tek tıkla geçiş öneriliyor.
   */
  const uyum = workspaceUyumu(session, clientId);
  const hedefAdi = session.availableClients.find((c) => c.id === clientId)?.name ?? null;
  const gecis =
    uyum === 'ayni' ? null : (
      <WorkspaceGec
        clientId={clientId}
        workspaceAdi={hedefAdi}
        aktifAdi={session.availableClients.find((c) => c.id === session.activeClientId)?.name ?? null}
        ekran="Marka Merkezi"
        uyum={uyum}
      />
    );
  if (uyum === 'farkli') {
    return (
      <div className="space-y-5">
        <SayfaBasligi bolum="Base" baslik="Marka Merkezi" />
        {gecis}
      </div>
    );
  }

  /*
   * ROZET VE LİSTE AYNI ÜÇ YANITTAN. Kurulum rozeti her bölümde görünüyor,
   * yani üç uç her sayfada okunuyor; ikinci bir sayaç (ör. yalnız hazırlık)
   * yazmak, eski üç ayrışan sayının birini geri getirmek olurdu.
   */
  const [kurulum, hazirlama, hazirlik, detay, kanallar] = await Promise.all([
    oku<KurulumYaniti>(`/clients/${clientId}/kurulum`),
    oku<HazirlamaYaniti>(`/clients/${clientId}/hazirlama`),
    oku<WorkspaceHazirlik>(`/clients/${clientId}/hazirlik`),
    oku<WorkspaceDetay>(`/clients/${clientId}`),
    bolum === 'kurulum' ? oku<ClientChannels>(`/clients/${clientId}/channels`) : Promise.resolve(null),
  ]);
  /*
   * BEYANLAR ROZETE DE GİRİYOR (kurulum sihirbazı, MIMARI § 6 "geçiciler"):
   * okunmasalardı "adresimiz yok" denmiş bir workspace'in rozeti sonsuza
   * kadar "eksik" derdi ve sihirbaz "hiç eksik yok" derken menü 9 / 10
   * gösterirdi — iki ekranın aynı sayıyı söylemesi bu modülün sözü.
   */
  const beyanlar = await beyanlariOku(serverApiFetch, clientId);

  const sayac = kurulumSayaci(
    kurulumListesi({
      kurulum: kurulum.ok ? kurulum.v : null,
      hazirlama: hazirlama.ok ? hazirlama.v : null,
      hazirlik: hazirlik.ok ? hazirlik.v : null,
      kullanilmayanlar: kurulum.ok ? kurulum.v.kullanilmayanPlatformlar : [],
      beyanlar: beyanGirdisi(beyanlar),
    }),
  );
  const rozetler: BolumRozetleri = { kurulum: rozetMetni(sayac) };

  const workspaceAdi =
    (detay.ok ? detay.v.name : null) ??
    (hazirlik.ok ? hazirlik.v.clientName : null) ??
    session.availableClients.find((c) => c.id === clientId)?.name ??
    'Workspace';
  const sirket = sirketAdi(session, detay.ok ? detay.v.orgId : null);

  return (
    <div className="grid gap-6">
      <EskiCapaYonlendirici bolum={bolum} musteri={clientId} />
      {gecis}
      {/*
        BAŞLIK MENÜ ADININ AYNISI ("Marka Merkezi", nav-sections bekçisi);
        hangi workspace'in kurulumunu değiştirdiğini ise açıklamanın İLK
        sözcükleri söylüyor: "Şirket › Workspace". Eskiden başlığın kendisi
        "Şirket › Workspace"ti ve menüde "Marka Merkezi"ne tıklayan kullanıcı
        sayfada o adı hiç görmüyordu. Bölüm kırıntısı kalktı: seçili bölüm yan
        menüde, sayfa adı üst çubuğun kırıntısında.
      */}
      <SayfaBasligi
        bolum="Base"
        baslik="Marka Merkezi"
        aciklama={
          <>
            <strong className="font-semibold text-ink">{sirket ? `${sirket} › ${workspaceAdi}` : workspaceAdi}</strong>
            {': kurulumu, markası ve bilgileri. Reklamlar, raporlar ve AI asistan buradan okur.'}
          </>
        }
      />

      <SayfaIcDuzen menu={<IcMenu clientId={clientId} aktif={bolum} rozetler={rozetler} />}>
        {/* `key` BÖLÜMDEN: aynı ağaç korunursa geçiş animasyonu bir daha oynamaz. */}
        <div key={bolum} className="bolum-gecis grid min-w-0 content-start gap-5">
          {bolum === 'kurulum' && (
            <section aria-labelledby="kurulum-baslik" className="grid gap-4">
              <BolumBasligi
                id="kurulum-baslik"
                baslik="Kurulum"
                aciklama="Reklam hesapları, ölçüm, marka ve varsayılanlar tek listede. Sistem yapabileceğini tek düğmeyle tamamlar; size kalanı nedeniyle yazar."
              />
              <KurulumListesi
                clientId={clientId}
                ilk={{ kurulum, hazirlama, hazirlik, beyanlar }}
                kategoriler={detay.ok ? ((detay.v.specialAdCategories ?? []) as SpecialAdCategory[]) : null}
                detay={detay.ok ? detay.v : null}
                yetki={adimYetkileri(session)}
                ajansAdresi={session.user.email}
                workspaceAdi={workspaceAdi}
                aktifDegil={session.activeClientId !== clientId}
              />

              <section id="kanallar" aria-labelledby="kanallar-baslik" className="grid scroll-mt-24 gap-3">
                <BolumBasligi
                  id="kanallar-baslik"
                  baslik="Bu workspace’in hesapları ve kanalları"
                  aciklama="Atanmış reklam hesapları, sayfalar ve kanallar; izleme buradan açılır. Sayaca girmez."
                  altBaslik
                />
                {kanallar === null ? null : !kanallar.ok ? (
                  <Serit ton="hata" baslik="Hesaplar ve kanallar alınamadı.">
                    {kanallar.hata}
                  </Serit>
                ) : kapi(session, 'hesap.ata') ? (
                  <BagliKanallar data={kanallar.v} ajansUyesi={session.managerAccount !== null} />
                ) : (
                  <SaltOkunurKanallar data={kanallar.v} neden={PANEL_KAPILARI['hesap.ata'].neden} />
                )}
                <p className="text-12 text-ink-muted">
                  Platform bağlantısı yoksa ya da yetkisi düştüyse:{' '}
                  <Link href={platformBaglantilariAdresi()} className={KART_BAGLANTISI}>
                    Ayarlar › Platform bağlantıları
                  </Link>
                </p>
              </section>

              <section id="veri-kaynaklari" className="grid scroll-mt-24 gap-2">
                <p className="text-12 text-ink-muted">İsteğe bağlı; sayaca girmez.</p>
                <VeriKaynaklari
                  clientId={clientId}
                  yonetebilir={kapi(session, 'veriKaynagi.yonet')}
                  yazabilir={kapi(session, 'veriKaynagi.yaz')}
                  haric={['ga4']}
                />
              </section>
            </section>
          )}

          {bolum === 'marka' && (
            <section aria-labelledby="marka-baslik" className="grid gap-4">
              <BolumBasligi
                id="marka-baslik"
                baslik="Marka"
                aciklama="AdvCampaign ve AI asistan bu alanları okur. Doldurduğun bilgi bir daha sorulmaz."
              />
              {/* DOLDUR KARTLARIN ÜSTÜNDE: taslak dört kartı birden dolduruyor. */}
              <AiDoldur clientId={clientId} canWrite={kapi(session, 'marka.yaz')} />
              <Capa id="marka-bilgileri">
                <MarkaSekmesi clientId={clientId} canWrite={kapi(session, 'marka.yaz')} />
              </Capa>
              <Capa id="markayi-anlat">
                <MetinSekmesi
                  clientId={clientId}
                  canWrite={kapi(session, 'marka.yaz')}
                  alan="bilgiBankasi"
                  baslik="Markayı anlat"
                  aciklama="Ne satıyor, hangi hizmetleri veriyor, sık sorulan sorular. Reklam metni ve AI bu metni bağlam olarak okuyor."
                  placeholder="Örn. 20 yıllık emlak ofisiyiz. Konut satışı ve kiralama yapıyoruz; İzmir Bornova ve Karşıyaka'da ofisimiz var."
                />
              </Capa>
              <Capa id="kime-satiyoruz">
                <MetinSekmesi
                  clientId={clientId}
                  canWrite={kapi(session, 'marka.yaz')}
                  alan="hedefKitle"
                  baslik="Kime satıyoruz"
                  aciklama="Düz dille. Konum, yaş ve ilgi gibi teknik hedefleme Varlıklar › Kitleler’de."
                  placeholder="Örn. İzmir ve çevresinde, 25-45 yaş arası, ev almayı düşünen aileler."
                />
              </Capa>
              <Capa id="logo">
                {kapi(session, 'varliklar.gor') ? (
                  <LogoSekmesi clientId={clientId} canWrite={kapi(session, 'logo.yaz')} />
                ) : (
                  <UiKart baslik="Logo">
                    <p className="m-0 text-13 text-ink-muted">{PANEL_KAPILARI['varliklar.gor'].neden}</p>
                  </UiKart>
                )}
              </Capa>
            </section>
          )}

          {bolum === 'workspace' && (
            <section aria-labelledby="workspace-baslik" className="grid gap-4">
              <BolumBasligi
                id="workspace-baslik"
                baslik="Workspace bilgileri"
                aciklama="İletişim ve firma bilgileri, bu workspace’i görenler, bildirim kanalları ve veri durumu."
              />
              <WorkspaceBilgileri clientId={clientId} session={session} detay={detay} />
            </section>
          )}
        </div>
      </SayfaIcDuzen>
    </div>
  );
}

async function oku<T>(yol: string): Promise<Sonuc<T>> {
  return serverApiFetch<T>(yol).then(
    (v) => ({ ok: true as const, v }),
    (e: unknown) => ({ ok: false as const, hata: e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.' }),
  );
}

/**
 * Bölümün kendi başlığı (h2): sayfa başlığı "Marka Merkezi", bölüm adı yan
 * menüde seçili; bu satır bölümün NE İŞE YARADIĞINI bir cümleyle söylüyor.
 * Boy ölçeği referanstan (18 / 15), elle `text-lg` değil.
 */
function BolumBasligi({ id, baslik, aciklama, altBaslik = false }: { id: string; baslik: string; aciklama: string; altBaslik?: boolean }) {
  const Etiket = altBaslik ? 'h3' : 'h2';
  return (
    <div>
      <Etiket id={id} className={`font-baslik m-0 font-bold text-ink ${altBaslik ? 'text-15' : 'text-18'}`}>
        {baslik}
      </Etiket>
      <p className="m-0 mt-1 text-13 text-ink-muted">{aciklama}</p>
    </div>
  );
}

/**
 * ÇAPA KABI: alt başlık bağlantıları (`#marka-bilgileri`…) buraya atlıyor;
 * üst bar altında kalmasın diye `scroll-mt`. Kartın KENDİSİ içerideki
 * bileşende (`Kart` kalıbı, başlık + sağ altta Kaydet): çerçeveyi burada
 * çizmek kart içinde kart üretiyordu.
 */
function Capa({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-24">
      {children}
    </div>
  );
}

/** Atama yetkisi olmayan için liste: ne bağlı, neden değiştiremiyor. */
function SaltOkunurKanallar({ data, neden }: { data: ClientChannels; neden: string }) {
  const bagli = data.groups.flatMap((g) => g.connected.map((i) => ({ ...i, kind: g.kind })));
  if (bagli.length === 0) {
    return <BosDurum baslik="Bu workspace’e bağlı hesap ya da kanal yok." neden={neden} />;
  }
  return (
    <UiKart dolgu={false} baslik="Bağlı hesaplar ve kanallar" baslikEki={`${bagli.length}`}>
      <ul className="m-0 list-none divide-y divide-line p-0">
        {bagli.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-3 text-13">
            <span className="min-w-0 truncate font-semibold text-ink">{i.name}</span>
            <span className="shrink-0 text-12 text-ink-muted tabular-nums" translate="no">
              {i.externalId}
            </span>
          </li>
        ))}
      </ul>
      <p className="m-0 border-t border-line px-5 py-3 text-12 text-ink-muted">{neden}</p>
    </UiKart>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
