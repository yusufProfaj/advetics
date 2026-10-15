import { ikiDil } from '@advetics/shared';

/**
 * İlk ziyaret ekranı, TR·EN anahtarı ve Hesabım dil satırı.
 * Seçim ekranının BAŞLIĞI iki dilde birden yazılı ve sözlükte değil
 * bileşende (kişinin hangisini okuduğunu henüz bilmiyoruz); burada yalnız
 * seçim yapıldıktan sonra değişen metinler var.
 */
export const dilSecimiSozlugu = ikiDil(
  {
    devam: 'Devam et',
    sonraDegistir: "Daha sonra Hesabım'dan değiştirebilirsiniz.",
    anahtarEtiketi: 'Dil',
    hesabimBaslik: 'Arayüz dili',
    hesabimAciklama: 'Menü, ekranlar, hata mesajları ve size gelen mailler.',
    hesabimRaporNotu:
      "Müşteriye giden rapor PDF'i ve rapor maili bu ayarı değil, workspace'in rapor dilini kullanır.",
    kaydedilemedi: 'Dil kaydedilemedi, değişiklik yapılmadı. Tekrar deneyin.',
  },
  {
    devam: 'Continue',
    sonraDegistir: 'You can change this later in My account.',
    anahtarEtiketi: 'Language',
    hesabimBaslik: 'Interface language',
    hesabimAciklama: 'Menus, screens, error messages and the emails sent to you.',
    hesabimRaporNotu:
      "Report PDFs and report emails sent to clients use the workspace's report language, not this setting.",
    kaydedilemedi: 'Could not save the language; nothing was changed. Please try again.',
  },
);

/** Dil adları HER ZAMAN kendi dilinde yazılır (İngilizce ekranda da "Türkçe"). */
export const DIL_ADLARI = { tr: 'Türkçe', en: 'English' } as const;
export const DIL_ALT_ADLARI = { tr: 'Türkiye', en: 'International' } as const;
