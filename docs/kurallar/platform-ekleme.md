# Yeni platform eklemenin gerçek yüzeyi

> CLAUDE.md'den taşındı (2026-10-16, token düzeni). İçerik DEĞİŞMEDİ, yalnız konuya göre ayrıldı.
> Yeni ders buraya, ilgili konu dosyasına EKLENİR; CLAUDE.md'ye yalnız tek satırlık işaret gider.

LinkedIn 2026-09-07'de kullanıcının açık talebiyle eklendi. O güne kadar burada
"yalnızca Meta ve Google — başka platform eklenmemeli" yazıyordu ve kilidin
gerekçesi *"istenmedi"*ydi; istenince gerekçe düştü. Yeni bir platform yine de
kendiliğinden eklenmiyor: aşağıdaki liste bir kez ödendi ve bir sonrakinde de
ödenecek.

**Platform eklemenin gerçek yüzeyi** (LinkedIn'de ölçüldü):

- `packages/shared/src/constants/platforms.ts` → `PLATFORMS` **ve**
  `ENTITY_LEVEL_LABELS`. İkincisi kritik: platformlar aynı hiyerarşiye AYNI
  adları vermiyor.
- Prisma `enum Platform` + **AYRI bir migration** (`ALTER TYPE ... ADD VALUE`
  aynı transaction'da kullanılamıyor). Şemaya yazmak veritabanını
  değiştirmiyor.
- `IAdPlatformProvider` uygulaması — arayüz **29 metot** taşıyor. Hepsini
  yazmak ZORUNLU DEĞİL: Google 23'ünü yazıyor, kalan 5'i açık hata fırlatıyor.
  Kısmi sağlayıcı kabul edilmiş bir desen.
- `provider.registry.ts` + `connections.module.ts`. Birincisini `Record<Platform,
  ...>` koruyor (derleme kırılıyor), **ikincisini hiçbir şey korumuyor** —
  Nest modül kaydı açılışta patlıyor. `linkedin-kayit.spec.ts` kaynak
  taramasıyla kilitliyor.
- `configuration.ts` → `LINKEDIN_*` ve `.env.example`.
- **ELLE YAZILMIŞ PLATFORM LİSTELERİ** — üçüncü platformun sessizce kaybolduğu
  yer burası. LinkedIn eklenirken 47 tane `'meta' | 'google'` birleşimi vardı
  ve panelde 8 dosya çifti elle yazıyordu. En sinsisi `rapor-pdf.service.ts`
  içindeki `PLATFORM_SIRASI`ydı: veri veritabanında DURUR, rapor bloğu
  ÜRETİLİR, ama döngü onu gezmediği için PDF'e HİÇ ÇİZİLMEZ. Hata yok, log
  yok — eksik sayfayı yalnızca müşteri görür.

**Kasıtlı olarak DAR kalan listeler var ve genişletilmemeli:** `DRAFT_PLATFORMS`,
`ASSET_PLATFORMS`, `autoBoostPlatformSchema`. Üçü de YAZMA yollarını besliyor
ve LinkedIn'de yazma kodu yok — genişletmek, çalışmayan bir seçeneği arayüzde
göstermek olurdu.
