import { ikiDil } from '@advetics/shared';

/*
 * Çoğul: Türkçede sayıdan sonra isim tekil kalır ("3 hesap"); İngilizcede
 * 1 dışında çoğul. Tek kural, tek yer.
 */
const cogul = (n: number, tekil: string, coklu: string) => `${n} ${n === 1 ? tekil : coklu}`;

/**
 * AYLIK BÜTÇE (`app/(dashboard)/butce`, `components/butce`,
 * `components/budget`): sayfa, genel kart, hesap satırları, tüketim çubuğu,
 * ayın tempo cümleleri ve bütçe formu. Reklam terimleri Google Ads'in
 * İngilizcesiyle (SOZLUK.md). Sayfa başlığı ve bölüm adı BURADA DEĞİL:
 * menünün kendi çevirisinden (`menuSatiriEtiketi('/butce')`).
 *
 * Sayıdan sonraki Türkçe iyelik eki (`%26’sı`) kodda (`sayiEki`): okunuşa
 * göre değişiyor ve sözlük değeri olamaz. Yüzde ve tutarlar önceden
 * biçimlenmiş metin olarak geliyor; dile göre sıra burada kuruluyor.
 */
export const butceSozlugu = ikiDil(
  {
    sayfa: {
      aciklama: 'Ay ay harcama hedefi ve gidişat. Plan AdvStrategy’de, burada ayın taahhüdü.',
      yetkiYok: 'Bütçeleri görme yetkin yok.',
      yoneticineSor: 'Yöneticine sor.',
      workspaceNeden: 'Bütçe bir workspace’in reklam hesapları için tanımlanıyor.',
    },
    ay: 'Ay',
    plan: 'plan',
    veriAlinamadi: 'Bütçe verisi alınamadı',
    sebepYok: 'Sunucu sebep bildirmedi.',
    sunucuyaUlasilamadi: 'Sunucuya ulaşılamadı.',
    uyari: {
      kurFarkli: (birimler: string) => `Farklı para birimindeki harcama toplama dâhil edilmedi (${birimler})`,
      kurNeden:
        'Kur çevrimi henüz yok; karışık bir toplamı bütçeyle karşılaştırmak yanıltıcı olurdu. O hesapları tabloda ayrı ayrı görebilirsin.',
      eksikVeri: (gecen: number, veriliGun: number) => `Eksik veri: ${gecen} günün ${veriliGun} günü senkronize`,
      eksikVeriNeden:
        'Harcama ve tüketim oranı olduğundan düşük görünüyor. Eksik günler çekilene kadar bu sayfadaki hız yorumu güvenilir değil.',
      aySonuBaslik: (aySonu: string, asim: string) =>
        `Bugünkü günlük bütçelerle ay sonunda yaklaşık ${aySonu} harcanır; aylık bütçe ${asim} aşılır`,
      aySonuGovde: (gunlukToplam: string) => `Yayındaki günlük bütçelerin toplamı ${gunlukToplam}.`,
      omurBoyu: (n: number) => `Ömür boyu bütçeli ${n} kampanya bu hesaba katılmadı.`,
      esik: (oran: string) => `Uyarı eşiği aşıldı: harcanan oran %${oran}`,
      esikDeger: (n: number) => `Eşik %${n}.`,
    },
    genel: {
      baslik: 'Workspace geneli',
      altBaslik: 'Tüm reklam hesaplarının toplamı',
      tarihineKadar: (tarih: string) => `${tarih} tarihine kadar`,
      harcandi: (butce: string) => `/ ${butce} harcandı`,
      butceYok: 'harcandı · bütçe tanımlı değil',
      kalan: 'Kalan',
      kalanGun: 'Kalan gün',
      gunlukHarcanabilir: 'Günlük harcanabilir',
      gunlukIpucu: 'Kalan bütçe ÷ kalan gün',
      aySonuTahmini: 'Ay sonu tahmini',
      aySonuIpucu: 'Bu hızla devam edilirse',
    },
    hesaplar: {
      yokBaslik: 'Reklam hesabı yok',
      yokNeden: 'Bu workspace’e bağlı reklam hesabı yok. Hesap atanınca bütçesi burada tanımlanır.',
      baslik: 'Reklam hesabı bazında',
      sayac: (aktif: number, hareketsiz: number) =>
        `${aktif} aktif${hareketsiz > 0 ? ` · ${hareketsiz} hareketsiz` : ''}`,
      hareketYok: 'Bu ay hiçbir hesabın bütçesi ya da harcaması yok.',
      hareketsizGoster: (n: number) => `Bu ay hareketi olmayan ${n} hesabı göster`,
      notBas:
        'Kırmızı çizgi ayın geçen kısmı; çubuk çizginin sağındaysa bütçe hedeften hızlı tüketiliyor. Hesaplar ',
      notKalin: 'bugün hariç',
      notSon:
        ', dünün sonuna kadar olan veriyle hesaplanıyor: gün bitmeden gelen kısmi veri her sabah "yavaş gidiyoruz" dedirtirdi.',
      altSayac: (aktif: number, toplam: number) => `${aktif} aktif / ${toplam} hesap`,
      sutunHesap: 'Hesap',
      sutunGidisat: 'Gidişat',
      sutunHarcanan: 'Harcanan',
      sutunButce: 'Bütçe',
      sutunGunluk: 'Günlük öneri',
      sutunEylem: 'Eylem',
      karisik: 'karışık',
      grupHesap: (n: number) => `${n} hesap`,
      sinirYokGrup: 'hiçbirinde bütçe sınırı yok',
      sinirVarGrup: (n: number) => `${n} hesapta bütçe sınırı var`,
      toplam: (n: number) => `Toplam · ${n} hesap`,
      gunVeri: (veri: number, gecen: number) => `${veri}/${gecen} gün veri`,
      gunVeriIpucu: (gecen: number, veri: number) => `${gecen} günün ${veri} günü senkronize`,
      sinirYok: 'Sınır yok',
      kalanIpucu: (tutar: string) => `Kalan ${tutar}`,
    },
    durum: {
      under: 'Yavaş',
      on_track: 'Hedefte',
      over: 'Hızlı',
      exhausted: 'Doldu',
      no_budget: 'Bütçe yok',
    },
    cubuk: {
      gecenKisimIpucu: (n: number) => `Ayın geçen kısmı: %${n}`,
      harcandi: (oran: string) => `%${oran} harcandı`,
      gecenKisim: (n: number) => `Ayın geçen kısmı: %${n}`,
      hedefte: 'hedefte',
      puan: (isaret: string, puan: string) => `${isaret}${puan} puan`,
    },
    tempo: {
      dun: 'Dün itibarıyla',
      tarihItibariyla: (tarih: string) => `${tarih} itibarıyla`,
      ozet: (itibariyla: string, gecen: string, harcanan: string) =>
        `${itibariyla} ayın ${gecen} geçti, bütçenin ${harcanan} harcandı`,
      yeniBasladi: 'Ay yeni başladı, tempo yarın hesaplanır',
      aySonu: (tutar: string) => `Bu hızla ay sonu: ${tutar}`,
      aySonuAsim: (tutar: string, asim: string) => `Bu hızla ay sonu: ${tutar} · bütçeyi %${asim} aşar`,
      gunluk: (tutar: string) => `Kalan günlerde günde ${tutar} harcanabilir`,
    },
    form: {
      kaydedilemedi: 'Bütçe kaydedilemedi. Tekrar deneyin.',
      silinemedi: 'Bütçe silinemedi.',
      duzenle: 'Düzenle',
      tanimla: 'Bütçe tanımla',
      butceyiDuzenle: 'Bütçeyi düzenle',
      butceyiSil: 'Bütçeyi sil',
      vazgec: 'Vazgeç',
      kaydet: 'Kaydet',
      workspaceGeneli: 'Workspace geneli',
      semsiye:
        'Şemsiye bütçe: workspace’in tüm reklam hesaplarının toplamı bu tutarla karşılaştırılır.',
      aylikButce: (birim: string | null) => `Aylık bütçe${birim ? ` (${birim})` : ''}`,
      gunlukLimit: 'Günlük limit (isteğe bağlı)',
      limitYok: 'boş = limit yok',
      uyariEsigi: 'Uyarı eşiği (%)',
      otoDurdurma: 'Otomatik durdurma (%)',
      kapali: 'boş = kapalı',
      otoDurdurmaNotu:
        'Otomatik durdurma henüz yalnızca kaydediliyor, kampanyayı durdurmuyor. Durdurmak için Kurallar’da bütçe kuralı kur.',
      not: 'Not (isteğe bağlı)',
      seritBaslik: 'Bütçe kaydedilemedi',
    },
  },
  {
    sayfa: {
      aciklama: 'Monthly spend target and pace. The plan lives in AdvStrategy, this is the commitment for the month.',
      yetkiYok: 'You do not have permission to view budgets.',
      yoneticineSor: 'Ask your admin.',
      workspaceNeden: 'Budgets are set for the ad accounts of a workspace.',
    },
    ay: 'Month',
    plan: 'planned',
    veriAlinamadi: 'Could not load budget data',
    sebepYok: 'The server did not give a reason.',
    sunucuyaUlasilamadi: 'Could not reach the server.',
    uyari: {
      kurFarkli: (birimler: string) => `Spend in other currencies was left out of the total (${birimler})`,
      kurNeden:
        'There is no currency conversion yet; comparing a mixed total with the budget would be misleading. You can see those accounts separately in the table.',
      eksikVeri: (gecen: number, veriliGun: number) => `Missing data: ${veriliGun} of ${gecen} days synced`,
      eksikVeriNeden:
        'Spend and budget usage look lower than they are. Until the missing days are pulled, the pace reading on this page is not reliable.',
      aySonuBaslik: (aySonu: string, asim: string) =>
        `With today’s daily budgets, about ${aySonu} will be spent by month end, ${asim} over the monthly budget`,
      aySonuGovde: (gunlukToplam: string) => `The daily budgets that are live add up to ${gunlukToplam}.`,
      omurBoyu: (n: number) =>
        `${n} ${n === 1 ? 'campaign' : 'campaigns'} with a lifetime budget ${n === 1 ? 'was' : 'were'} not counted.`,
      esik: (oran: string) => `Alert threshold exceeded: ${oran}% of the budget is spent`,
      esikDeger: (n: number) => `Threshold: ${n}%.`,
    },
    genel: {
      baslik: 'Workspace total',
      altBaslik: 'All ad accounts combined',
      tarihineKadar: (tarih: string) => `through ${tarih}`,
      harcandi: (butce: string) => `/ ${butce} spent`,
      butceYok: 'spent · no budget set',
      kalan: 'Remaining',
      kalanGun: 'Days left',
      gunlukHarcanabilir: 'Available per day',
      gunlukIpucu: 'Remaining budget ÷ days left',
      aySonuTahmini: 'Month-end forecast',
      aySonuIpucu: 'If the current pace continues',
    },
    hesaplar: {
      yokBaslik: 'No ad accounts',
      yokNeden: 'No ad account is linked to this workspace. Once an account is assigned, its budget is set here.',
      baslik: 'By ad account',
      sayac: (aktif: number, hareketsiz: number) =>
        `${aktif} active${hareketsiz > 0 ? ` · ${hareketsiz} inactive` : ''}`,
      hareketYok: 'No account has a budget or spend this month.',
      hareketsizGoster: (n: number) => `Show ${cogul(n, 'account', 'accounts')} with no activity this month`,
      notBas:
        'The red line is the part of the month that has passed; if the bar is to its right, the budget is being used faster than planned. Accounts are calculated ',
      notKalin: 'excluding today',
      notSon:
        ', using data through the end of yesterday: partial data that arrives before the day ends would say "running slow" every morning.',
      altSayac: (aktif: number, toplam: number) => `${aktif} active / ${cogul(toplam, 'account', 'accounts')}`,
      sutunHesap: 'Account',
      sutunGidisat: 'Pace',
      sutunHarcanan: 'Spent',
      sutunButce: 'Budget',
      sutunGunluk: 'Suggested daily',
      sutunEylem: 'Action',
      karisik: 'mixed',
      grupHesap: (n: number) => cogul(n, 'account', 'accounts'),
      sinirYokGrup: 'none has a budget limit',
      sinirVarGrup: (n: number) => `${cogul(n, 'account has', 'accounts have')} a budget limit`,
      toplam: (n: number) => `Total · ${cogul(n, 'account', 'accounts')}`,
      gunVeri: (veri: number, gecen: number) => `${veri}/${gecen} days of data`,
      gunVeriIpucu: (gecen: number, veri: number) => `${veri} of ${gecen} days synced`,
      sinirYok: 'No limit',
      kalanIpucu: (tutar: string) => `${tutar} remaining`,
    },
    durum: {
      under: 'Slow',
      on_track: 'On track',
      over: 'Fast',
      exhausted: 'Used up',
      no_budget: 'No budget',
    },
    cubuk: {
      gecenKisimIpucu: (n: number) => `Share of the month passed: ${n}%`,
      harcandi: (oran: string) => `${oran}% spent`,
      gecenKisim: (n: number) => `Month passed: ${n}%`,
      hedefte: 'on target',
      puan: (isaret: string, puan: string) => `${isaret}${puan} pts`,
    },
    tempo: {
      dun: 'As of yesterday',
      tarihItibariyla: (tarih: string) => `As of ${tarih}`,
      ozet: (itibariyla: string, gecen: string, harcanan: string) =>
        `${itibariyla}, ${gecen} of the month has passed and ${harcanan} of the budget is spent`,
      yeniBasladi: 'The month just started, pace is calculated tomorrow',
      aySonu: (tutar: string) => `At this pace, month end: ${tutar}`,
      aySonuAsim: (tutar: string, asim: string) => `At this pace, month end: ${tutar} · ${asim}% over budget`,
      gunluk: (tutar: string) => `You can spend ${tutar} per day for the rest of the month`,
    },
    form: {
      kaydedilemedi: 'Could not save the budget. Try again.',
      silinemedi: 'Could not delete the budget.',
      duzenle: 'Edit',
      tanimla: 'Set budget',
      butceyiDuzenle: 'Edit budget',
      butceyiSil: 'Delete budget',
      vazgec: 'Cancel',
      kaydet: 'Save',
      workspaceGeneli: 'Workspace total',
      semsiye:
        'Umbrella budget: the total of all the workspace’s ad accounts is compared with this amount.',
      aylikButce: (birim: string | null) => `Monthly budget${birim ? ` (${birim})` : ''}`,
      gunlukLimit: 'Daily limit (optional)',
      limitYok: 'empty = no limit',
      uyariEsigi: 'Alert threshold (%)',
      otoDurdurma: 'Auto-pause (%)',
      kapali: 'empty = off',
      otoDurdurmaNotu:
        'Auto-pause is only saved for now and does not pause campaigns. To pause, set up a budget rule under Rules.',
      not: 'Note (optional)',
      seritBaslik: 'Could not save the budget',
    },
  },
);
