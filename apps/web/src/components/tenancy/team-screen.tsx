'use client';

import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  SIRKET_ROLLERI,
  isOrgScopedRole,
  rolEtiketi,
  type Dil,
  type Role,
  type UstHesapUyesi,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { erisimYasi } from '@/lib/erisim-yasi';
import { formatDayShort } from '@/lib/format';
import { kapsamRolleri, type MemberRow } from '@/components/tenancy/team-manager';
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
import { useDil, useSozluk } from '@/dil/saglayici';
import { ekipSozlugu } from '@/dil/sozlukler/ayarlar-ekip';

type EkipSozlugu = (typeof ekipSozlugu)['tr'];

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
  const { dil } = useDil();
  const t = useSozluk(ekipSozlugu);
  const d = t.ekran;
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
      baslik: d.kisi,
      hucre: (k) => (
        <AdHucresi
          ad={
            <>
              {k.fullName ?? k.email}
              {k.id === currentUserId && <span className="ml-1.5 text-12 font-normal text-ink-muted">{t.ortak.sen}</span>}
            </>
          }
          alt={k.email}
        />
      ),
    },
    { anahtar: 'rol', baslik: d.rol, hucre: (k) => <span className="text-13">{rolOzeti(k, dil, t)}</span> },
    {
      anahtar: 'kapsam',
      baslik: d.kapsam,
      ikincil: true,
      hucre: (k) => <span className="text-13 text-ink-muted">{ozet(k, t)}</span>,
    },
    {
      anahtar: 'iki',
      baslik: d.ikiAdimli,
      ikincil: true,
      /*
       * `mfaEnabled` gelmediyse (eski yanıt) "Kapalı" YAZILMIYOR:
       * bilinmeyeni "Kapalı" diye göstermek, açık bir korumayı yok sanıp
       * yöneticiyi boşuna kişinin peşine düşürürdü.
       */
      hucre: (k) =>
        k.mfaEnabled === undefined ? (
          <span className="text-12 text-ink-soluk">{d.bilinmiyor}</span>
        ) : (
          <Rozet hal={k.mfaEnabled ? 'ok' : 'hata'}>{k.mfaEnabled ? t.ortak.acik : t.ortak.kapali}</Rozet>
        ),
    },
    {
      anahtar: 'giris',
      baslik: d.sonGiris,
      ikincil: true,
      /*
       * AYRILANIN ERİŞİMİ (pazar araştırması 2026-10-15): asıl Ekip ekranı
       * son girişi HİÇ göstermiyordu. 90 gündür girmeyen kırmızı, hiç
       * girmemiş ayrı (`erisimYasi`; daveti yenilemek ile erişimi
       * kaldırmak farklı iş).
       */
      hucre: (k) => {
        const y = erisimYasi(k.lastLoginAt, undefined, dil);
        return (
          <span className="grid gap-0.5 text-13">
            {k.lastLoginAt && <span className="tabular-nums">{formatDayShort(k.lastLoginAt.slice(0, 10), dil)}</span>}
            {y && (
              <span className={`text-12 ${y.tur === 'uzun' ? 'font-semibold text-danger-strong' : 'text-ink-muted'}`} data-erisim={y.tur}>
                {y.metin}
              </span>
            )}
          </span>
        );
      },
    },
    {
      anahtar: 'eylem',
      baslik: <span className="sr-only">{t.ortak.eylemler}</span>,
      sayi: true,
      hucre: (k) => (
        /* SATIR TIKLAMASI PANELİ AÇIYOR; menünün tıklaması satıra taşmasın. */
        <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
          <DigerMenusu etiket={d.islemler(k.fullName ?? k.email)}>
            <MenuOgesi onClick={() => setSecilenId(k.id)}>{d.erisimleriYonet}</MenuOgesi>
            {canManage && <MenuOgesi onClick={() => setDuzenlenen(k)}>{d.bilgileriDuzenle}</MenuOgesi>}
            {canManage && k.ajans && (
              <MenuOgesi onClick={() => setAtananKisi(k)}>{d.sirketeYetkiVer}</MenuOgesi>
            )}
            {canManage && k.id !== currentUserId && k.mfaEnabled === true && (
              <MenuOgesi tehlike onClick={() => setSifirlanan(k)}>
                {d.ikiAdimSifirla}
              </MenuOgesi>
            )}
          </DigerMenusu>
        </span>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-5">
      {/*
        ÇAPALAR (`AYARLAR_CAPALARI.ekip`): Marka Merkezi'nin erişim listesi ve
        eski adres yönlendirmeleri bu kimliklere bağlanıyor.
      */}
      <div id="kisiler" className="scroll-mt-24">
        <Kart
          dolgu={false}
          baslik={d.kisiler}
          /* SESSİZ KESME YOK: kaç kişi ve kaçının ajans personeli olduğu yazılı. */
          baslikEki={d.kisilerEki(kisiler.length, ajansSayisi, kisiler.length - ajansSayisi)}
        >
          <Tablo
            etiket={d.kisiler}
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
                      {d.gosteriliyor(kisiler.length, suzulmus.length)}
                    </span>
                  )
                }
              >
                <div className="w-full max-w-xs">
                  <Girdi
                    type="search"
                    value={arama}
                    onChange={(e) => setArama(e.target.value)}
                    placeholder={d.araYer}
                    aria-label={d.kisiAra}
                  />
                </div>
                <BolumluSecici
                  etiket={d.kisiTuru}
                  secili={tur}
                  onSec={setTur}
                  secenekler={[
                    { deger: 'tumu', etiket: d.tumu },
                    { deger: 'ajans', etiket: d.ajans },
                    { deger: 'musteri', etiket: d.musteriHesabi },
                  ]}
                />
              </AracCubugu>
            }
            bos={
              <BosDurum
                baslik={kisiler.length === 0 ? d.henuzKimseYok : d.eslesenYok}
                neden={kisiler.length === 0 ? d.ilkKisi : d.eslesmedi(arama)}
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
      <div id="roller" className="min-w-0 scroll-mt-24">
        <RolMatrisi />
      </div>

      <YanPanel
        acik={panelAcik}
        onKapat={() => setSecilenId(null)}
        baslik={secilen ? (secilen.fullName ?? secilen.email) : d.kisi}
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
        baslik={duzenlenen ? d.bilgileriBaslik(duzenlenen.fullName ?? duzenlenen.email) : d.bilgiler}
      >
        {duzenlenen && <UyeDuzenleModal member={duzenlenen} onKapat={() => setDuzenlenen(null)} />}
      </YanPanel>

      <Pencere acik={atananKisi !== null} onKapat={() => setAtananKisi(null)} baslik={d.sirketeYetkiVer}>
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
  const d = useSozluk(ekipSozlugu).ekran;
  return (
    <>
      <Dugme onClick={() => setAcik(true)}>{d.kullaniciEkle}</Dugme>
      <YanPanel acik={acik} onKapat={() => setAcik(false)} baslik={d.kullaniciEkleBaslik} genislik={440}>
        {acik && <KullaniciEkleModal clients={clients} onKapat={() => setAcik(false)} />}
      </YanPanel>
    </>
  );
}

/** Rol sütunu: kişinin rolleri TEK satırda. */
function rolOzeti(k: KisiSatiri, dil: Dil, t: EkipSozlugu): string {
  const ust = k.managerMemberships?.[0];
  if (ust) return t.ekran.ustHesapRol(rolEtiketi(ust.role, dil));
  if (k.memberships.length === 0) return t.ekran.yetkisiYok;
  return [...new Set(k.memberships.map((m) => rolEtiketi(m.role, dil)))].join(', ');
}

/** Kapsam sütunu: kişinin erişimi TEK CÜMLEDE. */
function ozet(k: KisiSatiri, t: EkipSozlugu): string {
  const ust = k.managerMemberships?.[0];
  if (ust) return t.ekran.butunSirketler;
  if (k.memberships.length === 0) return t.ekran.hicbirYer;
  const sirket = k.memberships.filter((m) => m.clientId === null).length;
  const workspace = k.memberships.length - sirket;
  const parcalar: string[] = [];
  if (sirket > 0) parcalar.push(t.ekran.sirketSayisi(sirket));
  if (workspace > 0) parcalar.push(t.ekran.workspaceSayisi(workspace));
  return `${k.ajans ? t.ekran.ajans : t.ekran.musteriHesabi} · ${parcalar.join(' · ')}`;
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
  const { dil } = useDil();
  const t = useSozluk(ekipSozlugu);
  const d = t.detay;
  const sirketYetkileri = kisi.memberships.filter((m) => m.clientId === null);
  const workspaceYetkileri = kisi.memberships.filter((m) => m.clientId !== null);

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <p className="m-0 break-all text-13 text-ink-muted">{kisi.email}</p>
        <p className="m-0 text-13 text-ink-muted">
          {kisi.ajans
            ? d.ajansAciklama
            : d.musteriAciklama}
        </p>
        {canManage && (
          <div>
            <Dugme ton="ikincil" boyut="kucuk" onClick={onDuzenle}>
              {t.ekran.bilgileriDuzenle}
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
        <Serit ton="bilgi" baslik={d.ustHesaptaRol(rolEtiketi(kisi.managerMemberships[0].role, dil))}>
          {d.ustHesapGovde}
        </Serit>
      ) : (
        kisi.memberships.length === 0 && (
          <Serit baslik={d.hicYetkiYok}>
            {d.hicYetkiGovde}
          </Serit>
        )
      )}

      <YetkiBolumu
        baslik={d.sirketYetkileri}
        aciklama={d.sirketYetkiAciklama}
        uyelikler={sirketYetkileri}
        etiket={(m) => sirketler.find((o) => o.id === m.orgId)?.name ?? d.sirket}
        kendisi={kendisi}
        canManage={canManage}
        bos={d.sirketYetkisiYok}
        eylem={
          canManage && kisi.ajans ? (
            <Dugme ton="ikincil" boyut="kucuk" onClick={onSirketYetkisi}>
              {d.sirketeYetkiVer}
            </Dugme>
          ) : null
        }
      />

      <YetkiBolumu
        baslik={d.workspaceYetkileri}
        aciklama={d.workspaceYetkiAciklama}
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
        bos={d.workspaceYetkisiYok}
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
  const { dil } = useDil();
  const t = useSozluk(ekipSozlugu);
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
      setHata(e instanceof ApiRequestError ? e.message : t.ortak.islemBasarisiz);
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
        <Serit ton="hata" baslik={t.ortak.yetkiDegismedi}>
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
                  aria-label={t.ortak.rolEtiketi(etiket(m))}
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
                      {rolEtiketi(r, dil)}
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
                  {t.ortak.kaldir}
                </Dugme>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* KENDİ YETKİNİ DEĞİŞTİREMİYORSUN: tek yöneticinin kendini
          düşürmesi, panelden geri alınamayan bir kilitlenme. */}
      {kendisi && uyelikler.length > 0 && (
        <p className="m-0 text-12 text-ink-muted">{t.detay.kendiYetkin}</p>
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
  const { dil } = useDil();
  const t = useSozluk(ekipSozlugu);
  const d = t.ekle;
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
      setHata(e instanceof ApiRequestError ? e.message : d.eklenemedi);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      {/* DAVET GÖNDERİLMİYOR ve bu bir kısıt: e-posta altyapısı yok.
          Kullanıcıya söylenmezse parolayı nasıl ileteceğini bilemez. */}
      <Serit ton="bilgi" baslik={d.anindaBaslik}>
        {d.anindaGovde}
      </Serit>

      <Alan etiket={t.ortak.adSoyad}>
        <Girdi value={ad} onChange={(e) => setAd(e.target.value)} />
      </Alan>
      <Alan etiket={t.ortak.eposta}>
        <Girdi type="email" value={eposta} onChange={(e) => setEposta(e.target.value)} />
      </Alan>
      <Alan etiket={t.ortak.parola} ipucu={d.enAz12}>
        <Girdi type="password" value={parola} onChange={(e) => setParola(e.target.value)} />
      </Alan>

      <Alan etiket={t.ortak.rol} ipucu={<RolAciklamasi rol={rol} />}>
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
              {rolEtiketi(r, dil)}
            </option>
          ))}
        </Secim>
      </Alan>

      <Alan etiket={d.kapsam}>
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
            {d.sirketGeneli}
            {orgGeneliOlabilir ? '' : d.musteriIcinKapali}
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Secim>
      </Alan>

      {hata && (
        <Serit ton="hata" baslik={d.eklenemediBaslik}>
          {hata}
        </Serit>
      )}

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Dugme ton="ikincil" onClick={onKapat}>
          {t.ortak.vazgec}
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
          {d.kullaniciyiEkle}
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
  const { dil } = useDil();
  const t = useSozluk(ekipSozlugu);
  const d = t.sirketYetkisi;
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
          engel: mevcut ? d.zatenVar(rolEtiketi(mevcut.role, dil)) : null,
        };
      })
      // Türkçe küçültme açıkça veriliyor: varsayılan `toLowerCase()` "İ"yi
      // "i̇" yapıyor ve "İkon" araması "ikon" ile eşleşmiyor.
      .filter((o) => q === '' || o.name.toLocaleLowerCase('tr').includes(q));
  }, [sirketler, secilen, arama, d, dil]);

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

    const r = await atamalariYurut(
      hedefler,
      (organizationId) =>
      apiFetch('/memberships', {
        method: 'POST',
        /* `clientId: null` — ŞİRKET GENELİ. */
        body: JSON.stringify({ userId, clientId: null, role: rol, organizationId }),
      }),
      dil,
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
      <p className="m-0 text-13 text-ink-muted">{d.aciklama}</p>

      <Alan etiket={d.danisman}>
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
          <option value="">{d.sec}</option>
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
            {d.sirket(secili.size)}
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
              {secili.size === atanabilir.length ? t.ortak.seciminiKaldir : t.ortak.hepsiniSec}
            </Dugme>
          )}
        </div>

        {!secilen ? (
          <p className="m-0 text-12 text-ink-muted">{d.onceDanisman}</p>
        ) : (
          <>
            {/* ARAMA YALNIZCA LİSTE UZUNSA: dört şirkette arama kutusu
                cevaptan çok yer kaplıyor. */}
            {sirketler.length > 8 && (
              <Girdi
                type="search"
                value={arama}
                onChange={(e) => setArama(e.target.value)}
                placeholder={d.sirketAra}
                aria-label={d.sirketAra}
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
              <p className="m-0 text-12 font-semibold text-danger-strong">{d.sirketYok}</p>
            )}
            {sirketler.length > 0 && secilebilirSirketler.length === 0 && (
              <p className="m-0 text-12 text-ink-muted">{d.eslesenSirketYok(arama)}</p>
            )}
            {secilebilirSirketler.length > 0 && atanabilir.length === 0 && (
              <p className="m-0 text-12 font-semibold text-danger-strong">{d.hepsindeVar}</p>
            )}
          </>
        )}
      </div>

      <Alan
        etiket={d.rol}
        ipucu={
          <>
            <RolAciklamasi rol={rol} />
            {/* TEK ROL, BÜTÜN SEÇİM İÇİN — ve bu açıkça yazılı. Aynı kişinin
                iki müşteride farklı rolü olabiliyor; toplu atama o ayrımı
                yapamıyor ve söylenmezse kullanıcı yaptığını sanır. */}
            {secili.size > 1 && (
              <span className="mt-1 block">{d.hepsindeBuRol(secili.size)}</span>
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
              {rolEtiketi(r, dil)}
            </option>
          ))}
        </Secim>
      </Alan>

      {hata && (
        <Serit ton="hata" baslik={d.verilemedi}>
          {hata}
        </Serit>
      )}

      {/* KISMİ BAŞARI TEK TEK YAZILI. "5 şirkete atandı" deyip altıncıyı
          yutmak, atandığı sanılan yerde hiçbir şey görememek demek. */}
      {sonuc && (
        <Serit
          ton={sonuc.hatalar.length > 0 ? 'hata' : 'bilgi'}
          baslik={d.verildi(sonuc.basarili)}
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
          {t.ortak.vazgec}
        </Dugme>
        <Dugme onClick={() => void ata()} bekliyor={busy} disabled={userId === '' || secili.size === 0}>
          {d.yetkilendir(secili.size)}
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
  const t = useSozluk(ekipSozlugu);
  if (kisi.mfaEnabled === undefined) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-13">
      <span className="text-ink-muted">{t.detay.ikiAdimEtiket}</span>
      <Rozet hal={kisi.mfaEnabled ? 'ok' : 'hata'}>{kisi.mfaEnabled ? t.ortak.acik : t.ortak.kapali}</Rozet>
      {canManage && !kendisi && kisi.mfaEnabled && (
        <Dugme ton="tehlike" boyut="kucuk" onClick={onSifirla}>
          {t.detay.sifirla}
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
  const t = useSozluk(ekipSozlugu);
  const d = t.sifirlama;
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
      setHata(e instanceof ApiRequestError ? e.message : d.sifirlanamadi);
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
      baslik={d.baslik}
      genislik="dar"
      altEylemler={
        <>
          <Dugme ton="ikincil" onClick={onKapat}>
            {t.ortak.vazgec}
          </Dugme>
          <Dugme ton="tehlike" bekliyor={busy} onClick={() => void sifirla()}>
            {t.detay.sifirla}
          </Dugme>
        </>
      }
    >
      {kisi && (
        <div className="grid gap-3">
          <p className="m-0 text-14 text-ink">
            <strong>{kisi.fullName ?? kisi.email}</strong>
            {d.soru}
          </p>
          {hata && (
            <Serit ton="hata" baslik={d.sifirlanamadiBaslik}>
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
  const t = useSozluk(ekipSozlugu);
  const d = t.duzenle;
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
      setHata(e instanceof ApiRequestError ? e.message : d.guncellenemedi);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Alan etiket={t.ortak.adSoyad}>
        <Girdi value={ad} onChange={(e) => setAd(e.target.value)} />
      </Alan>
      <Alan etiket={t.ortak.eposta}>
        <Girdi type="email" value={eposta} onChange={(e) => setEposta(e.target.value)} />
      </Alan>
      <Alan etiket={d.yeniParola} ipucu={d.parolaIpucu}>
        <Girdi type="password" value={parola} onChange={(e) => setParola(e.target.value)} />
      </Alan>

      {/* PAROLA DEĞİŞİNCE AÇIK OTURUM DÜŞMÜYOR — bilinen eksik, gizlenmiyor. */}
      {parola !== '' && (
        <Serit baslik={d.oturumBaslik}>
          {d.oturumGovde}
        </Serit>
      )}

      {hata && (
        <Serit ton="hata" baslik={d.guncellenemediBaslik}>
          {hata}
        </Serit>
      )}

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Dugme ton="ikincil" onClick={onKapat}>
          {t.ortak.vazgec}
        </Dugme>
        <Dugme
          onClick={() => void kaydet()}
          bekliyor={busy}
          disabled={!degisti || (parola !== '' && parola.length < 10)}
        >
          {t.ortak.kaydet}
        </Dugme>
      </div>
    </div>
  );
}
