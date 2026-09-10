'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateOrganizationSchema } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Halka } from '@/components/yukleniyor';

/**
 * ŞİRKET DÜZENLEME — ad ve kısa ad.
 *
 * NEDEN ŞİMDİ VAR: `PATCH /organization` ucu aylardır duruyordu ama panelde
 * HİÇBİR ÇAĞIRANI YOKTU — yani şirket adı bir kez yazılıyor ve bir daha
 * düzeltilemiyordu. Yanlış yazılmış bir şirket adı raporun kapağına,
 * mail imzasına ve seçiciye kadar gidiyor.
 *
 * YALNIZCA AKTİF ŞİRKET DÜZENLENEBİLİYOR. Uç `ctx.orgId`ye çivili ve RLS'in
 * UPDATE politikası da öyle (`id = app.current_org_id()`); başka bir şirketi
 * buradan düzenlemek, RLS'in ifade EDEMEDİĞİ bir yazma olurdu. Ekran bu
 * yüzden önce o şirkete geçiriyor.
 *
 * KISA AD (slug) SUNUCUDA NORMALLEŞTİRİLİYOR (`slugify`) — yani yazdığın ile
 * kaydedilen farklı olabiliyor. Kaydettikten sonra `router.refresh()` ile
 * SUNUCUDAN GELEN değer yeniden basılıyor; istemci state'inde bırakmak,
 * kullanıcının kaydettiğini sandığı ama kaydedilmemiş bir metne bakması
 * demekti.
 */
export function SirketDuzenle({
  sirketAdi,
  sirketSlug,
}: {
  sirketAdi: string;
  sirketSlug: string;
}) {
  const router = useRouter();
  const [ad, setAd] = useState(sirketAdi);
  const [slug, setSlug] = useState(sirketSlug);
  /*
   * SON KAYDEDİLEN DEĞER STATE'TE TUTULUYOR, PROP'TAN OKUNMUYOR.
   *
   * "Değişti mi" sorusunu prop ile karşılaştırarak cevaplamak iki hâlde
   * yanılıyor: `router.refresh()` inene kadar prop ESKİ (kaydettiği hâlde
   * "kaydedilmedi" görünür), ve sunucu değeri normalleştirirse prop hiçbir
   * zaman yazdığına eşitlenmez — düğme sonsuza kadar açık kalır.
   */
  const [kayitli, setKayitli] = useState({ name: sirketAdi, slug: sirketSlug });
  const [pending, setPending] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [kaydedildi, setKaydedildi] = useState(false);

  const degisti = ad !== kayitli.name || slug !== kayitli.slug;

  async function kaydet(): Promise<void> {
    const parsed = updateOrganizationSchema.safeParse({ name: ad, slug });
    if (!parsed.success) {
      // ŞEMA PANELDE DE KOŞUYOR: sunucunun cevabını beklemeden hatayı
      // alanın yanında göstermek, kaydet düğmesine basıp 400 yemekten iyi.
      setHata(parsed.error.issues[0]?.message ?? 'Geçersiz değer');
      return;
    }
    setPending(true);
    setHata(null);
    setKaydedildi(false);
    try {
      /*
       * YANITTAN OKUNUYOR, GÖNDERİLENDEN DEĞİL. Sunucu kısa adı
       * normalleştiriyor (`slugify`); gönderdiğimizi kaydetmiş saymak,
       * ekranın kaydedilenden farklı bir metin göstermesi demekti.
       */
      const sonuc = await apiFetch<{ name: string; slug: string }>('/organization', {
        method: 'PATCH',
        body: JSON.stringify(parsed.data),
      });
      setAd(sonuc.name);
      setSlug(sonuc.slug);
      setKayitli({ name: sonuc.name, slug: sonuc.slug });
      setKaydedildi(true);
      /*
       * SUNUCU BİLEŞENLERİ TAZELENİYOR. Şirket adı üst bardaki seçicide,
       * kenar çubuğunda ve bu sayfanın kartlarında birden çok yerde
       * basılıyor; tazelenmezse form yeni adı, ekranın geri kalanı eskisini
       * gösterir.
       */
      router.refresh();
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Kaydedilemedi.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold text-ink">Şirket bilgileri</h2>
      <p className="mt-1 max-w-prose text-sm text-ink-muted">
        Bu ad seçicide, raporlarda ve müşteriye giden maillerde görünüyor. Kısa ad
        (slug) adresler ve dosya adları için kullanılıyor.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[11px] text-ink-muted">Şirket adı</span>
          <input
            value={ad}
            onChange={(e) => {
              setAd(e.target.value);
              setKaydedildi(false);
            }}
            disabled={pending}
            className="mt-0.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
        <label className="block">
          <span className="text-[11px] text-ink-muted">Kısa ad</span>
          <input
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setKaydedildi(false);
            }}
            disabled={pending}
            className="mt-0.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
      </div>

      {hata && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {hata}
        </p>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          /*
           * DEĞİŞİKLİK YOKSA KAPALI. Açık bırakmak, hiçbir şeyi
           * değiştirmeyen bir isteği ve ardından "kaydedildi" yazan bir
           * mesajı üretirdi — kullanıcı bir şey yaptığını sanır.
           */
          disabled={pending || !degisti}
          onClick={() => void kaydet()}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {pending && <Halka />}
          Kaydet
        </button>
        {kaydedildi && !degisti && <span className="text-xs text-ink-muted">Kaydedildi.</span>}
      </div>
    </section>
  );
}
