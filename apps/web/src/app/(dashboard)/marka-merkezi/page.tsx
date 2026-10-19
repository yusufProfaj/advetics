import Link from 'next/link';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { ayarSekmesiAdi, kapiNedeni, markaBolumuAdi, sec, type ClientChannels, HazirlamaYaniti, KurulumYaniti, SpecialAdCategory, WorkspaceHazirlik } from '@advetics/shared';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { beyanGirdisi, beyanlariOku } from '@/lib/kurulum-beyanlari';
import { adimYetkileri } from '@/lib/kurulum-yetkileri';
import { requireSession } from '@/lib/session';
import { sayfaWorkspaceId, workspaceSecimVerisi, workspaceUyumu } from '@/lib/sayfa-workspace';
import { butceAdresi } from '@/lib/butce-adresi';
import {
  PANEL_YOLLARI,
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
import { KURULUM_EYLEM_YUVASI } from '@/components/marka-merkezi/baslik-yuvasi';
import { rozetMetni } from '@/components/marka-merkezi/kurulum-listesi-mantik';
import { VeriKaynaklari } from '@/components/marka-merkezi/veri-kaynaklari';
import { WorkspaceBilgileri, type WorkspaceDetay } from '@/components/marka-merkezi/workspace-bilgileri';
import { AiDoldur } from '@/components/bilgi-bankasi/ai-doldur';
import { MarkaSekmesi } from '@/components/bilgi-bankasi/marka-sekmesi';
import { MetinSekmesi } from '@/components/bilgi-bankasi/metin-sekmesi';
import { LogoSekmesi } from '@/components/bilgi-bankasi/logo-sekmesi';
import { dilAl } from '@/dil/sunucu';
import { markaMerkeziSozlugu } from '@/dil/sozlukler/marka-merkezi';
import { menuSatiriEtiketi } from '@/lib/nav-sections';

export async function generateMetadata() {
  return { title: `${menuSatiriEtiketi(PANEL_YOLLARI.markaMerkezi, await dilAl())} · Advetics` };
}
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
  const dil = await dilAl();
  const d = sec(markaMerkeziSozlugu, dil).sayfa;
  // Sayfa adı menünün kendi çevirisinden: iki dilde de menüyle aynı.
  const sayfaAdi = menuSatiriEtiketi(PANEL_YOLLARI.markaMerkezi, dil);
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
        <SayfaBasligi bolum="Base" baslik={sayfaAdi} />
        <Uyari ton="uyari" baslik={kapiNedeni('markaMerkezi.gor', dil)}>{d.yoneticineSor}</Uyari>
      </div>
    );
  }

  const clientId = sayfaWorkspaceId(session, first(params.musteri));
  if (!clientId) {
    return (
      <WorkspaceGerekli
        ekran={sayfaAdi}
        neden={d.workspaceNedeni}
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
        ekran={sayfaAdi}
        uyum={uyum}
      />
    );
  if (uyum === 'farkli') {
    return (
      <div className="space-y-5">
        <SayfaBasligi bolum="Base" baslik={sayfaAdi} />
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
    oku<KurulumYaniti>(`/clients/${clientId}/kurulum`, d.sunucuyaUlasilamadi),
    oku<HazirlamaYaniti>(`/clients/${clientId}/hazirlama`, d.sunucuyaUlasilamadi),
    oku<WorkspaceHazirlik>(`/clients/${clientId}/hazirlik`, d.sunucuyaUlasilamadi),
    oku<WorkspaceDetay>(`/clients/${clientId}`, d.sunucuyaUlasilamadi),
    bolum === 'kurulum' ? oku<ClientChannels>(`/clients/${clientId}/channels`, d.sunucuyaUlasilamadi) : Promise.resolve(null),
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

  /*
   * IZGARALARIN HEPSİ `grid-cols-1`: sütunu yazılmamış `grid` örtük bir `auto`
   * sütun açıyor ve o sütun en geniş çocuğun min-content'inden DARALMIYOR.
   * Veri durumu'ndaki son işler tablosu (min 46 rem) `overflow-x-auto` içinde
   * olduğu hâlde 375 piksellik telefonda sayfa 780 piksel çiziliyordu
   * (2026-10-19, canlı): kaydırma kabı kendi içeriğinin genişliğini ataya
   * bildiriyor. `grid-cols-1` = `minmax(0, 1fr)`, sütun ekrana sığıyor ve
   * tablo kendi kabında kayıyor (`marka-merkezi-tasma.spec.ts`).
   */
  return (
    <div className="grid grid-cols-1 gap-6">
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
        baslik={sayfaAdi}
        aciklama={
          <>
            <strong className="font-semibold text-ink">{sirket ? `${sirket} › ${workspaceAdi}` : workspaceAdi}</strong>
            {d.aciklama}
          </>
        }
        // Birincil eylem ("Eksikleri tamamla") Kurulum listesinin durumunu
        // taşıyor; liste düğmeleri bu yuvaya portal ile çiziyor.
        eylemler={bolum === 'kurulum' ? <div id={KURULUM_EYLEM_YUVASI} className="flex flex-wrap items-center gap-2" /> : undefined}
      />

      <SayfaIcDuzen menu={<IcMenu clientId={clientId} aktif={bolum} rozetler={rozetler} dil={dil} />}>
        {/* `key` BÖLÜMDEN: aynı ağaç korunursa geçiş animasyonu bir daha oynamaz. */}
        <div key={bolum} className="bolum-gecis grid min-w-0 grid-cols-1 content-start gap-5">
          {bolum === 'kurulum' && (
            <section aria-labelledby="kurulum-baslik" className="grid grid-cols-1 gap-4">
              <BolumBasligi
                id="kurulum-baslik"
                baslik={markaBolumuAdi('kurulum', dil)}
                aciklama={d.kurulumAciklama}
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

              <section id="kanallar" aria-labelledby="kanallar-baslik" className="grid scroll-mt-24 grid-cols-1 gap-3">
                <BolumBasligi
                  id="kanallar-baslik"
                  baslik={d.kanallarBaslik}
                  aciklama={d.kanallarAciklama}
                  altBaslik
                />
                {kanallar === null ? null : !kanallar.ok ? (
                  <Serit ton="hata" baslik={d.kanallarAlinamadi}>
                    {kanallar.hata}
                  </Serit>
                ) : kapi(session, 'hesap.ata') ? (
                  <BagliKanallar data={kanallar.v} ajansUyesi={session.managerAccount !== null} />
                ) : (
                  <SaltOkunurKanallar data={kanallar.v} neden={kapiNedeni('hesap.ata', dil)} bos={d.salt.bos} baslik={d.salt.baslik} />
                )}
                <p className="text-12 text-ink-muted">
                  {d.baglantiYoksa}{' '}
                  <Link href={platformBaglantilariAdresi()} className={KART_BAGLANTISI}>
                    {d.ayarlar} › {ayarSekmesiAdi('baglantilar', dil)}
                  </Link>
                </p>
              </section>

              <section id="veri-kaynaklari" className="grid scroll-mt-24 grid-cols-1 gap-2">
                <p className="text-12 text-ink-muted">{d.istegeBagli}</p>
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
            <section aria-labelledby="marka-baslik" className="grid grid-cols-1 gap-4">
              <BolumBasligi
                id="marka-baslik"
                baslik={markaBolumuAdi('marka', dil)}
                aciklama={d.markaAciklama}
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
                  baslik={d.markayiAnlatBaslik}
                  aciklama={d.markayiAnlatAciklama}
                  placeholder={d.markayiAnlatOrnek}
                />
              </Capa>
              <Capa id="kime-satiyoruz">
                <MetinSekmesi
                  clientId={clientId}
                  canWrite={kapi(session, 'marka.yaz')}
                  alan="hedefKitle"
                  baslik={d.kimeSatiyoruzBaslik}
                  aciklama={d.kimeSatiyoruzAciklama}
                  placeholder={d.kimeSatiyoruzOrnek}
                />
              </Capa>
              <Capa id="logo">
                {kapi(session, 'varliklar.gor') ? (
                  <LogoSekmesi clientId={clientId} canWrite={kapi(session, 'logo.yaz')} />
                ) : (
                  <UiKart baslik="Logo">
                    <p className="m-0 text-13 text-ink-muted">{kapiNedeni('varliklar.gor', dil)}</p>
                  </UiKart>
                )}
              </Capa>
            </section>
          )}

          {bolum === 'workspace' && (
            <section aria-labelledby="workspace-baslik" className="grid grid-cols-1 gap-4">
              <BolumBasligi
                id="workspace-baslik"
                baslik={markaBolumuAdi('workspace', dil)}
                aciklama={d.workspaceAciklama}
              />
              <WorkspaceBilgileri clientId={clientId} session={session} detay={detay} />
            </section>
          )}
        </div>
      </SayfaIcDuzen>
    </div>
  );
}

async function oku<T>(yol: string, ulasilamadi: string): Promise<Sonuc<T>> {
  return serverApiFetch<T>(yol).then(
    (v) => ({ ok: true as const, v }),
    (e: unknown) => ({ ok: false as const, hata: e instanceof ApiRequestError ? e.message : ulasilamadi }),
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
function SaltOkunurKanallar({ data, neden, bos, baslik }: { data: ClientChannels; neden: string; bos: string; baslik: string }) {
  const bagli = data.groups.flatMap((g) => g.connected.map((i) => ({ ...i, kind: g.kind })));
  if (bagli.length === 0) {
    return <BosDurum baslik={bos} neden={neden} />;
  }
  return (
    <UiKart dolgu={false} baslik={baslik} baslikEki={`${bagli.length}`}>
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
