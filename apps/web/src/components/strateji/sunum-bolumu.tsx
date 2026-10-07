'use client';

import { useState } from 'react';
import type { PlanOzeti } from '@advetics/shared';
import { Dugme } from '@/components/ui/dugme';
import { Uyari } from '@/components/ui/uyari';
import { donemEtiketi, onayMetni, pdfAdresi, pdfDosyaAdi, sunumNotu, zamanMetni } from './hesap';
import { BolumBasligi, DurumRozeti } from './ortak';

/*
 * İndirmenin dört hâli AYRI: henüz istenmedi / hazırlanıyor / indi (hangi
 * sürüm, ne zaman) / düştü (sunucunun cümlesi).
 */
type IndirmeHali =
  | { tur: 'istenmedi' }
  | { tur: 'hazirlaniyor' }
  | { tur: 'indi'; surum: number; zaman: string }
  | { tur: 'hata'; mesaj: string };

/**
 * ═══ BÖLÜM 4 — SUNUM (PDF MEDYA PLANI) ═══
 *
 * DÜZ BAĞLANTI DEĞİL, `fetch` + dosya. Rapor ekranı PDF'i düz bağlantıyla
 * indiriyor; orada belge veriden üretiliyor ve nadiren düşüyor. Burada ise
 * plan erişimi, durum ve sürüm kontrolleri var: düz bağlantıda bir ret
 * tarayıcının yeni sekmesinde ham JSON olarak açılırdı ve kullanıcı ne
 * olduğunu anlamazdı. Belge küçük (görsel gömülmüyor, MIMARI §6.3), belleğe
 * almanın bedeli yok. Hata, panelde sunucunun cümlesiyle görünüyor.
 *
 * SÜRÜM YAZILI: müşteriye giden belgenin hangi sürüm olduğu, onayın hangi
 * sürüme verildiğiyle karşılaştırılabilmeli. Plan indirmeden sonra
 * değiştiyse bu söyleniyor; eski PDF'i müşteriye göndermek, onun görmediği
 * bir planı onaylatmak olurdu.
 */
export function SunumBolumu({ plan, kaydedilmemis }: { plan: PlanOzeti; kaydedilmemis: boolean }) {
  const [hal, setHal] = useState<IndirmeHali>({ tur: 'istenmedi' });
  const not = sunumNotu(plan.durum);
  const onay = onayMetni(plan.onaylayan);

  async function indir() {
    setHal({ tur: 'hazirlaniyor' });
    // Sürüm İSTEK ANINDA sabitleniyor: indirme sürerken plan değişirse
    // ekrandaki "sürüm N indi" yanlış olmasın.
    const surum = plan.surum;
    try {
      const res = await fetch(pdfAdresi(plan.id), { credentials: 'include' });
      if (!res.ok) {
        let mesaj = `PDF üretilemedi (HTTP ${res.status}).`;
        try {
          const g = (await res.json()) as { message?: string };
          if (g.message) mesaj = g.message;
        } catch {
          // Gövde JSON değil: durum kodlu cümle kalıyor, ekran yine bir neden gösteriyor.
        }
        setHal({ tur: 'hata', mesaj });
        return;
      }
      const blob = await res.blob();
      const adres = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = adres;
      a.download = pdfDosyaAdi(plan.donem, surum);
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Tarayıcı indirmeyi başlattıktan sonra bırak; hemen bırakmak bazı
      // tarayıcılarda indirmeyi iptal ediyor.
      window.setTimeout(() => URL.revokeObjectURL(adres), 10_000);
      setHal({ tur: 'indi', surum, zaman: new Date().toISOString() });
    } catch {
      setHal({ tur: 'hata', mesaj: 'Sunucuya ulaşılamadı.' });
    }
  }

  return (
    <section aria-labelledby="sunum-baslik" className="space-y-4">
      <BolumBasligi
        id="sunum-baslik"
        baslik="Sunum"
        aciklama="Planın müşteriye gönderilecek PDF hâli: bütçe dağılımı, kitle ve kreatif, seçili kelimeler."
      />

      <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-ink-muted">Dönem</dt>
            <dd className="font-semibold text-ink">{donemEtiketi(plan.donem)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Belgenin sürümü</dt>
            <dd className="font-semibold tabular-nums text-ink">Sürüm {plan.surum}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Durum</dt>
            <dd>
              <DurumRozeti durum={plan.durum} />
            </dd>
          </div>
        </dl>
        {onay && <p className="text-sm font-medium text-ok-strong">{onay}</p>}

        <Uyari ton={not.ton}>{not.metin}</Uyari>
        {kaydedilmemis && (
          <p className="text-sm text-warn-strong">Kaydedilmemiş değişiklik var. PDF yalnız kaydedilmiş hâli taşır.</p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Dugme onClick={() => void indir()} bekliyor={hal.tur === 'hazirlaniyor'}>
            PDF indir
          </Dugme>
          {hal.tur === 'hazirlaniyor' && (
            <span className="text-sm text-ink-muted" role="status">
              PDF hazırlanıyor…
            </span>
          )}
          {hal.tur === 'indi' && (
            <span className="text-sm text-ink-muted" role="status">
              Sürüm {hal.surum} indirildi · {zamanMetni(hal.zaman)}
            </span>
          )}
        </div>
        {hal.tur === 'indi' && hal.surum !== plan.surum && (
          <Uyari ton="uyari">
            İndirdiğin PDF sürüm {hal.surum}; plan şimdi sürüm {plan.surum}. Göndermeden önce yeniden indir.
          </Uyari>
        )}
        {hal.tur === 'hata' && (
          <Uyari ton="tehlike" baslik="PDF indirilemedi.">
            {hal.mesaj}
          </Uyari>
        )}
      </div>
    </section>
  );
}
