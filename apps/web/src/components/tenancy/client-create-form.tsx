'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';

/**
 * Yeni müşteri formu.
 *
 * Zaman dilimi ve para birimi SORULMUYOR, varsayılan gönderiliyor
 * (Europe/Istanbul, TRY). Hedef kullanıcı reklamcılık bilmiyor ve bu iki alan
 * kurulumun ilk adımında sorulursa akışı kilitliyor — ikisi de sonradan
 * değiştirilebiliyor.
 *
 * Zaman diliminin önemi ayrı bir konu: "bugünün harcaması" tanımı ona bağlı ve
 * yanlış değer kural motorunun yanlış günün verisiyle bütçe kapatması demek.
 * Bu yüzden varsayılan SESSİZCE geçilmiyor, formun altında yazıyor.
 *
 * Slug gönderilmiyor: sunucu addan türetiyor. Kullanıcıya slug sormak, ne
 * olduğunu açıklamak zorunda kalmak demekti.
 */
export function ClientCreateForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError('Müşteri adı en az 2 karakter olmalı.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await apiFetch('/clients', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed }),
      });
      setName('');
      // Liste sunucuda render ediliyor; yenilemeden yeni satır görünmez.
      router.refresh();
    } catch (err) {
      // Hata mesajı FORMUN YANINDA. Bu projede bir hata mesajı sayfanın
      // altında belirdiği için "tıkladım, bir şey olmadı" diye raporlanmıştı.
      setError(err instanceof Error ? err.message : 'Müşteri oluşturulamadı.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <label htmlFor="client-name" className="block text-sm font-medium text-ink">
        Yeni müşteri
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          id="client-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Örn: Sabancı İnşaat"
          maxLength={120}
          disabled={busy}
          className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || name.trim().length < 2}
          className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Ekleniyor…' : 'Müşteri Ekle'}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}

      <p className="mt-2 text-xs text-ink-muted">
        Zaman dilimi Europe/Istanbul, raporlama para birimi TRY olarak açılır — ikisi de
        sonradan değiştirilebilir. Zaman dilimi &quot;bugünün harcaması&quot; tanımını
        belirlediği için farklı bir ülkede çalışan müşteride mutlaka güncelleyin.
      </p>
    </form>
  );
}
