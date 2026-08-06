/**
 * PM2 süreç tanımları — üretim.
 *
 * ÜÇ süreç çalışır:
 *
 *   advetics-web     →  127.0.0.1:3598   Next.js paneli. Nginx `/` altına bağlar.
 *   advetics-api     →  127.0.0.1:3599   NestJS API. Nginx `/api` altına bağlar.
 *   advetics-worker  →  port YOK         BullMQ senkronizasyon worker'ı.
 *
 * Web ve API YALNIZCA localhost'u dinler; dışarıya açılan tek şey Nginx'tir.
 * Worker hiç dinlemiyor (`createApplicationContext`) — dışarıdan erişilemez.
 * Sunucu güvenlik duvarında 3598 ve 3599 kapalı kalmalıdır (bkz. DEPLOYMENT.md).
 *
 * Ortam değişkenleri buradan DEĞİL, monorepo kökündeki .env dosyasından okunur:
 *   - API   : ConfigModule envFilePath ile kökteki .env'i yükler
 *   - Web   : next.config.ts kökteki .env'i yükler (build anında)
 * Böylece tek bir dosya iki süreci de besler ve sırlar pm2 config'ine sızmaz.
 *
 * Kullanım:  pm2 startOrReload ecosystem.config.js --update-env
 */
module.exports = {
  apps: [
    {
      name: 'advetics-api',
      cwd: './apps/api',
      script: 'dist/main.js',
      instances: 1,
      // fork modu: Modül 3'te BullMQ worker'ları eklenecek ve zamanlanmış
      // işlerin çoğaltılmaması gerekiyor. Cluster moduna geçilirse her kural
      // instance sayısı kadar çalışır ve bütçeler birden fazla kez değişir.
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        API_PORT: '3599',
        API_HOST: '127.0.0.1',
      },
      max_memory_restart: '512M',
      autorestart: true,
      // Açılışta patlayan bir sürecin sonsuz döngüye girmesini engeller.
      min_uptime: '20s',
      max_restarts: 10,
      restart_delay: 2000,
      // Log yolu belirtilmedi: pm2 kendi dizinini kullanır (~/.pm2/logs).
      // Göreli yol vermek riskli — pm2'nin bunu `cwd`'ye mi yoksa çağrıldığı
      // dizine mi göre çözdüğü sürüme göre değişiyor ve loglar repo dışına
      // düşebiliyor. Rotasyon için: pm2 install pm2-logrotate
      merge_logs: true,
      time: true,
    },
    {
      name: 'advetics-web',
      cwd: './apps/web',
      script: './node_modules/next/dist/bin/next',
      args: 'start --port 3598 --hostname 127.0.0.1',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: '3598',
      },
      max_memory_restart: '768M',
      autorestart: true,
      min_uptime: '20s',
      max_restarts: 10,
      restart_delay: 2000,
      merge_logs: true,
      time: true,
    },
    {
      name: 'advetics-worker',
      cwd: './apps/api',
      script: 'dist/worker.js',
      // TEK INSTANCE — pazarlık konusu değil.
      //
      // Worker açılışta BullMQ zamanlayıcılarını kuruyor ve senkronizasyon
      // işlerini yürütüyor. İkinci bir instance:
      //   · Modül 5'te her kuralı iki kez çalıştırır → bütçe iki kez değişir,
      //     kampanya iki kez durdurulur. Gerçek para kaybı.
      //   · Aynı hesabın kotasını iki kat hızlı tüketir → platform bloklar.
      // BullMQ'nun kilitleri işi tek kez ÇALIŞTIRMAYI garanti ediyor ama
      // eşzamanlılığı süreç içinde ayarlamak (concurrency: 4) doğru yol.
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      // API'den yüksek: 90 günlük backfill yanıtları büyük JSON'lar.
      max_memory_restart: '768M',
      autorestart: true,
      min_uptime: '20s',
      max_restarts: 10,
      restart_delay: 5000,
      // İşlerin bitmesi için süre tanı. Worker SIGTERM'de çalışan işleri
      // bekliyor; erken SIGKILL yarım senkronizasyon bırakır.
      kill_timeout: 30000,
      merge_logs: true,
      time: true,
    },
  ],
};
