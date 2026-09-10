import Link from 'next/link';
import type { ManagerAccountTree } from '@advetics/shared';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type { MemberRow } from '@/components/tenancy/team-manager';
import { TeamScreen } from '@/components/tenancy/team-screen';

export const metadata = { title: 'Ekip & Yetkiler — Advetics' };

interface ClientRow {
  id: string;
  name: string;
}

/**
 * Ekip & Yetkiler — kurulumun ÜÇÜNCÜ adımı.
 *
 * Yetki MÜŞTERİ BAZINDA veriliyor, kullanıcı bazında değil: bir kişi A
 * müşterisinde kampanya yöneticisi, B'de yalnızca görüntüleyici olabilir.
 * Ekranın merkezinde bu yüzden kullanıcı değil, kullanıcı × müşteri eşleşmesi
 * var.
 *
 * Veri sunucuda çekiliyor, eylemler istemcide. Kullanıcı EKLEME uç noktası
 * (`POST /members`) yalnızca org yöneticisine açık; portföy yöneticisi
 * listeyi görür ama ekleyemez.
 *
 * DAVET AKIŞI KALDIRILDI: token üretiliyor, hash'lenip saklanıyor ve düz
 * metni atılıyordu — e-posta altyapısı olmadığı için üretimde kimse daveti
 * kabul edemiyordu. Kullanıcı artık doğrudan oluşuyor.
 */
/** Hata mesajını çıkarır — platformun kendi cümlesi ekranda görünmeli. */
function hataMetni(e: unknown): string {
  return e instanceof ApiRequestError ? e.message : 'Bağlantı kurulamadı';
}

export default async function TeamPage() {
  const session = await requireSession();

  /*
   * HATA YUTULMUYOR — `.catch(() => [])` KALDIRILDI.
   *
   * İki uç da boş dizeye düşüyordu ve o desen bu depoda adı konmuş bir
   * yasak (CLAUDE.md): "henüz yok", "yüklenemedi" ve "yetkin yok" AYNI boş
   * ekrana çevriliyor. Canlıda tam olarak bu oldu — "Danışman ata"
   * penceresindeki liste boş göründü ve ekranda tek bir ipucu yoktu;
   * kullanıcı hiç kimsenin olmadığını sandı.
   *
   * Sebep artık ekranda yazıyor ve sayfa yine açılıyor: listeler boş
   * gelse de diğer bölümler çalışmaya devam ediyor.
   */
  const [uyeSonuc, workspaceSonuc, agacSonuc] = await Promise.allSettled([
    serverApiFetch<MemberRow[]>('/members'),
    serverApiFetch<ClientRow[]>('/clients'),
    /*
     * `?? null` ÇAĞRININ YANINDA. Uç `null` döndüğünde NestJS gövdeyi boş
     * bırakıyor ve `serverApiFetch` `undefined` dönüyor; normalizasyonu
     * `allSettled` sonucunu açarken yapmak da işe yarardı ama o zaman
     * kural çağrının yanında GÖRÜNMEZ olurdu — ve bu kod tabanında o
     * görünmezlik bir kez canlıda patladı.
     */
    serverApiFetch<ManagerAccountTree | null>('/manager-account').then((x) => x ?? null),
  ]);

  const members = uyeSonuc.status === 'fulfilled' ? (uyeSonuc.value ?? []) : [];
  const clients = workspaceSonuc.status === 'fulfilled' ? (workspaceSonuc.value ?? []) : [];

  /*
   * ŞİRKET LİSTESİ — "Danışman ata" penceresi buraya yetki veriyor.
   *
   * Üst hesap yoksa (bağımsız şirket) liste TEK ELEMANLI kuruluyor: pencere
   * tek bir şekil biliyor ve iki ayrı yol (ağaçlı / ağaçsız) yazmak,
   * birinin bir gün diğerini tutmaması demekti.
   */
  const agac =
    agacSonuc.status === 'fulfilled' ? (agacSonuc.value ?? null) : null;
  const sirketler = agac
    ? agac.organizations.map((o) => ({ id: o.id, name: o.name }))
    : [{ id: session.activeOrganizationId, name: session.organization.name }];

  const yuklemeHatalari = [
    uyeSonuc.status === 'rejected' ? `Ekip listesi: ${hataMetni(uyeSonuc.reason)}` : null,
    workspaceSonuc.status === 'rejected'
      ? `Workspace listesi: ${hataMetni(workspaceSonuc.reason)}`
      : null,
    agacSonuc.status === 'rejected' ? `Şirket listesi: ${hataMetni(agacSonuc.reason)}` : null,
  ].filter((x): x is string => x !== null);

  return (
    /*
     * 5xl'DEN 7xl'E. Üye kartları dikey yığındaydı ve geniş ekranda her kart
     * satırın tamamını kaplayıp sağda ölü alan bırakıyordu — kanallar
     * ekranındaki şikâyetin aynısı. Kartlar artık ızgarada; genişlik onlara
     * yarıyor.
     *
     * TAM GENİŞLİK DEĞİL: bu ekranda yetki açıklamaları ve rol metinleri var
     * ve tam genişlikte satır başına çok fazla karakter düşüyor.
     */
    <div className="mx-auto max-w-7xl space-y-6">
      {yuklemeHatalari.length > 0 && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {yuklemeHatalari.map((h) => (
            <p key={h}>{h}</p>
          ))}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-semibold">Ekip &amp; Yetkiler</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Danışmanlar AJANS seviyesinde duruyor ve şirketlere yetkilendiriliyor —
          bir şirkete yetki verilen danışman o şirketin bütün workspace’lerini
          görür. Müşteri hesapları (Görüntüleyici) tek bir workspace’e bağlı kalır.
        </p>
      </div>

      {/*
        SAYAÇ BANDI, EKLEME DÜĞMESİ VE LİSTELER TEK BİLEŞENDE.
        Ekleme formu sayfanın üstünde sabit duruyordu ve her açılışta yer
        kaplıyordu; oysa kullanıcı eklemek seyrek bir iş. Asıl soru
        ("bu workspace’e kim erişiyor") ise hiç cevaplanmıyordu — kullanıcılar
        tek tek kart olarak basılıyordu.
      */}
      <TeamScreen
        members={members}
        clients={clients}
        sirketler={sirketler}
        currentUserId={session.user.id}
        canManage={session.isOrgAdmin}
      />

      <p className="text-xs text-ink-muted">
        Yeni workspace açmak için{' '}
        <Link href="/ayarlar/musteriler" className="font-medium text-brand-strong hover:underline">
          Workspace’ler
        </Link>
        , reklam hesabı bağlamak için{' '}
        <Link href="/ayarlar/baglantilar" className="font-medium text-brand-strong hover:underline">
          Platform Bağlantıları
        </Link>
        .
      </p>
    </div>
  );
}
