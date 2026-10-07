'use client';

import { useEffect, useState } from 'react';
import { OZEL_KATEGORILER, OZEL_KATEGORI_ETIKETLERI, type OzelKategori, type PilotWorkspaceBeyani } from '@advetics/shared';
import { apiFetch } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import { Dugme } from '@/components/ui/dugme';
import { Uyari } from '@/components/ui/uyari';
import { SEKTOR_ETIKETI, beyanBaslangici, beyanIstegi, okumaHatasi, pilotUcAdresi, type BeyanSecimi, type Hal } from './hesap';

/**
 * ═══ REKLAM BEYANI — MARKA MERKEZİ BÖLÜMÜ ═══
 *
 * Özel reklam kategorisi ve sektör, workspace başına BİR KEZ (Ç-2). Ayrı
 * sayfa değil Marka Merkezi bölümü: workspace'e geçen kullanıcı doldurulacak
 * her şeyi tek kapıdan yapıyor (CLAUDE.md "KURUMSAL KİMLİK VE BASE").
 *
 * HİÇBİR SEÇENEK ÖNCEDEN SEÇİLİ GELMEZ. Bu bir yasal beyan; "Hayır" önceden
 * işaretli gelseydi bakmadan kaydeden ajans beyan vermiş sayılırdı ve konut
 * reklamı kısıtsız yayınlanırdı. Sunucunun `null`ı (hiç cevaplanmadı) ile
 * `[]`ı ("hiçbiri") ekranda da ayrı (`beyanBaslangici`).
 */
export function BeyanBolumu({ clientId }: { clientId: string }) {
  const [oku, setOku] = useState<Hal<PilotWorkspaceBeyani>>({ tur: 'yukleniyor' });
  const [tazele, setTazele] = useState(0);

  useEffect(() => {
    let iptal = false;
    setOku({ tur: 'yukleniyor' });
    apiFetch<PilotWorkspaceBeyani>(baglanti(pilotUcAdresi('/pilot/workspace-beyani'), { clientId })).then(
      (v) => !iptal && setOku({ tur: 'tamam', v }),
      (e: unknown) => !iptal && setOku({ tur: 'hata', mesaj: okumaHatasi(e) }),
    );
    return () => {
      iptal = true;
    };
  }, [clientId, tazele]);

  if (oku.tur === 'yukleniyor' || oku.tur === 'istenmedi') return <p className="text-sm text-ink-muted">Beyan okunuyor.</p>;
  if (oku.tur === 'hata') {
    return (
      <Uyari ton="tehlike" baslik="Beyan alınamadı." eylem={<Dugme ton="ikincil" boyut="kucuk" onClick={() => setTazele((n) => n + 1)}>Tekrar dene</Dugme>}>
        {oku.mesaj}
      </Uyari>
    );
  }
  // `key`: kayıttan sonra form sunucunun yeni hâliyle sıfırdan kurulsun.
  return <BeyanFormu key={`${oku.v.beyan?.zaman ?? 'yok'}:${tazele}`} clientId={clientId} beyan={oku.v} kaydedildi={() => setTazele((n) => n + 1)} />;
}

function BeyanFormu({ clientId, beyan, kaydedildi }: { clientId: string; beyan: PilotWorkspaceBeyani; kaydedildi: () => void }) {
  const [secim, setSecim] = useState<BeyanSecimi>(beyanBaslangici(beyan));
  const [sektor, setSektor] = useState(beyan.sektor ?? '');
  const [hal, setHal] = useState<{ tur: 'bos' } | { tur: 'suruyor' } | { tur: 'hata'; mesaj: string }>({ tur: 'bos' });
  const yazabilir = beyan.duzenleyebilir;
  const evet = Array.isArray(secim);

  function kategoriDegistir(k: OzelKategori) {
    const liste = Array.isArray(secim) ? secim : [];
    setSecim(liste.includes(k) ? liste.filter((x) => x !== k) : OZEL_KATEGORILER.filter((x) => x === k || liste.includes(x)));
  }

  async function kaydet() {
    const istek = beyanIstegi(clientId, secim, sektor);
    if (istek.tur === 'hata') return setHal({ tur: 'hata', mesaj: istek.mesaj });
    setHal({ tur: 'suruyor' });
    try {
      await apiFetch(pilotUcAdresi('/pilot/workspace-beyani'), { method: 'PUT', body: JSON.stringify(istek.govde) });
      setHal({ tur: 'bos' });
      kaydedildi();
    } catch (e) {
      setHal({ tur: 'hata', mesaj: okumaHatasi(e) });
    }
  }

  const secenek = (secili: boolean) =>
    `h-9 rounded-full border px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
      secili ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-ink hover:bg-surface-muted'
    }`;

  return (
    <div className="space-y-4">
      {beyan.taninmayanKategoriler.length > 0 && (
        <Uyari ton="uyari" baslik="Kayıtlı beyan artık tanınmayan bir kategori taşıyor. Yeniden beyan et.">
          {beyan.taninmayanKategoriler.join(', ')}
        </Uyari>
      )}
      {beyan.ozelKategoriler === null && beyan.taninmayanKategoriler.length === 0 && (
        <Uyari ton="uyari" baslik="Özel kategori sorusu cevaplanmadı. Cevaplanana kadar Meta kampanyaları kurulmaz." />
      )}

      <section className="rounded-xl border border-line bg-surface p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">1 / 2 · Özel reklam kategorisi</p>
        <h3 className="mt-1 font-baslik text-base font-semibold text-ink">Konut, iş ilanı, kredi ya da siyaset reklamı veriyor musunuz?</h3>
        <p className="mt-1 text-sm text-ink-muted">Bunu senin yerine cevaplayamam, yasal bir beyan. Bir kez soruyorum, her reklama buradan gider.</p>
        <div role="group" aria-label="Özel kategori" className="mt-3 flex flex-wrap gap-2">
          <button type="button" aria-pressed={secim === 'hicbiri'} disabled={!yazabilir} onClick={() => setSecim('hicbiri')} className={secenek(secim === 'hicbiri')}>
            Hayır
          </button>
          <button type="button" aria-pressed={evet} disabled={!yazabilir} onClick={() => setSecim(Array.isArray(secim) ? secim : [])} className={secenek(evet)}>
            Evet, hangisi olduğunu seçeceğim
          </button>
        </div>
        {evet && (
          <div role="group" aria-label="Kategoriler" className="mt-3 flex flex-wrap gap-2">
            {OZEL_KATEGORILER.map((k) => {
              const secili = Array.isArray(secim) && secim.includes(k);
              return (
                <button key={k} type="button" aria-pressed={secili} disabled={!yazabilir} onClick={() => kategoriDegistir(k)} className={secenek(secili)}>
                  {OZEL_KATEGORI_ETIKETLERI[k]}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">2 / 2 · Sektör</p>
        <label htmlFor="beyan-sektor" className="mt-1 block font-baslik text-base font-semibold text-ink">
          Bu workspace hangi işi yapıyor?
        </label>
        <p className="mt-1 text-sm text-ink-muted">Sektöre özgü uyum kuralları bundan seçiliyor.</p>
        <input
          id="beyan-sektor"
          value={sektor}
          onChange={(e) => setSektor(e.target.value)}
          disabled={!yazabilir}
          maxLength={120}
          placeholder="Örnek: Konut satışı, diş kliniği, e-ticaret"
          className="mt-3 h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink"
        />
        {beyan.sektorEslesmesi && (
          <p className="mt-2 text-xs text-ink-muted">
            Uyum kontrolü şöyle okudu: {beyan.sektorEslesmesi.length > 0 ? beyan.sektorEslesmesi.map((s) => SEKTOR_ETIKETI[s]).join(', ') : 'tanınmadı'}
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-muted">
          {beyan.beyan ? `Son beyan: ${beyan.beyan.kim ?? 'Bilinmeyen kişi'} · ${new Date(beyan.beyan.zaman).toLocaleDateString('tr-TR')}` : 'Henüz beyan yok.'}
        </p>
        {yazabilir ? (
          <Dugme onClick={() => void kaydet()} bekliyor={hal.tur === 'suruyor'}>
            Beyanı kaydet
          </Dugme>
        ) : (
          <p className="text-xs text-ink-muted">Beyanı değiştirme yetkin yok.</p>
        )}
      </div>
      {hal.tur === 'hata' && (
        <p role="alert" className="text-sm text-danger-strong">
          {hal.mesaj}
        </p>
      )}
    </div>
  );
}
