'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiRequestError, apiFetch } from '@/lib/api';

/**
 * YOUTUBE KANALI EKLEME.
 *
 * ═══ NEDEN YAPIŞTIRMA ═══
 *
 * Bağlı kanalları otomatik listelemek YouTube'un OAuth kapsamını gerektiriyor
 * ve o kapsam canlı Google Ads bağlantısının YENİDEN YETKİLENDİRİLMESİ demek —
 * bu projede yeniden yetkilendirme daha önce bağlantıları kopardı. Yapıştırma
 * aynı sonucu API anahtarıyla veriyor.
 *
 * KULLANICI "KANAL KİMLİĞİ" KAVRAMINI BİLMİYOR ve bilmesi de gerekmiyor:
 * adres, @tanıtıcı ya da ham kimlik — hangisi yapıştırılırsa sunucu çözüyor.
 * Çözemediğinde NE YAPACAĞINI söylüyor; "geçersiz" demek kullanıcıyı hatayı
 * kendi yazımında aramaya iter.
 */
export function YouTubeKanalEkle({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [acik, setAcik] = useState(false);
  const [girdi, setGirdi] = useState('');
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<string | null>(null);

  async function ekle(): Promise<void> {
    setBusy(true);
    setHata(null);
    setSonuc(null);
    try {
      const r = await apiFetch<{ title: string; channelId: string }>(
        '/autoboost/youtube/channels',
        { method: 'POST', body: JSON.stringify({ clientId, channelInput: girdi.trim() }) },
      );
      /*
       * ABONELİK ASENKRON TAMAMLANIYOR ve bu kullanıcıya SÖYLENİYOR. Hub bize
       * ayrı bir çağrı yapıp doğrulamayı tamamlıyor; "eklendi" deyip susmak,
       * doğrulama hiç gelmediğinde kullanıcının bunu asla öğrenememesi
       * demekti.
       */
      setSonuc(
        `${r.title} eklendi. Bildirim aboneliği kuruluyor — YouTube'un ` +
          'doğrulaması birkaç saniye sürebilir.',
      );
      setGirdi('');
      router.refresh();
    } catch (err) {
      // Sunucunun mesajı OLDUĞU GİBİ gösteriliyor: içinde ne yapılacağı yazılı.
      setHata(
        err instanceof ApiRequestError ? err.message : 'Kanal eklenemedi.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!acik) {
    return (
      <button
        type="button"
        onClick={() => setAcik(true)}
        className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-sunken"
      >
        YouTube kanalı ekle
      </button>
    );
  }

  return (
    <section className="w-full min-w-0 space-y-3 rounded-xl border border-line bg-surface p-4">
      <header className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">YouTube kanalı ekle</h3>
          <p className="mt-0.5 text-xs text-ink-muted">
            Kanal yayınlandığında videolar onay kuyruğuna düşer.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAcik(false)}
          className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-sunken"
        >
          Kapat
        </button>
      </header>

      <label className="block max-w-lg">
        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-muted">
          Kanal adresi ya da @tanıtıcı
        </span>
        <input
          value={girdi}
          onChange={(e) => setGirdi(e.target.value)}
          placeholder="@kanaladi"
          className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand"
        />
        {/* ÖRNEK GÖSTERİLİYOR: hedef kullanıcı "kanal kimliği" kavramını
            bilmiyor ve neyi yapıştıracağını görmeli. */}
        <span className="mt-1 block text-[11px] text-ink-muted">
          Kanal sayfasının adresini de yapıştırabilirsin —
          <code className="px-1">youtube.com/@kanaladi</code>
        </span>
      </label>

      {hata && <p className="max-w-lg text-xs text-danger">{hata}</p>}
      {sonuc && <p className="max-w-lg text-xs text-ink">{sonuc}</p>}

      <button
        type="button"
        onClick={() => void ekle()}
        disabled={busy || girdi.trim().length === 0}
        className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? 'Doğrulanıyor…' : 'Kanalı ekle'}
      </button>
    </section>
  );
}
