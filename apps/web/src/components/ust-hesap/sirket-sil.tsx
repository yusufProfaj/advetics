'use client';

import { useEffect, useState } from 'react';
import type { SirketSilmeOzeti } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Alan, Girdi } from '@/components/ui/alan';
import { Dugme } from '@/components/ui/dugme';
import { Serit, Yukleniyor } from '@/components/ui/hal';
import { useSozluk } from '@/dil/saglayici';
import { sirketlerSozlugu } from '@/dil/sozlukler/ayarlar-sirketler';

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
  const t = useSozluk(sirketlerSozlugu);
  const d = t.sirketSil;

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
        if (!iptal) setHata(e instanceof ApiRequestError ? e.message : t.ortak.ozetAlinamadi);
      });
    return () => {
      iptal = true;
    };
    // `t` dile bağlı, dil değişimi tam sayfa yenilemesi: bağımlılık gereksiz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setHata(e instanceof ApiRequestError ? e.message : t.ortak.silinemedi);
      setPending(false);
    }
  }

  /*
   * PENCERENİN İÇİ: başlık ve kapat düğmesi `Pencere`de. Eskiden kırmızı
   * zeminli bir kutuydu (`bg-danger-soft`); kırmızı zemin kılavuzda yok ve
   * uyarı artık şeritte (sol kırmızı çizgi), silme düğmesi `tehlike` tonu.
   */
  if (hata !== null && ozet === null) {
    return (
      <div className="grid gap-4">
        <Serit ton="hata" baslik={d.ozetAlinamadi}>
          {hata}
        </Serit>
        <Eylemler>
          <Vazgec onVazgec={onVazgec} />
        </Eylemler>
      </div>
    );
  }
  if (ozet === null) {
    return <Yukleniyor satir={3} etiket={t.ortak.hesaplananlar} />;
  }

  if (ozet.engel !== null) {
    return (
      <div className="grid gap-4">
        {/* SEBEP YAZILIYOR: kapalı bir düğme "neden" sorusunu ekranda
            bırakıyor ve kullanıcı onu aramaya gidiyor. */}
        <Serit ton="uyari" baslik={d.silinemez}>
          {ozet.engel}
        </Serit>
        <Eylemler>
          <Vazgec onVazgec={onVazgec} />
        </Eylemler>
      </div>
    );
  }

  const bosSirket = !ozet.adOnayiGerekli;

  return (
    <div className="grid gap-4">
      <Serit ton="hata" baslik={d.silinecek(ozet.name)}>
        {bosSirket ? d.bos : d.birlikte}
      </Serit>

      {!bosSirket && (
        <>
          {/*
            SAYI DEĞİL AD YAZILIYOR. "3 workspace" kimseye ne kaybedeceğini
            söylemiyor; adları görünce kullanıcı yanlış şirketi seçtiğini
            fark ediyor.
          */}
          <ul className="m-0 grid list-none gap-1.5 p-0 text-14 text-ink">
            {ozet.workspaceAdlari.length > 0 && (
              <Satir>
                {d.workspaceler(ozet.workspaceAdlari.length, ozet.workspaceAdlari.join(', '))}
              </Satir>
            )}
            {ozet.reklamHesabi > 0 && <Satir>{t.ortak.reklamHesabi(ozet.reklamHesabi)}</Satir>}
            {ozet.kullanici > 0 && (
              <Satir>
                {d.kullanici(ozet.kullanici)}
              </Satir>
            )}
            {ozet.metrikGunu > 0 && (
              <Satir>{d.olcum(ozet.metrikGunu)}</Satir>
            )}
          </ul>

          <Alan etiket={d.onayYaz}>
            <Girdi
              value={onayAdi}
              onChange={(e) => setOnayAdi(e.target.value)}
              disabled={pending}
              placeholder={ozet.name}
            />
          </Alan>
        </>
      )}

      {hata && (
        <Serit ton="hata" baslik={t.ortak.silinemediBaslik}>
          {hata}
        </Serit>
      )}

      <Eylemler>
        <Vazgec onVazgec={onVazgec} />
        <Dugme
          ton="tehlike"
          /*
           * AD EŞLEŞMEDEN DÜĞME KAPALI. Açık bırakmak, kullanıcının yanlış
           * yazıp 400 alması ve "neden olmadı" diye bakması demekti.
           */
          disabled={(!bosSirket && onayAdi.trim() !== ozet.name)}
          bekliyor={pending}
          onClick={() => void sil()}
        >
          {bosSirket ? d.sirketiSil : t.ortak.kaliciSil}
        </Dugme>
      </Eylemler>
    </div>
  );
}

/** Pencerenin alt satırı: Vazgeç solda, tehlikeli eylem en sağda. */
function Eylemler({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">{children}</div>;
}

function Satir({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span aria-hidden>·</span>
      <span>{children}</span>
    </li>
  );
}

function Vazgec({ onVazgec }: { onVazgec: () => void }) {
  const t = useSozluk(sirketlerSozlugu);
  return (
    <Dugme ton="ikincil" onClick={onVazgec}>
      {t.ortak.vazgec}
    </Dugme>
  );
}
