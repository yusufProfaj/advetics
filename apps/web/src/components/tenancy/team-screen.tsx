'use client';

import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  ROL_ETIKETI,
  SIRKET_ROLLERI,
  isOrgScopedRole,
  type Role,
  type UstHesapUyesi,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { ROLE_TR, kapsamRolleri, type MemberRow } from '@/components/tenancy/team-manager';
import { RolAciklamasi, RolMatrisi } from '@/components/tenancy/rol-matrisi';
import { UstHesapEkibi } from '@/components/tenancy/ust-hesap-ekibi';
import { atamalariYurut, type AtamaSonucu } from '@/components/tenancy/danisman-atama';
import { Dugme } from '@/components/ui/dugme';
import { Kart } from '@/components/ui/kart';
import { Alan, Girdi, Secim } from '@/components/ui/alan';
import { BosDurum, Serit } from '@/components/ui/hal';
import { Rozet } from '@/components/ui/rozet';
import { AdHucresi, AracCubugu, Tablo, type TabloSutunu } from '@/components/ui/tablo';
import { BolumluSecici } from '@/components/ui/sekmeler';
import { Pencere, YanPanel } from '@/components/ui/pencere';
import { MenuOgesi } from '@/components/ui/acilir-menu';
import { DigerMenusu } from '@/components/ayar-sekmeleri';

interface ClientOption {
  id: string;
  name: string;
}

/**
 * EKİP EKRANI — KİŞİLER TABLODA, ERİŞİM YAN PANELDE.
 *
 * İKİ AYRI KÜME ve ayrımı ROL belirliyor:
 *   · AJANS PERSONELİ — reklamcılar ve yöneticiler; şirketlere ve
 *     workspace'lere yetkilendirilebiliyor.
 *   · MÜŞTERİ HESABI — `client_viewer`; sınırı tek bir workspace.
 *
 * Ayrım e-posta alan adına BAKMIYOR: ajans personeline bir müşteride rol
 * verilebiliyor ve müşteri tarafından biri asla org geneli üyelik almıyor.
 */
interface KisiSatiri extends MemberRow {
  /** Ajans personeli mi — müşterinin kendi giriş hesabı değil. */
  ajans: boolean;
}

/**
 * ═══ EKİP VE GÜVENLİK — TABLO + YAN PANEL (taslak `#ayarlar`) ═══
 *
 * ═══ ÖNCEKİ DÜZENLER NEDEN ÇALIŞMIYORDU ═══
 *
 * Önce üç "ekle" düğmesi yan yana duruyordu (Danışman ekle · Danışman ata ·
 * Kullanıcı ekle) ve altında BİRBİRİNDEN KOPUK iki liste vardı; kullanıcının
 * cümlesiyle "çok kötü gözüküyor ve mantıksız, kullanışsız duruyor". Sonra
 * Şirketler ekranıyla aynı ray + detay düzeni geldi: solda kişi rayı, sağda
 * seçili kişinin erişimi. Sayfa içi yan menü gelince (BILESENLER § 9) ekranda
 * ÜÇ SÜTUN oluştu (bölüm menüsü, ray, detay) ve detay dar ekranda ezildi.
 *
 * ═══ BUGÜN: GOOGLE ADS'İN "ERİŞİM VE GÜVENLİK" TABLOSU ═══
 *
 * Satır başına bir kişi: ad, rol, kapsam, iki adımlı doğrulama durumu, ⋯.
 * Ekranın sorduğu soru hâlâ "bu kişi NERELERE erişiyor" ve cevabı satıra
 * tıklayınca SAĞDAN açılan yan panelde: şirket yetkileri ve workspace
 * yetkileri ayrı başlıklarda, rol değiştirme ve kaldırma satırın yanında.
 *
 * ═══ TEK EKLEME DÜĞMESİ, SAYFA BAŞLIĞINDA ═══
 *
 * "Danışman ekle" ile "Kullanıcı ekle" AYNI işi yapıyordu; pencere zaten
 * rolü ve kapsamı soruyor. Düğme bölümün birincil eylemi olarak başlığın
 * sağında (`KullaniciEkle`). "Şirkete yetki ver" bir EKLEME değil, seçili
 * kişiye yetki verme işi: yeri o kişinin paneli ve satırın ⋯ menüsü.
 */
export interface UstHesapEkipVerisi {
  hesapAdi: string;
  uyeler: UstHesapUyesi[];
  yonetebilir: boolean;
  yuklemeHatasi: string | null;
}

type KisiTuru = 'tumu' | 'ajans' | 'musteri';

export function TeamScreen({
  members,
  clients,
  sirketler,
  currentUserId,
  canManage,
  ustHesap,
}: {
  members: MemberRow[];
  clients: ClientOption[];
  /** Üst hesabın altındaki ŞİRKETLER — şirket yetkisi buraya veriliyor. */
  sirketler: Array<{ id: string; name: string }>;
  currentUserId: string;
  canManage: boolean;
  /**
   * ÜST HESAP EKİBİ — üst hesap yoksa `null` ve bölüm hiç çizilmiyor.
   * Bağımsız bir şirkette "üst hesap ekibi" başlığı, olmayan bir özelliği
   * aratırdı.
   */
  ustHesap: UstHesapEkipVerisi | null;
}) {
  const [duzenlenen, setDuzenlenen] = useState<MemberRow | null>(null);
  const [atananKisi, setAtananKisi] = useState<MemberRow | null>(null);
  const [sifirlanan, setSifirlanan] = useState<MemberRow | null>(null);
  const [arama, setArama] = useState('');
  const [tur, setTur] = useState<KisiTuru>('tumu');
  const [secilenId, setSecilenId] = useState<string | null>(null);

  /*
   * AJANS PERSONELİ AYRIMI ROLE GÖRE — ÜYELİK KAPSAMINA GÖRE DEĞİL.
   *
   * İki sürüm boyunca kapsama bakıldı ("org geneli üyeliği var mı") ve ikisi
   * de yanlıştı: bir workspace'e ATANMIŞ DANIŞMAN ile o workspace'in MÜŞTERİ
   * HESABI kapsam açısından birebir aynı görünüyor. Ayırt eden şey ROL:
   * müşteriye teslim edilen hesap `client_viewer` olarak açılıyor.
   *
   * Kural sunucudaki `listMembers` süzgeciyle BİREBİR aynı — ikisinin
   * ayrışması, bir kullanıcının listede olup ekranda görünmemesi demekti ve
   * bu ekranda tam olarak o yaşandı.
   */
  const kisiler: KisiSatiri[] = useMemo(
    () =>
      members.map((m) => ({
        ...m,
        ajans:
          m.memberships.length === 0 ||
          m.memberships.some((x) => x.role !== 'client_viewer'),
      })),
    [members],
  );

  const q = arama.trim().toLocaleLowerCase('tr');
  const aranan = useMemo(
    () =>
      q === ''
        ? kisiler
        : kisiler.filter(
            (k) =>
              (k.fullName ?? '').toLocaleLowerCase('tr').includes(q) ||
              k.email.toLocaleLowerCase('tr').includes(q),
          ),
    [kisiler, q],
  );
  /*
   * TÜR SÜZGECİ GÖRÜNÜR BİR ÇİP, sessiz bir süzgeç DEĞİL: hangi kümenin
   * gösterildiği seçicide yazıyor ve kaç kişiden kaçının göründüğü tablonun
   * altında. Eski "kayıp kullanıcı" hatası (iki listeye de girmeyen kişi)
   * burada doğamaz: "Tümü" herkesi gösteriyor.
   */
  const suzulmus = useMemo(
    () => (tur === 'tumu' ? aranan : aranan.filter((k) => (tur === 'ajans' ? k.ajans : !k.ajans))),
    [aranan, tur],
  );

  /*
   * SEÇİM ARAMAYA BAĞLI DEĞİL: yan panel açıkken arama kutusuna yazılan
   * harf, panelde anlatılan kişiyi listeden çıkarsa bile panel kapanmıyor.
   * Kişi `kisiler`den aranıyor, süzülmüş listeden değil.
   *
   * PANEL BİR PENCERE AÇILINCA GERİ ÇEKİLİYOR: "Şirkete yetki ver" ya da
   * "Bilgileri düzenle" açıkken iki katman üst üste binmesin (Esc ikisini
   * birden kapatırdı); pencere kapanınca panel kaldığı yerden döner.
   */
  const secilen = kisiler.find((k) => k.id === secilenId) ?? null;
  const panelAcik = secilen !== null && atananKisi === null && duzenlenen === null && sifirlanan === null;

  const ajansSayisi = kisiler.filter((k) => k.ajans).length;

  const sutunlar: Array<TabloSutunu<KisiSatiri>> = [
    {
      anahtar: 'kisi',
      baslik: 'Kişi',
      hucre: (k) => (
        <AdHucresi
          ad={
            <>
              {k.fullName ?? k.email}
              {k.id === currentUserId && <span className="ml-1.5 text-12 font-normal text-ink-muted">(sen)</span>}
            </>
          }
          alt={k.email}
        />
      ),
    },
    { anahtar: 'rol', baslik: 'Rol', hucre: (k) => <span className="text-13">{rolOzeti(k)}</span> },
    {
      anahtar: 'kapsam',
      baslik: 'Kapsam',
      ikincil: true,
      hucre: (k) => <span className="text-13 text-ink-muted">{ozet(k)}</span>,
    },
    {
      anahtar: 'iki',
      baslik: 'İki adımlı',
      ikincil: true,
      /*
       * `mfaEnabled` gelmediyse (eski yanıt) "Kapalı" YAZILMIYOR:
       * bilinmeyeni "Kapalı" diye göstermek, açık bir korumayı yok sanıp
       * yöneticiyi boşuna kişinin peşine düşürürdü.
       */
      hucre: (k) =>
        k.mfaEnabled === undefined ? (
          <span className="text-12 text-ink-soluk">Bilinmiyor</span>
        ) : (
          <Rozet hal={k.mfaEnabled ? 'ok' : 'hata'}>{k.mfaEnabled ? 'Açık' : 'Kapalı'}</Rozet>
        ),
    },
    {
      anahtar: 'eylem',
      baslik: <span className="sr-only">Eylemler</span>,
      sayi: true,
      hucre: (k) => (
        /* SATIR TIKLAMASI PANELİ AÇIYOR; menünün tıklaması satıra taşmasın. */
        <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
          <DigerMenusu etiket={`${k.fullName ?? k.email} için işlemler`}>
            <MenuOgesi onClick={() => setSecilenId(k.id)}>Erişimleri yönet</MenuOgesi>
            {canManage && <MenuOgesi onClick={() => setDuzenlenen(k)}>Bilgileri düzenle</MenuOgesi>}
            {canManage && k.ajans && (
              <MenuOgesi onClick={() => setAtananKisi(k)}>Şirkete yetki ver</MenuOgesi>
            )}
            {canManage && k.id !== currentUserId && k.mfaEnabled === true && (
              <MenuOgesi tehlike onClick={() => setSifirlanan(k)}>
                İki adımlıyı sıfırla
              </MenuOgesi>
            )}
          </DigerMenusu>
        </span>
      ),
    },
  ];

  return (
    <div className="grid gap-5">
      {/*
        ÇAPALAR (`AYARLAR_CAPALARI.ekip`): Marka Merkezi'nin erişim listesi ve
        eski adres yönlendirmeleri bu kimliklere bağlanıyor.
      */}
      <div id="kisiler" className="scroll-mt-24">
        <Kart
          dolgu={false}
          baslik="Kişiler"
          /* SESSİZ KESME YOK: kaç kişi ve kaçının ajans personeli olduğu yazılı. */
          baslikEki={`${kisiler.length} kişi · ${ajansSayisi} ajans personeli · ${kisiler.length - ajansSayisi} müşteri hesabı`}
        >
          <Tablo
            etiket="Kişiler"
            sutunlar={sutunlar}
            satirlar={suzulmus}
            satirAnahtari={(k) => k.id}
            onSatir={(k) => setSecilenId(k.id)}
            aracCubugu={
              <AracCubugu
                sag={
                  (q !== '' || tur !== 'tumu') &&
                  kisiler.length > 0 && (
                    <span className="text-12 text-ink-muted">
                      {kisiler.length} kişiden {suzulmus.length} tanesi gösteriliyor
                    </span>
                  )
                }
              >
                <div className="w-full max-w-xs">
                  <Girdi
                    type="search"
                    value={arama}
                    onChange={(e) => setArama(e.target.value)}
                    placeholder="Ad ya da e-posta ara"
                    aria-label="Kişi ara"
                  />
                </div>
                <BolumluSecici
                  etiket="Kişi türü"
                  secili={tur}
                  onSec={setTur}
                  secenekler={[
                    { deger: 'tumu', etiket: 'Tümü' },
                    { deger: 'ajans', etiket: 'Ajans' },
                    { deger: 'musteri', etiket: 'Müşteri hesabı' },
                  ]}
                />
              </AracCubugu>
            }
            bos={
              <BosDurum
                baslik={kisiler.length === 0 ? 'Henüz kimse eklenmemiş' : 'Eşleşen kişi yok'}
                neden={
                  kisiler.length === 0
                    ? 'Başlıktaki “Kullanıcı ekle” ile ilk kişiyi aç.'
                    : `“${arama}” ve seçili tür ile eşleşen kişi yok. Süzgeci temizleyince bütün liste döner.`
                }
              />
            }
            sayfalama={{ bas: suzulmus.length === 0 ? 0 : 1, son: suzulmus.length, toplam: suzulmus.length }}
          />
        </Kart>
      </div>

      {ustHesap && (
        <div id="ust-hesap-ekibi" className="scroll-mt-24">
          <UstHesapEkibi
            hesapAdi={ustHesap.hesapAdi}
            uyeler={ustHesap.uyeler}
            yonetebilir={ustHesap.yonetebilir}
            yuklemeHatasi={ustHesap.yuklemeHatasi}
          />
        </div>
      )}

      {/*
        ROLLER LİSTENİN ALTINDA, HEP ERİŞİLEBİLİR: kullanıcı yetkilendirirken
        tabloyu görmek istedi. Özet kartlar hep açık, ayrıntılı tablo düğmeyle;
        rol seçicilerin altında aynı açıklama satırı (`RolAciklamasi`) var.
      */}
      <div id="roller" className="scroll-mt-24">
        <RolMatrisi />
      </div>

      <YanPanel
        acik={panelAcik}
        onKapat={() => setSecilenId(null)}
        baslik={secilen ? (secilen.fullName ?? secilen.email) : 'Kişi'}
        genislik={480}
      >
        {secilen && (
          <KisiDetayi
            kisi={secilen}
            clients={clients}
            sirketler={sirketler}
            kendisi={secilen.id === currentUserId}
            canManage={canManage}
            onDuzenle={() => setDuzenlenen(secilen)}
            onSirketYetkisi={() => setAtananKisi(secilen)}
            onIkiAdimSifirla={() => setSifirlanan(secilen)}
          />
        )}
      </YanPanel>

      <YanPanel
        acik={duzenlenen !== null}
        onKapat={() => setDuzenlenen(null)}
        baslik={duzenlenen ? `${duzenlenen.fullName ?? duzenlenen.email} · bilgileri` : 'Bilgiler'}
      >
        {duzenlenen && <UyeDuzenleModal member={duzenlenen} onKapat={() => setDuzenlenen(null)} />}
      </YanPanel>

      <Pencere acik={atananKisi !== null} onKapat={() => setAtananKisi(null)} baslik="Şirkete yetki ver">
        {atananKisi && (
          <DanismanAtaModal
            danismanlar={[atananKisi]}
            sirketler={sirketler}
            onKapat={() => setAtananKisi(null)}
          />
        )}
      </Pencere>

      <IkiAdimSifirla kisi={sifirlanan} onKapat={() => setSifirlanan(null)} />
    </div>
  );
}

/**
 * ═══ "KULLANICI EKLE" — BÖLÜMÜN BİRİNCİL EYLEMİ (sayfa başlığının sağı) ═══
 *
 * Düğme ve yan paneli BİR ARADA: başlık sunucuda çiziliyor, liste bu
 * bileşenin içinde. İkisini adres parametresiyle (`?yeni=kisi`)
 * bağlamak da olurdu; ama düğme ile formun aynı yerde durması, açık/kapalı
 * durumunun iki bileşen arasında ayrışmasını imkânsız kılıyor.
 */
export function KullaniciEkle({ clients }: { clients: ClientOption[] }) {
  const [acik, setAcik] = useState(false);
  return (
    <>
      <Dugme onClick={() => setAcik(true)}>+ Kullanıcı ekle</Dugme>
      <YanPanel acik={acik} onKapat={() => setAcik(false)} baslik="Kullanıcı ekle" genislik={440}>
        {acik && <KullaniciEkleModal clients={clients} onKapat={() => setAcik(false)} />}
      </YanPanel>
    </>
  );
}

/** Rol sütunu: kişinin rolleri TEK satırda. */
function rolOzeti(k: KisiSatiri): string {
  const ust = k.managerMemberships?.[0];
  if (ust) return `Üst hesap · ${ROL_ETIKETI[ust.role]}`;
  if (k.memberships.length === 0) return 'Yetkisi yok';
  return [...new Set(k.memberships.map((m) => ROLE_TR[m.role]))].join(', ');
}

/** Kapsam sütunu: kişinin erişimi TEK CÜMLEDE. */
function ozet(k: KisiSatiri): string {
  const ust = k.managerMemberships?.[0];
  if (ust) return 'Bütün şirketler';
  if (k.memberships.length === 0) return 'Hiçbir yer';
  const sirket = k.memberships.filter((m) => m.clientId === null).length;
  const workspace = k.memberships.length - sirket;
  const parcalar: string[] = [];
  if (sirket > 0) parcalar.push(`${sirket} şirket`);
  if (workspace > 0) parcalar.push(`${workspace} workspace`);
  return `${k.ajans ? 'Ajans' : 'Müşteri hesabı'} · ${parcalar.join(' · ')}`;
}

/**
 * SEÇİLİ KİŞİNİN ERİŞİMİ — ekranın asıl cevabı, yan panelin içi.
 *
 * ŞİRKET VE WORKSPACE YETKİLERİ AYRI BAŞLIKLAR ALTINDA. Aynı düz listede
 * durduklarında `clientId: null` bir satır ile bir workspace satırı görsel
 * olarak AYIRT EDİLEMİYORDU — oysa biri o şirketin tamamını, diğeri tek bir
 * workspace'i açıyor ve aradaki fark bu ekranın bütün konusu.
 */
function KisiDetayi({
  kisi,
  clients,
  sirketler,
  kendisi,
  canManage,
  onDuzenle,
  onSirketYetkisi,
  onIkiAdimSifirla,
}: {
  kisi: KisiSatiri;
  clients: ClientOption[];
  sirketler: Array<{ id: string; name: string }>;
  kendisi: boolean;
  canManage: boolean;
  onDuzenle: () => void;
  onSirketYetkisi: () => void;
  onIkiAdimSifirla: () => void;
}) {
  const sirketYetkileri = kisi.memberships.filter((m) => m.clientId === null);
  const workspaceYetkileri = kisi.memberships.filter((m) => m.clientId !== null);

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <p className="m-0 break-all text-13 text-ink-muted">{kisi.email}</p>
        <p className="m-0 text-13 text-ink-muted">
          {kisi.ajans
            ? 'Ajans personeli. Şirketlere ve workspace’lere yetkilendirilebilir.'
            : 'Müşteri hesabı. Yalnızca tek bir workspace’e bağlı kalır.'}
        </p>
        {canManage && (
          <div>
            <Dugme ton="ikincil" boyut="kucuk" onClick={onDuzenle}>
              Bilgileri düzenle
            </Dugme>
          </div>
        )}
      </div>

      <IkiAdimSatiri kisi={kisi} kendisi={kendisi} canManage={canManage} onSifirla={onIkiAdimSifirla} />

      {/* YETKİSİZ HESAP SESSİZ KALMIYOR: giriş yapabiliyor ama panelde
          hiçbir veri göremiyor ve sebebi yalnızca burada yazılı. */}
      {/*
        ÜST HESAP ÜYELİĞİ ÖNCE SORULUYOR. Üst hesaba eklenen Yönetici'nin bu
        şirkette hiç üyelik satırı yok; ona "yetkisi yok" demek bütün
        şirketleri yöneten kişi için en yanlış cümle ve bu ekranda yaşandı.
      */}
      {kisi.managerMemberships && kisi.managerMemberships.length > 0 ? (
        <Serit ton="bilgi" baslik={`Üst hesapta ${ROL_ETIKETI[kisi.managerMemberships[0].role]}`}>
          Bu üst hesabın altındaki bütün şirketlere erişiyor. Değiştirmek için “Üst hesap ekibi” bölümünü kullan.
        </Serit>
      ) : (
        kisi.memberships.length === 0 && (
          <Serit baslik="Bu hesabın hiçbir yetkisi yok">
            Bu hesap giriş yapabiliyor ama panelde hiçbir şey göremiyor.
          </Serit>
        )
      )}

      <YetkiBolumu
        baslik="Şirket yetkileri"
        aciklama="Bir şirkete verilen yetki o şirketin BÜTÜN workspace’lerini açar; tek tek atama gerekmiyor."
        uyelikler={sirketYetkileri}
        etiket={(m) => sirketler.find((o) => o.id === m.orgId)?.name ?? 'Şirket'}
        kendisi={kendisi}
        canManage={canManage}
        bos="Şirket geneli yetkisi yok."
        eylem={
          canManage && kisi.ajans ? (
            <Dugme ton="ikincil" boyut="kucuk" onClick={onSirketYetkisi}>
              + Şirkete yetki ver
            </Dugme>
          ) : null
        }
      />

      <YetkiBolumu
        baslik="Workspace yetkileri"
        aciklama="Tek bir workspace’e verilen erişim. Müşteri hesapları yalnızca burada bulunur."
        uyelikler={workspaceYetkileri}
        /*
         * AD ÖNCE ÜYELİĞİN KENDİSİNDEN. `client` ilişkisi uçtan geliyor ve
         * BAŞKA ŞİRKETTEKİ bir workspace'in adını da taşıyor; `clients`
         * listesi ise yalnızca AKTİF şirketin workspace'leri. Yalnızca
         * listeye bakmak, başka şirkette yetkisi olan bir danışmanda
         * "Workspace" yazan anonim satırlar gösterirdi.
         */
        etiket={(m) =>
          m.client?.name ?? clients.find((c) => c.id === m.clientId)?.name ?? 'Workspace'
        }
        kendisi={kendisi}
        canManage={canManage}
        bos="Tek bir workspace’e verilmiş yetki yok."
        eylem={null}
      />
    </div>
  );
}

/**
 * Bir yetki kümesi — rol değiştirme ve kaldırma satırın yanında.
 *
 * İKİ BÖLÜM AYNI BİLEŞENDEN: şirket ve workspace yetkileri farklı ŞEYLER
 * ama aynı işlemleri alıyor (rolü değiştir, kaldır). İki kopya yazmak,
 * birinde bir gün "kendi yetkini değiştiremezsin" kuralının unutulması
 * demekti.
 */
function YetkiBolumu({
  baslik,
  aciklama,
  uyelikler,
  etiket,
  kendisi,
  canManage,
  bos,
  eylem,
}: {
  baslik: string;
  aciklama: string;
  uyelikler: MemberRow['memberships'];
  etiket: (m: MemberRow['memberships'][number]) => string;
  kendisi: boolean;
  canManage: boolean;
  bos: string;
  eylem: ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function calistir(anahtar: string, fn: () => Promise<unknown>): Promise<void> {
    setBusy(anahtar);
    setHata(null);
    try {
      await fn();
      startTransition(() => router.refresh());
    } catch (e) {
      // HATA YUTULMUYOR: sessizce başarısız olan bir yetki değişikliği,
      // kullanıcının verdiğini sandığı bir erişim demek.
      setHata(e instanceof ApiRequestError ? e.message : 'İşlem başarısız oldu.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="grid gap-2 border-t border-line pt-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-baslik m-0 text-14 font-bold text-ink">
            {baslik}
            <span className="ml-2 text-12 font-normal text-ink-muted">{uyelikler.length}</span>
          </h3>
          <p className="m-0 mt-0.5 text-12 text-ink-muted">{aciklama}</p>
        </div>
        {eylem}
      </div>

      {hata && (
        <Serit ton="hata" baslik="Yetki değişmedi">
          {hata}
        </Serit>
      )}

      {uyelikler.length === 0 ? (
        <p className="m-0 text-13 text-ink-muted">{bos}</p>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {uyelikler.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-alan border border-line px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-13 font-semibold text-ink">{etiket(m)}</span>

              <span className="w-44">
                <Secim
                  aria-label={`${etiket(m)} rolü`}
                  value={m.role}
                  disabled={!canManage || busy !== null || isPending || kendisi}
                  onChange={(e) =>
                    void calistir(`r-${m.id}`, () =>
                      apiFetch(`/memberships/${m.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ role: e.target.value }),
                      }),
                    )
                  }
                >
                  {/* KAPSAMA GÖRE LİSTE: şirket satırında Müşteri yok, workspace
                      satırında Yönetici yok (gerekçe `roles.ts`). */}
                  {kapsamRolleri(m.clientId ?? '').map((r) => (
                    <option key={r} value={r}>
                      {ROLE_TR[r]}
                    </option>
                  ))}
                </Secim>
              </span>

              {canManage && (
                <Dugme
                  ton="hayalet"
                  boyut="kucuk"
                  disabled={busy !== null || isPending || kendisi}
                  bekliyor={busy === `d-${m.id}`}
                  onClick={() =>
                    void calistir(`d-${m.id}`, () =>
                      apiFetch(`/memberships/${m.id}`, { method: 'DELETE' }),
                    )
                  }
                >
                  Kaldır
                </Dugme>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* KENDİ YETKİNİ DEĞİŞTİREMİYORSUN: tek yöneticinin kendini
          düşürmesi, panelden geri alınamayan bir kilitlenme. */}
      {kendisi && uyelikler.length > 0 && (
        <p className="m-0 text-12 text-ink-muted">Kendi yetkini bu ekrandan değiştiremezsin.</p>
      )}
    </section>
  );
}

/**
 * KULLANICI EKLEME — yan panelin içi.
 *
 * Form ekranın üstünde sabit duruyordu ve her açılışta yer kaplıyordu; oysa
 * kullanıcı eklemek seyrek bir iş. Ortak `YanPanel` (portal, odak tuzağı,
 * Esc, `role="dialog"`) içinde açılıyor.
 */
function KullaniciEkleModal({
  clients,
  onKapat,
}: {
  clients: ClientOption[];
  onKapat: () => void;
}) {
  const router = useRouter();
  const [ad, setAd] = useState('');
  const [eposta, setEposta] = useState('');
  const [parola, setParola] = useState('');
  const [rol, setRol] = useState<Role>('ad_manager');
  const [clientId, setClientId] = useState('');
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  /*
   * ORG GENELİ ARTIK `client_viewer` DIŞINDA HERKESE AÇIK.
   *
   * Önce `rol === 'owner' || rol === 'admin'` yazıyordu ve rol adları
   * BURAYA KOPYALANMIŞTI. Kural genişleyince (danışman şirket seviyesinde
   * yetkilendirilebilmeli) bu kopya geride kalır ve ekran, sunucunun
   * kabul ettiği bir seçeneği kapalı gösterirdi. Artık aynı kaynaktan
   * okunuyor: `ORG_SCOPED_ROLES`.
   */
  const orgGeneliOlabilir = isOrgScopedRole(rol);

  async function gonder(): Promise<void> {
    setBusy(true);
    setHata(null);
    try {
      await apiFetch('/members', {
        method: 'POST',
        body: JSON.stringify({
          email: eposta.trim(),
          fullName: ad.trim(),
          password: parola,
          role: rol,
          clientId: clientId === '' ? null : clientId,
        }),
      });
      router.refresh();
      onKapat();
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Kullanıcı eklenemedi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      {/* DAVET GÖNDERİLMİYOR ve bu bir kısıt: e-posta altyapısı yok.
          Kullanıcıya söylenmezse parolayı nasıl ileteceğini bilemez. */}
      <Serit ton="bilgi" baslik="Kullanıcı anında oluşur">
        Kullanıcı anında oluşur, davet gönderilmiyor. Parolayı sen belirliyorsun ve kullanıcıya kendin iletiyorsun.
      </Serit>

      <Alan etiket="Ad soyad">
        <Girdi value={ad} onChange={(e) => setAd(e.target.value)} />
      </Alan>
      <Alan etiket="E-posta">
        <Girdi type="email" value={eposta} onChange={(e) => setEposta(e.target.value)} />
      </Alan>
      <Alan etiket="Parola" ipucu="En az 12 karakter.">
        <Girdi type="password" value={parola} onChange={(e) => setParola(e.target.value)} />
      </Alan>

      <Alan etiket="Rol" ipucu={<RolAciklamasi rol={rol} />}>
        <Secim
          value={rol}
          onChange={(e) => {
            const yeni = e.target.value as Role;
            setRol(yeni);
            /*
             * MÜŞTERİ HESABINA GEÇİLİNCE KAPSAM ZORUNLU OLUYOR.
             * `client_viewer` şirket seviyesinde olamaz (müşterinin kendi
             * giriş hesabı, sınırı workspace); seçim boş kalırsa sunucu
             * reddeder ve sebebi ekranda görünmezdi.
             */
            if (!isOrgScopedRole(yeni) && clientId === '') setClientId('');
          }}
        >
          {kapsamRolleri(clientId).map((r) => (
            <option key={r} value={r}>
              {ROLE_TR[r]}
            </option>
          ))}
        </Secim>
      </Alan>

      <Alan etiket="Kapsam">
        <Secim
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value);
            // Kapsam değişince rol listesi değişiyor; eski seçim yeni listede
            // yoksa ilkine düşülüyor — yoksa seçici boş görünür.
            if (!kapsamRolleri(e.target.value).includes(rol)) {
              setRol(kapsamRolleri(e.target.value)[0]);
            }
          }}
        >
          <option value="" disabled={!orgGeneliOlabilir}>
            Şirket geneli, bütün workspace’ler
            {orgGeneliOlabilir ? '' : ' (müşteri hesabı için kapalı)'}
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Secim>
      </Alan>

      {hata && (
        <Serit ton="hata" baslik="Kullanıcı eklenemedi">
          {hata}
        </Serit>
      )}

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Dugme ton="ikincil" onClick={onKapat}>
          Vazgeç
        </Dugme>
        <Dugme
          onClick={() => void gonder()}
          bekliyor={busy}
          disabled={
            ad.trim().length < 2 ||
            eposta.trim() === '' ||
            parola.length < 12 ||
            (clientId === '' && !orgGeneliOlabilir)
          }
        >
          Kullanıcıyı ekle
        </Dugme>
      </div>
    </div>
  );
}

/*
 * ═══ "DANIŞMAN EKLE" PENCERESİ KALDIRILDI ═══
 *
 * `KullaniciEkleModal` ile AYNI işi yapıyordu; tek fark rolün önceden
 * seçili gelmesi ve `client_viewer`ın listede olmamasıydı. İki düğme yan
 * yana durunca ekranın cevapladığı soru "kimi ekliyorum" değil "hangi
 * düğmeye basmalıyım" oluyordu.
 */

/**
 * DANIŞMAN ATA — üç adım tek ekranda: kim, hangi şirketler, hangi rol.
 * Ortak `Pencere`nin içi (başlık ve kapat pencerede).
 *
 * ORG GENELİ ERİŞİM BURADAN VERİLMİYOR. Bu ekran "bir müşteriye ata" işi;
 * bütün müşterilere erişim ayrı bir karar ve `owner`/`admin` rolü gerektiriyor
 * — sunucu da öyle uyguluyor (`createMembershipSchema`). Buradan seçilebilse
 * bir danışman atama işlemi sessizce org yöneticisi üretirdi.
 */
function DanismanAtaModal({
  danismanlar,
  sirketler,
  onKapat,
}: {
  danismanlar: MemberRow[];
  /** Üst hesabın altındaki şirketler — yetki artık BURAYA veriliyor. */
  sirketler: Array<{ id: string; name: string }>;
  onKapat: () => void;
}) {
  const router = useRouter();
  /*
   * TEK KİŞİYLE AÇILIYORSA ÖNCEDEN SEÇİLİ. Pencere satırın ⋯ menüsünden ya
   * da kişinin panelinden açılıyor; ikisinde de kişi belli ve ilk adımı boş
   * bırakmak "neden tekrar soruyor" demek.
   */
  const [userId, setUserId] = useState(danismanlar.length === 1 ? danismanlar[0]!.id : '');
  const [secili, setSecili] = useState<Set<string>>(new Set());
  const [arama, setArama] = useState('');
  const [rol, setRol] = useState<Role>('ad_manager');
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<AtamaSonucu | null>(null);

  const secilen = danismanlar.find((d) => d.id === userId) ?? null;

  /*
   * ŞİRKETLER ÇOKLU SEÇİLİYOR — TEK TEK DEĞİL. Danışman AJANS seviyesinde
   * duruyor; işin kendisi zaten toplu ("şu danışman şu şirketlere baksın").
   *
   * ENGELLİ ŞİRKET GİZLENMİYOR, SEBEBİ YAZILIYOR. Listeden düşürmek "bu
   * şirket neden yok" sorusunu cevapsız bırakıyordu.
   */
  const secilebilirSirketler = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr');
    return sirketler
      .map((o) => {
        /*
         * ZATEN ŞİRKET GENELİ YETKİSİ VAR MI. `clientId === null` bir
         * üyelik o şirketin tamamı demek; ikincisini yazmak 409 yiyor.
         */
        const mevcut = secilen?.memberships.find(
          (m) => m.orgId === o.id && m.clientId === null,
        );
        return {
          ...o,
          engel: mevcut ? `Zaten şirket geneli yetkisi var (${ROLE_TR[mevcut.role]})` : null,
        };
      })
      // Türkçe küçültme açıkça veriliyor: varsayılan `toLowerCase()` "İ"yi
      // "i̇" yapıyor ve "İkon" araması "ikon" ile eşleşmiyor.
      .filter((o) => q === '' || o.name.toLocaleLowerCase('tr').includes(q));
  }, [sirketler, secilen, arama]);

  const atanabilir = secilebilirSirketler.filter((o) => o.engel === null);

  function degistir(id: string): void {
    const yeni = new Set(secili);
    if (yeni.has(id)) yeni.delete(id);
    else yeni.add(id);
    setSecili(yeni);
    setSonuc(null);
  }

  async function ata(): Promise<void> {
    if (!secilen) return;
    setBusy(true);
    setHata(null);

    /* HEDEF ADI ŞİRKET ADI: kısmi başarıda hangisinin düştüğü okunmalı. */
    const hedefler = [...secili].map((id) => ({
      id,
      ad: sirketler.find((o) => o.id === id)?.name ?? id,
    }));

    const r = await atamalariYurut(hedefler, (organizationId) =>
      apiFetch('/memberships', {
        method: 'POST',
        /* `clientId: null` — ŞİRKET GENELİ. */
        body: JSON.stringify({ userId, clientId: null, role: rol, organizationId }),
      }),
    );

    setBusy(false);
    setSonuc(r);
    setSecili(new Set());
    router.refresh();
    // PENCERE KAPANMIYOR: kısmi başarı varsa hangisinin düştüğü burada
    // yazılı ve kapatmak o bilgiyi hiç göstermeden yok ederdi.
    if (r.hatalar.length === 0) onKapat();
  }

  return (
    <div className="grid gap-4">
      <p className="m-0 text-13 text-ink-muted">
        Ajans ekibinden birini bir ya da daha çok ŞİRKETE bağlar. Yetki verilen danışman o şirketin BÜTÜN
        workspace’lerini görür. Müşteri hesapları buradan yetkilendirilemez; onların sınırı tek bir workspace.
      </p>

      <Alan etiket="1 · Danışman">
        <Secim
          value={userId}
          onChange={(e) => {
            setUserId(e.target.value);
            // Danışman değişince seçim sıfırlanıyor: hangi şirketlerin
            // uygun olduğu kişiye bağlı ve eski seçim geçersiz kalabilir.
            setSecili(new Set());
            setSonuc(null);
          }}
        >
          <option value="">Seç</option>
          {danismanlar.map((d) => (
            <option key={d.id} value={d.id}>
              {d.fullName ?? d.email} · {d.email}
            </option>
          ))}
        </Secim>
      </Alan>

      <div className="grid gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-13 font-semibold text-ink">
            2 · Şirket{secili.size > 0 ? ` (${secili.size} seçildi)` : ''}
          </span>
          {/* TOPLU SEÇİM YALNIZCA ATANABİLİR OLANLARI kapsıyor: engelli
              satırı da işaretlemek, gönderilir gönderilmez 409 yiyecek
              bir istek üretirdi. */}
          {secilen && atanabilir.length > 0 && (
            <Dugme
              ton="hayalet"
              boyut="kucuk"
              onClick={() =>
                setSecili(
                  secili.size === atanabilir.length
                    ? new Set()
                    : new Set(atanabilir.map((c) => c.id)),
                )
              }
            >
              {secili.size === atanabilir.length ? 'Seçimi kaldır' : 'Hepsini seç'}
            </Dugme>
          )}
        </div>

        {!secilen ? (
          <p className="m-0 text-12 text-ink-muted">
            Önce danışman seç. Hangi şirketlerin uygun olduğu kişiye bağlı.
          </p>
        ) : (
          <>
            {/* ARAMA YALNIZCA LİSTE UZUNSA: dört şirkette arama kutusu
                cevaptan çok yer kaplıyor. */}
            {sirketler.length > 8 && (
              <Girdi
                type="search"
                value={arama}
                onChange={(e) => setArama(e.target.value)}
                placeholder="Şirket ara"
                aria-label="Şirket ara"
              />
            )}

            <ul className="m-0 max-h-56 list-none overflow-y-auto rounded-alan border border-line p-1">
              {secilebilirSirketler.map((c) => (
                <li key={c.id}>
                  <label
                    className={`flex items-center gap-2.5 rounded-alan px-2 py-1.5 ${
                      c.engel ? 'cursor-not-allowed opacity-55' : 'cursor-pointer hover:bg-surface-sunken'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={secili.has(c.id)}
                      disabled={c.engel !== null || busy}
                      onChange={() => degistir(c.id)}
                      className="h-4 w-4 shrink-0 accent-[var(--brand-primary)]"
                    />
                    <span className="min-w-0 flex-1 truncate text-13 text-ink">{c.name}</span>
                    {c.engel && <span className="shrink-0 text-11 text-ink-muted">{c.engel}</span>}
                  </label>
                </li>
              ))}
            </ul>

            {/* SESSİZ KESME YOK ve ÜÇ HÂL AYRI: hiç şirket yok · arama
                eşleşmedi · hepsinde zaten yetkisi var. */}
            {sirketler.length === 0 && (
              <p className="m-0 text-12 font-semibold text-danger-strong">Henüz şirket açılmamış.</p>
            )}
            {sirketler.length > 0 && secilebilirSirketler.length === 0 && (
              <p className="m-0 text-12 text-ink-muted">“{arama}” ile eşleşen şirket yok.</p>
            )}
            {secilebilirSirketler.length > 0 && atanabilir.length === 0 && (
              <p className="m-0 text-12 font-semibold text-danger-strong">
                Bu kişinin listedeki şirketlerin hepsinde zaten yetkisi var.
              </p>
            )}
          </>
        )}
      </div>

      <Alan
        etiket="3 · Rol"
        ipucu={
          <>
            <RolAciklamasi rol={rol} />
            {/* TEK ROL, BÜTÜN SEÇİM İÇİN — ve bu açıkça yazılı. Aynı kişinin
                iki müşteride farklı rolü olabiliyor; toplu atama o ayrımı
                yapamıyor ve söylenmezse kullanıcı yaptığını sanır. */}
            {secili.size > 1 && (
              <span className="mt-1 block">
                Seçilen {secili.size} şirketin hepsinde bu rol verilecek. Farklı rol gerekiyorsa ayrı ayrı ata.
              </span>
            )}
          </>
        }
      >
        <Secim value={rol} onChange={(e) => setRol(e.target.value as Role)} disabled={!secilen}>
          {/*
            ŞİRKET SEVİYESİ ROLLER: Yönetici ya da Reklam Yöneticisi.
            Yönetici burada SEÇİLEBİLİR ve bu bilinçli: "bu şirketin
            yöneticisi" gerçek bir ihtiyaç (şirketin kendi ekibini
            yönetsin). Rol adı ve açıklaması seçicinin altında yazıyor.
          */}
          {SIRKET_ROLLERI.map((r) => (
            <option key={r} value={r}>
              {ROLE_TR[r]}
            </option>
          ))}
        </Secim>
      </Alan>

      {hata && (
        <Serit ton="hata" baslik="Yetki verilemedi">
          {hata}
        </Serit>
      )}

      {/* KISMİ BAŞARI TEK TEK YAZILI. "5 şirkete atandı" deyip altıncıyı
          yutmak, atandığı sanılan yerde hiçbir şey görememek demek. */}
      {sonuc && (
        <Serit
          ton={sonuc.hatalar.length > 0 ? 'hata' : 'bilgi'}
          baslik={`${sonuc.basarili} şirkete yetki verildi.`}
        >
          {sonuc.hatalar.length > 0 && (
            <ul className="m-0 mt-1 list-none p-0">
              {sonuc.hatalar.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          )}
        </Serit>
      )}

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Dugme ton="ikincil" onClick={onKapat}>
          Vazgeç
        </Dugme>
        <Dugme onClick={() => void ata()} bekliyor={busy} disabled={userId === '' || secili.size === 0}>
          {`Yetkilendir${secili.size > 0 ? ` (${secili.size})` : ''}`}
        </Dugme>
      </div>
    </div>
  );
}

/**
 * Kişinin iki adımlı doğrulama durumu (yan panelde).
 *
 * Sıfırlama, telefonunu kaybetmiş ve kurtarma kodu kalmamış kişi için:
 * sonraki girişte yalnızca şifre sorulur (şirket zorunlu tutuyorsa yeniden
 * kurar). Kendi hesabında düğme YOK: kendi 2FA'nı Hesabım'dan, kodla
 * kapatırsın; sunucu da reddediyor.
 *
 * `mfaEnabled` gelmediyse (eski yanıt) satır HİÇ çizilmiyor: bilinmeyeni
 * "Kapalı" diye göstermek, açık bir korumayı yok sanıp yöneticiyi boşuna
 * kişinin peşine düşürürdü.
 */
function IkiAdimSatiri({
  kisi,
  kendisi,
  canManage,
  onSifirla,
}: {
  kisi: MemberRow;
  kendisi: boolean;
  canManage: boolean;
  onSifirla: () => void;
}) {
  if (kisi.mfaEnabled === undefined) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-13">
      <span className="text-ink-muted">İki adımlı doğrulama:</span>
      <Rozet hal={kisi.mfaEnabled ? 'ok' : 'hata'}>{kisi.mfaEnabled ? 'Açık' : 'Kapalı'}</Rozet>
      {canManage && !kendisi && kisi.mfaEnabled && (
        <Dugme ton="tehlike" boyut="kucuk" onClick={onSifirla}>
          Sıfırla
        </Dugme>
      )}
    </div>
  );
}

/**
 * İKİ ADIMLIYI SIFIRLAMA ONAYI — `window.confirm` yerine ortak `Pencere`.
 * Tarayıcının onay kutusu panelin dilinde değildi ve klavye odağını panelin
 * dışına alıyordu.
 */
function IkiAdimSifirla({ kisi, onKapat }: { kisi: MemberRow | null; onKapat: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  async function sifirla(): Promise<void> {
    if (!kisi) return;
    setBusy(true);
    setHata(null);
    try {
      await apiFetch(`/members/${kisi.id}/2fa/sifirla`, { method: 'POST' });
      router.refresh();
      onKapat();
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Sıfırlanamadı.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pencere
      acik={kisi !== null}
      onKapat={() => {
        setHata(null);
        onKapat();
      }}
      baslik="İki adımlı doğrulamayı sıfırla"
      genislik="dar"
      altEylemler={
        <>
          <Dugme ton="ikincil" onClick={onKapat}>
            Vazgeç
          </Dugme>
          <Dugme ton="tehlike" bekliyor={busy} onClick={() => void sifirla()}>
            Sıfırla
          </Dugme>
        </>
      }
    >
      {kisi && (
        <div className="grid gap-3">
          <p className="m-0 text-14 text-ink">
            <strong>{kisi.fullName ?? kisi.email}</strong> için iki adımlı doğrulama sıfırlansın mı? Bir sonraki
            girişte yalnızca şifresi sorulur.
          </p>
          {hata && (
            <Serit ton="hata" baslik="Sıfırlanamadı">
              {hata}
            </Serit>
          )}
        </div>
      )}
    </Pencere>
  );
}

/**
 * ÜYE BİLGİSİ DÜZENLEME — ad, e-posta, parola (yan panelin içi).
 *
 * Rol BURADA YOK: bir kişi bir müşteride yönetici, başkasında görüntüleyici
 * olabiliyor. Rolü kullanıcıya bağlamak o kuralı sessizce bozardı; yetki
 * kişinin panelindeki seçicide kalıyor.
 */
function UyeDuzenleModal({ member, onKapat }: { member: MemberRow; onKapat: () => void }) {
  const router = useRouter();
  const [ad, setAd] = useState(member.fullName ?? '');
  const [eposta, setEposta] = useState(member.email);
  const [parola, setParola] = useState('');
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const adDegisti = ad.trim() !== (member.fullName ?? '');
  const epostaDegisti = eposta.trim() !== member.email;
  const degisti = adDegisti || epostaDegisti || parola !== '';

  async function kaydet(): Promise<void> {
    setBusy(true);
    setHata(null);
    try {
      /*
       * YALNIZCA DEĞİŞEN ALANLAR GÖNDERİLİYOR. Hepsini göndermek, parola
       * alanını boş bırakan birinin parolasını sıfırlamaya çalışmak demekti
       * (sunucu reddeder ama hata ekranda anlamsız görünürdü).
       */
      await apiFetch(`/members/${member.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...(adDegisti ? { fullName: ad.trim() } : {}),
          ...(epostaDegisti ? { email: eposta.trim() } : {}),
          ...(parola !== '' ? { password: parola } : {}),
        }),
      });
      router.refresh();
      onKapat();
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Güncellenemedi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Alan etiket="Ad soyad">
        <Girdi value={ad} onChange={(e) => setAd(e.target.value)} />
      </Alan>
      <Alan etiket="E-posta">
        <Girdi type="email" value={eposta} onChange={(e) => setEposta(e.target.value)} />
      </Alan>
      <Alan etiket="Yeni parola" ipucu="Boş bırakırsan değişmez. En az 10 karakter.">
        <Girdi type="password" value={parola} onChange={(e) => setParola(e.target.value)} />
      </Alan>

      {/* PAROLA DEĞİŞİNCE AÇIK OTURUM DÜŞMÜYOR — bilinen eksik, gizlenmiyor. */}
      {parola !== '' && (
        <Serit baslik="Açık oturum kapanmaz">
          Parola değişse de kullanıcının açık oturumu düşmüyor; çalışmaya devam eder. Erişimi hemen kesmek
          gerekiyorsa yetkisini kaldır.
        </Serit>
      )}

      {hata && (
        <Serit ton="hata" baslik="Güncellenemedi">
          {hata}
        </Serit>
      )}

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Dugme ton="ikincil" onClick={onKapat}>
          Vazgeç
        </Dugme>
        <Dugme
          onClick={() => void kaydet()}
          bekliyor={busy}
          disabled={!degisti || (parola !== '' && parola.length < 10)}
        >
          Kaydet
        </Dugme>
      </div>
    </div>
  );
}
