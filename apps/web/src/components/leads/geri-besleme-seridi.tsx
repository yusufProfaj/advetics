'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { META_UYGUNLUK_EKSIK_ADI, type GeriBeslemeAyari } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { degisimMetni, seritGorunumu, type AyarSonucu } from '@/lib/geri-besleme';
import { Alan, Secim } from '@/components/ui/alan';
import { Dugme } from '@/components/ui/dugme';
import { HataDurumu, Serit, Yukleniyor } from '@/components/ui/hal';
import { YanPanel } from '@/components/ui/pencere';
import { useDil, useSozluk } from '@/dil/saglayici';
import { leadsSozlugu } from '@/dil/sozlukler/leads';

/**
 * ═══ "SONUÇLARI META'YA BİLDİR" ŞERİDİ + AYAR YAN PANELİ (MIMARI § 9) ═══
 *
 * Şerit liste üstünde; ayar AYNI SAYFADA, yan panelde (ayrı sayfa değil: şablon
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
 * YAN PANEL (`YanPanel`): DOM'dan çıkmıyor, kapalıyken `invisible` ve
 * `inert`; Esc, odak tuzağı ve hareket azaltma ortak bileşende.
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
  const { dil } = useDil();
  const d = useSozluk(leadsSozlugu).ayar;
  const g = seritGorunumu(sonuc, dil);
  const [pencere, setPencere] = useState<Pencere>({ hal: 'kapali' });
  const [dataset, setDataset] = useState<string>('');
  const [onay, setOnay] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);
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
      setPencere({ hal: 'hata', mesaj: e instanceof ApiRequestError ? e.message : d.okunamadi });
    }
  }

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
      setBilgi(degisimMetni(r.degisim, dil) ?? (etkin ? d.kaydedildi : d.kapatildi));
      setPencere({ hal: 'kapali' });
      router.refresh();
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : d.kaydedilemedi);
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
      setHata(e instanceof ApiRequestError ? e.message : d.metayaSorulamadi);
    } finally {
      setKaydediliyor(false);
    }
  }

  const ayar = pencere.hal === 'hazir' ? pencere.ayar : null;
  const secili = ayar?.secenekler.find((s) => s.id === dataset) ?? null;
  const degisecek = !!ayar?.etkin && !!ayar.datasetId && dataset !== '' && dataset !== ayar.datasetId;

  return (
    <>
      <Serit
        ton={g.ton === 'sorun' ? 'hata' : 'bilgi'}
        baslik={g.baslik}
        eylemler={
          g.eylem && canManage ? (
            <Dugme ton={g.eylem === 'ac' ? 'koyu' : 'ikincil'} boyut="kucuk" onClick={() => void ac()}>
              {g.eylem === 'ac' ? d.ac : d.ayarlar}
            </Dugme>
          ) : g.eylem ? (
            <small className="text-12 text-ink-muted">{d.yetkiYok}</small>
          ) : undefined
        }
      >
        <span className="break-words">{g.alt}</span>
        {bilgi && (
          <span role="status" className="mt-1 block font-semibold text-ink">
            {bilgi}
          </span>
        )}
      </Serit>

      {/*
        AYAR YAN PANELDE (onaylı taslak, BILESENLER § 3 "Düzenleme YanPanel'de"):
        Esc, odak tuzağı ve DOM'da kalma ortak bileşenden. Kaydederken
        kapatılamıyor: yarım kalan bir istek panelin dışında sessizce bitip
        sonucunu kimseye göstermezdi.
      */}
      <YanPanel
        acik={acik}
        onKapat={() => !kaydediliyor && setPencere({ hal: 'kapali' })}
        baslik={d.baslik}
        genislik={440}
        altEylemler={
          ayar ? (
            <>
              {ayar.etkin && (
                <Dugme ton="tehlike" onClick={() => void kaydet(false)} disabled={kaydediliyor} className="mr-auto">
                  {d.kapatDurdur}
                </Dugme>
              )}
              <Dugme ton="ikincil" onClick={() => setPencere({ hal: 'kapali' })} disabled={kaydediliyor}>
                {d.vazgec}
              </Dugme>
              <Dugme
                onClick={() => void kaydet(true)}
                bekliyor={kaydediliyor}
                disabled={dataset === '' || (!ayar.etkin && !onay)}
              >
                {ayar.etkin ? d.kaydet : d.acGonder}
              </Dugme>
            </>
          ) : (
            <Dugme ton="ikincil" onClick={() => setPencere({ hal: 'kapali' })}>
              {d.kapat}
            </Dugme>
          )
        }
      >
        <p className="m-0 text-13 text-ink-muted">
          {d.giris}
        </p>

        {pencere.hal === 'yukleniyor' && <Yukleniyor etiket={d.pikselOkunuyor} />}
        {pencere.hal === 'hata' && <HataDurumu baslik={d.okunamadi} mesaj={pencere.mesaj} onTekrar={() => void ac()} />}

        {ayar && (
          <>
            <Alan
              etiket={d.veriKumesi}
              /* SEÇENEK YOKSA NEDENİ: "piksel yok" ile "okuyamadık" ayrı. */
              ipucu={ayar.secenekNotu ?? undefined}
              hata={degisecek ? d.kumeDegisirse : undefined}
            >
              {(id, aciklamaId, hatali) =>
                ayar.secenekler.length > 0 ? (
                  <Secim id={id} aria-describedby={aciklamaId} hatali={hatali} value={dataset} onChange={(e) => setDataset(e.target.value)}>
                    <option value="">{d.sec}</option>
                    {ayar.secenekler.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.ad} · {s.id}
                        {s.varsayilan ? d.kurulumdaSecilen : ''}
                      </option>
                    ))}
                  </Secim>
                ) : (
                  <p id={id} className="m-0 text-13 text-ink-muted">
                    {d.kumeYok}
                  </p>
                )
              }
            </Alan>

            {secili && secili.id === ayar.datasetId && (
              <div className="grid gap-1.5 rounded-alan border border-line px-3 py-2.5 text-13">
                {secili.crm === false && (
                  <p className="m-0 text-ink">
                    <b>{d.crmKapaliBas}</b>
                    {d.crmKapali}
                  </p>
                )}
                {secili.crm === true && <p className="m-0 text-ink">{d.crmAcik}</p>}
                {secili.crm === null && <p className="m-0 text-ink-muted">{d.crmSorulmadi}</p>}
                <Dugme ton="ikincil" boyut="kucuk" onClick={() => void kontrolEt()} disabled={kaydediliyor} className="justify-self-start">
                  {d.metayaSor}
                </Dugme>
              </div>
            )}

            {ayar.uygunlukEksikleri.length > 0 && (
              <div className="grid gap-1 text-13">
                <p className="m-0 font-semibold text-ink">{d.eksiklerBaslik}</p>
                <ul className="m-0 list-disc pl-4 text-ink-muted">
                  {ayar.uygunlukEksikleri.map((e) => (
                    <li key={e}>{META_UYGUNLUK_EKSIK_ADI[e]}</li>
                  ))}
                </ul>
                <p className="m-0 text-12 text-ink-muted">{d.eksiklerNot}</p>
              </div>
            )}

            {!ayar.etkin && (
              <>
                <p className="m-0 text-13 text-ink-muted">{d.acinca}</p>
                <label className="flex items-start gap-2 text-13 text-ink">
                  <input type="checkbox" checked={onay} onChange={(e) => setOnay(e.target.checked)} className="mt-0.5 accent-[var(--text)]" />
                  <span>{d.onay}</span>
                </label>
              </>
            )}

            {hata && (
              <Serit ton="hata" baslik={d.kaydedilemediBaslik}>
                {hata}
              </Serit>
            )}
          </>
        )}
      </YanPanel>
    </>
  );
}
