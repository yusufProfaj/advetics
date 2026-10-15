'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateOrganizationSchema } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Alan, Girdi } from '@/components/ui/alan';
import { Dugme } from '@/components/ui/dugme';
import { Serit } from '@/components/ui/hal';
import { useSozluk } from '@/dil/saglayici';
import { sirketlerSozlugu } from '@/dil/sozlukler/ayarlar-sirketler';

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
  const t = useSozluk(sirketlerSozlugu);
  const d = t.sirketDuzenle;
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
  /*
   * ═══ KISA AD GİZLİ — TEKNİK BİLGİ İSTİYOR ═══
   *
   * Kullanıcının tarifi: *"şirket oluşturduğumda slug yazmak teknik bilgi
   * ister değiştirmekte."* Şirket AÇARKEN zaten sorulmuyor (addan
   * türetiliyor); düzenlemede ise iki eşit alandan biriydi ve ne işe
   * yaradığı belli değildi.
   *
   * TAMAMEN KALDIRMAK DA ÇÖZÜM DEĞİL: kısa ad adreslerde ve dosya adlarında
   * kullanılıyor, bir gün düzeltilmesi gerekebiliyor. Adı değiştirince
   * KENDİLİĞİNDEN türetmek ise daha kötü olurdu — paylaşılmış rapor
   * bağlantıları ve üretilmiş dosya adları sessizce başka bir şeye işaret
   * etmeye başlardı.
   *
   * Çözüm: varsayılan KAPALI, isteyen açıyor.
   */
  const [gelismis, setGelismis] = useState(false);

  const degisti = ad !== kayitli.name || slug !== kayitli.slug;

  async function kaydet(): Promise<void> {
    const parsed = updateOrganizationSchema.safeParse({ name: ad, slug });
    if (!parsed.success) {
      // ŞEMA PANELDE DE KOŞUYOR: sunucunun cevabını beklemeden hatayı
      // alanın yanında göstermek, kaydet düğmesine basıp 400 yemekten iyi.
      setHata(parsed.error.issues[0]?.message ?? t.ortak.gecersizDeger);
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
      setHata(e instanceof ApiRequestError ? e.message : t.ortak.kaydedilemedi);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="grid gap-4">
      <p className="m-0 text-13 text-ink-muted">{d.aciklama}</p>

      <Alan etiket={d.ad}>
        <Girdi
          value={ad}
          onChange={(e) => {
            setAd(e.target.value);
            setKaydedildi(false);
          }}
          disabled={pending}
        />
      </Alan>

      <div className="grid gap-2">
        <button
          type="button"
          onClick={() => setGelismis((v) => !v)}
          aria-expanded={gelismis}
          className="justify-self-start text-13 font-semibold text-ink-muted underline-offset-2 transition-colors hover:text-ink hover:underline"
        >
          {gelismis ? d.gelismisGizle : d.gelismis}
        </button>
        {gelismis && (
          /*
            DEĞİŞTİRMENİN BEDELİ YAZILIYOR. Paylaşılmış rapor bağlantıları
            ve üretilmiş dosya adları eski kısa adı taşıyor; sessizce
            değiştirmek onları kırar.
          */
          <Alan
            etiket={d.kisaAd}
            ipucu={d.kisaAdIpucu}
          >
            <Girdi
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setKaydedildi(false);
              }}
              disabled={pending}
            />
          </Alan>
        )}
      </div>

      {hata && (
        <Serit ton="hata" baslik={t.ortak.kaydedilemediBaslik}>
          {hata}
        </Serit>
      )}

      <div className="flex items-center justify-end gap-3">
        {kaydedildi && !degisti && <span className="text-13 text-ink-muted">{d.kaydedildi}</span>}
        <Dugme
          /*
           * DEĞİŞİKLİK YOKSA KAPALI. Açık bırakmak, hiçbir şeyi
           * değiştirmeyen bir isteği ve ardından "kaydedildi" yazan bir
           * mesajı üretirdi; kullanıcı bir şey yaptığını sanır.
           */
          disabled={!degisti}
          bekliyor={pending}
          onClick={() => void kaydet()}
        >
          {t.ortak.kaydet}
        </Dugme>
      </div>
    </section>
  );
}
