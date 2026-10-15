'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  UST_HESAP_ROLLERI,
  bicimKodu,
  rolEtiketi,
  type Dil,
  type Role,
  type UstHesapUyesi,
  type UstHesapUyesiEklemeYaniti,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { RolAciklamasi } from './rol-matrisi';
import { Kart } from '@/components/ui/kart';
import { Dugme } from '@/components/ui/dugme';
import { Alan, Girdi, Secim } from '@/components/ui/alan';
import { BosDurum, Serit } from '@/components/ui/hal';
import { AdHucresi, Tablo } from '@/components/ui/tablo';
import { YanPanel } from '@/components/ui/pencere';
import { useDil, useSozluk } from '@/dil/saglayici';
import { ekipSozlugu } from '@/dil/sozlukler/ayarlar-ekip';

/**
 * ═══ ÜST HESAP EKİBİ — bütün şirketleri kim yönetiyor ═══
 *
 * Ekip ekranındaki kişi rayı ŞİRKET içindeki kullanıcıları listeliyor
 * (`/members`, RLS ile aktif şirkete çivili). Üst hesaba eklenen bir
 * Yönetici'nin ev şirketi başka bir şirket olabiliyor ve o rayda hiç
 * görünmüyor — oysa bütün şirketleri yöneten kişi o. Bu bölüm o boşluğu
 * kapatıyor: `/manager-account/members`.
 *
 * Kullanıcının isteği birebir: *"o üst hesaba bir yetki atamamız lazım
 * (kişi hesabı eklememiz lazım ki yönetebilsin) sadece kendi şirketlerini
 * ve reklam hesaplarını görecek."*
 *
 * ROLLER `UST_HESAP_ROLLERI`NDEN: Yönetici ya da Reklam Yöneticisi. Müşteri
 * hesabı burada seçilemiyor — sınırı tek workspace.
 */
export function UstHesapEkibi({
  hesapAdi,
  uyeler,
  yonetebilir,
  yuklemeHatasi,
}: {
  hesapAdi: string;
  uyeler: UstHesapUyesi[];
  /** Platform sahibi ya da üst hesabın Yöneticisi. */
  yonetebilir: boolean;
  /** Liste çekilemediyse sebebi — boş liste ile karışmasın. */
  yuklemeHatasi: string | null;
}) {
  const router = useRouter();
  const { dil } = useDil();
  const t = useSozluk(ekipSozlugu);
  const d = t.ustEkip;
  const [ekleAcik, setEkleAcik] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function calistir(anahtar: string, fn: () => Promise<unknown>): Promise<void> {
    setBusy(anahtar);
    setHata(null);
    try {
      await fn();
      startTransition(() => router.refresh());
    } catch (e) {
      // HATA YUTULMUYOR: sessizce başarısız olan bir yetki değişikliği,
      // kullanıcının verdiğini sandığı bir erişim demek.
      setHata(e instanceof ApiRequestError ? e.message : t.ortak.islemBasarisiz);
    } finally {
      setBusy(null);
    }
  }

  const yoneticiSayisi = uyeler.filter((u) => u.role === 'admin').length;

  return (
    <Kart
      dolgu={false}
      baslik={d.baslik(hesapAdi)}
      /* SESSİZ KESME YOK: kaç kişi ve kaçının Yönetici olduğu yazılı. */
      baslikEki={d.baslikEki(uyeler.length, yoneticiSayisi, rolEtiketi('admin', dil))}
      eylem={
        yonetebilir && (
          <Dugme ton="ikincil" boyut="kucuk" onClick={() => setEkleAcik(true)}>
            {d.kisiEkle}
          </Dugme>
        )
      }
    >
      <p className="m-0 border-b border-line px-5 py-3 text-13 text-ink-muted">{d.aciklama}</p>

      {(yuklemeHatasi || hata) && (
        <div className="grid gap-2 border-b border-line p-4">
          {yuklemeHatasi && (
            <Serit ton="hata" baslik={d.yuklenemedi}>
              {yuklemeHatasi}
            </Serit>
          )}
          {hata && (
            <Serit ton="hata" baslik={t.ortak.yetkiDegismedi}>
              {hata}
            </Serit>
          )}
        </div>
      )}

      {uyeler.length === 0 && !yuklemeHatasi ? (
        <div className="p-4">
          <BosDurum
            baslik={d.ekipYok}
            neden={d.ekipYokNeden}
          />
        </div>
      ) : (
        <Tablo
          etiket={d.tablo}
          satirlar={uyeler}
          satirAnahtari={(u) => u.id}
          sutunlar={[
            {
              anahtar: 'kisi',
              baslik: t.ekran.kisi,
              hucre: (u) => (
                <AdHucresi
                  ad={
                    <>
                      {u.fullName}
                      {u.kendisi && <span className="ml-1.5 text-12 font-normal text-ink-muted">{t.ortak.sen}</span>}
                    </>
                  }
                  alt={`${u.email} · ${u.lastLoginAt ? d.sonGiris(tarih(u.lastLoginAt, dil)) : t.ortak.hicGirisYapmadi}`}
                />
              ),
            },
            {
              anahtar: 'rol',
              baslik: t.ortak.rol,
              hucre: (u) => (
                <span className="block w-48">
                  <Secim
                    aria-label={t.ortak.rolEtiketi(u.fullName)}
                    value={u.role}
                    disabled={!yonetebilir || busy !== null || isPending || u.kendisi}
                    onChange={(e) =>
                      void calistir(`r-${u.id}`, () =>
                        apiFetch(`/manager-account/members/${u.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ role: e.target.value }),
                        }),
                      )
                    }
                  >
                    {UST_HESAP_ROLLERI.map((r) => (
                      <option key={r} value={r}>
                        {rolEtiketi(r, dil)}
                      </option>
                    ))}
                  </Secim>
                </span>
              ),
            },
            {
              anahtar: 'eylem',
              baslik: <span className="sr-only">{t.ortak.eylemler}</span>,
              sayi: true,
              hucre: (u) =>
                yonetebilir ? (
                  <Dugme
                    ton="hayalet"
                    boyut="kucuk"
                    disabled={busy !== null || isPending || u.kendisi}
                    bekliyor={busy === `d-${u.id}`}
                    onClick={() =>
                      void calistir(`d-${u.id}`, () =>
                        apiFetch(`/manager-account/members/${u.id}`, { method: 'DELETE' }),
                      )
                    }
                  >
                    {t.ortak.kaldir}
                  </Dugme>
                ) : null,
            },
          ]}
          sayfalama={{ bas: uyeler.length === 0 ? 0 : 1, son: uyeler.length, toplam: uyeler.length }}
        />
      )}

      <YanPanel acik={ekleAcik} onKapat={() => setEkleAcik(false)} baslik={d.kisiEkleBaslik} genislik={440}>
        {ekleAcik && <UstHesabaKisiEkleModal onKapat={() => setEkleAcik(false)} />}
      </YanPanel>
    </Kart>
  );
}

function tarih(iso: string, dil: Dil): string {
  return new Date(iso).toLocaleDateString(bicimKodu(dil), { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * KİŞİ EKLEME — yoksa oluşur, varsa yalnızca üyelik alır (yan panelin içi).
 *
 * Ad ve parola alanları isteğe bağlı görünüyor çünkü var olan bir kullanıcı
 * için anlamsızlar; sunucu yeni kullanıcıda ikisini de zorunlu sayıyor ve
 * eksikse açıkça söylüyor. Hangi yolun işlediği yanıtta (`created`) yazıyor
 * ve ekranda cümleye dönüyor — "kullanıcı oluşturuldu" ile "var olan kişiye
 * yetki eklendi" farklı şeyler ve ikincisinde yazılan parola KULLANILMADI.
 */
function UstHesabaKisiEkleModal({ onKapat }: { onKapat: () => void }) {
  const router = useRouter();
  const { dil } = useDil();
  const t = useSozluk(ekipSozlugu);
  const d = t.ustEkip;
  const [eposta, setEposta] = useState('');
  const [ad, setAd] = useState('');
  const [parola, setParola] = useState('');
  const [rol, setRol] = useState<Role>('admin');
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<UstHesapUyesiEklemeYaniti | null>(null);

  async function gonder(): Promise<void> {
    setBusy(true);
    setHata(null);
    try {
      const r = await apiFetch<UstHesapUyesiEklemeYaniti>('/manager-account/members', {
        method: 'POST',
        body: JSON.stringify({
          email: eposta.trim(),
          role: rol,
          ...(ad.trim() !== '' ? { fullName: ad.trim() } : {}),
          ...(parola !== '' ? { password: parola } : {}),
        }),
      });
      setSonuc(r);
      router.refresh();
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : d.eklenemedi);
    } finally {
      setBusy(false);
    }
  }

  if (sonuc) {
    return (
      <div className="grid gap-4">
        <Serit
          ton="bilgi"
          baslik={d.eklendi(sonuc.uyelik.fullName, rolEtiketi(sonuc.uyelik.role, dil))}
        >
          {sonuc.created ? d.yeniOlusturuldu(sonuc.uyelik.email) : d.zatenKayitli(sonuc.uyelik.email)}
        </Serit>
        <div className="flex justify-end border-t border-line pt-4">
          <Dugme ton="ikincil" onClick={onKapat}>
            {d.tamam}
          </Dugme>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <Serit ton="bilgi" baslik={d.butunSirketler}>
        {d.butunSirketlerGovde}
      </Serit>

      <Alan etiket={t.ortak.eposta}>
        <Girdi type="email" value={eposta} onChange={(e) => setEposta(e.target.value)} />
      </Alan>
      <Alan etiket={t.ortak.adSoyad} ipucu={d.yeniKullaniciIcin}>
        <Girdi value={ad} onChange={(e) => setAd(e.target.value)} />
      </Alan>
      <Alan etiket={t.ortak.parola} ipucu={d.parolaIpucu}>
        <Girdi type="password" value={parola} onChange={(e) => setParola(e.target.value)} />
      </Alan>

      <Alan etiket={t.ortak.rol} ipucu={<RolAciklamasi rol={rol} />}>
        <Secim value={rol} onChange={(e) => setRol(e.target.value as Role)}>
          {UST_HESAP_ROLLERI.map((r) => (
            <option key={r} value={r}>
              {rolEtiketi(r, dil)}
            </option>
          ))}
        </Secim>
      </Alan>

      {hata && (
        <Serit ton="hata" baslik={d.eklenemediBaslik}>
          {hata}
        </Serit>
      )}

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Dugme ton="ikincil" onClick={onKapat}>
          {t.ortak.vazgec}
        </Dugme>
        <Dugme
          onClick={() => void gonder()}
          bekliyor={busy}
          disabled={!eposta.includes('@') || (parola !== '' && parola.length < 12)}
        >
          {d.ustHesabaEkle}
        </Dugme>
      </div>
    </div>
  );
}
