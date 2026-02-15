/**
 * Category URL mappings for DNS-Shop and Citilink.
 * Each category has catalog listing URLs for both sources.
 */
export const CATEGORY_URLS: Record<string, { dns: string; citilink: string }> = {
  cpu: {
    dns: 'https://www.dns-shop.ru/catalog/17a899cd16404e77/processory/',
    citilink: 'https://www.citilink.ru/catalog/processory/',
  },
  gpu: {
    dns: 'https://www.dns-shop.ru/catalog/17a89aab16404e77/videokarty/',
    citilink: 'https://www.citilink.ru/catalog/videokarty/',
  },
  motherboard: {
    dns: 'https://www.dns-shop.ru/catalog/17a89a0416404e77/materinskie-platy/',
    citilink: 'https://www.citilink.ru/catalog/materinskie-platy/',
  },
  ram: {
    dns: 'https://www.dns-shop.ru/catalog/17a89a3916404e77/operativnaya-pamyat-dimm/',
    citilink: 'https://www.citilink.ru/catalog/moduli-pamyati/',
  },
  ssd: {
    dns: 'https://www.dns-shop.ru/catalog/8a9ddfba20724e77/ssd-nakopiteli/',
    citilink: 'https://www.citilink.ru/catalog/ssd-nakopiteli/',
  },
  hdd: {
    dns: 'https://www.dns-shop.ru/catalog/17a8914916404e77/zhestkie-diski/',
    citilink: 'https://www.citilink.ru/catalog/zhestkie-diski/',
  },
  psu: {
    dns: '', // Blocked/Invalid ID
    citilink: 'https://www.citilink.ru/catalog/bloki-pitaniya/',
  },
  case: {
    dns: '', // Duplicate ID/Blocked
    citilink: 'https://www.citilink.ru/catalog/korpusa/',
  },
  cooler: {
    dns: '', // Blocked/Invalid ID
    citilink: 'https://www.citilink.ru/catalog/sistemy-ohlazhdeniya-processora/',
  },
};
