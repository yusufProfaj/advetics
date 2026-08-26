'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ApiRequestError, apiFetch } from '@/lib/api';

/**
 * ═══ MÜŞTERİ BİLGİLERİ — DÜZENLEME ═══
 *
 * İletişim ve fatura alanları YALNIZCA kurulum sihirbazında giriliyordu ve
 * panelde bunları değiştirecek hiçbir ekran yoktu: sihirbazda atlanan bir
 * e-posta bir daha girilemiyordu. Detay penceresi bu alanları listeliyor;
 * doldurulamayan bir liste kalıcı olarak "—" gösterir ve bölümün kendisi
 * ölü görünürdü.
 *
 * UÇ ZATEN VARDI (`PATCH /clients/:id`, `updateClientSchema`) — eksik olan
 * yalnızca arayüzdü.
 *
 * ALANLAR TEK LİSTEDEN TÜRETİLİYOR. Etiket, anahtar ve giriş türü üçü ayrı
 * yazılırsa bir alan eklenip biri güncellenmediğinde form sessizce eksik
 * gönderir; TypeScript de bir şey demez çünkü hepsi opsiyonel.
 */
export interface MusteriBilgileri {
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  address: string | null;
  taxOffice: string | null;
  taxNumber: string | null;
  iban: string | null;
  notes: string | null;
}

type Alan = keyof MusteriBilgileri;

const ALANLAR: { anahtar: Alan; etiket: string; tur: 'text' | 'email' | 'tel' | 'uzun' }[] = [
  { anahtar: 'contactName', etiket: 'Yetkili kişi', tur: 'text' },
  { anahtar: 'contactEmail', etiket: 'E-posta', tur: 'email' },
  { anahtar: 'contactPhone', etiket: 'Telefon', tur: 'tel' },
  { anahtar: 'website', etiket: 'İnternet sitesi', tur: 'text' },
  { anahtar: 'taxOffice', etiket: 'Vergi dairesi', tur: 'text' },
  { anahtar: 'taxNumber', etiket: 'Vergi numarası', tur: 'text' },
  { anahtar: 'iban', etiket: 'IBAN', tur: 'text' },
  { anahtar: 'address', etiket: 'Adres', tur: 'uzun' },
  { anahtar: 'notes', etiket: 'Not', tur: 'uzun' },
];

export function MusteriBilgiFormu({
  clientId,
  baslangic,
  onBitti,
}: {
  clientId: string;
  baslangic: MusteriBilgileri;
  onBitti: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [deger, setDeger] = useState<Record<Alan, string>>(() => {
    const d = {} as Record<Alan, string>;
    for (const a of ALANLAR) d[a.anahtar] = baslangic[a.anahtar] ?? '';
    return d;
  });

  async function kaydet(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setKaydediliyor(true);
    setHata(null);
    try {
      /*
       * BOŞ ALAN DA GÖNDERİLİYOR. Yalnızca doluları göndermek, bir alanı
       * TEMİZLEMEYİ imkânsız kılardı: `undefined` "değiştirme" demek.
       * Şema boş dizgeyi `null`'a çeviriyor, yani temizleme uçta doğru
       * karşılığını buluyor.
       */
      await apiFetch(`/clients/${clientId}`, { method: 'PATCH', body: JSON.stringify(deger) });
      startTransition(() => router.refresh());
      onBitti();
    } catch (err) {
      /*
       * HATA YUTULMUYOR. Uç e-posta biçimini reddediyor ve mesajı kendisi
       * yazıyor; onu gizlemek kullanıcıya "kaydedilmedi" bile demezdi.
       */
      setHata(
        err instanceof ApiRequestError ? err.message : 'Bilgiler kaydedilemedi.',
      );
    } finally {
      setKaydediliyor(false);
    }
  }

  return (
    <form onSubmit={kaydet} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {ALANLAR.map((a) => (
          <label
            key={a.anahtar}
            className={`block text-xs ${a.tur === 'uzun' ? 'sm:col-span-2' : ''}`}
          >
            <span className="text-ink-muted">{a.etiket}</span>
            {a.tur === 'uzun' ? (
              <textarea
                rows={2}
                value={deger[a.anahtar]}
                onChange={(e) => setDeger({ ...deger, [a.anahtar]: e.target.value })}
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs focus:border-brand focus:outline-none"
              />
            ) : (
              <input
                type={a.tur}
                value={deger[a.anahtar]}
                onChange={(e) => setDeger({ ...deger, [a.anahtar]: e.target.value })}
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs focus:border-brand focus:outline-none"
              />
            )}
          </label>
        ))}
      </div>

      {hata && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{hata}</p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={kaydediliyor || isPending}
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
        <button
          type="button"
          onClick={onBitti}
          disabled={kaydediliyor}
          className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-muted transition hover:bg-surface-muted"
        >
          Vazgeç
        </button>
      </div>
    </form>
  );
}
