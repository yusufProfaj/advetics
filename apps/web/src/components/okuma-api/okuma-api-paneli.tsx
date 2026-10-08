'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  OKUMA_ANAHTARI_SURELERI,
  OKUMA_ANAHTARI_UST_SINIR,
  type OkumaAnahtariOlusturmaYaniti,
  type OkumaAnahtariOzeti,
  type OkumaAraciTanimi,
} from '@advetics/shared';
import { API_URL, ApiRequestError, apiFetch } from '@/lib/api';
import { mcpAdresi, baglantiOrnekleri } from './baglanti-ornekleri';

const DURUM_ETIKETI: Record<OkumaAnahtariOzeti['durum'], { ad: string; sinif: string }> = {
  etkin: { ad: 'Etkin', sinif: 'border-ok/40 bg-ok-soft text-ok-strong' },
  suresi_doldu: { ad: 'Süresi doldu', sinif: 'border-line bg-surface-muted text-ink-muted' },
  iptal: { ad: 'İptal', sinif: 'border-danger/40 bg-danger/5 text-danger' },
};

function tarih(iso: string | null): string {
  return iso === null ? '-' : new Date(iso).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * ANAHTAR YÖNETİMİ — oluştur, bir kez göster, iptal et.
 *
 * DÜZ ANAHTAR YALNIZCA OLUŞTURMA YANITINDA: sunucu özetini saklıyor ve bir
 * daha üretemiyor. Bu yüzden yeni anahtar kutusu sayfa yenilenene kadar
 * duruyor ve bağlantı örnekleri anahtarla DOLU geliyor; kullanıcı anahtarı
 * kopyalayıp ayrıca bir komuta yapıştırmak zorunda kalmıyor.
 */
export function OkumaApiPaneli({
  anahtarlar,
  araclar,
}: {
  anahtarlar: OkumaAnahtariOzeti[];
  araclar: OkumaAraciTanimi[];
}) {
  const router = useRouter();
  const [ad, setAd] = useState('Claude');
  const [sure, setSure] = useState<string>('90');
  const [bekleyen, setBekleyen] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [yeni, setYeni] = useState<OkumaAnahtariOlusturmaYaniti | null>(null);
  const [kopyalanan, setKopyalanan] = useState<string | null>(null);
  /*
   * MCP ADRESİ TARAYICIDA KURULUYOR: `NEXT_PUBLIC_API_URL` göreli olabilir
   * ("/api") ve sunucuda render edilen sayfa kullanıcının gördüğü alan
   * adını bilmiyor. İlk çizimde API_URL'nin kendisi, sonra mutlak hâli.
   */
  const [mcpUrl, setMcpUrl] = useState(mcpAdresi(API_URL, null));
  useEffect(() => setMcpUrl(mcpAdresi(API_URL, window.location.origin)), []);

  const etkinSayisi = anahtarlar.filter((a) => a.durum === 'etkin').length;

  async function olustur() {
    setBekleyen('olustur');
    setHata(null);
    try {
      const r = await apiFetch<OkumaAnahtariOlusturmaYaniti>('/okuma-api/anahtarlar', {
        method: 'POST',
        body: JSON.stringify({ ad: ad.trim(), gecerlilikGun: sure === 'suresiz' ? null : Number(sure) }),
      });
      setYeni(r);
      router.refresh();
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : 'Anahtar oluşturulamadı.');
    } finally {
      setBekleyen(null);
    }
  }

  async function iptalEt(a: OkumaAnahtariOzeti) {
    if (!window.confirm(`"${a.ad}" anahtarı iptal edilsin mi? Bu anahtarı kullanan bağlantılar hemen durur.`)) return;
    setBekleyen(a.id);
    setHata(null);
    try {
      await apiFetch<OkumaAnahtariOzeti>(`/okuma-api/anahtarlar/${a.id}`, { method: 'DELETE' });
      if (yeni?.ozet.id === a.id) setYeni(null);
      router.refresh();
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : 'İptal edilemedi.');
    } finally {
      setBekleyen(null);
    }
  }

  async function kopyala(anahtar: string, metin: string) {
    try {
      await navigator.clipboard.writeText(metin);
      setKopyalanan(anahtar);
      setTimeout(() => setKopyalanan((k) => (k === anahtar ? null : k)), 2000);
    } catch {
      // Pano izni yoksa kullanıcı metni elle seçebiliyor; hatayı söyle.
      setHata('Panoya kopyalanamadı. Metni seçip elle kopyala.');
    }
  }

  const ornekler = baglantiOrnekleri(mcpUrl, yeni?.anahtar ?? null);

  return (
    <div className="space-y-5">
      {hata && (
        <p className="rounded border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">{hata}</p>
      )}

      {yeni && (
        <section className="rounded-xl border border-warn/50 bg-warn-soft p-4">
          <h2 className="font-medium">Yeni anahtar: {yeni.ozet.ad}</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            Bu anahtar yalnızca şimdi görünüyor. Sayfadan çıkınca bir daha gösterilemez; kaybedersen
            iptal edip yenisini oluştur.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded border border-line bg-surface px-3 py-2 font-mono text-xs">
              {yeni.anahtar}
            </code>
            <button
              type="button"
              onClick={() => kopyala('anahtar', yeni.anahtar)}
              className="rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              {kopyalanan === 'anahtar' ? 'Kopyalandı' : 'Kopyala'}
            </button>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-medium">Yeni anahtar</h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          Her araç için ayrı anahtar oluştur; biri sızarsa yalnızca onu iptal edersin. En çok{' '}
          {OKUMA_ANAHTARI_UST_SINIR} etkin anahtar olabilir ({etkinSayisi} etkin).
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
          <label className="text-sm">
            <span className="text-ink-muted">Ad</span>
            <input
              value={ad}
              onChange={(e) => setAd(e.target.value)}
              maxLength={80}
              placeholder="Örn. Claude Desktop, dizüstü"
              className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </label>
          <label className="text-sm">
            <span className="text-ink-muted">Geçerlilik</span>
            <select
              value={sure}
              onChange={(e) => setSure(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
            >
              {OKUMA_ANAHTARI_SURELERI.map((g) => (
                <option key={g} value={String(g)}>
                  {g} gün
                </option>
              ))}
              <option value="suresiz">Süresiz</option>
            </select>
          </label>
          <button
            type="button"
            onClick={olustur}
            disabled={bekleyen !== null || ad.trim() === '' || etkinSayisi >= OKUMA_ANAHTARI_UST_SINIR}
            className="rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {bekleyen === 'olustur' ? 'Oluşturuluyor…' : 'Anahtar oluştur'}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-medium">Anahtarlar</h2>
        {anahtarlar.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">Henüz anahtar yok. Yukarıdan bir tane oluştur.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-muted">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Ad</th>
                  <th className="py-1.5 pr-3 font-medium">Anahtar</th>
                  <th className="py-1.5 pr-3 font-medium">Durum</th>
                  <th className="py-1.5 pr-3 font-medium">Bitiş</th>
                  <th className="py-1.5 pr-3 font-medium">Son kullanım</th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody>
                {anahtarlar.map((a) => (
                  <tr key={a.id} className="border-t border-line">
                    <td className="py-2 pr-3">{a.ad}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{a.gorunenOnek}…</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded border px-1.5 py-0.5 text-xs ${DURUM_ETIKETI[a.durum].sinif}`}>
                        {DURUM_ETIKETI[a.durum].ad}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs">{a.bitis === null ? 'Süresiz' : tarih(a.bitis)}</td>
                    <td className="py-2 pr-3 text-xs">
                      {a.sonKullanim === null ? 'Hiç kullanılmadı' : tarih(a.sonKullanim)}
                      {a.sonKullanimIp && <span className="block text-ink-muted">{a.sonKullanimIp}</span>}
                    </td>
                    <td className="py-2 text-right">
                      {a.durum === 'etkin' && (
                        <button
                          type="button"
                          onClick={() => iptalEt(a)}
                          disabled={bekleyen !== null}
                          className="rounded-lg border border-line px-2.5 py-1 text-xs transition hover:bg-surface-muted disabled:opacity-50"
                        >
                          {bekleyen === a.id ? 'İptal ediliyor…' : 'İptal et'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-medium">Bağlan</h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          MCP adresi: <code className="font-mono">{mcpUrl}</code>.{' '}
          {yeni ? 'Örnekler yeni anahtarla dolduruldu.' : 'Anahtar oluşturunca örnekler anahtarla dolar.'}
        </p>
        <div className="mt-3 space-y-3">
          {ornekler.map((o) => (
            <div key={o.baslik}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{o.baslik}</p>
                <button
                  type="button"
                  onClick={() => kopyala(o.baslik, o.metin)}
                  className="rounded-lg border border-line px-2.5 py-1 text-xs transition hover:bg-surface-muted"
                >
                  {kopyalanan === o.baslik ? 'Kopyalandı' : 'Kopyala'}
                </button>
              </div>
              <p className="text-xs text-ink-muted">{o.aciklama}</p>
              <pre className="mt-1 overflow-x-auto rounded border border-line bg-surface-muted px-3 py-2 font-mono text-xs">
                {o.metin}
              </pre>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-medium">Araçlar ({araclar.length})</h2>
        <p className="mt-0.5 text-xs text-ink-muted">Yapay zekânın kullanabildiği okuma araçları. Hiçbiri veri değiştirmez.</p>
        <ul className="mt-3 space-y-2 text-sm">
          {araclar.map((a) => (
            <li key={a.ad}>
              <code className="font-mono text-xs">{a.ad}</code> <span className="font-medium">{a.baslik}</span>
              <p className="text-xs text-ink-muted">{a.aciklama}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
