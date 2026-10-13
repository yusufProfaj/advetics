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
  const [hal, setHal] = useState<{ tur: 'bos' } | { tur: 'suruyor' } | { tur: 'hata'; mesaj: string }>({ tur: 'bos' });
  async function indir() {
    setHal({ tur: 'suruyor' });
    try {
      const res = await fetch(`${API_URL}${stratejiPdfYolu(planId, surum)}`, { credentials: 'include' });
      if (!res.ok) {
        let mesaj = `PDF üretilemedi (${res.status}).`;
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
      setHal({ tur: 'hata', mesaj: okumaHatasi(e) });
    }
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Dugme ton="ikincil" boyut="kucuk" onClick={() => void indir()} bekliyor={hal.tur === 'suruyor'}>
        PDF indir
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
      setListe({ tur: 'hata', mesaj: okumaHatasi(e) });
    }
  }, [planId]);
  useEffect(() => void listele(), [listele]);

  async function baglantiOlustur() {
    setSuruyor('baglanti');
    setHata(null);
    const r = await yaz<OnayBaglantisiOlusturuldu>(stratejiUcYolu('/strateji/v2/planlar/:id/onay-baglantisi', { id: planId }), 'POST', { surum, sureGun: sure }, tazeSurum, surum);
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
      setHata(okumaHatasi(e));
    } finally {
      setSuruyor(null);
    }
  }

  async function mailGonder() {
    const liste_ = alicilar
      .split(/[,;\s]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (liste_.length === 0) return setHata('En az bir alıcı yazın.');
    setSuruyor('mail');
    setHata(null);
    setMail(null);
    const r = await yaz<GonderimSonucu>(stratejiUcYolu('/strateji/v2/planlar/:id/gonder', { id: planId }), 'POST', { surum, alicilar: liste_ }, tazeSurum, surum);
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
      setHata('Kopyalanamadı; bağlantıyı elle seçip kopyalayın.');
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2.5">
        <b className="text-sm">Onay bağlantısı</b>
        <p className="m-0 text-xs text-ink-muted">Müşteri panele girmeden okuyup onaylayabilir ya da revizyon isteyebilir. Adı ve e-postası kayda alınır. Bağlantı yalnız sürüm {surum} için, bir kez karar verilebilir.</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-ink-muted">
            Geçerlilik
            <select className={`${GIRDI} w-auto`} value={sure} onChange={(e) => setSure(Number(e.target.value))}>
              {[3, 7, 14, ONAY_BAGLANTISI_EN_UZUN_GUN].map((g) => (
                <option key={g} value={g}>
                  {g} gün
                </option>
              ))}
            </select>
          </label>
          <Dugme boyut="kucuk" onClick={() => void baglantiOlustur()} bekliyor={suruyor === 'baglanti'}>
            Bağlantı oluştur
          </Dugme>
        </div>
        {yeni && (
          <div className="space-y-1.5 rounded-lg border border-line bg-surface-muted p-2.5">
            <input className={GIRDI} readOnly value={yeni.tam} onFocus={(e) => e.target.select()} aria-label="Onay bağlantısı" />
            <div className="flex flex-wrap items-center gap-2">
              <Dugme ton="ikincil" boyut="kucuk" onClick={() => void kopyala()}>
                {kopyalandi ? 'Kopyalandı' : 'Kopyala'}
              </Dugme>
              <span className="text-[11px] text-ink-muted">Son geçerlilik {zamanMetni(yeni.sonGecerlilik)}. Bu bağlantı bir daha gösterilmez; önceki açık bağlantı iptal edildi.</span>
            </div>
          </div>
        )}
        {liste.tur === 'hata' && (
          <p className="m-0 text-xs text-brand-strong" role="alert">
            Bağlantılar alınamadı: {liste.mesaj}
          </p>
        )}
        {liste.tur === 'veri' && liste.v.baglantilar.length > 0 && (
          <ul className="m-0 list-none space-y-1 p-0 text-xs">
            {liste.v.baglantilar.map((b) => {
              const hal = b.kullanildiZamani ? `Kullanıldı: ${b.karar?.tur === 'onayla' ? 'onay' : 'revizyon'} · ${b.karar?.ad ?? ''}` : b.iptalZamani ? 'İptal edildi' : new Date(b.sonGecerlilik) <= new Date() ? 'Süresi doldu' : `Açık · ${zamanMetni(b.sonGecerlilik)} tarihine kadar`;
              const acik = !b.kullanildiZamani && !b.iptalZamani && new Date(b.sonGecerlilik) > new Date();
              return (
                <li key={b.id} className="flex flex-wrap items-center gap-2 border-t border-line pt-1">
                  <span className="text-ink-muted">
                    Sürüm {b.surum} · {zamanMetni(b.olusturuldu)} · {hal}
                  </span>
                  {acik && (
                    <Dugme ton="sade" boyut="kucuk" onClick={() => void iptal(b.id)} bekliyor={suruyor === b.id}>
                      İptal et
                    </Dugme>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="space-y-2.5">
        <b className="text-sm">Mail ile gönder</b>
        {mailIzni ? (
          <>
            <p className="m-0 text-xs text-ink-muted">PDF eki ve onay bağlantısı gider. Alıcıları virgülle ayırın.</p>
            <textarea className={`${GIRDI} min-h-[56px]`} value={alicilar} onChange={(e) => setAlicilar(e.target.value)} placeholder="ornek@firma.com" aria-label="Alıcılar" />
            <Dugme boyut="kucuk" onClick={() => void mailGonder()} bekliyor={suruyor === 'mail'}>
              Mail gönder
            </Dugme>
            {mail && (
              <Bildirim baslik={`${mail.kabul.length} alıcıya gönderildi${mail.ret.length > 0 ? `, ${mail.ret.length} alıcı reddedildi` : ''}.`} hata={mail.ret.length > 0}>
                {mail.kabul.length > 0 && <span className="block">Gönderildi: {mail.kabul.join(', ')}</span>}
                {/* Ret SEBEBİYLE: adres listesi "neden" sorusunu cevapsız bırakır (rapor gönderiminin deseni). */}
                {mail.ret.map((x) => (
                  <span key={x.adres} className="block">
                    Reddedildi: {x.adres} · {x.sebep}
                  </span>
                ))}
                {mail.baglanti && <span className="block">Maile sürüm {mail.baglanti.surum} için onay bağlantısı eklendi; önceki açık bağlantı iptal edildi.</span>}
              </Bildirim>
            )}
          </>
        ) : (
          <p className="m-0 text-xs text-ink-muted">Mail göndermek rapor paylaşma yetkisi ister; bu hesapta yok. Bağlantıyı kopyalayıp iletebilirsin.</p>
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
