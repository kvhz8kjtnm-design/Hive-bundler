import axios from 'axios';
import { load } from 'cheerio';

export interface ScrapedMeta {
  name?: string;
  description?: string;
  imageUrl?: string;
  twitter?: string;
  telegram?: string;
  website: string;
}

export async function scrapeWebsiteMeta(url: string): Promise<ScrapedMeta> {
  const resp = await axios.get<string>(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    timeout: 10_000,
    responseType: 'text',
  });

  const $ = load(resp.data);

  // Pull one meta value, trying property then name attribute
  const meta = (key: string) =>
    $(`meta[property="${key}"]`).attr('content') ??
    $(`meta[name="${key}"]`).attr('content');

  const name = (
    meta('og:title') ??
    meta('twitter:title') ??
    $('title').first().text().trim() ??
    undefined
  ) || undefined;

  const rawDesc =
    meta('og:description') ??
    meta('twitter:description') ??
    meta('description') ??
    undefined;

  // pump.fun description cap is 30 chars on-chain; we store full in IPFS
  const description = rawDesc?.slice(0, 60).trim();

  const imageUrl =
    meta('og:image') ??
    meta('twitter:image') ??
    meta('twitter:image:src') ??
    undefined;

  // Scan <a href> links for known social domains
  const hrefs: string[] = [];
  $('a[href]').each((_, el) => {
    const h = $(el).attr('href');
    if (h) hrefs.push(h);
  });

  const twitterHref = hrefs.find(h => /twitter\.com|x\.com/i.test(h));
  const twitterSite = meta('twitter:site');
  const twitter =
    twitterHref ??
    (twitterSite ? `https://x.com/${twitterSite.replace('@', '')}` : undefined);

  const telegram = hrefs.find(h => /t\.me\/|telegram\.me\//i.test(h));

  return { name, description, imageUrl, twitter, telegram, website: url };
}
