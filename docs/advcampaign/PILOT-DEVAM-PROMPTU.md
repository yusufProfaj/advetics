# Pilot işine devam promptu

Yeni bir Claude Code oturumuna aşağıdaki metni olduğu gibi yapıştır.

---

Advetics'te "Pilot" işine (AdvStrategy + AdvCampaign'in yapay zekâ odaklı yeniden kurgusu) devam
ediyoruz. Kaldığımız yer `docs/advcampaign/PILOT-DEVIR.md` içinde; önce onu ve `CLAUDE.md`'yi oku.
İş `claude/advcampaign-agents-strategy-1d8a19` dalında, main'e birleştirilmedi, deploy edilmedi.

Kurallar:
- Beş ajan düzeni (CLAUDE.md "BEŞ AJAN, MODÜL MODÜL"). Ajan 4 kapısı şu an KAPALI; kapı açılmadan
  main'e birleştirme ve deploy yok.
- `docs/advcampaign/MIMARI.md` §9 KARARLAR ve PILOT-DEVIR.md'deki kullanıcı kararları kapandı,
  yeniden sorma.
- `pnpm` PATH'te yok, `npx -y pnpm@9 ...` kullan. Tam API test paketini tek başına ve ön planda koş.
- Push'tan önce `git pull --rebase`; force push yok.

Sırayla:
1. Bana tek soruyu sor: reklam metni (a) plan hazırlanırken yazılıp plan belgesinde önizlemeyle
   görünsün ve müşteri onayı metni de kapsasın (önerilen), ya da (b) onaydan sonra yazılsın ve
   yayından önce ajansa "metinleri onayla" adımı gelsin.
2. Cevaba göre düzeltmeleri ajanlara dağıt: Ajan 1 → B-3, `kuruluyor` durumundan çıkış, (a ise)
   onay özetine metin; Ajan 2 → B-4, B-1, B-2, B-5, override'lı üyeliklerin `strategy.publish`
   alması, ajans adına onayın denetim kaydı, atıf standardının onayda kontrolü (C-16); Ajan 3 →
   (a ise) plan belgesinde metin önizlemesi.
3. Ajan 4'ü yeniden koştur: `ajan4-kapi.spec.ts` içindeki `it.fails` testlerini `it`e çevir,
   tam API paketini sonuna kadar koş, kapı kararını ver.
4. Kapı açıksa Ajan 5: PILOT-DEVIR.md'deki salt okunur SQL'leri bana ver, migration sırasını
   kontrol et, `docs/DEVAM.md`yi güncelle, deploy komutunu ver (deploy'u kendin yapma).

Her adımın sonunda bana en fazla beş satırla ne olduğunu yaz.
