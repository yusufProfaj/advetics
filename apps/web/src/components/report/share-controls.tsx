'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { sablonAlanlari } from '@advetics/shared';
import { MailGonderModal, RaporGonder } from './rapor-gonder';
import { RaporPlanla } from './rapor-planla';

/**
 * ═══ PAYLAŞ — TEK GİRİŞ, İKİ YOL ═══
 *
 * Öncesinde müşteriye ulaştırmanın iki yolu ekranın İKİ AYRI yerindeydi:
 * üstte "Müşteriye gönder" düğmesi, altta bu panelde "Bağlantı oluştur".
 * Aynı iş için iki giriş noktası, her seferinde "hangisi neydi" sorusunu
 * sorduruyordu. İkisi tek bir "Paylaş" menüsünde toplandı.
 *
 * SÜRE MENÜNÜN İÇİNDE. Panelin sağında ayrı bir seçici olarak durduğunda,
 * bağlantı üretmeyecek kullanıcıya da sorulmuş oluyordu. Menüde, tam da
 * kararın verildiği yerde.
 *
 * Ham token yalnızca ÜRETİM ANINDA bir kez dönüyor (sunucuda hash'i
 * saklanıyor), bu yüzden ekranda gösterilip kopyalanması gerekiyor. Sayfa
 * yenilenince kaybolduğu açıkça yazıyor — kullanıcı "sonra bakarım" diye
 * kapatmasın.
 */
export function ShareControls({
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
  /**
   * Ekranda seçili şablon — ön ayar kodu ya da kayıtlı şablonun UUID'si.
   *
   * TEK DEĞER, ÜÇ TÜKETİCİ. Öncesinde buraya `templateId={null}` SABİT
   * geçiliyordu ve PDF ile mail ekrandaki seçimi hiç görmüyordu: kullanıcı
   * Google raporuna bakarken Genel raporu indiriyordu. Seçim artık tek yerden
   * geliyor ve aşağıdaki üç yol da onu taşıyor.
   */
  sablon: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expiresInDays, setExpiresInDays] = useState<string>('');
  const [menuAcik, setMenuAcik] = useState(false);
  /** Seçim kayıtlı bir şablonsa UUID'si; ön ayarsa `null`. */
  const kayitliSablonId = sablonAlanlari(sablon).templateId ?? null;
  const [mailAcik, setMailAcik] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  /*
   * DIŞARI TIKLAMA VE ESC İLE KAPANIYOR.
   *
   * Yalnızca düğmeyle açılıp kapanan bir menü, kullanıcı başka bir yere
   * tıkladığında ekranda asılı kalıyor ve altındaki içeriği örtüyor.
   */
  useEffect(() => {
    if (!menuAcik) return;
    const disari = (e: MouseEvent): void => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuAcik(false);
    };
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenuAcik(false);
    };
    document.addEventListener('mousedown', disari);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', disari);
      document.removeEventListener('keydown', esc);
    };
  }, [menuAcik]);

  async function createLink() {
    setMenuAcik(false);
    setBusy(true);
    setError(null);
    setLink(null);
    try {
      const res = await apiFetch<{ token: string }>('/reports/shares', {
        method: 'POST',
        body: JSON.stringify({
          /*
           * SEÇİLİ ŞABLON KAYITLIYSA BAĞLANTIYA DA GİRİYOR.
           *
           * Öncesinde HİÇ gönderilmiyordu ve gerekçesi "sunucu bulur ya da
           * oluşturur"du — doğru, ama ekranda bir şablon seçen kullanıcı için
           * yanlış: müşteri linki açtığında BAŞKA bir raporu görüyordu.
           *
           * ÖN AYARLAR BAĞLANTIYA KONULAMIYOR: `report_shares.template_id`
           * bir UUID ve ön ayarların UUID'si yok. Uydurmak yerine menüde
           * yazıyoruz — sessizce farklı bir rapor paylaşmaktansa kısıtı
           * söylemek.
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
       * ÜRETİP HEMEN KOPYALIYOR. Menüdeki seçenek "Bağlantıyı kopyala"
       * diyor; kullanıcıyı ikinci bir "Kopyala" düğmesine göndermek verdiği
       * sözü tutmamak olurdu. Kopyalama başarısız olursa (izin yok, güvensiz
       * bağlam) bağlantı ekranda duruyor ve elle kopyalanabiliyor.
       */
      try {
        await navigator.clipboard.writeText(adres);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Sessiz geçilmiyor: bağlantı kutusu zaten açılıyor ve orada
        // "Kopyala" düğmesi var.
      }
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : 'Link oluşturulamadı. Tekrar deneyin.',
      );
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
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Müşteriyle paylaş</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Oturum gerektirmeyen gizli bağlantı. Tarih aralığı sabitlenir — müşteri
            sonradan açtığında aynı sayıları görür.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/*
            İNDİR VE PAYLAŞ YAN YANA. Öncesinde "PDF indir" sayfanın üstünde
            ayrı duruyordu; kullanıcı raporla ilgili bir şey yapmak için iki
            ayrı yere bakıyordu. İkisi aynı yerde ama AYNI DÜĞME DEĞİL:
            indirmek belgeyi kendine almak, paylaşmak müşteriye ulaştırmak.
            Aynı menüye koymak iki farklı işi tek başlık altında toplardı.
          */}
          {/*
            PLANLA "PDF indir"İN SOLUNDA ve VERİYE BAĞLI DEĞİL.
            Diğer ikisi BU dönemin raporuyla ilgili ve dönem boşsa anlamsız;
            planlama ise GELECEK dönemleri kuruyor. `hasData` ile kapatmak,
            bu hafta harcaması olmayan bir müşteriye plan kurulamaması
            demek olurdu.
          */}
          {/*
            PLANLAMA YALNIZCA KAYITLI ŞABLONU ALABİLİYOR.
            `report_plans.template_id` bir UUID ve ön ayarların UUID'si YOK —
            kodda duruyorlar, veritabanında değil. Ön ayar seçiliyken plana
            `null` geçiyor ve sunucu müşterinin kendi şablonunu bulup yoksa
            varsayılanı üretiyor; uydurma bir UUID yazmak, planın her koşusunda
            var olmayan bir şablonu araması demekti.
          */}
          <RaporPlanla clientId={clientId} templateId={kayitliSablonId} />

          <RaporGonder
            clientId={clientId}
            from={from}
            to={to}
            hasData={hasData}
            sablon={sablon}
          />

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuAcik((a) => !a)}
            disabled={busy || !hasData}
            title={hasData ? undefined : 'Bu dönemde veri yok'}
            aria-haspopup="menu"
            aria-expanded={menuAcik}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Oluşturuluyor…' : 'Paylaş'}
          </button>

          {menuAcik && (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-1.5 w-64 rounded-xl border border-line bg-surface p-1.5 shadow-lg"
            >
              {/*
                SÜRE SEÇENEKLERİN ÜSTÜNDE. Kararın verildiği yer burası;
                panelin sağında ayrı dururken bağlantı üretmeyecek kullanıcıya
                da sorulmuş oluyordu.
              */}
              <label className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs text-ink-muted">
                Bağlantı süresi
                <select
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value)}
                  className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink"
                >
                  <option value="">Süresiz</option>
                  <option value="7">7 gün</option>
                  <option value="30">30 gün</option>
                  <option value="90">90 gün</option>
                </select>
              </label>

              {/*
                KISIT EKRANDA YAZIYOR — kararın verildiği yerde.
                Ön ayar seçiliyken üretilen bağlantı, müşterinin kendi
                şablonunu (yoksa varsayılanı) gösteriyor. Bunu söylememek,
                kullanıcının ekranda gördüğünden farklı bir raporu sessizce
                paylaşması demekti; PDF'te düzelttiğimiz hatanın aynısı.
              */}
              {sablon !== null && kayitliSablonId === null && (
                <p className="mx-1 mt-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-900">
                  Hazır şablonlar bağlantıya taşınmıyor — müşteri, kayıtlı
                  şablonu (yoksa varsayılanı) görecek. Bu görünümü paylaşmak
                  için önce şablon olarak kaydet.
                </p>
              )}

              <div className="my-1 h-px bg-line" />

              <button
                type="button"
                role="menuitem"
                onClick={createLink}
                className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-surface-muted"
              >
                <span aria-hidden="true" className="mt-0.5 text-sm">
                  🔗
                </span>
                <span>
                  <span className="block text-sm font-medium text-ink">Bağlantıyı kopyala</span>
                  <span className="block text-[11px] text-ink-muted">
                    Oturum gerektirmeyen gizli sayfa
                  </span>
                </span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuAcik(false);
                  setMailAcik(true);
                }}
                className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-surface-muted"
              >
                <span aria-hidden="true" className="mt-0.5 text-sm">
                  ✉️
                </span>
                <span>
                  <span className="block text-sm font-medium text-ink">Mail yoluyla ilet</span>
                  <span className="block text-[11px] text-ink-muted">
                    PDF eki + özet, kendi adresinden
                  </span>
                </span>
              </button>
            </div>
          )}
        </div>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p>
      )}

      {link && (
        <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3">
          <p className="text-xs font-semibold text-emerald-900">
            Bağlantı hazır — bu bağlantı bir daha gösterilmeyecek, şimdi kopyalayın.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-md border border-emerald-300 bg-white px-2 py-1.5 font-mono text-xs text-slate-800"
            />
            <button
              type="button"
              onClick={copy}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white"
            >
              {copied ? 'Kopyalandı' : 'Kopyala'}
            </button>
          </div>
        </div>
      )}

      <MailGonderModal
        clientId={clientId}
        from={from}
        to={to}
        acik={mailAcik}
        onKapat={() => setMailAcik(false)}
        sablon={sablon}
      />
    </section>
  );
}
