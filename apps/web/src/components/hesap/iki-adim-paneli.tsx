'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  IKI_ADIM_KURTARMA_SAYISI,
  ikiAdimKodTuru,
  type IkiAdimDurumu,
  type IkiAdimKurtarmaKodlari,
  type IkiAdimKurulumBilgisi,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { HataKutusu, KodAlani, KurtarmaKodlari, QrKurulumu } from './iki-adim-parcalari';

function hataMetni(err: unknown): string {
  return err instanceof ApiRequestError ? err.message : 'Bağlantı kurulamadı. Tekrar dene.';
}

/** Kurtarma kodu bu sayıya inince uyarı: biri kaldığında uyarmak geç. */
const AZ_KOD = 3;

type Mod =
  | { tur: 'bos' }
  | { tur: 'kurulum'; bilgi: IkiAdimKurulumBilgisi }
  | { tur: 'kapat' }
  | { tur: 'yenile' }
  | { tur: 'kodlar'; kodlar: string[] };

const BIRINCIL =
  'rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const IKINCIL =
  'rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface-sunken disabled:opacity-50';

/**
 * ═══ HESABIM › İKİ ADIMLI DOĞRULAMA ═══
 *
 * Google hesabının "2 Adımlı Doğrulama" sayfasının mantığı: durum tek
 * cümleyle en üstte, tek birincil eylem (Aç ya da Kapat), ikincil eylem
 * (kurtarma kodları) altta. Her eylem kartın İÇİNDE açılıyor; ayrı sayfa
 * yok — kullanıcı nerede olduğunu kaybetmesin.
 *
 * Kapatma ve kod yenileme GEÇERLİ KOD istiyor: açık kalmış bir tarayıcıya
 * oturan biri korumayı kaldıramamalı.
 */
export function IkiAdimPaneli({
  durum,
  kurtarmaIleGirdi,
}: {
  durum: IkiAdimDurumu;
  /** Girişte kurtarma kodu kullanıldı (`?kurtarma=1`). */
  kurtarmaIleGirdi: boolean;
}) {
  const router = useRouter();
  const [mod, setMod] = useState<Mod>({ tur: 'bos' });
  const [kod, setKod] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [bekliyor, setBekliyor] = useState(false);
  const [bilgi, setBilgi] = useState<string | null>(null);

  function sifirla(yeni: Mod = { tur: 'bos' }) {
    setMod(yeni);
    setKod('');
    setHata(null);
  }

  async function calistir(fn: () => Promise<void>) {
    setBekliyor(true);
    setHata(null);
    setBilgi(null);
    try {
      await fn();
    } catch (err) {
      setHata(hataMetni(err));
    } finally {
      setBekliyor(false);
    }
  }

  const baslat = () =>
    calistir(async () => {
      const b = await apiFetch<IkiAdimKurulumBilgisi>('/auth/2fa/kurulum', { method: 'POST' });
      sifirla({ tur: 'kurulum', bilgi: b });
    });

  const onayla = (e: React.FormEvent) => {
    e.preventDefault();
    if (ikiAdimKodTuru(kod) !== 'totp') return setHata('Uygulamadaki 6 haneli kodu yaz.');
    void calistir(async () => {
      const r = await apiFetch<IkiAdimKurtarmaKodlari>('/auth/2fa/kurulum/onay', {
        method: 'POST',
        body: JSON.stringify({ kod }),
      });
      sifirla({ tur: 'kodlar', kodlar: r.kurtarmaKodlari });
    });
  };

  const kapat = (e: React.FormEvent) => {
    e.preventDefault();
    if (ikiAdimKodTuru(kod) === null) return setHata('6 haneli kodu ya da bir kurtarma kodunu yaz.');
    void calistir(async () => {
      await apiFetch('/auth/2fa/kapat', { method: 'POST', body: JSON.stringify({ kod }) });
      sifirla();
      setBilgi('İki adımlı doğrulama kapatıldı.');
      router.refresh();
    });
  };

  const yenile = (e: React.FormEvent) => {
    e.preventDefault();
    if (ikiAdimKodTuru(kod) !== 'totp') return setHata('Uygulamadaki 6 haneli kodu yaz.');
    void calistir(async () => {
      const r = await apiFetch<IkiAdimKurtarmaKodlari>('/auth/2fa/kurtarma-kodlari', {
        method: 'POST',
        body: JSON.stringify({ kod }),
      });
      sifirla({ tur: 'kodlar', kodlar: r.kurtarmaKodlari });
    });
  };

  const azKaldi = durum.acik && durum.kalanKurtarmaKodu <= AZ_KOD;

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-ink">İki adımlı doğrulama</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            Girişte şifrenin yanında telefonundaki kodu da sorar. Şifren başkasının eline geçse bile
            hesabına giremez.
          </p>
        </div>
        {/* Yeşil yalnız durum göstergesinde (kılavuz). */}
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
            durum.acik ? 'border-ok/40 bg-ok-soft text-ok-strong' : 'border-line bg-surface-muted text-ink-muted'
          }`}
        >
          {durum.acik ? 'Açık' : 'Kapalı'}
        </span>
      </div>

      <div className="mt-4 space-y-4">
        {bilgi && (
          <p role="status" className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-ink">
            {bilgi}
          </p>
        )}

        {(kurtarmaIleGirdi || azKaldi) && durum.acik && mod.tur === 'bos' && (
          <p className="rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-warn-strong">
            {durum.kalanKurtarmaKodu === 0
              ? 'Hiç kurtarma kodun kalmadı. Yeni kodlar oluştur.'
              : `${durum.kalanKurtarmaKodu} kurtarma kodun kaldı. Yeni kodlar oluşturman iyi olur.`}
          </p>
        )}

        {mod.tur === 'bos' && !durum.acik && (
          <div className="space-y-2">
            {durum.sirketteZorunlu && (
              <p className="text-sm text-ink-muted">Şirketin bu korumayı zorunlu tutuyor.</p>
            )}
            <HataKutusu mesaj={hata} />
            <button type="button" onClick={() => void baslat()} disabled={bekliyor} className={BIRINCIL}>
              {bekliyor ? 'Hazırlanıyor…' : 'Aç'}
            </button>
          </div>
        )}

        {mod.tur === 'bos' && durum.acik && (
          <div className="space-y-3">
            <dl className="grid gap-1 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="text-ink-muted">Açıldığı tarih</dt>
              <dd className="text-ink">
                {durum.acilis
                  ? new Date(durum.acilis).toLocaleDateString('tr-TR', { dateStyle: 'medium' })
                  : '-'}
              </dd>
              <dt className="text-ink-muted">Kurtarma kodları</dt>
              <dd className="text-ink">
                {durum.kalanKurtarmaKodu} / {IKI_ADIM_KURTARMA_SAYISI} kullanılmadı
              </dd>
            </dl>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => sifirla({ tur: 'yenile' })} className={IKINCIL}>
                Yeni kurtarma kodları oluştur
              </button>
              {durum.sirketteZorunlu ? (
                <p className="self-center text-xs text-ink-muted">
                  Şirketin zorunlu tuttuğu için kapatılamaz. Telefonunu değiştirdiysen yöneticine
                  sıfırlat.
                </p>
              ) : (
                <button type="button" onClick={() => sifirla({ tur: 'kapat' })} className={IKINCIL}>
                  Kapat
                </button>
              )}
            </div>
          </div>
        )}

        {mod.tur === 'kurulum' && (
          <form onSubmit={onayla} className="space-y-4" noValidate>
            <QrKurulumu bilgi={mod.bilgi} />
            <HataKutusu mesaj={hata} />
            <div className="max-w-xs">
              <KodAlani id="hesapKurulumKod" value={kod} onChange={setKod} disabled={bekliyor} />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={bekliyor} className={BIRINCIL}>
                {bekliyor ? 'Kontrol ediliyor…' : 'Aç'}
              </button>
              <button type="button" onClick={() => sifirla()} className={IKINCIL}>
                Vazgeç
              </button>
            </div>
          </form>
        )}

        {(mod.tur === 'kapat' || mod.tur === 'yenile') && (
          <form onSubmit={mod.tur === 'kapat' ? kapat : yenile} className="space-y-3" noValidate>
            <p className="text-sm text-ink">
              {mod.tur === 'kapat'
                ? 'Kapatmak için uygulamadaki kodu ya da bir kurtarma kodunu yaz.'
                : 'Yeni kodlar oluşunca eski kurtarma kodların çalışmaz. Onaylamak için uygulamadaki kodu yaz.'}
            </p>
            <HataKutusu mesaj={hata} />
            <div className="max-w-xs">
              <KodAlani
                id="hesapKod"
                value={kod}
                onChange={setKod}
                kurtarma={mod.tur === 'kapat' && /[a-z]/i.test(kod)}
                disabled={bekliyor}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={bekliyor} className={BIRINCIL}>
                {bekliyor ? 'Kontrol ediliyor…' : mod.tur === 'kapat' ? 'Kapat' : 'Oluştur'}
              </button>
              <button type="button" onClick={() => sifirla()} className={IKINCIL}>
                Vazgeç
              </button>
            </div>
          </form>
        )}

        {mod.tur === 'kodlar' && (
          <KurtarmaKodlari
            kodlar={mod.kodlar}
            devamEtiketi="Tamam"
            onDevam={() => {
              sifirla();
              router.refresh();
            }}
          />
        )}
      </div>
    </section>
  );
}
