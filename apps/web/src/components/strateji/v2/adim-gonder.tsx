'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { stratejiPanelAdresi, stratejiUcYolu, type Permission } from '@advetics/shared';
import type { GonderimSonucu, StratejiDetayi } from '@advetics/shared';
import { Dugme, dugmeSinifi } from '@/components/ui/dugme';
import { Kart } from '@/components/ui/kart';
import { Soru } from '@/components/ui/sihirbaz';
import { Bildirim, GIRDI, StratejiIkonu, yaz } from './ortak';

type Is = { tur: 'bos' } | { tur: 'suruyor'; ne: 'gonder' | 'onayla' } | { tur: 'hata'; mesaj: string } | { tur: 'gonderildi'; sonuc: GonderimSonucu };

/**
 * ═══ 7 · GÖNDER — müşteriye gönder ya da müşteri adına onayla ═══
 *
 * Müşteri onaylamadan kampanya kurulmaz. İki yol, iki büyük kart:
 *
 * - "Müşteriye gönder": strateji onaya geçer, kurumsal PDF ve GİRİŞSİZ onay
 *   bağlantısı e-postayla gider (sunucunun `gonder` ucu; alıcı yazılmazsa
 *   workspace'in kayıtlı rapor alıcıları). Kabul ve ret AYRI yazılır.
 * - "Müşteri adına onayla": YALNIZ ajans yöneticisi (sunucu da reddeder).
 *   Geri alınamayan bir kayıt (kim, ne zaman onayladı) olduğu için ikinci
 *   bir tıklamayla doğrulanır.
 *
 * Onaya geçiş (`onaya_gonder`) mail düşse bile geri alınmaz: strateji onayda
 * kalır ve raporda onay bağlantısı elle oluşturulup iletilebilir; ekran bunu
 * söylüyor.
 */
export function AdimGonder({
  detay,
  guncelle,
  tazeSurum,
  izinler,
  ajansYoneticisi,
  clientId,
}: {
  detay: StratejiDetayi;
  guncelle: (d: StratejiDetayi) => void;
  tazeSurum: () => Promise<number | null>;
  izinler: readonly Permission[];
  ajansYoneticisi: boolean;
  clientId: string;
}) {
  const router = useRouter();
  const [is, setIs] = useState<Is>({ tur: 'bos' });
  const [alicilar, setAlicilar] = useState('');
  const [onayAcik, setOnayAcik] = useState(false);
  const mailIzni = izinler.includes('report.share');
  const id = { id: detay.plan.id };
  const raporAdresi = stratejiPanelAdresi({ musteri: clientId, plan: detay.plan.id, adim: 'rapor' });

  /** Taslak/revizyon → onayda. Zaten onaydaysa olduğu gibi. */
  async function onayaGecir(): Promise<StratejiDetayi | null> {
    if (detay.plan.durum === 'onayda') return detay;
    const r = await yaz<StratejiDetayi>(stratejiUcYolu('/strateji/v2/planlar/:id/eylem', id), 'POST', { eylem: 'onaya_gonder', surum: detay.plan.surum }, tazeSurum, detay.plan.surum);
    if (r.tur !== 'tamam') {
      setIs({ tur: 'hata', mesaj: r.mesaj });
      return null;
    }
    guncelle(r.veri);
    return r.veri;
  }

  async function gonder() {
    setIs({ tur: 'suruyor', ne: 'gonder' });
    const d = await onayaGecir();
    if (!d) return;
    const liste = alicilar
      .split(/[,;\s]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    const r = await yaz<GonderimSonucu>(stratejiUcYolu('/strateji/v2/planlar/:id/gonder', id), 'POST', { surum: d.plan.surum, alicilar: liste }, tazeSurum, d.plan.surum);
    if (r.tur !== 'tamam') return setIs({ tur: 'hata', mesaj: `Strateji onaya geçti ama mail gönderilemedi: ${r.mesaj} Raporu açıp onay bağlantısını elle oluşturabilirsin.` });
    setIs({ tur: 'gonderildi', sonuc: r.veri });
  }

  async function adinaOnayla() {
    setIs({ tur: 'suruyor', ne: 'onayla' });
    const d = await onayaGecir();
    if (!d) return;
    const r = await yaz<StratejiDetayi>(stratejiUcYolu('/strateji/v2/planlar/:id/onayla', id), 'POST', { surum: d.plan.surum }, tazeSurum, d.plan.surum);
    if (r.tur !== 'tamam') return setIs({ tur: 'hata', mesaj: `Strateji onaya geçti ama onaylanamadı: ${r.mesaj}` });
    guncelle(r.veri);
    router.push(stratejiPanelAdresi({ musteri: clientId, plan: detay.plan.id, adim: 'kur' }));
  }

  if (is.tur === 'gonderildi') {
    const s = is.sonuc;
    return (
      <>
        <Soru ust="7 / 7 · Gönder" soru={s.kabul.length > 0 ? 'Strateji müşteriye gitti' : 'Mail kimseye ulaşmadı'} aciklama="Müşteri onaylayınca Raporu incele ekranından kampanyaları tek tek kurarsın." />
        <div className="max-w-[720px] space-y-3">
          <Bildirim baslik={`${s.kabul.length} alıcıya gönderildi${s.ret.length > 0 ? `, ${s.ret.length} alıcı reddedildi` : ''}.`} hata={s.ret.length > 0 || s.kabul.length === 0}>
            {s.kabul.length > 0 && <span className="block">Gönderildi: {s.kabul.join(', ')}</span>}
            {s.ret.map((x) => (
              <span key={x.adres} className="block">
                Reddedildi: {x.adres} · {x.sebep}
              </span>
            ))}
            {s.baglanti && <span className="block">Maile sürüm {s.baglanti.surum} için girişsiz onay bağlantısı eklendi.</span>}
          </Bildirim>
          <Link href={raporAdresi} className={dugmeSinifi('ikincil')}>
            Raporu aç
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <Soru ust="7 / 7 · Gönder" soru="Plan hazır. Şimdi ne yapalım?" aciklama='Müşteri onaylamadan kampanya kurulmaz. Onay gelince "Raporu incele"den kampanyaları tek tek kurarsın.' />
      {/*
        İki yol İKİ KART, seçim kartı DEĞİL: kartın içinde alan ve düğme var
        (iç içe düğme olmaz). Kırmızı dolu düğme alt çubukta ("Raporu
        önizle"); kart eylemleri koyu.
      */}
      <div className="grid gap-[18px] md:grid-cols-2">
        <Kart
          baslik="Müşteriye gönder"
          className={mailIzni ? '' : 'opacity-60'}
          altEylem={
            <Dugme ton="koyu" boyut="kucuk" onClick={() => void gonder()} disabled={!mailIzni || is.tur === 'suruyor'} bekliyor={is.tur === 'suruyor' && is.ne === 'gonder'}>
              Gönder
            </Dugme>
          }
        >
          <YolIkonu ikon="rapor" kirmizi />
          <p className="m-0 mt-3 text-14 leading-relaxed text-ink-muted">Kurumsal rapor ve onay bağlantısı e-postayla gider. Müşteri giriş yapmadan onaylar ya da değişiklik ister.</p>
          <div className="mt-4 border-t border-line pt-3 text-13 text-ink-muted">
            {mailIzni ? (
              <input
                className={GIRDI}
                value={alicilar}
                onChange={(e) => setAlicilar(e.target.value)}
                placeholder="Boş bırakırsan kayıtlı rapor alıcıları"
                aria-label="Alıcılar (virgülle)"
              />
            ) : (
              'Mail göndermek rapor paylaşma yetkisi ister.'
            )}
          </div>
        </Kart>
        <Kart
          baslik="Müşteri adına onayla"
          className={ajansYoneticisi ? '' : 'opacity-60'}
          altEylem={
            onayAcik ? (
              <span className="flex gap-2">
                <Dugme ton="hayalet" boyut="kucuk" onClick={() => setOnayAcik(false)}>
                  Vazgeç
                </Dugme>
                <Dugme ton="koyu" boyut="kucuk" onClick={() => void adinaOnayla()} bekliyor={is.tur === 'suruyor' && is.ne === 'onayla'}>
                  Onayladım, kuruluma geç
                </Dugme>
              </span>
            ) : (
              <Dugme ton="ikincil" boyut="kucuk" onClick={() => setOnayAcik(true)} disabled={!ajansYoneticisi || is.tur === 'suruyor'}>
                Onayla
              </Dugme>
            )
          }
        >
          <YolIkonu ikon="yeni" />
          <p className="m-0 mt-3 text-14 leading-relaxed text-ink-muted">Müşteri onayını yazılı aldıysan kendin onayla. Kim, ne zaman onayladı kayda geçer.</p>
          <p className="m-0 mt-4 border-t border-line pt-3 text-13 text-ink-muted">
            {ajansYoneticisi ? (onayAcik ? 'Müşterinin onayını aldığını doğrula.' : 'Yalnız ajans yöneticisi') : 'Yalnız ajans yöneticisi; bu hesap değil.'}
          </p>
        </Kart>
      </div>
      {is.tur === 'hata' && (
        <div className="mt-4">
          <Bildirim hata baslik={is.mesaj} />
        </div>
      )}
      {detay.plan.durum === 'onayda' && (
        <div className="mt-4">
          <Bildirim baslik="Bu strateji zaten onayda.">Yeniden göndermek eski onay bağlantısını iptal eder ve yenisini yollar.</Bildirim>
        </div>
      )}
    </>
  );
}

/** Kartın ikon karosu (seçim kartıyla aynı: gri, birincil yolda kırmızı). */
function YolIkonu({ ikon, kirmizi = false }: { ikon: 'rapor' | 'yeni'; kirmizi?: boolean }) {
  return (
    <span aria-hidden className={`grid h-11 w-11 place-items-center rounded-[12px] text-[var(--beyaz)] ${kirmizi ? 'bg-brand' : 'bg-[var(--gri)]'}`}>
      <StratejiIkonu ad={ikon} />
    </span>
  );
}
