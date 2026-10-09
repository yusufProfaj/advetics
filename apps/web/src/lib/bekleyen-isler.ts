import type {
  BekleyenIs,
  BekleyenIsKaynakHatasi,
  BekleyenIslerYaniti,
} from '@advetics/shared';
import { baglanti } from '@/lib/baglanti';
import { butceAdresi } from '@/lib/butce-adresi';
import { stratejiAdresi } from '@/components/strateji/hesap';

/**
 * ═══ GENEL BAKIŞ › BEKLEYEN İŞLER: SAF KARARLAR ═══
 *
 * Sözleşme `packages/shared/src/genel-bakis`, kararlar
 * `docs/genel-bakis/MIMARI.md` § 1. Panelde bileşen render eden test
 * altyapısı yok (bilinçli); kutunun hangi hâlde çizileceği, satırın ne
 * diyeceği ve nereye gideceği burada duruyor ve `bekleyen-isler.spec.ts`
 * onları ÇALIŞTIRARAK sınıyor. JSX içinde kalsalardı yalnızca kaynak
 * taramasıyla sınanabilirlerdi (CLAUDE.md, `domaYazilmali` dersi).
 */

/**
 * Sunucu bileşeninin elindeki sonuç. Çağrı düşerse `null` DEĞİL, sebebiyle
 * bir hata nesnesi: `null`, "bekleyen iş yok" ile "çağrı düştü"yü aynı boş
 * kutuya çevirirdi ve kullanıcı yapılacak işi olmadığını sanardı.
 */
export type BekleyenIslerSonucu =
  | { durum: 'tamam'; yanit: BekleyenIslerYaniti }
  | { durum: 'hata'; mesaj: string };

/**
 * Ucun adresi. TEK WORKSPACE SEÇİLİYSE `clientId` gidiyor, "Tüm
 * workspace'ler" ve "Tüm şirketler" kipinde gitmiyor: sunucu o zaman
 * kullanıcının erişebildiği bütün workspace'leri tarıyor. Ajans kipinde
 * `activeClientId` zaten her zaman null.
 */
/**
 * Bekleyen işler kartında kapalıyken görünen satır sayısı.
 *
 * BU SABİT BURADA, `acilir-liste.tsx`TE DEĞİL — ve orada OLAMAZ. O dosya
 * `'use client'`; sunucu bileşeni oradan bir DEĞER aktarınca Next.js sayı
 * değil bir istemci referansı veriyor. `slice(0, ILK_SATIR)` boş, `slice(
 * ILK_SATIR)` bütün listeyi döndü: canlıda (2026-10-09) kart "3 / 50
 * gösteriliyor" yazıp TEK SATIR göstermedi, 50 iş gizli kısımdaydı. Vitest
 * bu sınırı tanımadığı için testler yeşildi. `istemci-siniri.spec.ts`.
 */
export const BEKLEYEN_ILK_SATIR = 3;

export function bekleyenIslerYolu(activeClientId: string | null): string {
  return baglanti('/genel-bakis/bekleyenler', { clientId: activeClientId ?? undefined });
}

/**
 * Kutunun hâli. YÜKLENİYOR burada yok: o, sunucu bileşeninde `Suspense`
 * sınırının işi (söz henüz çözülmedi).
 *
 * `yalniz_hata` AYRI: hiç satır yok ama bir kaynak okunamadıysa "Bekleyen iş
 * yok" yazmak YALAN olurdu. Boost kuyruğu okunamamışken kullanıcı onay
 * bekleyen bir kart olmadığını sanar ve gönderiler erişim kaybeder.
 */
export type BekleyenKutuHali = 'hata' | 'bos' | 'yalniz_hata' | 'dolu';

export function bekleyenKutuHali(sonuc: BekleyenIslerSonucu): BekleyenKutuHali {
  if (sonuc.durum === 'hata') return 'hata';
  if (sonuc.yanit.isler.length > 0) return 'dolu';
  return sonuc.yanit.hatalar.length > 0 ? 'yalniz_hata' : 'bos';
}

/**
 * Satırın cümlesi.
 *
 * `strateji_onay` İKİ TÜRLÜ: onay yetkisi olan (müşteri hesabı dahil) için
 * iş KENDİSİNİN, olmayan için bilgi. Aynı cümleyi ikisine yazmak, onaylayamayan
 * kullanıcıyı açıp bir şey yapamayacağı bir ekrana gönderirdi.
 *
 * "müşteri onayında" YAZILMIYOR (MIMARI öyle diyordu): planı ajans yöneticisi
 * de onaylayabiliyor, yani "müşteri" yanlış kişiyi söylerdi; ayrıca kelime
 * terminoloji bekçisine takılıyor. Kısa ve doğru olan: "onayda".
 */
export function bekleyenIsCumlesi(is: BekleyenIs, onayYetkisi: boolean): string {
  const cogul = is.sayi > 1;
  switch (is.tur) {
    case 'boost_onay':
      return `${is.sayi} Akıllı Boost kartı onay bekliyor`;
    case 'strateji_onay':
      if (onayYetkisi) return cogul ? `${is.sayi} medya planı onayını bekliyor` : 'Medya planı onayını bekliyor';
      return cogul ? `${is.sayi} medya planı onayda` : 'Medya planı onayda';
    case 'strateji_aktar':
      return cogul
        ? `${is.sayi} onaylanan plan AdvCampaign’e aktarılmadı`
        : 'Onaylanan plan AdvCampaign’e aktarılmadı';
    case 'butce_yok':
      return 'Bu ay harcama var, bütçe tanımlı değil';
  }
}

/**
 * "23 gündür". Bekleme bir önceliktir: üç haftadır bekleyen onay, dünkünden
 * önce okunmalı. `enEski` yoksa (`butce_yok`, beklemenin başlangıcı ay başı)
 * yaş yazılmıyor; uydurulmuş bir yaş, yanlış bir öncelik demek.
 */
export function bekleyenIsYasi(enEski: string | null, simdi: Date = new Date()): string | null {
  if (!enEski) return null;
  const t = Date.parse(enEski);
  if (Number.isNaN(t)) return null;
  const gun = Math.floor((simdi.getTime() - t) / 86_400_000);
  return gun < 1 ? 'bugün' : `${gun} gündür`;
}

/**
 * İşin ekranı. Adresler VAR OLAN üreticilerden, elle birleştirilmiyor
 * (CLAUDE.md "bağlantıyı elle birleştirme"): bütçe iki kez taşındı ve her
 * taşımada elle kurulan bağlantılardan biri eski yerde kaldı.
 *
 * `musteri` HER ADRESTE: "Tüm workspace'ler" kipindeki satır başka bir
 * workspace'e ait ve sayfalar workspace'i `params.musteri ??
 * session.activeClientId` sırasıyla çözüyor. Parametresiz bağlantı,
 * kullanıcıyı işin DEĞİL o an seçili workspace'in ekranına götürürdü.
 *
 * STRATEJİDE PLAN KİMLİĞİ YOK: sözleşme satırı workspace başına topluyor
 * (`sayi`). Sayfa adreste plan yoksa en yeni planı açıyor; onay bekleyen plan
 * en yenisi değilse kullanıcı listeden seçiyor. Onay satırı SUNUM bölümüne
 * gidiyor: onaylayan kişi planı oradan okuyor.
 */
export function bekleyenIsAdresi(is: BekleyenIs): string {
  switch (is.tur) {
    case 'boost_onay':
      return baglanti('/auto-boost', { musteri: is.clientId });
    case 'strateji_onay':
      return stratejiAdresi(is.clientId, { bolum: 'sunum' });
    case 'strateji_aktar':
      return stratejiAdresi(is.clientId, {});
    case 'butce_yok':
      return butceAdresi(is.clientId);
  }
}

/**
 * Kısmi hata satırı: SUNUCUNUN CÜMLESİ, olduğu gibi. Sunucu kaynak başına
 * tam bir cümle kuruyor ("Akıllı Boost kuyruğu okunamadı"); panel önüne
 * bir kaynak adı daha ekleyince ekranda "Boost kuyruğu okunamadı: Akıllı
 * Boost kuyruğu okunamadı" çıkıyordu (Ajan 4, 2026-10-09). Cümlenin tek
 * sahibi sunucu (`genel-bakis.service.ts#KAYNAK_HATASI`).
 */
export function kaynakHataMetni(h: BekleyenIsKaynakHatasi): string {
  return h.mesaj;
}

/** Sessiz kesme yok: sunucu satırı kestiyse ekranda "50 / 73 gösteriliyor". */
export function kesmeMetni(yanit: BekleyenIslerYaniti): string | null {
  return yanit.toplam > yanit.isler.length ? `${yanit.isler.length} / ${yanit.toplam} gösteriliyor` : null;
}

/**
 * Hızlı erişimdeki Akıllı Boost düğmesinin rozeti — kutuyla AYNI yanıttan.
 * İki ayrı çağrı iki ayrı sayı söyleyebilirdi.
 *
 * - Çağrı ya da boost kaynağı düştüyse `?`: rozetsiz düğme "bekleyen yok"
 *   gibi okunurdu.
 * - Sayı yanıt KESİLMİŞSE alt sınır: sıralama boost'u öne aldığı için
 *   kesilen satırlar da boost olabilir ve toplam gerçekten büyük olabilir.
 *   O zaman "50+" yazılıyor, eksik bir sayı kesin gibi gösterilmiyor.
 */
export function boostRozeti(sonuc: BekleyenIslerSonucu): { metin: string; baslik: string } | null {
  if (sonuc.durum === 'hata' || sonuc.yanit.hatalar.some((h) => h.tur === 'boost_onay')) {
    return { metin: '?', baslik: 'Onay bekleyen sayısı alınamadı' };
  }
  const { isler, toplam } = sonuc.yanit;
  const sayi = isler.filter((i) => i.tur === 'boost_onay').reduce((t, i) => t + i.sayi, 0);
  if (sayi === 0) return null;
  const eksik = toplam > isler.length && isler[isler.length - 1]?.tur === 'boost_onay';
  return {
    metin: eksik ? `${sayi}+` : String(sayi),
    baslik: `${eksik ? `En az ${sayi}` : sayi} kart onay bekliyor`,
  };
}
