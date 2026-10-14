'use client';

import { useState, type ReactNode } from 'react';
import {
  YORUM_ZORUNLU_EYLEMLER,
  baglantiKarariSchema,
  stratejiUcYolu,
  stratejiYapilabilir,
  type Permission,
  type StratejiDurumu,
} from '@advetics/shared';
import { API_URL, ApiRequestError } from '@/lib/api';
import { Dugme } from '@/components/ui/dugme';
import { zamanMetni } from '../hesap';
import { kalemSecenekleri, onayCumlesi, yorumKalemEtiketi } from './hesap';
import { Bildirim, GIRDI, yaz } from './ortak';
import type { StratejiKalemi, StratejiOnayKaydi, StratejiYorumu } from '@advetics/shared';

/**
 * ═══ ONAY KUTUSU — iki giriş, tek belge ═══
 *
 * Panelde müşteri hesabı (ya da "müşteri adına" ajans) oturumla karar verir;
 * girişsiz bağlantıda kişi ADINI ve E-POSTASINI yazar (kullanıcı kararı K-2).
 * İkisi ayrı bileşen: bağlantı kutusu oturum çerezi GÖNDERMEZ (`credentials:
 * 'omit'`) ve panelin yazma yolunu (`yaz`, sürüm çakışması) kullanmaz.
 *
 * REVİZYONDA YORUM ZORUNLU (`YORUM_ZORUNLU_EYLEMLER`): nedensiz revizyon
 * ajansı tahmine bırakır. Kontrol GİRİŞ ANINDA: düğme yorumsuz kapalı ve
 * nedeni altında yazılı; sunucunun reddini beklemek bir tur kaybettirirdi.
 */

function KutuKabi({ children, onay }: { children: ReactNode; onay: StratejiOnayKaydi | null }) {
  const cumle = onayCumlesi(onay);
  return (
    <div className="rounded-xl border-2 border-black p-5 text-black">
      <b className="font-baslik text-base">Bu stratejiyi onaylıyor musunuz?</b>
      <p className="m-0 mt-1 text-[13px] text-[var(--gri)]/70">Onaydan sonra ajans kampanyaları kurar; yayına almadan önce son hâli tekrar kontrol edilir.</p>
      {cumle && <p className="m-0 mt-3 text-[13px] font-semibold">{cumle}</p>}
      {children}
    </div>
  );
}

export function YorumListesi({ yorumlar }: { yorumlar: readonly StratejiYorumu[] }) {
  if (yorumlar.length === 0) return null;
  return (
    <div className="mt-4">
      {yorumlar.map((y) => (
        <div key={y.id} className="flex gap-2.5 border-t border-black/10 py-2.5 text-[13px]">
          <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-black/[0.07] text-[11px] font-bold" aria-hidden>
            {(y.ad ?? '?').slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <b>{y.ad ?? 'Bilinmiyor'}</b>{' '}
            <span className="text-[var(--gri)]/70">
              · {y.rol === 'ajans' ? 'ajans' : y.rol === 'baglanti' ? 'onay bağlantısı' : 'müşteri hesabı'} · sürüm {y.surum} · {zamanMetni(y.zaman)}
              {y.tur === 'revizyon' ? ' · revizyon istedi' : y.tur === 'onay' ? ' · onayladı' : ''}
            </span>
            {yorumKalemEtiketi(y.kalemSira) && <span className="block text-xs font-semibold">{yorumKalemEtiketi(y.kalemSira)}</span>}
            <p className="m-0 whitespace-pre-line break-words">{y.metin}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Panel içi karar (`strategy.approve`). Düğmeler `stratejiYapilabilir`den. */
export function PanelOnayKutusu({
  planId,
  surum,
  durum,
  izinler,
  onay,
  yorumlar,
  yenile,
  tazeSurum,
  kalemler,
}: {
  kalemler: ReadonlyArray<Pick<StratejiKalemi, 'id' | 'sira' | 'amac'>>;
  planId: string;
  surum: number;
  durum: StratejiDurumu;
  izinler: readonly Permission[];
  onay: StratejiOnayKaydi | null;
  yorumlar: { tur: 'veri'; v: StratejiYorumu[] } | { tur: 'hata'; mesaj: string };
  yenile: () => void;
  tazeSurum: () => Promise<number | null>;
}) {
  const [yorum, setYorum] = useState('');
  /** '' = bütün strateji. */
  const [kalemId, setKalemId] = useState('');
  const [suruyor, setSuruyor] = useState<'onayla' | 'revizyon_iste' | 'yorum' | null>(null);
  const [sonuc, setSonuc] = useState<{ hata: boolean; metin: string } | null>(null);
  const yapilabilir = stratejiYapilabilir(durum, izinler).filter((e) => e === 'onayla' || e === 'revizyon_iste');
  const yorumYazabilir = izinler.includes('strategy.approve') || izinler.includes('strategy.write');
  const revizyonYorumuEksik = YORUM_ZORUNLU_EYLEMLER.includes('revizyon_iste') && yorum.trim().length === 0;

  async function karar(eylem: 'onayla' | 'revizyon_iste') {
    setSuruyor(eylem);
    setSonuc(null);
    const r =
      eylem === 'onayla'
        ? await yaz(stratejiUcYolu('/strateji/v2/planlar/:id/onayla', { id: planId }), 'POST', { surum }, tazeSurum, surum)
        : await yaz(stratejiUcYolu('/strateji/v2/planlar/:id/revizyon', { id: planId }), 'POST', { surum, yorum: yorum.trim(), kalemId: kalemId || null }, tazeSurum, surum);
    setSuruyor(null);
    if (r.tur === 'tamam') {
      setSonuc({ hata: false, metin: eylem === 'onayla' ? `Onaylandı · sürüm ${surum}.` : 'Revizyon istendi; ajansa iletildi.' });
      setYorum('');
      setKalemId('');
      yenile();
    } else setSonuc({ hata: true, metin: r.mesaj });
  }

  async function yorumGonder() {
    setSuruyor('yorum');
    setSonuc(null);
    const r = await yaz(stratejiUcYolu('/strateji/v2/planlar/:id/yorumlar', { id: planId }), 'POST', { surum, metin: yorum.trim(), kalemId: kalemId || null }, tazeSurum, surum);
    setSuruyor(null);
    if (r.tur === 'tamam') {
      setYorum('');
      yenile();
    } else setSonuc({ hata: true, metin: r.mesaj });
  }

  return (
    <KutuKabi onay={onay}>
      {yapilabilir.length === 0 && durum !== 'onaylandi' && durum !== 'kapandi' && (
        <p className="m-0 mt-3 text-[13px] text-[var(--gri)]/70">
          {durum === 'onayda' ? 'Bu hesap karar veremiyor; onay yetkisi olan biri karar verir.' : 'Strateji şu an onay beklemiyor.'}
        </p>
      )}
      {(yapilabilir.length > 0 || yorumYazabilir) && kalemler.length > 0 && (
        <select className={`${GIRDI} mt-3 bg-white text-black`} aria-label="Yorum hangi kampanya hakkında" value={kalemId} onChange={(e) => setKalemId(e.target.value)}>
          <option value="">Bütün strateji</option>
          {kalemSecenekleri(kalemler).map((k) => (
            <option key={k.id} value={k.id}>
              {k.etiket}
            </option>
          ))}
        </select>
      )}
      {(yapilabilir.length > 0 || yorumYazabilir) && (
        <textarea
          className={`${GIRDI} mt-3 min-h-[72px] bg-white text-black`}
          placeholder={yapilabilir.includes('revizyon_iste') ? 'Yorumunuz (revizyon isterken zorunlu)' : 'Yorumunuz'}
          aria-label="Yorum"
          maxLength={2000}
          value={yorum}
          onChange={(e) => setYorum(e.target.value)}
        />
      )}
      <div className="mt-3.5 flex flex-wrap gap-2.5">
        {yapilabilir.includes('onayla') && (
          <Dugme onClick={() => void karar('onayla')} bekliyor={suruyor === 'onayla'} disabled={suruyor !== null}>
            Onayla
          </Dugme>
        )}
        {yapilabilir.includes('revizyon_iste') && (
          <Dugme ton="ikincil" onClick={() => void karar('revizyon_iste')} bekliyor={suruyor === 'revizyon_iste'} disabled={suruyor !== null || revizyonYorumuEksik}>
            Revizyon iste
          </Dugme>
        )}
        {yorumYazabilir && (
          <Dugme ton="hayalet" onClick={() => void yorumGonder()} bekliyor={suruyor === 'yorum'} disabled={suruyor !== null || yorum.trim().length === 0}>
            Yalnız yorum yaz
          </Dugme>
        )}
      </div>
      {yapilabilir.includes('revizyon_iste') && revizyonYorumuEksik && <p className="m-0 mt-1.5 text-xs text-[var(--gri)]/70">Revizyon için neyin değişmesi gerektiğini yazın.</p>}
      {sonuc && (
        <div className="mt-3">
          <Bildirim hata={sonuc.hata} baslik={sonuc.metin} />
        </div>
      )}
      {yorumlar.tur === 'hata' ? (
        <p className="m-0 mt-3 text-[13px] text-[var(--kirmizi)]" role="alert">
          Yorumlar alınamadı: {yorumlar.mesaj}
        </p>
      ) : (
        <YorumListesi yorumlar={yorumlar.v} />
      )}
    </KutuKabi>
  );
}

/**
 * Girişsiz bağlantıdan karar. TEK KULLANIMLIK: başarıdan sonra form
 * kalkıyor ve sonuç AÇIKÇA yazıyor; sunucunun reddi (bağlantı tükendi,
 * sürüm değişti) sunucunun cümlesiyle. Ekranın gördüğü sürüm gövdede
 * (`surum`): eski sekmeden gelen karar başka bir belgeyi onaylayamaz.
 */
export function BaglantiOnayKutusu({ token, surum, onay, kararAcik, yorumlar }: { token: string; surum: number; onay: StratejiOnayKaydi | null; kararAcik: boolean; yorumlar: readonly StratejiYorumu[] }) {
  const [ad, setAd] = useState('');
  const [eposta, setEposta] = useState('');
  const [yorum, setYorum] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [suruyor, setSuruyor] = useState<'onayla' | 'revizyon_iste' | null>(null);
  const [verildi, setVerildi] = useState<'onayla' | 'revizyon_iste' | null>(null);

  async function karar(k: 'onayla' | 'revizyon_iste') {
    const g = baglantiKarariSchema.safeParse({ karar: k, ad, eposta, yorum: yorum.trim() || undefined, surum });
    if (!g.success) {
      setHata(g.error.issues[0]?.message ?? 'Bilgiler eksik.');
      return;
    }
    setHata(null);
    setSuruyor(k);
    try {
      const res = await fetch(`${API_URL}${stratejiUcYolu('/strateji/v2/onay/:token/karar', { token })}`, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(g.data),
      });
      if (!res.ok) {
        // Gövde JSON değilse durum kodu yazılır; boş bir "hata" kutusu bırakılmaz.
        let mesaj = `Karar kaydedilemedi (${res.status}).`;
        try {
          const govde = (await res.json()) as { message?: string };
          if (govde.message) mesaj = govde.message;
        } catch {
          /* gövde JSON değil: durum kodlu cümle kalır */
        }
        throw new ApiRequestError(mesaj, res.status, 'KARAR');
      }
      setVerildi(k);
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.');
    } finally {
      setSuruyor(null);
    }
  }

  if (verildi) {
    return (
      <KutuKabi onay={onay}>
        <div className="mt-3">
          <Bildirim baslik={verildi === 'onayla' ? `Onayınız kaydedildi · sürüm ${surum}.` : 'Revizyon isteğiniz ajansınıza iletildi.'}>
            Bu bağlantı tek kullanımlıktı ve artık karar kabul etmiyor. Adınız ve e-postanız kayda alındı.
          </Bildirim>
        </div>
      </KutuKabi>
    );
  }

  return (
    <KutuKabi onay={onay}>
      {kararAcik ? (
        <>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--gri)]/70">
              Adınız soyadınız
              <input className={`${GIRDI} bg-white text-black`} autoComplete="name" value={ad} onChange={(e) => setAd(e.target.value)} maxLength={120} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--gri)]/70">
              E-posta
              <input className={`${GIRDI} bg-white text-black`} type="email" autoComplete="email" value={eposta} onChange={(e) => setEposta(e.target.value)} maxLength={254} />
            </label>
          </div>
          <p className="m-0 mt-1.5 text-[11px] text-black/45">Adınız ve e-postanız kararla birlikte kayda alınır. Bu bağlantıyla yalnız bu sürüm ({surum}) için bir kez karar verilebilir.</p>
          <textarea
            className={`${GIRDI} mt-2.5 min-h-[72px] bg-white text-black`}
            placeholder="Yorumunuz (revizyon isterken zorunlu)"
            aria-label="Yorum"
            maxLength={2000}
            value={yorum}
            onChange={(e) => setYorum(e.target.value)}
          />
          <div className="mt-3.5 flex flex-wrap gap-2.5">
            <Dugme onClick={() => void karar('onayla')} bekliyor={suruyor === 'onayla'} disabled={suruyor !== null}>
              Onayla
            </Dugme>
            <Dugme ton="ikincil" onClick={() => void karar('revizyon_iste')} bekliyor={suruyor === 'revizyon_iste'} disabled={suruyor !== null || yorum.trim().length === 0}>
              Revizyon iste
            </Dugme>
          </div>
          {yorum.trim().length === 0 && <p className="m-0 mt-1.5 text-xs text-[var(--gri)]/70">Revizyon için neyin değişmesi gerektiğini yazın.</p>}
          {hata && (
            <div className="mt-3">
              <Bildirim hata baslik={hata} />
            </div>
          )}
        </>
      ) : null}
      <YorumListesi yorumlar={yorumlar} />
    </KutuKabi>
  );
}
