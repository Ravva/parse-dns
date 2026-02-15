async function fetchDns() {
  try {
    console.log('Fetching DNS main page...');
    const response = await fetch('https://www.dns-shop.ru/catalog/', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      throw new Error(`Status: ${response.status}`);
    }

    const text = await response.text();
    console.log(`Length: ${text.length}`);

    // Look for links
    const matches = text.match(/\/catalog\/[a-z0-9]+\/[a-z0-9-]+\//g) || [];
    console.log(`Found ${matches.length} catalog links.`);

    // Filter for keywords
    const keywords = [
      'pitaniya',
      'korpusa',
      'kulery',
      'hdd',
      'ssd',
      'pamyat',
      'platy',
      'videokarty',
      'processory',
    ];
    const found = new Set();

    matches.forEach((m) => {
      if (keywords.some((k) => m.includes(k))) {
        found.add(m);
      }
    });

    console.log('--- Matches ---');
    console.log([...found].join('\n'));
  } catch (err) {
    console.error('Error:', err);
  }
}

fetchDns();
