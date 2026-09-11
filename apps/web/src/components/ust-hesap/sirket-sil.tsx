'use client';

import { useEffect, useState } from 'react';
import type { SirketSilmeOzeti } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Halka } from '@/components/yukleniyor';

/**
 * ═══ ŞİRKET SİLME — NE GİDECEĞİ ÖNCE YAZILIYOR ═══
 *
 * Kullanıcının isteği: *"ürettiğim şirketi silemiyorum … şirketi silerken
 * içerisinde workspace varsa içindeki workspace'i de sil ama 'workspace'iniz
 * de silinecek' tarzında bir bildirim çıkart."*
 *
 * Ama silme workspace'lerle sınırlı değil: reklam hesapları, kullanıcılar ve
 * BÜTÜN METRİK GEÇMİŞİ de gidiyor. Meta 37 aylık sınıra takılıyor, Google'da
 * yeniden çekmek kota harcıyor — geri alma yolu YOK.
 *
 * O yüzden iki adım: sunucu ne gideceğini SAYIYOR (`silme-ozeti`), ekran onu
 * yazıyor, sonra siliniyor. "Emin misiniz?" deyip ne gideceğini söylememek,
 * bu depoda `reset-clients`in yarım kalıp metrik verisini götürmesiyle aynı
 * sınıf hata: pahalı yarısı yapılır, kullanıcı ne kaybettiğini sonra öğrenir.
 *
 * ═══ BOŞ ŞİRKET TEK TIKLA GİDİYOR ═══
 *
 * Yanlışlıkla açılmış bir test kaydı için ad yazdırmak angarya. İçinde veri
 * olan bir şirkette ise aynı kolaylık, kazara yapılan ve geri alınamayan bir
 * silme demek. Eşiği sunucu belirliyor (`adOnayiGerekli`) ve orada da
 * sınıyor: paneldeki kontrol bir kolaylık, kapı değil.
 */
export function SirketSil({
  organizationId,
  onVazgec,
  onSilindi,
}: {
  organizationId: string;
  onVazgec: () => void;
  /** Silme bittiğinde — ekranın ağacı tazelemesi için. */
  onSilindi: (ad: string) => void;
}) {
  const [ozet, setOzet] = useState<SirketSilmeOzeti | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [onayAdi, setOnayAdi] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let iptal = false;
    setOzet(null);
    setHata(null);
    apiFetch<SirketSilmeOzeti>(`/manager-account/organizations/${organizationId}/silme-ozeti`)
      .then((d) => {
        if (!iptal) setOzet(d);
      })
      .catch((e: unknown) => {
        /*
         * ÖZET ALINAMAZSA SİLME DE AÇILMIYOR. Sessizce boş bir onay kutusu
         * göstermek, kullanıcının NE gideceğini bilmeden onaylaması demekti.
         */
        if (!iptal) setHata(e instanceof ApiRequestError ? e.message : 'Özet alınamadı.');
      });
    return () => {
      iptal = true;
    };
  }, [organizationId]);

  async function sil(): Promise<void> {
    setPending(true);
    setHata(null);
    try {
      const sonuc = await apiFetch<{ name: string }>(
        `/manager-account/organizations/${organizationId}`,
        { method: 'DELETE', body: JSON.stringify({ onayAdi }) },
      );
      onSilindi(sonuc.name);
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Silinemedi.');
      setPending(false);
    }
  }

  if (hata !== null && ozet === null) {
    return (
      <Kutu>
        <p role="alert" className="text-sm text-red-700">
          {hata}
        </p>
        <Vazgec onVazgec={onVazgec} />
      </Kutu>
    );
  }
  if (ozet === null) {
    return (
      <Kutu>
        <p className="text-sm text-ink-muted">Ne silineceği hesaplanıyor…</p>
      </Kutu>
    );
  }

  if (ozet.engel !== null) {
    return (
      <Kutu>
        <h3 className="text-sm font-semibold text-ink">Bu şirket silinemez</h3>
        {/* SEBEP YAZILIYOR: kapalı bir düğme "neden" sorusunu ekranda
            bırakıyor ve kullanıcı onu aramaya gidiyor. */}
        <p className="mt-1 text-sm text-ink-muted">{ozet.engel}</p>
        <Vazgec onVazgec={onVazgec} />
      </Kutu>
    );
  }

  const bosSirket = !ozet.adOnayiGerekli;

  return (
    <Kutu>
      <h3 className="text-sm font-semibold text-red-700">
        “{ozet.name}” kalıcı olarak silinecek
      </h3>

      {bosSirket ? (
        <p className="mt-1 text-sm text-ink-muted">
          Bu şirkette workspace, reklam hesabı, kullanıcı ve ölçüm yok — silinecek bir veri
          bulunmuyor.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink-muted">
            Şununla birlikte gidecek ve <strong>geri getirilemez</strong>:
          </p>
          {/*
            SAYI DEĞİL AD YAZILIYOR. "3 workspace" kimseye ne kaybedeceğini
            söylemiyor; adları görünce kullanıcı yanlış şirketi seçtiğini
            fark ediyor.
          */}
          <ul className="mt-2 space-y-1 text-sm">
            {ozet.workspaceAdlari.length > 0 && (
              <Satir>
                {ozet.workspaceAdlari.length} workspace: {ozet.workspaceAdlari.join(', ')}
              </Satir>
            )}
            {ozet.reklamHesabi > 0 && <Satir>{ozet.reklamHesabi} reklam hesabı</Satir>}
            {ozet.kullanici > 0 && (
              <Satir>
                {ozet.kullanici} kullanıcı — giriş hesapları da silinir, bir daha giriş
                yapamazlar
              </Satir>
            )}
            {ozet.metrikGunu > 0 && (
              <Satir>
                {ozet.metrikGunu} günlük ölçüm geçmişi — platformdan yeniden çekilemez
              </Satir>
            )}
          </ul>

          <label className="mt-3 block">
            <span className="text-[11px] text-ink-muted">
              Onaylamak için şirket adını birebir yaz
            </span>
            <input
              value={onayAdi}
              onChange={(e) => setOnayAdi(e.target.value)}
              disabled={pending}
              placeholder={ozet.name}
              className="mt-0.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-red-400"
            />
          </label>
        </>
      )}

      {hata && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {hata}
        </p>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          /*
           * AD EŞLEŞMEDEN DÜĞME KAPALI. Açık bırakmak, kullanıcının yanlış
           * yazıp 400 alması ve "neden olmadı" diye bakması demekti.
           */
          disabled={pending || (!bosSirket && onayAdi.trim() !== ozet.name)}
          onClick={() => void sil()}
          className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {pending && <Halka />}
          {bosSirket ? 'Şirketi sil' : 'Kalıcı olarak sil'}
        </button>
        <Vazgec onVazgec={onVazgec} satirIci />
      </div>
    </Kutu>
  );
}

function Kutu({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">{children}</div>;
}

function Satir({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2 text-ink">
      <span aria-hidden>·</span>
      <span>{children}</span>
    </li>
  );
}

function Vazgec({ onVazgec, satirIci }: { onVazgec: () => void; satirIci?: boolean }) {
  return (
    <button
      type="button"
      onClick={onVazgec}
      className={`text-xs text-ink-muted transition hover:text-ink ${satirIci ? '' : 'mt-3'}`}
    >
      Vazgeç
    </button>
  );
}
