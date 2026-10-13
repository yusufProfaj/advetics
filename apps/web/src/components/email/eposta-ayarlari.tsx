'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { EmailAccountSummary, SignatureCleanReport } from '@advetics/shared';
import { apiFetch, ApiRequestError } from '@/lib/api';
import { Kart } from '@/components/ui/kart';
import { Dugme } from '@/components/ui/dugme';
import { Serit } from '@/components/ui/hal';
import { Alan, FormIzgarasi, Girdi, MetinAlani } from '@/components/ui/alan';

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

  const testDugmesi = (
    <Dugme
      ton="koyu"
      boyut="kucuk"
      onClick={test}
      disabled={bekleyen !== null || !mevcut}
      bekliyor={bekleyen === 'test'}
      title={mevcut ? undefined : 'Önce ayarları kaydet'}
    >
      Kendine test maili gönder
    </Dugme>
  );

  return (
    <div className="grid gap-5">
      {/*
        DURUM EN ÜSTTE ŞERİT (taslak `#hesabim`): "kaydedildi" ile "çalışıyor"
        farklı şeyler. Doğrulanmamışsa menüde de kırmızı nokta var
        (`hesabim/page.tsx`); şerit nedenini ve tek çaresini söylüyor.
      */}
      {dogrulandi ? (
        <Serit ton="bilgi" baslik="Doğrulandı">
          Bu hesaptan rapor gönderilebilir. Son test {new Date(mevcut!.verifiedAt!).toLocaleString('tr-TR')}.
        </Serit>
      ) : (
        <Serit ton="hata" baslik="E-posta ayarların doğrulanmamış" eylemler={testDugmesi}>
          Rapor maili gönderilemez. Kaydetmek yeterli değil: SMTP bilgisi yanlışsa hata ancak ilk gerçek
          gönderimde çıkar ve o gönderim workspace’e gidecek olandır. Kaydettikten sonra kendine test maili gönder.
          {mevcut?.lastError && (
            <span className="mt-1 block font-semibold text-danger-strong">Son hata: {mevcut.lastError}</span>
          )}
        </Serit>
      )}

      <Kart baslik="Gönderen">
        <FormIzgarasi>
          <Alan etiket="Görünen ad">
            <Girdi value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Yusuf Algan" />
          </Alan>
          <Alan etiket="Gönderen adresi">
            <Girdi value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} />
          </Alan>
        </FormIzgarasi>
      </Kart>

      <Kart baslik="SMTP">
        <div className="grid gap-4">
          <p className="m-0 text-13 text-ink-muted">
            Google Workspace kullanıyorsan sunucu <code>smtp.gmail.com</code>, port <code>465</code>. Parola
            olarak normal şifreni değil <strong>uygulama parolasını</strong> gir. Bunun için hesabında iki
            adımlı doğrulama açık olmalı, aksi hâlde Google uygulama parolası üretmiyor.
          </p>
          <FormIzgarasi>
            <Alan etiket="Sunucu">
              <Girdi value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
            </Alan>
            <Alan etiket="Port">
              <Girdi value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} inputMode="numeric" />
            </Alan>
            <Alan etiket="Kullanıcı">
              <Girdi value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} />
            </Alan>
            <Alan
              etiket="Uygulama parolası"
              ipucu={mevcut?.hasPassword ? 'Boş bırakırsan değişmez.' : undefined}
            >
              <Girdi
                type="password"
                value={smtpPass}
                onChange={(e) => setSmtpPass(e.target.value)}
                placeholder={mevcut?.hasPassword ? '•••••••• (kayıtlı)' : ''}
              />
            </Alan>
          </FormIzgarasi>
          <label className="flex items-center gap-2 text-14 text-ink">
            <input
              type="checkbox"
              checked={smtpSecure}
              onChange={(e) => setSmtpSecure(e.target.checked)}
              className="h-4 w-4 accent-[var(--brand-primary)]"
            />
            SSL/TLS (port 465 için açık, 587 için kapalı)
          </label>
        </div>
      </Kart>

      <Kart baslik="İmza">
        <div className="grid gap-3">
          <p className="m-0 text-13 text-ink-muted">
            Gmail&apos;deki imzan bizim gönderdiğimiz maile <strong>otomatik eklenmiyor</strong>; onu
            Gmail&apos;in arayüzü ekliyor. İmzanın HTML&apos;ini buraya yapıştır. Güvenlik için script ve
            olay öznitelikleri temizleniyor; ne atıldığı kaydettikten sonra yazılıyor.
          </p>
          <MetinAlani
            aria-label="İmza HTML"
            value={imza}
            onChange={(e) => setImza(e.target.value)}
            rows={8}
            spellCheck={false}
            className="font-mono text-12"
          />

          {rapor && (
            <Serit ton="bilgi" baslik="İmza kaydedildi">
              <ul className="m-0 mt-1 grid list-none gap-0.5 p-0">
                {rapor.rewrittenImages > 0 && (
                  <li>
                    {rapor.rewrittenImages} görsel adresi Gmail önbelleğinden gerçek kaynağına çevrildi. O
                    adresler Gmail dışında çalışmıyor ve mailde kırık görünürdü.
                  </li>
                )}
                {rapor.removedTags.length > 0 && <li>Atılan etiketler: {rapor.removedTags.join(', ')}</li>}
                {rapor.removedAttributes.length > 0 && (
                  <li>Atılan öznitelikler: {rapor.removedAttributes.join(', ')}</li>
                )}
                {rapor.removedTags.length === 0 &&
                  rapor.removedAttributes.length === 0 &&
                  rapor.rewrittenImages === 0 && <li>Hiçbir şey atılmadı.</li>}
              </ul>
            </Serit>
          )}

          {mevcut?.signatureHtml && (
            <div className="grid gap-1">
              <p className="m-0 text-12 text-ink-muted">Önizleme (kayıtlı hâli):</p>
              {/*
                KAYITLI HÂL ÖNİZLENİYOR, girilen ham metin değil. Saklanan şey
                gönderilecek şey; ham metni göstermek, temizlikten sonra neyin
                gideceği konusunda yanıltırdı.

                İçerik sunucuda beyaz listeyle temizlendi: script, olay
                öznitelikleri ve javascript:/data: şemaları atıldı. Zemin
                BEYAZ (tema ne olursa olsun): müşterinin mail istemcisinde
                imza beyaz zeminde görünüyor.
              */}
              <div
                className="overflow-x-auto rounded-alan border border-line bg-white p-3"
                dangerouslySetInnerHTML={{ __html: mevcut.signatureHtml }}
              />
            </div>
          )}
        </div>
      </Kart>

      {hata && (
        <Serit ton="hata" baslik="Kaydedilemedi">
          {hata}
        </Serit>
      )}

      {testSonuc && (
        <Serit ton={testSonuc.ok ? 'bilgi' : 'hata'} baslik={testSonuc.ok ? 'Test maili gönderildi' : 'Test maili gönderilemedi'}>
          {testSonuc.ok ? `${fromEmail} adresine gönderildi. Gelen kutunu kontrol et.` : testSonuc.error}
        </Serit>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {dogrulandi && testDugmesi}
        <Dugme onClick={kaydet} bekliyor={bekleyen === 'kaydet'} disabled={bekleyen !== null}>
          Kaydet
        </Dugme>
      </div>
    </div>
  );
}
