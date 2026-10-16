'use client';

import { useState } from 'react';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { sablonAlanlari } from '@advetics/shared';
import { AcilirMenu, IKON_TETIK, MenuOgesi } from '@/components/ui/acilir-menu';
import { Alan, Girdi, Secim } from '@/components/ui/alan';
import { Dugme } from '@/components/ui/dugme';
import { Serit } from '@/components/ui/hal';
import { YanPanel } from '@/components/ui/pencere';
import { useSozluk } from '@/dil/saglayici';
import { raporlarSozlugu } from '@/dil/sozlukler/raporlar';
import { MailGonderModal, RaporGonder } from './rapor-gonder';
import { RaporPlanla } from './rapor-planla';

/**
 * ═══ RAPOR İŞLEMLERİ: BAŞLIĞIN SAĞINDA (kullanıcı kararı 2026-10-14) ═══
 *
 * "Raporu gönder" TEK birincil eylem (kırmızı), "PDF indir" yanında ikincil
 * düğme; "Planla" ve "Paylaşım bağlantısı" ⋯ menüsünde. Onaylı taslak
 * `docs/marka/sayfa-taslaklari.html#raporlar`. Ekranın asıl işi raporu
 * müşteriye ulaştırmak: eski "Paylaş" menüsü bu işi bağlantı üretmenin
 * yanına bir seçenek olarak gömüyordu ve kullanıcı "nasıl gönderiyorum"u
 * menüde arıyordu.
 *
 * ÜÇ YOL DA AYNI ŞABLONU TAŞIYOR (`sablon`). Öncesinde buraya
 * `templateId={null}` SABİT geçiliyordu ve PDF ile mail ekrandaki seçimi hiç
 * görmüyordu: kullanıcı Google raporuna bakarken Genel raporu indiriyordu.
 *
 * Mail, plan ve bağlantı YAN PANELDE: rapor ekranından çıkmadan sağdan
 * açılıyor; sonuçları da panelin içinde kalıyor.
 */
export function ShareControls({
  clientId,
  from,
  to,
  hasData,
  sablon,
  paylasabilir,
}: {
  clientId: string;
  from: string;
  to: string;
  hasData: boolean;
  /**
   * `report.share`. Mail, plan ve paylaşım bağlantısının uçları bu yetkiyi
   * istiyor (`reports.controller.ts`); PDF yalnız `report.read`. Yetkisi
   * olmayan kullanıcı eskiden "Raporu gönder"i, ⋯ "Planla"yı ve "Paylaşım
   * bağlantısı"nı görüp açtığı panelde 403 alıyordu: müşteri hesabına
   * yapamayacağı bir işi vaat etmek. Yetkisizde yalnız "PDF indir" kalır.
   */
  paylasabilir: boolean;
  /**
   * Ekranda seçili şablon: ön ayar kodu ya da kayıtlı şablonun UUID'si.
   *
   * TEK DEĞER, ÜÇ TÜKETİCİ (PDF, mail, bağlantı).
   */
  sablon: string | null;
}) {
  /** Seçim kayıtlı bir şablonsa UUID'si; ön ayarsa `null`. */
  const kayitliSablonId = sablonAlanlari(sablon).templateId ?? null;
  const [mailAcik, setMailAcik] = useState(false);
  const [planAcik, setPlanAcik] = useState(false);
  const [baglantiAcik, setBaglantiAcik] = useState(false);

  return (
    <>
      {/*
        PDF DÜZ BİR BAĞLANTI, ikincil düğme görünüşünde: indirmek belgeyi
        kendine almak, göndermek müşteriye ulaştırmak. İkisi aynı yerde ama
        AYNI DÜĞME DEĞİL.
      */}
      <RaporGonder clientId={clientId} from={from} to={to} hasData={hasData} sablon={sablon} />

      {paylasabilir && (
        <PaylasimIslemleri
          hasData={hasData}
          onPlan={() => setPlanAcik(true)}
          onBaglanti={() => setBaglantiAcik(true)}
          onMail={() => setMailAcik(true)}
        />
      )}

      {/*
        PLANLAMA YALNIZCA KAYITLI ŞABLONU ALABİLİYOR. `report_plans.template_id`
        bir UUID ve ön ayarların UUID'si YOK; ön ayar seçiliyken plana `null`
        geçiyor ve sunucu müşterinin kendi şablonunu bulup yoksa varsayılanı
        üretiyor. Paneller de yalnız yetkide çiziliyor: açılışta kendi
        verilerini (plan listesi, mail taslağı) okuyorlar.
      */}
      {paylasabilir && (
        <>
          <RaporPlanla clientId={clientId} templateId={kayitliSablonId} acik={planAcik} onKapat={() => setPlanAcik(false)} />

          <PaylasimBaglantisi
            clientId={clientId}
            from={from}
            to={to}
            sablon={sablon}
            kayitliSablonId={kayitliSablonId}
            hasData={hasData}
            acik={baglantiAcik}
            onKapat={() => setBaglantiAcik(false)}
          />

          <MailGonderModal
            clientId={clientId}
            from={from}
            to={to}
            acik={mailAcik}
            onKapat={() => setMailAcik(false)}
            sablon={sablon}
          />
        </>
      )}
    </>
  );
}

/** ⋯ (Planla, Paylaşım bağlantısı) ve birincil "Raporu gönder": üçü de `report.share`. */
function PaylasimIslemleri({
  hasData,
  onPlan,
  onBaglanti,
  onMail,
}: {
  hasData: boolean;
  onPlan: () => void;
  onBaglanti: () => void;
  onMail: () => void;
}) {
  const d = useSozluk(raporlarSozlugu).paylas;
  return (
    <>
      <AcilirMenu
        etiket={d.digerIslemler}
        hizala="sag"
        genislik="w-72"
        tetik={({ acik: _acik, ...o }) => (
          <button type="button" {...o} aria-label={d.digerIslemler} className={`${IKON_TETIK} h-10 w-10 border border-line-strong`}>
            <span aria-hidden className="text-15 leading-none">
              ⋯
            </span>
          </button>
        )}
      >
        {/*
          PLANLA VERİYE BAĞLI DEĞİL: diğer işlemler BU dönemin raporuyla
          ilgili ve dönem boşsa anlamsız; planlama ise GELECEK dönemleri
          kuruyor. `hasData` ile kapatmak, bu hafta harcaması olmayan bir
          müşteriye plan kurulamaması demek olurdu.
        */}
        <MenuOgesi onClick={onPlan} aciklama={d.planlaAciklama}>
          {d.planla}
        </MenuOgesi>
        <MenuOgesi
          onClick={onBaglanti}
          devreDisi={!hasData}
          aciklama={hasData ? d.baglantiAciklama : d.veriYok}
        >
          {d.baglanti}
        </MenuOgesi>
      </AcilirMenu>

      <Dugme onClick={onMail} disabled={!hasData} title={hasData ? undefined : d.veriYok}>
        {d.raporuGonder}
      </Dugme>
    </>
  );
}

/**
 * ═══ PAYLAŞIM BAĞLANTISI: YAN PANEL ═══
 *
 * Ham token yalnızca ÜRETİM ANINDA bir kez dönüyor (sunucuda hash'i
 * saklanıyor), bu yüzden ekranda gösterilip kopyalanması gerekiyor. Panel
 * kapanınca kaybolduğu açıkça yazıyor: kullanıcı "sonra bakarım" diye
 * kapatmasın.
 *
 * SÜRE BAĞLANTIYI ÜRETEN DÜĞMENİN ÜSTÜNDE: kararın verildiği yer burası.
 */
function PaylasimBaglantisi({
  clientId,
  from,
  to,
  sablon,
  kayitliSablonId,
  hasData,
  acik,
  onKapat,
}: {
  clientId: string;
  from: string;
  to: string;
  sablon: string | null;
  kayitliSablonId: string | null;
  hasData: boolean;
  acik: boolean;
  onKapat: () => void;
}) {
  const d = useSozluk(raporlarSozlugu).paylas;
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expiresInDays, setExpiresInDays] = useState<string>('');

  async function createLink() {
    setBusy(true);
    setError(null);
    setLink(null);
    try {
      const res = await apiFetch<{ token: string }>('/reports/shares', {
        method: 'POST',
        body: JSON.stringify({
          /*
           * SEÇİLİ ŞABLON KAYITLIYSA BAĞLANTIYA DA GİRİYOR. Öncesinde HİÇ
           * gönderilmiyordu: müşteri linki açtığında BAŞKA bir raporu
           * görüyordu.
           *
           * ÖN AYARLAR BAĞLANTIYA KONULAMIYOR: `report_shares.template_id`
           * bir UUID ve ön ayarların UUID'si yok. Uydurmak yerine panelde
           * yazıyoruz.
           */
          ...(kayitliSablonId ? { templateId: kayitliSablonId } : {}),
          clientId,
          from,
          to,
          ...(expiresInDays ? { expiresInDays: Number(expiresInDays) } : {}),
        }),
      });
      const adres = `${window.location.origin}/r/${res.token}`;
      setLink(adres);
      /*
       * ÜRETİP HEMEN KOPYALIYOR. Kopyalama başarısız olursa (izin yok,
       * güvensiz bağlam) bağlantı ekranda duruyor ve elle kopyalanabiliyor.
       */
      try {
        await navigator.clipboard.writeText(adres);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Sessiz geçilmiyor: bağlantı kutusu zaten açık ve orada "Kopyala" düğmesi var.
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : d.olusturulamadi);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <YanPanel
      acik={acik}
      onKapat={onKapat}
      baslik={d.baglanti}
      altEylemler={
        <>
          <Dugme ton="ikincil" onClick={onKapat}>
            {d.kapat}
          </Dugme>
          <Dugme onClick={() => void createLink()} bekliyor={busy} disabled={busy || !hasData}>
            {d.baglantiyiKopyala}
          </Dugme>
        </>
      }
    >
      <p className="m-0 text-13 text-ink-muted">{d.baglantiAciklamaPanel}</p>

      <Alan etiket={d.sure}>
        {(id) => (
          <Secim id={id} value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)}>
            <option value="">{d.suresiz}</option>
            <option value="7">{d.gun7}</option>
            <option value="30">{d.gun30}</option>
            <option value="90">{d.gun90}</option>
          </Secim>
        )}
      </Alan>

      {/*
        KISIT EKRANDA YAZIYOR: kararın verildiği yerde. Ön ayar seçiliyken
        üretilen bağlantı müşterinin kendi şablonunu (yoksa varsayılanı)
        gösteriyor; söylememek, ekranda görülenden farklı bir raporu sessizce
        paylaşmak olurdu.
      */}
      {sablon !== null && kayitliSablonId === null && (
        <Serit baslik={d.hazirSablonBaslik}>{d.hazirSablonMetin}</Serit>
      )}

      {error && (
        <Serit ton="hata" baslik={d.olusturulamadiBaslik}>
          {error}
        </Serit>
      )}

      {link && (
        <div className="grid gap-2 rounded-alan border border-line p-3">
          <p className="m-0 text-13 font-semibold text-ink">{d.hazir}</p>
          <div className="flex gap-2">
            <Girdi readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-12" aria-label={d.baglantiEtiket} />
            <Dugme ton="koyu" onClick={() => void copy()}>
              {copied ? d.kopyalandi : d.kopyala}
            </Dugme>
          </div>
        </div>
      )}
    </YanPanel>
  );
}
