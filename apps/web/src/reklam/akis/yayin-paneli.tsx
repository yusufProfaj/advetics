'use client';

import { useCallback, useEffect, useState } from 'react';
import { YAYIN_DURUM_SINIFI, type ReklamTaslakKaydi, type YayinDurumu } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Dugme, Kutu } from '../ui';

interface YayinGorunumu {
  id: string;
  durum: YayinDurumu;
  sebep: string | null;
  testKipi: boolean;
  durumAt: string;
  nesneler: Array<{ ad: string; tur: string; durum: string; metaId: string | null; hata: string | null }>;
  sonGeriOkuma: { sonuc: string; satirlar: Array<{ ekranEtiketi: string; tur: string; gonderilen: unknown; donen: unknown }>; zaman: string } | null;
}

type BaslatSonucu = { tur: 'basladi'; yayinId: string } | { tur: 'ret'; retler: Array<{ kod: string; mesaj: string }> };

/** Ekrandaki durum cümleleri (TASARIM § 04.11-04.12); kod adı ekrana basılmaz. */
const DURUM_METNI: Partial<Record<YayinDurumu, string>> = {
  on_kontrol: 'Kontrol ediliyor',
  medya: 'Görseller yükleniyor',
  kuruluyor: 'Meta’da duraklatılmış olarak kuruluyor',
  uzlastirma: 'Meta’nın cevabı belirsiz; Meta’da aranıyor',
  geri_okuma: 'Meta’dan geri okunuyor',
  tekillik_kapisi: 'Kopya kontrolü yapılıyor',
  aciliyor: 'Açılıyor',
  sonuc_belirsiz: 'Durdu: Meta’da oluşup oluşmadığı bilinmiyor',
  kayit_belirsiz: 'Durdu: Meta’da kuruldu ama kaydımız yazılamadı (ekip haberdar)',
  kurulamadi: 'Durdu: Meta kurulumu reddetti',
  fark_var: 'Durdu: Meta’da duran ayar gönderdiğimizden farklı',
  dogrulanamadi: 'Durdu: Meta’daki ayarlar okunamadı',
  kismen_acik: 'Durdu: bir kısmı açıldı, reklam yayında değil',
  bekletildi: 'Bekletildi',
  iletildi: 'Meta’ya iletildi, incelemede',
  arsivlendi: 'Arşivlendi',
};

const DUGMELER: Array<{ adim: 'devam' | 'geri-al' | 'yeniden-oku'; etiket: string; durumlar: YayinDurumu[] }> = [
  { adim: 'devam', etiket: 'Kaldığı yerden devam', durumlar: ['bekletildi'] },
  { adim: 'yeniden-oku', etiket: 'Yeniden kontrol et', durumlar: ['dogrulanamadi'] },
  { adim: 'geri-al', etiket: 'Geri al (arşivle)', durumlar: ['fark_var', 'dogrulanamadi', 'kurulamadi', 'kismen_acik', 'sonuc_belirsiz'] },
];

/**
 * Yayın bölümü — Gözden geçir'in sonu.
 *
 * Meta provası yazılmadığı için GERÇEK yayın kapalı; ajans yöneticisi TEST
 * KİPİNDE deneyebilir: kurar, geri okur, açmadan arşivler. Bu, canlı turun
 * kendisi (Aşama 2) ve harcama yapmaz.
 *
 * Motor ilerlerken durum 3 saniyede bir okunuyor; motor durduğunda okuma da
 * duruyor. Hata sessiz değil: okuma düşerse ekranda yazıyor.
 */
export function YayinPaneli({
  taslak,
  yonetici,
  kullaniciEksigi,
  onDegisti,
}: {
  taslak: ReklamTaslakKaydi;
  yonetici: boolean;
  kullaniciEksigi: number;
  onDegisti: () => void;
}) {
  const [yayin, setYayin] = useState<YayinGorunumu | null>(null);
  const [okumaHatasi, setOkumaHatasi] = useState<string | null>(null);
  const [retler, setRetler] = useState<Array<{ kod: string; mesaj: string }>>([]);
  const [bekliyor, setBekliyor] = useState(false);

  const oku = useCallback(async () => {
    try {
      // Boş gövde (aktif yayın yok) `undefined` gelebiliyor; null'a çevrilir.
      setYayin((await apiFetch<YayinGorunumu | null>(`/reklam/taslaklar/${taslak.id}/yayin`)) ?? null);
      setOkumaHatasi(null);
    } catch (e) {
      setOkumaHatasi(e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.');
    }
  }, [taslak.id]);

  useEffect(() => {
    void oku();
  }, [oku]);

  const motorda = yayin ? YAYIN_DURUM_SINIFI[yayin.durum].motor : false;
  useEffect(() => {
    if (!motorda) return;
    const t = setInterval(() => void oku(), 3000);
    return () => clearInterval(t);
  }, [motorda, oku]);

  async function testKipindeDene() {
    setBekliyor(true);
    setRetler([]);
    try {
      const r = await apiFetch<BaslatSonucu>(`/reklam/taslaklar/${taslak.id}/yayinla`, {
        method: 'POST',
        body: JSON.stringify({ surumNo: taslak.aktifSurumNo, icerikOzeti: taslak.icerikOzeti, testKipi: true }),
      });
      if (r.tur === 'ret') setRetler(r.retler);
      else {
        await oku();
        onDegisti();
      }
    } catch (e) {
      setRetler([{ kod: 'HATA', mesaj: e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.' }]);
    } finally {
      setBekliyor(false);
    }
  }

  async function adim(a: 'devam' | 'geri-al' | 'yeniden-oku') {
    if (!yayin) return;
    setBekliyor(true);
    try {
      await apiFetch(`/reklam/yayinlar/${yayin.id}/${a}`, { method: 'POST' });
      await oku();
    } catch (e) {
      setOkumaHatasi(e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.');
    } finally {
      setBekliyor(false);
    }
  }

  const aktif = yayin && YAYIN_DURUM_SINIFI[yayin.durum].aktif;

  return (
    <div className="space-y-3 border-t border-line pt-4">
      {okumaHatasi && <Kutu ton="tehlike" baslik="Yayın durumu okunamadı">{okumaHatasi}</Kutu>}

      {yayin && (
        <section className="rounded-lg border border-line p-3.5 text-sm">
          <h3 className="mb-1 font-semibold">
            {yayin.testKipi ? 'Test kurulumu' : 'Yayın'}: {DURUM_METNI[yayin.durum] ?? yayin.durum}
          </h3>
          {yayin.sebep && <p className="text-ink-muted">{yayin.sebep}</p>}
          <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
            {yayin.nesneler.map((n) => (
              <li key={n.ad} className="flex justify-between gap-2 rounded bg-surface-muted px-2 py-1">
                <span>{n.tur === 'medya' ? 'Görsel' : n.ad}</span>
                <span className={n.durum === 'reddedildi' || n.durum === 'belirsiz' ? 'text-danger-strong' : 'text-ink-muted'}>
                  {n.durum}
                  {n.hata ? ` · ${n.hata}` : ''}
                </span>
              </li>
            ))}
          </ul>
          {yayin.sonGeriOkuma && yayin.sonGeriOkuma.satirlar.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-ink-muted">
                    <th className="py-1 pr-2">Alan</th>
                    <th className="py-1 pr-2">Gönderdik</th>
                    <th className="py-1">Meta’da duran</th>
                  </tr>
                </thead>
                <tbody>
                  {yayin.sonGeriOkuma.satirlar.map((s, i) => (
                    <tr key={i} className="border-t border-line align-top">
                      <td className="py-1 pr-2 font-semibold">{s.ekranEtiketi}</td>
                      <td className="py-1 pr-2 break-all">{s.tur === 'donmedi' ? '-' : JSON.stringify(s.gonderilen)}</td>
                      <td className="py-1 break-all">{s.tur === 'donmedi' ? 'Okunamadı' : JSON.stringify(s.donen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {DUGMELER.filter((d) => d.durumlar.includes(yayin.durum)).map((d) => (
              <Dugme key={d.adim} ton="ikincil" kucuk disabled={bekliyor} onClick={() => adim(d.adim)}>
                {d.etiket}
              </Dugme>
            ))}
          </div>
        </section>
      )}

      {retler.length > 0 && (
        <Kutu ton="uyari" baslik="Başlatılamadı">
          <ul className="list-disc pl-5">
            {retler.map((r, i) => (
              <li key={i}>{r.mesaj}</li>
            ))}
          </ul>
        </Kutu>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <p className="mr-auto max-w-prose text-xs text-ink-muted">
          Meta provası henüz bağlı değil; reklam bu ekrandan açılmıyor.
          {yonetici && ' Test kipi Meta’da duraklatılmış kurar, geri okur ve açmadan arşivler; para harcamaz.'}
        </p>
        {yonetici && (
          <Dugme
            ton="ikincil"
            disabled={bekliyor || !!aktif || kullaniciEksigi > 0 || !taslak.icerikOzeti}
            title={aktif ? 'Bu taslağın süren bir kurulumu var' : kullaniciEksigi > 0 ? 'Önce eksikleri tamamla' : undefined}
            onClick={testKipindeDene}
          >
            Test kipinde dene
          </Dugme>
        )}
        <Dugme disabled title="Meta provası henüz bağlı değil">
          Yayına al
        </Dugme>
      </div>
    </div>
  );
}
