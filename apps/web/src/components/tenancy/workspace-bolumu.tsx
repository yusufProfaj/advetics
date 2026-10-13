import Link from 'next/link';
import { PANEL_KAPILARI, type ArsivWorkspaceSatiri } from '@advetics/shared';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { acilisAdresi, kapi } from '@/lib/panel-adresleri';
import type { SessionResponse } from '@/lib/session';
import { dugmeSinifi } from '@/components/ui/dugme';
import { WorkspaceSatirlari, type WorkspaceSatiri } from '@/components/tenancy/workspace-satirlari';
import { ArsivListesi } from '@/components/tenancy/arsiv-listesi';

/**
 * ═══ ŞİRKETİN WORKSPACE'LERİ (Ayarlar › Şirketler ve workspace'ler) ═══
 *
 * AKTİF ŞİRKETİN workspace'leri — bu bir tercih değil, sınırın kendisi:
 * `/clients` RLS ile aktif şirkete çivili (`app.org_kapsaminda`). Başka bir
 * şirketin workspace'i için önce o şirkete geçiliyor (soldaki ray).
 *
 * WORKSPACE PENCERESİ KALKTI (MIMARI Ç-23): kart → pencere → atama,
 * kategori, firma bilgisi, arşiv. O alanların hepsinin ikinci bir evi vardı
 * ve aynı bilgi iki yerden düzenleniyordu. Satır yalnız SAYILARI gösteriyor
 * ve Marka Merkezi'ne açılıyor; hesap ataması Marka Merkezi › Kurulum'da,
 * firma bilgisi Workspace bilgileri'nde, özel reklam kategorisi Kurulum ›
 * Reklam varsayılanları'nda.
 *
 * Bir workspace = bir şirketin bir markası/projesi ve BİRDEN ÇOK reklam
 * hesabı olabiliyor (portföyde Maxra iki Meta + iki Google). Sayılar hep
 * "kaç hesap" diye yazılıyor.
 */

/**
 * `/clients` satırı — `clients.service.ts#list` seçiminin bu ekranın
 * KULLANDIĞI alt kümesi. `serverApiFetch<T>` denetimsiz bir dönüşüm: alan
 * eklenirse uçtaki `select`e de eklenmeli (`musteri-detay-alanlari.spec.ts`).
 */
type ClientRow = WorkspaceSatiri;

function hataMetni(e: unknown): string {
  return e instanceof ApiRequestError ? e.message : 'Bağlantı kurulamadı';
}

export async function WorkspaceBolumu({
  session,
  tasiHedefleri,
}: {
  session: SessionResponse;
  /** Workspace'in taşınabileceği DİĞER şirketler (üst hesap ağacından). */
  tasiHedefleri: Array<{ id: string; name: string }>;
}) {
  const geriAlabilir = kapi(session, 'workspace.geriAl');

  /*
   * HATA YUTULMUYOR (CLAUDE.md: `.catch(() => [])` yasak). "Henüz workspace
   * yok" ile "liste okunamadı" aynı boş ekrana çevrilirse kullanıcı var olan
   * workspace'in ikincisini açar.
   *
   * ARŞİV YALNIZ GERİ ALABİLENE ÇEKİLİYOR: arşivli workspace oturumun
   * erişim listesine girmiyor ve RLS onu yalnız org yöneticisine gösteriyor.
   * Başkası için uç boş dönerdi ve "Arşivde workspace yok" YANLIŞ bir cümle
   * olurdu — onun yerine kapının sebebi yazılıyor.
   */
  const [musteriSonuc, arsivSonuc] = await Promise.allSettled([
    serverApiFetch<ClientRow[]>('/clients'),
    geriAlabilir
      ? serverApiFetch<ArsivWorkspaceSatiri[]>('/clients?arsiv=1')
      : Promise.resolve<ArsivWorkspaceSatiri[]>([]),
  ]);

  const clients = musteriSonuc.status === 'fulfilled' ? (musteriSonuc.value ?? []) : [];
  const arsiv = arsivSonuc.status === 'fulfilled' ? (arsivSonuc.value ?? []) : [];

  const yuklemeHatalari = [
    musteriSonuc.status === 'rejected' ? `Workspace listesi: ${hataMetni(musteriSonuc.reason)}` : null,
  ].filter((x): x is string => x !== null);

  const toplamHesap = clients.reduce((n, c) => n + c._count.adAccounts, 0);
  const toplamIzlenen = clients.reduce((n, c) => n + c.adAccounts.filter((a) => a.syncEnabled).length, 0);

  return (
    <div className="space-y-6">
      <section id="workspaceler" className="scroll-mt-4 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Workspace’ler</h2>
            {/* TOPLAM HER ZAMAN YAZILI: hesabı olup izlenmeyen workspace "veri gelmiyor" diye okunur. */}
            <p className="mt-0.5 text-xs text-ink-muted">
              {clients.length} workspace · {toplamHesap} reklam hesabı · {toplamIzlenen} tanesi izlemede
            </p>
          </div>
          {/* YENİ WORKSPACE SİHİRBAZDA KURULUYOR — platform bağlantısını, boost hesabını ve kategoriyi soruyor. */}
          {kapi(session, 'workspace.ekle') ? (
            <Link href={acilisAdresi('workspace')} className={dugmeSinifi('birincil', 'kucuk')}>
              + Yeni workspace
            </Link>
          ) : (
            <span className="text-xs text-ink-muted">{PANEL_KAPILARI['workspace.ekle'].neden}</span>
          )}
        </div>

        {yuklemeHatalari.length > 0 && (
          <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger-strong">
            {yuklemeHatalari.map((h) => (
              <p key={h}>{h}</p>
            ))}
          </div>
        )}

        {musteriSonuc.status === 'fulfilled' && clients.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
            <p className="text-sm font-medium text-ink">Bu şirkette henüz workspace yok</p>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-muted">
              Reklam hesapları workspace’e bağlanıyor. Önce bir workspace aç.
            </p>
          </div>
        ) : clients.length > 0 ? (
          <WorkspaceSatirlari
            satirlar={clients}
            arsivleyebilir={kapi(session, 'workspace.arsivle')}
            arsivNedeni={PANEL_KAPILARI['workspace.arsivle'].neden}
            tasiyabilir={kapi(session, 'workspace.tasi')}
            tasiHedefleri={tasiHedefleri}
          />
        ) : null}
      </section>

      <section id="arsiv" className="scroll-mt-4 rounded-xl border border-line bg-surface">
        <div className="border-b border-line px-4 py-2.5">
          <h2 className="text-sm font-semibold text-ink">Arşiv</h2>
          <p className="text-xs text-ink-muted">
            Arşivlenen workspace silinmez; hesapları ve geçmişi durur.
            {geriAlabilir && arsivSonuc.status === 'fulfilled' && ` ${arsiv.length} workspace arşivde.`}
          </p>
        </div>
        {!geriAlabilir ? (
          <p className="px-4 py-3 text-sm text-ink-muted">{PANEL_KAPILARI['workspace.geriAl'].neden}</p>
        ) : arsivSonuc.status === 'rejected' ? (
          <p role="alert" className="px-4 py-3 text-sm text-danger-strong">
            Arşiv okunamadı: {hataMetni(arsivSonuc.reason)}
          </p>
        ) : (
          <ArsivListesi satirlar={arsiv} geriAlabilir={geriAlabilir} />
        )}
      </section>
    </div>
  );
}
