import { Prisma } from '@prisma/client';
import type { TxLike } from './sinyal-hesap';

/**
 * ═══ E-POSTA KANALININ GÖNDEREN KİMLİĞİ (MIMARI Ç-8) ═══
 *
 * `OdemeMailiGonderici` deseni: org YÖNETİCİSİNİN e-posta kimliği, seçim
 * DETERMİNİSTİK (en eski). Farkı: o servis organizasyona BAKMIYOR, ilk
 * yöneticiyi alıyor; burada kanal bir workspace'e ait ve kimlik o
 * workspace'in ŞİRKETİNDEN aranıyor, yoksa üst hesabın AJANS şirketinden
 * (müşteri şirketinin çoğu zaman kendi SMTP kimliği yok, ajansınki var).
 * Başka bir ajansın kimliğiyle mail atmak, müşteri listesinin yanlış adresten
 * dışarı gitmesi demek olurdu.
 *
 * `user_email_accounts` RLS'i satırı YALNIZ SAHİBİNE gösteriyor; bu sorgu
 * BYPASSRLS istemcisiyle koşmak zorunda (teslim servisi ve kanal listesinin
 * "gönderen tanımlı mı" cevabı).
 */
export interface EpostaKimligi {
  fromName: string;
  fromEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassEnc: Buffer;
}

export async function epostaGonderen(db: TxLike, orgId: string): Promise<EpostaKimligi | null> {
  const [r] = await db.$queryRaw<
    Array<{
      from_name: string;
      from_email: string;
      smtp_host: string;
      smtp_port: number;
      smtp_secure: boolean;
      smtp_user: string;
      smtp_pass_enc: Buffer | Uint8Array;
    }>
  >(Prisma.sql`
    SELECT e.from_name, e.from_email, e.smtp_host, e.smtp_port, e.smtp_secure, e.smtp_user, e.smtp_pass_enc
    ${gonderenKaynagi(orgId)}`);
  if (!r) return null;
  return {
    fromName: r.from_name,
    fromEmail: r.from_email,
    smtpHost: r.smtp_host,
    smtpPort: Number(r.smtp_port),
    smtpSecure: r.smtp_secure,
    smtpUser: r.smtp_user,
    smtpPassEnc: Buffer.from(r.smtp_pass_enc),
  };
}

/**
 * Seçim TEK yerde: gönderim ve "gönderen tanımlı mı" cevabı AYNI kimliği
 * bulmalı; ayrı yazılırsa ekran bir adres gösterip mail başka adresten gider.
 */
function gonderenKaynagi(orgId: string): Prisma.Sql {
  return Prisma.sql`
      FROM organizations o
      LEFT JOIN manager_accounts ma ON ma.id = o.manager_account_id
      JOIN memberships m ON m.client_id IS NULL AND m.role = 'admin'::"Role"
                        AND (m.org_id = o.id OR m.org_id = ma.ajans_org_id)
      JOIN user_email_accounts e ON e.user_id = m.user_id
     WHERE o.id = ${orgId}::uuid
     ORDER BY (m.org_id = o.id) DESC, e.created_at ASC
     LIMIT 1`;
}

/**
 * YALNIZ ADRES (Ajan 4, N-g). Kanal listesi "gönderen tanımlı mı" sorusu
 * için kimliğin TAMAMINI okuyordu: şifreli SMTP parolası her liste isteğinde
 * belleğe alınıyor ve atılıyordu (`connections-select.spec.ts` dersi). Kolon
 * listesi sabit ve parola içermiyor; `sinyal-kayit.spec.ts` tarıyor.
 */
export async function epostaGonderenAdresi(db: TxLike, orgId: string): Promise<string | null> {
  const [r] = await db.$queryRaw<Array<{ from_email: string }>>(Prisma.sql`
    SELECT e.from_email ${gonderenKaynagi(orgId)}`);
  return r?.from_email ?? null;
}

export const EPOSTA_GONDEREN_YOK =
  'Bu şirkette ve ajans şirketinde e-posta kimliği tanımlı bir yönetici yok. Ayarlar › E-posta kimliği bölümünden bir kimlik ekleyin.';
