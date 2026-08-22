'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { EmailAccountSummary, SignatureCleanReport } from '@advetics/shared';
import { apiFetch, ApiRequestError } from '@/lib/api';

/**
 * KENDİ E-POSTA KİMLİĞİN — SMTP ve imza.
 *
 * İKİ ADIM: kaydetmek yetmiyor, "kendine test gönder" gerekiyor. SMTP kimliği
 * yanlışsa hata ancak ilk GERÇEK gönderimde çıkar ve o gönderim müşteriye
 * gidecek olandır. Bu yüzden doğrulanmamış bir hesapla rapor gönderimi
 * açılmıyor ve ekran bunu açıkça yazıyor.
 */
export function EpostaAyarlari({
  mevcut,
  kullaniciEposta,
}: {
  mevcut: EmailAccountSummary | null;
  kullaniciEposta: string;
}) {
  const router = useRouter();
  const [fromName, setFromName] = useState(mevcut?.fromName ?? '');
  const [fromEmail, setFromEmail] = useState(mevcut?.fromEmail ?? kullaniciEposta);
  const [smtpHost, setSmtpHost] = useState(mevcut?.smtpHost ?? 'smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState(String(mevcut?.smtpPort ?? 465));
  const [smtpSecure, setSmtpSecure] = useState(mevcut?.smtpSecure ?? true);
  const [smtpUser, setSmtpUser] = useState(mevcut?.smtpUser ?? kullaniciEposta);
  const [smtpPass, setSmtpPass] = useState('');
  const [imza, setImza] = useState(mevcut?.signatureHtml ?? '');

  const [bekleyen, setBekleyen] = useState<'kaydet' | 'test' | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [rapor, setRapor] = useState<SignatureCleanReport | null>(null);
  const [testSonuc, setTestSonuc] = useState<{ ok: boolean; error: string | null } | null>(null);

  async function kaydet() {
    setBekleyen('kaydet');
    setHata(null);
    setRapor(null);
    setTestSonuc(null);
    try {
      const r = await apiFetch<{ signature: SignatureCleanReport }>('/me/email-account', {
        method: 'PUT',
        body: JSON.stringify({
          fromName: fromName.trim(),
          fromEmail: fromEmail.trim(),
          smtpHost: smtpHost.trim(),
          smtpPort: Number(smtpPort),
          smtpSecure,
          smtpUser: smtpUser.trim(),
          // BOŞ GÖNDERİLMİYOR: sunucuda boş = "değiştirme".
          ...(smtpPass ? { smtpPass } : {}),
          signatureHtml: imza.trim() || undefined,
        }),
      });
      setRapor(r.signature);
      setSmtpPass('');
      router.refresh();
    } catch (err) {
      // Sunucunun KENDİ mesajı. "Bir hata oluştu" demek, düzeltilebilir bir
      // sebebi (geçersiz adres, eksik parola) gizlerdi.
      setHata(err instanceof ApiRequestError ? err.message : 'Kaydedilemedi.');
    } finally {
      setBekleyen(null);
    }
  }

  async function test() {
    setBekleyen('test');
    setHata(null);
    setTestSonuc(null);
    try {
      setTestSonuc(
        await apiFetch<{ ok: boolean; error: string | null }>('/me/email-account/verify', {
          method: 'POST',
        }),
      );
      router.refresh();
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : 'Test gönderilemedi.');
    } finally {
      setBekleyen(null);
    }
  }

  const dogrulandi = mevcut?.verifiedAt != null;

  return (
    <div className="space-y-5">
      {/* DURUM EN ÜSTTE: "kaydedildi" ile "çalışıyor" farklı şeyler. */}
      <div
        className={`rounded-lg border px-4 py-3 text-sm ${
          dogrulandi ? 'border-ok/40 bg-ok/5' : 'border-warn/40 bg-warn/5'
        }`}
      >
        {dogrulandi ? (
          <p>
            <strong>Doğrulandı.</strong> Bu hesaptan rapor gönderilebilir — son test{' '}
            {new Date(mevcut!.verifiedAt!).toLocaleString('tr-TR')}.
          </p>
        ) : (
          <>
            <p className="font-medium">Henüz doğrulanmadı.</p>
            <p className="mt-1 text-ink-muted">
              Kaydetmek yeterli değil: SMTP bilgisi yanlışsa hata ancak ilk gerçek
              gönderimde çıkar ve o gönderim <strong>müşteriye gidecek olandır</strong>.
              Kaydettikten sonra kendine test maili gönder.
            </p>
            {mevcut?.lastError && (
              <p className="mt-2 rounded border border-danger/40 bg-danger/5 px-2.5 py-1.5 text-xs text-danger">
                Son hata: {mevcut.lastError}
              </p>
            )}
          </>
        )}
      </div>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-medium">Gönderen</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Alan label="Görünen ad">
            <Girdi value={fromName} onChange={setFromName} placeholder="Yusuf Algan" />
          </Alan>
          <Alan label="Gönderen adresi">
            <Girdi value={fromEmail} onChange={setFromEmail} />
          </Alan>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-medium">SMTP</h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          Google Workspace kullanıyorsan sunucu <code>smtp.gmail.com</code>, port{' '}
          <code>465</code>. Parola olarak normal şifreni değil{' '}
          <strong>uygulama parolasını</strong> gir — bunun için hesabında iki adımlı
          doğrulama açık olmalı, aksi hâlde Google uygulama parolası üretmiyor.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Alan label="Sunucu">
            <Girdi value={smtpHost} onChange={setSmtpHost} />
          </Alan>
          <Alan label="Port">
            <Girdi value={smtpPort} onChange={setSmtpPort} />
          </Alan>
          <Alan label="Kullanıcı">
            <Girdi value={smtpUser} onChange={setSmtpUser} />
          </Alan>
          <Alan
            label={
              mevcut?.hasPassword
                ? 'Uygulama parolası (boş bırakırsan değişmez)'
                : 'Uygulama parolası'
            }
          >
            <Girdi
              value={smtpPass}
              onChange={setSmtpPass}
              type="password"
              placeholder={mevcut?.hasPassword ? '•••••••• (kayıtlı)' : ''}
            />
          </Alan>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={smtpSecure}
            onChange={(e) => setSmtpSecure(e.target.checked)}
          />
          SSL/TLS (port 465 için açık, 587 için kapalı)
        </label>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-medium">İmza</h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          Gmail&apos;deki imzan bizim gönderdiğimiz maile <strong>otomatik
          eklenmiyor</strong> — onu Gmail&apos;in arayüzü ekliyor. İmzanın HTML&apos;ini
          buraya yapıştır. Güvenlik için script ve olay öznitelikleri temizleniyor;
          ne atıldığı kaydettikten sonra yazılıyor.
        </p>
        <textarea
          value={imza}
          onChange={(e) => setImza(e.target.value)}
          rows={8}
          spellCheck={false}
          className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-ink focus:border-brand focus:outline-none"
        />

        {rapor && (
          <div className="mt-2 rounded border border-line bg-surface-muted px-3 py-2 text-xs">
            <p className="font-medium">İmza kaydedildi.</p>
            <ul className="mt-1 space-y-0.5 text-ink-muted">
              {rapor.rewrittenImages > 0 && (
                <li>
                  {rapor.rewrittenImages} görsel adresi Gmail önbelleğinden gerçek
                  kaynağına çevrildi — o adresler Gmail dışında çalışmıyor ve mailde
                  kırık görünürdü.
                </li>
              )}
              {rapor.removedTags.length > 0 && (
                <li>Atılan etiketler: {rapor.removedTags.join(', ')}</li>
              )}
              {rapor.removedAttributes.length > 0 && (
                <li>Atılan öznitelikler: {rapor.removedAttributes.join(', ')}</li>
              )}
              {rapor.removedTags.length === 0 &&
                rapor.removedAttributes.length === 0 &&
                rapor.rewrittenImages === 0 && <li>Hiçbir şey atılmadı.</li>}
            </ul>
          </div>
        )}

        {mevcut?.signatureHtml && (
          <div className="mt-3">
            <p className="text-xs text-ink-muted">Önizleme (kayıtlı hâli):</p>
            {/*
              KAYITLI HÂL ÖNİZLENİYOR, girilen ham metin değil. Saklanan şey
              gönderilecek şey; ham metni göstermek, temizlikten sonra neyin
              gideceği konusunda yanıltırdı.

              İçerik sunucuda beyaz listeyle temizlendi: script, olay
              öznitelikleri ve javascript:/data: şemaları atıldı.
            */}
            <div
              className="mt-1 overflow-x-auto rounded border border-line bg-white p-3"
              dangerouslySetInnerHTML={{ __html: mevcut.signatureHtml }}
            />
          </div>
        )}
      </section>

      {hata && (
        <p className="rounded border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
          {hata}
        </p>
      )}

      {testSonuc && (
        <p
          className={`rounded border px-3 py-2 text-sm ${
            testSonuc.ok
              ? 'border-ok/40 bg-ok/5'
              : 'border-danger/40 bg-danger/5 text-danger'
          }`}
        >
          {testSonuc.ok
            ? `Test maili ${fromEmail} adresine gönderildi. Gelen kutunu kontrol et.`
            : `Gönderilemedi — ${testSonuc.error}`}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={test}
          disabled={bekleyen !== null || !mevcut}
          title={mevcut ? undefined : 'Önce ayarları kaydet'}
          className="rounded-lg border border-line px-3.5 py-2 text-sm transition hover:bg-surface-muted disabled:opacity-50"
        >
          {bekleyen === 'test' ? 'Gönderiliyor…' : 'Kendine test maili gönder'}
        </button>
        <button
          type="button"
          onClick={kaydet}
          disabled={bekleyen !== null}
          className="rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {bekleyen === 'kaydet' ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>
    </div>
  );
}

function Alan({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="mt-0.5 block">{children}</span>
    </label>
  );
}

function Girdi({
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
    />
  );
}
