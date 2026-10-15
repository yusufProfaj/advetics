import Link from 'next/link';
import { kapiNedeni, sec, type ArsivWorkspaceSatiri } from '@advetics/shared';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { acilisAdresi, kapi } from '@/lib/panel-adresleri';
import type { SessionResponse } from '@/lib/session';
import { dugmeSinifi } from '@/components/ui/dugme';
import { Kart } from '@/components/ui/kart';
import { BosDurum, Serit } from '@/components/ui/hal';
import { WorkspaceSatirlari, type WorkspaceSatiri } from '@/components/tenancy/workspace-satirlari';
import { ArsivListesi } from '@/components/tenancy/arsiv-listesi';
import { dilAl } from '@/dil/sunucu';
import { ayarlarSozlugu } from '@/dil/sozlukler/ayarlar';
import { sirketlerSozlugu } from '@/dil/sozlukler/ayarlar-sirketler';

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

function hataMetni(e: unknown, yedek: string): string {
  return e instanceof ApiRequestError ? e.message : yedek;
}

export async function WorkspaceBolumu({
  session,
  tasiHedefleri,
}: {
  session: SessionResponse;
  /** Workspace'in taşınabileceği DİĞER şirketler (üst hesap ağacından). */
  tasiHedefleri: Array<{ id: string; name: string }>;
}) {
  const dil = await dilAl();
  const t = sec(sirketlerSozlugu, dil);
  const d = t.bolum;
  const yedek = sec(ayarlarSozlugu, dil).ortak.baglantiKurulamadi;
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
    musteriSonuc.status === 'rejected' ? d.workspaceListesi(hataMetni(musteriSonuc.reason, yedek)) : null,
  ].filter((x): x is string => x !== null);

  const workspaceAcabilir = kapi(session, 'workspace.ekle');

  return (
    <div className="grid gap-5">
      <section id="workspaceler" className="grid scroll-mt-24 gap-3">
        {/*
          BÖLÜM BAŞLIĞI KARTIN DIŞINDA: "Workspace'ler" kelimesi bu
          bölümün adı (terminoloji: "Müşteriler"e geri dönmüyor) ve
          satır sayısıyla toplamlar tablonun kendi kartında.
        */}
        <h2 className="font-baslik m-0 text-15 font-bold text-ink">{d.workspaceler}</h2>

        {yuklemeHatalari.length > 0 && (
          <Serit ton="hata" baslik={d.listeOkunamadi}>
            {yuklemeHatalari.join(' · ')}
          </Serit>
        )}

        {musteriSonuc.status === 'fulfilled' && clients.length === 0 ? (
          <BosDurum
            baslik={d.henuzYok}
            neden={d.henuzYokNeden}
            eylem={
              /*
                YENİ WORKSPACE SİHİRBAZDA KURULUYOR: platform bağlantısını,
                boost hesabını ve kategoriyi soruyor. Sayfanın birincil
                eylemi başlıkta; buradaki ikincil düğme boş listenin "ne
                yapmalıyım" cevabı.
              */
              workspaceAcabilir ? (
                <Link href={acilisAdresi('workspace')} className={dugmeSinifi('ikincil', 'kucuk')}>
                  {d.workspaceAc}
                </Link>
              ) : (
                <span className="text-12 text-ink-muted">{kapiNedeni('workspace.ekle', dil)}</span>
              )
            }
          />
        ) : clients.length > 0 ? (
          <WorkspaceSatirlari
            satirlar={clients}
            arsivleyebilir={kapi(session, 'workspace.arsivle')}
            arsivNedeni={kapiNedeni('workspace.arsivle', dil)}
            tasiyabilir={kapi(session, 'workspace.tasi')}
            tasiHedefleri={tasiHedefleri}
          />
        ) : null}

        {/* KAPI KAPALIYSA SEBEBİ YAZIYOR: başlıktaki düğme sessizce yok olmuyor. */}
        {!workspaceAcabilir && clients.length > 0 && (
          <p className="m-0 text-12 text-ink-muted">{kapiNedeni('workspace.ekle', dil)}</p>
        )}
      </section>

      <section id="arsiv" className="scroll-mt-24">
        <Kart
          baslik={d.arsiv}
          baslikEki={geriAlabilir && arsivSonuc.status === 'fulfilled' ? t.ortak.workspaceSayisi(arsiv.length) : undefined}
          dolgu={false}
        >
          <p className="m-0 border-b border-line px-5 py-3 text-13 text-ink-muted">
            {d.arsivAciklama}
          </p>
          {!geriAlabilir ? (
            <p className="m-0 px-5 py-4 text-13 text-ink-muted">{kapiNedeni('workspace.geriAl', dil)}</p>
          ) : arsivSonuc.status === 'rejected' ? (
            <div className="p-4">
              <Serit ton="hata" baslik={d.arsivOkunamadi}>
                {hataMetni(arsivSonuc.reason, yedek)}
              </Serit>
            </div>
          ) : (
            <ArsivListesi satirlar={arsiv} geriAlabilir={geriAlabilir} />
          )}
        </Kart>
      </section>
    </div>
  );
}
