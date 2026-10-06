import { z, ZodIssueCode, type ZodErrorMap } from 'zod';

/**
 * ═══ ZOD'UN HAZIR HATA CÜMLELERİ TÜRKÇE ═══
 *
 * Panel doğrulama hatasında yalnızca "Doğrulama hatası" yazıyordu ve
 * alan ayrıntısını gösterecek hâle getirildiğinde (`api.ts`) cümleler
 * İngilizce çıktı: "Invalid email", "String must contain at most 200000
 * character(s)". Rapor mailinde kullanıcı neyin yanlış olduğunu göremedi
 * (2026-10-06).
 *
 * YALNIZCA HAZIR CÜMLELER DEĞİŞİYOR. Şemaya yazılmış özel mesaj ("Tarih
 * YYYY-MM-DD biçiminde olmalı") Zod'da küresel haritadan ÖNCE geliyor ve
 * olduğu gibi kalıyor. Tanınmayan kod Zod'un kendi cümlesine düşüyor —
 * boş bir mesaj, İngilizce bir mesajdan kötü.
 *
 * KÜRESEL ve bu paketin içinden kuruluyor: API ve panel şemaları buradan
 * aldığı için aynı Zod örneğini paylaşıyorlar; haritayı uygulamaların
 * açılışına yazmak, birinde unutulması demekti.
 */
export const turkceZodHatalari: ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      return {
        message: issue.received === 'undefined' ? 'Zorunlu alan' : 'Değerin türü geçersiz',
      };
    case ZodIssueCode.invalid_string:
      if (issue.validation === 'email') return { message: 'Geçerli bir e-posta adresi değil' };
      if (issue.validation === 'uuid') return { message: 'Geçersiz kimlik' };
      if (issue.validation === 'url') return { message: 'Geçerli bir adres değil' };
      return { message: 'Biçimi geçersiz' };
    case ZodIssueCode.too_small:
      if (issue.type === 'string') {
        return {
          message: Number(issue.minimum) <= 1 ? 'Boş bırakılamaz' : `En az ${issue.minimum} karakter olmalı`,
        };
      }
      if (issue.type === 'array') return { message: `En az ${issue.minimum} öğe olmalı` };
      return { message: `En az ${issue.minimum} olmalı` };
    case ZodIssueCode.too_big:
      if (issue.type === 'string') return { message: `En fazla ${issue.maximum} karakter olabilir` };
      if (issue.type === 'array') return { message: `En fazla ${issue.maximum} öğe olabilir` };
      return { message: `En fazla ${issue.maximum} olabilir` };
    case ZodIssueCode.invalid_enum_value:
      return { message: `Geçersiz seçenek (geçerli olanlar: ${issue.options.join(', ')})` };
    default:
      return { message: ctx.defaultError };
  }
};

z.setErrorMap(turkceZodHatalari);
