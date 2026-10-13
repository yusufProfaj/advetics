'use client';

import { useEffect, useRef, useState } from 'react';
import { raporSorgusu, sablonAlanlari, type ReportMailDraft } from '@advetics/shared';
import { AliciListesiAlani } from '@/components/alici-listesi-alani';
import { MailGovdeEditoru } from './mail-govde-editoru';
import { ApiRequestError, apiFetch, API_URL } from '@/lib/api';
import { Alan, Girdi } from '@/components/ui/alan';
import { Dugme, dugmeSinifi } from '@/components/ui/dugme';
import { Serit, Yukleniyor } from '@/components/ui/hal';
import { YanPanel } from '@/components/ui/pencere';
import { DurumNoktasi } from '@/components/ui/rozet';

/**
 * ═══ PDF İNDİR ═══
 *
 * Belgeyi kendin göndermek ya da arşivlemek için.
 *
 * İKİNCİL DÜĞME, "Raporu gönder"in SOLUNDA (kullanıcı kararı 2026-10-14):
 * ekranın tek kırmızı düğmesi müşteriye göndermek; indirmek kendine almak.
 * Mail akışı buradaki `MailGonderModal`da duruyor ve açılışını rapor
 * başlığındaki "Raporu gönder" belirliyor (`share-controls.tsx`).
 */
export function RaporGonder({
  clientId,
  from,
  to,
  hasData,
  sablon,
}: {
  clientId: string;
  from: string;
  to: string;
  hasData: boolean;
  /** Ekranda seçili şablon — ön ayar kodu ya da kayıtlı şablonun UUID'si. */
  sablon: string | null;
}) {
  /*
   * ═══ ŞABLON BU BAĞLANTIYA GİRMİYORDU — DÜZELTİLEN HATA ═══
   *
   * Burada `new URLSearchParams({ clientId, from, to })` yazıyordu. Önizleme
   * şablonu taşıyor, PDF taşımıyordu: ekranda Google raporunu gören kullanıcı
   * Genel raporu indiriyor ve bunu ancak PDF'i AÇINCA anlıyordu. Hiçbir hata
   * da düşmüyordu, çünkü şablonsuz istek de geçerli bir istek ve sunucu
   * varsayılanı üretiyor — bu projenin klasik sessiz hatası.
   *
   * Sorgu artık TEK ÜRETİCİDEN (`raporSorgusu`) geliyor; önizleme, PDF ve mail
   * aynı fonksiyonu çağırıyor ve `rapor-sorgusu.spec.ts` bunu kilitliyor.
   */
  const qs = new URLSearchParams(raporSorgusu({ clientId, from, to, sablon }));

  return (
    /*
      PDF DÜZ BİR BAĞLANTI. `fetch` ile indirmek gövdeyi belleğe alıp blob
      üretmek demek; tarayıcının kendi indirme akışı hem daha ucuz hem de
      büyük dosyada ilerleme gösteriyor.
    */
    <a
      href={`${API_URL}/reports/pdf?${qs}`}
      aria-disabled={hasData ? undefined : true}
      className={`${dugmeSinifi('ikincil')} ${hasData ? '' : 'pointer-events-none opacity-40'}`}
      title={hasData ? undefined : 'Bu dönemde veri yok'}
    >
      PDF indir
    </a>
  );
}

/**
 * ═══ RAPORU GÖNDER: KONTROLLÜ YAN PANEL ═══
 *
 * Kendi düğmesi YOK: açılışını rapor başlığındaki birincil "Raporu gönder"
 * belirliyor. Yan panel (onaylı taslak `#raporlar`): rapor ekranından
 * çıkmadan sağdan açılıyor, sonuç da panelin içinde kalıyor.
 *
 * MAİL TASLAĞI DÜZENLENEBİLİR ve bu kasıtlı. Sayılar rapordan geliyor ama
 * anlatı ("Urla bölgesindeki konut aramalarında...") veriden çıkarılamıyor;
 * uydurmak müşteriye yanlış bir strateji anlatmak olurdu. Gönderen kişi
 * göndermeden önce okuyor ve düzenliyor.
 */
export function MailGonderModal({
  clientId,
  from,
  to,
  acik,
  onKapat,
  sablon,
}: {
  clientId: string;
  from: string;
  to: string;
  acik: boolean;
  onKapat: () => void;
  /**
   * Ekranda seçili şablon.
   *
   * HEM TASLAKTA HEM GÖNDERİMDE gerekiyor: taslak metni rapordaki sayılardan
   * üretiliyor ve PDF eki de aynı rapordan. Yalnızca birine vermek, mailin
   * metni ile ekindeki belgenin farklı şablondan gelmesi demekti.
   */
  sablon: string | null;
}) {
  const [taslak, setTaslak] = useState<ReportMailDraft | null>(null);
  const [alici, setAlici] = useState<string[]>([]);
  const [konu, setKonu] = useState('');
  const [govde, setGovde] = useState('');
  const [ekPdf, setEkPdf] = useState(true);
  const [bekleyen, setBekleyen] = useState<'taslak' | 'gonder' | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<string | null>(null);
  const [reddedilen, setReddedilen] = useState<Array<{ adres: string; sebep: string }>>([]);

  const qs = new URLSearchParams(raporSorgusu({ clientId, from, to, sablon }));

  /**
   * TASLAĞIN KİMLİĞİ — hangi müşteri, hangi dönem, hangi şablon.
   *
   * Bu anahtar hem yeniden çekme kararını hem editörün yeniden doldurulmasını
   * yönetiyor; ikisinin ayrı ölçütlere bakması, gövdenin bir dönemi ekin başka
   * bir dönemi anlatması demek olurdu.
   */
  const taslakAnahtari = `${clientId}|${from}|${to}|${sablon ?? ''}`;
  const cekilenAnahtar = useRef<string | null>(null);

  /*
   * TASLAK AÇILIŞTA ÇEKİLİYOR — ve DÖNEM/ŞABLON DEĞİŞTİYSE YENİDEN.
   *
   * Koşul eskiden `taslak !== null` idi: bir kez çekildikten sonra bir daha
   * ASLA çekilmiyordu. Kullanıcı pencereyi kapatıp tarih aralığını ya da
   * şablonu değiştirip yeniden açtığında mail METNİ eski dönemi anlatıyor,
   * PDF EKİ ise yeni dönem için üretiliyordu — aynı mailde iki farklı gerçek
   * ve farkı yalnızca ALICI görür.
   *
   * "Kullanıcının yazdığının üzerine yazma" kaygısı KORUNUYOR: anahtar
   * değişmediği sürece yeniden çekilmiyor, yani aynı rapor için açıp kapamak
   * yazılanı silmiyor.
   */
  useEffect(() => {
    if (!acik) return;
    if (cekilenAnahtar.current === taslakAnahtari) return;
    cekilenAnahtar.current = taslakAnahtari;
    void taslakGetir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acik, taslakAnahtari]);

  async function taslakGetir() {
    setBekleyen('taslak');
    setHata(null);
    setSonuc(null);
    try {
      const t = await apiFetch<ReportMailDraft>(`/reports/mail-draft?${qs}`);
      setTaslak(t);
      setKonu(t.subject);
      setGovde(t.html);
      setAlici(t.defaultTo);
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : 'Taslak alınamadı.');
    } finally {
      setBekleyen(null);
    }
  }

  async function gonder() {
    setBekleyen('gonder');
    setHata(null);
    try {
      const r = await apiFetch<{
        to: string[];
        reddedilen: Array<{ adres: string; sebep: string }>;
      }>('/reports/send', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          from,
          to,
          /*
           * ŞABLON GÖVDEYE DE GİRİYOR. Taslağı doğru şablondan çekip
           * gönderirken göndermemek, müşteriye giden PDF EKİNİN ekrandakinden
           * farklı olması demekti — ve bunu yalnızca alıcı görürdü.
           * `sablonAlanlari` UUID mi ön ayar kodu mu olduğunu ayırıyor;
           * sunucu şeması ikisini ayrı alanda bekliyor.
           */
          ...sablonAlanlari(sablon),
          to_emails: alici.length > 0 ? alici : undefined,
          subject: konu.trim(),
          html: govde,
          attachPdf: ekPdf,
        }),
      });
      /*
       * KISMİ RET AYRI GÖSTERİLİYOR. Sunucu bazı alıcıları reddetse bile
       * istek başarılı dönüyor (nodemailer yalnızca HEPSİ reddedilirse
       * fırlatıyor); tek bir "gönderildi" cümlesi, raporun ulaşmadığını
       * günler sonra öğrenmek demekti.
       */
      setReddedilen(r.reddedilen);
      setSonuc(
        r.to.length > 0
          ? `Rapor ${r.to.length} adrese gönderildi: ${r.to.join(', ')}`
          : 'Hiçbir adrese gönderilemedi.',
      );
    } catch (err) {
      // Sunucunun KENDİ mesajı: "kimlik doğrulanamadı" ile "alıcı reddedildi"
      // farklı işler ve ikisini tek cümleye çevirmek kullanıcıyı tahmine
      // bırakır.
      setHata(err instanceof ApiRequestError ? err.message : 'Gönderilemedi.');
    } finally {
      setBekleyen(null);
    }
  }

  /*
   * SONUÇ PANELİN İÇİNDE KALIYOR. Eski pencere başarılı gönderimde
   * kapanıyor ve onay cümlesini sayfanın başka bir yerine basıyordu;
   * kullanıcı gönderip göndermediğini aramak zorunda kalıyordu. Panel
   * açık kalıyor, düğme "Kapat"a dönüyor.
   */
  const bitti = sonuc !== null;
  function kapat() {
    if (bekleyen === 'gonder') return;
    onKapat();
    if (bitti) {
      setSonuc(null);
      setReddedilen([]);
    }
  }

  return (
    <YanPanel
      acik={acik}
      onKapat={kapat}
      genislik={600}
      baslik="Raporu müşteriye gönder"
      altEylemler={
        bitti ? (
          <Dugme ton="ikincil" onClick={kapat}>
            Kapat
          </Dugme>
        ) : (
          <>
            <Dugme ton="ikincil" onClick={kapat}>
              Vazgeç
            </Dugme>
            <Dugme
              onClick={() => void gonder()}
              bekliyor={bekleyen === 'gonder'}
              disabled={
                bekleyen !== null ||
                !taslak?.senderReady ||
                /*
                 * BOŞ LİSTE DÜĞMEYİ KAPATMIYOR ARTIK: müşterinin kayıtlı
                 * alıcıları varsa gönderim geçerli. Kapalı tutmak,
                 * çoğunlukla hiçbir adres yazmayacak kullanıcıyı her
                 * seferinde adres yazmaya zorlardı.
                 */
                (alici.length === 0 && (taslak?.defaultTo.length ?? 0) === 0) ||
                konu.trim().length === 0
              }
            >
              Gönder
            </Dugme>
          </>
        )
      }
    >
      {sonuc && (
        <p role="status" className="m-0 flex items-start gap-2 text-13 text-ink">
          <DurumNoktasi hal={sonuc.startsWith('Rapor ') ? 'ok' : 'hata'} />
          {sonuc}
        </p>
      )}
      {reddedilen.length > 0 && (
        /*
         * REDDEDİLEN ALICILAR AYRI VE UYARI ŞERİDİNDE. "Gönderildi"
         * cümlesinin içine sıkıştırmak, kısmi bir arızayı başarı gibi
         * gösterirdi: ve bu projede en pahalı hata türü tam olarak o.
         */
        <Serit baslik={`${reddedilen.length} adres reddedildi`}>
          Bu kişilere ulaşmadı: {reddedilen.map((r) => `${r.adres} (${r.sebep})`).join(' · ')}
        </Serit>
      )}

      {bekleyen === 'taslak' && <Yukleniyor satir={4} etiket="Taslak hazırlanıyor" />}

      {taslak && !taslak.senderReady && (
        /*
          DOĞRULANMAMIŞ HESAPLA GÖNDERİM KAPALI: ve sebebi burada yazıyor.
          Sunucu da reddediyor; ekranda söylemek, kullanıcıyı bir hata
          mesajıyla karşılaşmadan doğru yere yönlendiriyor.
        */
        <Serit baslik="E-posta ayarların doğrulanmamış.">
          Ayarlar › Hesabım › E-posta bölümünden kendine test maili gönder. Doğrulanmamış bir hesapla
          müşteriye mail atmak, ilk hatanın müşteriye gitmesi demek.
        </Serit>
      )}

      {taslak && taslak.senderReady && (
        <p className="m-0 text-12 text-ink-muted">
          Gönderen: <strong className="text-ink">{taslak.senderEmail}</strong> · yanıtlar sana gelir
        </p>
      )}

      {!bitti && (
        <>
          {/*
           * ALICI LİSTE. Bileşen paylaşılıyor (plan ekranı ve müşteri formu da
           * onu kullanıyor): ayrıştırma kuralı üç yerde ayrı yazılsaydı biri
           * virgülü ayırıcı sayarken diğeri saymaz, biri tekilleştirirken
           * diğeri aynı adrese iki kez gönderirdi.
           */}
          <AliciListesiAlani
            etiket="Alıcılar"
            degerler={alici}
            onChange={setAlici}
            bosVarsayilan={taslak?.defaultTo ?? []}
          />

          <Alan etiket="Konu">
            {(id) => <Girdi id={id} value={konu} onChange={(e) => setKonu(e.target.value)} />}
          </Alan>

          {/*
            HAM HTML YERİNE ÖNİZLEME. Kullanıcı burada "değerlendirme"
            paragrafını yazıyor ve bunu etiketlerin arasından yapmak hem yavaş
            hem hataya açıktı: kapanmayan bir etiket müşteriye bozuk bir mail
            göndermek demek.
          */}
          <MailGovdeEditoru
            deger={govde}
            onChange={setGovde}
            /*
             * TASLAK ANAHTARI: hangi müşteri/dönem için taslak çekildiğini
             * temsil ediyor. Kullanıcı başka bir dönem seçip taslağı
             * yenilediğinde editör yeniden dolmalı; her tuş vuruşunda değil.
             */
            taslakAnahtari={taslakAnahtari}
          />

          <label className="flex items-center gap-2 text-13 text-ink">
            <input
              type="checkbox"
              checked={ekPdf}
              onChange={(e) => setEkPdf(e.target.checked)}
              className="accent-[var(--text)]"
            />
            PDF raporu ekle
          </label>
        </>
      )}

      {hata && (
        <Serit ton="hata" baslik="Gönderilemedi">
          {hata}
        </Serit>
      )}
    </YanPanel>
  );
}
