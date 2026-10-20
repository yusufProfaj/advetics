'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import {
  REHBER_AMACLARI,
  googleKitlesiKopyasi,
  kitleHesapUyumsuzlari,
  kitleKonumlari,
  kitleYasAraligi,
  metaKitlesiKopyasi,
  type KitlePlatformu,
  type KitleSablonuListesi,
  type KitleSablonuRecord,
  type RehberGoogleKitlesi,
  type RehberMetaKitlesi,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import { REKLAM_YONETICISI } from '@/lib/reklam-yoneticisi';
import { useSozluk } from '@/dil/saglayici';
import { reklamKimeSozlugu } from '@/dil/sozlukler/reklam-kime';
import { Uyari, type AdimBaglami } from './adim-ortak';
import { silme, yasKilitliMi, type Degisiklik } from './rehber-mantik';
import s from './rehber.module.css';

/**
 * Kitle listesinin DÖRT hâli ayrı (`.catch(() => setX([]))` yasağı):
 * yükleniyor, düştü (sunucunun mesajıyla), boş ve dolu. Hepsi boş bir
 * seçici olarak görünseydi kullanıcı "kitlem yok" ile "liste gelmedi"yi
 * ayırt edemezdi.
 */
const KITLE_ALANLARI = new Set<string>(['metaKitlesi', 'googleKitlesi', 'googleKonumlari', 'googleYasAraligi']);

type ListeHali = { tur: 'yukleniyor' } | { tur: 'hata'; mesaj: string } | { tur: 'tamam'; kitleler: KitleSablonuRecord[]; varsayilanId: string | null };

function useKitleler(clientId: string, platform: KitlePlatformu, acik: boolean): ListeHali {
  const d = useSozluk(reklamKimeSozlugu);
  const [hal, setHal] = useState<ListeHali>({ tur: 'yukleniyor' });
  useEffect(() => {
    if (!acik) return;
    let iptal = false;
    setHal({ tur: 'yukleniyor' });
    apiFetch<KitleSablonuListesi>(`/audience-templates?clientId=${encodeURIComponent(clientId)}&platform=${platform}`)
      // Sunucu süzüyor; burada da süzülüyor ki eski bir API sürümü diğer
      // platformun kitlesini döndürürse yanlış seçiciye düşmesin.
      .then((r) => !iptal && setHal({ tur: 'tamam', kitleler: r.items.filter((k) => k.platform === platform), varsayilanId: r.varsayilanId }))
      .catch((e: unknown) => !iptal && setHal({ tur: 'hata', mesaj: e instanceof ApiRequestError ? e.message : d.kitleDustu }));
    return () => {
      iptal = true;
    };
  }, [clientId, platform, acik]);
  return hal;
}

/**
 * KİME ADIMINDA KAYITLI KİTLE (hedef kitleler 2. parça, MIMARI Ç6-Ç9).
 * Açık her platform için ayrı seçici; seçim ANINDA kitlenin değerleri
 * rehbere kopyalanır (`kitle-secimi.ts`) ve kutu "X'e gidecek"i KOPYADAN
 * yazar: kitle sonradan düzenlense de ekran rehberde duranı gösterir.
 */
export function KitleSecici({ b }: { b: AdimBaglami }) {
  const d = useSozluk(reklamKimeSozlugu);
  const meta = useKitleler(b.clientId, 'meta', b.acik.meta);
  const google = useKitleler(b.clientId, 'google', b.acik.google);
  // Ç8: başka hesabın özel kitlesi SEÇİLMEZ; engel neden ile burada kalır.
  const [hesapEngeli, setHesapEngeli] = useState<{ kitle: string; hesap: string } | null>(null);
  const kilitli = yasKilitliMi(b.a.ekKategoriler?.deger, b.h.ozelKategoriTabani);
  const secMeta = b.a.metaKitlesi?.deger ?? null;
  const secGoogle = b.a.googleKitlesi?.deger ?? null;

  /*
   * KONUM VE YAŞ PLATFORMA GÖRE (MIMARI Ç9, kullanıcı kararı "B"): Meta
   * kitlesi ortak alanlara (`konumlar`, `yasAraligi`; Meta onları okuyor),
   * Google kitlesi Google'ın kendi alanlarına (`googleKonumlari`,
   * `googleYasAraligi`) yazar. Böylece iki kitle birbirinin konumunu ezmez.
   * Kitlenin konumu yoksa o alana DOKUNULMAZ (boş konum kampanyayı
   * kurulamaz bırakırdı; Google'da alan yoksa ortak konum gider). Kısıtlı
   * kategoride yaş yazılmaz: o reklamda yaş daraltılamıyor.
   */
  function konumYas(k: KitleSablonuRecord, konumAlani: 'konumlar' | 'googleKonumlari', yasAlani: 'yasAraligi' | 'googleYasAraligi'): Degisiklik[] {
    const out: Degisiklik[] = [];
    const konumlar = kitleKonumlari(k);
    if (konumlar.length) out.push({ alan: konumAlani, deger: konumlar, kaynak: 'kullanici' });
    else if (konumAlani === 'googleKonumlari' && b.a.googleKonumlari) out.push(silme('googleKonumlari'));
    if (!kilitli) out.push({ alan: yasAlani, deger: kitleYasAraligi(k), kaynak: 'kullanici' });
    return out;
  }

  function metaSec(id: string | null) {
    setHesapEngeli(null);
    if (!id) return b.degistir([{ alan: 'metaKitlesi', deger: null, kaynak: 'kullanici' }]);
    const k = meta.tur === 'tamam' ? meta.kitleler.find((x) => x.id === id) : undefined;
    const kopya = k ? metaKitlesiKopyasi(k) : null;
    if (!k || !kopya) return;
    const yabanci = kitleHesapUyumsuzlari(kopya.ozelKitleler, b.a.metaHesabiId?.deger ?? null);
    if (yabanci.length) return setHesapEngeli({ kitle: k.name, hesap: yabanci[0]!.hesapAdi });
    b.degistir([{ alan: 'metaKitlesi', deger: kopya, kaynak: 'kullanici' }, ...konumYas(k, 'konumlar', 'yasAraligi')]);
  }

  function googleSec(id: string | null) {
    // "Kitle seçme": Google'a özel konum ve yaş SİLİNİR, Google ortak değerlere döner.
    if (!id) {
      const d: Degisiklik[] = [{ alan: 'googleKitlesi', deger: null, kaynak: 'kullanici' }];
      if (b.a.googleKonumlari) d.push(silme('googleKonumlari'));
      if (b.a.googleYasAraligi) d.push(silme('googleYasAraligi'));
      return b.degistir(d);
    }
    const k = google.tur === 'tamam' ? google.kitleler.find((x) => x.id === id) : undefined;
    const kopya = k ? googleKitlesiKopyasi(k) : null;
    if (!k || !kopya) return;
    b.degistir([{ alan: 'googleKitlesi', deger: kopya, kaynak: 'kullanici' }, ...konumYas(k, 'googleKonumlari', 'googleYasAraligi')]);
  }

  if (!b.acik.meta && !b.acik.google) return null;
  const kurgu = b.a.amac ? REHBER_AMACLARI[b.a.amac.deger].google.kurgu : null;
  // Kitle alanlarının eksik/uyarıları (KITLE-HESAP, KITLE-ARAMA, G-KNM-01, Google yaşı…): GİRİŞ ANINDA burada.
  const kitleEksikleri = b.kayit.eksikler.filter((e) => e.alan !== null && KITLE_ALANLARI.has(e.alan) && e.kod !== 'G-KONUM');
  // G-KONUM hariç: eşleme durumu konum bloğunda kendi satırında (yeniden dene düğmesiyle) yazıyor.

  return (
    <div className={s.blok}>
      <div className={s.blokBaslik}>
        {d.kitleBaslik} <span className={s.ops}>{d.istege}</span>
      </div>
      {b.acik.meta && <Satir platform="Meta" hal={meta} secili={secMeta?.kitleId ?? null} degisti={metaSec} />}
      {b.acik.google && <Satir platform="Google" hal={google} secili={secGoogle?.kitleId ?? null} degisti={googleSec} />}
      <p className={s.ipucu}>
        {d.kitleSayim}{' '}
        <Link href={baglanti(REKLAM_YONETICISI, { seviye: 'kitle' })} className={s.metinDugme}>
          {d.kitleDuzenle}
        </Link>
      </p>
      {hesapEngeli && (
        <Uyari className={s.ustBosluk}>
          <b>{d.kitleHesapUyari}</b> {d.kitleHesapNeden(hesapEngeli.kitle, hesapEngeli.hesap)}
        </Uyari>
      )}
      {/* Hesap SONRADAN değiştiyse (seçimden sonra 2. adımda) aynı engel eksik listesinden. */}
      {kitleEksikleri.map((e) => (
        <Uyari key={`${e.alan}:${e.kod}`} className={s.ustBosluk}>
          {e.metin}
        </Uyari>
      ))}
      {b.acik.meta && secMeta && <MetaAktarim k={secMeta} kisitli={kilitli} />}
      {b.acik.google && secGoogle && <GoogleAktarim k={secGoogle} kurgu={kurgu} />}
      {(secMeta || secGoogle) && <p className={s.ipucu}>{d.kitleKonumYasNotu}</p>}
    </div>
  );
}

function Satir({ platform, hal, secili, degisti }: { platform: string; hal: ListeHali; secili: string | null; degisti: (id: string | null) => void }) {
  const d = useSozluk(reklamKimeSozlugu);
  const id = useId();
  // Seçili kitle listeden silinmiş olabilir: kopya rehberde duruyor, seçici onu yine gösterir.
  const kayitli = hal.tur === 'tamam' ? hal.kitleler : [];
  return (
    <div className={s.kitleSatir}>
      <label htmlFor={id} className={s.blokBaslik} style={{ margin: 0 }}>
        {platform}
      </label>
      <div>
        <div className={s.girdi}>
          <select id={id} value={secili ?? ''} disabled={hal.tur !== 'tamam'} onChange={(e) => degisti(e.target.value || null)}>
            <option value="">{hal.tur === 'yukleniyor' ? d.kitleYukleniyor : d.kitleSecme}</option>
            {kayitli.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
                {hal.tur === 'tamam' && hal.varsayilanId === k.id ? ` (${d.kitleVarsayilan})` : ''}
              </option>
            ))}
            {secili && !kayitli.some((k) => k.id === secili) && hal.tur === 'tamam' && <option value={secili}>{d.kitleSilinmis}</option>}
          </select>
        </div>
        {hal.tur === 'hata' && (
          <p className={s.hataMetni} role="alert">
            {d.kitleHata(hal.mesaj)}
          </p>
        )}
        {hal.tur === 'tamam' && hal.kitleler.length === 0 && <p className={s.ipucu}>{d.kitleYok(platform)}</p>}
      </div>
    </div>
  );
}

/** Adlar uzunsa ilk üçü + kaç tane daha (sessiz kesme yok). */
function adlar(xs: readonly string[]): string {
  return xs.length > 3 ? `${xs.slice(0, 3).join(', ')} +${xs.length - 3}` : xs.join(', ');
}

function MetaAktarim({ k, kisitli }: { k: RehberMetaKitlesi; kisitli: boolean }) {
  const d = useSozluk(reklamKimeSozlugu);
  const dahil = k.ozelKitleler.filter((o) => o.mod === 'dahil').map((o) => o.name);
  const haric = k.ozelKitleler.filter((o) => o.mod === 'haric').map((o) => o.name);
  return (
    <div className={s.aktarim}>
      <div className={s.aktarimUst}>
        <b>{d.kitleMetaGidecek}</b>
        <small>{d.kitleKaynak(k.ad)}</small>
      </div>
      <ul>
        {!kisitli && <li>{d.kitleCinsiyet(k.cinsiyet)}</li>}
        {!kisitli && k.ilgiler.length > 0 && <li>{d.kitleIlgi(k.ilgiler.length, adlar(k.ilgiler.map((i) => i.name)))}</li>}
        {!kisitli && dahil.length > 0 && <li>{d.kitleDahil(adlar(dahil))}</li>}
        {!kisitli && haric.length > 0 && <li>{d.kitleHaric(adlar(haric))}</li>}
      </ul>
      {kisitli ? <p>{d.kitleKisitli}</p> : (k.ilgiler.length > 0 || dahil.length > 0 || haric.length > 0) && <p>{d.kitleMetaOneri}</p>}
    </div>
  );
}

function GoogleAktarim({ k, kurgu }: { k: RehberGoogleKitlesi; kurgu: string | null }) {
  const d = useSozluk(reklamKimeSozlugu);
  const arama = kurgu === 'ARAMA';
  return (
    <div className={s.aktarim}>
      <div className={s.aktarimUst}>
        <b>{d.kitleGoogleGidecek}</b>
        <small>{d.kitleKaynak(k.ad)}</small>
      </div>
      {!arama && (
        <ul>
          <li>{d.kitleCinsiyet(k.cinsiyet)}</li>
          {k.ilgiler.length > 0 && <li>{d.kitleGoogleIlgi(k.ilgiler.length, adlar(k.ilgiler.map((i) => i.ad)))}</li>}
          {k.kelimeler.length > 0 && <li>{d.kitleKelime(k.kelimeler.length)}</li>}
        </ul>
      )}
      <p>{arama ? d.kitleGoogleArama : kurgu === 'MAKS_PERFORMANS' ? d.kitleGooglePmax : d.kitleGoogleTalep}</p>
    </div>
  );
}
