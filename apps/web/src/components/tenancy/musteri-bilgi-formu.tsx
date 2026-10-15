'use client';

import { useState, useTransition } from 'react';
import { AliciListesiAlani } from '@/components/alici-listesi-alani';
import { useRouter } from 'next/navigation';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Dugme } from '@/components/ui/dugme';
import { Girdi, MetinAlani } from '@/components/ui/alan';
import { Serit } from '@/components/ui/hal';
import { KOORDINAT_BICIM_MESAJI, koordinatCoz, koordinatYaz } from '@advetics/shared';
import { useSozluk } from '@/dil/saglayici';
import { sirketlerSozlugu } from '@/dil/sozlukler/ayarlar-sirketler';

type BilgiSozlugu = (typeof sirketlerSozlugu)['tr']['bilgi'];

/**
 * ALANIN ETİKETİ — sözlükten (`bilgi.alanlar`), anahtarla. "IBAN" iki dilde
 * aynı (kısaltma) ve sözlüğe girmiyor; tek kaynak hâlâ `ALANLAR` listesi.
 */
function alanEtiketi(anahtar: Alan, d: BilgiSozlugu): string {
  return anahtar === 'iban' ? 'IBAN' : d.alanlar[anahtar];
}

/**
 * ═══ MÜŞTERİ BİLGİLERİ — DÜZENLEME ═══
 *
 * İletişim ve fatura alanları YALNIZCA kurulum sihirbazında giriliyordu ve
 * panelde bunları değiştirecek hiçbir ekran yoktu: sihirbazda atlanan bir
 * e-posta bir daha girilemiyordu. Detay penceresi bu alanları listeliyor;
 * doldurulamayan bir liste kalıcı olarak "—" gösterir ve bölümün kendisi
 * ölü görünürdü.
 *
 * UÇ ZATEN VARDI (`PATCH /clients/:id`, `updateClientSchema`) — eksik olan
 * yalnızca arayüzdü.
 *
 * ALANLAR TEK LİSTEDEN TÜRETİLİYOR. Etiket, anahtar ve giriş türü üçü ayrı
 * yazılırsa bir alan eklenip biri güncellenmediğinde form sessizce eksik
 * gönderir; TypeScript de bir şey demez çünkü hepsi opsiyonel.
 */
export interface MusteriBilgileri {
  /**
   * WORKSPACE ADI — SONRADAN EKLENDİ.
   *
   * Kullanıcının tarifi: *"workspace tıkladığımda ismini düzenleyemiyorum."*
   * Uç (`PATCH /clients/:id`) adı zaten kabul ediyordu; eksik olan tek şey
   * form alanıydı. Yanlış yazılmış bir workspace adı seçiciye, raporlara ve
   * müşteriye giden maillere kadar gidiyor.
   *
   * `string | null` DEĞİL `string`: ad ZORUNLU ve boş bırakılamıyor. Diğer
   * alanlar temizlenebiliyor (boş dizge → `null`), bu temizlenemez.
   */
  name: string;
  contactName: string | null;
  /**
   * RAPOR ALICILARI — tek adres değil liste.
   *
   * `contactName`/`contactPhone` tekil kalıyor: onlar "yetkili kişi", bu alan
   * "rapor kime gidecek". İkisi farklı soru ve müşteride birden çok kişinin
   * rapor alması kural, istisna değil.
   */
  contactEmails: string[];
  contactPhone: string | null;
  website: string | null;
  address: string | null;
  /**
   * ADRESİN HARİTA KONUMU (ERİŞİM K4). Uç iki sayı döndürüyor; form TEK alan
   * gösteriyor ("enlem, boylam", Google Haritalar'ın kopyaladığı biçim) ve
   * uca `addressCoordinates` dizgesi gidiyor. İsteğe bağlı: eski çağıranlar
   * (sihirbaz) alanı taşımıyor.
   */
  addressLatitude?: number | null;
  addressLongitude?: number | null;
  taxOffice: string | null;
  taxNumber: string | null;
  iban: string | null;
  notes: string | null;
}

/** Form alanları: uç alanları + iki sayının tek alandaki hâli (`addressCoordinates`). */
type Alan = Exclude<keyof MusteriBilgileri, 'addressLatitude' | 'addressLongitude'> | 'addressCoordinates';

/*
 * `alicilar` TÜRÜ LİSTEYE EKLENDİ, alan listenin DIŞINA çıkarılmadı.
 *
 * Rapor alıcıları artık bir dizi ve onu ayrı bir JSX bloğu olarak yazmak
 * kolaydı; yazmadım. Bu dosyanın tek değişmezi "her alan TEK listeden
 * türetiliyor" ve `musteri-detay-alanlari.spec.ts` onu kilitliyor. Listenin
 * dışına çıkan bir alan, bir sonraki eklemede sessizce unutulacak olandır.
 */
const ALANLAR: {
  anahtar: Alan;
  tur: 'text' | 'email' | 'tel' | 'uzun' | 'alicilar' | 'konum';
}[] = [
  // AD İLK SIRADA: formu açan kişinin en sık değiştireceği alan bu.
  { anahtar: 'name', tur: 'text' },
  { anahtar: 'contactName', tur: 'text' },
  { anahtar: 'contactEmails', tur: 'alicilar' },
  { anahtar: 'contactPhone', tur: 'tel' },
  { anahtar: 'website', tur: 'text' },
  { anahtar: 'taxOffice', tur: 'text' },
  { anahtar: 'taxNumber', tur: 'text' },
  { anahtar: 'iban', tur: 'text' },
  { anahtar: 'address', tur: 'uzun' },
  { anahtar: 'addressCoordinates', tur: 'konum' },
  { anahtar: 'notes', tur: 'uzun' },
];

export function MusteriBilgiFormu({
  clientId,
  baslangic,
  onBitti,
}: {
  clientId: string;
  baslangic: MusteriBilgileri;
  onBitti: () => void;
}) {
  const router = useRouter();
  const t = useSozluk(sirketlerSozlugu);
  const d = t.bilgi;
  const [isPending, startTransition] = useTransition();
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [deger, setDeger] = useState<Record<Alan, string | string[]>>(() => {
    const d = {} as Record<Alan, string | string[]>;
    for (const a of ALANLAR) {
      // Liste alanı boş DİZİ ile başlıyor, boş DİZGE ile değil: iki tür aynı
      // sözlükte duruyor ve karıştırmak `map` çağrısını patlatır.
      d[a.anahtar] =
        a.tur === 'alicilar'
          ? (baslangic.contactEmails ?? [])
          : a.anahtar === 'addressCoordinates'
            ? baslangic.addressLatitude != null && baslangic.addressLongitude != null
              ? koordinatYaz({ enlem: baslangic.addressLatitude, boylam: baslangic.addressLongitude })
              : ''
            : (baslangic[a.anahtar] ?? '');
    }
    return d;
  });

  async function kaydet(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setKaydediliyor(true);
    setHata(null);
    try {
      /*
       * BOŞ ALAN DA GÖNDERİLİYOR. Yalnızca doluları göndermek, bir alanı
       * TEMİZLEMEYİ imkânsız kılardı: `undefined` "değiştirme" demek.
       * Şema boş dizgeyi `null`'a çeviriyor, yani temizleme uçta doğru
       * karşılığını buluyor.
       */
      /*
       * AD BOŞ GÖNDERİLEMİYOR.
       *
       * Diğer alanlarda boş dizge "temizle" demek ve uç onu `null`a
       * çeviriyor; ad için aynı şey 400 demek. Sunucunun cevabını
       * beklemeden alanın yanında söylemek, "Kaydet"e basıp anlaşılmaz bir
       * hata almaktan iyi.
       */
      // Harita konumu SUNUCUYA GİTMEDEN: alanın altında zaten söylendi.
      if (koordinatCoz(String(deger.addressCoordinates ?? '')) === 'gecersiz') {
        setHata(KOORDINAT_BICIM_MESAJI);
        setKaydediliyor(false);
        return;
      }
      const yeniAd = String(deger.name ?? '').trim();
      if (yeniAd.length < 2) {
        setHata(d.adKisa);
        setKaydediliyor(false);
        return;
      }
      await apiFetch(`/clients/${clientId}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...deger, name: yeniAd }),
      });
      startTransition(() => router.refresh());
      onBitti();
    } catch (err) {
      /*
       * HATA YUTULMUYOR. Uç e-posta biçimini reddediyor ve mesajı kendisi
       * yazıyor; onu gizlemek kullanıcıya "kaydedilmedi" bile demezdi.
       */
      setHata(
        err instanceof ApiRequestError ? err.message : d.kaydedilemedi,
      );
    } finally {
      setKaydediliyor(false);
    }
  }

  return (
    <form onSubmit={kaydet} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {ALANLAR.map((a) => (
          <label
            key={a.anahtar}
            className={`block ${a.tur === 'uzun' ? 'sm:col-span-2' : ''}`}
          >
            <span className="mb-1.5 block text-13 font-semibold text-ink">{alanEtiketi(a.anahtar, d)}</span>
            {a.tur === 'alicilar' ? (
              <AliciListesiAlani
                etiket=""
                degerler={(deger[a.anahtar] as string[]) ?? []}
                onChange={(yeni) => setDeger({ ...deger, [a.anahtar]: yeni })}
                yardim={d.alicilarYardim}
              />
            ) : a.tur === 'konum' ? (
              <KonumAlani
                deger={deger[a.anahtar] as string}
                degisti={(v) => setDeger({ ...deger, [a.anahtar]: v })}
                ipucu={d.konumIpucu}
              />
            ) : a.tur === 'uzun' ? (
              <MetinAlani
                rows={2}
                value={deger[a.anahtar] as string}
                onChange={(e) => setDeger({ ...deger, [a.anahtar]: e.target.value })}
              />
            ) : (
              <Girdi
                type={a.tur}
                value={deger[a.anahtar] as string}
                onChange={(e) => setDeger({ ...deger, [a.anahtar]: e.target.value })}
              />
            )}
          </label>
        ))}
      </div>

      {hata && (
        <Serit ton="hata" baslik={t.ortak.kaydedilemediBaslik}>
          {hata}
        </Serit>
      )}

      <div className="flex items-center gap-2">
        <Dugme type="submit" ton="koyu" boyut="kucuk" disabled={kaydediliyor || isPending}>
          {kaydediliyor ? t.ortak.kaydediliyor : t.ortak.kaydet}
        </Dugme>
        <Dugme ton="hayalet" boyut="kucuk" onClick={onBitti} disabled={kaydediliyor}>
          {t.ortak.vazgec}
        </Dugme>
      </div>
    </form>
  );
}

/**
 * Harita konumu alanı — GİRİŞ ANINDA doğrulanıyor (alanı bırakınca): bozuk
 * biçim "Kaydet"e basınca değil hemen söyleniyor. Adres metninden konum
 * TAHMİN EDİLMİYOR; kullanıcı Google Haritalar'dan kopyalıyor.
 */
function KonumAlani({ deger, degisti, ipucu }: { deger: string; degisti: (v: string) => void; ipucu: string }) {
  const [hata, setHata] = useState<string | null>(null);
  return (
    <>
      <Girdi
        type="text"
        inputMode="decimal"
        placeholder="38.4237, 27.1428"
        value={deger}
        hatali={Boolean(hata)}
        onChange={(e) => {
          degisti(e.target.value);
          if (hata && koordinatCoz(e.target.value) !== 'gecersiz') setHata(null);
        }}
        onBlur={(e) => setHata(koordinatCoz(e.target.value) === 'gecersiz' ? KOORDINAT_BICIM_MESAJI : null)}
      />
      {hata ? (
        <span role="alert" className="mt-1 block text-12 text-danger-strong">
          {hata}
        </span>
      ) : (
        <span className="mt-1 block text-12 text-ink-muted">{ipucu}</span>
      )}
    </>
  );
}
