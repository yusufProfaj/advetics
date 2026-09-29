'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  KITLE_SINIRLARI,
  kitleOzeti,
  kitleSablonuInputSchema,
  type GeoLocationOption,
  type KitleIlgi,
  type KitleKonumu,
  type KitleOnerisi,
  type KitleSablonuListesi,
  type KitleSablonuRecord,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Dugme } from '@/components/ui/dugme';
import { Uyari } from '@/components/ui/uyari';
import { HedeflemeSecici } from '@/components/autoboost/hedefleme-secici';
import { IlgiSecici, kitleBuyuklugu } from './ilgi-secici';

/**
 * ═══ MARKA MERKEZİ → KİTLELER (Bölüm 4) ═══
 *
 * Workspace'in adlı hedeflemeleri. Hızlı Reklam VARSAYILAN şablonu
 * kendiliğinden uyguluyor; kullanıcı her reklamda konum ve yaşı yeniden
 * seçmiyor.
 *
 * YALNIZCA META. Konumlar Meta'nın coğrafi aramasından geliyor ve Google'ın
 * konum kimlikleri ayrı bir uzay; ekran bunu söylüyor.
 *
 * DÖRT HÂL AYRI (CLAUDE.md, `.catch(() => setX([]))` yasağı): yükleniyor,
 * çağrı düştü, şablon yok, şablonlar geldi.
 */
type Durum =
  | { tur: 'yukleniyor' }
  | { tur: 'hata'; mesaj: string }
  | { tur: 'hazir'; veri: KitleSablonuListesi };

interface Form {
  id: string | null;
  name: string;
  locations: KitleKonumu[];
  ageMin: number;
  ageMax: number;
  genders: 'all' | 'male' | 'female';
  interests: KitleIlgi[];
}

const BOS_FORM: Form = {
  id: null,
  name: '',
  locations: [],
  ageMin: 18,
  ageMax: 65,
  genders: 'all',
  interests: [],
};
const YASLAR = Array.from({ length: 48 }, (_, i) => 18 + i);
const girdi =
  'w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand';

export function KitlelerBolumu({ clientId, yazabilir }: { clientId: string; yazabilir: boolean }) {
  const [durum, setDurum] = useState<Durum>({ tur: 'yukleniyor' });
  const [form, setForm] = useState<Form | null>(null);
  const [silinecek, setSilinecek] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const yukle = useCallback(async () => {
    try {
      const veri = await apiFetch<KitleSablonuListesi>(`/audience-templates?clientId=${clientId}`);
      setDurum({ tur: 'hazir', veri });
    } catch (err) {
      setDurum({ tur: 'hata', mesaj: err instanceof ApiRequestError ? err.message : 'Kitleler yüklenemedi.' });
    }
  }, [clientId]);

  useEffect(() => {
    setDurum({ tur: 'yukleniyor' });
    void yukle();
  }, [yukle]);

  async function islem(fn: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setHata(null);
    try {
      await fn();
      await yukle();
      return true;
    } catch (err) {
      // SUNUCUNUN KENDİ CÜMLESİ: "bu adla şablon var", "ülke + il" gibi.
      setHata(err instanceof ApiRequestError ? err.message : 'İşlem tamamlanamadı.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function kaydet(): Promise<void> {
    if (!form) return;
    const govde = {
      clientId,
      name: form.name,
      locations: form.locations,
      ageMin: form.ageMin,
      ageMax: form.ageMax,
      genders: form.genders,
      interests: form.interests,
    };
    // Sunucuyla AYNI şema: "Türkiye + İzmir" kaydederken reddediliyor, yayında değil.
    const k = kitleSablonuInputSchema.safeParse(govde);
    if (!k.success) {
      setHata(k.error.issues[0]?.message ?? 'Alanlardan biri geçersiz.');
      return;
    }
    const tamam = await islem(() =>
      apiFetch(form.id ? `/audience-templates/${form.id}` : '/audience-templates', {
        method: form.id ? 'PUT' : 'POST',
        body: JSON.stringify(govde),
      }),
    );
    if (tamam) setForm(null);
  }

  return (
    <section id="kitleler" aria-labelledby="kitleler-baslik" className="scroll-mt-24">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="kitleler-baslik" className="text-base font-semibold text-ink">
            Kitleler
          </h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            Kime gösterileceği: konum, yaş, cinsiyet. Varsayılan kitle Hızlı Reklam’da kendiliğinden
            seçilir. Şimdilik yalnızca Meta reklamlarında kullanılır.
          </p>
        </div>
        {yazabilir && !form && durum.tur === 'hazir' && (
          <Dugme ton="ikincil" boyut="kucuk" onClick={() => setForm(BOS_FORM)}>
            Yeni kitle
          </Dugme>
        )}
      </div>

      {hata && (
        <div className="mb-3">
          <Uyari ton="tehlike">{hata}</Uyari>
        </div>
      )}

      {form && (
        <KitleFormu
          clientId={clientId}
          form={form}
          setForm={setForm}
          busy={busy}
          kaydet={() => void kaydet()}
          vazgec={() => {
            setForm(null);
            setHata(null);
          }}
        />
      )}

      {durum.tur === 'yukleniyor' && <p className="text-sm text-ink-muted">Kitleler yükleniyor…</p>}
      {durum.tur === 'hata' && <Uyari ton="tehlike" baslik="Kitleler yüklenemedi.">{durum.mesaj}</Uyari>}
      {durum.tur === 'hazir' && durum.veri.items.length === 0 && !form && (
        <p className="rounded-xl border border-dashed border-line bg-surface p-6 text-sm text-ink-muted">
          Kayıtlı kitle yok. Kitle olmadan Hızlı Reklam <strong>Türkiye geneli, 18 yaş ve üzeri</strong>{' '}
          gösterir.
        </p>
      )}
      {durum.tur === 'hazir' && durum.veri.items.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {durum.veri.items.map((k) => (
            <KitleSatiri
              key={k.id}
              k={k}
              yazabilir={yazabilir}
              busy={busy}
              silOnayi={silinecek === k.id}
              duzenle={() => setForm(formdan(k))}
              silIste={() => setSilinecek(k.id)}
              silVazgec={() => setSilinecek(null)}
              sil={() =>
                void islem(() =>
                  apiFetch(`/audience-templates/${k.id}?clientId=${clientId}`, { method: 'DELETE' }),
                ).then(() => setSilinecek(null))
              }
              varsayilanYap={() =>
                void islem(() =>
                  apiFetch('/audience-templates/varsayilan', {
                    method: 'PUT',
                    body: JSON.stringify({ clientId, sablonId: k.varsayilan ? null : k.id }),
                  }),
                )
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function formdan(k: KitleSablonuRecord): Form {
  return {
    id: k.id,
    name: k.name,
    locations: k.locations,
    ageMin: k.ageMin,
    ageMax: k.ageMax,
    genders: k.genders,
    interests: k.interests,
  };
}

function KitleSatiri(p: {
  k: KitleSablonuRecord;
  yazabilir: boolean;
  busy: boolean;
  silOnayi: boolean;
  duzenle: () => void;
  silIste: () => void;
  silVazgec: () => void;
  sil: () => void;
  varsayilanYap: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-medium text-ink">
          {p.k.name}
          {p.k.varsayilan && (
            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-strong">
              Varsayılan
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-ink-muted">{kitleOzeti(p.k)}</p>
      </div>
      {p.yazabilir &&
        (p.silOnayi ? (
          // İKİ ADIMLI SİLME (Bölüm 1 deseni): yanlış tıklama geri alınamaz.
          <span className="flex items-center gap-2 text-xs">
            <span className="text-ink-muted">Silinsin mi?</span>
            <Dugme ton="tehlike" boyut="kucuk" onClick={p.sil} bekliyor={p.busy}>
              Sil
            </Dugme>
            <Dugme ton="sade" boyut="kucuk" onClick={p.silVazgec} disabled={p.busy}>
              Vazgeç
            </Dugme>
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <Dugme ton="sade" boyut="kucuk" onClick={p.varsayilanYap} disabled={p.busy}>
              {p.k.varsayilan ? 'Varsayılanı kaldır' : 'Varsayılan yap'}
            </Dugme>
            <Dugme ton="sade" boyut="kucuk" onClick={p.duzenle} disabled={p.busy}>
              Düzenle
            </Dugme>
            <Dugme ton="sade" boyut="kucuk" onClick={p.silIste} disabled={p.busy}>
              Sil
            </Dugme>
          </span>
        ))}
    </li>
  );
}

function KitleFormu(p: {
  clientId: string;
  form: Form;
  setForm: (f: Form) => void;
  busy: boolean;
  kaydet: () => void;
  vazgec: () => void;
}) {
  const f = p.form;
  const degis = (patch: Partial<Form>) => p.setForm({ ...f, ...patch });
  // Seçici `GeoLocationOption` konuşuyor, şablon `KitleKonumu`; ikisi aynı
  // alanları taşıyor, dönüşüm yalnızca adlandırma.
  const secili: GeoLocationOption[] = f.locations.map((l) => ({
    key: l.key,
    type: l.type,
    name: l.label,
    label: l.label,
    countryCode: l.countryCode ?? '',
  }));

  return (
    <div className="mb-3 space-y-4 rounded-xl border border-brand/40 bg-surface p-4">
      <TarifEt clientId={p.clientId} uygula={(o) => degis(o)} />

      <label className="block space-y-1">
        <span className="block text-xs font-medium text-ink">Kitle adı</span>
        <input
          value={f.name}
          onChange={(e) => degis({ name: e.target.value })}
          maxLength={KITLE_SINIRLARI.ad}
          placeholder="Örn. İzmir, 25-45 kadın"
          className={girdi}
        />
      </label>

      <HedeflemeSecici
        clientId={p.clientId}
        lokasyonlar={secili}
        setLokasyonlar={(v) =>
          degis({
            // Arama yalnızca ülke/il/şehir döndürüyor (`searchGeoLocations`
            // location_types); başka bir tür gelirse sunucu şeması reddeder
            // ve sebep ekranda yazar.
            locations: v.map((o) => ({
              key: o.key,
              type: o.type as KitleKonumu['type'],
              label: o.label,
              countryCode: o.countryCode || null,
            })),
          })
        }
        kitleId={null}
        setKitleId={() => undefined}
        kayitliKitle={false}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block space-y-1">
          <span className="block text-xs font-medium text-ink">En küçük yaş</span>
          <select value={f.ageMin} onChange={(e) => degis({ ageMin: Number(e.target.value) })} className={girdi}>
            {YASLAR.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="block text-xs font-medium text-ink">En büyük yaş</span>
          <select value={f.ageMax} onChange={(e) => degis({ ageMax: Number(e.target.value) })} className={girdi}>
            {YASLAR.map((y) => (
              <option key={y} value={y}>
                {y === 65 ? '65 ve üzeri' : y}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="block text-xs font-medium text-ink">Cinsiyet</span>
          <select
            value={f.genders}
            onChange={(e) => degis({ genders: e.target.value as Form['genders'] })}
            className={girdi}
          >
            <option value="all">Tümü</option>
            <option value="female">Kadın</option>
            <option value="male">Erkek</option>
          </select>
        </label>
      </div>

      <IlgiSecici clientId={p.clientId} secili={f.interests} degis={(v) => degis({ interests: v })} />

      <p className="text-xs text-ink-muted">Özet: {kitleOzeti(f)}</p>

      <div className="flex items-center gap-2">
        <Dugme onClick={p.kaydet} bekliyor={p.busy} disabled={!f.name.trim()}>
          Kaydet
        </Dugme>
        <Dugme ton="sade" onClick={p.vazgec} disabled={p.busy}>
          Vazgeç
        </Dugme>
      </div>
    </div>
  );
}

/**
 * ═══ TARİF ET → ÖNERİ ═══
 *
 * Yapay zekâ metni yapılandırıyor, sunucu Meta'nın aramasıyla gerçek
 * kimliklere çözüyor ve sonuç FORMA dolduruluyor — kaydedilmiyor. Kullanıcı
 * ne önerildiğini, neyin bulunamadığını ve neyin Meta'da kurulamadığını
 * görüp düzeltiyor. Önerinin kendisi bir tahmin; kaydeden kullanıcı.
 */
function TarifEt({
  clientId,
  uygula,
}: {
  clientId: string;
  uygula: (o: Pick<Form, 'locations' | 'ageMin' | 'ageMax' | 'genders' | 'interests'>) => void;
}) {
  const [metin, setMetin] = useState('');
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [oneri, setOneri] = useState<KitleOnerisi | null>(null);

  async function oner(): Promise<void> {
    setBusy(true);
    setHata(null);
    try {
      const o = await apiFetch<KitleOnerisi>('/audience-templates/ai-oneri', {
        method: 'POST',
        body: JSON.stringify({ clientId, metin }),
      });
      setOneri(o);
      uygula({
        locations: o.locations,
        ageMin: o.ageMin,
        ageMax: o.ageMax,
        genders: o.genders,
        interests: o.interests.map((i) => ({ id: i.id, name: i.name })),
      });
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : 'Öneri alınamadı.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg bg-surface-sunken p-3">
      <label className="block space-y-1">
        <span className="block text-xs font-medium text-ink">Kitleyi tarif et (isteğe bağlı)</span>
        <textarea
          value={metin}
          onChange={(e) => setMetin(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Örn. İzmir’de lüks araçlarla ilgilenen 30-55 yaş erkekler"
          className={girdi}
        />
      </label>
      <div className="flex items-center gap-2">
        <Dugme ton="ikincil" boyut="kucuk" onClick={() => void oner()} bekliyor={busy} disabled={metin.trim().length < 5}>
          Öner
        </Dugme>
        <span className="text-[11px] text-ink-muted">
          Öneri aşağıdaki alanları doldurur; kaydetmeden önce kontrol et.
        </span>
      </div>
      {hata && <p className="text-[11px] text-danger-strong">{hata}</p>}
      {oneri && (
        <div className="space-y-1 text-[11px]">
          <p className="text-ink-muted">Meta’da arandı: {oneri.hesapAdi}</p>
          {oneri.interests.length > 0 && (
            <ul className="text-ink">
              {oneri.interests.map((i) => (
                <li key={i.id}>
                  “{i.terim}” → {i.name} <span className="text-ink-muted">({kitleBuyuklugu(i)})</span>
                </li>
              ))}
            </ul>
          )}
          {oneri.eslesmeyen.length > 0 && (
            <p className="text-warn-strong">
              Meta’da bulunamadı:{' '}
              {oneri.eslesmeyen.map((e) => `“${e.terim}” (${e.tur === 'konum' ? 'konum' : 'ilgi'})`).join(', ')}
            </p>
          )}
          {oneri.uygulanamayan.length > 0 && (
            <ul className="text-warn-strong">
              {oneri.uygulanamayan.map((u) => (
                <li key={u.ifade}>
                  Uygulanamadı: “{u.ifade}”, {u.sebep}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

