import Link from 'next/link';
import { serverApiFetch } from '@/lib/api';
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
export default async function TeamPage() {
  const session = await requireSession();

  const [members, clients] = await Promise.all([
    serverApiFetch<MemberRow[]>('/members').catch(() => []),
    serverApiFetch<ClientRow[]>('/clients').catch(() => []),
  ]);

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
      <div>
        <h1 className="text-2xl font-semibold">Ekip &amp; Yetkiler</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Yetki müşteri bazında verilir: bir kişi bir müşteride yönetici, başka bir
          müşteride yalnızca görüntüleyici olabilir.
        </p>
      </div>

      {/*
        SAYAÇ BANDI, EKLEME DÜĞMESİ VE LİSTELER TEK BİLEŞENDE.
        Ekleme formu sayfanın üstünde sabit duruyordu ve her açılışta yer
        kaplıyordu; oysa kullanıcı eklemek seyrek bir iş. Asıl soru
        ("bu workspace'e kim erişiyor") ise hiç cevaplanmıyordu — kullanıcılar
        tek tek kart olarak basılıyordu.
      */}
      <TeamScreen
        members={members}
        clients={clients}
        currentUserId={session.user.id}
        canManage={session.isOrgAdmin}
      />

      <p className="text-xs text-ink-muted">
        Yeni müşteri açmak için{' '}
        <Link href="/ayarlar/musteriler" className="font-medium text-brand-strong hover:underline">
          Müşteriler
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
