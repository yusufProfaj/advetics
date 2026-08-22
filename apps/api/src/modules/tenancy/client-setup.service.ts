import { Injectable, Logger } from '@nestjs/common';
import type { ClientSetupInput, ClientSetupResult, TenantContext } from '@advetics/shared';
import { ConnectionsService } from '../connections/connections.service';
import { ClientsService } from './clients.service';
import { MembersService } from './members.service';

interface Meta {
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/**
 * KURULUM SİHİRBAZI — müşteri, hesaplar ve giriş hesabı TEK ÇAĞRIDA.
 *
 * NEDEN VAR: akış "müşteri oluştur → bağlantılar ekranına git → reklam
 * hesabını ata → sayfayı ata → izlemeyi aç" idi. Kullanıcının kendi tarifi:
 * "ilk önce ekliyorum sonra izle diyorum sonra facebook instagram ekliyorum
 * hepsi angarya". Adımlardan birinin atlanması SESSİZ: izleme açılmayınca
 * hiçbir veri gelmiyor ve sebebi hiçbir ekranda yazmıyor.
 *
 * YENİ YAZMA YOLU YOK. Üç mevcut servis sırayla çağrılıyor:
 * `ClientsService.create`, `ConnectionsService.assign*`,
 * `MembersService.createMember`. Atama yolu izlemeyi açıp 90 günlük geçmişi
 * kuyruğa alıyor; kopyalamak o iki adımın bir gün birinde unutulması demekti.
 *
 * KISMİ BAŞARI GERİ ALINMIYOR. Bir hesap atanamazsa müşteri ve diğer atamalar
 * DURUYOR, sebep `failures` içinde dönüyor. Geri almak, çalışan kurulumu
 * tek bir hatalı hesap yüzünden çöpe atmak olurdu — ve kullanıcı aynı formu
 * baştan doldururdu. Ama sessiz de kalmıyor: eksik kalan her şey ekranda.
 */
@Injectable()
export class ClientSetupService {
  private readonly logger = new Logger(ClientSetupService.name);

  constructor(
    private readonly clients: ClientsService,
    private readonly connections: ConnectionsService,
    private readonly members: MembersService,
  ) {}

  async setup(
    ctx: TenantContext,
    input: ClientSetupInput,
    meta: Meta,
  ): Promise<ClientSetupResult> {
    const client = await this.clients.create(ctx, input, meta);

    /*
     * BAĞLAM YENİ MÜŞTERİYLE GENİŞLETİLİYOR — ve bu bir yetki açığı DEĞİL.
     *
     * `ctx.clientIds` istek başında kuruldu; az önce oluşturulan müşteri
     * orada yok. Atama servisleri erişimi o listeye karşı doğruluyor,
     * dolayısıyla genişletmeden çağırmak "Müşteri bulunamadı" verirdi.
     *
     * Eklenen tek kimlik, çağıranın BU İSTEKTE kendi oluşturduğu müşteri.
     * Oluşturmak `client.write` istiyor ve o yetki müşteri hesabında yok;
     * yani buradan erişilebilecek yeni bir şey doğmuyor.
     */
    const scoped: TenantContext = {
      ...ctx,
      clientIds: [...ctx.clientIds, client.id],
      // AKTİF MÜŞTERİ DARALTMASI KAPATILIYOR: oturumda başka bir müşteri
      // seçiliyse RLS yeni müşterinin satırlarını gizlerdi ve atama
      // güncellemesi kendi görüş alanının dışına düşerdi.
      activeClientId: null,
    };

    const failures: ClientSetupResult['failures'] = [];
    let assignedAccounts = 0;
    let assignedProfiles = 0;
    /*
     * TAŞINAN SATIRLAR BURADA DA TOPLANIYOR.
     *
     * Havuzdaki bir hesap "hiç kullanılmamış" demek değil: başka bir
     * müşteriden kaldırılmış olabilir ve geçmişi hâlâ orada duruyor. Atama
     * onu taşıyor — ama dönen sayıyı okumayan bu çağıran, bir müşterinin
     * raporundaki rakamın değiştiğini SESSİZ hâle getiriyordu.
     */
    let movedRows = 0;
    const leftBehind: Record<string, number> = {};

    /*
     * ATAMALAR SIRAYLA, PARALEL DEĞİL. Her atama bir transaction açıp iki iş
     * kuyruğa alıyor; paralel çalıştırmak aynı anda onlarca kısa transaction
     * demek ve bağlantı havuzunu tüketiyor. Sıralı akış burada yeterince
     * hızlı: hesap başına milisaniyeler.
     */
    for (const id of input.adAccountIds) {
      try {
        const sonuc = await this.connections.assignAdAccount(scoped, id, client.id, meta);
        assignedAccounts++;
        movedRows += sonuc.movedRows;
        for (const [etiket, n] of Object.entries(sonuc.leftBehind)) {
          leftBehind[etiket] = (leftBehind[etiket] ?? 0) + n;
        }
      } catch (err) {
        failures.push({
          kind: 'adAccount',
          id,
          reason: err instanceof Error ? err.message : 'Atanamadı',
        });
      }
    }

    for (const id of input.socialProfileIds) {
      try {
        await this.connections.assignSocialProfile(scoped, id, client.id, meta);
        assignedProfiles++;
      } catch (err) {
        failures.push({
          kind: 'socialProfile',
          id,
          reason: err instanceof Error ? err.message : 'Atanamadı',
        });
      }
    }

    let userCreated = false;
    if (input.clientUser) {
      try {
        await this.members.createMember(
          scoped,
          {
            email: input.clientUser.email,
            fullName: input.clientUser.fullName,
            password: input.clientUser.password,
            // ROL SABİT VE İSTEMCİDEN ALINMIYOR. Bu hesap MÜŞTERİYE teslim
            // ediliyor; buradan rol seçilebilse müşteriye ajans yetkisi
            // verilebilirdi.
            role: 'client_viewer',
            clientId: client.id,
          },
          meta,
        );
        userCreated = true;
      } catch (err) {
        failures.push({
          kind: 'user',
          id: input.clientUser.email,
          reason: err instanceof Error ? err.message : 'Kullanıcı oluşturulamadı',
        });
      }
    }

    // KURULUMUN SONUCU LOG'A DA YAZILIYOR: kısmi bir kurulum panelde
    // görülmeden kapatılabilir ve "veri gelmiyor" olarak geri döner.
    this.logger.log(
      `Müşteri kurulumu "${client.name}": ${assignedAccounts} hesap, ` +
        `${assignedProfiles} sayfa, kullanıcı ${userCreated ? 'açıldı' : 'yok'}` +
        (failures.length > 0 ? `, ${failures.length} adım BAŞARISIZ` : ''),
    );

    return {
      clientId: client.id,
      name: client.name,
      assignedAccounts,
      assignedProfiles,
      userCreated,
      failures,
      movedRows,
      leftBehind,
    };
  }
}
