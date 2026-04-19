export type NominatimSuggestion = {
  placeId: string;
  displayName: string;
  shortLabel: string;
  category: string;
  type: string;
  lat: string;
  lon: string;
};

type PhotonProperties = {
  osm_id: number;
  osm_type: string;
  osm_key: string;
  osm_value: string;
  type?: string;
  name?: string;
  street?: string;
  housenumber?: string;
  city?: string;
  district?: string;
  locality?: string;
  county?: string;
  state?: string;
  country?: string;
  countrycode?: string;
  postcode?: string;
};

type PhotonFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: PhotonProperties;
};

type PhotonResponse = {
  type: "FeatureCollection";
  features: PhotonFeature[];
};

const KG_BBOX = "69.2,39.1,80.3,43.3";

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
    out = out.replace(pattern, (match) => (match[0] === match[0].toUpperCase() ? replacement.toUpperCase() : replacement));
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
  if (/[А-Яа-яЁёӨөҮүҢңЇї]/.test(token)) return false;
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
    out = out.replace(pattern, (match) => (match[0] === match[0].toUpperCase() ? replacement[0].toUpperCase() + replacement.slice(1) : replacement));
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

function normalizeCity(value: string): string {
  return toCyrillic(value)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^а-яёөүңa-z]/gi, "");
}

const CITY_COORDS: Record<string, [number, number]> = {
  "Кызыл-Кыя": [72.1294, 40.2569],
  "Ош": [72.7985, 40.5283],
  "Бишкек": [74.5698, 42.8746],
  "Жалал-Абад": [72.9873, 40.9333],
  "Каракол": [78.3933, 42.4906],
  "Талас": [72.2425, 42.5228],
  "Нарын": [75.9911, 41.4287],
  "Баткен": [70.8197, 40.0613],
  "Узген": [73.3008, 40.7692],
  "Кара-Суу": [72.8675, 40.7042],
};

function buildShortLabel(props: PhotonProperties, fallbackName: string): string {
  const parts: string[] = [];
  const street = toCyrillic(props.street ?? "");
  const houseNumber = props.housenumber;
  const placeName = toCyrillic(props.name ?? "");
  const settlement = toCyrillic(
    props.city || props.locality || props.district || props.county || "",
  );

  if (street) {
    parts.push(houseNumber ? `${street}, ${houseNumber}` : street);
    if (placeName && placeName !== street) {
      parts.unshift(placeName);
    }
  } else if (placeName) {
    parts.push(placeName);
  } else {
    parts.push(toCyrillic(fallbackName));
  }

  if (settlement && !parts.some((p) => p.includes(settlement))) {
    parts.push(settlement);
  }

  return parts.join(", ");
}

function buildDisplayName(props: PhotonProperties): string {
  const segments = [
    props.name,
    props.street,
    props.city || props.locality,
    props.district,
    props.county,
    props.state,
    props.country,
  ]
    .filter((value, index, all) => value && all.indexOf(value) === index)
    .map((value) => toCyrillic(value as string));
  return segments.join(", ");
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

  const proximity = CITY_COORDS[city];

  const buildUrl = (q: string) => {
    const params = new URLSearchParams({
      q,
      limit: "20",
      bbox: KG_BBOX,
    });
    if (proximity) {
      params.set("lon", String(proximity[0]));
      params.set("lat", String(proximity[1]));
    }
    return `https://photon.komoot.io/api/?${params.toString()}`;
  };

  const queries = new Set<string>();
  queries.add(trimmed);
  const latinQuery = toLatin(trimmed);
  if (latinQuery && latinQuery !== trimmed) queries.add(latinQuery);
  const cyrQuery = toCyrillic(trimmed);
  if (cyrQuery && cyrQuery !== trimmed) queries.add(cyrQuery);

  const responses = await Promise.all(
    Array.from(queries).map(async (q) => {
      try {
        const r = await fetch(buildUrl(q), { signal, headers: { Accept: "application/json" } });
        if (!r.ok) return [] as PhotonFeature[];
        const json = (await r.json()) as PhotonResponse;
        return json.features ?? [];
      } catch (err) {
        if ((err as Error).name === "AbortError") throw err;
        return [] as PhotonFeature[];
      }
    }),
  );

  const allFeatures = responses.flat();
  const seenIds = new Set<string>();
  const uniqueFeatures = allFeatures.filter((feature) => {
    const key = `${feature.properties.osm_type}:${feature.properties.osm_id}`;
    if (seenIds.has(key)) return false;
    seenIds.add(key);
    return true;
  });

  const normalizedCity = normalizeCity(city);

  return uniqueFeatures
    .filter((feature) => (feature.properties.countrycode ?? "").toUpperCase() === "KG")
    .filter((feature) => {
      if (!normalizedCity) return true;
      const candidates = [
        feature.properties.city,
        feature.properties.locality,
        feature.properties.district,
        feature.properties.county,
      ]
        .filter((value): value is string => Boolean(value))
        .map((value) => normalizeCity(value));
      return candidates.some(
        (value) =>
          value === normalizedCity ||
          value.includes(normalizedCity) ||
          normalizedCity.includes(value),
      );
    })
    .slice(0, 12)
    .map((feature) => {
      const props = feature.properties;
      const fallbackName = props.name ?? props.street ?? "";
      return {
        placeId: `${props.osm_type}:${props.osm_id}:${props.osm_key}:${props.osm_value}`,
        displayName: buildDisplayName(props),
        shortLabel: buildShortLabel(props, fallbackName),
        category: props.osm_key,
        type: props.osm_value,
        lat: String(feature.geometry.coordinates[1]),
        lon: String(feature.geometry.coordinates[0]),
      };
    })
    .filter((item) => item.shortLabel.trim().length > 0);
}
