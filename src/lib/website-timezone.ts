import { promises as dns } from "node:dns";

/** Country-code TLDs → the timezone that usually matches the site's local audience. */
const CC_TLD_TIMEZONES: Record<string, string> = {
  de: "Europe/Berlin",
  at: "Europe/Vienna",
  ch: "Europe/Zurich",
  li: "Europe/Zurich",
  nl: "Europe/Amsterdam",
  be: "Europe/Brussels",
  lu: "Europe/Luxembourg",
  fr: "Europe/Paris",
  it: "Europe/Rome",
  es: "Europe/Madrid",
  pt: "Europe/Lisbon",
  ie: "Europe/Dublin",
  uk: "Europe/London",
  gb: "Europe/London",
  pl: "Europe/Warsaw",
  cz: "Europe/Prague",
  sk: "Europe/Bratislava",
  hu: "Europe/Budapest",
  ro: "Europe/Bucharest",
  bg: "Europe/Sofia",
  gr: "Europe/Athens",
  se: "Europe/Stockholm",
  no: "Europe/Oslo",
  dk: "Europe/Copenhagen",
  fi: "Europe/Helsinki",
  ee: "Europe/Tallinn",
  lv: "Europe/Riga",
  lt: "Europe/Vilnius",
  si: "Europe/Ljubljana",
  hr: "Europe/Zagreb",
  rs: "Europe/Belgrade",
  ua: "Europe/Kyiv",
  ru: "Europe/Moscow",
  tr: "Europe/Istanbul",
  il: "Asia/Jerusalem",
  ae: "Asia/Dubai",
  sa: "Asia/Riyadh",
  in: "Asia/Kolkata",
  sg: "Asia/Singapore",
  hk: "Asia/Hong_Kong",
  tw: "Asia/Taipei",
  jp: "Asia/Tokyo",
  kr: "Asia/Seoul",
  cn: "Asia/Shanghai",
  au: "Australia/Sydney",
  nz: "Pacific/Auckland",
  br: "America/Sao_Paulo",
  mx: "America/Mexico_City",
  ar: "America/Argentina/Buenos_Aires",
  cl: "America/Santiago",
  ca: "America/Toronto",
  us: "America/New_York",
  za: "Africa/Johannesburg",
  eg: "Africa/Cairo",
  ng: "Africa/Lagos",
  ke: "Africa/Nairobi",
};

const LANG_TIMEZONES: Record<string, string> = {
  de: "Europe/Berlin",
  at: "Europe/Vienna",
  gsw: "Europe/Zurich",
  nl: "Europe/Amsterdam",
  fr: "Europe/Paris",
  it: "Europe/Rome",
  es: "Europe/Madrid",
  pt: "Europe/Lisbon",
  pl: "Europe/Warsaw",
  cs: "Europe/Prague",
  sk: "Europe/Bratislava",
  hu: "Europe/Budapest",
  ro: "Europe/Bucharest",
  bg: "Europe/Sofia",
  el: "Europe/Athens",
  sv: "Europe/Stockholm",
  nb: "Europe/Oslo",
  nn: "Europe/Oslo",
  no: "Europe/Oslo",
  da: "Europe/Copenhagen",
  fi: "Europe/Helsinki",
  et: "Europe/Tallinn",
  lv: "Europe/Riga",
  lt: "Europe/Vilnius",
  sl: "Europe/Ljubljana",
  hr: "Europe/Zagreb",
  sr: "Europe/Belgrade",
  uk: "Europe/Kyiv",
  ru: "Europe/Moscow",
  tr: "Europe/Istanbul",
  he: "Asia/Jerusalem",
  ar: "Asia/Riyadh",
  hi: "Asia/Kolkata",
  ja: "Asia/Tokyo",
  ko: "Asia/Seoul",
  zh: "Asia/Shanghai",
};

function normalizeTimezone(value: string | null | undefined): string {
  const tz = (value ?? "").trim();
  if (!tz) return "";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return "";
  }
}

function cleanDomain(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
}

function publicSuffixHint(domain: string): string {
  const parts = cleanDomain(domain).split(".").filter(Boolean);
  if (parts.length < 2) return "";
  const last = parts[parts.length - 1]!;
  const second = parts[parts.length - 2]!;
  // e.g. co.uk, com.au
  if (["uk", "au", "nz", "jp", "kr", "br", "in", "za"].includes(last) && parts.length >= 3) {
    if (["co", "com", "org", "net", "ac", "gov"].includes(second)) return last;
  }
  return last;
}

function timezoneFromCcTld(domain: string): string {
  const hint = publicSuffixHint(domain);
  return normalizeTimezone(CC_TLD_TIMEZONES[hint] || "");
}

function timezoneVotes(candidates: string[]): string {
  const counts = new Map<string, number>();
  for (const raw of candidates) {
    const tz = normalizeTimezone(raw);
    if (!tz) continue;
    counts.set(tz, (counts.get(tz) || 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [tz, count] of counts) {
    if (count > bestCount) {
      best = tz;
      bestCount = count;
    }
  }
  return best;
}

async function timezoneFromNameservers(domain: string): Promise<string> {
  try {
    const ns = await dns.resolveNs(cleanDomain(domain));
    const votes: string[] = [];
    for (const name of ns) {
      const host = name.toLowerCase().replace(/\.$/, "");
      // ui-dns.de / ionos.de → Germany
      const tld = publicSuffixHint(host) || host.split(".").pop() || "";
      const tz = CC_TLD_TIMEZONES[tld];
      if (tz) votes.push(tz);
    }
    return timezoneVotes(votes);
  } catch {
    return "";
  }
}

async function timezoneFromHomepage(domain: string): Promise<string> {
  const host = cleanDomain(domain);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`https://${host}/`, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "text/html",
        "user-agent": "AirsupTimezoneBot/1.0",
      },
    });
    if (!response.ok) return "";
    const html = (await response.text()).slice(0, 80_000).toLowerCase();
    const langMatch = html.match(/<html[^>]*\slang\s*=\s*["']([a-z]{2,3})(?:-([a-z]{2}))?["']/i);
    if (langMatch) {
      const lang = (langMatch[1] || "").toLowerCase();
      const region = (langMatch[2] || "").toLowerCase();
      if (region && CC_TLD_TIMEZONES[region]) {
        return normalizeTimezone(CC_TLD_TIMEZONES[region]);
      }
      if (lang !== "en" && LANG_TIMEZONES[lang]) {
        return normalizeTimezone(LANG_TIMEZONES[lang]);
      }
    }
    // Light content hints when lang is generic English but the site is clearly local.
    if (/\b(berlin|deutschland|germany)\b/.test(html)) return "Europe/Berlin";
    if (/\b(wien|austria|österreich)\b/.test(html)) return "Europe/Vienna";
    if (/\b(zürich|zurich|switzerland|schweiz)\b/.test(html)) return "Europe/Zurich";
    if (/\b(london|united kingdom|england)\b/.test(html)) return "Europe/London";
    if (/\b(paris|france)\b/.test(html)) return "Europe/Paris";
    if (/\b(amsterdam|netherlands)\b/.test(html)) return "Europe/Amsterdam";
    return "";
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function timezoneFromHosting(domain: string): Promise<string> {
  const host = cleanDomain(domain);
  try {
    const response = await fetch(`https://ipaddress.to/api/lookup/${encodeURIComponent(host)}`, {
      headers: { "user-agent": "Airsup/1.0", accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (response.ok) {
      const json = (await response.json().catch(() => null)) as {
        success?: boolean;
        location?: { timezone?: string; country_code?: string };
        is_hosting?: boolean;
      } | null;
      const tz = normalizeTimezone(json?.location?.timezone);
      if (tz) return tz;
      const country = (json?.location?.country_code || "").toLowerCase();
      if (country && CC_TLD_TIMEZONES[country]) {
        return normalizeTimezone(CC_TLD_TIMEZONES[country]);
      }
    }
  } catch {
    // fall through
  }

  try {
    const ips = await dns.resolve4(host);
    const ip = ips[0];
    if (!ip) return "";
    const response = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,timezone,countryCode`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!response.ok) return "";
    const json = (await response.json().catch(() => null)) as {
      status?: string;
      timezone?: string;
      countryCode?: string;
    } | null;
    if (json?.status !== "success") return "";
    return (
      normalizeTimezone(json.timezone) ||
      normalizeTimezone(CC_TLD_TIMEZONES[(json.countryCode || "").toLowerCase()] || "")
    );
  } catch {
    return "";
  }
}

/**
 * Pick the timezone that best matches where the website "lives" locally —
 * not the setup user's laptop clock, and not blindly a CDN edge.
 *
 * Priority: env override → ccTLD → DNS nameserver country → site language/content → hosting GeoIP.
 */
export async function inferWebsiteTimezone(domain: string): Promise<string> {
  const host = cleanDomain(domain);
  if (!host) return "";

  const fromTld = timezoneFromCcTld(host);
  if (fromTld) return fromTld;

  const fromNs = await timezoneFromNameservers(host);
  if (fromNs) return fromNs;

  const fromSite = await timezoneFromHomepage(host);
  if (fromSite) return fromSite;

  return (await timezoneFromHosting(host)) || "";
}

export { normalizeTimezone as normalizeIanaTimezone };
