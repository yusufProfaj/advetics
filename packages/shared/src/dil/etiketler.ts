import { ROL_ACIKLAMASI, ROL_ETIKETI, SAHIP_ACIKLAMASI, SAHIP_ETIKETI } from '../auth/rol-matrisi';
import type { Role } from '../auth/roles';
import { PAKET_SINIRLARI } from '../constants/paketler';
import {
  ACILIS_ADI,
  AYARLAR_SEKMELERI,
  MARKA_MERKEZI_BOLUMLERI,
  VARLIKLAR_SEKMELERI,
  type AyarlarSekmeKodu,
  type MarkaMerkeziBolumKodu,
  type VarliklarSekmeKodu,
} from '../panel/adresler';
import { PANEL_KAPILARI, type PanelKapiAnahtari } from '../panel/kapilar';
import type { Dil } from './index';

/**
 * ═══ SHARED'DAKİ EKRAN ETİKETLERİNİN İNGİLİZCESİ (D2, docs/i18n/MIMARI.md) ═══
 *
 * Türkçe etiketler yerinde kalıyor (sözleşmenin parçası; API ve testler
 * onları okuyor). İngilizce karşılıkları burada, anahtar kümesi Türkçe
 * tablonun TİPİNDEN: rol, sekme, kapı ya da paket eklenip burası
 * unutulursa DERLEME kırılır, ekranda Türkçe etiket sessizce kalmaz.
 * Ekran kodu Türkçe sabiti DOĞRUDAN okumaz; aşağıdaki yardımcılardan geçer.
 */
const ROL_EN: Record<Role, string> = {
  admin: 'Administrator',
  ad_manager: 'Ad Manager',
  client_viewer: 'Client',
};

const ROL_ACIKLAMASI_EN: Record<Role, string> = {
  admin:
    'Manages everything within the scope it is given: adds people, opens companies and workspaces, connects platforms, publishes ads. Cannot see another agency account.',
  ad_manager:
    'Manages the workspaces of the companies it is authorized for: publishes ads, writes rules and budgets, assigns ad accounts, refreshes data. Cannot add people or open companies.',
  client_viewer:
    "The workspace's own sign-in account. Only Overview, Ads Manager and Reports; changes the date range, sees and refreshes its data. Sees and approves the monthly media plan. Does not see the ad screens.",
};

const SAHIP_EN = 'Owner';
const SAHIP_ACIKLAMASI_EN =
  'The account that operates Advetics. Does everything: sets up agency accounts, chooses plans, switches to every agency account. Cannot be granted from the panel.';

const AYAR_SEKMESI_EN: Record<AyarlarSekmeKodu, { ad: string; kisaAd: string }> = {
  sirketler: { ad: 'Companies and workspaces', kisaAd: 'Companies' },
  baglantilar: { ad: 'Platform connections', kisaAd: 'Connections' },
  ekip: { ad: 'Team and security', kisaAd: 'Team and security' },
  hesabim: { ad: 'My account', kisaAd: 'My account' },
};

const MARKA_BOLUMU_EN: Record<MarkaMerkeziBolumKodu, string> = {
  kurulum: 'Setup',
  marka: 'Brand',
  workspace: 'Workspace details',
};

const VARLIK_SEKMESI_EN: Record<VarliklarSekmeKodu, string> = {
  gorseller: 'Images',
  kreatifler: 'Creatives',
  formlar: 'Forms',
  kitleler: 'Audiences',
};

const KAPI_NEDENI_EN: Record<PanelKapiAnahtari, string> = {
  'sirket.yonet': 'Company management is for administrators.',
  'sirket.sil': 'Deleting a company is for administrators.',
  'workspace.ekle': 'You do not have permission to open workspaces.',
  'workspace.tasi': 'Moving a workspace is for administrators.',
  'workspace.arsivle': 'Archiving is for administrators.',
  'workspace.geriAl': 'Restoring from the archive is for administrators.',
  'ustHesap.yonet': 'Only Advetics manages agency accounts.',
  'baglanti.yetkilendir': 'Connecting platforms is for administrators.',
  'baglanti.kaldir': 'Removing a connection is for administrators.',
  'baglanti.hesaplariTara': 'You do not have permission to scan accounts.',
  'hesap.ata': 'Assigning accounts is for administrators.',
  'hesap.izleme': 'You do not have permission to change tracking.',
  'youtube.ekle': 'You do not have permission to add channels.',
  'veri.topluGuncelle': 'Bulk refresh is for administrators.',
  'ekip.yonet': 'Adding people and granting access is for administrators.',
  'ikiAdim.sirketZorunlulugu': "The company's security rule is set by an administrator.",
  'ustHesapEkibi.yonet': "The agency account's team is managed by its administrator.",
  'eposta.duzenle': 'You do not have permission to send reports.',
  'okumaApi.yonet': 'Platform owner only.',
  'markaMerkezi.gor': 'You do not have access to Brand Center.',
  'kurulum.yaz': 'You do not have permission to change the setup.',
  'kurulum.hesap': 'Assigning accounts is for administrators.',
  'kurulum.beyan': 'You do not have permission to change the setup scope.',
  'sirketKurulum.beyan': "The company's security decision is made by an administrator.",
  'veriKaynagi.yonet': 'Connecting data sources is for administrators.',
  'veriKaynagi.yaz': 'You do not have permission to change the data source.',
  'marka.yaz': 'You do not have permission to change brand details.',
  'logo.yaz': 'You do not have permission to upload a logo.',
  'firma.yaz': 'You do not have permission to change workspace details.',
  'erisim.gor': 'You do not have permission to see the team.',
  'bildirim.gor': 'You do not have permission to see notification channels.',
  'bildirim.yaz': 'You do not have permission to add notification channels.',
  'veriDurumu.gor': 'You do not have permission to see the data status.',
  'varliklar.gor': 'You do not have permission to see assets.',
  'varlik.yaz': 'You do not have permission to upload assets.',
  'kitle.yaz': 'You do not have permission to save audiences.',
};

const PAKET_EN: Record<keyof typeof PAKET_SINIRLARI, { etiket: string; aciklama: string }> = {
  baslangic: { etiket: 'Starter', aciklama: 'One company, two ad accounts. To connect your own account and get started.' },
  buyume: { etiket: 'Growth', aciklama: 'Up to five companies, ten ad accounts.' },
  ajans: { etiket: 'Agency', aciklama: 'Unlimited companies and ad accounts. For agencies managing several companies.' },
};

const ACILIS_ADI_EN = 'New company / workspace';

export function rolEtiketi(rol: Role, dil: Dil): string {
  return dil === 'en' ? ROL_EN[rol] : ROL_ETIKETI[rol];
}
export function rolAciklamasi(rol: Role, dil: Dil): string {
  return dil === 'en' ? ROL_ACIKLAMASI_EN[rol] : ROL_ACIKLAMASI[rol];
}
export function sahipEtiketi(dil: Dil): string {
  return dil === 'en' ? SAHIP_EN : SAHIP_ETIKETI;
}
export function sahipAciklamasi(dil: Dil): string {
  return dil === 'en' ? SAHIP_ACIKLAMASI_EN : SAHIP_ACIKLAMASI;
}
export function ayarSekmesiAdi(kod: AyarlarSekmeKodu, dil: Dil, kisa = false): string {
  if (dil === 'en') return kisa ? AYAR_SEKMESI_EN[kod].kisaAd : AYAR_SEKMESI_EN[kod].ad;
  const s = AYARLAR_SEKMELERI.find((x) => x.kod === kod)!;
  return kisa ? s.kisaAd : s.ad;
}
export function markaBolumuAdi(kod: MarkaMerkeziBolumKodu, dil: Dil): string {
  return dil === 'en' ? MARKA_BOLUMU_EN[kod] : MARKA_MERKEZI_BOLUMLERI.find((x) => x.kod === kod)!.ad;
}
export function varlikSekmesiAdi(kod: VarliklarSekmeKodu, dil: Dil): string {
  return dil === 'en' ? VARLIK_SEKMESI_EN[kod] : VARLIKLAR_SEKMELERI.find((x) => x.kod === kod)!.ad;
}
export function kapiNedeni(anahtar: PanelKapiAnahtari, dil: Dil): string {
  return dil === 'en' ? KAPI_NEDENI_EN[anahtar] : PANEL_KAPILARI[anahtar].neden;
}
export function paketEtiketi(paket: keyof typeof PAKET_SINIRLARI, dil: Dil): { etiket: string; aciklama: string } {
  return dil === 'en' ? PAKET_EN[paket] : PAKET_SINIRLARI[paket];
}
export function acilisAdi(dil: Dil): string {
  return dil === 'en' ? ACILIS_ADI_EN : ACILIS_ADI;
}

/** Testler için: İngilizce tabloların tamamı (boş/çevrilmemiş değer bekçisi). */
export const SHARED_ETIKETLER_EN = {
  ROL_EN,
  ROL_ACIKLAMASI_EN,
  SAHIP_EN,
  SAHIP_ACIKLAMASI_EN,
  AYAR_SEKMESI_EN,
  MARKA_BOLUMU_EN,
  VARLIK_SEKMESI_EN,
  KAPI_NEDENI_EN,
  PAKET_EN,
  ACILIS_ADI_EN,
};
