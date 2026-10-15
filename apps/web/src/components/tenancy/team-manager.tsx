'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ORG_SCOPED_ROLES,
  SIRKET_ROLLERI,
  WORKSPACE_ROLLERI,
  bicimKodu,
  rolAciklamasi,
  rolEtiketi,
  type Dil,
  type Role,
} from '@advetics/shared';
import { apiFetch } from '@/lib/api';
import { erisimYasi } from '@/lib/erisim-yasi';
import { Dugme } from '@/components/ui/dugme';
import { Girdi, Secim } from '@/components/ui/alan';
import { Serit } from '@/components/ui/hal';
import { Uyari } from '@/components/ui/uyari';
import { useDil, useSozluk } from '@/dil/saglayici';
import { ekipSozlugu } from '@/dil/sozlukler/ayarlar-ekip';

/**
 * Ekip yönetimi — kullanıcı ekleme, rol değiştirme, yetki kaldırma.
 *
 * Yetki MÜŞTERİ BAZINDA veriliyor. Bir kişi A müşterisinde kampanya yöneticisi,
 * B'de yalnızca görüntüleyici olabilir; bu yüzden düzenlenen şey kullanıcı
 * değil, kullanıcı × müşteri eşleşmesi (membership).
 */

/*
 * ROL ETİKETLERİ VE AÇIKLAMALARI `@advetics/shared`TAN, EKRANIN DİLİNDE
 * (`rolEtiketi(r, dil)`, `rolAciklamasi(r, dil)`). Eski takma adlar
 * (`ROLE_TR`, `ROLE_HINT`) Türkçe tabloyu doğrudan veriyordu; İngilizce
 * ekranda Türkçe rol adı görünürdü, kaldırıldılar.
 */

/**
 * Kapsama göre seçilebilir roller — `roles.ts`teki listelerden.
 *
 * Şirket geneli ("Tüm workspace’ler") seçiliyken Müşteri hesabı yok (sınırı
 * tek workspace), tek workspace seçiliyken Yönetici yok (yöneticilik
 * `clientId: null` bir satır ister; tek workspace'e bağlı bir "yönetici"
 * hiçbir yönetim kapısını açamaz ve ekranda yalan söylerdi).
 */
export function kapsamRolleri(clientId: string): readonly Role[] {
  return clientId === '' ? SIRKET_ROLLERI : WORKSPACE_ROLLERI;
}

const ORG_WIDE_ROLES: readonly Role[] = ORG_SCOPED_ROLES;

interface ClientOption {
  id: string;
  name: string;
}

interface MembershipRow {
  id: string;
  role: Role;
  /** Üyeliğin ait olduğu ŞİRKET — danışman birden çok şirkette olabiliyor. */
  orgId: string;
  clientId: string | null;
  client: { id: string; name: string } | null;
}

export interface MemberRow {
  id: string;
  email: string;
  fullName: string | null;
  status: string;
  lastLoginAt: string | null;
  /**
   * İki adımlı doğrulama açık mı. Opsiyonel: bu tip başka uçlardan da
   * dolduruluyor ve alanı taşımayan bir yanıt "kapalı" DEMEK DEĞİL —
   * ekran `undefined`da rozet basmıyor.
   */
  mfaEnabled?: boolean;
  memberships: MembershipRow[];
  /**
   * AKTİF üst hesaptaki üyelik — varsa. Üst hesaba eklenen Yönetici'nin bu
   * şirkette `memberships` satırı yok; bu alan olmadan ekran ona "yetkisi
   * yok" yazıyordu.
   */
  managerMemberships?: Array<{ id: string; role: Role }>;
}

function formatDate(value: string | null, dil: Dil, hic: string): string {
  if (!value) return hic;
  return new Date(value).toLocaleDateString(bicimKodu(dil), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function TeamManager({
  members,
  clients,
  currentUserId,
  ekleKapali = false,
}: {
  members: MemberRow[];
  clients: ClientOption[];
  currentUserId: string;
  /**
   * Ekleme formu katlanmış ve listenin ALTINDA. Marka Merkezi'nde ekip
   * kartı bir kurulum ekranının parçası; açık form kartın üçte ikisini
   * kaplıyor ve asıl soru olan "kimin erişimi var" listesini aşağı itiyordu.
   */
  ekleKapali?: boolean;
}) {
  const router = useRouter();
  const { dil } = useDil();
  const t = useSozluk(ekipSozlugu);
  const d = t.yonetici;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('ad_manager');
  const [clientId, setClientId] = useState<string>('');
  const [notice, setNotice] = useState<string | null>(null);

  const orgWideAllowed = ORG_WIDE_ROLES.includes(role);

  async function run(key: string, fn: () => Promise<unknown>): Promise<void> {
    setBusy(key);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : d.islemTamamlanamadi);
    } finally {
      setBusy(null);
    }
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes('@')) {
      setError(d.gecersizEposta);
      return;
    }
    if (fullName.trim().length < 2) {
      setError(d.adSoyadGirin);
      return;
    }
    // Sunucudaki kuralın AYNISI. Formu gönderip 400 almak yerine burada
    // durmak, kullanıcıya parolayı yeniden yazdırmıyor.
    if (password.length < 12 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError(d.parolaKurali);
      return;
    }
    // Org geneli seçimi yalnızca izin veren rollerde gönderilir; diğerlerinde
    // müşteri seçilmesi ZORUNLU, çünkü müşterisiz bir manager hiçbir şey
    // göremez ve bu sessizce "çalışmıyor" gibi görünür.
    if (!clientId && !orgWideAllowed) {
      setError(d.workspaceSecin);
      return;
    }

    await run('add', async () => {
      const res = await apiFetch<{ created: boolean }>('/members', {
        method: 'POST',
        body: JSON.stringify({
          email: trimmed,
          fullName: fullName.trim(),
          password,
          role,
          clientId: clientId || null,
        }),
      });
      setEmail('');
      setFullName('');
      setPassword('');
      if (!res.created) {
        setNotice(d.zatenKayitli(trimmed));
      }
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <Serit ton="hata" baslik={d.islemTamamlanamadiBaslik}>
          {error}
        </Serit>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Kullanıcı ekle                                                   */}
      {/* ---------------------------------------------------------------- */}
      {!ekleKapali && ekleFormu()}

      {/* ---------------------------------------------------------------- */}
      {/* Kullanıcılar                                                     */}
      {/* ---------------------------------------------------------------- */}
      {uyeListesi()}

      {ekleKapali && (
        <details className="rounded-kart border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-brand-strong">
            {d.kullaniciEkle}
          </summary>
          <div className="border-t border-line p-1">{ekleFormu()}</div>
        </details>
      )}
    </div>
  );

  function ekleFormu() {
    return (
      <form onSubmit={addMember} className="rounded-kart border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">{d.kullaniciEkleBaslik}</h2>
        <p className="mt-1 text-xs text-ink-muted">{d.anindaOlusur}</p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Girdi
            type="text"
            aria-label={d.adSoyad}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={d.adSoyad}
            disabled={busy !== null}
          />

          <Girdi
            type="email"
            aria-label={t.ortak.eposta}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={d.ornekEposta}
            disabled={busy !== null}
          />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {/*
            PAROLA GİZLENMİYOR (type="text").

            Bunu yönetici kullanıcıya ELDEN iletecek; göremediği bir şeyi
            doğru iletemez. Gizlemek "bir daha yaz" alanı ya da göz simgesi
            gerektirirdi ve ikisi de aynı bilgiyi ekrana getirmenin daha
            dolambaçlı yolu. Kendi parolası değil, üçüncü birinin geçici
            parolası.
          */}
          <Girdi
            type="text"
            aria-label={t.ortak.parola}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={d.parolaYer}
            autoComplete="off"
            disabled={busy !== null}
          />

          <Secim
            aria-label={t.ortak.rol}
            value={role}
            onChange={(e) => {
              const next = e.target.value as Role;
              setRole(next);
              // Rol org geneline izin vermiyorsa ve "tüm müşteriler" seçiliyse
              // seçimi temizle — geçersiz bir kombinasyonun ekranda durması
              // kullanıcıya kaydedilebilirmiş gibi görünür.
              if (!ORG_WIDE_ROLES.includes(next) && clientId === '') setClientId('');
            }}
            disabled={busy !== null}
          >
            {kapsamRolleri(clientId).map((r) => (
              <option key={r} value={r}>
                {rolEtiketi(r, dil)}
              </option>
            ))}
          </Secim>

          <Secim
            aria-label="Workspace"
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              // Kapsam değişince rol listesi değişiyor; eski seçim yeni
              // listede yoksa ilkine düşülüyor — yoksa seçici boş görünür.
              if (!kapsamRolleri(e.target.value).includes(role)) {
                setRole(kapsamRolleri(e.target.value)[0]);
              }
            }}
            disabled={busy !== null}
          >
            {/* Uyumsuz seçenek HİÇ GÖSTERİLMİYOR. Gösterip sonra reddetmek,
                kullanıcının o hatayı yapmasına izin vermek demek. */}
            {orgWideAllowed && <option value="">{t.ortak.tumWorkspaceler}</option>}
            {!orgWideAllowed && <option value="">{t.ortak.workspaceSecin}</option>}
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Secim>
        </div>

        <p className="mt-2 text-xs text-ink-muted">{rolAciklamasi(role, dil)}</p>

        <div className="mt-3 flex items-center gap-3">
          <Dugme type="submit" ton="koyu" disabled={busy !== null || email.trim().length === 0}>
            {busy === 'add' ? d.ekleniyor : d.kullaniciyiEkle}
          </Dugme>
          <span className="text-xs text-ink-muted">{d.zorlanmiyor}</span>
        </div>

        {/*
          MEVCUT KULLANICIYA YETKİ EKLENDİYSE BUNU SÖYLÜYORUZ.

          Aynı e-posta zaten kayıtlıysa sunucu yeni kullanıcı OLUŞTURMUYOR,
          yalnızca yeni yetkiyi ekliyor ve parolaya dokunmuyor. Söylenmezse
          yönetici yazdığı parolanın geçerli olduğunu sanır ve kullanıcı giriş
          yapamayınca ikisi de yanlış yerde arar.
        */}
        {notice && (
          <div className="mt-3">
            <Uyari ton="uyari">{notice}</Uyari>
          </div>
        )}
      </form>
    );
  }

  function uyeListesi() {
    return (
      <>
      {/*
        ÜYE KARTLARI IZGARADA. Dikey yığında her kart satırın tamamını
        kaplıyordu ve içindeki bilgi (ad, e-posta, son giriş) satırın
        solunda bitip sağda ölü alan bırakıyordu. İki kolonda kart genişliği
        içeriğe yaklaşıyor; xl'de üç kolon, çünkü altındaki yetki listesi
        daha dar bir kartta kırılıyor.
      */}
      <ul className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3 items-start">
        {members.map((member) => {
          const isSelf = member.id === currentUserId;

          return (
            <li key={member.id} className="rounded-kart border border-line bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">
                    {member.fullName ?? member.email}
                    {isSelf && <span className="ml-2 text-xs text-ink-muted">{d.siz}</span>}
                  </p>
                  <p className="truncate text-sm text-ink-muted">{member.email}</p>
                </div>
                <div className="grid justify-items-end gap-0.5 text-right">
                  <p className="text-xs text-ink-muted">{d.sonGiris(formatDate(member.lastLoginAt, dil, t.ortak.hicGirisYapmadi))}</p>
                  {/* AYRILANIN ERİŞİMİ: 90 gün işaretli, hiç girmeyen ayrı (`erisimYasi`). */}
                  {(() => {
                    const y = erisimYasi(member.lastLoginAt, undefined, dil);
                    return y ? (
                      <p className={`text-xs ${y.tur === 'uzun' ? 'font-semibold text-danger-strong' : 'text-ink-muted'}`} data-erisim={y.tur}>
                        {y.metin}
                      </p>
                    ) : null;
                  })()}
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {member.memberships.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-wrap items-center gap-2 rounded-alan border border-line bg-surface-muted px-3 py-2"
                  >
                    <span className="flex-1 text-sm font-medium text-ink">
                      {m.client?.name ?? t.ortak.tumWorkspaceler}
                    </span>

                    <Secim
                      aria-label={t.ortak.rolEtiketi(m.client?.name ?? t.ortak.tumWorkspaceler)}
                      value={m.role}
                      disabled={busy !== null || isSelf}
                      onChange={(e) =>
                        run(`m-${m.id}`, () =>
                          apiFetch(`/memberships/${m.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ role: e.target.value }),
                          }),
                        )
                      }
                      className="!h-8 !w-auto text-13"
                    >
                      {kapsamRolleri(m.clientId ?? '').map((r) => (
                        <option key={r} value={r}>
                          {rolEtiketi(r, dil)}
                        </option>
                      ))}
                    </Secim>

                    <Dugme
                      ton="tehlike"
                      boyut="kucuk"
                      disabled={busy !== null || isSelf}
                      onClick={() =>
                        run(`d-${m.id}`, () =>
                          apiFetch(`/memberships/${m.id}`, { method: 'DELETE' }),
                        )
                      }
                    >
                      {t.ortak.kaldir}
                    </Dugme>
                  </div>
                ))}

                {/*
                  KENDİ YETKİNİ DEĞİŞTİREMİYORSUN ve bu bilinçli. Tek yöneticinin
                  kendini analiste düşürmesi ya da yetkisini kaldırması, kimsenin
                  geri alamayacağı bir kilitlenme üretir — düzeltmek için
                  sunucuda SQL çalıştırmak gerekir.
                */}
                {isSelf && (
                  <p className="text-xs text-ink-muted">{d.kendiYetkiniz}</p>
                )}

                {member.memberships.length === 0 && (
                  <p className="rounded-alan bg-surface-muted px-3 py-2 text-xs text-ink-muted">{d.hicbirWorkspace}</p>
                )}

                {/*
                  YETKİ EKLEME KARTIN İÇİNDE ve PAROLA SORMUYOR.

                  Önceden var olan birine yetki vermenin tek yolu üstteki
                  "Kullanıcı ekle" formuna onun e-postasını yazmaktı — ve o form
                  parolayı zorunlu istediği için yönetici hiçbir yere yazılmayan
                  bir parola uydurmak zorunda kalıyordu. Uydurulup yok sayılan
                  bir alan, arayüzün en hızlı güven kaybetme yolu.

                  Zaten yetkisi olan müşteriler listeden ÇIKARILIYOR: sunucu
                  mükerrer kaydı reddediyor ve reddedileceği belli olan bir
                  seçeneği göstermek, kullanıcıyı hata almaya davet etmek olurdu.
                */}
                <GrantAccess
                  userId={member.id}
                  clients={clients.filter(
                    (c) => !member.memberships.some((m) => m.clientId === c.id),
                  )}
                  hasOrgWide={member.memberships.some((m) => m.clientId === null)}
                  disabled={busy !== null}
                  onDone={() => router.refresh()}
                  onError={setError}
                />
              </div>
            </li>
          );
        })}
      </ul>
      </>
    );
  }
}

/**
 * Tek bir kullanıcıya müşteri yetkisi verir — parola SORMADAN.
 *
 * Ayrı bileşen çünkü kendi küçük durumu var (açık mı, hangi müşteri, hangi
 * rol) ve bu durumu üst bileşende her kullanıcı için ayrı ayrı tutmak,
 * listedeki 3 kullanıcı için 3 kat state demek olurdu.
 *
 * Kapalı başlıyor: ekip ekranının asıl işi "kimde ne var" sorusunu
 * cevaplamak; her kartta açık duran bir form o cevabı gürültüye boğardı.
 */
function GrantAccess({
  userId,
  clients,
  hasOrgWide,
  disabled,
  onDone,
  onError,
}: {
  userId: string;
  /** Zaten yetkisi OLMAYAN müşteriler — mükerrer seçenek gösterilmiyor. */
  clients: ClientOption[];
  /** Org geneli yetkisi zaten varsa "Tüm müşteriler" ikinci kez verilemez. */
  hasOrgWide: boolean;
  disabled: boolean;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clientId, setClientId] = useState('');
  const [role, setRole] = useState<Role>('ad_manager');
  const { dil } = useDil();
  const t = useSozluk(ekipSozlugu);
  const d = t.yonetici;

  const orgWideAllowed = ORG_WIDE_ROLES.includes(role);
  const nothingLeft = clients.length === 0 && (hasOrgWide || !orgWideAllowed);

  async function submit() {
    if (!clientId && !orgWideAllowed) {
      onError(d.workspaceSecin);
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/memberships', {
        method: 'POST',
        body: JSON.stringify({ userId, role, clientId: clientId || null }),
      });
      setOpen(false);
      setClientId('');
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : d.yetkiEklenemedi);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Dugme
        ton="hayalet"
        boyut="kucuk"
        onClick={() => setOpen(true)}
        disabled={disabled || nothingLeft}
        title={nothingLeft ? d.tumundeYetki : undefined}
      >
        {d.yetkiEkle}
      </Dugme>
    );
  }

  return (
    <div className="rounded-alan border border-line bg-surface-muted p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Secim
          aria-label={t.ortak.rol}
          value={role}
          onChange={(e) => {
            const next = e.target.value as Role;
            setRole(next);
            if (!ORG_WIDE_ROLES.includes(next) && clientId === '') setClientId('');
          }}
          disabled={saving}
          className="!h-8 !w-auto text-13"
        >
          {kapsamRolleri(clientId).map((r) => (
            <option key={r} value={r}>
              {rolEtiketi(r, dil)}
            </option>
          ))}
        </Secim>

        <Secim
          aria-label="Workspace"
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value);
            if (!kapsamRolleri(e.target.value).includes(role)) {
              setRole(kapsamRolleri(e.target.value)[0]);
            }
          }}
          disabled={saving}
          className="!h-8 !w-auto min-w-0 flex-1 text-13"
        >
          {orgWideAllowed && !hasOrgWide && <option value="">{t.ortak.tumWorkspaceler}</option>}
          {(!orgWideAllowed || hasOrgWide) && <option value="">{t.ortak.workspaceSecin}</option>}
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Secim>

        <Dugme ton="koyu" boyut="kucuk" onClick={() => void submit()} bekliyor={saving}>
          {t.ortak.ekle}
        </Dugme>
        <Dugme ton="hayalet" boyut="kucuk" onClick={() => setOpen(false)} disabled={saving}>
          {t.ortak.vazgec}
        </Dugme>
      </div>

      <p className="mt-2 text-[11px] text-ink-muted">{rolAciklamasi(role, dil)}</p>

      {/* MÜŞTERİ YOKSA SEBEBİ YAZILI. Boş bir seçici, "yetki veremiyorum"
          sorusunun cevabını hiçbir yerde bırakmazdı. */}
      {clients.length === 0 && (
        <p className="mt-1.5 text-[11px] text-warn-strong">{d.atanabilecekYok}</p>
      )}
    </div>
  );
}
