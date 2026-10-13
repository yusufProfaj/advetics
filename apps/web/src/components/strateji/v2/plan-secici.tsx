'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  STRATEJI_EN_UZUN_AY,
  stratejiOlusturSchema,
  stratejiPanelAdresi,
  stratejiUcYolu,
  type PlanDurumu,
  type StratejiDurumu,
  type StratejiGorunumu,
} from '@advetics/shared';
import { apiFetch } from '@/lib/api';
import { Dugme } from '@/components/ui/dugme';
import { DURUM_ETIKETI, donemEtiketi, yazmaHatasiSinifla } from '../hesap';
import { STRATEJI_DURUM_ETIKETI, donemMetni } from './hesap';
import { Bildirim, GIRDI, Kart } from './ortak';
import type { StratejiDetayi, StratejiListeSatiri, StratejiListesi } from '@advetics/shared';

/** Liste satırının adı: v2 dönemi, v1 ayı + "eski medya planı" (salt okunur). */
export function planSatiriAdi(p: StratejiListeSatiri): string {
  if (p.bicim === 1) return `${p.donem ? donemEtiketi(p.donem) : 'Tarihsiz'} · eski medya planı · ${DURUM_ETIKETI[p.durum as PlanDurumu]?.metin ?? p.durum}`;
  const d = p.baslangic && p.bitis ? donemMetni(p.baslangic, p.bitis) : 'Tarihsiz';
  return `${d} · ${STRATEJI_DURUM_ETIKETI[p.durum as StratejiDurumu] ?? p.durum}`;
}

/**
 * Strateji seçici. Liste TOPLAMI yazılı: sunucu keserse "N / toplam" (sessiz
 * kesme yok). Seçim adreste (`stratejiPanelAdresi`), görünüm korunuyor.
 */
export function PlanSecici({ clientId, liste, seciliId, gorunum }: { clientId: string; liste: StratejiListesi; seciliId: string | null; gorunum: StratejiGorunumu }) {
  const router = useRouter();
  if (liste.planlar.length === 0) return null;
  return (
    <label className="flex flex-col gap-0.5 text-xs text-ink-muted">
      <span>
        Strateji{liste.planlar.length < liste.toplam ? ` (${liste.planlar.length} / ${liste.toplam} gösteriliyor)` : ` (${liste.toplam})`}
      </span>
      <select className={`${GIRDI} max-w-[22rem]`} value={seciliId ?? ''} onChange={(e) => router.push(stratejiPanelAdresi({ musteri: clientId, plan: e.target.value, gorunum }))}>
        {liste.planlar.map((p) => (
          <option key={p.id} value={p.id}>
            {planSatiriAdi(p)}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Yeni strateji: başlangıç ayı + süre (1-3 ay) + toplam bütçe
 * (`stratejiOlusturSchema`). Para birimi SORULMAZ: sunucu hesaplardan çözer
 * ve karışıksa nedenini söyleyerek reddeder (v1 gerekçesi).
 */
export function YeniStrateji({ clientId, varsayilanAy, baslangictaAcik }: { clientId: string; varsayilanAy: string; baslangictaAcik: boolean }) {
  const router = useRouter();
  const [acik, setAcik] = useState(baslangictaAcik);
  const [ay, setAy] = useState(varsayilanAy);
  const [sure, setSure] = useState(3);
  const [toplam, setToplam] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [suruyor, setSuruyor] = useState(false);

  if (!acik) {
    return (
      <Dugme boyut="kucuk" onClick={() => setAcik(true)}>
        Yeni strateji
      </Dugme>
    );
  }

  async function olustur(e: FormEvent) {
    e.preventDefault();
    const g = stratejiOlusturSchema.safeParse({ clientId, baslangicAyi: ay, sureAy: sure, toplamButce: toplam });
    if (!g.success) return setHata(g.error.issues[0]?.message ?? 'Bilgiler eksik.');
    setHata(null);
    setSuruyor(true);
    try {
      // Yanıt sözleşmede `StratejiDetayi` (controller aynı tipe bağlı); kimlik yine de yoksa SÖYLENİR.
      const r = await apiFetch<StratejiDetayi | undefined>(stratejiUcYolu('/strateji/v2/planlar'), { method: 'POST', body: JSON.stringify(g.data) });
      const id = r?.plan?.id;
      if (!id) {
        setHata('Strateji oluşturuldu ama sunucu kimliğini döndürmedi. Sayfayı yenileyin.');
        router.refresh();
        return;
      }
      router.push(stratejiPanelAdresi({ musteri: clientId, plan: id, gorunum: 'duzenle' }));
      router.refresh();
      setAcik(false);
    } catch (err) {
      // 409 burada "açık strateji var" ve sunucunun cümlesiyle.
      setHata(yazmaHatasiSinifla(err, null, null).mesaj);
    } finally {
      setSuruyor(false);
    }
  }

  return (
    <Kart className="w-full p-4 sm:w-auto">
      <form onSubmit={olustur} noValidate className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
          Başlangıç
          <input type="month" className={GIRDI} value={ay} onChange={(e) => setAy(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
          Süre
          <select className={GIRDI} value={sure} onChange={(e) => setSure(Number(e.target.value))}>
            {Array.from({ length: STRATEJI_EN_UZUN_AY }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} ay
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
          Toplam bütçe
          <input className={`${GIRDI} tutar`} inputMode="decimal" placeholder="Örn. 180.000" value={toplam} onChange={(e) => setToplam(e.target.value)} required />
        </label>
        <Dugme type="submit" bekliyor={suruyor}>
          Strateji oluştur
        </Dugme>
        {!baslangictaAcik && (
          <Dugme ton="sade" onClick={() => setAcik(false)}>
            Vazgeç
          </Dugme>
        )}
      </form>
      <p className="m-0 mt-2 text-xs text-ink-muted">Para birimi workspace'in reklam hesaplarından alınır. Strateji en çok {STRATEJI_EN_UZUN_AY} ay.</p>
      {hata && (
        <div className="mt-2">
          <Bildirim hata baslik={hata} />
        </div>
      )}
    </Kart>
  );
}
