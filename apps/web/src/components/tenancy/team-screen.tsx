'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ROLES, type Role } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { ROLE_TR, type MemberRow } from '@/components/tenancy/team-manager';

interface ClientOption {
  id: string;
  name: string;
}

/**
 * EKİP EKRANI — WORKSPACE'LER KART, KULLANICILAR İÇLERİNDE.
 *
 * Önceki düzen her KULLANICIYI ayrı bir kart olarak basıyordu ve ekranda
 * gerçekten sorulan soru cevapsız kalıyordu: "bu workspace'e kim erişiyor".
 * Kullanıcı sayısı arttıkça liste uzuyor, bir müşterinin ekibini görmek için
 * kartları tek tek okumak gerekiyordu.
 *
 * İKİ AYRI KÜME ve ayrımı ÜYELİK KAPSAMI belirliyor:
 *   · AJANS EKİBİ — org geneli üyeliği olanlar (`clientId === null`).
 *     Reklamcılar ve yöneticiler; bir workspace'e ait değiller.
 *   · WORKSPACE ÜYELERİ — üyeliği bir müşteriye bağlı olanlar.
 *
 * Ayrım e-posta alan adına ya da role BAKMIYOR: ajans personeline bir
 * müşteride rol verilebiliyor ve müşteri tarafından biri asla org geneli
 * üyelik almıyor. Kapsam tek doğru ölçüt.
 */
export function TeamScreen({
  members,
  clients,
  currentUserId,
  canManage,
}: {
  members: MemberRow[];
  clients: ClientOption[];
  currentUserId: string;
  canManage: boolean;
}) {
  const [ekleAcik, setEkleAcik] = useState(false);
  const [duzenlenen, setDuzenlenen] = useState<MemberRow | null>(null);
  const [atanan, setAtanan] = useState<MemberRow | null>(null);

  /*
   * AJANS EKİBİ = ORG GENELİ ÜYELİĞİ OLANLAR + HİÇ ÜYELİĞİ OLMAYANLAR.
   *
   * İkinci kısım bir hatayı kapatıyor: ilk sürüm yalnızca org geneli üyeliği
   * olanları alıyordu ve HİÇBİR ÜYELİĞİ OLMAYAN kullanıcı iki listede de
   * çıkmıyordu. Üstteki sayaç "4 kullanıcı" derken ekranda bir kişi
   * görünüyordu — kullanıcı var, hiçbir yerde yok.
   *
   * Bu hâl istisna da değil: ajans personeli önce açılıyor, yetkisi sonra
   * veriliyor. Yetkisiz kalan kişi tam da "Danışman ata" ile bir workspace'e
   * bağlanacak olan.
   */
  const ajansEkibi = useMemo(
    () =>
      members.filter(
        (m) => m.memberships.length === 0 || m.memberships.some((x) => x.clientId === null),
      ),
    [members],
  );

  /*
   * HİÇBİR LİSTEYE DÜŞMEYEN KALDI MI — sessiz kaybolmaya karşı.
   * Yalnızca müşteriye bağlı üyeliği olan biri workspace kartında görünüyor;
   * burada sayılan, ikisine de girmeyenler.
   */
  const kayipSayisi =
    members.length -
    new Set([
      ...ajansEkibi.map((m) => m.id),
      ...clients.flatMap((c) =>
        members.filter((m) => m.memberships.some((x) => x.clientId === c.id)).map((m) => m.id),
      ),
    ]).size;

  const workspaceler = useMemo(
    () =>
      clients.map((c) => ({
        ...c,
        uyeler: members.filter((m) => m.memberships.some((x) => x.clientId === c.id)),
      })),
    [clients, members],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-5 py-3.5 text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span>
            <strong>{members.length}</strong> kullanıcı
          </span>
          <span className="text-ink-muted">
            <strong className="text-ink">{clients.length}</strong> müşteri
          </span>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setEkleAcik(true)}
            className="rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white transition"
          >
            + Kullanıcı ekle
          </button>
        )}
      </div>

      {/* SESSİZ KAYBOLMA UYARISI. Bu sayı sıfırdan büyükse listelerden biri
          eksik demektir ve sayaçla ekran birbirini tutmuyor. */}
      {kayipSayisi > 0 && (
        <p className="rounded-lg bg-warn/10 px-4 py-2.5 text-xs text-warn">
          {kayipSayisi} kullanıcı hiçbir listede görünmüyor. Bu bir arıza —
          ekrandaki sayı ile listeler birbirini tutmuyor.
        </p>
      )}

      <section>
        <h2 className="text-sm font-semibold text-ink">Ajans ekibi</h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          Bütün müşterilere erişimi olan hesaplar — reklamcılar ve yöneticiler.
        </p>
        {ajansEkibi.length === 0 ? (
          <p className="mt-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink-muted">
            Org geneli erişimi olan kimse yok.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {ajansEkibi.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {m.fullName ?? m.email}
                    {m.id === currentUserId && (
                      <span className="ml-1.5 text-xs font-normal text-ink-muted">(siz)</span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-ink-muted">{m.email}</span>
                </span>
                <span className="shrink-0 text-xs text-ink-muted">
                  {m.memberships.length === 0 ? (
                    /* YETKİSİZ HESAP SESSİZ KALMIYOR: giriş yapabiliyor ama
                       panelde hiçbir veri göremiyor ve sebebi yalnızca
                       burada yazılı. */
                    <span className="text-warn">yetkisi yok</span>
                  ) : (
                    m.memberships
                      .filter((x) => x.clientId === null)
                      .map((x) => ROLE_TR[x.role])
                      .join(', ')
                  )}
                </span>
                {canManage && (
                  <>
                    <button
                      type="button"
                      onClick={() => setAtanan(m)}
                      className="shrink-0 text-xs font-medium text-brand-strong hover:underline"
                    >
                      Danışman ata
                    </button>
                    <button
                      type="button"
                      onClick={() => setDuzenlenen(m)}
                      className="shrink-0 text-xs text-ink-muted transition hover:text-ink"
                    >
                      Düzenle
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-ink">Workspace’ler</h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          Bir workspace’e tıkla, o müşteriye erişimi olanları gör.
        </p>
        {workspaceler.length === 0 ? (
          <p className="mt-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink-muted">
            Henüz müşteri yok.
          </p>
        ) : (
          <ul className="mt-3 grid items-start gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {workspaceler.map((w) => (
              <li key={w.id}>
                <WorkspaceKarti
                  workspace={w}
                  currentUserId={currentUserId}
                  canManage={canManage}
                  onDuzenle={setDuzenlenen}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {ekleAcik && (
        <KullaniciEkleModal clients={clients} onKapat={() => setEkleAcik(false)} />
      )}
      {duzenlenen && (
        <UyeDuzenleModal member={duzenlenen} onKapat={() => setDuzenlenen(null)} />
      )}
      {atanan && (
        <DanismanAtaModal
          member={atanan}
          clients={clients}
          onKapat={() => setAtanan(null)}
        />
      )}
    </div>
  );
}

/**
 * WORKSPACE KARTI — kapalıyken tek satır.
 *
 * Kapalı hâlde yalnızca ad ve üye sayısı duruyor; asıl soru ("kim erişiyor")
 * tıklanınca cevaplanıyor. Beş müşteride üye listelerini birden basmak,
 * ekranı yine kullanıcı listesine çevirirdi.
 */
function WorkspaceKarti({
  workspace,
  currentUserId,
  canManage,
  onDuzenle,
}: {
  workspace: ClientOption & { uyeler: MemberRow[] };
  currentUserId: string;
  canManage: boolean;
  onDuzenle: (m: MemberRow) => void;
}) {
  const router = useRouter();
  const [acik, setAcik] = useState(false);
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
      setHata(e instanceof ApiRequestError ? e.message : 'İşlem başarısız oldu.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setAcik((v) => !v)}
        aria-expanded={acik}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition hover:bg-surface-sunken"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-ink">{workspace.name}</span>
          <span className="block text-[11px] text-ink-muted">
            {workspace.uyeler.length === 0
              ? 'erişimi olan yok'
              : `${workspace.uyeler.length} kişi erişiyor`}
          </span>
        </span>
        <span className="shrink-0 text-[11px] text-ink-muted">{acik ? 'kapat' : 'aç'}</span>
      </button>

      {acik && (
        <div className="border-t border-line px-4 py-3">
          {hata && <p className="mb-2 text-xs text-danger">{hata}</p>}

          {workspace.uyeler.length === 0 ? (
            /* SEBEBİ YAZILI: boş liste "kimse yok" ile "yetki verilmedi"
               arasında ayrım yapmıyordu. */
            <p className="text-xs text-ink-muted">
              Bu workspace’e kimse atanmamış. Ajans ekibi zaten bütün
              müşterileri görüyor; buraya yalnızca o müşteriye özel erişim
              verilenler düşüyor.
            </p>
          ) : (
            <ul className="space-y-2">
              {workspace.uyeler.map((m) => {
                const uyelik = m.memberships.find((x) => x.clientId === workspace.id)!;
                const kendisi = m.id === currentUserId;

                return (
                  <li key={m.id} className="rounded-lg border border-line px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink">
                          {m.fullName ?? m.email}
                        </span>
                        <span className="block truncate text-[11px] text-ink-muted">
                          {m.email}
                        </span>
                      </span>

                      <select
                        value={uyelik.role}
                        disabled={!canManage || busy !== null || isPending || kendisi}
                        onChange={(e) =>
                          void calistir(`r-${uyelik.id}`, () =>
                            apiFetch(`/memberships/${uyelik.id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ role: e.target.value }),
                            }),
                          )
                        }
                        className="shrink-0 rounded-lg border border-line bg-surface px-2 py-1 text-[11px] disabled:opacity-50"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_TR[r as Role]}
                          </option>
                        ))}
                      </select>

                      {canManage && (
                        <>
                          <button
                            type="button"
                            onClick={() => onDuzenle(m)}
                            className="shrink-0 text-[11px] font-medium text-brand-strong hover:underline"
                          >
                            Düzenle
                          </button>
                          <button
                            type="button"
                            disabled={busy !== null || isPending || kendisi}
                            onClick={() =>
                              void calistir(`d-${uyelik.id}`, () =>
                                apiFetch(`/memberships/${uyelik.id}`, { method: 'DELETE' }),
                              )
                            }
                            className="shrink-0 text-[11px] text-ink-muted transition hover:text-danger disabled:opacity-40"
                          >
                            Kaldır
                          </button>
                        </>
                      )}
                    </div>

                    {/* KENDİ YETKİNİ DEĞİŞTİREMİYORSUN: tek yöneticinin kendini
                        düşürmesi, panelden geri alınamayan bir kilitlenme. */}
                    {kendisi && (
                      <p className="mt-1 text-[10px] text-ink-muted">
                        Kendi yetkinizi bu ekrandan değiştiremezsiniz.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
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
  const orgGeneliOlabilir = rol === 'owner' || rol === 'admin';

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
              // Org geneli seçilemeyen bir role geçilince kapsam sıfırlanıyor:
              // aksi hâlde sunucu reddeder ve sebebi ekranda görünmezdi.
              if (yeni !== 'owner' && yeni !== 'admin' && clientId === '') setClientId('');
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
              Tüm müşteriler {orgGeneliOlabilir ? '' : '(yalnızca Sahip/Yönetici)'}
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

/**
 * DANIŞMAN ATA — ajans personelini bir workspace'e bağlar.
 *
 * NEDEN KISAYOL: ajans çalışanı önce açılıyor, yetkisi sonra veriliyor. O
 * arada kişi hiçbir müşteriyi göremiyor ve yetkiyi vermenin yolu workspace
 * kartını açıp "yetki ekle" aramaktı. Kısayol kişiden başlıyor: "bu kişiyi
 * hangi müşteriye, hangi rolle".
 *
 * ORG GENELİ ERİŞİM BURADAN VERİLMİYOR. Bu ekran "bir müşteriye ata" işi;
 * bütün müşterilere erişim ayrı bir karar ve `owner`/`admin` rolü gerektiriyor
 * — sunucu da öyle uyguluyor (`createMembershipSchema`). Buradan seçilebilse
 * bir danışman atama işlemi sessizce org yöneticisi üretebilirdi.
 */
function DanismanAtaModal({
  member,
  clients,
  onKapat,
}: {
  member: MemberRow;
  clients: ClientOption[];
  onKapat: () => void;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState('');
  const [rol, setRol] = useState<Role>('manager');
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  /*
   * ZATEN YETKİSİ OLAN MÜŞTERİLER LİSTEDE YOK. Sunucu ikinci bir üyeliği
   * "zaten bu kapsamda erişimi var" diye reddediyor; seçilebilir bırakmak,
   * kullanıcıyı tıklayıp hata almaya göndermek olurdu.
   */
  const secilebilir = clients.filter(
    (c) => !member.memberships.some((m) => m.clientId === c.id),
  );

  async function ata(): Promise<void> {
    setBusy(true);
    setHata(null);
    try {
      await apiFetch('/memberships', {
        method: 'POST',
        body: JSON.stringify({ userId: member.id, clientId, role: rol }),
      });
      router.refresh();
      onKapat();
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Atama başarısız oldu.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal baslik={`${member.fullName ?? member.email} — danışman ata`} onKapat={onKapat}>
      <div className="space-y-3">
        {secilebilir.length === 0 ? (
          <p className="rounded-lg bg-surface-sunken px-3 py-2 text-sm text-ink-muted">
            Bu kişinin zaten bütün müşterilerde yetkisi var.
          </p>
        ) : (
          <>
            <label className="block">
              <span className="text-[11px] text-ink-muted">Workspace</span>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="mt-0.5 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm"
              >
                <option value="">Seçin…</option>
                {secilebilir.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-[11px] text-ink-muted">Rol</span>
              <select
                value={rol}
                onChange={(e) => setRol(e.target.value as Role)}
                className="mt-0.5 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm"
              >
                {/* ORG GENELİ ROLLER YOK: bu ekran bir müşteriye atama işi. */}
                {ROLES.filter((r) => r !== 'owner' && r !== 'admin').map((r) => (
                  <option key={r} value={r}>
                    {ROLE_TR[r as Role]}
                  </option>
                ))}
              </select>
            </label>

            {hata && <p className="text-xs text-danger">{hata}</p>}

            <button
              type="button"
              onClick={() => void ata()}
              disabled={busy || clientId === ''}
              className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-40"
            >
              {busy ? 'Atanıyor…' : 'Ata'}
            </button>
          </>
        )}
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
