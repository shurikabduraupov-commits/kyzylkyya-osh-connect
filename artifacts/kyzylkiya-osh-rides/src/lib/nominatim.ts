export type NominatimSuggestion = {
  placeId: string;
  displayName: string;
  shortLabel: string;
  category: string;
  type: string;
  lat: string;
  lon: string;
};

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

async function fetchCityPlaces(city: string): Promise<NominatimSuggestion[]> {
  const coords = CITY_COORDS[city];
  if (!coords) return [];
  const [lon, lat] = coords;

  const query = `
    [out:json][timeout:20];
    (
      way["highway"]["name"](around:7000,${lat},${lon});
      node["amenity"]["name"](around:7000,${lat},${lon});
      way["amenity"]["name"](around:7000,${lat},${lon});
      node["shop"]["name"](around:7000,${lat},${lon});
      node["tourism"]["name"](around:7000,${lat},${lon});
    );
    out tags center 800;
  `;

  const endpoints = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.osm.ch/api/interpreter",
  ];

  let data: OverpassResponse | null = null;
  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        method: "POST",
        body: "data=" + encodeURIComponent(query),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      if (!response.ok) continue;
      data = (await response.json()) as OverpassResponse;
      break;
    } catch {
      // try next mirror
    }
  }

  if (!data) return [];

  const seen = new Set<string>();
  const places: NominatimSuggestion[] = [];

  for (const el of data.elements ?? []) {
    const tags = el.tags ?? {};
    const rawName = tags.name;
    if (!rawName) continue;

    const cyrName = toCyrillic(rawName);
    const isStreet = !!tags.highway;
    const amenity = tags.amenity || tags.shop || tags.tourism;
    const key = `${cyrName.toLowerCase()}|${isStreet ? "s" : amenity || "x"}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const lat = String(el.lat ?? el.center?.lat ?? coords[1]);
    const lon = String(el.lon ?? el.center?.lon ?? coords[0]);

    const shortLabel = `${cyrName}, ${city}`;
    const displayName = isStreet
      ? `${cyrName}, ${city} (көчө)`
      : `${cyrName}${amenity ? ` — ${amenity}` : ""}, ${city}`;

    places.push({
      placeId: `${el.type}:${el.id}`,
      displayName,
      shortLabel,
      category: isStreet ? "highway" : "amenity",
      type: tags.highway || amenity || "",
      lat,
      lon,
    });
  }

  places.sort((a, b) => {
    if (a.category !== b.category) return a.category === "highway" ? -1 : 1;
    return a.shortLabel.localeCompare(b.shortLabel, "ru");
  });

  return places;
}

function getCityPlaces(city: string): Promise<NominatimSuggestion[]> {
  if (!cityCache.has(city)) {
    const promise = fetchCityPlaces(city).catch(() => [] as NominatimSuggestion[]);
    cityCache.set(city, promise);
  }
  return cityCache.get(city)!;
}

function buildHaystacks(text: string): string[] {
  const cyr = toCyrillic(text).toLowerCase();
  const lat = toLatin(text).toLowerCase();
  return cyr === lat ? [cyr] : [cyr, lat];
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

  const places = await getCityPlaces(city);
  if (signal?.aborted) return [];

  const needles = buildHaystacks(trimmed);

  const matches = places.filter((place) => {
    const haystacks = buildHaystacks(place.shortLabel);
    return needles.some((needle) => haystacks.some((hay) => hay.includes(needle)));
  });

  matches.sort((a, b) => {
    const aStarts = buildHaystacks(a.shortLabel).some((h) =>
      needles.some((n) => h.startsWith(n)),
    );
    const bStarts = buildHaystacks(b.shortLabel).some((h) =>
      needles.some((n) => h.startsWith(n)),
    );
    if (aStarts !== bStarts) return aStarts ? -1 : 1;
    return 0;
  });

  return matches.slice(0, 15);
}
