import Link from 'next/link';
import type { AiAssistantThread } from '@advetics/shared';
import { hasPermission, requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import { AiAsistanSohbeti } from '@/components/ai-asistan/ai-asistan-sohbeti';

export const metadata = { title: 'AI Asistan — Advetics' };
export const dynamic = 'force-dynamic';

/**
 * AI KAMPANYA ASİSTANI — panel içi sohbet.
 *
 * `/reklam-olustur` altında ve bu bilinçli: kampanya oluşturmanın DÖRDÜNCÜ
 * yolu, ayrı bir menü öğesi değil. Kenar çubuğuna ayrı bir satır koymak,
 * aynı işin parçası olan ekranı ayrı bir yere taşımak olurdu — bu projede
 * o ayrılık daha önce gerçek bir hata üretti (rapor/şablon, CLAUDE.md).
 *
 * ASGARİ İZİN `bulk.read` — API'nin `AiAssistantController` üzerindeki
 * izniyle AYNI. Her tool ayrıca kendi iznini sunucuda kontrol ediyor, yani
 * `analyst` sohbeti açıp taslak hazırlayabiliyor ama bir onay kartını
 * tıklayınca `budget.write` eksikse reddediliyor.
 */
export default async function AiAsistanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  if (!hasPermission(session, 'bulk.read')) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
        <h1 className="text-sm font-semibold text-ink">Bu sayfaya yetkin yok</h1>
        <p className="mx-auto mt-2 max-w-lg text-xs text-ink-muted">
          AI asistanı reklam taslağı hazırlıyor ve reklam okuma yetkisi istiyor.
        </p>
      </div>
    );
  }

  const clientId =
    first(params.musteri) ?? session.activeClientId ?? session.availableClients[0]?.id;

  if (!clientId) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
        <h1 className="text-sm font-semibold text-ink">Önce bir müşteri seç</h1>
        <p className="mx-auto mt-2 max-w-lg text-xs text-ink-muted">
          Asistan taslağı bir müşterinin hesabına kuruyor.
        </p>
      </div>
    );
  }

  /*
   * GEÇMİŞ SUNUCUDAN GERİ YÜKLENİYOR — sohbet `ai_messages`ta duruyor.
   *
   * HATA YUTULMUYOR: bağlantıdaki sohbet kimliği bayatsa ya da uç düşerse
   * sebebi ekranda yazıyor. `.catch(() => null)` ile sessizce boş bir sohbet
   * göstermek, "geçmiş yok" ile "geçmiş yüklenemedi"yi aynı boşluğa
   * çevirirdi (CLAUDE.md).
   */
  const sohbetId = first(params.sohbet) ?? null;
  let thread: AiAssistantThread | null = null;
  let yuklemeHatasi: string | null = null;
  if (sohbetId) {
    try {
      thread = await serverApiFetch<AiAssistantThread>(`/ai-assistant/conversations/${sohbetId}`);
    } catch (err) {
      yuklemeHatasi = err instanceof Error ? err.message : 'bilinmeyen hata';
    }
  }

  const client = session.availableClients.find((c) => c.id === clientId);

  return (
    <div className="min-w-0 space-y-4">
      <header className="min-w-0">
        <h1 className="text-base font-semibold text-ink">AI Asistan</h1>
        <p className="mt-0.5 text-xs text-ink-muted">
          <strong className="text-ink">{client?.name ?? 'Müşteri'}</strong> · Asistan taslak
          hazırlar ve canlı değişiklikleri onayına sunar — kendi başına yayınlamaz.
        </p>
      </header>

      <AiAsistanSohbeti
        // SOHBET DEĞİŞİNCE BİLEŞEN SIFIRLANIYOR. `useState` yalnızca ilk
        // render'da başlangıç değerini alıyor; anahtar olmadan başka bir
        // sohbete geçmek eski mesajları ekranda bırakırdı.
        key={sohbetId ?? 'yeni'}
        clientId={clientId}
        conversationId={thread?.conversationId ?? null}
        ilkMesajlar={thread?.messages ?? []}
        ilkAksiyonlar={thread?.actions ?? []}
        yuklemeHatasi={yuklemeHatasi}
      />

      {sohbetId && (
        <Link
          href={baglanti('/reklam-olustur/ai-asistan', {}, { musteri: clientId })}
          className="inline-block text-xs text-ink-muted underline hover:text-ink"
        >
          Yeni sohbet başlat
        </Link>
      )}
    </div>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
