'use client';

import { useEffect, useState } from 'react';
import { HIZLI_SORU_EN_COK, HIZLI_SORU_SINIRI, KARSILAMA_MESAJ_SINIRI, WHATSAPP_VARSAYILAN_MESAJ, type RehberPikselListesi, type WhatsappKarsilama } from '@advetics/shared';
import { apiFetch } from '@/lib/api';
import { sil, yaz, type AdimBaglami } from './adim-ortak';
import { IKON, Ikon } from './ikonlar';
import { pikselDurumu, pikselListesiHali, tekPikselOnerisi, whatsappOnerisi } from './meta-dalga3-mantik';
import { oneriHatasi, telefonGirdisi, telefonKaydi, type OneriHali } from './rehber-mantik';
import s from './rehber.module.css';

/**
 * Satış amacının Meta pikseli (Nerede adımı, Dalga 3). Liste SEÇİLİ reklam
 * hesabının; hesap değişince ya da "Listeyi yenile"ye basılınca Meta'dan
 * yeniden okunur. Dört hâl ayrı: hesap yok / okunuyor / boş (sunucunun
 * nedeni) / düştü (Meta'nın mesajı).
 */
export function PikselSecici({ b }: { b: AdimBaglami }) {
  const hesapId = b.a.metaHesabiId?.deger ?? null;
  const secili = b.a.pikselId?.deger ?? null;
  const [hal, setHal] = useState<OneriHali<RehberPikselListesi>>({ tur: 'istenmedi' });
  const [tur, setTur] = useState(0);

  useEffect(() => {
    if (!hesapId) return setHal({ tur: 'istenmedi' });
    let iptal = false;
    setHal({ tur: 'isteniyor' });
    apiFetch<RehberPikselListesi>(`/reklam/rehber/pikseller?clientId=${encodeURIComponent(b.clientId)}&adAccountId=${encodeURIComponent(hesapId)}`)
      .then((r) => {
        if (iptal) return;
        setHal(pikselListesiHali(r));
        const oneri = tekPikselOnerisi(secili, r);
        if (oneri) yaz(b, 'pikselId', oneri, 'derleyici');
      })
      .catch((e: unknown) => !iptal && setHal(oneriHatasi(e)));
    return () => {
      iptal = true;
    };
    // `secili` ve `b` bilerek yok: seçim değişince liste yeniden okunmamalı.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hesapId, b.clientId, tur]);

  const eksik = b.kayit.eksikler.find((e) => e.alan === 'pikselId' && e.seviye === 'engel') ?? null;
  const uyarilar = b.kayit.eksikler.filter((e) => e.alan === 'pikselId' && e.seviye === 'uyari');

  return (
    <div className={`${s.kart} ${s.blok}`}>
      <div className={s.blokBaslik}>
        Meta pikseli <span className={s.ops}>Satışları sayan kod</span>
      </div>
      {hal.tur === 'istenmedi' && <p className={s.ipucu} style={{ margin: 0 }}>Önce Meta reklam hesabını seç; pikseller o hesaptan listelenir.</p>}
      {hal.tur === 'isteniyor' && <p className={s.ipucu} style={{ margin: 0 }}>Pikseller Meta&apos;dan okunuyor…</p>}
      {hal.tur === 'dustu' && (
        <div className={s.uyari} role="alert">
          <Ikon d={IKON.ucgen} />
          <span>{hal.mesaj}</span>
        </div>
      )}
      {hal.tur === 'bos' && (
        <div className={s.uyari}>
          <Ikon d={IKON.ucgen} />
          <span>{hal.neden}</span>
        </div>
      )}
      {hal.tur === 'geldi' && (
        <>
          <div className={s.secim}>
            {hal.deger.satirlar.map((p) => (
              <button key={p.id} type="button" aria-pressed={secili === p.id} onClick={() => yaz(b, 'pikselId', p.id)}>
                {p.ad}
                <span className={s.ops}> {pikselDurumu(p)}</span>
              </button>
            ))}
          </div>
          {hal.deger.kesildi && <p className={s.ipucu}>İlk {hal.deger.toplam} piksel gösteriliyor.</p>}
          {secili && b.a.pikselId?.kaynak === 'derleyici' && <p className={s.ipucu}>Hesaptaki tek piksel önerildi.</p>}
        </>
      )}
      {(hal.tur === 'geldi' || hal.tur === 'bos' || hal.tur === 'dustu') && (
        <button type="button" className={`${s.metinDugme} ${s.ustBosluk}`} onClick={() => setTur((x) => x + 1)}>
          Listeyi yenile
        </button>
      )}
      {eksik && hal.tur !== 'isteniyor' && <p className={s.hataMetni}>{eksik.metin}</p>}
      {uyarilar.map((u) => (
        <p key={u.kod} className={s.ipucu}>
          {u.metin}
        </p>
      ))}
    </div>
  );
}

/**
 * WhatsApp hattı (Reklam adımı, Dalga 3). Sayfadan okunamıyor (alan boş,
 * WABA izni yok), o yüzden açıkça soruluyor. Marka Merkezi'ndeki telefon
 * önden doluyor ve KAYNAĞI yazıyor: WhatsApp hattı başka numara olabilir.
 */
export function WhatsappNumarasi({ b }: { b: AdimBaglami }) {
  const eksik = b.kayit.eksikler.find((e) => e.kod === 'WHATSAPP-NUMARA' || e.kod === 'WHATSAPP-ONAY') ?? null;
  const oneri = whatsappOnerisi(b.h.iletisim.telefon);
  const mevcut = b.a.whatsappNumarasi?.deger ?? null;
  // Önden gelmiş (onaysız) numara ya da Marka Merkezi önerisi: tek tıkla
  // kullanıcı kaynağıyla yazılır, böylece onay açık bir eylem oluyor.
  const onaylanacak = mevcut && b.a.whatsappNumarasi?.kaynak !== 'kullanici' ? mevcut : !mevcut ? oneri : null;
  return (
    <>
      <div className={s.girdi}>
        <span className={s.on}>+90</span>
        <input
          value={telefonGirdisi(b.a.whatsappNumarasi?.deger)}
          inputMode="tel"
          aria-label="WhatsApp numarası"
          onChange={(e) => {
            const t = telefonKaydi(e.target.value);
            if (t) yaz(b, 'whatsappNumarasi', t);
            else sil(b, 'whatsappNumarasi');
          }}
        />
      </div>
      <p className={eksik ? s.hataMetni : s.ipucu}>
        {eksik?.metin ??
          'Mesajlar bu numaraya gelir. Facebook sayfana bağlı olmalı; değilse Meta reklamı kabul etmez.'}
      </p>
      {onaylanacak && (
        <button type="button" className={s.metinDugme} onClick={() => yaz(b, 'whatsappNumarasi', onaylanacak)}>
          {mevcut ? 'Bu numara WhatsApp hattım, onayla' : `Marka Merkezi'ndeki numarayı kullan (${telefonGirdisi(onaylanacak)})`}
        </button>
      )}
    </>
  );
}

/**
 * WhatsApp ilk mesajı (Reklam adımı, SENTEZ D-M6). Gönderilmezse Meta
 * İngilizce bir hazır mesaj koyuyor; kutu Türkçe varsayılanla DOLU gelir ve
 * kullanıcı düzeltebilir. Hızlı sorular boş gelir: Marka Merkezi'nde
 * karşılığı yok ve uydurulmaz. Boş bırakılan mesaj varsayılana döner
 * (`karsilamaCoz`), yani kutuyu silmek İngilizceye düşürmez.
 */
export function WhatsappKarsilamaAlani({ b }: { b: AdimBaglami }) {
  const kayit = b.a.whatsappKarsilama?.deger ?? null;
  const mesaj = kayit?.mesaj ?? WHATSAPP_VARSAYILAN_MESAJ;
  const sorular = [...(kayit?.hizliSorular ?? [])];
  while (sorular.length < HIZLI_SORU_EN_COK) sorular.push('');
  // Boş mesaj da YAZILIR (silinmez): silmek kutuyu yazarken varsayılana
  // geri doldururdu. Gönderimde boş mesaj varsayılana döner (`karsilamaCoz`).
  const kaydet = (k: WhatsappKarsilama) => yaz(b, 'whatsappKarsilama', k);
  const soruYaz = (i: number, v: string) => kaydet({ mesaj, hizliSorular: sorular.map((x, j) => (j === i ? v : x)) });
  const soruVar = sorular.some((x) => x.trim());
  return (
    <div className={s.ustBosluk}>
      <div className={s.blokBaslik}>
        İlk mesaj <span className={s.ops}>WhatsApp&apos;ta kişinin karşısına çıkar</span>
      </div>
      <div className={s.girdi}>
        <input
          value={mesaj}
          maxLength={KARSILAMA_MESAJ_SINIRI}
          aria-label="WhatsApp ilk mesajı"
          onChange={(e) => kaydet({ mesaj: e.target.value, hizliSorular: sorular })}
        />
      </div>
      <p className={s.ipucu}>
        {kayit?.mesaj?.trim() ? 'Senin yazdığın mesaj.' : 'Varsayılan Türkçe mesaj. Boş bırakırsan bu gider.'}
        {soruVar ? ' Hızlı soru eklediğin için bu metin karşılama olarak görünür.' : ''}
      </p>
      <div className={s.alan}>
        <label>Hızlı sorular (isteğe bağlı, en çok {HIZLI_SORU_EN_COK})</label>
        {sorular.map((q, i) => (
          <div key={i} className={s.girdi}>
            <input
              value={q}
              maxLength={HIZLI_SORU_SINIRI}
              aria-label={`Hızlı soru ${i + 1}`}
              onChange={(e) => soruYaz(i, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
