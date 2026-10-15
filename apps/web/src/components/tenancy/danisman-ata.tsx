'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { WORKSPACE_ROLLERI, rolAciklamasi, rolEtiketi, type Role } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Dugme } from '@/components/ui/dugme';
import { Girdi, Secim } from '@/components/ui/alan';
import { Serit } from '@/components/ui/hal';
import { Uyari } from '@/components/ui/uyari';
import { MusteriDetay } from './musteri-detay';
import { atamaEngeli, atamalariYurut, engelKisi, type AtamaSonucu } from './danisman-atama';
import { type MemberRow } from './team-manager';
import { useDil, useSozluk } from '@/dil/saglayici';
import { ekipSozlugu } from '@/dil/sozlukler/ayarlar-ekip';

/**
 * ═══ DANIŞMAN ATA ═══
 *
 * Bu ekranda var olan bir danışmanı workspace’e atamanın YOLU YOKTU.
 * "+ Yetki ekle" yalnızca ZATEN bu listede olan kişilerin kartında duruyor —
 * yani daha önce hiç atanmamış bir danışman ekranda hiç görünmüyor ve ona
 * ulaşılamıyor. Geriye tek yol kalıyordu: üstteki "Kullanıcı ekle" formuna
 * onun e-postasını yazmak ve KULLANILMAYACAK bir parola uydurmak. Sunucu
 * "zaten kayıtlı, yalnızca yetki eklendi" diyor ama yönetici bunu ancak
 * gönderdikten SONRA öğreniyor ve uydurduğu parolanın geçerli olduğunu
 * sanabiliyor.
 *
 * ADAYLAR TEMBEL ÇEKİLİYOR. Ajans ekibi sayfa açılırken de çekilebilirdi ama
 * bu ekranın asıl işi "kimin erişimi var" sorusu; atama ara sıra yapılıyor.
 *
 * HATA YUTULMUYOR. `.catch(() => setAdaylar([]))` yazmak "henüz açmadım",
 * "yükleniyor", "atanacak kimse yok" ve "çağrı düştü" hâllerini AYNI boş
 * alana çevirirdi; dördü farklı iş.
 */

/** Adayın neden atanamadığını anlatan hâl — boş seçenek gösterip reddetmiyoruz. */
type Aday = MemberRow & { engel: string | null };

export function DanismanAta({
  clientId,
  clientName,
  /** Bu workspace’e HÂLİHAZIRDA erişimi olanlar — mükerrer atama reddediliyor. */
  mevcutUyeIdleri,
}: {
  clientId: string;
  clientName: string;
  mevcutUyeIdleri: string[];
}) {
  const router = useRouter();
  const { dil } = useDil();
  const t = useSozluk(ekipSozlugu);
  const d = t.danismanAta;
  const [, startTransition] = useTransition();
  const [acik, setAcik] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [ekip, setEkip] = useState<MemberRow[] | null>(null);
  const [arama, setArama] = useState('');
  const [secili, setSecili] = useState<Set<string>>(new Set());
  const [rol, setRol] = useState<Role>('ad_manager');
  const [atiyor, setAtiyor] = useState(false);
  const [sonuc, setSonuc] = useState<AtamaSonucu | null>(null);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    setHata(null);
    try {
      /*
       * PARAMETRESİZ `/members` AJANS EKİBİ demek: müşterinin kendi
       * görüntüleyici hesapları bu listede YOK ve olmamalı — atanacak olan
       * danışman, müşterinin kendi kullanıcısı değil.
       */
      setEkip(await apiFetch<MemberRow[]>('/members'));
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : d.getirilemedi);
    } finally {
      setYukleniyor(false);
    }
  }, [d]);

  useEffect(() => {
    if (acik && ekip === null && !yukleniyor && hata === null) void yukle();
  }, [acik, ekip, yukleniyor, hata, yukle]);

  const adaylar: Aday[] = useMemo(
    () =>
      (ekip ?? []).map((u) => {
        const kod = atamaEngeli(u.memberships, clientId);
        return { ...u, engel: kod === null ? null : engelKisi(kod, dil) };
      }),
    [ekip, clientId, dil],
  );

  const suzulmus = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr');
    if (!q) return adaylar;
    // Türkçe küçültme açıkça veriliyor: varsayılan `toLowerCase()` "İ"yi
    // "i̇" yapıyor ve "İlker" araması "ilker" ile eşleşmiyor.
    return adaylar.filter(
      (a) =>
        (a.fullName ?? '').toLocaleLowerCase('tr').includes(q) ||
        a.email.toLocaleLowerCase('tr').includes(q),
    );
  }, [adaylar, arama]);

  const atanabilir = adaylar.filter((a) => a.engel === null);

  function kapat(): void {
    setAcik(false);
    setSecili(new Set());
    setArama('');
    setSonuc(null);
  }

  function degistir(id: string): void {
    const yeni = new Set(secili);
    if (yeni.has(id)) yeni.delete(id);
    else yeni.add(id);
    setSecili(yeni);
    setSonuc(null);
  }

  async function ata(): Promise<void> {
    setAtiyor(true);
    setHata(null);

    const hedefler = [...secili].map((id) => {
      const kisi = adaylar.find((a) => a.id === id);
      return { id, ad: kisi?.fullName ?? kisi?.email ?? id };
    });

    const sonuclar = await atamalariYurut(
      hedefler,
      (id) =>
        apiFetch('/memberships', {
          method: 'POST',
          body: JSON.stringify({ userId: id, role: rol, clientId }),
        }),
      dil,
    );

    setAtiyor(false);
    setSonuc(sonuclar);
    setSecili(new Set());
    // Liste tazelensin; başarısızlar pencerede yazılı kalıyor.
    setEkip(null);
    startTransition(() => router.refresh());
  }

  return (
    <>
      <Dugme ton="ikincil" boyut="kucuk" onClick={() => setAcik(true)}>
        {d.ata}
      </Dugme>

      <MusteriDetay
        acik={acik}
        onKapat={kapat}
        baslik={clientName}
        altBaslik={d.altBaslik}
        altEylemler={
          <>
            <span className="mr-auto self-center text-xs text-ink-muted">
              {d.erisimVar(mevcutUyeIdleri.length)}
            </span>
            <Dugme ton="ikincil" onClick={kapat} disabled={atiyor}>
              {t.ortak.kapat}
            </Dugme>
            <Dugme onClick={() => void ata()} disabled={secili.size === 0 || atiyor}>
              {atiyor ? d.atiyor : d.ataSayac(secili.size)}
            </Dugme>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Girdi
            type="search"
            aria-label={d.ekipteAra}
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            placeholder={d.araYer}
            className="!w-auto min-w-0 flex-1"
          />
          <Secim
            aria-label={t.ortak.rol}
            value={rol}
            onChange={(e) => setRol(e.target.value as Role)}
            className="!w-auto"
          >
            {/* TEK WORKSPACE'E ATAMA: Yönetici yok (bkz. WORKSPACE_ROLLERI). */}
            {WORKSPACE_ROLLERI.map((r) => (
              <option key={r} value={r}>
                {rolEtiketi(r, dil)}
              </option>
            ))}
          </Secim>
        </div>
        {/* ROL AÇIKLAMASI SEÇİCİNİN ALTINDA: rolün ne yapabildiğini tahmin
            ettirmek, yanlış yetkiyi sessizce vermenin en kolay yolu. */}
        <p className="-mt-2 text-xs text-ink-muted">{rolAciklamasi(rol, dil)}</p>

        {/*
          DÖRT HÂL AYRI YAZILI: yükleniyor · çağrı düştü · ekip boş ·
          atanacak kimse kalmadı. Dördü de "boş liste" olarak görünürdü ve
          dördünün yapılacak işi farklı.
        */}
        {yukleniyor && (
          <p role="status" className="text-sm text-ink-muted">
            {d.getiriliyor}
          </p>
        )}

        {hata && (
          <Serit
            ton="hata"
            baslik={d.getirilemediBaslik}
            eylemler={
              <Dugme ton="ikincil" boyut="kucuk" onClick={() => void yukle()}>
                {d.tekrarDene}
              </Dugme>
            }
          >
            {hata}
          </Serit>
        )}

        {ekip !== null && ekip.length === 0 && (
          <p className="rounded-alan bg-surface-muted px-3 py-2 text-xs text-ink-muted">{d.ekipBos}</p>
        )}

        {ekip !== null && ekip.length > 0 && atanabilir.length === 0 && (
          <p className="rounded-alan bg-surface-muted px-3 py-2 text-xs text-ink-muted">{d.herkesVar}</p>
        )}

        {suzulmus.length > 0 && (
          <ul className="space-y-1">
            {suzulmus.map((a) => (
              <li key={a.id}>
                <label
                  className={`flex items-center gap-3 rounded-alan border px-3 py-2 ${
                    a.engel
                      ? 'cursor-not-allowed border-line opacity-60'
                      : 'cursor-pointer border-line hover:border-brand'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={secili.has(a.id)}
                    disabled={a.engel !== null || atiyor}
                    onChange={() => degistir(a.id)}
                    className="h-4 w-4 shrink-0 accent-[var(--brand-primary)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">
                      {a.fullName ?? a.email}
                    </span>
                    <span className="block truncate text-xs text-ink-muted">{a.email}</span>
                  </span>
                  {a.engel && (
                    <span className="shrink-0 text-[11px] text-ink-muted">{a.engel}</span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        )}

        {/* Sessiz kesme yok: kaç kişinin süzüldüğü ve toplamın kaç olduğu yazılı. */}
        {ekip !== null && arama.trim() !== '' && (
          <p className="text-xs text-ink-muted">
            {t.ortak.kisiSayaci(suzulmus.length, adaylar.length)}
          </p>
        )}

        {sonuc && (
          <Uyari
            ton={sonuc.hatalar.length > 0 ? 'tehlike' : 'basari'}
            baslik={d.atandi(sonuc.basarili)}
          >
            {/* KISMİ BAŞARI TEK TEK YAZILI. "3 kişi atandı" deyip dördüncüsünü
                yutmak, atandığı sanılan birinin panelde hiçbir şey görememesi
                demek ve sebebi hiçbir ekranda yazmaz. */}
            {sonuc.hatalar.length > 0 && (
              <ul className="mt-1 list-disc pl-4">
                {sonuc.hatalar.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            )}
          </Uyari>
        )}
      </MusteriDetay>
    </>
  );
}
