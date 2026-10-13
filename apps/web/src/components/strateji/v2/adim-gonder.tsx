'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { stratejiPanelAdresi, stratejiUcYolu, type Permission } from '@advetics/shared';
import type { GonderimSonucu, StratejiDetayi } from '@advetics/shared';
import { Dugme } from '@/components/ui/dugme';
import { BUYUK_KART_SINIFI, BuyukKart, NotKutusu, SoruBasligi } from './akis-cerceve';
import { Bildirim, GIRDI, yaz } from './ortak';

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
        <SoruBasligi ust="7 / 7 · Gönder" soru={s.kabul.length > 0 ? 'Strateji müşteriye gitti' : 'Mail kimseye ulaşmadı'} aciklama="Müşteri onaylayınca Raporu incele ekranından kampanyaları tek tek kurarsın." />
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
          <Link href={raporAdresi} className="inline-flex h-9 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-white no-underline hover:brightness-95">
            Raporu aç
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <SoruBasligi ust="7 / 7 · Gönder" soru="Plan hazır. Şimdi ne yapalım?" aciklama='Müşteri onaylamadan kampanya kurulmaz. Onay gelince "Raporu incele"den kampanyaları tek tek kurarsın.' />
      <div className="grid gap-[18px] md:grid-cols-2">
        <div className={`${BUYUK_KART_SINIFI} ${mailIzni ? '' : 'opacity-60'}`}>
          <BuyukKart
            ikon="rapor"
            kirmizi
            baslik="Müşteriye gönder"
            aciklama="Kurumsal rapor ve onay bağlantısı e-postayla gider. Müşteri giriş yapmadan onaylar ya da değişiklik ister."
            altSol={
              mailIzni ? (
                <input
                  className={GIRDI}
                  value={alicilar}
                  onChange={(e) => setAlicilar(e.target.value)}
                  placeholder="Boş bırakırsan kayıtlı rapor alıcıları"
                  aria-label="Alıcılar (virgülle)"
                />
              ) : (
                'Mail göndermek rapor paylaşma yetkisi ister.'
              )
            }
            altSag={
              <Dugme onClick={() => void gonder()} disabled={!mailIzni || is.tur === 'suruyor'} bekliyor={is.tur === 'suruyor' && is.ne === 'gonder'}>
                Gönder
              </Dugme>
            }
          />
        </div>
        <div className={`${BUYUK_KART_SINIFI} ${ajansYoneticisi ? '' : 'opacity-60'}`}>
          <BuyukKart
            ikon="yeni"
            baslik="Müşteri adına onayla"
            aciklama="Müşteri onayını yazılı aldıysan kendin onayla. Kim, ne zaman onayladı kayda geçer."
            altSol={ajansYoneticisi ? (onayAcik ? 'Müşterinin onayını aldığını doğrula.' : 'Yalnız ajans yöneticisi') : 'Yalnız ajans yöneticisi; bu hesap değil.'}
            altSag={
              onayAcik ? (
                <span className="flex gap-2">
                  <Dugme ton="sade" boyut="kucuk" onClick={() => setOnayAcik(false)}>
                    Vazgeç
                  </Dugme>
                  <Dugme boyut="kucuk" onClick={() => void adinaOnayla()} bekliyor={is.tur === 'suruyor' && is.ne === 'onayla'}>
                    Onayladım, kuruluma geç
                  </Dugme>
                </span>
              ) : (
                <Dugme ton="ikincil" onClick={() => setOnayAcik(true)} disabled={!ajansYoneticisi || is.tur === 'suruyor'}>
                  Onayla
                </Dugme>
              )
            }
          />
        </div>
      </div>
      {is.tur === 'hata' && (
        <div className="mt-4">
          <Bildirim hata baslik={is.mesaj} />
        </div>
      )}
      {detay.plan.durum === 'onayda' && <NotKutusu>Bu strateji zaten onayda. Yeniden göndermek eski onay bağlantısını iptal eder ve yenisini yollar.</NotKutusu>}
    </>
  );
}
