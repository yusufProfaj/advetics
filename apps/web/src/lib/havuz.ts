import type {
  ChannelKind,
  ConnectionSummary,
  SocialProfileTypeValue,
} from '@advetics/shared';
import { CHANNEL_KINDS, platformKanali } from '@advetics/shared';

export interface HavuzOgesi {
  id: string;
  name: string;
  externalId: string;
  isManager: boolean;
  /** Reklam hesabı mı, sosyal profil mi — atama ucu buna göre seçiliyor. */
  reklamHesabi: boolean;
  /**
   * ATAMA UCU ÖĞEYLE BİRLİKTE GELİYOR — çağıran yerde seçilmiyor.
   *
   * Üç ayrı uç var ve seçim iki ekranda birden gerekiyor (havuz penceresi ve
   * workspace varlıkları). İki yerde ayrı yazılsaydı biri YouTube dalını
   * unuturdu: kanal atanır, hub aboneliği kurulmaz ve panel "atandı" der —
   * kart hiç gelmez, hiçbir yerde tek kelime yazmaz.
   */
  atamaYolu: string;
  /**
   * SATIRIN GELDİĞİ BAĞLANTI — aynı adı taşıyan iki satırı ayıran TEK bilgi.
   *
   * `ad_accounts` tekil anahtarı `[platform, externalId, orgId]`, yani aynı
   * reklam hesabı İKİ FARKLI ŞİRKET altında iki satır olabiliyor ve havuz
   * penceresi ikisini de listeliyor. Ekranda ad ve dış kimlik AYNI görünüyor
   * (üretimde iki "Biltaş · 3421122929" çıktı) ve kullanıcı hangisini
   * atayacağını seçemiyor.
   *
   * Yanlışını atamak sessiz: hesap geçmişsiz açılıyor, sonraki senkronizasyon
   * yeni satıra yazıyor, eski veri eski satırda kalıyor ve GEÇMİŞ İKİYE
   * BÖLÜNÜYOR. Kaldırılmış bir bağlantıdan gelen satır bilhassa işaretleniyor:
   * o satır token'ı olmayan bir bağlantıya bağlı, yani atansa bile veri
   * çekmez.
   */
  baglanti: {
    etiket: string | null;
    durum: ConnectionSummary['status'];
    /**
     * AJANSIN MI, ŞİRKETİN KENDİSİNİN Mİ.
     *
     * İki havuzun kuralı farklı: ajansın hesabı her şirkete atanabiliyor,
     * şirketinki yalnızca kendi workspace'lerine. "Her birine workspace aç"
     * yalnızca şirketin kendi hesaplarında görünüyor; ajansın havuzunda
     * görünseydi tek tıkla yüzlerce workspace açardı.
     */
    sahip: ConnectionSummary['sahip'];
  };
}

/**
 * PROFİL TÜRÜ → ATAMA UCU.
 *
 * `Record` BİLEREK: elle yazılmış bir koşul zinciri yeni bir profil türü
 * eklendiğinde sessizce yanlış uca gider, `Record` ise derlemeyi kırar.
 *
 * YOUTUBE AYRI UÇTA ÇÜNKÜ ATAMA ÜÇ İŞ YAPIYOR: sahiplik, hub aboneliği ve
 * kanalın son videolarının kuyruğa düşmesi. Meta sayfasında yalnızca ilki
 * var.
 */
const PROFIL_ATAMA_UCU: Record<SocialProfileTypeValue, (id: string) => string> = {
  facebook_page: (id) => `/connections/social-profiles/${id}/client`,
  instagram_business: (id) => `/connections/social-profiles/${id}/client`,
  youtube_channel: (id) => `/autoboost/youtube/channels/${id}/client`,
};

/** Bir sosyal profilin atama/çıkarma ucu — TEK ÜRETİCİ. */
export function profilAtamaYolu(profileType: SocialProfileTypeValue, id: string): string {
  return PROFIL_ATAMA_UCU[profileType](id);
}

export type Havuzlar = Record<ChannelKind, HavuzOgesi[]>;

/**
 * Ekranda basılan kanal sırası.
 *
 * `CHANNEL_KINDS`TAN TÜRETİLİYOR. Burada DİZİ olarak elle yazılıydı ve
 * `Record`ların aksine TypeScript hiçbir şey demiyordu: LinkedIn kovası
 * doldurulsa bile kart HİÇ BASILMIYORDU. Eksik kart "o kanal bağlı değil"
 * diye okunur — yani sessizce yanlış bilgi.
 */
export const KANALLAR: readonly ChannelKind[] = CHANNEL_KINDS;

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
  /*
   * KOVALAR ELLE SAYILIYOR — VE BU BİLİNÇLİ.
   *
   * `Object.fromEntries(CHANNEL_KINDS.map(...))` daha kısa ama dönüş tipi
   * `{[k: string]: never[]}` ve `Havuzlar`a çevirmek bir cast istiyor. O cast
   * TypeScript'in eksik alan denetimini KAPATIYOR: yeni bir kanal eklendiğinde
   * derleme sessizce geçer ve `map[kind].push(...)` çalışma anında
   * `undefined`a düşer.
   *
   * Açık literal tam tersini yapıyor: LinkedIn eklenirken derleme BURADA
   * kırıldı ve eksik kova yazılmadan geçmek imkânsız oldu. Kısa olan değil,
   * yüksek sesle patlayan kazanıyor.
   */
  const map: Havuzlar = {
    meta_ads: [],
    google_ads: [],
    linkedin_ads: [],
    facebook: [],
    instagram: [],
    youtube: [],
  };

  /*
   * DÜZ `flatMap` KULLANILMIYOR: satırın hangi bağlantıdan geldiği kayboluyor
   * ve kaybolan şey tam da iki aynı satırı ayıran bilgi.
   */
  for (const c of connections) {
    for (const a of c.adAccounts) {
      if (a.clientId !== null) continue;
      map[platformKanali(a.platform)].push({
        id: a.id,
        name: a.name,
        externalId: a.externalId,
        isManager: a.isManager,
        reklamHesabi: true,
        atamaYolu: `/connections/ad-accounts/${a.id}/client`,
        baglanti: { etiket: c.accountLabel, durum: c.status, sahip: c.sahip },
      });
    }
  }

  for (const c of connections) {
    for (const p of c.socialProfiles) {
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
        atamaYolu: profilAtamaYolu(p.profileType, p.id),
        baglanti: { etiket: c.accountLabel, durum: c.status, sahip: c.sahip },
      });
    }
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

/**
 * ═══ "HER BİRİNE WORKSPACE AÇ" — HANGİ HESAPLAR ═══
 *
 * Müşteri kendi Meta'sını bağlayınca hesapları kendi havuzuna düşüyor ve
 * isteği birebir *"reklam hesaplarının sayısı kadar workspace
 * oluşturabilmesi"*. Tek tek "yeni workspace → ata" döngüsü on hesapta
 * yirmi adım demekti.
 *
 * YALNIZCA ŞİRKETİN KENDİ BAĞLANTISI. Ajansın havuzu yüzlerce hesap taşıyor
 * ve çoğu başka müşterilere ait; orada bu düğme tek tıkla yüzlerce yanlış
 * workspace açardı. Ayrıca ajansın hesabı hangi müşteriye aitse ORADA
 * workspace'e bağlanmalı, bulunduğun şirkette değil.
 *
 * DIŞARIDA KALANLAR VE NEDENİ:
 *   · Yönetici (MCC) hesabı — reklam yayınlamıyor, sunucu zaten reddediyor.
 *   · Kaldırılmış bağlantının satırı — atansa da veri çekmez; boş bir
 *     workspace açmak "kurdum ama veri gelmiyor" hâlini üretirdi.
 *   · Sayfalar ve kanallar — workspace bir reklam hesabı etrafında kuruluyor;
 *     sayfa hangi hesabın workspace'ine gideceğini söylemiyor.
 */
export function workspaceAcilacaklar(ogeler: HavuzOgesi[]): HavuzOgesi[] {
  return ogeler.filter(
    (o) =>
      o.reklamHesabi &&
      !o.isManager &&
      o.baglanti.sahip === 'sirket' &&
      o.baglanti.durum !== 'revoked',
  );
}

/**
 * WORKSPACE ADI HESABIN ADI — sınırlara sığdırılarak.
 *
 * Sunucu adı 2–120 karakter istiyor (`createClientSchema`). Meta'da hesap
 * adı boş ya da tek harf olabiliyor; o durumda dış kimlik kullanılıyor.
 * Sessizce reddedilen bir istek, döngünün ortasında sebepsiz bir boşluk
 * bırakırdı. Kısa ad çakışmasını sunucu çözüyor (`uniqueSlug`).
 */
export function workspaceAdi(o: Pick<HavuzOgesi, 'name' | 'externalId'>): string {
  const ad = o.name.trim();
  return (ad.length >= 2 ? ad : o.externalId).slice(0, 120);
}
