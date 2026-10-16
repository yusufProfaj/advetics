import { ikiDil } from '@advetics/shared';

/**
 * İYİLEŞTİR › AI ASİSTAN (`components/iyilestir/asistan-sekmesi.tsx`).
 * Asistanın kendi cevapları, araç özetleri ve hata parçaları sunucudan /
 * modelden geliyor, çevrilmez (D4). "Sık sorulanlar" birer ÖRNEK soru:
 * tıklanınca olduğu gibi asistana gönderiliyor, yani İngilizce arayüzde
 * İngilizce soru gider.
 */
export const asistanSozlugu = ikiDil(
  {
    baglantiKurulamadi: 'Bağlantı kurulamadı.',
    sohbetAcilamadi: (neden: string) => `Sohbet açılamadı: ${neden}`,
    baglantiKoptu: 'Bağlantı koptu; mesaj gönderilemedi.',
    mesajGonderilemedi: (durum: number) => `Mesaj gönderilemedi (HTTP ${durum}).`,
    akisKesildi: 'Akış yarıda kesildi; kayıtlı hâl okunuyor.',
    parcaOkunamadi: (n: number) => `${n} parça okunamadı; kayıtlı hâl gösteriliyor.`,
    baslik: 'AI Asistan',
    yeniSohbet: 'Yeni sohbet',
    soruYeri: 'Bir şey sor: “Bu hafta en çok para nereye boşa gitti?”',
    soruEtiketi: 'Asistana soru',
    sor: 'Sor',
    ozet: 'Okur, önerir, onayınla uygular. Reklam kurmaz.',
    selam: (ad: string) =>
      `Merhaba. ${ad} reklam verilerine bakabilirim: nereye para gidiyor, ne çalışıyor, ne yoruldu. Bir şey değiştirmem gerekirse önce ne yapacağımı kart olarak gösteririm, sen onaylamadan hiçbir şey değişmez.`,
    bagliDegil:
      'Asistan şu an bağlı değil: sunucuda yapay zekâ anahtarı tanımlı değil. Sorular cevaplanamaz; öneriler ve kurallar çalışmaya devam ediyor.',
    sohbetOkunamadi: (neden: string) => `Sohbet okunamadı: ${neden}`,
    yenidenDene: 'Yeniden dene',
    yaziyor: 'Asistan yazıyor',
    yavas: 'Model bu sefer yavaş cevap veriyor; en fazla 3 dakika bekleniyor.',
    sikSorulanlarBaslik: 'Sık sorulanlar',
    sorular: {
      bosaGiden: 'Bu hafta en çok para nereye boşa gitti?',
      yorulan: 'Hangi reklamlar yoruldu?',
      yeniKampanya: 'Yeni bir kampanya açmak istiyorum',
    },
    neYapabilir: 'Asistan ne yapabilir?',
    okurBaslik: 'Okur:',
    okur: 'özet, günlük seri, kampanya → reklam kırılımı, dönüşümler, bütçe temposu.',
    uygularBaslik: 'Önerir ve uygular (onayla):',
    uygular: 'Meta ve Google’da reklam veya kampanya durdurma, bütçe değişikliği.',
    yapmazBaslik: 'Yapmaz:',
    yapmaz: 'reklam kurmaz (AdvCampaign’e devreder), LinkedIn’e yazmaz.',
    devret: 'AdvCampaign’e devret',
    devretCumle: (istem: string) => `“${istem}” için AdvCampaign’de yeni bir reklam aç; rehber amaçtan bütçeye adım adım kurar.`,
    devretAc: 'AdvCampaign’de aç',
    uygulaKarti: 'Uygula kartı',
    yoksayilmis: 'Bu öneri yoksayılmış.',
    vazgecildi: 'Vazgeçildi; hiçbir şey değişmedi.',
  },
  {
    baglantiKurulamadi: 'Could not connect.',
    sohbetAcilamadi: (neden: string) => `Could not open the chat: ${neden}`,
    baglantiKoptu: 'The connection dropped; the message could not be sent.',
    mesajGonderilemedi: (durum: number) => `The message could not be sent (HTTP ${durum}).`,
    akisKesildi: 'The stream was cut off; reading the saved version.',
    parcaOkunamadi: (n: number) => `${n} ${n === 1 ? 'part' : 'parts'} could not be read; showing the saved version.`,
    baslik: 'AI Assistant',
    yeniSohbet: 'New chat',
    soruYeri: 'Ask something: “Where did the most money go to waste this week?”',
    soruEtiketi: 'Question for the assistant',
    sor: 'Ask',
    ozet: 'Reads, recommends, applies with your approval. Does not create ads.',
    selam: (ad: string) =>
      `Hi. I can look at the ad data of ${ad}: where the money goes, what works, what wore out. If I need to change something, I show you what I would do as a card first, and nothing changes until you approve.`,
    bagliDegil:
      'The assistant is not connected right now: no AI key is set on the server. Questions cannot be answered; recommendations and rules keep working.',
    sohbetOkunamadi: (neden: string) => `The chat could not be read: ${neden}`,
    yenidenDene: 'Try again',
    yaziyor: 'The assistant is typing',
    yavas: 'The model is responding slowly this time; waiting up to 3 minutes.',
    sikSorulanlarBaslik: 'Frequently asked',
    sorular: {
      bosaGiden: 'Where did the most money go to waste this week?',
      yorulan: 'Which ads have worn out?',
      yeniKampanya: 'I want to launch a new campaign',
    },
    neYapabilir: 'What can the assistant do?',
    okurBaslik: 'Reads:',
    okur: 'summary, daily series, campaign → ad breakdown, conversions, budget pacing.',
    uygularBaslik: 'Recommends and applies (with your approval):',
    uygular: 'pausing ads or campaigns and changing budgets on Meta and Google.',
    yapmazBaslik: 'Does not:',
    yapmaz: 'create ads (hands off to AdvCampaign) or write to LinkedIn.',
    devret: 'Hand off to AdvCampaign',
    devretCumle: (istem: string) =>
      `Open a new ad in AdvCampaign for “${istem}”; the guide sets it up step by step, from objective to budget.`,
    devretAc: 'Open in AdvCampaign',
    uygulaKarti: 'Apply card',
    yoksayilmis: 'This recommendation was dismissed.',
    vazgecildi: 'Cancelled; nothing changed.',
  },
);
