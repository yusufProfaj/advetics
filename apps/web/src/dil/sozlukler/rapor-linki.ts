import { ikiDil } from '@advetics/shared';

/**
 * Herkese açık rapor sayfası (`/r/[token]`) — müşteriye giden link.
 *
 * Sayfanın DİLİ ziyaretçinin çerezinden (kök düzen), rapor belgesinin dili
 * değil: belge workspace ayarıyla yazılıyor, bu metinler onu açan kişiye.
 */
export const raporLinkiSozlugu = ikiDil(
  {
    yok: {
      baslik: 'Rapor bulunamadı',
      aciklama: 'Bağlantı hatalı olabilir ya da iptal edilmiş olabilir.',
    },
    doldu: {
      baslik: 'Bu raporun süresi doldu',
      aciklama: 'Ajansınızdan yeni bir bağlantı isteyebilirsiniz.',
    },
    pdf: 'PDF olarak kaydet',
    paylasilanaDon: 'Paylaşılan döneme dön',
    farkliDonem: (paylasilan: string, gosterilen: string) =>
      `Ajansınızın paylaştığı dönem ${paylasilan}. Şu an ${gosterilen} gösteriliyor.`,
    farkliDonemBaslik: 'Kendi seçtiğiniz döneme bakıyorsunuz',
    aralikHatasi: 'Bu tarih aralığı açılamıyor',
    aralikHatasiSonu: 'Paylaşılan dönem gösteriliyor.',
    gecersizAralik: 'Adresteki tarih aralığı tanınmadı.',
    ret: {
      erken: (gun: string) => `Rapor en erken ${gun} tarihinden itibaren açılabilir.`,
      gec: (gun: string) => `Rapor en geç ${gun} tarihine kadar açılabilir.`,
      uzun: (n: number) => `Rapor bir seferde en fazla ${n} gün açılabilir.`,
    },
    sinir: (erken: string, gec: string, n: number) =>
      `Rapor ${erken} ile ${gec} arasında, bir seferde en fazla ${n} gün açılabilir.`,
    bos: {
      baslik: 'Bu dönemde veri yok',
      veriVar: (donem: string, from: string, to: string) =>
        `${donem} arasında bu workspace'in hesaplarında kayıt bulunmuyor. Elimizdeki veri ${from} ile ${to} arasında.`,
      hicYok: (donem: string, erken: string) =>
        `${donem} arasında kayıt bulunmuyor ve ${erken} tarihinden bu yana bu workspace için hiç veri çekilmemiş.`,
    },
  },
  {
    yok: {
      baslik: 'Report not found',
      aciklama: 'The link may be wrong or it may have been revoked.',
    },
    doldu: {
      baslik: 'This report has expired',
      aciklama: 'You can ask your agency for a new link.',
    },
    pdf: 'Save as PDF',
    paylasilanaDon: 'Back to the shared period',
    farkliDonem: (paylasilan: string, gosterilen: string) =>
      `Your agency shared ${paylasilan}. You are viewing ${gosterilen}.`,
    farkliDonemBaslik: 'You are viewing a period you picked',
    aralikHatasi: 'This date range cannot be opened',
    aralikHatasiSonu: 'Showing the shared period.',
    gecersizAralik: 'The date range in the address was not recognised.',
    ret: {
      erken: (gun: string) => `The report can be opened from ${gun} onwards.`,
      gec: (gun: string) => `The report can be opened up to ${gun}.`,
      uzun: (n: number) => `The report can cover at most ${n} days at a time.`,
    },
    sinir: (erken: string, gec: string, n: number) =>
      `The report can be opened between ${erken} and ${gec}, at most ${n} days at a time.`,
    bos: {
      baslik: 'No data for this period',
      veriVar: (donem: string, from: string, to: string) =>
        `There are no records for this workspace's accounts in ${donem}. The data we have runs from ${from} to ${to}.`,
      hicYok: (donem: string, erken: string) =>
        `There are no records in ${donem}, and no data has been collected for this workspace since ${erken}.`,
    },
  },
);
