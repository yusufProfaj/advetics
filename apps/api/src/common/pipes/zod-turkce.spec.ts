import { describe, expect, it } from 'vitest';
import { reportSendSchema } from '@advetics/shared';

/**
 * ═══ DOĞRULAMA CÜMLELERİ TÜRKÇE — ve şemanın özel mesajı korunuyor ═══
 *
 * Panel alan ayrıntısını göstermeye başlayınca Zod'un hazır cümleleri
 * ("Invalid email") ekrana İngilizce çıkacaktı. Harita `@advetics/shared`
 * içinden küresel kuruluyor; burada API'nin gördüğü şemayla sınanıyor.
 */
describe('turkceZodHatalari', () => {
  const mesajlar = (girdi: Record<string, unknown>) => {
    const r = reportSendSchema.safeParse(girdi);
    if (r.success) throw new Error('girdi geçmemeliydi');
    return Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]));
  };

  it('KRİTİK: hazır cümleler Türkçe', () => {
    const m = mesajlar({
      clientId: '828673df-0796-44ef-9837-32fa0206b87b',
      from: '2026-09-01',
      to: '2026-09-30',
      to_emails: ['a@b.com', 'yanlis'],
      subject: '',
      html: 'x'.repeat(200_001),
    });
    expect(m['to_emails.1']).toBe('Geçerli bir e-posta adresi değil');
    expect(m.subject).toBe('Boş bırakılamaz');
    expect(m.html).toBe('En fazla 200000 karakter olabilir');
  });

  it('şemaya yazılmış özel mesaj EZİLMİYOR', () => {
    const m = mesajlar({
      clientId: '828673df-0796-44ef-9837-32fa0206b87b',
      from: '2026-09-01',
      to: '2026-09-31',
      subject: 'k',
      html: 'x',
    });
    expect(m.to).toBe('Geçersiz tarih');
  });

  it('eksik alan "Zorunlu alan"', () => {
    const m = mesajlar({ from: '2026-09-01', to: '2026-09-30', subject: 'k', html: 'x' });
    expect(m.clientId).toBe('Zorunlu alan');
  });
});
