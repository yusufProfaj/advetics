'use client';

import { useState } from 'react';
import { Serit } from '@/components/ui/hal';
import { BuyukSecim, SecimKarti, Soru } from '@/components/ui/sihirbaz';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { kurulumAdresi } from './kurulum-akisi';

/**
 * "TÜM ŞİRKETLER" MODUNDA WORKSPACE HANGİ ŞİRKETE KURULACAK?
 *
 * O modda tek bir aktif şirket yok ve `/clients/setup` workspace'i
 * `ctx.orgId`ye, yani kullanıcının EV şirketine kurardı. Ekran hiçbir şey
 * söylemeden yanlış şirkette bir workspace açılırdı ve kullanıcı onu
 * aradığı şirketin listesinde bulamazdı. Kurulumdan önce şirket seçiliyor
 * ve O ŞİRKETE geçiliyor.
 */
export function SirketSec({ sirketler }: { sirketler: Array<{ id: string; name: string }> }) {
  const [bekleyen, setBekleyen] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  async function sec(id: string): Promise<void> {
    setBekleyen(id);
    setHata(null);
    try {
      await apiFetch('/auth/switch-org', {
        method: 'POST',
        body: JSON.stringify({ organizationId: id }),
      });
      // TAM SAYFA: üst bardaki seçici oturumdan besleniyor ve
      // `router.refresh()` onu tazelemiyor.
      window.location.assign(kurulumAdresi('workspace', 'baglantilar'));
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Şirkete geçilemedi.');
      setBekleyen(null);
    }
  }

  /*
   * SEÇİM KARTI = TEK TIK. Şirket seçmek zaten tek kararlı bir adım; ayrıca
   * "Devam" istemek bir tıkı boşa harcardı. Geçiş sürerken bütün kartlar
   * kilitli (ikinci tık ikinci bir geçiş başlatırdı) ve seçilen kart
   * çizgisinde ve alt satırında bunu söylüyor.
   */
  return (
    <section className="grid gap-5">
      <Soru
        ust="Yeni workspace"
        soru="Workspace hangi şirkette olacak?"
        aciklama="Şu an bütün şirketleri birlikte görüyorsun. Seçtiğin şirkete geçilir ve kurulum orada devam eder."
      />
      {hata && (
        <Serit ton="hata" baslik="Şirkete geçilemedi">
          {hata}
        </Serit>
      )}
      <BuyukSecim sutun={3}>
        {sirketler.map((s) => (
          <SecimKarti
            key={s.id}
            ikon={s.name.trim().charAt(0).toLocaleUpperCase('tr') || '·'}
            baslik={<span className="block truncate">{s.name}</span>}
            aciklama="Workspace bu şirkette açılır."
            alt={bekleyen === s.id ? 'Şirkete geçiliyor…' : undefined}
            secili={bekleyen === s.id}
            disabled={bekleyen !== null}
            onClick={() => void sec(s.id)}
          />
        ))}
      </BuyukSecim>
    </section>
  );
}
