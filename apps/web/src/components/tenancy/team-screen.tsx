'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ROLES, isOrgScopedRole, type Role } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { ROLE_TR, type MemberRow } from '@/components/tenancy/team-manager';
import {
  ENGEL_WORKSPACE,
  atamaEngeli,
  atamalariYurut,
  type AtamaSonucu,
} from '@/components/tenancy/danisman-atama';

interface ClientOption {
  id: string;
  name: string;
}

/**
 * EKİP EKRANI — WORKSPACE'LER KART, KULLANICILAR İÇLERİNDE.
 *
 * Önceki düzen her KULLANICIYI ayrı bir kart olarak basıyordu ve ekranda
 * gerçekten sorulan soru cevapsız kalıyordu: "bu workspace’e kim erişiyor".
 * Kullanıcı sayısı arttıkça liste uzuyor, bir müşterinin ekibini görmek için
 * kartları tek tek okumak gerekiyordu.
 *
 * İKİ AYRI KÜME ve ayrımı ÜYELİK KAPSAMI belirliyor:
 *   · AJANS EKİBİ — org geneli üyeliği olanlar (`clientId === null`).
 *     Reklamcılar ve yöneticiler; bir workspace’e ait değiller.
 *   · WORKSPACE ÜYELERİ — üyeliği bir müşteriye bağlı olanlar.
 *
 * Ayrım e-posta alan adına ya da role BAKMIYOR: ajans personeline bir
 * müşteride rol verilebiliyor ve müşteri tarafından biri asla org geneli
 * üyelik almıyor. Kapsam tek doğru ölçüt.
 */
interface KisiSatiri extends MemberRow {
  /** Ajans personeli mi — müşterinin kendi giriş hesabı değil. */
  ajans: boolean;
}

/**
 * ═══ EKİP & YETKİLER — RAY + DETAY ═══
 *
 * ═══ ÖNCEKİ DÜZEN NEDEN ÇALIŞMIYORDU ═══
 *
 * Üç "ekle" düğmesi yan yana duruyordu (Danışman ekle · Danışman ata ·
 * Kullanıcı ekle) ve hangisinin ne yaptığını ekran SÖYLEMİYORDU: ikisi
 * kullanıcı açıyor, biri var olana yetki veriyordu. Altında BİRBİRİNDEN
 * KOPUK iki liste vardı — "Ajans ekibi" düz bir satır listesi, "Workspace'ler"
 * ayrı kartlar — ve aynı üyelik satırı ikisinde birden görünüyordu. Arama
 * yoktu.
 *
 * Sonuç, kullanıcının cümlesiyle: "çok kötü gözüküyor ve mantıksız,
 * kullanışsız duruyor".
 *
 * ═══ EKRANIN SORDUĞU SORU TEK ═══
 *
 * "Bu kişi NERELERE erişiyor." Düzen de onu izliyor: SOLDA aranabilir kişi
 * rayı, SAĞDA seçili kişinin erişimi — şirket yetkileri ve workspace
 * yetkileri tek yerde, ekleme ve kaldırma satırın yanında.
 *
 * Şirketler ekranıyla AYNI desen ve bu bilinçli: panelde iki farklı
 * "liste + detay" dili olması, her ekranı yeniden öğrenmek demekti.
 *
 * ═══ TEK EKLEME DÜĞMESİ ═══
 *
 * "Danışman ekle" ile "Kullanıcı ekle" AYNI işi yapıyordu; tek fark
 * rolün önceden seçili gelmesiydi. Pencerenin kendisi zaten rolü ve
 * kapsamı soruyor, yani ikinci düğme yalnızca "hangisine basmalıyım"
 * sorusunu üretiyordu.
 *
 * "Danışman ata" ise bir EKLEME değil, seçili kişiye yetki verme işi —
 * yeri üst bant değil, o kişinin detayı.
 */
export function TeamScreen({
  members,
  clients,
  sirketler,
  currentUserId,
  canManage,
}: {
  members: MemberRow[];
  clients: ClientOption[];
  /** Üst hesabın altındaki ŞİRKETLER — şirket yetkisi buraya veriliyor. */
  sirketler: Array<{ id: string; name: string }>;
  currentUserId: string;
  canManage: boolean;
}) {
  const [ekleAcik, setEkleAcik] = useState(false);
  const [duzenlenen, setDuzenlenen] = useState<MemberRow | null>(null);
  const [atananKisi, setAtananKisi] = useState<MemberRow | null>(null);
  const [arama, setArama] = useState('');
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
  const suzulmus = useMemo(
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
   * SEÇİM DÜŞMÜYOR: aranan kişi listeden çıkınca seçim korunuyor, çünkü
   * detay hâlâ o kişiyi anlatıyor. Sıfırlamak, arama kutusuna yazan
   * kullanıcının sağ tarafını habersizce boşaltırdı.
   */
  const secilen = kisiler.find((k) => k.id === secilenId) ?? suzulmus[0] ?? null;

  const ajansSayisi = kisiler.filter((k) => k.ajans).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="flex flex-col rounded-xl border border-line bg-surface">
            <div className="border-b border-line px-3 py-2.5">
              {/* SESSİZ KESME YOK: kaç kişi ve kaçının ajans personeli
                  olduğu yazılı. "12 kullanıcı" ile "12'sinin 4'ü ajans" bu
                  ekranda farklı sorular. */}
              <p className="text-sm font-semibold text-ink">{kisiler.length} kişi</p>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                {ajansSayisi} ajans personeli · {kisiler.length - ajansSayisi} müşteri hesabı
              </p>
            </div>

            <div className="border-b border-line p-2">
              <input
                type="search"
                value={arama}
                onChange={(e) => setArama(e.target.value)}
                placeholder="Ad ya da e-posta ara…"
                aria-label="Kişi ara"
                className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
              />
            </div>

            {/* LİSTE KENDİ KABINDA KAYIYOR — sayfayla birlikte kaymak,
                kişi gezerken detayın ekrandan çıkması demekti. */}
            <ul className="max-h-[60vh] min-h-0 overflow-y-auto p-1.5">
              {suzulmus.length === 0 ? (
                <li className="px-2 py-6 text-center text-xs text-ink-muted">
                  {kisiler.length === 0
                    ? 'Henüz kimse eklenmemiş.'
                    : `“${arama}” ile eşleşen kişi yok.`}
                </li>
              ) : (
                suzulmus.map((k) => (
                  <li key={k.id}>
                    <button
                      type="button"
                      onClick={() => setSecilenId(k.id)}
                      aria-current={secilen?.id === k.id ? 'true' : undefined}
                      className={`w-full rounded-lg px-2 py-1.5 text-left transition ${
                        secilen?.id === k.id
                          ? 'bg-brand/10 ring-1 ring-inset ring-brand/30'
                          : 'hover:bg-surface-sunken'
                      }`}
                    >
                      <span className="block truncate text-sm text-ink">
                        {k.fullName ?? k.email}
                        {k.id === currentUserId && (
                          <span className="ml-1.5 text-[11px] text-ink-muted">(siz)</span>
                        )}
                      </span>
                      <span className="block truncate text-[11px] text-ink-muted">
                        {ozet(k)}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>

            {q !== '' && kisiler.length > 0 && (
              <p className="border-t border-line px-3 py-1.5 text-[11px] text-ink-muted">
                {kisiler.length} kişiden {suzulmus.length} tanesi gösteriliyor
              </p>
            )}

            {canManage && (
              <div className="border-t border-line p-2">
                {/*
                  TEK EKLEME DÜĞMESİ. "Danışman ekle" ile "Kullanıcı ekle"
                  aynı işi yapıyordu; pencere zaten rolü ve kapsamı soruyor.
                */}
                <button
                  type="button"
                  onClick={() => setEkleAcik(true)}
                  className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white"
                >
                  + Kişi ekle
                </button>
              </div>
            )}
          </div>
        </aside>

        <div className="min-w-0">
          {secilen === null ? (
            <p className="rounded-xl border border-dashed border-line bg-surface px-4 py-10 text-center text-sm text-ink-muted">
              Soldan bir kişi seç — erişimleri burada açılır.
            </p>
          ) : (
            <KisiDetayi
              kisi={secilen}
              clients={clients}
              sirketler={sirketler}
              kendisi={secilen.id === currentUserId}
              canManage={canManage}
              onDuzenle={() => setDuzenlenen(secilen)}
              onSirketYetkisi={() => setAtananKisi(secilen)}
            />
          )}
        </div>
      </div>

      {ekleAcik && (
        <KullaniciEkleModal clients={clients} onKapat={() => setEkleAcik(false)} />
      )}
      {duzenlenen && (
        <UyeDuzenleModal member={duzenlenen} onKapat={() => setDuzenlenen(null)} />
      )}
      {atananKisi && (
        <DanismanAtaModal
          danismanlar={[atananKisi]}
          sirketler={sirketler}
          onKapat={() => setAtananKisi(null)}
        />
      )}
    </div>
  );
}

/** Ray satırının ikinci satırı — kişinin erişimi TEK CÜMLEDE. */
function ozet(k: KisiSatiri): string {
  if (k.memberships.length === 0) return 'yetkisi yok';
  const sirket = k.memberships.filter((m) => m.clientId === null).length;
  const workspace = k.memberships.length - sirket;
  const parcalar: string[] = [];
  if (sirket > 0) parcalar.push(`${sirket} şirket`);
  if (workspace > 0) parcalar.push(`${workspace} workspace`);
  return `${k.ajans ? 'Ajans' : 'Müşteri hesabı'} · ${parcalar.join(' · ')}`;
}

/**
 * SEÇİLİ KİŞİNİN ERİŞİMİ — ekranın asıl cevabı.
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
}: {
  kisi: KisiSatiri;
  clients: ClientOption[];
  sirketler: Array<{ id: string; name: string }>;
  kendisi: boolean;
  canManage: boolean;
  onDuzenle: () => void;
  onSirketYetkisi: () => void;
}) {
  const sirketYetkileri = kisi.memberships.filter((m) => m.clientId === null);
  const workspaceYetkileri = kisi.memberships.filter((m) => m.clientId !== null);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-ink">
              {kisi.fullName ?? kisi.email}
            </h2>
            <p className="truncate text-sm text-ink-muted">{kisi.email}</p>
            <p className="mt-1 text-[11px] text-ink-muted">
              {kisi.ajans
                ? 'Ajans personeli — şirketlere ve workspace’lere yetkilendirilebilir.'
                : 'Müşteri hesabı — yalnızca tek bir workspace’e bağlı kalır.'}
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={onDuzenle}
              className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-sunken"
            >
              Bilgileri düzenle
            </button>
          )}
        </div>

        {/* YETKİSİZ HESAP SESSİZ KALMIYOR: giriş yapabiliyor ama panelde
            hiçbir veri göremiyor ve sebebi yalnızca burada yazılı. */}
        {kisi.memberships.length === 0 && (
          <p className="mt-3 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">
            Bu hesabın hiçbir yetkisi yok — giriş yapabiliyor ama panelde hiçbir
            şey göremiyor.
          </p>
        )}
      </section>

      <YetkiBolumu
        baslik="Şirket yetkileri"
        aciklama="Bir şirkete verilen yetki o şirketin BÜTÜN workspace’lerini açar — tek tek atama gerekmiyor."
        uyelikler={sirketYetkileri}
        etiket={(m) => sirketler.find((o) => o.id === m.orgId)?.name ?? 'Şirket'}
        kendisi={kendisi}
        canManage={canManage}
        bos="Şirket geneli yetkisi yok."
        eylem={
          canManage && kisi.ajans ? (
            <button
              type="button"
              onClick={onSirketYetkisi}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-sunken"
            >
              + Şirkete yetki ver
            </button>
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
  eylem: React.ReactNode;
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
    <section className="rounded-xl border border-line bg-surface">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">
            {baslik}
            <span className="ml-2 text-xs font-normal text-ink-muted">{uyelikler.length}</span>
          </h3>
          <p className="mt-0.5 max-w-prose text-[11px] text-ink-muted">{aciklama}</p>
        </div>
        {eylem}
      </header>

      {hata && (
        <p role="alert" className="border-b border-line px-4 py-2 text-xs text-danger">
          {hata}
        </p>
      )}

      {uyelikler.length === 0 ? (
        <p className="px-4 py-4 text-sm text-ink-muted">{bos}</p>
      ) : (
        <ul className="divide-y divide-line/60">
          {uyelikler.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{etiket(m)}</span>

              <select
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
                className="shrink-0 rounded-lg border border-line bg-surface px-2 py-1 text-[11px] disabled:opacity-50"
              >
                {ROLES.filter((r) => m.clientId !== null || isOrgScopedRole(r as Role)).map(
                  (r) => (
                    <option key={r} value={r}>
                      {ROLE_TR[r as Role]}
                    </option>
                  ),
                )}
              </select>

              {canManage && (
                <button
                  type="button"
                  disabled={busy !== null || isPending || kendisi}
                  onClick={() =>
                    void calistir(`d-${m.id}`, () =>
                      apiFetch(`/memberships/${m.id}`, { method: 'DELETE' }),
                    )
                  }
                  className="shrink-0 text-[11px] text-ink-muted transition hover:text-danger disabled:opacity-40"
                >
                  Kaldır
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* KENDİ YETKİNİ DEĞİŞTİREMİYORSUN: tek yöneticinin kendini
          düşürmesi, panelden geri alınamayan bir kilitlenme. */}
      {kendisi && uyelikler.length > 0 && (
        <p className="border-t border-line px-4 py-2 text-[11px] text-ink-muted">
          Kendi yetkinizi bu ekrandan değiştiremezsiniz.
        </p>
      )}
    </section>
  );
}

/** Modal iskeleti — ESC ve dışarı tıklamayla kapanıyor. */
function Modal({
  baslik,
  onKapat,
  children,
}: {
  baslik: string;
  onKapat: () => void;
  children: React.ReactNode;
}) {
  const kutuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onKapat();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onKapat]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={baslik}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (!kutuRef.current?.contains(e.target as Node)) onKapat();
      }}
    >
      <div
        ref={kutuRef}
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-line bg-surface shadow-xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-sm font-semibold text-ink">{baslik}</h2>
          <button
            type="button"
            onClick={onKapat}
            className="text-xs text-ink-muted transition hover:text-ink"
          >
            Kapat
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/**
 * KULLANICI EKLEME — pop-up.
 *
 * Form ekranın üstünde sabit duruyordu ve her açılışta yer kaplıyordu; oysa
 * kullanıcı eklemek seyrek bir iş. Pop-up'a taşımak listeyi öne çıkarıyor.
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
  const [rol, setRol] = useState<Role>('manager');
  const [clientId, setClientId] = useState('');
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  /*
   * ORG GENELİ ERİŞİM YALNIZCA owner/admin. Sunucu da aynı kuralı uyguluyor;
   * burada tekrarlanmasının sebebi geçersiz kombinasyonun SEÇİLEBİLMESİNİ
   * engellemek — sonradan hata göstermek, o hatayı yapmasına izin vermek.
   */
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
    <Modal baslik="Kullanıcı ekle" onKapat={onKapat}>
      <div className="space-y-3">
        {/* DAVET GÖNDERİLMİYOR ve bu bir kısıt: e-posta altyapısı yok.
            Kullanıcıya söylenmezse parolayı nasıl ileteceğini bilemez. */}
        <p className="rounded-lg bg-surface-sunken px-3 py-2 text-[11px] text-ink-muted">
          Kullanıcı anında oluşur — davet gönderilmiyor. Parolayı sen belirliyorsun ve
          kullanıcıya kendin iletiyorsun.
        </p>

        <Alan etiket="Ad soyad" value={ad} onChange={setAd} />
        <Alan etiket="E-posta" type="email" value={eposta} onChange={setEposta} />
        <Alan
          etiket="Parola (en az 12 karakter)"
          type="password"
          value={parola}
          onChange={setParola}
        />

        <label className="block">
          <span className="text-[11px] text-ink-muted">Rol</span>
          <select
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
            className="mt-0.5 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_TR[r as Role]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] text-ink-muted">Kapsam</span>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm"
          >
            <option value="" disabled={!orgGeneliOlabilir}>
              Şirket geneli — bütün workspace’ler
              {orgGeneliOlabilir ? '' : ' (müşteri hesabı için kapalı)'}
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        {hata && <p className="text-xs text-danger">{hata}</p>}

        <button
          type="button"
          onClick={() => void gonder()}
          disabled={
            busy ||
            ad.trim().length < 2 ||
            eposta.trim() === '' ||
            parola.length < 12 ||
            (clientId === '' && !orgGeneliOlabilir)
          }
          className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-40"
        >
          {busy ? 'Ekleniyor…' : 'Kullanıcıyı ekle'}
        </button>
      </div>
    </Modal>
  );
}

/*
 * ═══ "DANIŞMAN EKLE" PENCERESİ KALDIRILDI ═══
 *
 * `KullaniciEkleModal` ile AYNI işi yapıyordu; tek fark rolün önceden
 * seçili gelmesi ve `client_viewer`ın listede olmamasıydı. İki düğme yan
 * yana durunca ekranın cevapladığı soru "kimi ekliyorum" değil "hangi
 * düğmeye basmalıyım" oluyordu.
 *
 * Pencerenin kendisi zaten rolü ve kapsamı soruyor — yani ayrımı kullanıcı
 * pencerede yapıyor, düğme seçerken değil.
 */

/**
 * DANIŞMAN ATA — üç adım tek ekranda: kim, hangi workspace, hangi rol.
 *
 * NEDEN KİŞİDEN BAŞLIYOR: ajans çalışanı önce açılıyor, yetkisi sonra
 * veriliyor. O arada kişi hiçbir müşteriyi göremiyor ve yetkiyi vermenin yolu
 * workspace kartını açıp içeride yetki eklemekti — yani "kimi
 * yetkilendireceğim" sorusuyla başlayan akış, "hangi workspace’e bakayım"
 * sorusuyla başlamak zorunda kalıyordu.
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
  const [userId, setUserId] = useState('');
  const [secili, setSecili] = useState<Set<string>>(new Set());
  const [arama, setArama] = useState('');
  const [rol, setRol] = useState<Role>('manager');
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<AtamaSonucu | null>(null);

  const secilen = danismanlar.find((d) => d.id === userId) ?? null;

  /*
   * ŞİRKETLER ÇOKLU SEÇİLİYOR — TEK TEK DEĞİL.
   *
   * Danışman AJANS seviyesinde duruyor; işin kendisi zaten toplu ("şu
   * danışman şu şirketlere baksın") ve pencereyi her şirket için yeniden
   * açtırmak, aynı iki alanı (danışman, rol) tekrar tekrar seçtirmek
   * demekti.
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
         * `orgId` bu yüzden API'den okunuyor — onsuz hangi şirkete ait
         * olduğu bilinemezdi.
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

    /*
     * HEDEF ADI ŞİRKET ADI. Kısmi başarıda "1 tanesi atanamadı" demek,
     * hangisinin atanmadığını aramak demek.
     */
    const hedefler = [...secili].map((id) => ({
      id,
      ad: sirketler.find((o) => o.id === id)?.name ?? id,
    }));

    const r = await atamalariYurut(hedefler, (organizationId) =>
      apiFetch('/memberships', {
        method: 'POST',
        /*
         * `clientId: null` — ŞİRKET GENELİ. Danışman şirkete bakıyor;
         * tek bir workspace'e daraltmak istisna ve o, workspace kartındaki
         * "Danışman ata" ile yapılıyor.
         */
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
    <Modal baslik="Danışman ata" onKapat={onKapat}>
      <div className="space-y-3">
        <p className="rounded-lg bg-surface-sunken px-3 py-2 text-[11px] text-ink-muted">
          Ajans ekibinden birini bir ya da daha çok ŞİRKETE bağlar. Yetki
          verilen danışman o şirketin BÜTÜN workspace’lerini görür — tek tek
          atama gerekmiyor. Müşteri hesapları (Görüntüleyici) bu pencereden
          yetkilendirilemez; onların sınırı tek bir workspace.
        </p>

        <label className="block">
          <span className="text-[11px] text-ink-muted">1 · Danışman</span>
          <select
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
              // Danışman değişince seçim sıfırlanıyor: hangi workspace’lerin
              // uygun olduğu kişiye bağlı ve eski seçim geçersiz kalabilir.
              setSecili(new Set());
              setSonuc(null);
            }}
            className="mt-0.5 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm"
          >
            <option value="">Seçin…</option>
            {danismanlar.map((d) => (
              <option key={d.id} value={d.id}>
                {d.fullName ?? d.email} · {d.email}
              </option>
            ))}
          </select>
        </label>

        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-ink-muted">
              2 · Şirket{secili.size > 0 ? ` (${secili.size} seçildi)` : ''}
            </span>
            {/* TOPLU SEÇİM YALNIZCA ATANABİLİR OLANLARI kapsıyor: engelli
                satırı da işaretlemek, gönderilir gönderilmez 409 yiyecek
                bir istek üretirdi. */}
            {secilen && atanabilir.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setSecili(
                    secili.size === atanabilir.length
                      ? new Set()
                      : new Set(atanabilir.map((c) => c.id)),
                  )
                }
                className="text-[11px] font-medium text-brand-strong hover:underline"
              >
                {secili.size === atanabilir.length ? 'Seçimi kaldır' : 'Hepsini seç'}
              </button>
            )}
          </div>

          {!secilen ? (
            <p className="mt-1 rounded-lg border border-line px-3 py-2 text-[11px] text-ink-muted">
              Önce danışman seç — hangi şirketlerin uygun olduğu kişiye bağlı.
            </p>
          ) : (
            <>
              {/* ARAMA YALNIZCA LİSTE UZUNSA: dört müşteride arama kutusu
                  cevaptan çok yer kaplıyor. */}
              {sirketler.length > 8 && (
                <input
                  type="search"
                  value={arama}
                  onChange={(e) => setArama(e.target.value)}
                  placeholder="Şirket ara…"
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
                />
              )}

              <ul className="mt-1 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-line p-1">
                {secilebilirSirketler.map((c) => (
                  <li key={c.id}>
                    <label
                      className={`flex items-center gap-2.5 rounded px-2 py-1.5 ${
                        c.engel ? 'cursor-not-allowed opacity-55' : 'cursor-pointer hover:bg-surface-sunken'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={secili.has(c.id)}
                        disabled={c.engel !== null || busy}
                        onChange={() => degistir(c.id)}
                        className="h-3.5 w-3.5 shrink-0 accent-[var(--brand-primary)]"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{c.name}</span>
                      {c.engel && (
                        <span className="shrink-0 text-[10px] text-ink-muted">{c.engel}</span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>

              {/* SESSİZ KESME YOK ve ÜÇ HÂL AYRI: hiç şirket yok · arama
                  eşleşmedi · hepsinde zaten yetkisi var. */}
              {sirketler.length === 0 && (
                <p className="mt-1 text-[11px] text-warn">Henüz şirket açılmamış.</p>
              )}
              {sirketler.length > 0 && secilebilirSirketler.length === 0 && (
                <p className="mt-1 text-[11px] text-ink-muted">
                  “{arama}” ile eşleşen şirket yok.
                </p>
              )}
              {secilebilirSirketler.length > 0 && atanabilir.length === 0 && (
                <p className="mt-1 text-[11px] text-warn">
                  Bu kişinin listedeki şirketlerin hepsinde zaten yetkisi var.
                </p>
              )}
            </>
          )}
        </div>

        <label className="block">
          <span className="text-[11px] text-ink-muted">3 · Rol</span>
          <select
            value={rol}
            onChange={(e) => setRol(e.target.value as Role)}
            disabled={!secilen}
            className="mt-0.5 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm disabled:opacity-50"
          >
            {/* ORG GENELİ ROLLER YOK: bu ekran bir müşteriye atama işi. */}
            {ROLES.filter((r) => r !== 'owner' && r !== 'admin').map((r) => (
              <option key={r} value={r}>
                {ROLE_TR[r as Role]}
              </option>
            ))}
          </select>
          {/* TEK ROL, BÜTÜN SEÇİM İÇİN — ve bu açıkça yazılı. Aynı kişinin
              iki müşteride farklı rolü olabiliyor; toplu atama o ayrımı
              yapamıyor ve söylenmezse kullanıcı yaptığını sanır. */}
          {secili.size > 1 && (
            <span className="mt-1 block text-[11px] text-ink-muted">
              Seçilen {secili.size} workspace’in hepsinde bu rol verilecek. Farklı
              rol gerekiyorsa ayrı ayrı atayın.
            </span>
          )}
        </label>

        {hata && <p className="text-xs text-danger">{hata}</p>}

        {/* KISMİ BAŞARI TEK TEK YAZILI. "5 workspace atandı" deyip altıncıyı
            yutmak, atandığı sanılan yerde hiçbir şey görememek demek. */}
        {sonuc && (
          <div
            className={`rounded-lg px-3 py-2 text-[11px] ${
              sonuc.hatalar.length > 0
                ? 'border border-danger/30 bg-danger/5 text-danger'
                : 'bg-surface-sunken text-ink-muted'
            }`}
          >
            <p>
              <strong>{sonuc.basarili}</strong> workspace’e yetki verildi.
            </p>
            {sonuc.hatalar.length > 0 && (
              <ul className="mt-1 list-disc pl-4">
                {sonuc.hatalar.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => void ata()}
          disabled={busy || userId === '' || secili.size === 0}
          className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-40"
        >
          {busy
            ? 'Atanıyor…'
            : `Yetkilendir${secili.size > 0 ? ` (${secili.size})` : ''}`}
        </button>
      </div>
    </Modal>
  );
}

/**
 * ÜYE BİLGİSİ DÜZENLEME — ad, e-posta, parola.
 *
 * Rol BURADA YOK: bir kişi bir müşteride yönetici, başkasında görüntüleyici
 * olabiliyor. Rolü kullanıcıya bağlamak o kuralı sessizce bozardı; yetki
 * workspace kartındaki seçicide kalıyor.
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
    <Modal baslik={`${member.fullName ?? member.email} — bilgileri`} onKapat={onKapat}>
      <div className="space-y-3">
        <Alan etiket="Ad soyad" value={ad} onChange={setAd} />
        <Alan etiket="E-posta" type="email" value={eposta} onChange={setEposta} />
        <Alan
          etiket="Yeni parola (boş bırakırsan değişmez)"
          type="password"
          value={parola}
          onChange={setParola}
        />

        {/* PAROLA DEĞİŞİNCE AÇIK OTURUM DÜŞMÜYOR — bilinen eksik, gizlenmiyor. */}
        {parola !== '' && (
          <p className="rounded-lg bg-warn/10 px-3 py-2 text-[11px] text-warn">
            Parola değişse de kullanıcının açık oturumu düşmüyor; çalışmaya devam
            eder. Erişimi hemen kesmek gerekiyorsa yetkisini kaldır.
          </p>
        )}

        {hata && <p className="text-xs text-danger">{hata}</p>}

        <button
          type="button"
          onClick={() => void kaydet()}
          disabled={busy || !degisti || (parola !== '' && parola.length < 10)}
          className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-40"
        >
          {busy ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>
    </Modal>
  );
}

function Alan({
  etiket,
  value,
  onChange,
  type = 'text',
}: {
  etiket: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] text-ink-muted">{etiket}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm"
      />
    </label>
  );
}
