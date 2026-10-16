'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  COLUMN_KEYS,
  SABLON_PARAM,
  VARSAYILAN_SABLONLAR,
  kovaPlatformu,
  PLATFORM_KISA_ADLARI,
  COLUMN_LABELS,
  REPORT_SECTIONS,
  SECTION_LABELS,
  type ColumnKey,
  type ReportOptions,
  type ReportSection,
  type ReportTemplateSummary,
} from '@advetics/shared';
import { apiFetch, ApiRequestError } from '@/lib/api';
import { AcilirMenu, IKON_TETIK, MenuAyraci, MenuOgesi } from '@/components/ui/acilir-menu';
import { Alan, Girdi, MetinAlani, Secim } from '@/components/ui/alan';
import { Dugme } from '@/components/ui/dugme';
import { BosDurum, Serit } from '@/components/ui/hal';
import { AdHucresi, Tablo, type TabloSutunu } from '@/components/ui/tablo';
import { useSozluk } from '@/dil/saglayici';
import { raporlarSozlugu } from '@/dil/sozlukler/raporlar';

/**
 * ŞABLON YÖNETİMİ — bölüm seçimi ve SIRASI.
 *
 * Sıra bir dizinin doğal özelliği ve şablonda öyle saklanıyor; belge de o
 * diziyi olduğu gibi geziyor.
 *
 * ┌─ SIRA SÜRÜKLENEREK DEĞİŞİYOR ─────────────────────────────────────────┐
 * │ Öncesinde satır başına ↑/↓ düğmeleri vardı ve gerekçesi yazılıydı:     │
 * │ "yedi öğelik bir listede kazancı yok". Liste ON DÖRT bölüme çıktı ve   │
 * │ o gerekçe çürüdü — bir bölümü en alttan en üste almak on üç tıklama    │
 * │ demek ve her tıklamada liste kayıyor, kullanıcı takip edemiyor.        │
 * │                                                                        │
 * │ KÜTÜPHANE YOK: tarayıcının kendi HTML5 sürükle-bırak olayları          │
 * │ kullanılıyor. Bir paket eklemek, bu tek ekran için yeni bir bağımlılık │
 * │ ve yeni bir kırılma yüzeyi demekti.                                    │
 * │                                                                        │
 * │ KLAVYE KAYBOLMUYOR — ve bu kritik. Sürükle-bırak fare gerektiriyor;    │
 * │ ↑/↓ düğmelerini kaldırıp yerine yalnızca sürüklemeyi koymak, klavyeyle │
 * │ çalışan kullanıcı için özelliği TAMAMEN kapatmak olurdu. Satır         │
 * │ odaklanabilir ve ok tuşlarıyla taşınıyor; ekranda da yazıyor.          │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * METRİK SEÇİMİ KAMPANYA BÖLÜMLERİNDE VAR. Bir süre yoktu ve sebebi
 * yazılıydı: belge sütunlarını sabit setlerden kuruyordu ve çalışmayan bir
 * seçim kutusu koymak, olmayan bir özellik vaat etmek olurdu. Belge artık
 * sütunlarını `options`tan kuruyor, seçim de eklendi.
 *
 * SEÇİM YALNIZCA SÜTUNLU BÖLÜMLERDE: kapak, özet ve kapanışta gösterilecek
 * bir sütun listesi yok; oraya da bir seçici koymak boş bir vaat olurdu.
 */
/**
 * ═══ RAPORLAR › ŞABLONLAR BÖLÜMÜ (onaylı taslak `#raporlar`, 2026-10-14) ═══
 *
 * Şablon yönetimi kendi bölümünde: solda liste (hazır şablonlar + kayıtlı
 * şablonlar), sağda seçili şablonun düzenleyicisi. Rapor bölümündeki seçici
 * çip olarak kalıyor ve yalnız SEÇİYOR. Eski düzende düzenleme seçicinin
 * açılır listesinden bir pencereyle yapılıyordu: on dört bölümlü bir şablon
 * pencerede kaydırılıyor ve "Kaydet" ekrana sığmıyordu.
 *
 * AYNI SAYFADA, AYRI SAYFADA DEĞİL: şablonu ayrı bir sayfada düzenleyip
 * rapora dönmek, kullanıcının bildirdiği hatanın kendisiydi (düzenleme
 * yapılıyor, dönüşte seçici ön ayara geçiyor). "Bu şablonla aç" raporu o
 * şablonla gösteriyor ve diğer süzgeçleri (tarih) koruyor.
 */
export function SablonBolumu({
  sablonlar,
  sablonHatasi,
  musteriler,
  isOrgAdmin,
  duzenleyebilir,
}: {
  sablonlar: ReportTemplateSummary[];
  /** Liste alınamadıysa sunucunun cümlesi: "hiç şablon yok" ile "okunamadı" ayrı hâl. */
  sablonHatasi: string | null;
  musteriler: Array<{ id: string; name: string }>;
  isOrgAdmin: boolean;
  /** `report.write`: müşteri hesabı raporu okuyor, biçimini değiştirmiyor. */
  duzenleyebilir: boolean;
}) {
  const d = useSozluk(raporlarSozlugu).sablonYonetimi;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  /** Düzenleyicideki şablon: kayıtlı şablonun kimliği, `yeni` ya da hiçbiri. */
  const [duzenlenen, setDuzenlenen] = useState<string | 'yeni' | null>(null);
  const [silmeyeAc, setSilmeyeAc] = useState(false);

  function raporaAc(deger: string): void {
    const p = new URLSearchParams(searchParams?.toString() ?? '');
    p.set(SABLON_PARAM, deger);
    // Rapor bölümüne dönüş: varsayılan bölüm adreste yazılmıyor.
    p.delete('sekme');
    startTransition(() => router.replace(`${pathname}?${p.toString()}`));
  }

  type Satir =
    | { tur: 'hazir'; kod: string; ad: string; aciklama: string; bolum: number }
    | { tur: 'kayitli'; sablon: ReportTemplateSummary };
  const satirlar: Satir[] = [
    ...VARSAYILAN_SABLONLAR.map(
      (v): Satir => ({ tur: 'hazir', kod: v.kod, ad: v.ad, aciklama: v.aciklama, bolum: v.sections.length }),
    ),
    ...sablonlar.map((t): Satir => ({ tur: 'kayitli', sablon: t })),
  ];
  const anahtar = (r: Satir) => (r.tur === 'hazir' ? `hazir-${r.kod}` : r.sablon.id);

  const sutunlar: Array<TabloSutunu<Satir>> = [
    {
      anahtar: 'ad',
      baslik: d.sablon,
      hucre: (r) =>
        r.tur === 'hazir' ? (
          /*
           * AÇIKLAMA ŞART. "Google Ads Şablonu" tek başına neyin değiştiğini
           * söylemiyor; kullanıcı seçip raporun yarısının kaybolduğunu görünce
           * bunu bir arıza sanıyor.
           */
          <AdHucresi ad={r.ad} alt={d.hazirSablon(r.aciklama)} />
        ) : (
          /* KAPSAM VE BÖLÜM SIRASI GÖRÜNÜYOR: iki şablonun adı benzer olabiliyor. */
          <AdHucresi
            ad={r.sablon.name}
            alt={r.sablon.sections.map((x) => SECTION_LABELS[x]).join(' → ')}
          />
        ),
    },
    {
      anahtar: 'kapsam',
      baslik: d.kapsam,
      ikincil: true,
      hucre: (r) =>
        r.tur === 'hazir'
          ? d.herkes
          : r.sablon.clientId === null
            ? d.orgVarsayilani
            : (r.sablon.clientName ?? 'Workspace'),
    },
    {
      anahtar: 'bolum',
      baslik: d.bolum,
      sayi: true,
      hucre: (r) => (r.tur === 'hazir' ? r.bolum : r.sablon.sections.length),
    },
    {
      anahtar: 'eylem',
      baslik: <span className="sr-only">{d.eylemler}</span>,
      sayi: true,
      hucre: (r) => (
        <span className="inline-flex items-center gap-1">
          <Dugme ton="ikincil" boyut="kucuk" onClick={() => raporaAc(r.tur === 'hazir' ? r.kod : r.sablon.id)}>
            {d.buSablonlaAc}
          </Dugme>
          {r.tur === 'kayitli' && duzenleyebilir && (
            <AcilirMenu
              tasma="portal"
              etiket={d.digerEylemlerAd(r.sablon.name)}
              hizala="sag"
              genislik="w-44"
              tetik={({ acik: _acik, ...o }) => (
                <button type="button" {...o} aria-label={d.digerEylemler} className={IKON_TETIK}>
                  <span aria-hidden className="text-15 leading-none">
                    ⋯
                  </span>
                </button>
              )}
            >
              <MenuOgesi
                onClick={() => {
                  setSilmeyeAc(false);
                  setDuzenlenen(r.sablon.id);
                }}
              >
                {d.duzenle}
              </MenuOgesi>
              <MenuAyraci />
              {/* SİL ONAYA GİDİYOR: kaç paylaşım bağlantısının gideceği düzenleyicide yazıyor. */}
              <MenuOgesi
                tehlike
                onClick={() => {
                  setSilmeyeAc(true);
                  setDuzenlenen(r.sablon.id);
                }}
              >
                {d.sil}
              </MenuOgesi>
            </AcilirMenu>
          )}
        </span>
      ),
    },
  ];

  const duzenlenenSablon = duzenlenen && duzenlenen !== 'yeni' ? (sablonlar.find((t) => t.id === duzenlenen) ?? null) : null;

  return (
    <div className="grid items-start gap-4 min-[1100px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section className="min-w-0 rounded-kart border border-line bg-surface">
        {sablonHatasi !== null && (
          <div className="border-b border-line p-4">
            <Serit ton="hata" baslik={d.listeOkunamadiBaslik}>
              {d.listeOkunamadi(sablonHatasi)}
            </Serit>
          </div>
        )}
        <Tablo
          etiket={d.raporSablonlari}
          sutunlar={sutunlar}
          satirlar={satirlar}
          satirAnahtari={anahtar}
          sayfalama={{ bas: 1, son: satirlar.length, toplam: satirlar.length }}
        />
        {duzenleyebilir && (
          <div className="flex justify-end border-t border-line px-5 py-3">
            <Dugme
              ton="ikincil"
              boyut="kucuk"
              onClick={() => {
                setSilmeyeAc(false);
                setDuzenlenen('yeni');
              }}
            >
              {d.yeniSablon}
            </Dugme>
          </div>
        )}
      </section>

      {duzenlenen === null ? (
        <BosDurum
          baslik={d.duzenlemekIcin}
          neden={duzenleyebilir ? d.duzenlemeYetkili : d.duzenlemeYetkisiz}
        />
      ) : (
        <SablonDuzenleyici
          /* ŞABLON DEĞİŞİNCE FORM BAŞTAN KURULUYOR: önceki şablonun alanları yenisine taşınmasın. */
          key={duzenlenen}
          sablon={duzenlenenSablon}
          musteriler={musteriler}
          isOrgAdmin={isOrgAdmin}
          silOnayiAcik={silmeyeAc}
          onKapat={() => setDuzenlenen(null)}
          /*
           * KAYDEDİLEN ŞABLON HEMEN RAPORDA AÇILIYOR: kaydedip ekranda hiçbir
           * şeyin değişmediğini görmek, düzeltilen hatanın ta kendisiydi.
           */
          onKaydedildi={(id) => {
            setDuzenlenen(null);
            raporaAc(id);
          }}
        />
      )}
    </div>
  );
}

/**
 * ŞABLON DÜZENLEYİCİ: Şablonlar bölümünün sağ kartı.
 *
 * Eskiden bir pencereydi ve rapor seçicisinden açılıyordu; on dört bölümlü
 * bir şablonda pencere ekrana sığmıyor, "Kaydet" görünmüyordu. Satır içi kart
 * sayfayla birlikte kayıyor. Tek düzenleme formu: ikinci bir form yazmak,
 * birinin sütun seçimini ya da silme onayını kaybetmesi demekti.
 */
export function SablonDuzenleyici({
  sablon,
  musteriler,
  isOrgAdmin,
  silOnayiAcik = false,
  onKapat,
  onKaydedildi,
}: {
  sablon: ReportTemplateSummary | null;
  musteriler: Array<{ id: string; name: string }>;
  isOrgAdmin: boolean;
  /** ⋯ menüsündeki "Sil" düzenleyiciyi onay sorusu açık hâlde açıyor. */
  silOnayiAcik?: boolean;
  onKapat: () => void;
  /**
   * Kaydedilen şablonun kimliği.
   *
   * Verilmezse yalnızca kapanıp sayfa yenileniyor (şablon listesi ekranı).
   * Rapor ekranı bunu kullanıp kaydedilen şablonu HEMEN seçiyor: kaydedip
   * ekranda hiçbir şeyin değişmediğini görmek, düzeltilen hatanın ta
   * kendisiydi.
   */
  onKaydedildi?: (id: string) => void;
}) {
  const d = useSozluk(raporlarSozlugu).sablonYonetimi;
  const router = useRouter();
  const [ad, setAd] = useState(sablon?.name ?? d.varsayilanAd);
  const [baslik, setBaslik] = useState(sablon?.title ?? '');
  const [kapanis, setKapanis] = useState(sablon?.closingText ?? '');
  const [clientId, setClientId] = useState<string | null>(sablon?.clientId ?? null);
  const [secili, setSecili] = useState<ReportSection[]>(
    sablon?.sections ?? [...REPORT_SECTIONS],
  );
  const [ayarlar, setAyarlar] = useState<ReportOptions>(sablon?.options ?? {});

  function sutunlariDegistir(bolum: ReportSection, sutunlar: ColumnKey[]) {
    setAyarlar((a) => ({
      ...a,
      // BOŞ DİZİ SAKLANMIYOR. Kullanıcı hepsini kaldırdıysa bunu bir seçim
      // olarak yazmak, bir dahaki açılışta boş bir tablo göstermek olurdu;
      // belge boş seçimi zaten varsayılana çeviriyor.
      [bolum]: sutunlar.length === 0 ? {} : { ...a[bolum], metrics: sutunlar },
    }));
  }
  const [bekleyen, setBekleyen] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [silOnay, setSilOnay] = useState(silOnayiAcik);

  const disaridakiler = REPORT_SECTIONS.filter((s) => !secili.includes(s));

  /** Sürüklenen satırın sırası — bırakılınca `null`. */
  const [suruklenen, setSuruklenen] = useState<number | null>(null);

  /**
   * Bir bölümü BAŞKA BİR SIRAYA taşır.
   *
   * Sürükleme ve klavye AYNI fonksiyonu çağırıyor. İkisini ayrı yazmak,
   * birinin sınır kontrolünü (liste başı/sonu) kaybetmesi demekti ve o hata
   * yalnızca uçlarda görünürdü.
   *
   * TAKAS DEĞİL ARAYA SOKMA. ↑/↓ komşuyla takas ediyordu ve tek adımda ikisi
   * aynı şey; sürüklemede değil — üçüncü sıradaki bir bölümü sona bırakmak,
   * aradaki bütün bölümlerin bir üste kayması demek. Takas yapan bir sürükleme
   * kullanıcının bıraktığı yere koymuyor, iki öğeyi yer değiştiriyor.
   */
  function tasiSiraya(kaynak: number, hedef: number) {
    if (hedef < 0 || hedef >= secili.length || kaynak === hedef) return;
    const kopya = [...secili];
    const [tasinan] = kopya.splice(kaynak, 1);
    kopya.splice(hedef, 0, tasinan!);
    setSecili(kopya);
  }

  /**
   * Ok tuşlarıyla taşıma.
   *
   * SÜRÜKLE-BIRAK TEK BAŞINA YETMİYOR: fare gerektiriyor ve klavyeyle çalışan
   * kullanıcı için bölüm sırasını değiştirmek imkânsız hâle gelirdi. Odak
   * taşınan satırda kalıyor, yoksa kullanıcı her adımda listeyi yeniden
   * bulmak zorunda kalır.
   */
  function klavyeyle(e: React.KeyboardEvent<HTMLLIElement>, i: number) {
    const yon = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (yon === 0) return;
    e.preventDefault();
    tasiSiraya(i, i + yon);
    const liste = e.currentTarget.parentElement;
    requestAnimationFrame(() => {
      const hedef = liste?.children[i + yon];
      if (hedef instanceof HTMLElement) hedef.focus();
    });
  }

  async function kaydet() {
    setBekleyen(true);
    setHata(null);
    try {
      const govde = {
        name: ad.trim(),
        title: baslik.trim() || undefined,
        closingText: kapanis.trim() || undefined,
        clientId,
        sections: secili,
        options: ayarlar,
      };
      const kayit = sablon
        ? await apiFetch<{ id: string }>(`/reports/templates/${sablon.id}`, {
            method: 'PATCH',
            body: JSON.stringify(govde),
          })
        : await apiFetch<{ id: string }>('/reports/templates', {
            method: 'POST',
            body: JSON.stringify(govde),
          });

      /*
       * ÖNCE YENİLE, SONRA HABER VER.
       *
       * `router.refresh()` sunucu bileşenlerini yeniden çalıştırıyor ve
       * şablon listesi oradan geliyor. Haber verip yenilememek, rapor
       * ekranının yeni şablonu seçmesi ama listede bulamaması demekti:
       * seçici kaydedilen şablonun ADINI gösteremez ve ön ayara düşerdi.
       */
      router.refresh();
      if (onKaydedildi) onKaydedildi(kayit.id);
      else onKapat();
    } catch (err) {
      // PLATFORMUN/SUNUCUNUN KENDİ MESAJI EKRANDA. "Bir hata oluştu" demek,
      // "org varsayılanını yalnızca yönetici değiştirebilir" gibi
      // düzeltilebilir bir sebebi gizlerdi.
      setHata(err instanceof ApiRequestError ? err.message : d.kaydedilemedi);
      setBekleyen(false);
    }
  }

  async function sil() {
    if (!sablon) return;
    setBekleyen(true);
    setHata(null);
    try {
      await apiFetch(`/reports/templates/${sablon.id}`, { method: 'DELETE' });
      onKapat();
      router.refresh();
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : d.silinemedi);
      setBekleyen(false);
    }
  }

  return (
    <section className="min-w-0 rounded-kart border border-line bg-surface" aria-label={d.duzenleyiciEtiket}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h3 className="m-0 font-baslik text-15 font-bold text-ink">{sablon ? sablon.name : d.yeniSablonBaslik}</h3>
        <small className="text-12 text-ink-muted">{d.surukleIpucu}</small>
      </div>

      <div className="grid gap-3.5 p-5">
        <Alan etiket={d.sablonAdi}>
          {(id) => <Girdi id={id} value={ad} onChange={(e) => setAd(e.target.value)} />}
        </Alan>

        {/*
          ORG VARSAYILANINI YALNIZCA YÖNETİCİ DEĞİŞTİREBİLİYOR: RLS bunu zaten
          uyguluyor ama SESSİZCE (0 satır) ve ekran "kaydedildi" derdi.
          Seçenek kapalı ve sebebi yazılı.
        */}
        <Alan etiket={d.kapsam}>
          {(id) => (
            <Secim id={id} value={clientId ?? ''} onChange={(e) => setClientId(e.target.value || null)}>
              <option value="" disabled={!isOrgAdmin}>
                {d.orgVarsayilani}
                {isOrgAdmin ? '' : d.yalnizcaYonetici}
              </option>
              {musteriler.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Secim>
          )}
        </Alan>

        <Alan etiket={d.raporBasligi} ipucu={d.baslikIpucu}>
          {(id, aciklamaId) => (
            <Girdi
              id={id}
              aria-describedby={aciklamaId}
              value={baslik}
              onChange={(e) => setBaslik(e.target.value)}
              placeholder={d.baslikYerTutucu}
            />
          )}
        </Alan>

        <Alan etiket={d.kapanisMetni}>
          {(id) => <MetinAlani id={id} value={kapanis} onChange={(e) => setKapanis(e.target.value)} rows={3} />}
        </Alan>

        <div className="grid gap-2">
          <p className="m-0 text-13 font-semibold text-ink">{d.bolumlarVeSira}</p>
          <p className="m-0 text-12 text-ink-muted">
            {d.siraOn}
            <strong>{d.siraSurukle}</strong>
            {d.siraOrta}
            <strong>↑ / ↓</strong>
            {d.siraSon}
          </p>
          <ul className="m-0 grid list-none gap-1 p-0">
            {secili.map((s, i) => (
              <li
                key={s}
                draggable
                tabIndex={0}
                aria-label={d.satirEtiket(SECTION_LABELS[s], i + 1, secili.length)}
                onDragStart={(e) => {
                  setSuruklenen(i);
                  /*
                   * `setData` ŞART. Firefox, veri taşımayan bir sürüklemeyi
                   * hiç başlatmıyor ve satır kıpırdamıyordu; taşınan değer
                   * kullanılmıyor, olayın geçerli sayılması için var.
                   */
                  e.dataTransfer.setData('text/plain', s);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  // VARSAYILAN ENGELLENMEZSE `drop` HİÇ TETİKLENMİYOR.
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (suruklenen !== null && suruklenen !== i) tasiSiraya(suruklenen, i);
                  setSuruklenen(i);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setSuruklenen(null);
                }}
                onDragEnd={() => setSuruklenen(null)}
                onKeyDown={(e) => klavyeyle(e, i)}
                className={`flex cursor-grab items-center gap-2 rounded-alan border px-3 py-1.5 text-13 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand motion-reduce:transition-none ${
                  suruklenen === i ? 'border-ink bg-surface-sunken opacity-60' : 'border-line bg-surface-muted hover:border-line-strong'
                }`}
              >
                {/*
                  TUTAMAK GÖRÜNÜYOR. Sürüklenebilir olduğu ekranda hiçbir
                  işaretle söylenmezse kullanıcı özelliğin gittiğini sanıyor.
                */}
                <span aria-hidden="true" className="select-none text-ink-soluk">
                  ⋮⋮
                </span>
                <span className="w-5 text-12 tabular-nums text-ink-muted">{i + 1}.</span>
                <span className="flex-1 text-ink">{SECTION_LABELS[s]}</span>
                <button
                  type="button"
                  onClick={() => setSecili(secili.filter((x) => x !== s))}
                  aria-label={d.bolumuKaldir(SECTION_LABELS[s])}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface hover:text-danger-strong"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>

          {/* SÜTUN SEÇİMİ: yalnızca tablosu olan bölümlerde. */}
          {secili
            .filter((s): s is 'meta_campaigns' | 'google_campaigns' =>
              s === 'meta_campaigns' || s === 'google_campaigns',
            )
            .map((s) => (
              <SutunSecici key={s} bolum={s} secim={ayarlar[s]?.metrics} onDegis={(v) => sutunlariDegistir(s, v)} />
            ))}
          {disaridakiler.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {disaridakiler.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSecili([...secili, s])}
                  className="inline-flex h-[30px] items-center rounded-full border border-dashed border-line-strong px-3 text-[12.5px] font-semibold text-ink-muted transition-colors hover:text-ink"
                >
                  + {SECTION_LABELS[s]}
                </button>
              ))}
            </div>
          )}
        </div>

        {hata && (
          <Serit ton="hata" baslik={d.kaydedilemediBaslik}>
            {hata}
          </Serit>
        )}

        {/*
          SİLME ONAYI KAÇ LİNKİN GİDECEĞİNİ SÖYLÜYOR. Şablonu silmek ona
          bağlı bütün paylaşım linklerini de siliyor; müşteriye gönderilmiş
          bir rapor haber vermeden 404 olur.
        */}
        {silOnay && sablon && (
          <Serit ton="hata" baslik={d.silinecekBaslik}>
            {sablon.shareCount > 0 ? (
              <>
                {d.silinecekOn}
                <strong>{d.silinecekKalin(sablon.shareCount)}</strong>
                {d.silinecekSon}
              </>
            ) : (
              d.linkYok
            )}
          </Serit>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">
        {sablon && (
          <Dugme
            ton="tehlike"
            boyut="kucuk"
            className="mr-auto"
            onClick={() => (silOnay ? sil() : setSilOnay(true))}
            disabled={bekleyen}
          >
            {silOnay ? d.evetSil : d.sil}
          </Dugme>
        )}
        <Dugme ton="ikincil" boyut="kucuk" onClick={onKapat}>
          {d.vazgec}
        </Dugme>
        {/* KART İÇİNDE KIRMIZI DOLU DÜĞME YOK (BILESENLER § 3): Kaydet koyu. */}
        <Dugme
          ton="koyu"
          boyut="kucuk"
          onClick={kaydet}
          bekliyor={bekleyen}
          disabled={secili.length === 0 || ad.trim().length === 0}
        >
          {d.kaydet}
        </Dugme>
      </div>
    </section>
  );
}

/**
 * BÖLÜM SÜTUNLARI — seçim VE sıra.
 *
 * Seçim yapılmazsa belge varsayılan sütunlara dönüyor ve bu ekranda yazılı:
 * boş bir tablo göstermek, kullanıcının bir ayarı yanlış girdiğini
 * anlamasının en zor yolu olurdu.
 *
 * FORM VE MESAJ GOOGLE'DA HER ZAMAN SIFIR ÇIKAR — Google `actions` dizisi
 * döndürmüyor ve o dökümü hiç vermiyor. Gizlemek yerine sebebiyle söylüyoruz:
 * gizlense kullanıcı "neden bu seçenek yok" diye sorar, sıfır gösterilse
 * "hiç form gelmedi" diye okur.
 */
/** Kampanya bölümünün platformu (eşleme; "google değilse Meta" dallanması yok). */
const BOLUM_PLATFORMU = { meta_campaigns: 'meta', google_campaigns: 'google' } as const;

function SutunSecici({
  bolum,
  secim,
  onDegis,
}: {
  bolum: 'meta_campaigns' | 'google_campaigns';
  secim: ColumnKey[] | undefined;
  onDegis: (v: ColumnKey[]) => void;
}) {
  const d = useSozluk(raporlarSozlugu).sablonYonetimi;
  const secili = secim ?? [];
  const disaridakiler = COLUMN_KEYS.filter((k) => !secili.includes(k));
  // Kova başka platformun sayacıysa bu bölümde her zaman 0 (`kovaPlatformu`).
  const bolumPlatformu = BOLUM_PLATFORMU[bolum];
  const yabanciKovalar = secili.filter((k) => {
    const p = kovaPlatformu(k);
    return p !== null && p !== bolumPlatformu;
  });
  const kovaUyarisi = yabanciKovalar.length > 0;

  function tasi(i: number, yon: -1 | 1) {
    const j = i + yon;
    if (j < 0 || j >= secili.length) return;
    const kopya = [...secili];
    [kopya[i], kopya[j]] = [kopya[j]!, kopya[i]!];
    onDegis(kopya);
  }

  return (
    <div className="grid gap-1.5 rounded-alan border border-line bg-surface-muted p-3">
      <p className="m-0 text-12 font-semibold text-ink">{d.sutunlari(SECTION_LABELS[bolum])}</p>
      {secili.length === 0 ? (
        <p className="m-0 text-12 text-ink-muted">
          {d.secimYok}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {secili.map((k, i) => (
            <li
              key={k}
              className="flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-12 text-ink"
            >
              <button
                type="button"
                onClick={() => tasi(i, -1)}
                disabled={i === 0}
                aria-label={d.solaAl}
                className="text-ink-muted transition-colors hover:text-ink disabled:opacity-30"
              >
                ‹
              </button>
              {COLUMN_LABELS[k]}
              <button
                type="button"
                onClick={() => tasi(i, 1)}
                disabled={i === secili.length - 1}
                aria-label={d.sagaAl}
                className="text-ink-muted transition-colors hover:text-ink disabled:opacity-30"
              >
                ›
              </button>
              <button
                type="button"
                onClick={() => onDegis(secili.filter((x) => x !== k))}
                aria-label={d.sutunuKaldir}
                className="ml-0.5 text-ink-muted transition-colors hover:text-danger-strong"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {disaridakiler.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {disaridakiler.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onDegis([...secili, k])}
              className="rounded-full border border-dashed border-line-strong px-2.5 py-0.5 text-12 text-ink-muted transition-colors hover:text-ink"
            >
              + {COLUMN_LABELS[k]}
            </button>
          ))}
        </div>
      )}

      {kovaUyarisi && (
        <p className="m-0 border-l-4 border-l-danger pl-2 text-12 text-ink">
          {d.kovaOn(PLATFORM_KISA_ADLARI[bolumPlatformu])}
          <strong>{d.kovaKalin}</strong>
          {d.kovaSon(yabanciKovalar.map((k) => COLUMN_LABELS[k]).join(', '))}
        </p>
      )}
    </div>
  );
}
