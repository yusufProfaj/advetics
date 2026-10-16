'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AI_METIN_BOLUMLERI,
  sihirbazGirdiImzasi,
  stratejiUcYolu,
  type StratejiIncelemeSatiri,
  type StratejiSihirbazi,
} from '@advetics/shared';
import type { StratejiDetayi, StratejiOnerisi } from '@advetics/shared';
import { apiFetch } from '@/lib/api';
import { useDil, useSozluk } from '@/dil/saglayici';
import { stratejiAdimlarSozlugu } from '@/dil/sozlukler/strateji-v2-adimlar';
import { Dugme } from '@/components/ui/dugme';
import { okumaHatasi } from '../hesap';
import { INCELEME_SATIRLARI, incelemeAcilisi, incelemeEtiketi, incelemeYuzdesi, type IncelemeSatirHali } from './akis';
import { Kart } from '@/components/ui/kart';
import { Soru } from '@/components/ui/sihirbaz';
import { bolumKayitGovdesi, kalemGirdisi } from './hesap';
import { Bildirim, yaz } from './ortak';

type IncelemeMetni = (typeof stratejiAdimlarSozlugu)['tr']['inceleme'];

/**
 * ═══ 5 · İNCELEME — GERÇEK OKUMA, SAHTE BEKLEME YOK ═══
 *
 * Taslakta satırlar zamanlayıcıyla ilerliyordu; burada HER SATIR BİR
 * İSTEK: altı girdi `GET …/inceleme/:parca` ile TEK TEK okunur, son satır
 * (bütçe dağıtımı) motoru çalıştırır (`POST …/oner`) ve sonucu plana yazar.
 * Dönen halka yalnız o istek sürerken döner; alt metin isteğin cevabıdır.
 * Düşen satır platformun/sunucunun mesajıyla kalır ve inceleme durmaz:
 * okunamayan bir girdi "yok" sayılmaz, öneri onsuz kurulur ve bu söylenir.
 *
 * BİR KEZ KOŞAR. Plan'dan "Geri" ile dönen kullanıcının düzenlemeleri, girdiler
 * değişmediyse ezilmez (`incelenen` imzası); "Yeniden incele" bilerek ezer.
 */
export function AdimInceleme({
  detay,
  durum,
  guncelle,
  tazeSurum,
  bittiBildir,
}: {
  detay: StratejiDetayi;
  durum: StratejiSihirbazi;
  guncelle: (d: StratejiDetayi) => void;
  tazeSurum: () => Promise<number | null>;
  bittiBildir: (bitti: boolean) => void;
}) {
  const m = useSozluk(stratejiAdimlarSozlugu).inceleme;
  const { dil } = useDil();
  const imza = sihirbazGirdiImzasi(durum, detay.plan);
  // Kayıtlı kampanya varken KENDİLİĞİNDEN koşulmaz (`incelemeAcilisi`):
  // inceleme kalemlerin tamamını yeniden yazıyor ve Plan'daki düzenlemeleri
  // soru sormadan silerdi.
  const acilis = incelemeAcilisi({ kalemSayisi: detay.kalemler.length, kayitliImza: detay.sihirbaz?.incelenen ?? null, imza });
  const dahaOnce = acilis !== 'kos';
  // AÇILIŞTAKİ hâl sabitlenir: inceleme bitince imza da eşleşiyor ve canlı
  // `dahaOnce`a bakan bir dal, biten kontrol listesini gizleyip yerine
  // "daha önce yapıldı" kutusunu koyardı.
  const [ozetGoster, setOzetGoster] = useState(dahaOnce);
  const [acilisHali] = useState(acilis);
  const [haller, setHaller] = useState<IncelemeSatirHali[]>(() => INCELEME_SATIRLARI.map(() => ({ tur: 'sirada' })));
  const [genel, setGenel] = useState<{ tur: 'bekliyor' | 'suruyor' | 'bitti' } | { tur: 'hata'; mesaj: string }>({ tur: dahaOnce ? 'bitti' : 'bekliyor' });
  const basladi = useRef(false);

  const satir = (i: number, h: IncelemeSatirHali) => setHaller((x) => x.map((y, j) => (j === i ? h : y)));

  const kos = useCallback(async () => {
    setOzetGoster(false);
    setGenel({ tur: 'suruyor' });
    bittiBildir(false);
    setHaller(INCELEME_SATIRLARI.map(() => ({ tur: 'sirada' })));
    const id = { id: detay.plan.id };
    for (const [i, parca] of INCELEME_SATIRLARI.entries()) {
      if (parca === 'dagitim') break;
      satir(i, { tur: 'okunuyor' });
      try {
        const r = await apiFetch<StratejiIncelemeSatiri>(stratejiUcYolu('/strateji/v2/planlar/:id/inceleme/:parca', { ...id, parca }));
        satir(i, { tur: 'bitti', ozet: r.ozet, uyari: r.uyari });
      } catch (e) {
        satir(i, { tur: 'dustu', mesaj: okumaHatasi(e, dil) });
      }
    }
    // Bütçe dağıtımı: öneri → kampanyalar → metinler → sihirbaz. Her yazım
    // bir öncekinin sürümüyle (409 araya giren değişikliği söyler).
    const son = INCELEME_SATIRLARI.length - 1;
    satir(son, { tur: 'okunuyor' });
    const dus = (mesaj: string) => {
      satir(son, { tur: 'dustu', mesaj });
      setGenel({ tur: 'hata', mesaj });
    };
    let o: StratejiOnerisi;
    try {
      o = await apiFetch<StratejiOnerisi>(stratejiUcYolu('/strateji/v2/planlar/:id/oner', id), { method: 'POST', body: '{}' });
    } catch (e) {
      return dus(m.oneriHesaplanamadi(okumaHatasi(e, dil)));
    }
    if (o.kalemler.length === 0) return dus(m.kampanyaCikmadi(o.notlar.join(' ')));
    const para = detay.plan.paraBirimi;
    const k = await yaz<StratejiDetayi>(stratejiUcYolu('/strateji/v2/planlar/:id/kalemler', id), 'PUT', { surum: detay.plan.surum, kalemler: o.kalemler.map((x) => kalemGirdisi(x, para)) }, tazeSurum, detay.plan.surum, dil);
    if (k.tur !== 'tamam') return dus(m.kampanyalarKaydedilemedi(k.mesaj));
    let d = k.veri;
    const govde = bolumKayitGovdesi(d.bolumler, o.bolumler, AI_METIN_BOLUMLERI);
    if (Object.keys(govde).length > 0) {
      const b = await yaz<StratejiDetayi>(stratejiUcYolu('/strateji/v2/planlar/:id/bolumler', id), 'PUT', { surum: d.plan.surum, bolumler: govde }, tazeSurum, d.plan.surum, dil);
      if (b.tur !== 'tamam') return dus(m.metinlerKaydedilemedi(b.mesaj));
      d = b.veri;
    }
    const notlar = [...o.notlar, ...o.uretilemeyen.map((u) => m.metinYazilamadi(u.bolum, u.neden))].slice(0, 40);
    const s = await yaz<StratejiDetayi>(
      stratejiUcYolu('/strateji/v2/planlar/:id/sihirbaz', id),
      'PUT',
      { surum: d.plan.surum, sihirbaz: { ...durum, adim: 'inceleme', incelenen: sihirbazGirdiImzasi(durum, d.plan), notlar } },
      tazeSurum,
      d.plan.surum,
      dil,
    );
    if (s.tur !== 'tamam') return dus(m.incelemeKaydedilemedi(s.mesaj));
    guncelle(s.veri);
    const disarida = o.notlar.filter((n) => n.includes('plana alınmadı')).length;
    satir(son, { tur: 'bitti', ozet: disarida ? m.ozetDisarida(o.kalemler.length, disarida) : m.ozet(o.kalemler.length), uyari: disarida > 0 });
    setGenel({ tur: 'bitti' });
    bittiBildir(true);
  }, [detay, durum, guncelle, tazeSurum, bittiBildir, m, dil]);

  useEffect(() => {
    if (dahaOnce) {
      bittiBildir(true);
      return;
    }
    // Geliştirme kipinde effect iki kez koşar; inceleme iki kez yazmasın.
    if (basladi.current) return;
    basladi.current = true;
    void kos();
    // Yalnız açılışta: `kos` her render'da yeni; bağımlılık eklemek döngü olur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const yuzde = ozetGoster ? 100 : incelemeYuzdesi(haller);
  const uyariSayisi = haller.filter((h) => (h.tur === 'bitti' && h.uyari) || h.tur === 'dustu').length;

  return (
    <>
      <Soru ust={m.ust} soru={m.soru} aciklama={m.aciklama} />
      {ozetGoster ? (
        <div className="max-w-[720px] space-y-3">
          {acilisHali === 'sor' ? (
            <Bildirim baslik={m.girdilerDegisti}>{m.girdilerDegistiAciklama}</Bildirim>
          ) : (
            <Bildirim baslik={m.yapildi}>{m.yapildiAciklama}</Bildirim>
          )}
          <Dugme ton="ikincil" onClick={() => void kos()}>
            {m.yenidenIncele}
          </Dugme>
        </div>
      ) : (
        <div className="grid items-start gap-7 lg:grid-cols-2">
          <ol className="m-0 grid list-none gap-1 p-0" aria-live="polite">
            {INCELEME_SATIRLARI.map((p, i) => (
              <IncelemeSatiri key={p} etiket={incelemeEtiketi(p)} hal={haller[i]!} d={m} />
            ))}
          </ol>
          <Kart as="div" className="lg:sticky lg:top-24">
            <span className="text-xs font-bold uppercase tracking-[0.08em] text-brand-strong">{genel.tur === 'bitti' ? m.hazir : genel.tur === 'hata' ? m.durdu : m.hazirlaniyor}</span>
            <div className="font-baslik mt-1 text-[56px] font-extrabold leading-none tracking-tight text-ink">
              {yuzde}
              <small className="text-[22px] text-ink-muted">%</small>
            </div>
            <div className="mb-2.5 mt-4 h-2 overflow-hidden rounded-full bg-surface-sunken">
              <span className="block h-full bg-brand motion-safe:transition-[width] motion-safe:duration-300" style={{ width: `${yuzde}%` }} />
            </div>
            <p className="m-0 text-[13px] text-ink-muted">
              {genel.tur === 'bitti'
                ? uyariSayisi > 0
                  ? m.hazirUyari(uyariSayisi)
                  : m.hazirNokta
                : genel.tur === 'hata'
                  ? genel.mesaj
                  : m.gercekOkuma}
            </p>
            {genel.tur === 'hata' && (
              <div className="mt-3">
                <Dugme ton="ikincil" boyut="kucuk" onClick={() => void kos()}>
                  {m.yenidenDene}
                </Dugme>
              </div>
            )}
          </Kart>
        </div>
      )}
    </>
  );
}

/** Satır: sırada (soluk), okunuyor (dönen halka), bitti (tik ya da kırmızı ünlem), düştü (mesajıyla). */
function IncelemeSatiri({ etiket, hal, d }: { etiket: string; hal: IncelemeSatirHali; d: IncelemeMetni }) {
  const uyari = (hal.tur === 'bitti' && hal.uyari) || hal.tur === 'dustu';
  return (
    <li className={`grid grid-cols-[26px_1fr] gap-3 border-b border-line px-1 py-3 motion-safe:transition-opacity ${hal.tur === 'sirada' ? 'opacity-40' : 'opacity-100'}`}>
      <span
        aria-hidden
        className={`mt-px grid h-[22px] w-[22px] place-items-center rounded-full border-2 ${
          hal.tur === 'okunuyor'
            ? 'border-ink/10 border-t-brand motion-safe:animate-spin'
            : hal.tur === 'sirada'
              ? 'border-ink/25'
              : uyari
                ? 'border-brand bg-brand text-[var(--beyaz)]'
                : 'border-ink bg-ink text-surface'
        }`}
      >
        {hal.tur === 'bitti' && !uyari && (
          <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 6.3l2.3 2.3 4.7-5" />
          </svg>
        )}
        {uyari && <span className="text-[11px] font-bold">!</span>}
      </span>
      <span className="min-w-0">
        <b className="block font-semibold text-ink">{etiket}</b>
        <small className={`block text-[13px] ${hal.tur === 'dustu' ? 'text-brand-strong' : 'text-ink-muted'}`}>
          {hal.tur === 'sirada' ? d.sirada : hal.tur === 'okunuyor' ? d.okunuyor : hal.tur === 'bitti' ? hal.ozet : d.okunamadi(hal.mesaj)}
        </small>
      </span>
      <span className="sr-only">{hal.tur === 'okunuyor' ? d.srOkunuyor : hal.tur === 'bitti' ? (uyari ? d.srUyariBitti : d.srBitti) : hal.tur === 'dustu' ? d.srOkunamadi : d.srSirada}</span>
    </li>
  );
}
