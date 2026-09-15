import { aramaAdresi } from '@/lib/arama-adresi';

/**
 * ═══ ARAMA REKLAMI ÖNİZLEMESİ — METİN REKLAMININ "KREATİFİ" METNİDİR ═══
 *
 * Google arama reklamının görseli yok ve olmayacak. Reklam Keşfi'nde o
 * reklamlar için görsel kutusu hiç çizilmiyordu; kart sadece adı, kampanyayı
 * ve metni listeliyordu. Sonuç: ekranın asıl sorusu olan "bu reklam NE
 * DİYOR" cevapsız kalıyordu.
 *
 * GERÇEK ARAMA SONUCUNUN YAPISI TAKLİT EDİLİYOR ve sıra Google'ın kendi
 * sırası: sponsorlu etiketi, site simgesi + alan adı, kırıntı yolu, mavi
 * başlık, açıklama. İlk sürümde yalnızca rozet, adres ve başlık vardı;
 * kullanıcının tarifi "gerçek reklamdaki gibi görünsün" oldu ve eksik olan
 * tam da bu sıra ve biçimdi.
 *
 * UYDURMA YOK: olmayan alan çizilmiyor, boş yer tutucu konmuyor.
 *
 * ┌─ SİTE SİMGESİ UZAKTAN ÇEKİLMİYOR ──────────────────────────────────────┐
 * │ Gerçek sonuçta orada sitenin favicon'u duruyor. Onu getirmek, panelin  │
 * │ VERİTABANINDAN gelen bir adrese istek atması demek ve bu depoda dışarı │
 * │ giden her istek beyaz listeyle kapalı (CLAUDE.md). Yerine nötr bir     │
 * │ dünya simgesi çiziliyor: görünümü taşıyor, ağa çıkmıyor.               │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ TEK BİR KOMBİNASYON GÖSTERİLİYOR ────────────────────────────────────┐
 * │ Duyarlı arama reklamında on beşe kadar başlık ve dörde kadar açıklama  │
 * │ var; hangi kombinasyonun yayınlanacağına Google karar veriyor.         │
 * │ Senkronizasyon yalnızca İLKİNİ saklıyor (`mapGoogleCreative`), yani bu │
 * │ önizleme reklamın gördüğü tek hâli değil, örnek bir hâli. Not KUTUNUN  │
 * │ DIŞINDA: içeride olsaydı taklit ettiğimiz görünümü bozardı.            │
 * └────────────────────────────────────────────────────────────────────────┘
 */
export function AramaReklamiOnizleme({
  baslik,
  aciklama,
  gorunenAdres,
  hedefAdres,
  className = '',
}: {
  baslik: string | null;
  aciklama: string | null;
  gorunenAdres: string | null;
  hedefAdres: string | null;
  className?: string;
}) {
  const adres = aramaAdresi(hedefAdres, gorunenAdres);

  return (
    <div className={className}>
      <div
        className="rounded-lg border border-line bg-surface p-3"
        aria-label="Arama reklamı önizlemesi"
      >
        <p className="text-[11px] font-bold text-ink">Ücretli sponsorlu reklam</p>

        {adres.alanAdi && (
          <div className="mt-2 flex items-start gap-2">
            <DunyaSimgesi />
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium text-ink">{adres.alanAdi}</p>
              {adres.kirintiYolu && (
                <p className="truncate text-[11px] text-arama-adres">{adres.kirintiYolu}</p>
              )}
            </div>
          </div>
        )}

        {/*
          BAŞLIK MAVİ VE EN BÜYÜK METİN. Gerçek sonuçta da öyle ve gözün ilk
          gittiği yer orası. Renk MARKA rengi DEĞİL (bkz. `--arama-baslik`):
          beyaz etiketli üründe marka rengi her müşteride farklı ama Google'ın
          sonucu herkeste aynı görünüyor.
        */}
        <p className="mt-1.5 line-clamp-2 text-[15px] font-medium leading-snug text-arama-baslik">
          {baslik ?? 'Başlık yok'}
        </p>

        {aciklama && (
          <p className="mt-1 line-clamp-3 text-[12px] leading-snug text-ink-muted">{aciklama}</p>
        )}
      </div>

      <p className="mt-1 text-[10px] text-ink-muted">Örnek bir başlık ve açıklama</p>
    </div>
  );
}

/** Sitenin simgesi yerine nötr işaret. Gerekçe bileşenin başlığında. */
function DunyaSimgesi() {
  return (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-sunken">
      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" className="text-ink-muted">
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path
          d="M1.5 8h13M8 1.5c1.8 1.8 2.8 4 2.8 6.5S9.8 12.7 8 14.5C6.2 12.7 5.2 10.5 5.2 8S6.2 3.3 8 1.5z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      </svg>
    </span>
  );
}
