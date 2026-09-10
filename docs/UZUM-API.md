# Uzum Market Seller API — SavdoIQ integratsiyasi

> Manba: rasmiy OpenAPI spetsifikatsiyasi
> <https://api-seller.uzum.uz/api/seller-openapi/swagger/api-docs>
> (Swagger UI: <https://api-seller.uzum.uz/api/seller-openapi/swagger/swagger-ui/webjars/swagger-ui/index.html>)
>
> Spetsifikatsiya **2026-09-11** kuni yuklab olinib, quyidagi ma'lumotlar bevosita undan olindi.
> `Uzum market seller openapi 1.0.0` · OAS 3.0 · 35 ta endpoint · 107 ta sxema.

---

## 1. Ulanish

| | |
| --- | --- |
| **Base URL** | `https://api-seller.uzum.uz/api/seller-openapi/` |
| **Autentifikatsiya** | `TokenAuth` — `apiKey`, `in: header`, `name: Authorization` |
| **Muhim** | Spetsifikatsiyada aniq yozilgan: **«Токен авторизации без префикса Bearer»** — ya'ni token `Bearer` so'zisiz yuboriladi |

```http
GET /api/seller-openapi/v1/shops HTTP/1.1
Host: api-seller.uzum.uz
Authorization: <API_KALIT>
Accept: application/json
```

Kalitni olish: `seller.uzum.uz` → **Mening profilim** → **API kalitlar** → *Kalitni yaratish*.

> SavdoIQ ehtiyot chorasi: `apps/api/src/uzum/http.ts` tokenni avval **prefikssiz** yuboradi;
> agar `401/403` qaytsa, bir marta `Bearer <token>` bilan qayta urinib ko'radi va ishlagan
> variantni eslab qoladi. Shuning uchun Uzum formatni o'zgartirsa ham integratsiya ishlayveradi.

### Sahifalash

Barcha ro'yxatli endpointlarda `page` (**0 dan** boshlanadi) va `size`.
Chegaralar endpointga qarab **20 / 50 / 100** (`apps/api/src/uzum/endpoints.ts` → `UZUM_PAGE_LIMITS`).
Ba'zi endpointlarda `Accept-Language` sarlavhasi qo'llab-quvvatlanadi (`uz` / `ru`).

---

## 2. SavdoIQ ishlatadigan endpointlar

| Vazifa | Metod va yo'l | Asosiy parametrlar | Javob |
| --- | --- | --- | --- |
| Do'konlar | `GET /v1/shops` | — | `OrganizationDto[]` |
| Mahsulot va SKU | `GET /v1/product/shop/{shopId}` | `page*`, `size*`, `searchQuery`, `sortBy`, `order`, `productRank`, `filter` | `AllProducts` → `productList[]`, `totalProductsAmount` |
| Qoldiqlar | `GET /v3/fbs/sku/stocks` | `page`, `size`, `skuIdFrom` | `GenericResponse…V2` → `skuAmountList[]` |
| Qoldiqni yangilash | `POST /v2/fbs/sku/stocks` | tana: `skuAmountList` | `SkuStockUpdateApiResponseDto` |
| Buyurtmalar (FBS/FBO) | `GET /v2/fbs/orders` | `shopIds*`, `status`, `scheme`, `dateFrom`, `dateTo`, `page`, `size` | `SellerOrdersDto` → `orders[]`, `totalAmount` |
| Buyurtmalar soni | `GET /v2/fbs/orders/count` | `shopIds`, `status`, `dateFrom`, `dateTo` | son |
| Moliyaviy pozitsiyalar | `GET /v1/finance/orders` | `shopIds*`, `dateFrom`, `dateTo`, `statuses`, `group`, `page`, `size` | `FinanceOrderItemsDto` → `orderItems[]`, `totalElements` |
| Xarajatlar | `GET /v1/finance/expenses` | `shopId`/`shopIds`, `dateFrom`, `dateTo`, `sources`, `page`, `size` | `SellerPaymentInfoDto[]` |
| Qaytarishlar | `GET /v1/return` | `returnId`, `page`, `size` | `SellerReturnDto[]` |
| Do'kon qaytarishlari | `GET /v1/shop/{shopId}/return` | `shopId*`, `page`, `size` | `SellerReturnDto[]` |
| FBO nakladnoylar | `GET /v1/invoice` · `GET /v1/shop/{shopId}/invoice` | `page`, `size` | nakladnoylar |
| Nakladnoy tarkibi | `GET /v1/shop/{shopId}/invoice/products` | `invoiceId*`, `shopId*` | pozitsiyalar |
| Narxni o'zgartirish | `POST /v1/product/{shopId}/sendPriceData` | `shopId*` | — |
| Bitta buyurtma | `GET /v1/fbs/order/{orderId}` | `orderId*` | `SellerOrderDto` |
| Etiketka | `GET /v1/fbs/order/{orderId}/labels/print` | `orderId*`, `size*` | PDF |

FBS nakladnoylari (`/v1/fbs/invoice…`), DBS oqimi (`/v1/dbs/order/…`), taym-slotlar va qabul
punktlari, shtrix-kod chop etish — to'liq ro'yxat `apps/api/src/uzum/endpoints.ts` da
(`UZUM_ENDPOINTS`), har biri izoh bilan.

---

## 3. Muhim javob maydonlari

### `SkuForTable` (mahsulot SKU'si) — juda boy

```
skuId, skuTitle, skuFullTitle, productTitle, barcode, article, sellerItemCode, ikpu,
price, purchasePrice, commission,
quantityActive, quantityFbs, quantityCreated, quantitySold, quantityReturned,
quantityMissing, quantityDefected, quantityPending, quantityArchived,
returnedPercentage, turnover, avgdsales, avgdquantity,
paidStorageAmount, paidStoragePriceItem, dimensionalGroup, pstorage,
archived, blocked, blockingReason, previewImage, characteristics
```

> Diqqat: `purchasePrice` — Uzum tomonidagi qiymat. SavdoIQ importi mavjud (qo'lda kiritilgan)
> tannarxni **ustidan yozmaydi** — `apps/api/src/services/importer.ts` ga qarang.

### `SellerOrderItemDto` (moliyaviy pozitsiya)

```
id, orderId, status (TO_WITHDRAW | PROCESSING | CANCELED | PARTIALLY_CANCELLED),
date (Unix ms), dateIssued (Unix ms), shopId, productId, skuTitle, sellerSkuCode,
sellerPrice, amount, amountReturns, commission, sellerProfit, productImage
```

Vaqt **Unix Epoch millisekundlarda** (masalan `1727427283895`) — sanalar shu formatda uzatiladi.

### `SellerOrderDto` (buyurtma)

```
id, status, scheme, shopId, price, dateCreated, acceptUntil, deliverUntil,
deliveringDate, deliveryDate, acceptedDate, completedDate, dateCancelled, returnDate,
cancelReason, invoiceNumber, orderItems[], deliveryInfo, dropOffPoint, timeSlot
```

### `SellerReturnDto` (qaytarish)

```
id, dateCreated, status, type, externalNumber, totalAmount, totalPackedAmount,
executionDate, assembledDate, completedDate, canceledDate, paidStorage, returnItems[]
```
`SellerReturnItemDto`: `skuId, amount, packedAmount, skuTitle, productTitle, purchasePrice`

---

## 4. Spetsifikatsiyada YO'Q narsalar

Bular Uzum Seller API'da mavjud emas — SavdoIQ ularni boshqa yo'l bilan hisoblaydi:

| Bo'lim | SavdoIQ qanday ishlaydi |
| --- | --- |
| **Sharhlar (отзывы)** | API'da endpoint yo'q. `getReviews()` bo'sh massiv qaytaradi; demo rejimda namunaviy sharhlar. Kelajakda qo'shilsa — `endpoints.ts` da bitta qator yetarli |
| **Yo'qotishlar (потери)** | Alohida endpoint yo'q. `quantityMissing` / `quantityDefected` va qaytarish nakladnoylaridan hisoblanadi |
| **Pullik saqlash** | `SkuForTable.paidStorageAmount` va `paidStoragePriceItem` orqali |
| **Reklama xarajatlari** | `GET /v1/finance/expenses` dagi `sources` bo'yicha ajratiladi |

---

## 5. Live rejimga o'tish

```ini
# .env
UZUM_MODE=live
UZUM_API_BASE=https://api-seller.uzum.uz/api/seller-openapi
UZUM_RPS=3          # sekundiga so'rovlar (ehtiyotkorlik uchun past)
UZUM_MAX_RETRIES=3
UZUM_TIMEOUT_MS=30000
```

Keyin saytda **Sozlamalar → Uzum kabinetlar → Kabinet qo'shish** orqali haqiqiy kalitni ulang.
Kalit tekshiruvi `GET /v1/shops` bilan amalga oshiriladi — xato bo'lsa aniq sabab ko'rsatiladi.

### Tekshirish tartibi

1. `POST /api/v1/uzum` — kalit qo'shiladi va darhol `verify()` ishlaydi.
2. `POST /api/v1/uzum/:id/test` — ulanishni qayta tekshirish.
3. `POST /api/v1/uzum/:id/resync` — to'liq sinxronizatsiya.
4. `GET /api/v1/sync/status` — jonli progress.

Xatolar `UzumAccount.lastError` da saqlanadi va **Sozlamalar** sahifasida ko'rinadi.

---

## 6. Kod qayerda

| Fayl | Vazifasi |
| --- | --- |
| `apps/api/src/uzum/endpoints.ts` | Barcha yo'llar, parametrlar, sahifalash chegaralari |
| `apps/api/src/uzum/http.ts` | Autentifikatsiya, timeout, qayta urinish, RPS, sahifalash |
| `apps/api/src/uzum/live.ts` | Haqiqiy API javoblarini normalizatsiya qilish |
| `apps/api/src/uzum/demo.ts` | API'siz ishlash uchun namunaviy ma'lumot generatori |
| `apps/api/src/uzum/types.ts` | `UzumClient` interfeysi va DTO tiplari |
| `apps/api/src/services/importer.ts` | Normalizatsiyalangan ma'lumotni bazaga yozish |

Uzum API o'zgarsa — deyarli har doim faqat `endpoints.ts` va `live.ts` tegiladi.
