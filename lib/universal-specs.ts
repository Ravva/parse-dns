/**
 * Universal specifications definition for each category.
 * Used to normalize data from different sources (DNS/Citilink) into a common structure.
 */

export const UNIVERSAL_SPECS_CONFIG: Record<
  string,
  {
    keys: string[]; // Ordered list of keys to display
    citilinkMap: Record<string, string>; // Map Citilink property names to universal keys
    dnsRegex: Record<string, RegExp>; // Regex to extract from DNS text description
  }
> = {
  cpu: {
    keys: ['Socket', 'Cores', 'Frequency', 'TDP', 'Graphics'],
    citilinkMap: {
      'Гнездо процессора': 'Socket',
      'Количество ядер': 'Cores',
      Частота: 'Frequency',
      Тепловыделение: 'TDP',
      'Модель графического ядра': 'Graphics',
    },
    dnsRegex: {
      Socket: /(AM\d+|LGA\s*\d+)/i,
      Cores: /(\d+\s*x\s*[\d\.]+\s*ГГц)/i, // Matches "8 x 4.2 ГГц"
      Frequency: /([\d\.]+\s*ГГц)/i,
      TDP: /TDP\s*(\d+\s*Вт)/i,
      Graphics: /(AMD Radeon|Intel [A-Za-z0-9]+ Graphics|без\s+графики)/i,
    },
  },
  gpu: {
    keys: ['VRAM', 'Memory Type', 'Bus Width', 'Chipset'],
    citilinkMap: {
      'Объем видеопамяти': 'VRAM',
      'Тип видеопамяти': 'Memory Type',
      'Разрядность шины видеопамяти': 'Bus Width',
      'Графический процессор': 'Chipset',
    },
    dnsRegex: {
      VRAM: /(\d+\s*ГБ)/i,
      'Memory Type': /(GDDR\d+[X]?)/i,
      'Bus Width': /(\d+\s*бит)/i,
      Chipset: /(GeForce\s+RTX\s+\d+|Radeon\s+RX\s+\d+)/i,
    },
  },
  motherboard: {
    keys: ['Socket', 'Chipset', 'Memory Type', 'Form Factor'],
    citilinkMap: {
      'Гнездо процессора': 'Socket',
      Чипсет: 'Chipset',
      'Тип поддерживаемой памяти': 'Memory Type',
      'Форм-фактор': 'Form Factor',
    },
    dnsRegex: {
      Socket: /(LGA\s*[\d\w]+|AM\d+)/i,
      Chipset: /(Intel\s*[A-Z]\d+|AMD\s*[A-Z]\d+)/i,
      'Memory Type': /(DDR\d+)/i,
      'Form Factor': /(Standard-ATX|Micro-ATX|Mini-ITX|E-ATX|XL-ATX)/i,
    },
  },
  ram: {
    keys: ['Type', 'Capacity', 'Frequency', 'Timings'],
    citilinkMap: {
      'Тип памяти': 'Type',
      'Объем модулей': 'Capacity', // Sometimes "Объем" or "Объем одного модуля"
      Частота: 'Frequency',
      Латентность: 'Timings', // Citilink might not have Timings easily mapped, check later
    },
    dnsRegex: {
      Type: /(DDR\d+)/i,
      Capacity: /(\d+\s*ГБ\s*x\s*\d+\s*шт|\d+\s*ГБ)/i,
      Frequency: /(\d+\s*МГц)/i,
      Timings: /(\d+-\d+-\d+)/i,
    },
  },
  ssd: {
    keys: ['Capacity', 'Form Factor', 'Interface', 'Read Speed'],
    citilinkMap: {
      'Объем накопителя': 'Capacity',
      'Форм-фактор': 'Form Factor',
      Интерфейс: 'Interface',
      'Максимальная скорость чтения': 'Read Speed',
    },
    dnsRegex: {
      Capacity: /(\d+\s*ГБ|\d+\s*ТБ)/i,
      'Form Factor': /(M\.2|2\.5"|PCI-E AIC)/i,
      Interface: /(PCIe\s*[\d\.]+\s*x\d+|SATA\s*3)/i,
      'Read Speed': /чтение\s*-\s*(\d+\s*Мбайт\/сек)/i,
    },
  },
  hdd: {
    keys: ['Capacity', 'RPM', 'Cache'],
    citilinkMap: {
      'Объем накопителя': 'Capacity',
      'Скорость вращения шпинделя': 'RPM',
      'Буферная память': 'Cache',
    },
    dnsRegex: {
      Capacity: /(\d+\s*ТБ|\d+\s*ГБ)/i,
      RPM: /(\d+\s*об\/мин)/i,
      Cache: /(\d+\s*МБ)/i,
    },
  },
  psu: {
    keys: ['Power', 'Certificate', 'Modular'],
    citilinkMap: {
      Мощность: 'Power',
      'Сертификат 80 PLUS': 'Certificate',
      'Отстегивающиеся кабели': 'Modular',
    },
    dnsRegex: {
      Power: /(\d+\s*Вт)/i,
      Certificate: /(80\+\s*[A-Za-z]+|Standard)/i,
      Modular: /(модульный)/i, // DNS text might not explicitly say "modular" in brackets always, check logs
    },
  },
  case: {
    keys: ['Form Factor', 'Color', 'GPU Length'],
    citilinkMap: {
      Типоразмер: 'Form Factor',
      Цвет: 'Color',
      'Максимальная длина видеокарты': 'GPU Length',
    },
    dnsRegex: {
      'Form Factor': /(Mid-Tower|Full-Tower|Mini-Tower|Super-Tower)/i,
      Color: /(черный|белый|серебристый)/i,
      // 'GPU Length' might be hard to extract from DNS summary string
    },
  },
  cooler: {
    keys: ['TDP', 'Fan Size', 'Height'],
    citilinkMap: {
      'Рассеиваемая мощность': 'TDP',
      'Размер вентилятора': 'Fan Size',
      'Высота кулера': 'Height',
    },
    dnsRegex: {
      TDP: /(\d+\s*Вт)/i,
      'Fan Size': /(\d+\s*x\s*\d+\s*мм)/i,
      // Height often not in summary
    },
  },
};
