import type { CampaignGoal, SikSayfa, TenantContext } from '@advetics/shared';
import type { ClientsService } from '../tenancy/clients.service';
import type { ClientProfileService } from '../tenancy/client-profile.service';
import type { ConnectionsService } from '../connections/connections.service';

/**
 * SEÇİLİ MÜŞTERİNİN BAĞLAMI — asistana her turda VERİLİYOR, sordurulmuyor.
 *
 * ═══ NEDEN VAR ═══
 *
 * İlk sürümde asistan seçili müşteriyi HİÇ bilmiyordu: panel `?musteri=` ile
 * müşteriyi biliyordu ama modele geçirilmiyordu. Model de her turda
 * `resolve_client` ile adı aramak, sonra `list_ad_accounts` için kimliği
 * bulmak zorunda kalıyordu. Kullanıcının bildirdiği üç arıza da bundan
 * doğuyordu:
 *
 *   · "müşteriye bağlı hesapları göremiyor" — kimlik olmayınca hesap listesi
 *     de gelmiyordu,
 *   · "müşteriyi seçtiğimde o müşteriden reklam oluşturabiliyor olması lazım",
 *   · WhatsApp numarası gibi ZATEN KAYITLI bilgilerin tekrar sorulması.
 *
 * Kullanıcının cümlesi net: *"bu asistanı yapma amacımız olabildiğince uğraşı
 * azaltmak çok uğraştırıyor"*. Sistemin BİLDİĞİ hiçbir şey sorulmamalı.
 *
 * ═══ NEDEN TOOL DEĞİL, ENJEKSİYON ═══
 *
 * Bunları tool olarak bırakmak, modelin onları ÇAĞIRMASINA bel bağlamak
 * demek — çağırmazsa yine soruyor. Bağlam prompta girince arıza yapısal
 * olarak kapanıyor: bilgi zaten orada.
 */
export interface MusteriBaglami {
  clientId: string;
  ad: string;
  website: string | null;
  /** Müşteri kartındaki telefon — WhatsApp kampanyası için ADAY, kesin değil. */
  iletisimTelefonu: string | null;
  bilgiBankasi: string | null;
  hedefKitle: string | null;
  markaBilgileri: string | null;
  /** Boşsa workspace adı. */
  markaAdi: string | null;
  sektor: string | null;
  urunKategorileri: string[];
  sikSayfalar: SikSayfa[];
  anaAmac: CampaignGoal | null;
  uslup: string | null;
  vaatler: string[];
  hesaplar: Array<{ id: string; platform: string; ad: string; paraBirimi: string }>;
  sayfalar: Array<{ id: string; ad: string }>;
}

export interface BaglamDeps {
  clients: ClientsService;
  clientProfile: ClientProfileService;
  connections: ConnectionsService;
}

export async function musteriBaglamiKur(
  deps: BaglamDeps,
  ctx: TenantContext,
  clientId: string,
): Promise<MusteriBaglami | null> {
  /*
   * HATA BAĞLAMI DÜŞÜRÜYOR, TURU DEĞİL.
   *
   * Bağlam bir KOLAYLIK: yoksa asistan eskisi gibi `resolve_client` ile
   * çalışmaya devam edebiliyor. Bir bağlantı sorunu yüzünden sohbetin
   * tamamen açılmaması, çözdüğünden çok sorun üretirdi. Ama sessiz de
   * değil — çağıran `null` görünce prompta "bağlam kurulamadı" yazıyor,
   * yani model bilmediğini BİLİYOR ve soruyor.
   */
  const [clients, profil, conns] = await Promise.all([
    deps.clients.list(ctx),
    deps.clientProfile.get(ctx, clientId).catch(() => null),
    deps.connections.list(ctx, clientId).catch(() => []),
  ]);

  const client = clients.find((c) => c.id === clientId);
  if (!client) return null;

  return {
    clientId,
    ad: client.name,
    website: client.website ?? null,
    iletisimTelefonu: client.contactPhone ?? null,
    bilgiBankasi: profil?.bilgiBankasi ?? null,
    hedefKitle: profil?.hedefKitle ?? null,
    markaBilgileri: profil?.markaBilgileri ?? null,
    markaAdi: profil?.markaAdi ?? null,
    sektor: profil?.sektor ?? null,
    urunKategorileri: profil?.urunKategorileri ?? [],
    sikSayfalar: profil?.sikSayfalar ?? [],
    anaAmac: profil?.anaAmac ?? null,
    uslup: profil?.uslup ?? null,
    vaatler: profil?.vaatler ?? [],
    hesaplar: conns.flatMap((c) =>
      c.adAccounts.map((a) => ({
        id: a.id,
        platform: a.platform,
        ad: a.name,
        paraBirimi: a.currency,
      })),
    ),
    sayfalar: conns.flatMap((c) => c.socialProfiles.map((p) => ({ id: p.id, ad: p.name }))),
  };
}

/**
 * Bağlamı sistem promptuna girecek metne çevirir.
 *
 * BOŞ ALAN YAZILMIYOR: "website: yok" gibi satırlar modele doldurulacak bir
 * boşluk gibi görünüyor ve onu sormaya itiyor. Olmayan bilgi hiç
 * yazılmıyor; model gerçekten gerekiyorsa soruyor.
 */
export function baglamiMetne(b: MusteriBaglami | null): string {
  if (!b) {
    return `## Seçili müşteri

Panelden bir müşteri bağlamı KURULAMADI. Müşteriyi \`resolve_client\` ile
bul ve kimliğini tool çağrılarında kullan.`;
  }

  const satirlar: string[] = [
    `- Müşteri: ${b.ad} (clientId: ${b.clientId})`,
    '  Tool çağrılarında clientId GEREKMİYOR — boş bırakırsan bu müşteri kullanılıyor.',
  ];

  if (b.markaAdi && b.markaAdi !== b.ad) satirlar.push(`- Marka adı (reklamda bunu kullan): ${b.markaAdi}`);
  if (b.sektor) satirlar.push(`- Sektör: ${b.sektor}`);
  if (b.urunKategorileri.length > 0) {
    satirlar.push(`- Ürün/hizmet kategorileri: ${b.urunKategorileri.join(', ')}`);
  }
  if (b.anaAmac) {
    satirlar.push(
      `- Ana amaç: ${b.anaAmac}  ← kullanıcı başka bir şey söylemedikçe kampanya hedefi (goal) BU; SORMA`,
    );
  }
  /*
   * SIK SAYFALAR SİTEDEN ÖNCE. Kayıtlı sayfa listesi kullanıcının "reklam
   * buraya gitsin" dediği adresler; site ana sayfası yalnızca liste boşsa
   * yedek. Sırayı ters yazmak modeli hep ana sayfaya yönlendirirdi.
   */
  if (b.sikSayfalar.length > 0) {
    satirlar.push('- Kayıtlı sayfalar ("website" hedefinde linkUrl YALNIZCA bunlardan biri; uydurma adres YOK):');
    for (const s of b.sikSayfalar) satirlar.push(`    · ${s.ad}: ${s.url}`);
    if (b.website) satirlar.push(`- Web sitesi ana sayfası: ${b.website}`);
  } else if (b.website) {
    satirlar.push(`- Web sitesi: ${b.website}  ← "website" hedefinde linkUrl olarak KULLAN`);
  }
  if (b.iletisimTelefonu) {
    satirlar.push(
      `- Kayıtlı telefon: ${b.iletisimTelefonu}  ← WhatsApp hedefinde ADAY numara; planında bunu ÖNER, kullanıcı onaylasın`,
    );
  }

  if (b.hesaplar.length > 0) {
    satirlar.push('- Reklam hesapları:');
    for (const h of b.hesaplar) {
      satirlar.push(`    · ${h.platform} — ${h.ad} (adAccountId: ${h.id}, ${h.paraBirimi})`);
    }
  } else {
    satirlar.push('- Reklam hesabı: bu müşteriye ATANMIŞ hesap yok — taslak kurulamaz, kullanıcıya söyle.');
  }

  if (b.sayfalar.length > 0) {
    satirlar.push('- Facebook sayfaları (Meta taslağında socialProfileId olarak ZORUNLU):');
    for (const s of b.sayfalar) satirlar.push(`    · ${s.ad} (socialProfileId: ${s.id})`);
  }

  if (b.bilgiBankasi) satirlar.push(`- Bilgi Bankası: ${b.bilgiBankasi}`);
  if (b.hedefKitle) satirlar.push(`- Hedef kitle: ${b.hedefKitle}`);
  if (b.uslup) satirlar.push(`- Üslup: ${b.uslup}`);
  if (b.vaatler.length > 0) {
    satirlar.push('- Öne çıkan vaatler (metinde bunlara dayan, yenisini UYDURMA):');
    for (const v of b.vaatler) satirlar.push(`    · ${v}`);
  }
  if (b.markaBilgileri) satirlar.push(`- Marka bilgileri/öncelikleri: ${b.markaBilgileri}`);

  return `## Seçili müşteri — BU BİLGİLER ZATEN ELİNDE, SORMA

${satirlar.join('\n')}`;
}
