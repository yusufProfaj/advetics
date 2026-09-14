'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ROL_ETIKETI,
  UST_HESAP_ROLLERI,
  type Role,
  type UstHesapUyesi,
  type UstHesapUyesiEklemeYaniti,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { RolAciklamasi } from './rol-matrisi';

/**
 * ═══ ÜST HESAP EKİBİ — bütün şirketleri kim yönetiyor ═══
 *
 * Ekip ekranındaki kişi rayı ŞİRKET içindeki kullanıcıları listeliyor
 * (`/members`, RLS ile aktif şirkete çivili). Üst hesaba eklenen bir
 * Yönetici'nin ev şirketi başka bir şirket olabiliyor ve o rayda hiç
 * görünmüyor — oysa bütün şirketleri yöneten kişi o. Bu bölüm o boşluğu
 * kapatıyor: `/manager-account/members`.
 *
 * Kullanıcının isteği birebir: *"o üst hesaba bir yetki atamamız lazım
 * (kişi hesabı eklememiz lazım ki yönetebilsin) sadece kendi şirketlerini
 * ve reklam hesaplarını görecek."*
 *
 * ROLLER `UST_HESAP_ROLLERI`NDEN: Yönetici ya da Reklam Yöneticisi. Müşteri
 * hesabı burada seçilemiyor — sınırı tek workspace.
 */
export function UstHesapEkibi({
  hesapAdi,
  uyeler,
  yonetebilir,
  yuklemeHatasi,
}: {
  hesapAdi: string;
  uyeler: UstHesapUyesi[];
  /** Platform sahibi ya da üst hesabın Yöneticisi. */
  yonetebilir: boolean;
  /** Liste çekilemediyse sebebi — boş liste ile karışmasın. */
  yuklemeHatasi: string | null;
}) {
  const router = useRouter();
  const [ekleAcik, setEkleAcik] = useState(false);
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

  const yoneticiSayisi = uyeler.filter((u) => u.role === 'admin').length;

  return (
    <section className="rounded-xl border border-line bg-surface">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">
            Üst hesap ekibi — {hesapAdi}
            {/* SESSİZ KESME YOK: kaç kişi ve kaçının Yönetici olduğu yazılı. */}
            <span className="ml-2 text-xs font-normal text-ink-muted">
              {uyeler.length} kişi · {yoneticiSayisi} Yönetici
            </span>
          </h2>
          <p className="mt-0.5 max-w-prose text-[11px] text-ink-muted">
            Buradaki kişiler üst hesabın ALTINDAKİ BÜTÜN şirketlere erişir. Yönetici
            hesabı yönetir ve kişi ekler; Reklam Yöneticisi her şirkette reklam işi
            yapar. Başka bir üst hesabı hiçbiri göremez.
          </p>
        </div>
        {yonetebilir && (
          <button
            type="button"
            onClick={() => setEkleAcik(true)}
            className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white"
          >
            + Üst hesaba kişi ekle
          </button>
        )}
      </header>

      {yuklemeHatasi && (
        <p role="alert" className="border-b border-line px-4 py-2 text-xs text-danger">
          Üst hesap ekibi yüklenemedi: {yuklemeHatasi}
        </p>
      )}
      {hata && (
        <p role="alert" className="border-b border-line px-4 py-2 text-xs text-danger">
          {hata}
        </p>
      )}

      {uyeler.length === 0 && !yuklemeHatasi ? (
        <p className="px-4 py-4 text-sm text-ink-muted">
          Üst hesabın henüz ekibi yok — hesabı yalnızca platform sahibi açabiliyor.
        </p>
      ) : (
        <ul className="divide-y divide-line/60">
          {uyeler.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">
                  {u.fullName}
                  {u.kendisi && <span className="ml-1.5 text-[11px] text-ink-muted">(siz)</span>}
                </span>
                <span className="block truncate text-[11px] text-ink-muted">
                  {u.email} · {u.lastLoginAt ? `son giriş ${tarih(u.lastLoginAt)}` : 'hiç giriş yapmadı'}
                </span>
              </span>

              <select
                value={u.role}
                disabled={!yonetebilir || busy !== null || isPending || u.kendisi}
                onChange={(e) =>
                  void calistir(`r-${u.id}`, () =>
                    apiFetch(`/manager-account/members/${u.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({ role: e.target.value }),
                    }),
                  )
                }
                className="shrink-0 rounded-lg border border-line bg-surface px-2 py-1 text-[11px] disabled:opacity-50"
              >
                {UST_HESAP_ROLLERI.map((r) => (
                  <option key={r} value={r}>
                    {ROL_ETIKETI[r]}
                  </option>
                ))}
              </select>

              {yonetebilir && (
                <button
                  type="button"
                  disabled={busy !== null || isPending || u.kendisi}
                  onClick={() =>
                    void calistir(`d-${u.id}`, () =>
                      apiFetch(`/manager-account/members/${u.id}`, { method: 'DELETE' }),
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

      {ekleAcik && <UstHesabaKisiEkleModal onKapat={() => setEkleAcik(false)} />}
    </section>
  );
}

function tarih(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * KİŞİ EKLEME — yoksa oluşur, varsa yalnızca üyelik alır.
 *
 * Ad ve parola alanları isteğe bağlı görünüyor çünkü var olan bir kullanıcı
 * için anlamsızlar; sunucu yeni kullanıcıda ikisini de zorunlu sayıyor ve
 * eksikse açıkça söylüyor. Hangi yolun işlediği yanıtta (`created`) yazıyor
 * ve ekranda cümleye dönüyor — "kullanıcı oluşturuldu" ile "var olan kişiye
 * yetki eklendi" farklı şeyler ve ikincisinde yazılan parola KULLANILMADI.
 */
function UstHesabaKisiEkleModal({ onKapat }: { onKapat: () => void }) {
  const router = useRouter();
  const [eposta, setEposta] = useState('');
  const [ad, setAd] = useState('');
  const [parola, setParola] = useState('');
  const [rol, setRol] = useState<Role>('admin');
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<UstHesapUyesiEklemeYaniti | null>(null);
  const kutuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onKapat();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onKapat]);

  async function gonder(): Promise<void> {
    setBusy(true);
    setHata(null);
    try {
      const r = await apiFetch<UstHesapUyesiEklemeYaniti>('/manager-account/members', {
        method: 'POST',
        body: JSON.stringify({
          email: eposta.trim(),
          role: rol,
          ...(ad.trim() !== '' ? { fullName: ad.trim() } : {}),
          ...(parola !== '' ? { password: parola } : {}),
        }),
      });
      setSonuc(r);
      router.refresh();
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Kişi eklenemedi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Üst hesaba kişi ekle"
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
          <h2 className="text-sm font-semibold text-ink">Üst hesaba kişi ekle</h2>
          <button type="button" onClick={onKapat} className="text-xs text-ink-muted hover:text-ink">
            Kapat
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {sonuc ? (
            <div className="rounded-lg bg-surface-sunken px-3 py-2 text-xs text-ink">
              <p>
                <strong>{sonuc.uyelik.fullName}</strong> ({sonuc.uyelik.email}) üst hesaba{' '}
                <strong>{ROL_ETIKETI[sonuc.uyelik.role]}</strong> olarak eklendi.
              </p>
              <p className="mt-1 text-ink-muted">
                {sonuc.created
                  ? 'Kullanıcı yeni oluşturuldu — parolayı kendin iletiyorsun, davet gönderilmiyor.'
                  : 'Bu kişi zaten kayıtlıydı; yalnızca üst hesap yetkisi eklendi, yazdığın parola KULLANILMADI.'}
              </p>
              <button
                type="button"
                onClick={onKapat}
                className="mt-2 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink"
              >
                Tamam
              </button>
            </div>
          ) : (
            <>
              <p className="rounded-lg bg-surface-sunken px-3 py-2 text-[11px] text-ink-muted">
                Eklenen kişi bu üst hesabın BÜTÜN şirketlerine erişir. E-posta kayıtlıysa
                yalnızca yetki eklenir; değilse ad soyad ve parola ile yeni kullanıcı açılır.
              </p>

              <Alan etiket="E-posta" type="email" value={eposta} onChange={setEposta} />
              <Alan etiket="Ad soyad (yeni kullanıcı için)" value={ad} onChange={setAd} />
              <Alan
                etiket="Parola (yeni kullanıcı için, en az 12 karakter)"
                type="password"
                value={parola}
                onChange={setParola}
              />

              <label className="block">
                <span className="text-[11px] text-ink-muted">Rol</span>
                <select
                  value={rol}
                  onChange={(e) => setRol(e.target.value as Role)}
                  className="mt-0.5 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm"
                >
                  {UST_HESAP_ROLLERI.map((r) => (
                    <option key={r} value={r}>
                      {ROL_ETIKETI[r]}
                    </option>
                  ))}
                </select>
                <RolAciklamasi rol={rol} />
              </label>

              {hata && <p className="text-xs text-danger">{hata}</p>}

              <button
                type="button"
                onClick={() => void gonder()}
                disabled={busy || !eposta.includes('@') || (parola !== '' && parola.length < 12)}
                className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-40"
              >
                {busy ? 'Ekleniyor…' : 'Üst hesaba ekle'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
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
