'use client';

import { useEffect, useRef, useState } from 'react';
import { raporSorgusu, sablonAlanlari, type ReportMailDraft } from '@advetics/shared';
import { AliciListesiAlani } from '@/components/alici-listesi-alani';
import { MailGovdeEditoru } from './mail-govde-editoru';
import { ApiRequestError, apiFetch, API_URL } from '@/lib/api';

/**
 * ═══ PDF İNDİR ═══
 *
 * Belgeyi kendin göndermek ya da arşivlemek için.
 *
 * MÜŞTERİYE ULAŞTIRMANIN İKİ YOLU BURADAN ÇIKTI. Öncesinde "Müşteriye
 * gönder" burada ayrı bir düğmeydi ve altta da ayrı bir paylaşım paneli
 * vardı: aynı iş için ekranda İKİ giriş noktası. İkisi tek bir "Paylaş"
 * menüsünde toplandı (`share-controls.tsx`); mail akışı buradaki
 * `MailGonderModal`da duruyor ve açılışını o menü belirliyor.
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
      className={`inline-block rounded-lg border border-line px-3.5 py-2 text-sm transition hover:bg-surface-muted ${
        hasData ? '' : 'pointer-events-none opacity-50'
      }`}
      title={hasData ? undefined : 'Bu dönemde veri yok'}
    >
      PDF indir
    </a>
  );
}

/**
 * ═══ MAİLLE GÖNDER — KONTROLLÜ MODAL ═══
 *
 * Kendi düğmesi YOK: açılışını "Paylaş" menüsü belirliyor.
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
      onKapat();
    } catch (err) {
      // Sunucunun KENDİ mesajı: "kimlik doğrulanamadı" ile "alıcı reddedildi"
      // farklı işler ve ikisini tek cümleye çevirmek kullanıcıyı tahmine
      // bırakır.
      setHata(err instanceof ApiRequestError ? err.message : 'Gönderilemedi.');
    } finally {
      setBekleyen(null);
    }
  }

  return (
    <>
      {/*
        SONUÇ MODAL KAPANDIKTAN SONRA DA DURUYOR. Gönderim başarılıysa modal
        kapanıyor; onaylama cümlesi kapanan bir kutuda kalsaydı kullanıcı
        gönderip göndermediğini bilemezdi.
      */}
      {sonuc && (
        <p className="rounded border border-ok/40 bg-ok/5 px-3 py-2 text-sm">{sonuc}</p>
      )}
      {reddedilen.length > 0 && (
        /*
         * REDDEDİLEN ALICILAR AYRI VE UYARI RENGİNDE. Yeşil "gönderildi"
         * kutusunun içine sıkıştırmak, kısmi bir arızayı başarı gibi
         * gösterirdi — ve bu projede en pahalı hata türü tam olarak o.
         */
        <p className="rounded border border-warn/40 bg-warn/5 px-3 py-2 text-sm text-ink">
          <strong>{reddedilen.length} adres reddedildi</strong> — bu kişilere ULAŞMADI:{' '}
          {reddedilen.map((r) => `${r.adres} (${r.sebep})`).join(' · ')}
        </p>
      )}
      {hata && !acik && (
        <p className="rounded border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
          {hata}
        </p>
      )}

      {acik && (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onKapat();
          }}
        >
          <div className="w-full max-w-2xl rounded-xl border border-line bg-surface p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Raporu müşteriye gönder</h2>

            {taslak && !taslak.senderReady && (
              /*
                DOĞRULANMAMIŞ HESAPLA GÖNDERİM KAPALI — ve sebebi burada
                yazıyor. Sunucu da reddediyor; ekranda söylemek, kullanıcıyı
                bir hata mesajıyla karşılaşmadan doğru yere yönlendiriyor.
              */
              <div className="mt-3 rounded border border-warn/40 bg-warn/5 px-3 py-2 text-sm">
                <p className="font-medium">E-posta ayarların doğrulanmamış.</p>
                <p className="mt-1 text-ink-muted">
                  Ayarlar → E-posta Ayarları ekranından kendine test maili gönder.
                  Doğrulanmamış bir hesapla müşteriye mail atmak, ilk hatanın
                  müşteriye gitmesi demek.
                </p>
              </div>
            )}

            {taslak && taslak.senderReady && (
              <p className="mt-1 text-xs text-ink-muted">
                Gönderen: <strong>{taslak.senderEmail}</strong> · yanıtlar sana gelir
              </p>
            )}

            <div className="mt-3 space-y-3">
              {/*
                * ALICI ARTIK LİSTE. Bileşen paylaşılıyor (plan ekranı ve
                * müşteri formu da onu kullanıyor): ayrıştırma kuralı üç yerde
                * ayrı yazılsaydı biri virgülü ayırıcı sayarken diğeri saymaz,
                * biri tekilleştirirken diğeri aynı adrese iki kez gönderirdi.
                */}
              <AliciListesiAlani
                etiket="Alıcılar"
                degerler={alici}
                onChange={setAlici}
                bosVarsayilan={taslak?.defaultTo ?? []}
              />

              <label className="block">
                <span className="text-xs text-ink-muted">Konu</span>
                <input
                  value={konu}
                  onChange={(e) => setKonu(e.target.value)}
                  className="mt-0.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </label>

              {/*
                HAM HTML YERİNE ÖNİZLEME. Kullanıcı burada "değerlendirme"
                paragrafını yazıyor ve bunu etiketlerin arasından yapmak hem
                yavaş hem hataya açıktı — kapanmayan bir etiket müşteriye bozuk
                bir mail göndermek demek.
              */}
              <MailGovdeEditoru
                deger={govde}
                onChange={setGovde}
                /*
                 * TASLAK ANAHTARI: hangi müşteri/dönem için taslak çekildiğini
                 * temsil ediyor. Kullanıcı başka bir dönem seçip taslağı
                 * yenilediğinde editör yeniden dolmalı; her tuş vuruşunda
                 * değil.
                 */
                taslakAnahtari={taslakAnahtari}
              />

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={ekPdf}
                  onChange={(e) => setEkPdf(e.target.checked)}
                />
                PDF raporu ekle
              </label>
            </div>

            {hata && (
              <p className="mt-3 rounded border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
                {hata}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={onKapat}
                className="rounded-lg px-3 py-2 text-sm text-ink-muted transition hover:text-ink"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={gonder}
                disabled={
                  bekleyen !== null ||
                  !taslak?.senderReady ||
                  /*
                   * BOŞ LİSTE DÜĞMEYİ KAPATMIYOR ARTIK — müşterinin kayıtlı
                   * alıcıları varsa gönderim geçerli. Kapalı tutmak,
                   * çoğunlukla hiçbir adres yazmayacak kullanıcıyı her
                   * seferinde adres yazmaya zorlardı.
                   */
                  (alici.length === 0 && (taslak?.defaultTo.length ?? 0) === 0) ||
                  konu.trim().length === 0
                }
                className="rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {bekleyen === 'gonder' ? 'Gönderiliyor…' : 'Gönder'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
