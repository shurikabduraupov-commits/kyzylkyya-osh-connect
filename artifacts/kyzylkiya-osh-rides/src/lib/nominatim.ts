export type NominatimSuggestion = {
  placeId: string;
  displayName: string;
  shortLabel: string;
  category: string;
  type: string;
  lat: string;
  lon: string;
  searchTerms: string[];
};
import { apiUrl } from "@/lib/api-url";

const DIGRAPH_MAP: Array<[RegExp, string]> = [
  [/shch/gi, "щ"],
  [/sch/gi, "щ"],
  [/sh/gi, "ш"],
  [/ch/gi, "ч"],
  [/zh/gi, "ж"],
  [/kh/gi, "х"],
  [/gh/gi, "г"],
  [/ts/gi, "ц"],
  [/ya/gi, "я"],
  [/yu/gi, "ю"],
  [/yo/gi, "ё"],
  [/ye/gi, "е"],
];

const CHAR_MAP: Record<string, string> = {
  a: "а", b: "б", c: "ц", d: "д", e: "е", f: "ф", g: "г", h: "х", i: "и",
  j: "ж", k: "к", l: "л", m: "м", n: "н", o: "о", p: "п", q: "к", r: "р",
  s: "с", t: "т", u: "у", v: "в", w: "в", x: "кс", y: "й", z: "з",
  ç: "ч", ğ: "г", ñ: "ң", ö: "ө", ş: "ш", ü: "ү", ı: "ы", ʻ: "", "'": "",
  "`": "",
};

function transliterateToken(token: string): string {
  let out = token;
  for (const [pattern, replacement] of DIGRAPH_MAP) {
    out = out.replace(pattern, (match) =>
      match[0] === match[0].toUpperCase()
        ? replacement[0].toUpperCase() + replacement.slice(1)
        : replacement,
    );
  }
  let result = "";
  for (const ch of out) {
    const lower = ch.toLowerCase();
    const mapped = CHAR_MAP[lower];
    if (mapped !== undefined) {
      result += ch === lower ? mapped : mapped.toUpperCase();
    } else {
      result += ch;
    }
  }
  return result;
}

function isLatinToken(token: string): boolean {
  if (!/[A-Za-zÇĞÑÖŞÜçğñöşüıʻ']/.test(token)) return false;
  if (/[А-Яа-яЁёӨөҮүҢң]/.test(token)) return false;
  return true;
}

function toCyrillic(text: string): string {
  if (!text) return text;
  return text
    .split(/(\s+|[,;:.()/\-])/)
    .map((segment) => (isLatinToken(segment) ? transliterateToken(segment) : segment))
    .join("");
}

const CYR_TO_LAT_DIGRAPH: Array<[RegExp, string]> = [
  [/щ/gi, "shch"],
  [/ш/gi, "sh"],
  [/ч/gi, "ch"],
  [/ж/gi, "zh"],
  [/х/gi, "kh"],
  [/ц/gi, "ts"],
  [/я/gi, "ya"],
  [/ю/gi, "yu"],
  [/ё/gi, "yo"],
];

const CYR_TO_LAT_CHAR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
  у: "u", ф: "f", ы: "y", э: "e", ө: "o", ү: "u", ң: "n", ъ: "", ь: "",
};

function toLatin(text: string): string {
  if (!text) return text;
  let out = text;
  for (const [pattern, replacement] of CYR_TO_LAT_DIGRAPH) {
    out = out.replace(pattern, (match) =>
      match[0] === match[0].toUpperCase()
        ? replacement[0].toUpperCase() + replacement.slice(1)
        : replacement,
    );
  }
  let result = "";
  for (const ch of out) {
    const lower = ch.toLowerCase();
    const mapped = CYR_TO_LAT_CHAR[lower];
    if (mapped !== undefined) {
      result += ch === lower ? mapped : mapped.toUpperCase();
    } else {
      result += ch;
    }
  }
  return result;
}

const CITY_COORDS: Record<string, [number, number]> = {
  "Бишкек": [74.5698, 42.8746],
  "Ош": [72.7985, 40.5283],
  "Жалал-Абад": [72.9873, 40.9333],
  "Каракол": [78.3933, 42.4906],
  "Нарын": [75.9911, 41.4287],
  "Талас": [72.2425, 42.5228],
  "Баткен": [70.8197, 40.0613],
  "Кызыл-Кыя": [72.1294, 40.2569],
  "Кара-Балта": [73.8500, 42.8167],
  "Токмок": [75.2989, 42.8417],
  "Балыкчы": [76.1856, 42.4606],
  "Кант": [74.8500, 42.8917],
  "Кара-Суу": [72.8675, 40.7042],
  "Өзгөн": [73.3008, 40.7692],
  "Ноокат": [72.6164, 40.2675],
  "Араван": [72.5083, 40.5083],
  "Кадамжай": [71.7333, 40.1167],
  "Айдаркен": [71.4458, 39.9367],
  "Раззаков": [69.5650, 39.9333],
  "Сүлүктү": [69.5667, 39.9333],
  "Базар-Коргон": [72.7464, 41.0392],
  "Кочкор-Ата": [72.5025, 41.0436],
  "Майлуу-Суу": [72.4731, 41.2967],
  "Таш-Көмүр": [72.2200, 41.3450],
  "Кербен": [71.7833, 41.5167],
  "Ала-Бука": [71.4292, 41.4042],
  "Токтогул": [72.9417, 41.8750],
  "Казарман": [74.0500, 41.4000],
  "Сузак": [73.0500, 40.8500],
  "Ноокен": [72.6000, 41.1833],
  "Кочкор": [75.7833, 42.2167],
  "Ат-Башы": [75.8083, 41.1700],
  "Чолпон-Ата": [77.0833, 42.6500],
  "Бөкөнбаев": [77.1833, 42.1500],
  "Кызыл-Суу": [78.0000, 42.3500],
  "Түп": [78.3667, 42.7333],
  "Ананьево": [77.6500, 42.7333],
  "Бостери": [77.2167, 42.6333],
  "Кемин": [75.7000, 42.7833],
  "Шопоков": [74.3667, 42.8333],
  "Сокулук": [74.3000, 42.8667],
  "Беловодское": [74.1167, 42.8167],
  "Каинды": [73.7000, 42.8333],
  "Манас": [72.4833, 42.5167],
  "Покровка": [78.4500, 42.6500],
  "Ленинполь": [71.7500, 42.4833],
  "Дароот-Коргон": [72.2167, 39.5500],
  "Гүлчө": [73.4500, 40.3167],
  "Сары-Таш": [73.2667, 39.7333],
  "Кара-Кулжа": [73.5000, 40.5667],
  "Каныш-Кыя": [71.0833, 41.6667],
  "Кара-Көл": [72.6833, 41.6167],
  "Көк-Жаңгак": [73.2000, 41.0333],
  "Шамалды-Сай": [72.2333, 41.1667],
  "Массы": [72.5667, 41.1500],
  "Кызыл-Адыр": [71.5667, 42.6167],
  "Ивановка": [74.9333, 42.8833],
  "Лебединовка": [74.6833, 42.8833],
  "Маевка": [74.5333, 42.8500],
  "Новопавловка": [74.5333, 42.8500],
};

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type OverpassResponse = { elements: OverpassElement[] };

const cityCache = new Map<string, Promise<NominatimSuggestion[]>>();

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const cacheKey = (city: string) => `mak.places.v1.${city}`;

function readDiskCache(city: string): NominatimSuggestion[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(city));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; places: NominatimSuggestion[] };
    if (!parsed?.ts || !Array.isArray(parsed.places)) return null;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed.places;
  } catch {
    return null;
  }
}

function writeDiskCache(city: string, places: NominatimSuggestion[]): void {
  if (typeof window === "undefined") return;
  if (!places.length) return;
  try {
    window.localStorage.setItem(
      cacheKey(city),
      JSON.stringify({ ts: Date.now(), places }),
    );
  } catch {
    // quota exceeded — ignore
  }
}

async function fetchCityPlaces(city: string): Promise<NominatimSuggestion[]> {
  const coords = CITY_COORDS[city];
  if (!coords) return [];
  const [lon, lat] = coords;

  const query = `
    [out:json][timeout:12];
    (
      way["highway"]["name"](around:8000,${lat},${lon});
      way["highway"]["name:ru"](around:8000,${lat},${lon});
      way["highway"]["name:ky"](around:8000,${lat},${lon});
      way["highway"]["name:en"](around:8000,${lat},${lon});
      node["place"~"neighbourhood|suburb|quarter|hamlet|village"]["name"](around:8000,${lat},${lon});
    );
    out tags center 700;
  `;

  const endpoints = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.osm.ch/api/interpreter",
  ];

  const timeoutMs = 6500;
  const requests = endpoints.map(async (url) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        body: "data=" + encodeURIComponent(query),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Overpass mirror failed: ${response.status}`);
      }
      return (await response.json()) as OverpassResponse;
    } finally {
      window.clearTimeout(timeout);
    }
  });

  let data: OverpassResponse | null = null;
  try {
    data = await Promise.any(requests);
  } catch {
    data = null;
  }

  if (!data) return [];

  const seen = new Set<string>();
  const places: NominatimSuggestion[] = [];

  for (const el of data.elements ?? []) {
    const tags = el.tags ?? {};
    const rawName =
      tags["name:ru"] || tags.name || tags["name:ky"] || tags["name:en"];
    if (!rawName) continue;

    const altNames = [
      tags.name,
      tags["name:ru"],
      tags["name:ky"],
      tags["name:en"],
      tags["alt_name"],
      tags["official_name"],
      tags["loc_name"],
      tags["old_name"],
    ].filter((s): s is string => !!s);

    const cyrName = toCyrillic(rawName);
    const isStreet = !!tags.highway;
    const isPlace = !!tags.place;
    const amenity = tags.amenity || tags.shop || tags.tourism;
    const category = isStreet ? "highway" : isPlace ? "place" : "amenity";
    const key = `${cyrName.toLowerCase()}|${category}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const lat = String(el.lat ?? el.center?.lat ?? coords[1]);
    const lon = String(el.lon ?? el.center?.lon ?? coords[0]);

    const shortLabel = `${cyrName}, ${city}`;
    const suffix = isStreet
      ? "көчө"
      : isPlace
        ? tags.place
        : amenity || "";
    const displayName = `${cyrName}${suffix ? ` — ${suffix}` : ""}, ${city}`;

    const searchTerms: string[] = [];
    for (const name of altNames) {
      searchTerms.push(name.toLowerCase());
      searchTerms.push(toCyrillic(name).toLowerCase());
      searchTerms.push(toLatin(name).toLowerCase());
    }

    places.push({
      placeId: `${el.type}:${el.id}`,
      displayName,
      shortLabel,
      category,
      type: tags.highway || tags.place || amenity || "",
      lat,
      lon,
      searchTerms: Array.from(new Set(searchTerms)),
    });
  }

  const order: Record<string, number> = { highway: 0, place: 1, amenity: 2 };
  places.sort((a, b) => {
    const oa = order[a.category] ?? 9;
    const ob = order[b.category] ?? 9;
    if (oa !== ob) return oa - ob;
    return a.shortLabel.localeCompare(b.shortLabel, "ru");
  });

  return places;
}

function getCityPlaces(city: string): Promise<NominatimSuggestion[]> {
  if (!cityCache.has(city)) {
    const cached = readDiskCache(city);
    if (cached) {
      cityCache.set(city, Promise.resolve(cached));
    } else {
      const promise = fetchCityPlaces(city)
        .then((places) => {
          writeDiskCache(city, places);
          return places;
        })
        .catch(() => [] as NominatimSuggestion[]);
      cityCache.set(city, promise);
    }
  }
  return cityCache.get(city)!;
}

export function prefetchCityPlaces(city: string): void {
  if (!city) return;
  void getCityPlaces(city);
}

function buildHaystacks(text: string): string[] {
  const cyr = toCyrillic(text).toLowerCase();
  const lat = toLatin(text).toLowerCase();
  return cyr === lat ? [cyr] : [cyr, lat];
}

function inKyrgyzstan(lon: number, lat: number): boolean {
  return lon >= 69 && lon <= 80.7 && lat >= 39 && lat <= 43.4;
}

function photonCoords(geom: { type?: string; coordinates?: unknown }): [number, number] | null {
  if (!geom?.coordinates) return null;
  if (geom.type === "Point" && Array.isArray(geom.coordinates) && geom.coordinates.length >= 2) {
    const [lon, lat] = geom.coordinates as [number, number];
    if (typeof lon === "number" && typeof lat === "number") return [lon, lat];
  }
  if (geom.type === "LineString" && Array.isArray(geom.coordinates) && geom.coordinates.length > 0) {
    const mid = geom.coordinates[Math.floor(geom.coordinates.length / 2)] as unknown;
    if (Array.isArray(mid) && mid.length >= 2 && typeof mid[0] === "number" && typeof mid[1] === "number") {
      return [mid[0], mid[1]];
    }
  }
  return null;
}

/** Direct Photon from the browser — works when the Render server cannot reach external geocoders. */
async function fetchPhotonBrowser(
  city: string,
  query: string,
  signal?: AbortSignal,
): Promise<NominatimSuggestion[]> {
  const q = `${query} ${city}`.trim();
  const params = new URLSearchParams({ q, limit: "40", lang: "ru" });
  let res: Response;
  try {
    res = await fetch(`https://photon.komoot.io/api/?${params}`, { signal });
  } catch {
    return [];
  }
  if (!res.ok) return [];
  const data = (await res.json().catch(() => null)) as {
    features?: Array<{
      geometry?: { type?: string; coordinates?: unknown };
      properties?: Record<string, unknown>;
    }>;
  } | null;
  if (!data?.features?.length) return [];

  const seen = new Set<string>();
  const out: NominatimSuggestion[] = [];

  for (const feat of data.features) {
    const props = feat.properties ?? {};
    const coords = photonCoords(feat.geometry ?? {});
    if (!coords) continue;
    const [lon, lat] = coords;
    const cc = String(props.countrycode ?? "").toLowerCase();
    if (cc) {
      if (cc !== "kg") continue;
    } else if (!inKyrgyzstan(lon, lat)) {
      continue;
    }

    const name = String(props.name ?? "").trim();
    const street = String(props.street ?? "").trim();
    const housenumber = String(props.housenumber ?? "").trim();
    const locality = String(
      props.city ?? props.town ?? props.village ?? props.district ?? props.locality ?? "",
    ).trim();
    const country = String(props.country ?? "").trim();
    const line1Parts = [street || name, housenumber].filter(Boolean);
    const line1 = line1Parts.length > 0 ? line1Parts.join(" ") : (name || street);
    if (!line1) continue;

    const display = [line1, locality, country].filter(Boolean).join(", ");
    const short = [line1, locality || city].filter(Boolean).join(", ");
    const key = display.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const osmId = props.osm_id;
    const osmType = String(props.osm_type ?? "x");
    const placeId =
      typeof osmId === "number" || typeof osmId === "string"
        ? `photon:${osmType}:${osmId}`
        : `photon:${crypto.randomUUID?.() ?? String(Math.random())}`;

    const terms = new Set<string>([
      display.toLowerCase(),
      short.toLowerCase(),
      query.toLowerCase(),
      city.toLowerCase(),
    ]);
    if (locality) terms.add(locality.toLowerCase());

    out.push({
      placeId,
      displayName: display,
      shortLabel: short,
      category: String(props.osm_key ?? "address"),
      type: String(props.osm_value ?? props.type ?? ""),
      lat: String(lat),
      lon: String(lon),
      searchTerms: Array.from(terms),
    });
    if (out.length >= 20) break;
  }

  return out;
}

export async function searchNominatim({
  query,
  city,
  signal,
}: {
  query: string;
  city: string;
  signal?: AbortSignal;
}): Promise<NominatimSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 1) return [];

  const fromPhoton = await fetchPhotonBrowser(city, trimmed, signal);
  if (signal?.aborted) return [];
  if (fromPhoton.length > 0) return fromPhoton;

  const fallbackSearch = async (): Promise<NominatimSuggestion[]> => {
    const params = new URLSearchParams();
    params.set("q", trimmed);
    params.set("city", city);
    const resp = await fetch(apiUrl(`/rides-api/address-search?${params.toString()}`), { signal });
    if (!resp.ok) return [];
    const payload = await resp.json().catch(() => []);
    if (!Array.isArray(payload)) return [];
    return payload
      .map((item) => ({
        placeId: String(item?.placeId ?? ""),
        displayName: String(item?.displayName ?? ""),
        shortLabel: String(item?.shortLabel ?? ""),
        category: String(item?.category ?? ""),
        type: String(item?.type ?? ""),
        lat: String(item?.lat ?? ""),
        lon: String(item?.lon ?? ""),
        searchTerms: Array.isArray(item?.searchTerms)
          ? item.searchTerms.map((v: unknown) => String(v).toLowerCase())
          : [],
      }))
      .filter((item) => item.placeId && item.shortLabel);
  };

  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (apiBase) {
    const fromServer = await fallbackSearch();
    if (signal?.aborted) return [];
    if (fromServer.length > 0) return fromServer;
  }

  const places = await getCityPlaces(city);
  if (signal?.aborted) return [];
  if (places.length === 0) {
    return fallbackSearch();
  }

  const needles = buildHaystacks(trimmed);

  const matches = places.filter((place) => {
    const haystacks = [...place.searchTerms, ...buildHaystacks(place.shortLabel)];
    return needles.some((needle) => haystacks.some((hay) => hay.includes(needle)));
  });

  matches.sort((a, b) => {
    const aHays = [...a.searchTerms, ...buildHaystacks(a.shortLabel)];
    const bHays = [...b.searchTerms, ...buildHaystacks(b.shortLabel)];
    const aStarts = aHays.some((h) => needles.some((n) => h.startsWith(n)));
    const bStarts = bHays.some((h) => needles.some((n) => h.startsWith(n)));
    if (aStarts !== bStarts) return aStarts ? -1 : 1;
    return 0;
  });

  const top = matches.slice(0, 20);
  if (top.length > 0) return top;
  return fallbackSearch();
}
