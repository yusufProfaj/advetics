'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { HazirlamaYaniti, KurulumYaniti, WorkspaceHazirlik } from '@advetics/shared';
import { apiFetch } from '@/lib/api';
import { beyanGirdisi, beyanlariOku } from '@/lib/kurulum-beyanlari';
import { kurulumListesi, kurulumSayaci, sihirbazAdresi, type KurulumSayaci } from '@/lib/panel-adresleri';
import { seritAnahtari, seritGorunur, seritMetni } from '@/components/kurulum/sihirbaz-akisi';

/**
 * ═══ GENEL BAKIŞ — "KURULUM EKSİK" ŞERİDİ (docs/kurulum-sihirbazi/MIMARI.md § 3a) ═══
 *
 * Yalnız kurulumu yapabilene (`kurulum.yaz`), müşteri hesabına DEĞİL — çağıran
 * kapıyı sunucuda sınıyor ve bileşeni hiç çizmiyor. Aktif workspace bitmemişse
 * "Kurulum eksik: 3 adım · Sihirbazla tamamla".
 *
 * "KAPAT" O WORKSPACE İÇİN 7 GÜN GİZLER: her gün duran bir uyarı okunmaz hâle
 * gelir (CLAUDE.md, rapor uyarısı dersi). Tercih yerel (localStorage) ve
 * TRY/CATCH içinde: özel pencerede ya da engelli depoda erişim fırlatıyor ve
 * Genel Bakış'ın tamamını düşürmemeli. Okunamazsa şerit GÖRÜNÜR — tercihi
 * okuyamamak uyarıyı susturmamalı.
 *
 * TEMBEL: sayaç dört uç; gizliyse hiç okunmuyor. Okunamazsa şerit ÇIKMAZ:
 * bilinmeyen bir şeyi "eksik" diye ilan etmek yanlış alarm (karar
 * `seritGorunur`te, saf ve sınanıyor).
 */
function gizlendiOku(clientId: string): number | null {
  try {
    const v = window.localStorage.getItem(seritAnahtari(clientId));
    const n = v === null ? NaN : Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function gizlendiYaz(clientId: string): void {
  try {
    window.localStorage.setItem(seritAnahtari(clientId), String(Date.now()));
  } catch {
    /* depo kapalı: bu oturumda gizlemek yine çalışıyor (durum), yalnız hatırlanmıyor */
  }
}

export function KurulumSeridi({ clientId }: { clientId: string }) {
  const [sayac, setSayac] = useState<KurulumSayaci | null>(null);
  const [gizli, setGizli] = useState(true);

  useEffect(() => {
    const gizlendi = gizlendiOku(clientId);
    // Gizliyse uçlara hiç gidilmez: yedi gün boyunca boş yere dört istek.
    if (!seritGorunur({ yazabilir: true, sayac: { tamam: 0, toplam: 1, kapsamDisi: 0, bilinmiyor: 0, bitti: false }, gizlendi, simdi: Date.now() })) return;
    let iptal = false;
    void (async () => {
      const oku = async <T,>(yol: string): Promise<T | null> => apiFetch<T>(yol).catch((): null => null);
      const [k, hz, hk] = await Promise.all([
        oku<KurulumYaniti>(`/clients/${clientId}/kurulum`),
        oku<HazirlamaYaniti>(`/clients/${clientId}/hazirlama`),
        oku<WorkspaceHazirlik>(`/clients/${clientId}/hazirlik`),
      ]);
      const by = await beyanlariOku(apiFetch, clientId, k);
      if (iptal) return;
      const s = kurulumSayaci(
        kurulumListesi({ kurulum: k, hazirlama: hz, hazirlik: hk, kullanilmayanlar: k?.kullanilmayanPlatformlar ?? [], beyanlar: beyanGirdisi(by) }),
      );
      setSayac(s);
      setGizli(!seritGorunur({ yazabilir: true, sayac: s, gizlendi, simdi: Date.now() }));
    })();
    return () => {
      iptal = true;
    };
  }, [clientId]);

  if (gizli || !sayac) return null;
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink">
      <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand font-baslik text-[11px] font-bold text-white">
        !
      </span>
      <span className="min-w-0 flex-1">{seritMetni(sayac)}</span>
      <Link href={sihirbazAdresi(clientId)} className="font-semibold text-ink underline underline-offset-[3px]">
        Sihirbazla tamamla →
      </Link>
      <button
        type="button"
        onClick={() => {
          gizlendiYaz(clientId);
          setGizli(true);
        }}
        className="rounded-lg px-2 py-1 text-xs font-semibold text-ink-muted hover:text-ink"
        aria-label="Kurulum uyarısını 7 gün gizle"
      >
        Kapat
      </button>
    </div>
  );
}
