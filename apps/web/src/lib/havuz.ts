import type { ChannelKind, ConnectionSummary } from '@advetics/shared';

export interface HavuzOgesi {
  id: string;
  name: string;
  externalId: string;
  isManager: boolean;
  /** Reklam hesabı mı, sosyal profil mi — atama ucu buna göre seçiliyor. */
  reklamHesabi: boolean;
}

export type Havuzlar = Record<ChannelKind, HavuzOgesi[]>;

/** Ekranda basılan kanal sırası. */
export const KANALLAR: ChannelKind[] = [
  'meta_ads',
  'google_ads',
  'facebook',
  'instagram',
  'youtube',
];

/**
 * HAVUZ TÜRETMESİ — TEK YERDE.
 *
 * Bu eşleme (platform → kanal, profil tipi → kanal) iki ekranda birden
 * lazım: Platform Bağlantıları'ndaki havuz kartları ve müşteri kurulum
 * sihirbazı. İkinci bir kopya yazmak, bir kanalın bir ekranda görünüp
 * diğerinde kaybolması demekti — bu kod tabanında aynı hata bir kez
 * hedefleme fonksiyonunda yaşandı ve iki kopya doğdukları anda ayrışmıştı.
 *
 * YALNIZCA ATANMAMIŞ (`clientId === null`) satırlar dönüyor: atanmış bir
 * hesabı havuzda göstermek, başka müşterinin hesabını ikinci kez atamaya
 * davet ederdi.
 */
export function havuzlariCikar(connections: ConnectionSummary[]): Havuzlar {
  const map: Havuzlar = {
    meta_ads: [],
    google_ads: [],
    facebook: [],
    instagram: [],
    youtube: [],
  };

  for (const a of connections.flatMap((c) => c.adAccounts)) {
    if (a.clientId !== null) continue;
    map[a.platform === 'meta' ? 'meta_ads' : 'google_ads'].push({
      id: a.id,
      name: a.name,
      externalId: a.externalId,
      isManager: a.isManager,
      reklamHesabi: true,
    });
  }

  for (const p of connections.flatMap((c) => c.socialProfiles)) {
    if (p.clientId !== null) continue;
    const k: ChannelKind | null =
      p.profileType === 'facebook_page'
        ? 'facebook'
        : p.profileType === 'instagram_business'
          ? 'instagram'
          : p.profileType === 'youtube_channel'
            ? 'youtube'
            : null;
    if (!k) continue;
    map[k].push({
      id: p.id,
      name: p.name,
      externalId: p.externalId,
      isManager: false,
      reklamHesabi: false,
    });
  }

  return map;
}

/** Ad ya da dış kimlikte arama — Türkçe küçük harf katlamasıyla. */
export function havuzSuz(ogeler: HavuzOgesi[], arama: string): HavuzOgesi[] {
  const q = arama.trim().toLocaleLowerCase('tr');
  if (!q) return ogeler;
  return ogeler.filter(
    (o) =>
      o.name.toLocaleLowerCase('tr').includes(q) ||
      o.externalId.toLocaleLowerCase('tr').includes(q),
  );
}
