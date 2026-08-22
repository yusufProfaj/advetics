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
  movedRows?: number;
  stayingRows?: number;
  leftBehind?: Record<string, number>;
  clientWide?: Record<string, number>;
  unlinkedBoostPages?: number;
};

function adetler(kalan: Record<string, number>): string {
  return Object.entries(kalan)
    .map(([etiket, n]) => `${formatNumber(n)} ${etiket}`)
    .join(', ');
}

export function atamaBildirimi(res: AtamaYaniti, atandiMi: boolean): string | null {
  const parcalar: string[] = [];

  if (atandiMi) {
    if ((res.movedRows ?? 0) > 0) {
      parcalar.push(
        `${formatNumber(res.movedRows!)} kayıt bu müşteriye taşındı — kampanyalar, ` +
          'kreatifler ve geçmiş metrikler dahil.',
      );
    }
  } else if ((res.stayingRows ?? 0) > 0) {
    /*
     * KALDIRMADA EN ÖNEMLİ CÜMLE BU. Çocuk tabloların `client_id`'si NOT NULL,
     * yani hesabı havuza almak veriyi boşta bırakamıyor; veri eski müşteride
     * KALIYOR. Söylenmezse "hesabı kaldırdım, geçmişim gitti mi" sorusu
     * doğuyor ve cevabı hiçbir ekranda yok.
     */
    parcalar.push(
      `Hesabın ${formatNumber(res.stayingRows!)} kaydı eski müşteride kaldı — silinmedi. ` +
        'Başka bir müşteriye atadığında taşınacak.',
    );
  }

  const kalan = res.leftBehind ?? {};
  if (Object.keys(kalan).length > 0) {
    parcalar.push(
      `Eski müşteride kalanlar: ${adetler(kalan)}. Bunlar birinin kararı ` +
        '(bütçe, kural, taslak) ve taşınmıyor.',
    );
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
    parcalar.push(
      `Eski müşterinin ${adetler(genel)} kaydı bu hesabı artık kapsamıyor — ` +
        'bütçe oranı ve kural kapsamı kayacak, gözden geçir.',
    );
  }

  if ((res.unlinkedBoostPages ?? 0) > 0) {
    /*
     * BAĞ SESSİZCE KOPARILAMAZ. Akıllı Boost bu bağa bakıyor; koptuğunda
     * gönderiler boostlanmayı bırakıyor ve sebebi hiçbir ekranda yazmıyor.
     * Koparmamak ise daha kötüydü — başka müşterinin hesabından fatura.
     */
    parcalar.push(
      `${formatNumber(res.unlinkedBoostPages!)} sayfanın boost faturalandırma bağı koparıldı — ` +
        'hesap ve sayfa artık farklı müşterilerde. Akıllı Boost için yeniden eşleştir.',
    );
  }

  return parcalar.length > 0 ? parcalar.join(' ') : null;
}
