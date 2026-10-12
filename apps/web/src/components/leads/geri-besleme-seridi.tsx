'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { META_UYGUNLUK_EKSIK_ADI, type GeriBeslemeAyari } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { degisimMetni, seritGorunumu, type AyarSonucu } from '@/lib/geri-besleme';

/**
 * ═══ "SONUÇLARI META'YA BİLDİR" ŞERİDİ + AYAR PENCERESİ (MIMARI § 9) ═══
 *
 * Şerit liste üstünde; pencere AYNI SAYFADA (ayrı sayfa değil: şablon
 * düzenlemesinin ayrı sayfada durmasının hata ürettiği ders, CLAUDE.md).
 *
 * PENCERE AÇILINCA seçenekler istenir (`secenekler=evet`): sayfa her
 * yüklendiğinde Meta'dan piksel listesi çekmek kota harcardı. Dört hâl ayrı:
 * yükleniyor, hata (sunucunun cümlesi), seçenek yok + nedeni, dolu.
 *
 * AÇMAK BİR KARAR: veri kümesi önden dolu gelir (hazırlığın pikseli) ama
 * kayıt kullanıcının onayıyla; aydınlatma onayı işaretlenmeden "Aç" kapalı.
 * Veri kümesi değişirse uyarı: Meta öğrenmeye baştan başlıyor.
 *
 * DOM'DAN ÇIKMIYOR: kapalıyken `invisible`; geçiş hareket azaltma
 * tercihinde kapalı (tasarım kuralı).
 */
type Pencere =
  | { hal: 'kapali' }
  | { hal: 'yukleniyor' }
  | { hal: 'hata'; mesaj: string }
  | { hal: 'hazir'; ayar: GeriBeslemeAyari };

export function GeriBeslemeSeridi({
  clientId,
  sonuc,
  canManage,
}: {
  clientId: string;
  sonuc: AyarSonucu;
  /** `connection.manage`: ayarı yalnız bu izin değiştirebiliyor (MIMARI Ç-10). */
  canManage: boolean;
}) {
  const router = useRouter();
  const g = seritGorunumu(sonuc);
  const [pencere, setPencere] = useState<Pencere>({ hal: 'kapali' });
  const [dataset, setDataset] = useState<string>('');
  const [onay, setOnay] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);
  const kapatRef = useRef<HTMLButtonElement>(null);
  const acik = pencere.hal !== 'kapali';

  async function ac(): Promise<void> {
    setPencere({ hal: 'yukleniyor' });
    setHata(null);
    try {
      const a = await apiFetch<GeriBeslemeAyari>(`/geri-besleme/ayar?clientId=${clientId}&secenekler=evet`);
      setPencere({ hal: 'hazir', ayar: a });
      setDataset(a.datasetId ?? a.secenekler.find((s) => s.varsayilan)?.id ?? '');
      setOnay(false);
    } catch (e) {
      // HATA YUTULMUYOR: "seçenek yok" ile "okuyamadık" farklı işler.
      setPencere({ hal: 'hata', mesaj: e instanceof ApiRequestError ? e.message : 'Ayar okunamadı.' });
    }
  }

  useEffect(() => {
    if (!acik) return;
    requestAnimationFrame(() => kapatRef.current?.focus());
    const tus = (e: KeyboardEvent) => e.key === 'Escape' && !kaydediliyor && setPencere({ hal: 'kapali' });
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [acik, kaydediliyor]);

  async function kaydet(etkin: boolean): Promise<void> {
    setKaydediliyor(true);
    setHata(null);
    try {
      const r = await apiFetch<GeriBeslemeAyari & { degisim?: Parameters<typeof degisimMetni>[0] }>('/geri-besleme/ayar', {
        method: 'PUT',
        // Açık ayarın yeniden kaydında onay zaten alınmış (sunucu ilk onayı koruyor).
        body: JSON.stringify({
          clientId,
          platform: 'meta',
          etkin,
          datasetId: etkin ? dataset || null : null,
          aydinlatmaOnayi: etkin ? (ayar?.etkin === true || onay) : false,
        }),
      });
      setBilgi(degisimMetni(r.degisim) ?? (etkin ? 'Kaydedildi.' : 'Kapatıldı.'));
      setPencere({ hal: 'kapali' });
      router.refresh();
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Kaydedilemedi.');
    } finally {
      setKaydediliyor(false);
    }
  }

  async function kontrolEt(): Promise<void> {
    setKaydediliyor(true);
    setHata(null);
    try {
      const a = await apiFetch<GeriBeslemeAyari>('/geri-besleme/ayar/kontrol', {
        method: 'POST',
        body: JSON.stringify({ clientId, platform: 'meta' }),
      });
      // Sunucu ayarı seçenekleriyle döndürüyor; `crm` seçenek satırında.
      setPencere({ hal: 'hazir', ayar: a });
      router.refresh();
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Meta’ya sorulamadı.');
    } finally {
      setKaydediliyor(false);
    }
  }

  const ayar = pencere.hal === 'hazir' ? pencere.ayar : null;
  const secili = ayar?.secenekler.find((s) => s.id === dataset) ?? null;
  const degisecek = !!ayar?.etkin && !!ayar.datasetId && dataset !== '' && dataset !== ayar.datasetId;

  return (
    <>
      <section
        aria-label="Meta’ya bildirim"
        className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-surface px-4 py-3 ${g.ton === 'sorun' ? 'border-danger/40' : 'border-line'}`}
      >
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${g.ton === 'sorun' ? 'text-danger-strong' : 'text-ink'}`}>{g.baslik}</p>
          <p className="mt-0.5 break-words text-xs text-ink-muted">{g.alt}</p>
          {bilgi && (
            <p role="status" className="mt-1 text-xs font-medium text-ink">
              {bilgi}
            </p>
          )}
        </div>
        {g.eylem && canManage && (
          <button
            type="button"
            onClick={() => void ac()}
            className={
              g.eylem === 'ac'
                ? 'rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white'
                : 'rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-sunken'
            }
          >
            {g.eylem === 'ac' ? 'Aç' : 'Ayarlar'}
          </button>
        )}
        {g.eylem && !canManage && <p className="text-[11px] text-ink-muted">Ayarı bağlantı yönetme yetkisi olan kişi değiştirebilir.</p>}
      </section>

      <div
        className={`fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 transition-opacity duration-200 motion-reduce:transition-none sm:items-center ${acik ? 'visible opacity-100' : 'invisible opacity-0'}`}
        aria-hidden={!acik}
        onClick={(e) => e.target === e.currentTarget && !kaydediliyor && setPencere({ hal: 'kapali' })}
      >
        <div role="dialog" aria-modal="true" aria-labelledby="gb-baslik" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-line bg-surface p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 id="gb-baslik" className="text-base font-semibold text-ink">
              Sonuçları Meta’ya bildir
            </h2>
            <button ref={kapatRef} type="button" onClick={() => setPencere({ hal: 'kapali' })} disabled={kaydediliyor} className="rounded px-1.5 text-sm text-ink-muted hover:text-ink">
              Kapat
            </button>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            İşaretlediğin sonuçlar Meta’ya gider. Kişinin adı, telefonu ve e-postası gitmez; yalnız Meta’nın kendi form kimliği gider.
          </p>

          {pencere.hal === 'yukleniyor' && <p className="mt-4 text-sm text-ink-muted">Meta’daki pikseller okunuyor…</p>}
          {pencere.hal === 'hata' && (
            <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger-strong ring-1 ring-inset ring-danger/30">
              {pencere.mesaj}
            </p>
          )}

          {ayar && (
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-xs font-medium text-ink">Veri kümesi (piksel)</span>
                {ayar.secenekler.length > 0 ? (
                  <select
                    value={dataset}
                    onChange={(e) => setDataset(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
                  >
                    <option value="">Seç</option>
                    {ayar.secenekler.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.ad} · {s.id}
                        {s.varsayilan ? ' (kurulumda seçilen)' : ''}
                      </option>
                    ))}
                  </select>
                ) : null}
                {/* SEÇENEK YOKSA NEDENİ: "piksel yok" ile "okuyamadık" ayrı. */}
                {ayar.secenekNotu && <span className="mt-1 block text-[11px] text-ink-muted">{ayar.secenekNotu}</span>}
                {degisecek && <span className="mt-1 block text-[11px] font-medium text-danger-strong">Veri kümesini değiştirirsen Meta öğrenmeye baştan başlar.</span>}
              </label>

              {secili && secili.id === ayar.datasetId && (
                <div className="rounded-lg border border-line px-3 py-2 text-xs">
                  {secili.crm === false && (
                    <p className="text-ink">
                      <b>Meta’da bir adım senin işin:</b> Events Manager’da bu veri kümesinin ayarlarında “Conversion Leads” bölümü kapalı görünüyor. Açılmadan da gönderim yapılır, ama Meta reklamı bu sonuçlara göre optimize edemez.
                    </p>
                  )}
                  {secili.crm === true && <p className="text-ink">Bu veri kümesi Meta’da sonuçları kabul edecek şekilde açık.</p>}
                  {secili.crm === null && <p className="text-ink-muted">Bu veri kümesinin Meta’daki durumu henüz sorulmadı.</p>}
                  <button type="button" onClick={() => void kontrolEt()} disabled={kaydediliyor} className="mt-1.5 text-[11px] font-medium text-ink underline underline-offset-2 disabled:opacity-60">
                    Meta’ya sor
                  </button>
                </div>
              )}

              {ayar.uygunlukEksikleri.length > 0 && (
                <div className="text-xs">
                  <p className="font-medium text-ink">Meta’nın optimize edebilmesi için eksikler</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-ink-muted">
                    {ayar.uygunlukEksikleri.map((e) => (
                      <li key={e}>{META_UYGUNLUK_EKSIK_ADI[e]}</li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[11px] text-ink-muted">Eksikler göndermeye engel değil. Sonuçlar yine Meta’ya gider ve raporlarda görünür.</p>
                </div>
              )}

              {!ayar.etkin && (
                <>
                  <p className="text-xs text-ink-muted">Açınca son 7 günün kayıtları gönderilir; daha eskileri Meta kabul etmiyor. Kaç tanesinin gittiği kaydettikten sonra yazar.</p>
                  <label className="flex items-start gap-2 text-xs text-ink">
                    <input type="checkbox" checked={onay} onChange={(e) => setOnay(e.target.checked)} className="mt-0.5" />
                    <span>Formdaki aydınlatma metni, sonuç bilgisinin Meta’ya iletilmesini kapsıyor.</span>
                  </label>
                </>
              )}

              {hata && (
                <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger-strong ring-1 ring-inset ring-danger/30">
                  {hata}
                </p>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                {ayar.etkin && (
                  <button type="button" onClick={() => void kaydet(false)} disabled={kaydediliyor} className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-60">
                    Kapat ve bildirmeyi durdur
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void kaydet(true)}
                  disabled={kaydediliyor || dataset === '' || (!ayar.etkin && !onay)}
                  className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {kaydediliyor ? 'Kaydediliyor…' : ayar.etkin ? 'Kaydet' : 'Aç ve gönder'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
