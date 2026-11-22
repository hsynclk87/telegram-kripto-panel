# Telegram Kripto Panel — Analysis Engine

Bağımsız Node.js servisidir. Telegram botu oluşturmaz. Binance Spot, Binance USD-M Futures ve Bybit Linear public market stream'lerini toplar; API ve WebSocket üzerinden Mini App'e veri sunar.

## Bileşenler

- Binance Spot: gerçekleşen işlemler, ilk 20 emir defteri seviyesi, 1 dakikalık mum.
- Binance USD-M Futures: aggregate trade, ilk 20 emir defteri seviyesi, 1 dakikalık mum, force-order likidasyonları.
- Bybit Linear: ticker, funding, open interest, public trade, orderbook ve liquidation akışı.
- Son 100 Binance Futures 1 dakikalık mumunu başlangıçta REST ile yükleyip canlı mumlarla günceller; 20 mumluk hacim tabanına göre anormal hacim ve son 60 mum aralığından destek/direnç ile hacimli kırılım kontrolleri yapar.
- Büyük işlem (whale) uyarısı: varsayılan 100.000 USDT eşik; eşik ortam değişkeniyle ayarlanabilir.
- Sinyal modülü: son 5 dakikalık agresif alış/satış akışı, emir defteri dengesizliği, 1 dakikalık mum momentumu ve funding riskini birleştiren açıklanabilir puan.
- HTTP API ve Mini App'in bağlanabileceği WebSocket yayını.
- Otomatik yeniden bağlanma, sağlık kontrolü, testler ve Docker dağıtımı.

## Yerel çalıştırma

Node.js 20 veya üstü gerekir.

```bash
cd engine
cp .env.example .env
npm install
npm test
npm start
```

Servis varsayılan olarak `http://localhost:8080` adresinde açılır.

## API

| Yol | Açıklama |
|---|---|
| `GET /health` | Barındırma sağlık kontrolü |
| `GET /api/v1/health` | Servis ve borsa bağlantı durumları |
| `GET /api/v1/snapshot` | Tüm semboller, analiz, son işlemler ve likidasyonlar |
| `GET /api/v1/snapshot?symbol=BTCUSDT` | Tek sembol görünümü |
| `GET /api/v1/analysis` | Tüm sembollerin güncel sinyal değerlendirmesi |
| `GET /api/v1/analysis?symbol=BTCUSDT` | Tek sembol sinyali |
| `GET /api/v1/market-signals` | Anormal hacim, destek/direnç ve hacimli kırılım kontrolleri |
| `GET /api/v1/trades?limit=50` | Son işlemler |
| `GET /api/v1/liquidations?limit=50` | Son likidasyonlar |
| `GET /api/v1/whales?limit=50` | Eşik üstü büyük işlemler |
| `WS /stream` | Anlık olay yayını; analiz 5 saniyede bir gönderilir |

WebSocket olay tipleri: `snapshot`, `market`, `candle`, `marketSignals`, `trade`, `whale`, `liquidation`, `connection`, `analysis`.

## Sinyal puanlaması

Puan -100 ile +100 arasında normalize edilir. +35 ve üzeri BUY, -35 ve altı SELL, arası WAIT olarak etiketlenir. İki veya daha az veri bileşeni varsa sistem INSUFFICIENT_DATA döndürür. Veri kalitesi kullanılan bileşen sayısına göre LOW / MEDIUM / HIGH olur.

Bu ilk sürüm bir araştırma/filtreleme sinyalidir; emir göndermez, pozisyon açmaz ve kâr garantisi vermez. Tek başına alım-satım kararı olarak kullanılmamalıdır. Skorlar geriye dönük test ve kalibrasyon yapılmadan gerçek para ile otomatik işlemde kullanılmamalıdır.

## Yapılandırma

- `PORT`: HTTP portu (varsayılan 8080)
- `HOST`: bind adresi (varsayılan 0.0.0.0)
- `CORS_ORIGIN`: Mini App'in HTTPS origin'i; yerel testte * kullanılabilir
- `SYMBOLS`: virgülle ayrılmış USDT sembolleri
- `WHALE_TRADE_USD`: büyük işlem uyarı eşiği (varsayılan 100000 USDT)
- `DATABASE_URL`: isteğe bağlı PostgreSQL bağlantı adresi
- `DATABASE_SSL`: TLS gerektiren PostgreSQL sağlayıcılarında `true`

Public piyasa akışları için API anahtarı gerekmez. API key/secret dosyaya eklemeyin.

## Dağıtım

- Dockerfile ve `.dockerignore` içerir.
- Render Blueprint: `engine/render.yaml`. Render'da sürekli açık servis için ücretli Starter plan tanımlıdır. Free servis uykuya geçebileceğinden sürekli veri toplama gereksinimini karşılamaz.
- GitHub Actions, engine dosyaları değiştiğinde Node sözdizimini, birim testlerini ve Docker build'ini kontrol eder.

Dağıtım sonrası servis URL'si `https://...` olur; WebSocket adresi `wss://.../stream` şeklindedir. Mini App bağlantısı için bu URL gerekir.

## Bilinen sınırlar / sonraki faz

- PostgreSQL için `DATABASE_URL` verilirse işlemler, likidasyonlar, büyük işlemler ve kapanmış 1 dakikalık mumlar kalıcı kaydedilir. Veritabanı ayarlı değilse bellek modunda çalışır. Başlangıçta Binance Market Data REST geçmişi yüklenir; REST başarısızsa kayıtlı mumlar kullanılır.
- Kalıcı PostgreSQL/Redis saklama, geçmiş mumların REST ile yüklenmesi, gelişmiş likidite/whale/false-breakout modülleri, alarm kuralları, kullanıcı bazlı erişim ve Mini App UI entegrasyonu sonraki fazlardır.
- İlk dağıtımda Binance/Bybit gerçek payload'ları ve reconnect davranışı canlı ortamda ayrıca doğrulanmalıdır.
- Mevcut kök `index.html` korunur; bu branch onu değiştirmez.
