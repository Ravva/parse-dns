# PRD: Система сбора и обработки данных DNS-Shop.ru и Citilink.ru

## 1. Обзор проекта
Данный документ описывает технические требования и архитектуру системы парсинга данных о компьютерных комплектующих с сайтов DNS-Shop и Citilink для интеграции в Next.js приложение (Конфигуратор ПК).

## 2. Анализ источников и ограничения

### 2.1 DNS-Shop.ru
*   **Статус API:** Официальное публичное API отсутствует.
*   **Внутренние механизмы:** Используются PWA-эндпоинты (напр. `/pwa/pwa/get-product/{guid}`).
*   **Защита:** 
    *   JS-челлендж Qrator Labs (cookie `qrator_jsid`).
    *   Проверка Fingerprint (User-Agent, заголовки).
    *   Динамический рендеринг контента.

### 2.2 Citilink.ru
*   **Статус API:** Официальное API только для бизнес-партнеров.
*   **Защита:** Динамическая загрузка через JS, проверка заголовков.
*   **Особенности:** Использование человекочитаемых URL (slug).

### 2.3 Юридические аспекты
*   Соблюдение `robots.txt` (запреты обычно только на служебные страницы).
*   **Рекомендация:** Ограничение частоты запросов (1-2 в сек), парсинг в ночное время (02:00–06:00 МСК), кэширование данных (TTL 12–24ч).

## 3. Техническая архитектура

### 3.1 Стек технологий
*   **Framework:** Next.js (App Router).
*   **Automation:** Playwright (для обхода защит и инициализации сессий).
*   **HTTP Client:** Axios + Cheerio (для быстрого сбора после получения сессии).
*   **Database:** PostgreSQL (основное хранилище) + Prisma ORM.
*   **Cache/Queue:** Redis (Upstash) для хранения сессий и статусов задач.
*   **Scheduling:** Vercel Cron Jobs или GitHub Actions.

### 3.2 Схема данных (PostgreSQL)
*   **Table `Component`:** 
    *   ID (dns-{guid} / citilink-{id}).
    *   Характеристики (JSONB): сокет, TDP, габариты (критично для совместимости).
    *   Цены: текущая, старая, история изменений.
*   **Table `PriceHistory`:** Трекинг динамики цен.

## 4. Методология реализации

### 4.1 Алгоритм парсинга DNS-Shop
1.  **Инициализация:** Запуск Playwright с эмуляцией реального пользователя (Stealth mode).
2.  **Сессия:** Переход на главную, ожидание выполнения JS-челленджа, извлечение `qrator_jsid`.
3.  **Сбор ссылок:** Парсинг `sitemap.xml` для выделения категорий комплектующих.
4.  **Каталог:** Вызов AJAX-эндпоинта `/catalog/ajax/product-list/` для получения списка GUID товаров.
5.  **Детализация:** Вызов внутреннего PWA API `/pwa/pwa/get-product/{guid}` для получения структурированного JSON (в 50 раз быстрее парсинга HTML).

### 4.2 Алгоритм парсинга Citilink
1.  **Разведка:** Анализ JSON-LD разметки или Schema.org.
2.  **API Search:** Поиск внутренних эндпоинтов мобильного приложения/сайта.
3.  **Fallback:** Полный рендеринг страницы через Playwright при отсутствии API.
4.  **Унификация:** Маппинг характеристик Citilink в единый формат системы.

## 5. Оптимизация и надежность

### 5.1 Управление нагрузкой
*   **Rate Limiting:** Использование `Bottleneck` (500-1000ms между запросами).
*   **Инкрементальное обновление:** Обновление только тех товаров, у которых изменился хэш или цена.

### 5.2 Отказоустойчивость
*   **Retry Mechanism:** Экспоненциальная задержка при ошибках (1s -> 2s -> 4s...).
*   **Stale Data:** Использование кэшированных данных при временной недоступности источника.
*   **Monitoring:** Алерты при блокировке IP (403) или изменении структуры сайта.

## 6. Интеграция с Frontend
*   **SWR/React Query:** Клиентское кэширование и фоновое обновление.
*   **ISR (Incremental Static Regeneration):** Предварительная генерация страниц популярных сборок.
*   **API Routes:** 
    *   `POST /api/parse` — запуск задачи.
    *   `GET /api/products` — получение данных с фильтрацией.

## 7. Этапы реализации
1.  **MVP:** Парсинг одной категории (напр. Процессоры) с DNS-Shop через Playwright.
2.  **Слой данных:** Настройка PostgreSQL и нормализация характеристик для проверки совместимости.
3.  **Масштабирование:** Добавление Citilink и настройка Cron-задач.
4.  **UI:** Интеграция данных в конфигуратор ПК.

## 9. PoC (получение реальных JSON)
Детальный план и критерии готовности PoC: `docs/POC_PLAN.md`.

Команды:
```bash
npm run poc:dns
npm run poc:citilink
```

## 8. Решение для парсинга DNS-Shop.ru и Citilink.ru в Next.js-приложении

### 8.1 Анализ источников данных и ограничений

#### 8.1.1 Отсутствие официальных API

##### 8.1.1.1 DNS-Shop.ru: нет публичного API для доступа к каталогу
DNS-Shop.ru, крупнейший российский ритейлер электроники с онлайн-выручкой около 263.6 млрд рублей в 2024 году, не предоставляет публичного API для доступа к своему каталогу товаров. Все попытки обнаружить документированный программный интерфейс (через поиск «DNS-Shop API», «DNS-Shop партнёрская программа API», официальный сайт разработчиков) оказались безуспешными. Компания ориентирована исключительно на прямые продажи через веб-интерфейс и мобильное приложение, не выстраивая экосистему интеграций для третьих лиц.

При этом исследование выявило наличие внутренних API-эндпоинтов, используемых PWA-приложением сайта. Ключевой среди них — `/pwa/pwa/get-product/{guid}`, возвращающий структурированные JSON-данные о товаре при наличии валидной сессии. Этот эндпоинт не предназначен для внешнего использования, подвержен изменениям без предупреждения и требует реверс-инжиниринга для определения формата запросов и валидации.

Отсутствие официального API создаёт три критических вызова:
*   структура сайта может измениться в любой момент, требуя постоянного мониторинга;
*   отсутствие документации увеличивает время разработки и сопровождения;
*   любые защитные обновления могут нарушить работу парсера без возможности получить поддержку.

##### 8.1.1.2 Citilink.ru: нет документированного API для третьих лиц
Citilink.ru, второй по величине онлайн-ритейлер электроники в России с выручкой 164.5 млрд рублей в 2024 году и 9.04 млн посещений ежемесячно, демонстрирует аналогичную закрытость. Поиск официального API не дал результатов: нет раздела для разработчиков, нет документации, нет публичных эндпоинтов. Структура сайта менее изучена в доступных источниках, что указывает на более закрытую архитектуру или меньшее внимание со стороны исследователей.

Интересно, что упоминается услуга «API интеграция» от компании Indexcall, связанной с Citilink, однако это относится к корпоративным интеграциям для бизнес-партнёров, а не к публичному доступу. Коммерческие сервисы парсинга вроде xmldatafeed.com предлагают платную выгрузку данных Citilink, что косвенно подтверждает отсутствие бесплатного официального пути.

##### 8.1.1.3 Партнёрские программы ограничены управлением офферами
Существующие партнёрские программы обоих ритейлеров ориентированы на управление рекламными офферами и отслеживание конверсий, а не на предоставление полного каталога с детальными характеристиками. Для DNS-Shop партнёрская программа существует, но функциональность ограничена созданием реферальных ссылок без программного доступа к данным о товарах.

Это ограничение критично для задачи автоматической сборки ПК, где требуется доступ к полному ассортименту комплектующих с актуальными ценами и, что важнее, детальными техническими характеристиками: сокетам процессоров, типам памяти, TDP, габаритам видеокарт и т.д. Партнёрские API обычно предоставляют доступ только к товарам в промо-акциях, что недостаточно для комплексного конфигуратора.

#### 8.1.2 Защитные механизмы целевых сайтов

##### 8.1.2.1 Динамическая загрузка контента через JavaScript
Оба сайта построены на современных JavaScript-фреймворках и используют клиентский рендеринг. Первоначальный HTTP-ответ содержит минимальный HTML-скелет, а основной контент подгружается асинхронно через XHR/Fetch-запросы после инициализации страницы в браузере. Это делает невозможным простой парсинг статического HTML инструментами вроде `curl` или базовых HTTP-библиотек.

Для DNS-Shop характерна архитектура PWA (Progressive Web Application), где каталог загружается через внутренние API-эндпоинты после получения валидной сессии. Страница категории изначально содержит только базовую структуру, а список товаров подгружается динамически: требуется полноценное выполнение JavaScript для получения финального DOM.

##### 8.1.2.2 Системы защиты от ботов (qrator_jsid на DNS-Shop)
DNS-Shop.ru применяет многоуровневую систему защиты на базе JavaScript-челленджа, генерирующего cookie `qrator_jsid`. Этот механизм, вероятно основанный на решениях Qrator Labs, работает следующим образом:

| Этап | Действие | Результат при неудаче |
| --- | --- | --- |
| 1. Первый запрос | Сервер возвращает страницу с JS-челленджем | — |
| 2. Выполнение JS | Браузер выполняет вычисления, устанавливает cookie | Без cookie доступ заблокирован |
| 3. Проверка cookie | Сервер валидирует `qrator_jsid` при последующих запросах | Ошибка 403 или редирект на проверку |

Без валидного `qrator_jsid` последующие запросы к API-эндпоинтам отклоняются. Это эффективно блокирует простые HTTP-клиенты и требует эмуляции полноценного браузера для первоначальной инициализации сессии.

##### 8.1.2.3 Требование валидных cookies и заголовков для доступа к данным
Помимо `qrator_jsid`, оба сайта проверяют комплекс HTTP-заголовков для выявления автоматизации:

| Параметр | Требование | Последствие несоответствия |
| --- | --- | --- |
| `User-Agent` | Актуальный браузерный, с ротацией | Блокировка или капча |
| `Accept`, `Accept-Language`, `Accept-Encoding` | Корректный набор | Отклонение запроса |
| `Referer` | Контекстно-зависимый для API-вызовов | Ошибка 403 |
| `X-Requested-With: XMLHttpRequest` | Для AJAX-эндпоинтов | Возврат HTML вместо JSON |
| `city_path` | Региональная привязка сессии | Некорректные цены/наличие |

Любая попытка прямого доступа к внутренним API без предварительно установленной валидной сессии приводит к немедленной блокировке или возврату ошибок аутентификации.

#### 8.1.3 Юридические аспекты парсинга

##### 8.1.3.1 Проверка robots.txt: ограничения на сканирование
Проверка `robots.txt` для Citilink.ru показала стандартную структуру без критических ограничений на сканирование каталога. Файл содержит типичные директивы, направленные на предотвращение индексации служебных страниц, корзины, личного кабинета, но не запрещает доступ к категориям товаров и карточкам продуктов.

Для DNS-Shop аналогичная проверка ожидается показать схожую картину. Важно понимать, что `robots.txt` — рекомендация, а не юридический запрет. Его соблюдение снижает риск технических блокировок и демонстрирует добросовестность, но не гарантирует легальность парсинга с точки зрения авторского права и договорного права.

##### 8.1.3.2 Условия использования сайтов: отсутствие явного разрешения
Условия использования DNS-Shop.ru, доступные по адресу https://www.dns-shop.ru/rules/site-usage/, как правило содержат положения, ограничивающие или запрещающие автоматизированный сбор данных без письменного разрешения. Аналогичные ограничения присутствуют в политике конфиденциальности.

В российской юрисдикции практика судебных разбирательств по вопросам парсинга ограничена, но тенденции в других юрисдикциях (особенно дело hiQ Labs v. LinkedIn в США) указывают на возможную легальность сбора публично доступных данных при соблюдении определённых условий. Ключевой фактор: не создание вреда функционированию источника и не нарушение конкурентного законодательства.

##### 8.1.3.3 Рекомендация по соблюдению rate limiting и ответственному использованию данных
Независимо от юридической неопределённости, профессиональная этика и практическая целесообразность требуют:

| Принцип | Конкретная мера | Обоснование |
| --- | --- | --- |
| Rate limiting | 1-2 запроса в секунду | Минимизация нагрузки, снижение риска блокировки |
| Временное распределение | Парсинг в 2:00–6:00 по МСК | Период низкой нагрузки реальных пользователей |
| Кэширование | TTL 12–24 часа для данных | Соответствие требованию «раз в день» |
| Идентификация | Осмысленный `User-Agent` с контактом | Прозрачность, возможность связи |
| Исключение персональных данных | Фильтрация отзывов, ФИО | Соответствие 152-ФЗ «О персональных данных» |

Соблюдение этих принципов снижает технические риски и создаёт основу для добросовестного использования публично доступной информации.

### 8.2 Архитектура решения для Next.js

#### 8.2.1 Серверная инфраструктура парсинга

##### 8.2.1.1 API Routes Next.js как точка входа для запуска парсеров
Next.js предоставляет оптимальную инфраструктуру для реализации серверной части парсинга через API Routes (App Router: `app/api/`, Pages Router: `pages/api/`). Рекомендуемая структура эндпоинтов:

```text
app/api/
├── parse/
│   └── route.ts              # POST /api/parse — запуск полного парсинга
├── parse/dns-shop/
│   └── route.ts              # GET/POST /api/parse/dns-shop — парсинг DNS-Shop
├── parse/citilink/
│   └── route.ts              # GET/POST /api/parse/citilink — парсинг Citilink
├── parse/status/
│   └── route.ts              # GET /api/parse/status — мониторинг прогресса
└── products/
    └── route.ts              # GET /api/products — получение актуальных данных
```

Каждый эндпоинт парсинга должен реализовывать:
*   аутентификацию по секретному ключу для предотвращения несанкционированного запуска;
*   потоковую передачу логов (Server-Sent Events) для мониторинга прогресса;
*   атомарное обновление базы данных с откатом при ошибке.

Парсинг — операция длительная (десятки минут при большом каталоге), поэтому синхронное выполнение через HTTP-запрос неприемлемо. Необходима асинхронная обработка с механизмом уведомлений о завершении.

##### 8.2.1.2 Фоновые задачи через cron-джобы или Vercel Cron Jobs
Для ежедневного обновления данных оптимальны следующие подходы.

Вариант A: Vercel Cron Jobs (рекомендуется для размещения на Vercel)

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/parse/dns-shop?mode=incremental",
      "schedule": "0 3 * * *"
    },
    {
      "path": "/api/parse/citilink?mode=incremental",
      "schedule": "30 3 * * *"
    }
  ]
}
```

Запуск в 3:00 и 3:30 ночи минимизирует нагрузку на целевые сайты и упрощает отладку при пересечении логов.

Вариант B: `node-cron` для self-hosted развёртывания

```ts
// lib/scheduler.ts
import { CronJob } from 'cron';

const dnsJob = new CronJob('0 3 * * *', async () => {
  await fetch(`${process.env.SELF_URL}/api/parse/dns-shop`, {
    headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET}` }
  });
});
```

Критически важно обеспечить идемпотентность парсинга: повторный запуск не должен создавать дубликатов. Реализуется через транзакционное обновление данных, версионирование с отметкой времени, механизм блокировок для предотвращения параллельного выполнения.

##### 8.2.1.3 Кэширование результатов в Redis/Upstash для скорости
Многоуровневая стратегия кэширования обеспечивает быстрый отклик фронтенда:

| Уровень | Технология | TTL | Назначение |
| --- | --- | --- | --- |
| Edge | Vercel Edge Config / CDN | 1 час | Глобально частые запросы |
| Application | Upstash Redis | 5 минут | Промежуточные результаты парсинга |
| Database | PostgreSQL query cache | — | Постоянное хранение |

Upstash Redis — оптимальный выбор для Vercel: бесплатный tier включает 10 000 запросов в день, latency в пределах единиц миллисекунд, нативная интеграция. Структура ключей: `products:{source}:{category}`, `session:{source}:{cityPath}`, `parse:status:{jobId}`.

#### 8.2.2 Стек технологий для надёжного парсинга

##### 8.2.2.1 Puppeteer/Playwright для обхода защит и получения валидных сессий
Сравнение инструментов браузерной автоматизации:

| Характеристика | Puppeteer | Playwright |
| --- | --- | --- |
| Разработчик | Google | Microsoft |
| Поддержка браузеров | Chromium | Chromium, Firefox, WebKit |
| API и эргономика | Зрелый, стабильный | Современный, унифицированный |
| Автоматическое ожидание | Базовое | Продвинутое (auto-waiting) |
| Производительность | Высокая | Выше при параллельном выполнении |
| Размер bundle | ~170 MB | ~180 MB |
| Интеграция с Next.js | Хорошая | Отличная (нативная поддержка Vercel) |

Для проекта рекомендуется Playwright благодаря лучшей стабильности при работе с динамическим контентом и более активному развитию.

Ключевая конфигурация для обхода детекции:

```ts
// lib/browser.ts
import { chromium, BrowserContext } from 'playwright';

const STEALTH_CONFIG = {
  headless: true,
  args: [
    '--disable-blink-features=AutomationControlled',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process',
    '--blink-settings=imagesEnabled=false', // Ускорение
  ]
};

const CONTEXT_CONFIG = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0',
  viewport: { width: 1920, height: 1080 },
  locale: 'ru-RU',
  timezoneId: 'Europe/Moscow',
  extraHTTPHeaders: {
    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
  },
};

// Маскировка автоматизации
// (В реальном коде: вызывать после newContext)
async function applyStealth(context: BrowserContext) {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    // @ts-ignore
    window.chrome = { runtime: {} };
  });
}
```

##### 8.2.2.2 Axios + Cheerio для быстрого парсинга статического контента
После получения валидной сессии основная масса запросов выполняется через лёгкие инструменты:

| Аспект | Playwright | Axios + Cheerio |
| --- | --- | --- |
| Время запроса | 2–5 секунд | 100–500 мс |
| Потребление памяти | ~150 MB на инстанс | ~10 MB |
| Параллелизм | Ограничен | Высокий |
| Применение | Инициализация сессии | Массовые запросы |

Комбинация обеспечивает 10–50-кратное ускорение по сравнению с полным браузерным рендерингом каждой страницы.

```ts
// lib/fast-parser.ts
import axios from 'axios';
import * as cheerio from 'cheerio';

export function createFastClient(cookies: string) {
  return axios.create({
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)...',
      'Cookie': cookies,
      'X-Requested-With': 'XMLHttpRequest',
    },
    timeout: 10000,
  });
}
```

##### 8.2.2.3 node-cron или similar для ежедневного обновления

| Решение | Сложность | Надёжность | Стоимость | Рекомендация |
| --- | --- | --- | --- | --- |
| Vercel Cron Jobs | Низкая | Средняя | Бесплатно (лимиты) | Для MVP, небольших каталогов |
| node-cron + PM2 | Средняя | Высокая | Хостинг | Для dedicated-серверов |
| GitHub Actions | Низкая | Средняя | Бесплатно (2000 мин/мес) | Для proof-of-concept |
| AWS EventBridge + Lambda | Средняя | Очень высокая | ~$1–5/мес | Для production-масштаба |

#### 8.2.3 Интеграция с фронтендом React

##### 8.2.3.1 SWR или React Query для клиентского кэширования
SWR (stale-while-revalidate) от Vercel обеспечивает:

```ts
// hooks/useProducts.ts
import useSWR from 'swr';

export function useProducts(category?: string) {
  const { data, error, isLoading, mutate } = useSWR(
    category ? `/api/products?category=${category}` : '/api/products',
    fetcher,
    {
      refreshInterval: 300000,     // Фоновое обновление каждые 5 минут
      revalidateOnFocus: false,    // Не перезагружать при фокусе
      dedupingInterval: 60000,     // Дедупликация запросов
    }
  );

  return { products: data, isLoading, isError: error, refresh: mutate };
}
```

Ключевые преимущества: мгновенный отклик из кэша, фоновая актуализация без блокировки UI, дедупликация параллельных запросов, автоматический retry при ошибках сети.

##### 8.2.3.2 ISR (Incremental Static Regeneration) для предварительной генерации страниц

```ts
// app/build/[configId]/page.tsx
export const revalidate = 3600; // Перегенерация каждый час

export async function generateStaticParams() {
  const popularConfigs = await getPopularConfigurations();
  return popularConfigs.map(c => ({ configId: c.id }));
}

export default async function BuildPage({ params }: { params: { configId: string } }) {
  const [components, prices] = await Promise.all([
    getComponentsByConfig(params.configId),
    getCurrentPrices(params.configId), // Из кэша Redis
  ]);

  return <PCBuilder components={components} prices={prices} />;
}
```

ISR комбинирует: мгновенную загрузку предсгенерированных страниц, SEO-оптимизацию, фоновое обновление без ручного деплоя, масштабируемость через edge-серверы.

##### 8.2.3.3 Оптимистичные обновления UI при фоновом обновлении данных

```ts
// При изменении фильтра пользователем
const handleFilterChange = async (newFilters) => {
  // Мгновенное обновление UI
  mutate(
    applyFilters(data, newFilters),
    false // Не запускать revalidation
  );

  // Фоновый запрос с новыми фильтрами
  mutate(fetchWithFilters(newFilters));
};
```

Пользователь видит мгновенную реакцию на действия, данные актуализируются фоном; при расхождении — плавное обновление с индикацией.

### 8.3 Методика парсинга DNS-Shop.ru

#### 8.3.1 Получение доступа к защищённому контенту

##### 8.3.1.1 Инициализация Playwright с реалистичным user-agent
Первый критический шаг — создание контекста браузера, неотличимого от реального пользователя. Помимо базового `User-Agent`, необходимо корректно установить множество дополнительных параметров, проверяемых современными системами защиты:

```ts
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
             '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  viewport: { width: 1920, height: 1080 },
  screen: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
  locale: 'ru-RU',
  timezoneId: 'Europe/Moscow',
  geolocation: { latitude: 55.7558, longitude: 37.6173 }, // Москва
  permissions: ['geolocation'],
  colorScheme: 'light',
});
```

Дополнительно рекомендуется установка cookies, характерных для реальных пользователей: согласие на использование cookies, выбранный регион, валюта. Эти параметры в совокупности создают fingerprint, соответствующий типичному посетителю из целевого региона.

##### 8.3.1.2 Навигация на главную страницу для получения qrator_jsid cookie
Процесс получения валидной сессии требует методичного подхода, основанного на исследовании защитных механизмов:

```ts
const page = await context.newPage();

// Шаг 1: Загрузка главной страницы с ожиданием полной загрузки
await page.goto('https://www.dns-shop.ru/?cityPath=msk', {
  waitUntil: 'networkidle',
  timeout: 30000,
});

// Шаг 2: Ожидание выполнения защитного скрипта (3–5 секунд)
await page.waitForTimeout(5000);

// Шаг 3: Проверка наличия целевой cookie
const cookies = await context.cookies();
const qratorCookie = cookies.find(c => c.name === 'qrator_jsid');

if (!qratorCookie) {
  // Диагностика: сохранение скриншота и HTML
  await page.screenshot({ path: 'debug-dns.png', fullPage: true });
  throw new Error('qrator_jsid cookie not found — возможна детекция автоматизации');
}
```

В некоторых случаях может потребоваться взаимодействие со страницей (прокрутка, клик по элементу) для полной инициализации защитных механизмов. Практика показывает, что время ожидания 5 секунд после `networkidle` обычно достаточно, но в периоды высокой нагрузки или при изменениях защитной системы может потребоваться увеличение.

##### 8.3.1.3 Извлечение и сохранение сессионных данных
Полученный токен имеет ограниченное время жизни (обычно несколько часов), поэтому требуется система управления сессиями:

```ts
interface SessionData {
  token: string;
  cookies: string;
  userAgent: string;
  obtainedAt: Date;
  expiresAt: Date;
}

class SessionManager {
  constructor(private redis: Redis) {}

  async saveSession(source: 'dns-shop' | 'citilink', session: SessionData): Promise<void> {
    const key = `session:${source}`;
    await this.redis.setex(key, 14400, JSON.stringify(session)); // 4 часа
  }

  async getValidSession(source: 'dns-shop' | 'citilink'): Promise<SessionData | null> {
    const key = `session:${source}`;
    const data = await this.redis.get<string>(key);
    if (!data) return null;

    const session: SessionData = JSON.parse(data);
    // Проверка актуальности с запасом в 10 минут
    if (new Date(session.expiresAt).getTime() - Date.now() < 600000) {
      return null; // Требуется обновление
    }
    return session;
  }
}
```

#### 8.3.2 Извлечение списка товаров

##### 8.3.2.1 Парсинг sitemap.xml для получения URL категорий
DNS-Shop предоставляет структурированный sitemap, значительно упрощающий обнаружение категорий:

```ts
import { parseStringPromise } from 'xml2js';

async function parseSitemap(): Promise<Category[]> {
  const response = await axios.get('https://www.dns-shop.ru/sitemap.xml');
  const parsed = await parseStringPromise(response.data);

  const urls = parsed.urlset.url.map((u: any) => ({
    loc: u.loc[0],
    lastmod: u.lastmod?.[0],
  }));

  // Фильтрация только категорий комплектующих ПК
  const componentPatterns = [
    /\\/catalog\\/17a[0-9a-f]+\\/processory\\//,           // CPU
    /\\/catalog\\/17a[0-9a-f]+\\/videokarty\\//,           // GPU
    /\\/catalog\\/17a[0-9a-f]+\\/materinskie-platy\\//,    // Motherboard
    /\\/catalog\\/17a[0-9a-f]+\\/operativnaya-pamyat\\//,  // RAM
    /\\/catalog\\/17a[0-9a-f]+\\/ssd-nakopiteli\\//,       // SSD
    /\\/catalog\\/17a[0-9a-f]+\\/zhestkie-diski\\//,       // HDD
    /\\/catalog\\/17a[0-9a-f]+\\/bloki-pitaniya\\//,       // PSU
    /\\/catalog\\/17a[0-9a-f]+\\/korpusa\\//,              // Case
    /\\/catalog\\/17a[0-9a-f]+\\/kulery-dlya-processora\\//, // Cooler
  ];

  return urls
    .filter(u => componentPatterns.some(p => p.test(u.loc)))
    .map(u => ({
      url: u.loc,
      categoryId: extractCategoryId(u.loc),
      lastModified: new Date(u.lastmod),
    }));
}
```

##### 8.3.2.2 Определение общего количества товаров в категории
Страница категории содержит информацию о количестве товаров в пагинации или метаданных API:

```ts
async function getCategoryInfo(url: string, cookies: string): Promise<CategoryInfo> {
  const response = await axios.get(url, {
    headers: { 'Cookie': cookies },
  });

  const $ = cheerio.load(response.data);

  // Множественные селекторы для надёжности
  const countText =
    $('.products-count').text() ||
    $('[data-role="products-count"]').text() ||
    $('.catalog-products__count').text();

  const totalProducts = parseInt(countText.replace(/\\D/g, ''), 10);
  const productsPerPage = 24; // Типичное значение для DNS-Shop

  return {
    totalProducts,
    totalPages: Math.ceil(totalProducts / productsPerPage),
    productsPerPage,
    estimatedTimeMinutes: Math.ceil(totalProducts / productsPerPage * 2 / 60),
  };
}
```

##### 8.3.2.3 Пагинация через API-эндпоинты каталога
DNS-Shop использует внутренний API для динамической загрузки товаров:

```ts
interface CatalogApiResponse {
  data: {
    products: Array<{
      id: string;
      guid: string;
      name: string;
      price: { current: number; old?: number };
      url: string;
      imageUrl: string;
      availability: 'in_stock' | 'out_of_stock' | 'preorder';
    }>;
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
    };
  };
}

async function fetchCatalogPage(
  categoryId: string,
  page: number,
  cookies: string
): Promise<string[]> {
  const response = await axios.post(
    'https://www.dns-shop.ru/catalog/ajax/product-list/',
    {
      categoryId,
      page,
      perPage: 24,
      sort: 'price_asc',
    },
    {
      headers: {
        'Cookie': cookies,
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data.data.products.map(p => p.guid);
}
```

#### 8.3.3 Получение детальных данных о товарах

##### 8.3.3.1 Извлечение product GUID из страниц каталога
GUID — 36-символьная строка формата UUID, центральный элемент архитектуры данных DNS-Shop:

```ts
const GUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function extractProductGuid($: cheerio.CheerioAPI, element: cheerio.Element): string | null {
  // Вариант 1: data-атрибут
  const guid = $(element).attr('data-product-guid');
  if (guid && GUID_REGEX.test(guid)) return guid.toLowerCase();

  // Вариант 2: из ссылки
  const href = $(element).find('a').attr('href') || '';
  const match = href.match(GUID_REGEX);
  if (match) return match[0].toLowerCase();

  // Вариант 3: из встроенного JSON
  const jsonData = $(element).find('script[type="application/json"]').text();
  try {
    const data = JSON.parse(jsonData);
    return data.product?.guid || data.id;
  } catch {
    return null;
  }
}
```

##### 8.3.3.2 Вызов внутреннего API /pwa/pwa/get-product/{guid} для JSON-ответа
Ключевое открытие исследования: DNS-Shop предоставляет недокументированный, но стабильный эндпоинт для получения полных данных о товаре:

```ts
const PRODUCT_API_URL = 'https://www.dns-shop.ru/pwa/pwa/get-product/';

interface ProductApiResponse {
  id: string;
  name: string;
  description?: string;
  price: {
    current: number;
    old?: number;
    discount?: number;
  };
  availability: {
    inStock: boolean;
    stores?: number;
    delivery?: boolean;
  };
  specifications: Array<{
    name: string;
    value: string;
    group?: string;
  }>;
  images: string[];
  category: { id: string; name: string; path: string[] };
  brand?: { id: string; name: string };
  rating?: { average: number; count: number };
}

async function fetchProductDetails(guid: string, cookies: string): Promise<ProductApiResponse> {
  const response = await axios.post(
    PRODUCT_API_URL,
    {
      data: JSON.stringify({
        type: 'product-buy',
        containers: [{ id: `as-${generateId()}`, data: { id: guid } }],
      }),
    },
    {
      headers: {
        'Cookie': cookies,
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-CSRF-Token': csrfToken, // Извлекается из страницы
      },
    }
  );

  return normalizeProductData(response.data.data.states[0]?.data);
}
```

Этот подход в 10–50 раз быстрее парсинга HTML и обеспечивает структурированные данные без необходимости разбора DOM.

##### 8.3.3.3 Парсинг структурированного ответа: название, цена, характеристики
Ответ API содержит исчерпывающую информацию в нормализованном виде:

| Поле | Путь | Тип | Критичность для конфигуратора |
| --- | --- | --- | --- |
| Название | `data.name` | string | Идентификация товара |
| Бренд | `data.brand.name` | string | Фильтрация, доверие |
| Цена текущая | `data.price.current` | number | Расчёт стоимости сборки |
| Цена старая | `data.price.old` | number | Отображение скидки |
| Наличие | `data.availability.status` | enum | Фильтр доступных товаров |
| Характеристики | `data.specifications[]` | array | Проверка совместимости |
| Изображения | `data.images[]` | array | Визуализация в UI |

#### 8.3.4 Обработка и хранение данных

##### 8.3.4.1 Нормализация формата характеристик (спецификации комплектующих)
Характеристики требуют строгой типизации для работы конфигуратора:

```ts
interface NormalizedCPU {
  socket: string;           // "AM5", "LGA1700"
  cores: number;
  threads: number;
  baseFrequency: number;    // GHz
  boostFrequency: number;   // GHz
  tdp: number;              // Watts
  memoryType: string[];     // ["DDR5-5200", "DDR5-5600"]
  integratedGraphics: boolean;
}

interface NormalizedGPU {
  chipset: string;          // "RTX 4070", "RX 7800 XT"
  vram: number;             // GB
  vramType: string;         // "GDDR6X"
  tdp: number;
  length: number;           // mm — критично для совместимости с корпусом
  powerConnectors: string;  // "1x16-pin", "2x8-pin"
}

// Функции нормализации с регулярными выражениями
function normalizeCPU(specs: RawSpec[]): NormalizedCPU {
  const find = (name: string) => specs.find(s =>
    s.name.toLowerCase().includes(name.toLowerCase())
  )?.value;

  return {
    socket: normalizeSocket(find('Сокет')),
    cores: parseInt(find('Количество ядер')?.replace(/\\D/g, '') || '0', 10),
    baseFrequency: parseFrequency(find('Базовая частота')),
    // ...
    threads: 0,
    boostFrequency: 0,
    tdp: 0,
    memoryType: [],
    integratedGraphics: false,
  };
}
```

##### 8.3.4.2 Сопоставление категорий с типами компонентов ПК (CPU, GPU, RAM и т.д.)

| Категория DNS-Shop | Тип компонента | Ключевые характеристики для совместимости |
| --- | --- | --- |
| Процессоры | `cpu` | socket, cores, tdp, memoryType |
| Видеокарты | `gpu` | chipset, vram, tdp, length |
| Материнские платы | `motherboard` | socket, chipset, formFactor, ramSlots, memoryType |
| Оперативная память | `ram` | type, capacity, frequency, timings |
| SSD-накопители | `ssd` | capacity, interface, formFactor, readSpeed |
| HDD-накопители | `hdd` | capacity, interface, rpm |
| Блоки питания | `psu` | wattage, efficiency, modular, connectors |
| Корпуса | `case` | formFactor, maxGpuLength, coolerHeight, psuFormat |
| Кулеры и СВО | `cooler` | socketCompatibility, tdp, height, radiatorSize |

##### 8.3.4.3 Сохранение в PostgreSQL/MongoDB с индексацией по категориям
Рекомендуемая схема PostgreSQL:

```sql
CREATE TABLE components (
    id TEXT PRIMARY KEY,              -- dns-{guid} или citilink-{id}
    source TEXT NOT NULL,             -- 'dns-shop' | 'citilink'
    source_url TEXT NOT NULL,

    -- Идентификация
    name TEXT NOT NULL,
    brand TEXT NOT NULL,
    category component_category NOT NULL, -- ENUM типов компонентов

    -- Ценообразование
    price_current INTEGER NOT NULL,
    price_old INTEGER,
    currency TEXT DEFAULT 'RUB',
    price_updated_at TIMESTAMPTZ,

    -- Доступность
    in_stock BOOLEAN DEFAULT false,
    stock_quantity INTEGER,

    -- Спецификации в JSONB для гибкости
    specifications JSONB NOT NULL DEFAULT '{}',
    key_specs JSONB NOT NULL DEFAULT '{}', -- Нормализованные критичные параметры

    -- Медиа
    images TEXT[],

    -- Метаданные парсинга
    parsed_at TIMESTAMPTZ DEFAULT NOW(),
    parse_version TEXT,

    -- Полнотекстовый поиск
    search_vector TSVECTOR
);

-- Критические индексы
CREATE INDEX idx_components_category ON components(category);
CREATE INDEX idx_components_brand ON components(brand);
CREATE INDEX idx_components_price ON components(price_current);
CREATE INDEX idx_components_stock ON components(in_stock) WHERE in_stock = true;
CREATE INDEX idx_components_key_specs ON components USING GIN(key_specs);
CREATE INDEX idx_components_search ON components USING GIN(search_vector);

-- История цен для аналитики
CREATE TABLE price_history (
    component_id TEXT REFERENCES components(id),
    price INTEGER NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    source_event TEXT -- 'parse', 'manual', 'api'
);
```
