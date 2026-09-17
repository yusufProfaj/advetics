import Link from 'next/link';
import {
  ASISTAN_PLATFORMLARI,
  ASISTAN_PLATFORM_ETIKETI,
  type AiAssistantThread,
  type AsistanPlatformu,
} from '@advetics/shared';
import { hasPermission, requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import { AiAsistanSohbeti } from '@/components/ai-asistan/ai-asistan-sohbeti';

export const metadata = { title: 'AI Asistan · Advetics' };
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

  /*
   * KAPI `bulk.write` — kenar çubuğundaki satırla AYNI anahtar.
   *
   * Eskiden `bulk.read`ti ve menüde hiç satırı yoktu, yani fark görünmüyordu.
   * Artık menüde duruyor: iki anahtarın ayrışması, görünen ama açılmayan bir
   * satır demek. Ayrıca asistan taslak YAZIYOR ve müşteri hesabı
   * (`client_viewer`) reklam yayınlayamıyor — bu ekranı da görmemeli.
   */
  if (!hasPermission(session, 'bulk.write')) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
        <h1 className="text-sm font-semibold text-ink">Bu sayfaya yetkin yok</h1>
        <p className="mx-auto mt-2 max-w-lg text-xs text-ink-muted">
          AI asistanı reklam taslağı hazırlıyor ve reklam oluşturma yetkisi istiyor.
        </p>
      </div>
    );
  }

  /*
   * ═══ PLATFORM ADRESTEN GELİYOR ═══
   *
   * İki ayrı asistan var (Meta, Google) ve ikisi ayrı sistem promptu, ayrı
   * araç kümesi kullanıyor. Seçimi sayfanın İÇİNDE bir sekmeye koymak,
   * kullanıcıyı menüden sonra ikinci bir seçim yapmaya zorlardı.
   *
   * GEÇERSİZ DEĞER META'YA DÜŞÜYOR ve bu sessiz bir düşüş değil: başlıkta
   * hangi asistanda olduğu yazıyor.
   */
  const istenen = first(params.platform);
  const platform: AsistanPlatformu = (ASISTAN_PLATFORMLARI as readonly string[]).includes(
    istenen ?? '',
  )
    ? (istenen as AsistanPlatformu)
    : 'meta';

  const clientId =
    first(params.musteri) ?? session.activeClientId ?? session.availableClients[0]?.id;

  if (!clientId) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
        <h1 className="text-sm font-semibold text-ink">Önce bir workspace seç</h1>
        <p className="mx-auto mt-2 max-w-lg text-xs text-ink-muted">
          Asistan taslağı bir workspace’in hesabına kuruyor.
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
        <h1 className="text-base font-semibold text-ink">
          AI Asistan
          <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand-strong">
            {ASISTAN_PLATFORM_ETIKETI[platform]}
          </span>
        </h1>
        <p className="mt-0.5 text-xs text-ink-muted">
          <strong className="text-ink">{client?.name ?? 'Workspace'}</strong> · Asistan taslak
          hazırlar ve canlı değişiklikleri onayına sunar, kendi başına yayınlamaz.
        </p>
        {/*
          GOOGLE'DA YAZMA YOK ve bu ekranda YAZILI. `google.provider` canlı
          mutasyonu açıkça reddediyor; kullanıcı bunu asistana sorup hata
          alarak değil, en baştan okuyarak öğrenmeli.
        */}
        {platform === 'google' && (
          <p className="mt-2 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-xs text-ink">
            <strong>Bu asistan Google tarafında okuyor ve yorumluyor, yazmıyor.</strong>{' '}
            Reklam oluşturma ve canlı değişiklik (durdurma, sürdürme, bütçe) Google
            tarafında henüz yazılmadı. Hesaplarını ve yayındaki kampanyalarını sorabilir,
            ne yapman gerektiğini konuşabilirsin; değişikliği Google Ads arayüzünden
            yapman gerekiyor.
          </p>
        )}
      </header>

      <AiAsistanSohbeti
        // SOHBET DEĞİŞİNCE BİLEŞEN SIFIRLANIYOR. `useState` yalnızca ilk
        // render'da başlangıç değerini alıyor; anahtar olmadan başka bir
        // sohbete geçmek eski mesajları ekranda bırakırdı.
        key={`${platform}:${sohbetId ?? 'yeni'}`}
        clientId={clientId}
        platform={platform}
        kullaniciAdi={session.user.fullName || session.user.email}
        conversationId={thread?.conversationId ?? null}
        ilkMesajlar={thread?.messages ?? []}
        ilkAksiyonlar={thread?.actions ?? []}
        yuklemeHatasi={yuklemeHatasi}
      />

      {sohbetId && (
        <Link
          href={baglanti('/reklam-olustur/ai-asistan', {}, { musteri: clientId, platform })}
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
