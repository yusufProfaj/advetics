import { sec, type Dil } from '@advetics/shared';
import { baglantilarSozlugu } from '@/dil/sozlukler/ayarlar-baglantilar';
import { formatNumber } from './format';

/**
 * ATAMA SONRASI KULLANICIYA NE SÖYLENECEK.
 *
 * Reklam hesabı el değiştirince verisi de taşınıyor ve bu SESSİZ OLAMAZ: bir
 * müşterinin raporundaki rakam bir anda değişiyor. Ne kadar değiştiğini
 * söylemeyen bir arayüz, kullanıcıyı "acaba veri mi kayboldu" diye aramaya
 * gönderiyor — bu projede tam olarak o soru günler harcattı.
 *
 * MESAJ TEK YERDE ÜRETİLİYOR. Üç ayrı ekran aynı ucu çağırıyor (havuz modalı,
 * bağlı kanallar listesi, sayfa listesi); metni her birinde ayrı yazmak,
 * birinde güncellenmeyen bir cümle bırakmanın kestirme yolu.
 */
export type AtamaYaniti = {
  /**
   * SUNUCUNUN KENDİ CÜMLESİ — varsa en başa yazılıyor.
   *
   * YouTube kanalı atandığında sunucu üç iş birden yapıyor (sahiplik, hub
   * aboneliği, son videoların çekilmesi) ve sonucu yalnızca o biliyor: kaç
   * kart açıldı, abonelik kuruldu ama videolar çekilemedi mi. Burada
   * yeniden üretmek, sunucudaki gerçekle panelin cümlesinin ayrışması
   * demekti.
   */
  note?: string;
  /**
   * KALDIRMADA SATIR NEREYE DÖNDÜ — sunucunun cümlesi, varsa.
   *
   * Atama kalkınca satır sahibine (bağlantının şirketine) dönüyor. Ajansın
   * havuzunda aynı hesabın ikizi varsa dönemiyor ve şirketin havuzunda
   * kalıyor; bunu söylemeden geçmek, kullanıcıyı hesabı ajans havuzunda
   * aramaya gönderirdi.
   */
  poolNote?: string | null;
  movedRows?: number;
  stayingRows?: number;
  leftBehind?: Record<string, number>;
  clientWide?: Record<string, number>;
  unlinkedBoostPages?: number;
  /**
   * Yalnızca müşteri ajansın atamasını kaldırdığında dolu. `false` = mail
   * GİDEMEDİ; kullanıcı ajansına ayrıca haber vermeli. Sessizce "bildirildi"
   * sanılmasın diye iki hâl ayrı yazılıyor.
   */
  ajansaBildirildi?: boolean;
};

/** Etiketler SUNUCUDAN geliyor (`leftBehind` anahtarları); onların dili D4'te. */
function adetler(kalan: Record<string, number>, dil: Dil): string {
  return Object.entries(kalan)
    .map(([etiket, n]) => `${formatNumber(n, dil)} ${etiket}`)
    .join(', ');
}

export function atamaBildirimi(res: AtamaYaniti, atandiMi: boolean, dil: Dil = 'tr'): string | null {
  const d = sec(baglantilarSozlugu, dil).atama;
  const parcalar: string[] = [];

  if (res.note) parcalar.push(res.note);
  if (res.ajansaBildirildi === true) parcalar.push(d.ajansaBildirildi);
  if (res.ajansaBildirildi === false) {
    parcalar.push(d.ajansaGidemedi);
  }
  if (res.poolNote) parcalar.push(res.poolNote);

  if (atandiMi) {
    if ((res.movedRows ?? 0) > 0) {
      parcalar.push(d.tasindi(formatNumber(res.movedRows!, dil)));
    }
  } else if ((res.stayingRows ?? 0) > 0) {
    /*
     * KALDIRMADA EN ÖNEMLİ CÜMLE BU. Çocuk tabloların `client_id`'si NOT NULL,
     * yani hesabı havuza almak veriyi boşta bırakamıyor; veri eski müşteride
     * KALIYOR. Söylenmezse "hesabı kaldırdım, geçmişim gitti mi" sorusu
     * doğuyor ve cevabı hiçbir ekranda yok.
     */
    parcalar.push(d.kaldi(formatNumber(res.stayingRows!, dil)));
  }

  const kalan = res.leftBehind ?? {};
  if (Object.keys(kalan).length > 0) {
    parcalar.push(d.kalanlar(adetler(kalan, dil)));
  }

  const genel = res.clientWide ?? {};
  if (Object.keys(genel).length > 0) {
    /*
     * HESABA BAĞLI OLMAYAN KAYITLAR `kalan` LİSTESİNDE GÖRÜNMÜYOR — hiçbir
     * hesaba bağlı olmadıkları için hesaba göre sayan sorguya düşmüyorlar.
     * Oysa bu hesabı gerçekten yöneten kayıtlar çoğunlukla bunlar: "tüm
     * hesaplar" kuralı ve ay geneli bütçe. Ayrı bir cümle olmasaydı,
     * taşımadan en çok etkilenen şey hakkında hiçbir şey söylenmezdi.
     */
    parcalar.push(d.genel(adetler(genel, dil)));
  }

  if ((res.unlinkedBoostPages ?? 0) > 0) {
    /*
     * BAĞ SESSİZCE KOPARILAMAZ. Akıllı Boost bu bağa bakıyor; koptuğunda
     * gönderiler boostlanmayı bırakıyor ve sebebi hiçbir ekranda yazmıyor.
     * Koparmamak ise daha kötüydü — başka müşterinin hesabından fatura.
     */
    parcalar.push(d.boost(formatNumber(res.unlinkedBoostPages!, dil)));
  }

  return parcalar.length > 0 ? parcalar.join(' ') : null;
}
