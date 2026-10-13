import { describe, expect, it } from 'vitest';
import { PANEL_KAPILARI } from '@advetics/shared';
import { ORG_ADMIN_KEY, PERMISSIONS_KEY } from '../../common/decorators';
import { ConnectionsController } from '../connections/connections.controller';
import { AutoBoostController } from './autoboost.controller';

/**
 * ═══ HAVUZDAN WORKSPACE'E ATAMANIN TEK KAPISI (MIMARI Ç-20) ═══
 *
 * Reklam hesabı ve Instagram/Facebook sayfası ataması `connection.write` +
 * `connection.manage` istiyordu; YouTube kanalı ataması yalnız
 * `connection.write`. Aynı "havuzdan ver" hareketinin kapısı kanal türüne
 * göre değişiyordu ve `connection.manage` taşımayan bir rol YouTube kanalını
 * başka bir workspace'e taşıyabiliyordu. Panel üçünü tek kapıdan
 * (`hesap.ata`) açıyor; uç da aynısı olmalı.
 */
const kapi = (proto: object, metot: string) => ({
  izinler: Reflect.getMetadata(PERMISSIONS_KEY, (proto as Record<string, unknown>)[metot] as object) as
    | string[]
    | undefined,
  orgYoneticisi: Reflect.getMetadata(ORG_ADMIN_KEY, (proto as Record<string, unknown>)[metot] as object) as
    | boolean
    | undefined,
});

describe('KRİTİK: YouTube kanal ataması havuz atamasıyla AYNI kapıda', () => {
  const youtube = kapi(AutoBoostController.prototype, 'setYouTubeChannelClient');
  const hesap = kapi(ConnectionsController.prototype, 'assignAdAccount');
  const profil = kapi(ConnectionsController.prototype, 'assignSocialProfile');

  it('tarama boşa düşmüyor — üç uçta da kapı okundu', () => {
    expect(youtube.izinler?.length).toBeGreaterThan(0);
    expect(hesap.izinler?.length).toBeGreaterThan(0);
  });

  it('üçü aynı kapı', () => {
    expect([...(youtube.izinler ?? [])].sort()).toEqual([...(hesap.izinler ?? [])].sort());
    expect(youtube).toEqual(profil);
  });

  it('panelin hesap.ata kapısının aynası', () => {
    expect([...(youtube.izinler ?? [])].sort()).toEqual([...PANEL_KAPILARI['hesap.ata'].izinler].sort());
  });

  it('kanal EKLEMEK (havuza giriş) atamadan ayrı ve değişmedi', () => {
    expect(kapi(AutoBoostController.prototype, 'addYouTubeChannel').izinler).toEqual(['connection.write']);
  });
});
