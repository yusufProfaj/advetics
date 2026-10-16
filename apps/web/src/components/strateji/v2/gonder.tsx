'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ONAY_BAGLANTISI_EN_UZUN_GUN,
  ONAY_BAGLANTISI_VARSAYILAN_GUN,
  stratejiPdfYolu,
  stratejiUcYolu,
  type OnayBaglantisiOlusturuldu,
  type Permission,
} from '@advetics/shared';
import { API_URL, ApiRequestError, apiFetch } from '@/lib/api';
import { useDil, useSozluk } from '@/dil/saglayici';
import { stratejiAdimlarSozlugu } from '@/dil/sozlukler/strateji-v2-adimlar';
import { Dugme } from '@/components/ui/dugme';
import { okumaHatasi, zamanMetni } from '../hesap';
import { Bildirim, GIRDI, yaz } from './ortak';
import type { BaglantiListesi, GonderimSonucu } from '@advetics/shared';

/**
 * ═══ PDF İNDİR — adres TEK üreticiden, SÜRÜM ZORUNLU ═══
 *
 * `stratejiPdfYolu(planId, surum)`: ekrandaki sürüm değiştiyse sunucu 409
 * der ve bu ekranda sunucunun cümlesiyle yazılır; eski sürümün PDF'i
 * sessizce yeni belge diye inmez. `<a href>` değil `fetch`: düz bağlantı
 * hatayı tarayıcının boş sekmesinde gösterirdi.
 */
export function PdfIndir({ planId, surum, dosyaAdi }: { planId: string; surum: number; dosyaAdi: string }) {
  const gm = useSozluk(stratejiAdimlarSozlugu).pdf;
  const { dil } = useDil();
  const [hal, setHal] = useState<{ tur: 'bos' } | { tur: 'suruyor' } | { tur: 'hata'; mesaj: string }>({ tur: 'bos' });
  async function indir() {
    setHal({ tur: 'suruyor' });
    try {
      const res = await fetch(`${API_URL}${stratejiPdfYolu(planId, surum)}`, { credentials: 'include' });
      if (!res.ok) {
        let mesaj = gm.uretilemedi(res.status);
        try {
          const g = (await res.json()) as { message?: string };
          if (g.message) mesaj = g.message;
        } catch {
          /* gövde JSON değil: durum kodlu cümle kalır */
        }
        throw new ApiRequestError(mesaj, res.status, 'PDF');
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = dosyaAdi;
      a.click();
      URL.revokeObjectURL(url);
      setHal({ tur: 'bos' });
    } catch (e) {
      setHal({ tur: 'hata', mesaj: okumaHatasi(e, dil) });
    }
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Dugme ton="ikincil" boyut="kucuk" onClick={() => void indir()} bekliyor={hal.tur === 'suruyor'}>
        {gm.indir}
      </Dugme>
      {hal.tur === 'hata' && (
        <span className="max-w-xs text-xs text-brand-strong" role="alert">
          {hal.mesaj}
        </span>
      )}
    </span>
  );
}

/** "strateji-2026-11-s3.pdf": sürüm adda, iki indirme karışmasın. */
export function pdfDosyaAdi(baslangic: string, surum: number): string {
  return `strateji-${baslangic.slice(0, 7)}-s${surum}.pdf`;
}

/**
 * ═══ MÜŞTERİYE GÖNDER: onay bağlantısı + mail ═══
 *
 * Ham token YALNIZ oluşturma yanıtında (`OnayBaglantisiOlusturuldu.yol`) ve
 * bir daha okunamaz: ekran onu yalnız bu oturumda gösterir ve bunu söyler.
 * Yeni bağlantı eskisini iptal eder (plan başına tek açık bağlantı); liste
 * hangisinin kullanıldığını, süresinin dolduğunu ya da iptal edildiğini
 * ayrı yazar.
 *
 * Mail `{ kabul, ret }` döndürür (çoklu alıcıda kısmi ret SESSİZ bir hata
 * olurdu, CLAUDE.md "ÇOKLU ALICI"): iki liste de ekranda.
 */
export function GonderPaneli({ planId, surum, izinler, tazeSurum }: { planId: string; surum: number; izinler: readonly Permission[]; tazeSurum: () => Promise<number | null> }) {
  const gm = useSozluk(stratejiAdimlarSozlugu).panel;
  const { dil } = useDil();
  const [sure, setSure] = useState(ONAY_BAGLANTISI_VARSAYILAN_GUN);
  const [yeni, setYeni] = useState<{ tam: string; sonGecerlilik: string } | null>(null);
  const [kopyalandi, setKopyalandi] = useState(false);
  const [liste, setListe] = useState<{ tur: 'yukleniyor' } | { tur: 'veri'; v: BaglantiListesi } | { tur: 'hata'; mesaj: string }>({ tur: 'yukleniyor' });
  const [hata, setHata] = useState<string | null>(null);
  const [suruyor, setSuruyor] = useState<'baglanti' | 'mail' | string | null>(null);
  const [alicilar, setAlicilar] = useState('');
  const [mail, setMail] = useState<GonderimSonucu | null>(null);
  const mailIzni = izinler.includes('report.share');

  const listele = useCallback(async () => {
    try {
      setListe({ tur: 'veri', v: await apiFetch<BaglantiListesi>(stratejiUcYolu('/strateji/v2/planlar/:id/onay-baglantilari', { id: planId })) });
    } catch (e) {
      setListe({ tur: 'hata', mesaj: okumaHatasi(e, dil) });
    }
  }, [planId]);
  useEffect(() => void listele(), [listele]);

  async function baglantiOlustur() {
    setSuruyor('baglanti');
    setHata(null);
    const r = await yaz<OnayBaglantisiOlusturuldu>(stratejiUcYolu('/strateji/v2/planlar/:id/onay-baglantisi', { id: planId }), 'POST', { surum, sureGun: sure }, tazeSurum, surum, dil);
    setSuruyor(null);
    if (r.tur !== 'tamam') return setHata(r.mesaj);
    setYeni({ tam: `${window.location.origin}${r.veri.yol}`, sonGecerlilik: r.veri.baglanti.sonGecerlilik });
    setKopyalandi(false);
    void listele();
  }

  async function iptal(id: string) {
    setSuruyor(id);
    setHata(null);
    try {
      await apiFetch(stratejiUcYolu('/strateji/v2/onay-baglantilari/:baglantiId/iptal', { baglantiId: id }), { method: 'POST', body: '{}' });
      void listele();
    } catch (e) {
      setHata(okumaHatasi(e, dil));
    } finally {
      setSuruyor(null);
    }
  }

  async function mailGonder() {
    const liste_ = alicilar
      .split(/[,;\s]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (liste_.length === 0) return setHata(gm.enAzBirAlici);
    setSuruyor('mail');
    setHata(null);
    setMail(null);
    const r = await yaz<GonderimSonucu>(stratejiUcYolu('/strateji/v2/planlar/:id/gonder', { id: planId }), 'POST', { surum, alicilar: liste_ }, tazeSurum, surum, dil);
    setSuruyor(null);
    if (r.tur !== 'tamam') return setHata(r.mesaj);
    setMail(r.veri);
    // Mail YENİ bir onay bağlantısı ekliyor ve sunucu açık bağlantıyı aynı
    // transaction'da iptal ediyor: liste tazelenmezse ekran, az önce
    // kopyalanan ve artık ölü olan bağlantıyı "Açık" diye göstermeye devam
    // ederdi; müşteri o bağlantıyla geldiğinde "geçersiz" görür.
    if (r.veri.baglanti) {
      setYeni(null);
      void listele();
    }
  }

  async function kopyala() {
    if (!yeni) return;
    try {
      await navigator.clipboard.writeText(yeni.tam);
      setKopyalandi(true);
    } catch {
      setHata(gm.kopyalanamadi);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2.5">
        <b className="text-sm">{gm.onayBaglantisi}</b>
        <p className="m-0 text-xs text-ink-muted">{gm.baglantiAciklama(surum)}</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-ink-muted">
            {gm.gecerlilik}
            <select className={`${GIRDI} w-auto`} value={sure} onChange={(e) => setSure(Number(e.target.value))}>
              {[3, 7, 14, ONAY_BAGLANTISI_EN_UZUN_GUN].map((g) => (
                <option key={g} value={g}>
                  {gm.gun(g)}
                </option>
              ))}
            </select>
          </label>
          <Dugme ton="koyu" boyut="kucuk" onClick={() => void baglantiOlustur()} bekliyor={suruyor === 'baglanti'}>
            {gm.baglantiOlustur}
          </Dugme>
        </div>
        {yeni && (
          <div className="space-y-1.5 rounded-alan border border-line bg-surface-muted p-2.5">
            <input className={GIRDI} readOnly value={yeni.tam} onFocus={(e) => e.target.select()} aria-label={gm.onayBaglantisi} />
            <div className="flex flex-wrap items-center gap-2">
              <Dugme ton="ikincil" boyut="kucuk" onClick={() => void kopyala()}>
                {kopyalandi ? gm.kopyalandi : gm.kopyala}
              </Dugme>
              <span className="text-[11px] text-ink-muted">{gm.sonGecerlilik(zamanMetni(yeni.sonGecerlilik, dil))}</span>
            </div>
          </div>
        )}
        {liste.tur === 'hata' && (
          <p className="m-0 text-xs text-brand-strong" role="alert">
            {gm.baglantilarAlinamadi(liste.mesaj)}
          </p>
        )}
        {liste.tur === 'veri' && liste.v.baglantilar.length > 0 && (
          <ul className="m-0 list-none space-y-1 p-0 text-xs">
            {liste.v.baglantilar.map((b) => {
              const hal = b.kullanildiZamani ? gm.kullanildi(b.karar?.tur === 'onayla' ? gm.karaOnay : gm.karaRevizyon, b.karar?.ad ?? '') : b.iptalZamani ? gm.iptalEdildi : new Date(b.sonGecerlilik) <= new Date() ? gm.suresiDoldu : gm.acikTarihe(zamanMetni(b.sonGecerlilik, dil));
              const acik = !b.kullanildiZamani && !b.iptalZamani && new Date(b.sonGecerlilik) > new Date();
              return (
                <li key={b.id} className="flex flex-wrap items-center gap-2 border-t border-line pt-1">
                  <span className="text-ink-muted">
                    {gm.surumSatiri(b.surum, zamanMetni(b.olusturuldu, dil), hal)}
                  </span>
                  {acik && (
                    <Dugme ton="hayalet" boyut="kucuk" onClick={() => void iptal(b.id)} bekliyor={suruyor === b.id}>
                      {gm.iptalEt}
                    </Dugme>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="space-y-2.5">
        <b className="text-sm">{gm.mailIleGonder}</b>
        {mailIzni ? (
          <>
            <p className="m-0 text-xs text-ink-muted">{gm.mailAciklama}</p>
            <textarea className={`${GIRDI} min-h-[56px]`} value={alicilar} onChange={(e) => setAlicilar(e.target.value)} placeholder="ornek@firma.com" aria-label={gm.alicilar} />
            <Dugme ton="koyu" boyut="kucuk" onClick={() => void mailGonder()} bekliyor={suruyor === 'mail'}>
              {gm.mailGonder}
            </Dugme>
            {mail && (
              <Bildirim baslik={mail.ret.length > 0 ? gm.gonderildiRetli(mail.kabul.length, mail.ret.length) : gm.gonderildi(mail.kabul.length)} hata={mail.ret.length > 0}>
                {mail.kabul.length > 0 && <span className="block">{gm.gonderildiListe(mail.kabul.join(', '))}</span>}
                {/* Ret SEBEBİYLE: adres listesi "neden" sorusunu cevapsız bırakır (rapor gönderiminin deseni). */}
                {mail.ret.map((x) => (
                  <span key={x.adres} className="block">
                    {gm.reddedildi(x.adres, x.sebep)}
                  </span>
                ))}
                {mail.baglanti && <span className="block">{gm.baglantiEklendi(mail.baglanti.surum)}</span>}
              </Bildirim>
            )}
          </>
        ) : (
          <p className="m-0 text-xs text-ink-muted">{gm.mailYetkisi}</p>
        )}
      </div>
      {hata && (
        <div className="md:col-span-2">
          <Bildirim hata baslik={hata} />
        </div>
      )}
    </div>
  );
}
