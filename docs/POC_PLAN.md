# План разработки PoC (реальные данные -> JSON)

Цель PoC: получить **реальные** данные с `dns-shop.ru` и `citilink.ru`, сохранить их в **JSON-файлы** и иметь воспроизводимую команду запуска.

## Definition of Done
1. В репозитории есть команды:
   - `npm run poc:dns` -> сохраняет `out/dns_poc.json`
   - `npm run poc:citilink` -> сохраняет `out/citilink_poc.json`
2. JSON содержит:
   - `source`, `url`, `fetchedAt`
   - `raw` (минимум: сырой JSON-LD/ответ API/фрагменты) или `debug` (статус, cookies)
   - `normalized` (минимум: `name`, `price` если доступно)
3. Скрипты не хардкодят “мертвые” URL: хотя бы DNS берёт живой товар из `sitemap`.

## Этап 0. Подготовка окружения
1. Проверить зависимости и браузеры Playwright:
   - `npm install`
   - `npx playwright install chromium`
2. Создать `out/` и исключить его из VCS (если появится git):
   - `out/` хранит результаты PoC и отладочные артефакты.

## Этап 1. DNS-Shop PoC (живой товар из sitemap -> JSON)
### 1.1 Поиск живого товара
1. Скачать `https://www.dns-shop.ru/sitemap.xml`.
2. Выбрать `sitemap-products1.xml` (или любой доступный).
3. Считать первые N мегабайт с `Range` и найти первую ссылку, подходящую под шаблон:
   - для компонента ПК: `"/processor-"` (CPU) или `"/videokarta-"` (GPU)

### 1.2 Сессия (обход защиты)
1. Запустить Playwright Chromium.
2. Перейти на `https://www.dns-shop.ru/?cityPath=msk`.
3. Дождаться установки cookies (`qrator_*`, `city_path`).

### 1.3 Получение данных и сохранение JSON
1. Открыть страницу товара в Playwright (для прогрева сессии) и параллельно:
   - попытаться перехватить ответ `.../pwa/pwa/get-product...` (если вызывается сайтом)
2. Получить HTML товара через `context.request.get(...)` в той же сессии.
3. Извлечь базовые поля (минимум):
   - `name`
   - `price.current` (если доступно)
4. Сохранить `out/dns_poc.json`:
   - `raw.pwa` (если удалось)
   - `raw.htmlSnippet` (первые ~50К символов) для дебага
   - `normalized` (результат парсинга)

## Этап 2. Citilink PoC (через Playwright -> JSON-LD -> JSON)
Citilink может отдавать “JS-челлендж” даже на `robots.txt`, поэтому PoC строится вокруг браузера.

### 2.1 Навигация до карточки товара
1. Открыть `https://www.citilink.ru/` в Playwright.
2. Выполнить поиск по сайту (через URL поисковой выдачи):
   - `https://www.citilink.ru/search/?text=процессор` (если редирект/структура другая, подстроить селекторы)
3. В выдаче найти первую ссылку на товар (`/product/`), перейти на неё.

### 2.2 Извлечение JSON
1. На карточке товара собрать `script[type="application/ld+json"]`.
2. Найти JSON-LD объект с `@type: "Product"` и сохранить как `raw.jsonld`.
3. Сохранить `out/citilink_poc.json` с `normalized` (минимум: `name`, `offers.price`, если есть).

## Этап 3. Мини-интеграция (следующий шаг после PoC)
1. Обернуть PoC в Next.js API route (`/api/poc/dns`, `/api/poc/citilink`).
2. Добавить простейший rate limit и логирование.
3. Сохранение результатов в Postgres (таблица `components`) заменить файловый `out/`.

