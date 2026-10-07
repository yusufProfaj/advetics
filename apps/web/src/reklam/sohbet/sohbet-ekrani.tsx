'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ADV_SOHBET_SINIRLARI,
  HAL_METNI,
  aracIziMetni,
  sohbetHali,
  type AracAdi,
  type AracSonucu,
  type AtifDurumu,
  type OnayKarti,
  type ReklamHazirligi,
  type ReklamTaslakKaydi,
  type SohbetOlayi,
} from '@advetics/shared';
import { API_URL, ApiRequestError, apiFetch, onizlemeAdresi } from '@/lib/api';
import { Onizleme } from '../studyo/onizleme';
import { Dugme, Kutu, dugmeSinifi } from '../ui';
import { medyaYukle, type YuklenenMedya } from '../medya';
import { aracIzleri, bekleyenSoru, hazirKonacakMi, olayUygula, olaylariAyikla, sureMetni, yanitGuncelMi, type EkranMesaji, type HazirOturumAlanlari } from './akis';

/*
 * OTURUM ÖZETİ PANELİN KENDİ TİPİ (shared'da karşılığı yok, API'de
 * `sohbet.service.ts#OturumOzeti`). `HazirOturumAlanlari` AdvStrategy
 * aktarımının iki alanı (MIMARI §6.1); isteğe bağlı, çünkü eski oturumlar
 * ve aktarımla açılmamış oturumlar taşımıyor. Tip shared'a taşınınca bu
 * arayüz kalkmalı (devir notu).
 */
interface OturumOzeti extends HazirOturumAlanlari {
  id: string;
  baslik: string;
  taslakId: string | null;
  durum: string;
  sahibiBenMiyim: boolean;
  updatedAt: string;
}

type Kart = OnayKarti & { onayId: string };
type YuklemeHali = { ad: string; tur: 'yukleniyor' } | { ad: string; tur: 'hata'; mesaj: string };

const ORNEKLER = ['Bu görsellerle siteme trafik getir', 'Bu görsellerle form kampanyası oluştur', 'Siteme gelsinler, günlük 300 TL, 14 gün, İzmir'];

/**
 * ADVCAMPAIGN — sohbetle reklam (docs/advcampaign/TASARIM-PLAN.md § 1).
 *
 * Üç bölge: oturumlar, sohbet akışı (yazma alanı altta), canlı taslak
 * paneli. Panel yolu HER ZAMAN açık: asistan reddetse, kota dolsa ya da hiç
 * bağlı olmasa da taslak sağ panelden elle bitirilebiliyor.
 *
 * Bu bileşen yalnız ÇİZİYOR. Hâl kararı `sohbetHali` (shared), olayların
 * uygulanması `olayUygula` (akis.ts) içinde ve ikisi de testli. Hata
 * yutulmuyor: "okunuyor", "okunamadı", "akış koptu", "kesildi" ayrı cümle.
 */
export function SohbetEkrani({
  clientId,
  hazirlik,
  workspaceAdi,
  yonetici,
  atif,
  ilkOturumlar,
  ilkOturumId,
  asistanBagli,
}: {
  clientId: string;
  hazirlik: ReklamHazirligi;
  workspaceAdi: string;
  yonetici: boolean;
  atif: AtifDurumu | null;
  ilkOturumlar: { satirlar: OturumOzeti[]; toplam: number };
  ilkOturumId: string | null;
  asistanBagli: boolean;
}) {
  const router = useRouter();
  const [oturumlar, setOturumlar] = useState(ilkOturumlar);
  const [oturumId, setOturumId] = useState<string | null>(ilkOturumId);
  const [mesajlar, setMesajlar] = useState<EkranMesaji[]>([]);
  const [mesajHali, setMesajHali] = useState<'yok' | 'okunuyor' | 'hazir' | { hata: string }>(ilkOturumId ? 'okunuyor' : 'yok');
  const [taslak, setTaslak] = useState<ReklamTaslakKaydi | null>(null);
  const [taslakHatasi, setTaslakHatasi] = useState<string | null>(null);
  const [akis, setAkis] = useState<'yok' | 'bagli' | 'koptu'>('yok');
  const [metin, setMetin] = useState('');
  const [medyalar, setMedyalar] = useState<YuklenenMedya[]>([]);
  const [yuklemeler, setYuklemeler] = useState<YuklemeHali[]>([]);
  const [gonderHatasi, setGonderHatasi] = useState<string | null>(null);
  const [arsivAcik, setArsivAcik] = useState(false);
  const [mobilSekme, setMobilSekme] = useState<'sohbet' | 'taslak'>('sohbet');
  const [taslakYeni, setTaslakYeni] = useState(false);
  /*
   * Hazır içeriği hangi oturum için koyduğumuz. Oturum değişince kutuda
   * hâlâ AYNEN o içerik duruyorsa kaldırılıyor (başka oturuma taşınmasın);
   * kullanıcı dokunduysa onun yazdığı kalıyor.
   */
  const [plandan, setPlandan] = useState<{ oturumId: string; metin: string } | null>(null);
  /*
   * İKİ REF, STATE DEĞİL: okuma yanıtı geldiğinde SEÇİLİ oturumu ve hazır
   * içeriğin konduğu oturumları bilmek gerekiyor; `useCallback` içindeki
   * state yakalandığı anki değerde kalır ve sırasız gelen yanıtı ayırt
   * edemezdi. `seciliRef` her `setOturumId` ile AYNI ANDA güncelleniyor.
   */
  const seciliRef = useRef<string | null>(ilkOturumId);
  const hazirKonanlar = useRef<Set<string>>(new Set());
  const oturumuSecili = (id: string | null) => {
    seciliRef.current = id;
    setOturumId(id);
  };
  const yazmaAlani = useRef<HTMLTextAreaElement>(null);
  const akisSonu = useRef<HTMLDivElement>(null);
  const oturum = oturumlar.satirlar.find((o) => o.id === oturumId) ?? null;

  // --- Okuma ---------------------------------------------------------------
  const taslakOku = useCallback(async (id: string) => {
    try {
      setTaslak(await apiFetch<ReklamTaslakKaydi>(`/reklam/taslaklar/${id}`));
      setTaslakHatasi(null);
      setTaslakYeni(true);
    } catch (e) {
      setTaslakHatasi(e instanceof ApiRequestError ? e.message : 'Taslak okunamadı.');
    }
  }, []);

  const mesajlariOku = useCallback(
    async (id: string) => {
      try {
        const r = await apiFetch<{ oturum: OturumOzeti; mesajlar: EkranMesaji[] }>(`/reklam/sohbet/oturumlar/${id}/mesajlar`);
        // Kullanıcı bu arada başka oturuma geçtiyse yanıt HİÇBİR ŞEY yazmıyor.
        if (!yanitGuncelMi(id, seciliRef.current)) return null;
        setMesajlar(r.mesajlar);
        setMesajHali('hazir');
        // AdvStrategy'den gelen boş oturum: kutu ve ekler hazır dolar, oturum başına bir kez.
        const hazir = hazirKonacakMi({
          istenenOturumId: id,
          seciliOturumId: seciliRef.current,
          konanlar: hazirKonanlar.current,
          oturum: r.oturum,
          mesajSayisi: r.mesajlar.length,
          gorseller: hazirlik.gorseller.satirlar,
        });
        if (hazir) {
          hazirKonanlar.current.add(id);
          // İlk okumadan önce kullanıcı yazmaya başladıysa onun yazdığı kalır.
          setMetin((m) => (m === '' ? hazir.metin : m));
          setMedyalar((x) => (x.length === 0 ? hazir.medyalar : x));
          setPlandan({ oturumId: id, metin: hazir.metin });
        }
        if (r.oturum.taslakId) void taslakOku(r.oturum.taslakId);
        else setTaslak(null);
        return r;
      } catch (e) {
        if (yanitGuncelMi(id, seciliRef.current)) {
          setMesajHali({ hata: e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.' });
        }
        return null;
      }
    },
    [taslakOku, hazirlik.gorseller.satirlar],
  );

  useEffect(() => {
    if (oturumId) void mesajlariOku(oturumId);
  }, [oturumId, mesajlariOku]);

  useEffect(() => {
    akisSonu.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [mesajlar]);

  useEffect(() => {
    if (!taslakYeni) return;
    const t = setTimeout(() => setTaslakYeni(false), 3000);
    return () => clearTimeout(t);
  }, [taslakYeni]);

  // AKIŞ KOPTUYSA durum SORULUR: sunucu turu bitiriyor, son satır kapanana
  // kadar 3 sn'de bir okunur. "Koptu" yazıp beklemek kullanıcıyı sayfayı
  // yenilemeye iterdi.
  useEffect(() => {
    if (akis !== 'koptu' || !oturumId) return;
    const t = setInterval(async () => {
      const r = await mesajlariOku(oturumId);
      if (r && r.mesajlar.at(-1)?.durum !== 'akista') setAkis('yok');
    }, 3000);
    return () => clearInterval(t);
  }, [akis, oturumId, mesajlariOku]);

  function oturumSec(id: string | null) {
    if (plandan && plandan.oturumId !== id) {
      if (metin === plandan.metin) {
        setMetin('');
        setMedyalar([]);
      }
      setPlandan(null);
    }
    oturumuSecili(id);
    setMesajlar([]);
    setTaslak(null);
    setMesajHali(id ? 'okunuyor' : 'yok');
    const p = new URLSearchParams({ musteri: clientId });
    if (id) p.set('oturum', id);
    router.replace(`/reklam?${p.toString()}`, { scroll: false });
  }

  // --- Medya ---------------------------------------------------------------
  async function dosyalar(liste: FileList | File[]) {
    const yer = ADV_SOHBET_SINIRLARI.oturumGorsel - medyalar.length;
    const secilen = Array.from(liste).slice(0, Math.max(0, yer));
    if (liste.length > secilen.length) setGonderHatasi(`Tek mesajda en çok ${ADV_SOHBET_SINIRLARI.oturumGorsel} dosya; ${liste.length - secilen.length} dosya eklenmedi.`);
    for (const d of secilen) {
      setYuklemeler((y) => [...y, { ad: d.name, tur: 'yukleniyor' }]);
      try {
        const m = await medyaYukle(clientId, d);
        setMedyalar((x) => [...x, m]);
        setYuklemeler((y) => y.filter((h) => h.ad !== d.name));
      } catch (e) {
        setYuklemeler((y) => y.map((h) => (h.ad === d.name ? { ad: d.name, tur: 'hata', mesaj: (e as Error).message } : h)));
      }
    }
  }

  // --- Gönderme ------------------------------------------------------------
  async function gonder(yazi: string) {
    if (akis === 'bagli') return;
    const temiz = yazi.trim();
    if (!temiz && medyalar.length === 0) return;
    setGonderHatasi(null);
    let id = oturumId;
    if (!id) {
      try {
        const o = await apiFetch<OturumOzeti>('/reklam/sohbet/oturumlar', { method: 'POST', body: JSON.stringify({ clientId }) });
        setOturumlar((x) => ({ satirlar: [o, ...x.satirlar], toplam: x.toplam + 1 }));
        id = o.id;
        oturumuSecili(id);
        setMesajHali('hazir');
        router.replace(`/reklam?musteri=${clientId}&oturum=${id}`, { scroll: false });
      } catch (e) {
        setGonderHatasi(e instanceof ApiRequestError ? e.message : 'Oturum açılamadı.');
        return;
      }
    }
    const gonderilen = medyalar;
    setMesajlar((m) => [
      ...m,
      {
        id: `yerel-${Date.now()}`,
        sira: (m.at(-1)?.sira ?? 0) + 1,
        rol: 'kullanici',
        metin: temiz,
        olaylar: [],
        durum: 'tamam',
        medya: gonderilen.map((x) => ({ adres: onizlemeAdresi(x.onizlemeAdresi), video: !!x.kapakId })),
      },
    ]);
    setMetin('');
    setMedyalar([]);
    setPlandan(null);
    setAkis('bagli');
    let res: Response;
    try {
      res = await fetch(`${API_URL}/reklam/sohbet/oturumlar/${id}/mesajlar`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ metin: temiz, medyalar: gonderilen.map((x) => (x.kapakId ? { varlikId: x.id, kapakVarlikId: x.kapakId } : { varlikId: x.id })) }),
      });
    } catch {
      setAkis('koptu');
      return;
    }
    if (!res.ok || !res.body) {
      const g = (await res.json().catch(() => null)) as { message?: string } | null;
      setGonderHatasi(g?.message ?? `Mesaj gönderilemedi (HTTP ${res.status}).`);
      setAkis('yok');
      void mesajlariOku(id);
      return;
    }
    const okuyucu = res.body.getReader();
    const cozucu = new TextDecoder();
    let tampon = '';
    try {
      for (;;) {
        const { done, value } = await okuyucu.read();
        if (done) break;
        tampon += cozucu.decode(value, { stream: true });
        const r = olaylariAyikla(tampon);
        tampon = r.kalan;
        for (const e of r.olaylar) {
          setMesajlar((m) => olayUygula(m, e));
          if (e.tur === 'taslak_degisti') void taslakOku(e.taslakId);
          if (e.tur === 'bitti') setOturumlar((x) => ({ ...x, satirlar: x.satirlar.map((o) => (o.id === id ? { ...o, updatedAt: new Date().toISOString() } : o)) }));
        }
      }
      setAkis('yok');
    } catch {
      // Sunucu turu bitiriyor; ekran durumu sorar (yukarıdaki etki).
      setAkis('koptu');
    }
  }

  // --- Hâl ------------------------------------------------------------------
  const sonAsistan = [...mesajlar].reverse().find((m) => m.rol === 'asistan') ?? null;
  const soru = bekleyenSoru(mesajlar);
  const hal = sohbetHali({
    hazirlik: 'hazir',
    yazmaYetkisi: true,
    eksikBaglanti: hazirlik.hesaplar.length === 0 ? 'hesap' : hazirlik.sayfalar.length === 0 ? 'sayfa' : null,
    kota: sonAsistan?.olaylar.some((e) => e.tur === 'hata' && e.hata === 'kota') ? { tur: 'doldu', sebep: 'saatlik_mesaj', yenilenme: null } : { tur: 'serbest' },
    akis,
    mesajSayisi: mesajlar.length,
    sonAsistanMesaji: sonAsistan ? { durum: sonAsistan.durum, metinGeldi: sonAsistan.metin.length > 0, soruVar: !!soru } : null,
  });
  const yaziliyor = hal === 'model_dusunuyor' || hal === 'model_yaziyor';

  const sohbet = (
    <section className="adv-izgara flex min-h-[32rem] min-w-0 flex-col rounded-xl border border-line bg-surface">
      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5" aria-live="polite">
        {!asistanBagli && (
          <Kutu ton="uyari" baslik="Asistan bağlı değil">
            Sunucuda yapay zekâ anahtarı tanımlı değil. Taslağı sağdaki panelden kurabilirsin.
          </Kutu>
        )}
        {mesajHali === 'okunuyor' && <p className="text-sm text-ink-muted">Sohbet okunuyor…</p>}
        {typeof mesajHali === 'object' && (
          <Kutu ton="tehlike" baslik="Sohbet okunamadı" eylem={<Dugme ton="ikincil" kucuk onClick={() => oturumId && mesajlariOku(oturumId)}>Yeniden dene</Dugme>}>
            {mesajHali.hata}
          </Kutu>
        )}
        {plandan && plandan.oturumId === oturumId && mesajlar.length === 0 && (
          <Kutu ton="bilgi" baslik="AdvStrategy planından geldi">
            Mesaj ve görseller plandan hazır. Göz at, istersen düzelt, sonra gönder.
          </Kutu>
        )}
        {(mesajHali === 'yok' || (mesajHali === 'hazir' && mesajlar.length === 0 && !plandan)) && (
          <div className="mx-auto max-w-lg py-10 text-center">
            <span className="adv-yorunge mb-3">
              <i />
            </span>
            <h2 className="text-lg font-semibold">Ne yapmak istersin?</h2>
            <p className="mt-1 text-sm text-ink-muted">{HAL_METNI.bos_oturum.metin} Sorularımı tek tek soracağım; sonunda önizlemeyi gösterip onayına bırakacağım.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {ORNEKLER.map((o) => (
                <button key={o} type="button" onClick={() => setMetin(o)} className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs hover:border-brand">
                  {o}
                </button>
              ))}
            </div>
          </div>
        )}

        {mesajlar.map((m) => (m.rol === 'kullanici' ? <KullaniciBalonu key={m.id} m={m} /> : <AsistanBalonu key={m.id} m={m} clientId={clientId} taslakId={taslak?.id ?? oturum?.taslakId ?? null} yeniden={() => oturumId && mesajlariOku(oturumId)} />))}

        {hal === 'akis_koptu' && <Kutu ton="uyari" baslik="Bağlantı koptu">{HAL_METNI.akis_koptu.metin}</Kutu>}
        {soru && (
          <div className="space-y-2 rounded-xl border border-dashed border-brand/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              Soru {soru.sira} / 5
            </p>
            <div className="flex flex-wrap gap-1.5">
              {soru.secenekler.map((s) => (
                <button key={s.deger} type="button" onClick={() => gonder(s.etiket)} className="rounded-full border border-line bg-surface px-3 py-1 text-xs hover:border-brand">
                  {s.etiket}
                </button>
              ))}
              {soru.serbest && <span className="self-center text-xs text-ink-muted">ya da cevabını yaz</span>}
            </div>
          </div>
        )}
        <div ref={akisSonu} />
      </div>

      {/* Yazma alanı: yapışkan, medya bırakma burada. */}
      <div
        className="sticky bottom-0 border-t border-line bg-surface p-3"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void dosyalar(e.dataTransfer.files);
        }}
      >
        {(medyalar.length > 0 || yuklemeler.length > 0) && (
          <ul className="mb-2 flex flex-wrap gap-2">
            {medyalar.map((m) => (
              <li key={m.id} className="relative w-20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={onizlemeAdresi(m.onizlemeAdresi)} alt={m.ad} className="aspect-square w-20 rounded-lg border border-line object-cover" />
                {m.kapakId && <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] text-white">▶ video</span>}
                <span className="block truncate text-[10px] text-ink-muted">{m.oran}</span>
                {m.uyari && <span className="block text-[10px] leading-tight text-warn-strong">{m.uyari}</span>}
                <button type="button" aria-label={`${m.ad} kaldır`} onClick={() => setMedyalar((x) => x.filter((y) => y.id !== m.id))} className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-[10px] text-white">
                  ✕
                </button>
              </li>
            ))}
            {yuklemeler.map((y) => (
              <li key={y.ad} className={`w-40 rounded-lg border p-2 text-[11px] ${y.tur === 'hata' ? 'border-danger/40 text-danger-strong' : 'border-line text-ink-muted'}`}>
                <span className="block truncate font-semibold">{y.ad}</span>
                {y.tur === 'yukleniyor' ? 'yükleniyor…' : y.mesaj}
                {y.tur === 'hata' && (
                  <button type="button" className="ml-1 underline" onClick={() => setYuklemeler((x) => x.filter((h) => h.ad !== y.ad))}>
                    kapat
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {arsivAcik && (
          <div className="mb-2 rounded-lg border border-line p-2">
            <p className="mb-1 text-[11px] text-ink-muted">
              Arşiv · {hazirlik.gorseller.satirlar.length} / {hazirlik.gorseller.toplam}
            </p>
            {hazirlik.gorseller.satirlar.length === 0 ? (
              <p className="text-xs text-ink-muted">Bu workspace’in arşivinde görsel yok.</p>
            ) : (
              <div className="flex gap-2 overflow-x-auto">
                {hazirlik.gorseller.satirlar.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() =>
                      setMedyalar((x) => (x.some((y) => y.id === g.id) ? x : [...x, { id: g.id, ad: g.ad, onizlemeAdresi: g.onizlemeAdresi, oran: `${g.genislik}×${g.yukseklik}`, uyari: null }]))
                    }
                    className="shrink-0"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={onizlemeAdresi(g.onizlemeAdresi)} alt={g.ad} className="h-16 w-16 rounded-md border border-line object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {gonderHatasi && <p role="alert" className="mb-2 text-xs text-danger-strong">{gonderHatasi}</p>}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void gonder(metin);
          }}
        >
          <label className={`${dugmeSinifi('ikincil', true)} cursor-pointer`} title="Görsel ya da video ekle">
            ＋<span className="sr-only">Görsel ya da video ekle</span>
            <input type="file" multiple accept="image/jpeg,image/png,video/mp4,video/quicktime" className="hidden" onChange={(e) => e.target.files && void dosyalar(e.target.files)} />
          </label>
          <Dugme ton="sade" kucuk type="button" onClick={() => setArsivAcik((a) => !a)} aria-pressed={arsivAcik}>
            Arşiv
          </Dugme>
          <textarea
            ref={yazmaAlani}
            value={metin}
            onChange={(e) => setMetin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void gonder(metin);
              }
            }}
            rows={2}
            maxLength={4000}
            placeholder={soru ? soru.metin : 'Görselini bırak, ne istediğini yaz…'}
            aria-label="Mesaj"
            className="min-h-[2.75rem] flex-1 resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          />
          <Dugme type="submit" disabled={yaziliyor || yuklemeler.some((y) => y.tur === 'yukleniyor') || (!metin.trim() && medyalar.length === 0)}>
            Gönder
          </Dugme>
        </form>
        <p className="mt-1 flex items-center gap-2 text-[11px] text-ink-muted">
          {yaziliyor ? (
            <>
              <span className="adv-yorunge calisiyor !h-4 !w-4">
                <i />
              </span>
              {HAL_METNI[hal].metin}…
            </>
          ) : (
            'Görsel ve videoyu buraya sürükleyebilirsin · JPEG, PNG, MP4, MOV'
          )}
        </p>
      </div>
    </section>
  );

  const panel = (
    <aside className={`adv-centik space-y-3 rounded-xl border border-line bg-surface p-3 ${taslakYeni ? 'border-brand/50' : ''}`}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Canlı taslak{taslak ? ` · sürüm ${taslak.aktifSurumNo}` : ''}</p>
        {taslakYeni && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand-strong">Güncellendi</span>}
      </div>
      {taslakHatasi && (
        <Kutu ton="tehlike" baslik="Taslak okunamadı" eylem={<Dugme ton="ikincil" kucuk onClick={() => oturum?.taslakId && taslakOku(oturum.taslakId)}>Yeniden dene</Dugme>}>
          {taslakHatasi}
        </Kutu>
      )}
      {!taslak && !taslakHatasi && (
        <p className="text-sm text-ink-muted">
          {oturumId ? 'Bu sohbette henüz taslak kurulmadı. Medya bırakıp ne istediğini yazınca burada belirir.' : 'Sohbete başlayınca taslak burada belirir.'}
        </p>
      )}
      {taslak && <Onizleme ilkTaslak={taslak} hazirlik={hazirlik} ilkAtif={atif} yonetici={yonetici} workspaceAdi={workspaceAdi} dar />}
    </aside>
  );

  return (
    <div className="space-y-3">
      {(hazirlik.hesaplar.length === 0 || hazirlik.sayfalar.length === 0) && (
        <Kutu ton="uyari" baslik={HAL_METNI.eksik_baglanti.metin} eylem={<a href={`/marka-merkezi?bolum=baglantilar&musteri=${clientId}`} className={dugmeSinifi('ikincil', true)}>Bağlantılara git</a>}>
          {hazirlik.hesaplar.length === 0 ? 'Meta reklam hesabı atanmamış.' : 'Facebook sayfası yok.'} Taslak kurulur ama Meta’ya gönderilemez.
        </Kutu>
      )}
      {/* Mobil: sohbet ve taslak sekmeli; masaüstünde yan yana. */}
      <div className="flex gap-1 xl:hidden" role="tablist">
        {(['sohbet', 'taslak'] as const).map((s) => (
          <button key={s} role="tab" aria-selected={mobilSekme === s} onClick={() => setMobilSekme(s)} className={`flex-1 rounded-lg border px-3 py-2 text-sm ${mobilSekme === s ? 'border-brand font-semibold' : 'border-line text-ink-muted'}`}>
            {s === 'sohbet' ? 'Sohbet' : 'Taslak'}
            {s === 'taslak' && taslakYeni && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-brand align-middle" />}
          </button>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[13rem_minmax(0,1fr)_26rem]">
        <nav aria-label="Oturumlar" className="space-y-1 rounded-xl border border-line bg-surface p-2 text-sm">
          <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
            Oturumlar · {oturumlar.satirlar.length} / {oturumlar.toplam}
          </p>
          <button type="button" onClick={() => oturumSec(null)} className={`w-full rounded-lg px-2 py-1.5 text-left ${!oturumId ? 'bg-brand-soft font-semibold' : 'hover:bg-surface-muted'}`}>
            + Yeni oturum
          </button>
          {oturumlar.satirlar.map((o) => (
            <button key={o.id} type="button" onClick={() => oturumSec(o.id)} className={`w-full rounded-lg px-2 py-1.5 text-left ${o.id === oturumId ? 'bg-brand-soft font-semibold' : 'hover:bg-surface-muted'}`}>
              <span className="block truncate">{o.baslik}</span>
              <span className="block text-[11px] text-ink-muted">
                {new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(o.updatedAt))}
                {!o.sahibiBenMiyim && ' · ekip arkadaşının'}
              </span>
            </button>
          ))}
        </nav>
        <div className={mobilSekme === 'sohbet' ? '' : 'hidden xl:block'}>{sohbet}</div>
        <div className={mobilSekme === 'taslak' ? '' : 'hidden xl:block'}>{panel}</div>
      </div>
      {oturum && !oturum.sahibiBenMiyim && (
        <Kutu ton="bilgi" baslik="Bu oturum bir ekip arkadaşının">Okuyabilirsin; yazmak için kendi oturumunu aç.</Kutu>
      )}
    </div>
  );
}

function KullaniciBalonu({ m }: { m: EkranMesaji }) {
  return (
    <div className="ml-auto max-w-[85%] space-y-1">
      {m.medya && m.medya.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1">
          {m.medya.map((x, i) => (
            <span key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={x.adres} alt="" className="h-16 w-16 rounded-lg border border-line object-cover" />
              {x.video && <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] text-white">▶</span>}
            </span>
          ))}
        </div>
      )}
      {m.metin && <p className="whitespace-pre-wrap rounded-2xl rounded-br-sm bg-[var(--color-ink)] px-3.5 py-2 text-sm text-[var(--surface)]">{m.metin}</p>}
    </div>
  );
}

function AsistanBalonu({ m, clientId, taslakId, yeniden }: { m: EkranMesaji; clientId: string; taslakId: string | null; yeniden: () => void }) {
  const izler = aracIzleri(m.olaylar);
  const kartlar = m.olaylar.filter((e): e is Extract<SohbetOlayi, { tur: 'kart' }> => e.tur === 'kart');
  const hatalar = m.olaylar.filter((e): e is Extract<SohbetOlayi, { tur: 'hata' }> => e.tur === 'hata');
  const duzeltme = m.olaylar.find((e): e is Extract<SohbetOlayi, { tur: 'durum_duzeltmesi' }> => e.tur === 'durum_duzeltmesi');
  const akista = m.durum === 'akista';
  return (
    <div className="flex max-w-[92%] gap-2.5">
      <span className={`adv-yorunge mt-0.5 shrink-0 ${akista ? 'calisiyor' : ''}`} aria-hidden>
        <i />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        {izler.length > 0 && (
          <ol className="adv-iz space-y-1 pl-3 text-xs text-ink-muted">
            {izler.map((z) => (
              <li key={z.adim} className={z.hal === 'dustu' || z.hal === 'reddedildi' ? 'text-warn-strong' : ''}>
                {aracIziMetni(z.arac as AracAdi, z.hal as 'suruyor' | AracSonucu['hal'])}
                {z.sureMs !== null && <span className="ml-1 opacity-70">{sureMetni(z.sureMs)}</span>}
              </li>
            ))}
          </ol>
        )}
        {m.metin && <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.metin}{akista && <span className="ml-0.5 animate-pulse motion-reduce:animate-none">▍</span>}</p>}
        {akista && !m.metin && izler.length === 0 && <p className="text-sm text-ink-muted">Düşünüyor…</p>}
        {duzeltme && <p className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-xs">{duzeltme.metin}</p>}
        {hatalar.map((h, i) => (
          <Kutu key={i} ton={h.hata === 'ret' ? 'bilgi' : 'uyari'} baslik={h.hata === 'kota' ? 'Sınır doldu' : h.hata === 'kesildi' ? 'Yarıda kesildi' : h.hata === 'ret' ? 'Asistan yapamadı' : 'Asistana ulaşılamadı'}>
            {h.mesaj}
          </Kutu>
        ))}
        {kartlar.map((k, i) => (
          <OnayKartiGorunumu key={i} kart={k.kart as Kart} clientId={clientId} taslakId={taslakId} yeniden={yeniden} />
        ))}
      </div>
    </div>
  );
}

function OnayKartiGorunumu({ kart, clientId, taslakId, yeniden }: { kart: Kart; clientId: string; taslakId: string | null; yeniden: () => void }) {
  const [hal, setHal] = useState<'bos' | 'gonderiliyor' | { tamam: string } | { hata: string }>('bos');
  const birincil = useMemo(() => kart.dugmeler.find((d) => d.tur === 'yayinla' || d.tur === 'test_kipi') ?? null, [kart]);
  async function onayla(mod: 'yayinla' | 'test_kipi') {
    setHal('gonderiliyor');
    try {
      const r = await apiFetch<{ yayinId: string }>(`/reklam/onaylar/${kart.onayId}/onayla`, { method: 'POST', body: JSON.stringify({ mod }) });
      setHal({ tamam: r.yayinId });
      yeniden();
    } catch (e) {
      setHal({ hata: e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.' });
    }
  }
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="h-0.5 bg-brand" />
      <div className="space-y-3 p-4 text-sm">
        <h3 className="font-semibold">{kart.baslik}</h3>
        <ul className="space-y-2">
          {kart.satirlar.map((s, i) => (
            <li key={i} className="rounded-lg border border-line p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{s.platform === 'meta' ? 'Meta' : 'Google'}</p>
              <p>{s.ozet}</p>
              <p className="mt-1 text-xs text-ink-muted">
                {s.prova} · {s.durum}
              </p>
            </li>
          ))}
        </ul>
        {kart.esneklik && <p className="text-xs"><strong>Bütçe esnekliği.</strong> {kart.esneklik}</p>}
        <div className="grid gap-3 text-xs sm:grid-cols-2">
          <div>
            <p className="font-semibold">Kapattıklarımız</p>
            <p className="text-ink-muted">{kart.kapattiklarimiz.join(', ')}</p>
          </div>
          <div>
            <p className="font-semibold">Meta’nın otomatik yapabilecekleri</p>
            <p className="text-ink-muted">{kart.metaOtomatikYapabilir.join(', ')}</p>
          </div>
        </div>
        {kart.olcum && <p className="text-xs"><strong>Ölçüm.</strong> {kart.olcum}</p>}
        {kart.uyarilar.length > 0 && (
          <ul className="list-disc pl-4 text-xs text-warn-strong">
            {kart.uyarilar.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        )}
        {kart.dugmeYokSebebi && <p className="text-xs text-ink-muted">{kart.dugmeYokSebebi}</p>}
        {typeof hal === 'object' && 'hata' in hal && <p role="alert" className="text-xs text-danger-strong">{hal.hata}</p>}
        {typeof hal === 'object' && 'tamam' in hal ? (
          <p className="text-xs text-ok-strong">Gönderildi. Durumu sağdaki panel gösteriyor.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {birincil && (
              <Dugme disabled={hal === 'gonderiliyor'} onClick={() => onayla(birincil.tur as 'yayinla' | 'test_kipi')}>
                {birincil.etiket}
              </Dugme>
            )}
            {taslakId && (
              <a href={`/reklam/onizleme?musteri=${clientId}&taslak=${taslakId}`} className={dugmeSinifi('sade', true)}>
                Taslağı panelde aç
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
