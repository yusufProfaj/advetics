import Link from 'next/link';
import {
  AD_DRAFT_STATUS_LABELS,
  GOAL_META,
  type AdDraftRecord,
  type DraftGroupRecord,
} from '@advetics/shared';
import { hasPermission, requireSession } from '@/lib/session';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { DraftGroupList } from '@/components/ad-builder/draft-group-list';

export const metadata = { title: 'Reklam Oluştur · Advetics' };
export const dynamic = 'force-dynamic';

/**
 * Reklam Oluştur — GİRİŞ KAPISI.
 *
 * ═══ EKRANIN ADI KENAR ÇUBUĞUYLA AYNI ═══
 *
 * Menüde "Reklam Oluştur" yazıyordu, sayfa "Reklamlar" başlığıyla
 * açılıyordu. Aynı şeyin iki adı olması kullanıcıya yanlış sayfaya düştüğünü
 * düşündürüyor. Aynı sebeple "Gönderiyi Öne Çıkar" kartı da "Akıllı Boost"
 * oldu: kart ile kenar çubuğu AYNI ekranı açıyor ve iki ayrı ad taşıyordu.
 *
 * Bu sayfa eskiden sihirbazın kendisiydi. Artık dört başlangıç noktası ve
 * kampanya listesi: kullanıcı "reklam vereceğim" diye geliyor, biz de ona
 * "elle mi, kuraldan mı, tablodan mı" diye sormak yerine ne yapmak istediğini
 * soruyoruz (tasarım belgesi §2.2).
 *
 * ESKİ SİHİRBAZ EMEKLİ. `ad_drafts` tablosu ve verisi YERİNDE — silinmedi,
 * taşınmadı. Sebebi: üretimdeki satır sayısı bilinmiyor ve bilinmeden veri
 * taşımak ya da düşürmek sorumsuzluk olurdu. Eski taslaklar aşağıda salt
 * okunur bir bölümde duruyor; yeni bir tane oluşturmanın yolu yok.
 */
export default async function AdsHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const clientId =
    first(params.musteri) ?? session.activeClientId ?? session.availableClients[0]?.id;

  if (!clientId) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
        <h1 className="text-sm font-semibold text-ink">Önce bir workspace seç</h1>
      </div>
    );
  }

  const canWrite = hasPermission(session, 'bulk.write');
  const client = session.availableClients.find((c) => c.id === clientId);

  /*
   * HATA YUTULMUYOR. İkisi de `.catch(() => [])` ile alınıyordu ve bu depoda
   * adı konmuş bir yasak: liste okunamadığında ekran "Bu workspace'te henüz
   * kampanya yok" yazıyordu. İki cümle tamamen farklı iş — birincisinde
   * kullanıcı kampanya kurar, ikincisinde kurduğu kampanyaların kaybolduğunu
   * sanır.
   */
  const [kampanyaSonuc, eskiSonuc] = await Promise.allSettled([
    serverApiFetch<DraftGroupRecord[]>(`/draft-campaigns?clientId=${clientId}`),
    serverApiFetch<AdDraftRecord[]>(`/ad-drafts?clientId=${clientId}`),
  ]);

  const groups = kampanyaSonuc.status === 'fulfilled' ? kampanyaSonuc.value : null;
  const legacy = eskiSonuc.status === 'fulfilled' ? eskiSonuc.value : [];

  /*
   * LİSTE KESİLİYOR — VE KESİLDİĞİ YAZILIYOR.
   *
   * `/draft-campaigns` limitsiz dönüyor ve her kampanya için AD GRUPLARINI
   * ve REKLAMLARI da çekiyor (üç sorgu). Bu ekran satır başına yalnızca ad,
   * platform, durum ve tarih basıyor; bir yıl kampanya kuran workspace'te
   * sayfa yüzlerce satırla açılır ve asıl iş (yeni kampanya kurmak) en üstte
   * kaybolur.
   */
  const LISTE_SINIRI = 10;
  const gosterilen = groups?.slice(0, LISTE_SINIRI) ?? [];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Reklam Oluştur</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          <strong className="text-ink">{client?.name ?? 'Workspace'}</strong> · ne yapmak
          istediğini seç.
        </p>
      </header>

      {canWrite ? (
        <>
          {/*
            ═══ BEŞ KART İKİ GRUBA AYRILDI ═══

            Hepsi tek ızgaradaydı ve aralarındaki fark okunmuyordu: üçü
            SIFIRDAN kampanya kuruyor, ikisi VAR OLAN bir şeyden üretiyor
            (çalışan bir kampanyadan ya da yayınlanmış bir gönderiden). İkinci
            gruba girebilmek için elde zaten bir şey olması gerekiyor; ilk kez
            gelen kullanıcıya onları birinci sınıf seçenek gibi göstermek,
            boş bir ekrana götürmek demekti.
          */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-ink">Sıfırdan kampanya</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {/*
                AI ASİSTAN BURADA, AYRI BİR MENÜ ÖĞESİ DEĞİL: kampanya kurmanın
                bir başka yolu ve kullanıcı "reklam vereceğim" diye zaten bu
                sayfaya geliyor. Kenar çubuğuna ayrı satır koymak, aynı işin
                parçası olan ekranı ayırmak olurdu (CLAUDE.md, rapor/şablon dersi).
              */}
              <Giris
                href={`/reklam-olustur/ai-asistan?musteri=${clientId}`}
                baslik="AI Asistan"
                aciklama="Ne istediğini yaz, sohbetten taslak çıksın. Görsel ekleyebilir, bütçeyi konuşarak belirleyebilirsin."
                vurgu
              />
              <Giris
                href={`/reklam-olustur/basit?musteri=${clientId}`}
                baslik="Hızlı Reklam"
                aciklama="Ne istediğini söyle, gerisini biz hallederiz. Hedef, kitle ve yerleşim sorulmuyor."
              />
              <Giris
                href={`/reklam-olustur/uzman?musteri=${clientId}`}
                baslik="Kampanya Kur"
                aciklama="Amaç, optimizasyon, kitle ve yerleşim üzerinde tam kontrol. Meta ve Google."
              />
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-ink">Var olandan üret</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Giris
                href={`/toplu-olustur?musteri=${clientId}`}
                baslik="Toplu Oluştur"
                aciklama="Çalışan bir kampanyadan varyasyonlar üret. Yazmadığın alan kaynaktan gelir."
              />
              {/*
                AD KENAR ÇUBUĞUYLA AYNI. Kart "Gönderiyi Öne Çıkar" diyordu,
                menü aynı ekrana "Akıllı Boost" diyordu: tek ekran, iki ad.
              */}
              <Giris
                href={`/auto-boost?musteri=${clientId}`}
                baslik="Akıllı Boost"
                aciklama="Kural kur, iyi giden gönderiler onayına düşsün."
              />
            </div>
          </section>
        </>
      ) : (
        // SEBEPSİZ BOŞ EKRAN YOK: kartlar yetkiye bağlı ve yetkisi olmayan
        // kullanıcı neden hiçbir düğme göremediğini bilmeli.
        <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-muted">
          Reklam oluşturmak yöneticinin işi. Kurulan kampanyaları görebilirsin.
        </p>
      )}

      {groups === null ? (
        <div
          role="alert"
          className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger-strong"
        >
          <strong>Kampanya listesi okunamadı.</strong>{' '}
          {kampanyaSonuc.status === 'rejected' && kampanyaSonuc.reason instanceof ApiRequestError
            ? kampanyaSonuc.reason.message
            : 'Sunucuya ulaşılamadı.'}
        </div>
      ) : gosterilen.length > 0 ? (
        <DraftGroupList
          groups={gosterilen}
          toplam={groups.length}
          baslik="Kurulan kampanyalar"
        />
      ) : (
        <p className="rounded-xl border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-ink-muted">
          Bu workspace’te henüz kampanya yok.
        </p>
      )}

      {legacy.length > 0 && <EskiTaslaklar drafts={legacy} />}
    </div>
  );
}

function Giris({
  href,
  baslik,
  aciklama,
  vurgu,
}: {
  href: string;
  baslik: string;
  aciklama: string;
  vurgu?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-xl border p-4 transition ${
        vurgu ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:bg-surface-sunken'
      }`}
    >
      <span className="block text-sm font-semibold text-ink">{baslik}</span>
      <span className="mt-1 block text-xs text-ink-muted">{aciklama}</span>
    </Link>
  );
}

/**
 * Eski oluşturucuyla yapılmış reklamlar — SALT OKUNUR.
 *
 * VERİ SİLİNMEDİ VE TAŞINMADI. Taşımak cazip görünüyor ama temiz değil: eski
 * taslakların görselleri taslağa özel dosyalar (`ad_draft_assets`) ve bir
 * kısmının arşivde karşılığı yok — yani kreatif kütüphanesine dönüştürülemez.
 * Üstelik üretimdeki satır sayısı bilinmiyor.
 *
 * Bu yüzden geçmiş burada duruyor: yeni bir tane oluşturulamıyor, var olanlar
 * kayıp değil. Bölüm boşsa hiç görünmüyor — yani yeni kurulumlarda bu ekran
 * eski akıştan hiç söz etmiyor.
 */
function EskiTaslaklar({ drafts }: { drafts: AdDraftRecord[] }) {
  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">
          Eski oluşturucuyla yapılmış reklamlar
          <span className="ml-1.5 font-normal text-ink-muted">({drafts.length})</span>
        </h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          Salt okunur. Eski akış emekliye ayrıldı; bu kayıtlar silinmedi ve platformdaki
          reklamları etkilenmedi. Yeni reklamlar yukarıdaki adımlardan oluşturuluyor.
        </p>
      </div>
      <ul>
        {drafts.map((d) => (
          <li key={d.id} className="border-b border-line/60 px-4 py-2.5 last:border-0">
            <p className="truncate text-sm font-medium text-ink">{d.name}</p>
            <p className="text-[11px] text-ink-muted">
              {GOAL_META[d.goal].label} · {AD_DRAFT_STATUS_LABELS[d.status]} ·{' '}
              {formatRelative(d.createdAt)}
              {d.error && <span className="text-danger-strong"> · {d.error}</span>}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
