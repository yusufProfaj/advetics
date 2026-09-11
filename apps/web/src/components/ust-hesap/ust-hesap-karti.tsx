'use client';

import { useState } from 'react';
import {
  MANAGER_PAKETLERI,
  PAKET_SINIRLARI,
  createManagerAccountSchema,
  updateManagerAccountSchema,
  type ManagerAccountTree,
  type ManagerPaket,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Halka } from '@/components/yukleniyor';

/**
 * ═══ ÜST HESAP KARTI — hangi hesaptasın, ne paketin var, ne kadarını doldurdun ═══
 *
 * Bu ekran uzun süre yalnızca ŞİRKETLERİ gösteriyordu; üst hesabın kendisi
 * ekranda yoktu çünkü bir kullanıcının tek üst hesabı olabiliyordu ve o
 * hesap "sen"dın. Advetics'i işleten taraf üst hesabı bir ÜRÜN olarak
 * satmaya başlayınca üç soru doğdu ve üçü de burada cevaplanıyor:
 *
 *   · HANGİ hesaptayım — platform sahibi onlarca hesap arasında geziyor.
 *   · PAKETİM ne ve NE KADARINI doldurdum — "3 / 5 şirket" yazmadan, kısıta
 *     takılan kullanıcı sebebi hata mesajından öğrenirdi.
 *   · YENİ hesap nasıl açarım — platform sahibi için, paket seçerek.
 *
 * PANELLER KATLI. Şirket ekranındaki aynı ders: sürekli açık duran formlar
 * ekranı okunmaz yapıyor ("gereksiz ve karışık duruyor").
 */
export function UstHesapKarti({
  agac,
  platformAdmin,
  onGuncellendi,
}: {
  agac: ManagerAccountTree;
  /** Advetics'i işleten taraf mı — paket seçebiliyor ve yeni hesap açabiliyor. */
  platformAdmin: boolean;
  /** Ad/paket değişince ekranın ağacı tazelemesi için. */
  onGuncellendi: (agac: ManagerAccountTree) => void;
}) {
  const [panel, setPanel] = useState<'yok' | 'duzenle' | 'yeni'>('yok');
  const sinir = PAKET_SINIRLARI[agac.paket];
  const sirketSayisi = agac.organizations.length;

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
            Üst hesap
          </p>
          <h2 className="truncate text-base font-semibold text-ink">{agac.name}</h2>
          <p className="text-xs text-ink-muted">
            {sinir.etiket} paketi ·{' '}
            {/*
              DOLULUK YAZILI: "3 / 5 şirket". Sınırsızda sayı yalnız.
              Kısıta takılan kullanıcı sebebi hata mesajından değil buradan
              öğrenmeli.
            */}
            <DolulukMetni mevcut={sirketSayisi} sinir={sinir.maxSirket} birim="şirket" />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Dugme aktif={panel === 'duzenle'} onClick={() => setPanel((p) => (p === 'duzenle' ? 'yok' : 'duzenle'))}>
            Düzenle
          </Dugme>
          {/*
            YENİ HESAP YALNIZCA PLATFORM SAHİBİNDE. Kendi ajansını yöneten
            bir kullanıcı için ikinci bir üst hesabın anlamı yok — sunucu da
            reddediyor; düğmeyi göstermek tıklayınca reddedilen bir düğme
            olurdu.
          */}
          {platformAdmin && (
            <Dugme aktif={panel === 'yeni'} onClick={() => setPanel((p) => (p === 'yeni' ? 'yok' : 'yeni'))} vurgulu>
              + Yeni üst hesap
            </Dugme>
          )}
        </div>
      </div>

      {panel === 'duzenle' && (
        <div className="mt-4 border-t border-line pt-4">
          <UstHesapDuzenle
            agac={agac}
            platformAdmin={platformAdmin}
            onBitti={(yeni) => {
              onGuncellendi(yeni);
              setPanel('yok');
            }}
            onVazgec={() => setPanel('yok')}
          />
        </div>
      )}

      {panel === 'yeni' && platformAdmin && (
        <div className="mt-4 border-t border-line pt-4">
          <YeniUstHesap onVazgec={() => setPanel('yok')} />
        </div>
      )}
    </section>
  );
}

/** "3 / 5 şirket" — sınırsızda "3 şirket". `null` sınırsız demek, sıfır değil. */
export function dolulukMetni(mevcut: number, sinir: number | null, birim: string): string {
  return sinir === null ? `${mevcut} ${birim}` : `${mevcut} / ${sinir} ${birim}`;
}

function DolulukMetni({ mevcut, sinir, birim }: { mevcut: number; sinir: number | null; birim: string }) {
  const dolu = sinir !== null && mevcut >= sinir;
  return <span className={dolu ? 'font-medium text-amber-700' : ''}>{dolulukMetni(mevcut, sinir, birim)}</span>;
}

function Dugme({
  aktif,
  vurgulu,
  onClick,
  children,
}: {
  aktif: boolean;
  vurgulu?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const taban = 'rounded-lg border px-3 py-1.5 text-sm transition';
  const sinif = aktif
    ? 'border-brand bg-brand-soft text-brand'
    : vurgulu
      ? 'border-brand bg-brand text-white hover:opacity-90'
      : 'border-line text-ink hover:bg-surface-muted';
  return (
    <button type="button" onClick={onClick} aria-expanded={aktif} className={`${taban} ${sinif}`}>
      {children}
    </button>
  );
}

/** Paket seçimi — üç kart, her birinde ne aldığı yazılı. */
function PaketSecici({
  deger,
  onChange,
  disabled,
}: {
  deger: ManagerPaket;
  onChange: (p: ManagerPaket) => void;
  disabled: boolean;
}) {
  return (
    <fieldset className="grid gap-2 sm:grid-cols-3">
      <legend className="mb-1 text-[11px] text-ink-muted">Paket</legend>
      {MANAGER_PAKETLERI.map((p) => {
        const s = PAKET_SINIRLARI[p];
        const secili = p === deger;
        return (
          <label
            key={p}
            className={`cursor-pointer rounded-lg border p-3 text-left transition ${
              secili ? 'border-brand bg-brand-soft' : 'border-line hover:bg-surface-muted'
            } ${disabled ? 'opacity-60' : ''}`}
          >
            <input
              type="radio"
              name="paket"
              value={p}
              checked={secili}
              disabled={disabled}
              onChange={() => onChange(p)}
              className="sr-only"
            />
            <span className="block text-sm font-semibold text-ink">{s.etiket}</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-ink-muted">{s.aciklama}</span>
            {/* SINIR SAYIYLA: "1 şirket · 2 reklam hesabı" — açıklama cümlesi yetmez. */}
            <span className="mt-1 block text-[11px] text-ink">
              {s.maxSirket === null ? 'Sınırsız şirket' : `${s.maxSirket} şirket`} ·{' '}
              {s.maxReklamHesabi === null ? 'sınırsız reklam hesabı' : `${s.maxReklamHesabi} reklam hesabı`}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

function UstHesapDuzenle({
  agac,
  platformAdmin,
  onBitti,
  onVazgec,
}: {
  agac: ManagerAccountTree;
  platformAdmin: boolean;
  onBitti: (agac: ManagerAccountTree) => void;
  onVazgec: () => void;
}) {
  const [ad, setAd] = useState(agac.name);
  const [paket, setPaket] = useState<ManagerPaket>(agac.paket);
  const [pending, setPending] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const degisti = ad !== agac.name || paket !== agac.paket;

  async function kaydet(): Promise<void> {
    /*
     * PAKET YALNIZCA DEĞİŞTİYSE GÖNDERİLİYOR. Platform sahibi olmayan biri
     * için paketi göndermek — değişmemiş olsa bile — sunucuda REDDEDİLİYOR
     * ("yalnızca platform sahibi"); ad değişikliği o yüzden düşerdi.
     */
    const govde = {
      ...(ad !== agac.name ? { name: ad } : {}),
      ...(paket !== agac.paket ? { paket } : {}),
    };
    const parsed = updateManagerAccountSchema.safeParse(govde);
    if (!parsed.success) {
      setHata(parsed.error.issues[0]?.message ?? 'Geçersiz değer');
      return;
    }
    setPending(true);
    setHata(null);
    try {
      const sonuc = await apiFetch<ManagerAccountTree>('/manager-account', {
        method: 'PATCH',
        body: JSON.stringify(parsed.data),
      });
      onBitti(sonuc);
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Kaydedilemedi.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="block max-w-md">
        <span className="text-[11px] text-ink-muted">Üst hesap adı</span>
        <input
          value={ad}
          onChange={(e) => setAd(e.target.value)}
          disabled={pending}
          className="mt-0.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>

      {platformAdmin ? (
        <PaketSecici deger={paket} onChange={setPaket} disabled={pending} />
      ) : (
        // PAKET GÖRÜNÜYOR AMA DEĞİŞMİYOR — ve neden değişmediği yazılı.
        <p className="text-xs text-ink-muted">
          Paket: <strong>{PAKET_SINIRLARI[agac.paket].etiket}</strong>. Paketi yalnızca Advetics
          değiştirebilir.
        </p>
      )}

      {hata && (
        <p role="alert" className="text-xs text-red-600">
          {hata}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending || !degisti}
          onClick={() => void kaydet()}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {pending && <Halka />}
          Kaydet
        </button>
        <button type="button" onClick={onVazgec} className="text-xs text-ink-muted transition hover:text-ink">
          Vazgeç
        </button>
      </div>
    </div>
  );
}

/**
 * Platform sahibi için yeni üst hesap.
 *
 * KURULUNCA O HESABA GEÇİLİYOR. Kurup eski hesapta kalmak, kullanıcının
 * "kurdum ama nerede" diye seçiciyi aramasıydı — ve kurduğu hesabı hemen
 * ayarlaması gerekiyor (şirket açmak, ekip eklemek). Geçiş tam sayfa:
 * üst hesap değişince bütün ağaç değişiyor.
 */
function YeniUstHesap({ onVazgec }: { onVazgec: () => void }) {
  const [ad, setAd] = useState('');
  const [paket, setPaket] = useState<ManagerPaket>('baslangic');
  const [pending, setPending] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  async function kur(): Promise<void> {
    const parsed = createManagerAccountSchema.safeParse({ name: ad, paket });
    if (!parsed.success) {
      setHata(parsed.error.issues[0]?.message ?? 'Geçersiz değer');
      return;
    }
    setPending(true);
    setHata(null);
    try {
      const yeni = await apiFetch<ManagerAccountTree>('/manager-account', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      await apiFetch('/auth/switch-manager', {
        method: 'POST',
        body: JSON.stringify({ managerAccountId: yeni.id }),
      });
      window.location.assign('/ayarlar/ust-hesap');
    } catch (e) {
      // HATA YUTULMUYOR. İki adım var (kur, geç); ikincisi düşerse hesap
      // kurulmuş ama geçilmemiş olur ve bunu kullanıcıya söylemek şart.
      setHata(e instanceof ApiRequestError ? e.message : 'Üst hesap kurulamadı.');
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="max-w-prose text-sm text-ink-muted">
        Satılan her üst hesap için bir tane açılır. Kendi şirketin bu hesaba{' '}
        <strong>bağlanmaz</strong>; kurulunca o hesaba geçersin ve içine şirket açarsın.
      </p>
      <label className="block max-w-md">
        <span className="text-[11px] text-ink-muted">Üst hesap adı</span>
        <input
          value={ad}
          onChange={(e) => setAd(e.target.value)}
          disabled={pending}
          autoFocus
          placeholder="Örn. Yılmaz Mobilya"
          className="mt-0.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>
      <PaketSecici deger={paket} onChange={setPaket} disabled={pending} />
      {hata && (
        <p role="alert" className="text-xs text-red-600">
          {hata}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => void kur()}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {pending && <Halka />}
          Kur ve geç
        </button>
        <button type="button" onClick={onVazgec} className="text-xs text-ink-muted transition hover:text-ink">
          Vazgeç
        </button>
      </div>
    </div>
  );
}
