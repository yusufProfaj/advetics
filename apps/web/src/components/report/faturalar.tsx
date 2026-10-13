'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MAIL_EK_TOPLAM_SINIRI,
  FATURA_ETIKETLERI,
  FATURA_KABUL,
  FATURA_MAX_BAYT,
  FATURA_PLATFORMLARI,
  FATURA_PLATFORM_ETIKETLERI,
  donemMetni,
  kapsananDonemler,
  type FaturaOzeti,
  type FaturaPlatformu,
} from '@advetics/shared';
import { ApiRequestError, apiFetch, API_URL } from '@/lib/api';
import { AcilirMenu, IKON_TETIK, MenuAyraci, MenuOgesi } from '@/components/ui/acilir-menu';
import { Alan, FormIzgarasi, Girdi, Secim } from '@/components/ui/alan';
import { Dugme } from '@/components/ui/dugme';
import { BosDurum, HataDurumu, Serit, Yukleniyor } from '@/components/ui/hal';
import { AdHucresi, Tablo, type TabloSutunu } from '@/components/ui/tablo';

/**
 * ═══ PLATFORM FATURALARI ═══
 *
 * Müşteri raporu alırken Meta/Google faturasını da aynı mailde görsün diye.
 * İstek birebir: "müşteri her şeyi tek pakette görsün."
 *
 * BİR DÖNEME BİRDEN ÇOK FATURA GİREBİLİR. Önceden `(müşteri, platform, dönem)`
 * tekildi ve ikinci yükleme öncekini EZİYORDU; ajans ikisini de yükledim
 * sanıyordu, müşteriye tek belge gidiyordu. Tekillik kaldırılmadı, dosyanın
 * İÇERİĞİNE taşındı: aynı PDF iki kez yüklenemiyor, çünkü o da müşteriye aynı
 * faturanın iki kopyası olarak giderdi.
 *
 * ELLE YÜKLENİYOR ve bu bir eksiklik değil, platformların kısıtı:
 * Google'ın fatura API'si yalnızca aylık faturalama (kredi hattı)
 * hesaplarında çalışıyor — kartla ödeyende hata veriyor. Meta'da ise fatura
 * PDF'i döndüren bir uç hiç yok. Gerekçe `packages/shared/.../fatura.schema.ts`
 * başında ayrıntılı yazılı.
 *
 * RAPORLAR › FATURALAR BÖLÜMÜ (onaylı taslak `#raporlar`): üstte yükleme
 * kartı, altında yüklü faturalar tablosu. Rapor bölümündeki eksik fatura
 * şeridi ve yan menüdeki kırmızı nokta sayfada sunucuda hesaplanıyor; buraya
 * `odakDonemler` geliyor ve aynı eksik bu bölümde de yazıyor. Tek bileşen:
 * ayrı yazılsalar biri PDF kontrolünü ya da eksik uyarısını kaybederdi.
 */
export function Faturalar({
  clientId,
  /** Rapor sayfasından geliyor: o dönem hazır seçili gelsin ve eksikse uyarsın. */
  odakDonemler,
  canWrite,
}: {
  clientId: string;
  odakDonemler?: string[];
  canWrite: boolean;
}) {
  const [liste, setListe] = useState<FaturaOzeti[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [uyari, setUyari] = useState<string | null>(null);

  const varsayilanDonem = odakDonemler?.[odakDonemler.length - 1] ?? buAy();
  const [donem, setDonem] = useState(varsayilanDonem);
  const [platform, setPlatform] = useState<FaturaPlatformu>('meta');
  const [aciklama, setAciklama] = useState('');
  const dosyaRef = useRef<HTMLInputElement>(null);

  const yukle = useCallback(() => {
    apiFetch<FaturaOzeti[]>(`/reports/faturalar?clientId=${clientId}`)
      .then((r) => {
        setListe(r);
        setHata(null);
      })
      /*
       * HATA YUTULMUYOR. `.catch(() => setListe([]))` yazmak "henüz
       * yüklemedim", "fatura yok" ve "çağrı düştü"yü aynı boş alana
       * çevirirdi — bu projede tekrar eden hata türü.
       */
      .catch((err: unknown) => {
        setListe(null);
        setHata(err instanceof ApiRequestError ? err.message : 'Faturalar okunamadı.');
      });
  }, [clientId]);

  useEffect(() => {
    yukle();
  }, [yukle]);

  async function gonder(): Promise<void> {
    const dosya = dosyaRef.current?.files?.[0];
    if (!dosya) {
      setHata(`Önce bir dosya seç (${FATURA_ETIKETLERI}).`);
      return;
    }
    /*
     * BOYUT TARAYICIDA DA KONTROL EDİLİYOR. Sunucu zaten reddediyor ama
     * 20 MB'lık bir dosyayı yükleyip sonra reddedilmek, kullanıcının
     * bağlantısını boşa harcamak demek.
     */
    if (dosya.size > FATURA_MAX_BAYT) {
      /*
       * SINIR SABİTTEN YAZILIYOR. Burada "10 MB" ELLE yazılıydı ve sınır
       * 20 MB'a çıkınca kullanıcıya YANLIŞ sayıyı söylemeye başladı — mesaj
       * kodla birlikte güncellenmeyen her sabit gibi.
       */
      setHata(
        `Dosya çok büyük (${Math.round(dosya.size / 1024 / 1024)} MB). ` +
          `Üst sınır ${Math.round(FATURA_MAX_BAYT / 1024 / 1024)} MB.`,
      );
      return;
    }

    /*
     * MAİLE SIĞMAYACAK DOSYA YÜKLEME ANINDA SÖYLENİYOR — ve yükleme
     * DURDURULMUYOR.
     *
     * Dosya sınırı (20 MB) ile bir maildeki toplam ek bütçesi (22 MB) ayrı
     * şeyler: 20 MB'lık tek bir arşiv yüklenebiliyor ama yanına rapor PDF'i
     * de eklenince bütçeyi aşabiliyor ve o fatura maile GİRMİYOR. Kullanıcı
     * bunu "Gönder"e bastığında değil, dosyayı seçtiğinde bilmeli.
     *
     * Yükleme yine de yapılıyor: dosya panelde duruyor ve oradan indirilip
     * elle iletilebiliyor. Reddetmek, saklamanın tek faydasını da götürürdü.
     */
    const sigmaz = dosya.size > MAIL_EK_TOPLAM_SINIRI * 0.85;
    setUyari(
      sigmaz
        ? `Bu dosya ${Math.round(dosya.size / 1024 / 1024)} MB. Rapor PDF'iyle birlikte ` +
            'mail sınırını aşabilir ve maile eklenmeyebilir. Yüklendikten sonra panelden ' +
            'indirip elle iletebilirsin.'
        : null,
    );

    setYukleniyor(true);
    setHata(null);
    try {
      const fd = new FormData();
      fd.append('file', dosya);
      const qs = new URLSearchParams({ clientId, platform, donem });
      if (aciklama.trim()) qs.set('aciklama', aciklama.trim());

      /*
       * `apiFetch` KULLANILMIYOR: o JSON gövdesi kuruyor ve `Content-Type`
       * yazıyor. `FormData` için tarayıcının `boundary` üretebilmesi
       * gerekiyor, yani başlık ELLE YAZILMAMALI.
       */
      const res = await fetch(`${API_URL}/reports/faturalar?${qs}`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      if (!res.ok) {
        const govde = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(govde?.message ?? `Yükleme başarısız (HTTP ${res.status}).`);
      }
      if (dosyaRef.current) dosyaRef.current.value = '';
      setAciklama('');
      yukle();
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Fatura yüklenemedi.');
    } finally {
      setYukleniyor(false);
    }
  }

  async function sil(f: FaturaOzeti): Promise<void> {
    setHata(null);
    try {
      await apiFetch(`/reports/faturalar/${f.id}?clientId=${clientId}`, { method: 'DELETE' });
      yukle();
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : 'Silinemedi.');
    }
  }

  /*
   * ODAKTAKİ DÖNEMDE EKSİK OLAN PLATFORMLAR.
   *
   * Bu bileşenin ASIL işi: ajans yüklemeyi unutursa rapor faturasız gider ve
   * kimse fark etmez. Kullanıcı kararı "uyar ama gönder" olduğu için uyarının
   * GÖRÜNÜR olması şart — yoksa karar yarım uygulanmış olur.
   *
   * PLATFORM BAŞINA DEĞİL DÖNEM BAŞINA bakılıyor: müşterinin yalnızca
   * Meta'da reklamı olabilir ve "Google faturası eksik" her ay yanlış bir
   * uyarı üretirdi. Okunmaz hâle gelen uyarı, hiç olmayandan kötü.
   */
  const eksikOdak =
    liste === null || !odakDonemler
      ? []
      : odakDonemler.filter((d) => !liste.some((f) => f.donem === d));

  const sutunlar: Array<TabloSutunu<FaturaOzeti>> = [
    {
      anahtar: 'dosya',
      baslik: 'Dosya',
      /* TÜR GÖRÜNÜYOR: bir ZIP'in içinde ne olduğu açmadan bilinmiyor ve maile giden şey o. */
      hucre: (f) => (
        <AdHucresi
          ad={f.fileName}
          alt={[f.mimeType === 'application/zip' ? 'ZIP' : 'PDF', f.aciklama, f.uploadedByName].filter(Boolean).join(' · ')}
        />
      ),
    },
    { anahtar: 'donem', baslik: 'Dönem', hucre: (f) => donemMetni(f.donem) },
    { anahtar: 'platform', baslik: 'Platform', hucre: (f) => FATURA_PLATFORM_ETIKETLERI[f.platform] },
    { anahtar: 'boyut', baslik: 'Boyut', sayi: true, hucre: (f) => `${Math.max(1, Math.round(f.byteSize / 1024))} KB` },
    {
      anahtar: 'eylem',
      baslik: <span className="sr-only">Eylemler</span>,
      sayi: true,
      hucre: (f) => (
        <AcilirMenu
          tasma="portal"
          etiket={`${f.fileName}: eylemler`}
          hizala="sag"
          genislik="w-40"
          tetik={({ acik: _acik, ...o }) => (
            <button type="button" {...o} aria-label="Eylemler" className={IKON_TETIK}>
              <span aria-hidden className="text-15 leading-none">
                ⋯
              </span>
            </button>
          )}
        >
          <MenuOgesi
            onClick={() =>
              window.open(`${API_URL}/reports/faturalar/${f.id}/dosya?clientId=${clientId}`, '_blank', 'noreferrer')
            }
          >
            Aç
          </MenuOgesi>
          {canWrite && (
            <>
              <MenuAyraci />
              <MenuOgesi tehlike onClick={() => void sil(f)}>
                Sil
              </MenuOgesi>
            </>
          )}
        </AcilirMenu>
      ),
    },
  ];

  return (
    <div className="grid min-w-0 gap-4">
      {eksikOdak.length > 0 && (
        <Serit baslik={`${eksikOdak.map(donemMetni).join(', ')} için fatura yüklenmemiş`}>
          Rapor yine gönderilir, ama fatura eki olmadan.
        </Serit>
      )}

      {canWrite && (
        <section className="min-w-0 rounded-kart border border-line bg-surface">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-4">
            <h3 className="m-0 font-baslik text-15 font-bold text-ink">Platform faturaları</h3>
            <small className="text-12 text-ink-muted">
              Rapor mailine <strong>ayrı ek</strong> olarak gider · {FATURA_ETIKETLERI}, en çok{' '}
              {Math.round(FATURA_MAX_BAYT / 1024 / 1024)} MB
            </small>
          </div>
          <div className="grid gap-3.5 p-5">
            <FormIzgarasi>
              <Alan etiket="Dönem">
                {(id) => <Girdi id={id} type="month" value={donem} onChange={(e) => setDonem(e.target.value)} />}
              </Alan>
              <Alan etiket="Platform">
                {(id) => (
                  <Secim id={id} value={platform} onChange={(e) => setPlatform(e.target.value as FaturaPlatformu)}>
                    {FATURA_PLATFORMLARI.map((p) => (
                      <option key={p} value={p}>
                        {FATURA_PLATFORM_ETIKETLERI[p]}
                      </option>
                    ))}
                  </Secim>
                )}
              </Alan>
              <Alan etiket="Not (isteğe bağlı)">
                {(id) => <Girdi id={id} value={aciklama} onChange={(e) => setAciklama(e.target.value)} placeholder="Fatura no" />}
              </Alan>
              {/* PDF ya da ZIP. Ekran görüntüsü HÂLÂ kabul edilmiyor: fatura
                  resmi bir belge. Sunucu biçimi sihirli baytlardan doğruluyor;
                  buradaki `accept` yalnızca dosya seçiciyi daraltıyor. */}
              <Alan etiket="Dosya">
                {(id) => (
                  <input
                    id={id}
                    ref={dosyaRef}
                    type="file"
                    accept={FATURA_KABUL}
                    className="text-13 text-ink-muted file:mr-2 file:h-8 file:rounded-full file:border file:border-line-strong file:bg-surface file:px-3.5 file:text-[12.5px] file:font-bold file:text-ink"
                  />
                )}
              </Alan>
            </FormIzgarasi>
            <p className="m-0 text-12 text-ink-muted">
              Aynı döneme birden çok fatura yükleyebilirsin; hepsi maile eklenir. Aynı dosya iki kez yüklenemez.{' '}
              {/*
                PAROLA KORUMALI ARŞİV SESSİZ RET ÜRETİYOR: kurumsal mail
                sunucuları onları koşulsuz engelliyor ve sunucumuz bunu sihirli
                bayttan AYIRT EDEMİYOR. Belirtisi "mail gitti ama müşteriye
                ulaşmadı". Söylemek tek çare.
              */}
              <strong className="text-ink">Parola korumalı arşiv yükleme</strong>: mail sunucuları onları engelliyor ve
              mail sessizce ulaşmıyor.
            </p>
            {uyari !== null && <Serit baslik="Maile sığmayabilir">{uyari}</Serit>}
            {hata !== null && liste !== null && (
              <Serit ton="hata" baslik="İşlem yapılamadı">
                {hata}
              </Serit>
            )}
          </div>
          <div className="flex justify-end border-t border-line px-5 py-3">
            {/* KART İÇİNDE KIRMIZI DOLU DÜĞME YOK: sayfanın birincil eylemi raporu göndermek. */}
            <Dugme ton="koyu" boyut="kucuk" onClick={() => void gonder()} bekliyor={yukleniyor}>
              Yükle
            </Dugme>
          </div>
        </section>
      )}

      {/* DÖRT HÂL AYRI: okunuyor, okunamadı (sunucunun cümlesi), boş, dolu. */}
      {liste === null && hata === null && <Yukleniyor satir={3} etiket="Faturalar okunuyor" />}
      {liste === null && hata !== null && <HataDurumu baslik="Faturalar okunamadı" mesaj={hata} onTekrar={yukle} />}
      {liste !== null && (
        <section className="min-w-0 rounded-kart border border-line bg-surface">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-4">
            <h3 className="m-0 font-baslik text-15 font-bold text-ink">Yüklü faturalar</h3>
            {/* SAYAÇ KOŞULSUZ: "sessiz kesme yok". */}
            <small className="text-12 text-ink-muted">{liste.length} fatura yüklü</small>
          </div>
          <Tablo
            etiket="Yüklü faturalar"
            sutunlar={sutunlar}
            satirlar={liste}
            satirAnahtari={(f) => f.id}
            bos={<BosDurum baslik="Fatura yok" neden="Bu workspace için yüklenmiş fatura yok." />}
            sayfalama={{ bas: liste.length === 0 ? 0 : 1, son: liste.length, toplam: liste.length }}
          />
        </section>
      )}
    </div>
  );
}

function buAy(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Rapor aralığından odak dönemleri — sayfa bunu bileşene geçiriyor. */
export { kapsananDonemler };
