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
  const g = seritGorunumu(sonuc);
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
      setPencere({ hal: 'hata', mesaj: e instanceof ApiRequestError ? e.message : 'Ayar okunamadı.' });
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
      <Serit
        ton={g.ton === 'sorun' ? 'hata' : 'bilgi'}
        baslik={g.baslik}
        eylemler={
          g.eylem && canManage ? (
            <Dugme ton={g.eylem === 'ac' ? 'koyu' : 'ikincil'} boyut="kucuk" onClick={() => void ac()}>
              {g.eylem === 'ac' ? 'Aç' : 'Ayarlar'}
            </Dugme>
          ) : g.eylem ? (
            <small className="text-12 text-ink-muted">Ayarı bağlantı yönetme yetkisi olan kişi değiştirebilir.</small>
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
        baslik="Sonuçları Meta’ya bildir"
        genislik={440}
        altEylemler={
          ayar ? (
            <>
              {ayar.etkin && (
                <Dugme ton="tehlike" onClick={() => void kaydet(false)} disabled={kaydediliyor} className="mr-auto">
                  Kapat ve bildirmeyi durdur
                </Dugme>
              )}
              <Dugme ton="ikincil" onClick={() => setPencere({ hal: 'kapali' })} disabled={kaydediliyor}>
                Vazgeç
              </Dugme>
              <Dugme
                onClick={() => void kaydet(true)}
                bekliyor={kaydediliyor}
                disabled={dataset === '' || (!ayar.etkin && !onay)}
              >
                {ayar.etkin ? 'Kaydet' : 'Aç ve gönder'}
              </Dugme>
            </>
          ) : (
            <Dugme ton="ikincil" onClick={() => setPencere({ hal: 'kapali' })}>
              Kapat
            </Dugme>
          )
        }
      >
        <p className="m-0 text-13 text-ink-muted">
          İşaretlediğin sonuçlar Meta’ya gider. Kişinin adı, telefonu ve e-postası gitmez; yalnız Meta’nın kendi form kimliği gider.
        </p>

        {pencere.hal === 'yukleniyor' && <Yukleniyor etiket="Meta’daki pikseller okunuyor" />}
        {pencere.hal === 'hata' && <HataDurumu baslik="Ayar okunamadı" mesaj={pencere.mesaj} onTekrar={() => void ac()} />}

        {ayar && (
          <>
            <Alan
              etiket="Veri kümesi (piksel)"
              /* SEÇENEK YOKSA NEDENİ: "piksel yok" ile "okuyamadık" ayrı. */
              ipucu={ayar.secenekNotu ?? undefined}
              hata={degisecek ? 'Veri kümesini değiştirirsen Meta öğrenmeye baştan başlar.' : undefined}
            >
              {(id, aciklamaId, hatali) =>
                ayar.secenekler.length > 0 ? (
                  <Secim id={id} aria-describedby={aciklamaId} hatali={hatali} value={dataset} onChange={(e) => setDataset(e.target.value)}>
                    <option value="">Seç</option>
                    {ayar.secenekler.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.ad} · {s.id}
                        {s.varsayilan ? ' (kurulumda seçilen)' : ''}
                      </option>
                    ))}
                  </Secim>
                ) : (
                  <p id={id} className="m-0 text-13 text-ink-muted">
                    Seçilebilecek veri kümesi yok.
                  </p>
                )
              }
            </Alan>

            {secili && secili.id === ayar.datasetId && (
              <div className="grid gap-1.5 rounded-alan border border-line px-3 py-2.5 text-13">
                {secili.crm === false && (
                  <p className="m-0 text-ink">
                    <b>Meta’da bir adım senin işin:</b> Events Manager’da bu veri kümesinin ayarlarında “Conversion Leads” bölümü kapalı görünüyor. Açılmadan da gönderim yapılır, ama Meta reklamı bu sonuçlara göre optimize edemez.
                  </p>
                )}
                {secili.crm === true && <p className="m-0 text-ink">Bu veri kümesi Meta’da sonuçları kabul edecek şekilde açık.</p>}
                {secili.crm === null && <p className="m-0 text-ink-muted">Bu veri kümesinin Meta’daki durumu henüz sorulmadı.</p>}
                <Dugme ton="ikincil" boyut="kucuk" onClick={() => void kontrolEt()} disabled={kaydediliyor} className="justify-self-start">
                  Meta’ya sor
                </Dugme>
              </div>
            )}

            {ayar.uygunlukEksikleri.length > 0 && (
              <div className="grid gap-1 text-13">
                <p className="m-0 font-semibold text-ink">Meta’nın optimize edebilmesi için eksikler</p>
                <ul className="m-0 list-disc pl-4 text-ink-muted">
                  {ayar.uygunlukEksikleri.map((e) => (
                    <li key={e}>{META_UYGUNLUK_EKSIK_ADI[e]}</li>
                  ))}
                </ul>
                <p className="m-0 text-12 text-ink-muted">Eksikler göndermeye engel değil. Sonuçlar yine Meta’ya gider ve raporlarda görünür.</p>
              </div>
            )}

            {!ayar.etkin && (
              <>
                <p className="m-0 text-13 text-ink-muted">Açınca son 7 günün kayıtları gönderilir; daha eskileri Meta kabul etmiyor. Kaç tanesinin gittiği kaydettikten sonra yazar.</p>
                <label className="flex items-start gap-2 text-13 text-ink">
                  <input type="checkbox" checked={onay} onChange={(e) => setOnay(e.target.checked)} className="mt-0.5 accent-[var(--text)]" />
                  <span>Formdaki aydınlatma metni, sonuç bilgisinin Meta’ya iletilmesini kapsıyor.</span>
                </label>
              </>
            )}

            {hata && (
              <Serit ton="hata" baslik="Kaydedilemedi">
                {hata}
              </Serit>
            )}
          </>
        )}
      </YanPanel>
    </>
  );
}
