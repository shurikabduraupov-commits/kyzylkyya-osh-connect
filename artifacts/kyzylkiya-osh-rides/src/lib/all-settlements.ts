import { useEffect, useState } from "react";
import { KYRGYZSTAN_SETTLEMENTS } from "@/lib/settlements";

const STORAGE_KEY = "mak.kg.settlements.v2";
const CUSTOM_KEY = "mak.kg.settlements.custom.v1";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function readCustom(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function writeCustom(list: string[]): void {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
  } catch {
    // ignore quota
  }
}

const customListeners = new Set<() => void>();

export function addCustomSettlement(name: string): void {
  const trimmed = name.trim();
  if (trimmed.length < 2) return;
  const current = readCustom();
  if (current.some((s) => s.toLowerCase() === trimmed.toLowerCase())) return;
  writeCustom([...current, trimmed]);
  customListeners.forEach((fn) => fn());
}

type CachePayload = {
  loadedAt: number;
  list: string[];
};

const DIGRAPHS: Array<[RegExp, string]> = [
  [/shch/gi, "щ"],
  [/sch/gi, "щ"],
  [/sh/gi, "ш"],
  [/ch/gi, "ч"],
  [/zh/gi, "ж"],
  [/kh/gi, "х"],
  [/ya/gi, "я"],
  [/yu/gi, "ю"],
  [/yo/gi, "ё"],
];

const CHAR_MAP: Record<string, string> = {
  a: "а", b: "б", c: "ц", d: "д", e: "е", f: "ф", g: "г", h: "х", i: "и",
  j: "ж", k: "к", l: "л", m: "м", n: "н", o: "о", p: "п", q: "к", r: "р",
  s: "с", t: "т", u: "у", v: "в", w: "в", x: "кс", y: "й", z: "з",
  ç: "ч", ğ: "г", ñ: "ң", ö: "ө", ş: "ш", ü: "ү", ı: "ы", ʻ: "", "'": "",
  "`": "",
};

function transliterate(input: string): string {
  let out = input;
  for (const [re, repl] of DIGRAPHS) {
    out = out.replace(re, (m) =>
      m[0] === m[0].toUpperCase()
        ? repl[0].toUpperCase() + repl.slice(1)
        : repl,
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

function isLatin(text: string): boolean {
  if (!/[A-Za-zÇĞÑÖŞÜçğñöşüı]/.test(text)) return false;
  if (/[А-Яа-яЁёӨөҮүҢң]/.test(text)) return false;
  return true;
}

function toCyrillic(text: string): string {
  return isLatin(text) ? transliterate(text) : text;
}

function readCache(): string[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachePayload;
    if (!parsed.list || !Array.isArray(parsed.list)) return null;
    if (Date.now() - parsed.loadedAt > MAX_AGE_MS) return null;
    return parsed.list;
  } catch {
    return null;
  }
}

function writeCache(list: string[]): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ loadedAt: Date.now(), list } satisfies CachePayload),
    );
  } catch {
    // ignore quota errors
  }
}

type OverpassElement = {
  tags?: Record<string, string>;
};

const OVERPASS_QUERY = `
[out:json][timeout:90];
area["ISO3166-1"="KG"][admin_level=2]->.kg;
(
  node["place"~"^(city|town|village|hamlet|suburb|locality|isolated_dwelling)$"]["name"](area.kg);
);
out tags;
`;

const ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];

async function fetchAllFromOverpass(signal: AbortSignal): Promise<string[]> {
  for (const url of ENDPOINTS) {
    try {
      const response = await fetch(url, {
        method: "POST",
        body: "data=" + encodeURIComponent(OVERPASS_QUERY),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal,
      });
      if (!response.ok) continue;
      const data = (await response.json()) as { elements: OverpassElement[] };
      const names = new Set<string>();
      for (const el of data.elements ?? []) {
        const tags = el.tags ?? {};
        const raw =
          tags["name:ru"] || tags["name:ky"] || tags.name || tags["name:en"];
        if (!raw) continue;
        const cyr = toCyrillic(raw).trim();
        if (cyr.length >= 2) names.add(cyr);
      }
      return Array.from(names);
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      // try next mirror
    }
  }
  return [];
}

function mergeAndSort(extra: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const name of KYRGYZSTAN_SETTLEMENTS) {
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      ordered.push(name);
    }
  }
  const additional = extra
    .filter((n) => !seen.has(n.toLowerCase()))
    .sort((a, b) => a.localeCompare(b, "ru"));
  for (const name of additional) {
    seen.add(name.toLowerCase());
    ordered.push(name);
  }
  return ordered;
}

let cachedList: string[] | null = null;
let inflight: Promise<string[]> | null = null;

function withCustom(base: string[]): string[] {
  const custom = readCustom();
  if (custom.length === 0) return base;
  const seen = new Set(base.map((s) => s.toLowerCase()));
  const extras = custom.filter((s) => !seen.has(s.toLowerCase()));
  return extras.length === 0 ? base : [...base, ...extras];
}

export function useAllSettlements(): string[] {
  const [list, setList] = useState<string[]>(() => {
    if (cachedList) return withCustom(cachedList);
    const fromStorage = readCache();
    if (fromStorage) {
      cachedList = mergeAndSort(fromStorage);
      return withCustom(cachedList);
    }
    return withCustom(KYRGYZSTAN_SETTLEMENTS);
  });

  useEffect(() => {
    const refresh = () => {
      const base = cachedList ?? KYRGYZSTAN_SETTLEMENTS;
      setList(withCustom(base));
    };
    customListeners.add(refresh);

    let controller: AbortController | null = null;
    if (!cachedList || cachedList.length <= KYRGYZSTAN_SETTLEMENTS.length) {
      const fromStorage = readCache();
      if (!fromStorage) {
        controller = new AbortController();
        if (!inflight) {
          inflight = fetchAllFromOverpass(controller.signal)
            .then((names) => {
              if (names.length === 0) return KYRGYZSTAN_SETTLEMENTS;
              const merged = mergeAndSort(names);
              cachedList = merged;
              writeCache(names);
              return merged;
            })
            .catch(() => KYRGYZSTAN_SETTLEMENTS)
            .finally(() => {
              inflight = null;
            });
        }
        inflight.then((merged) => {
          if (!controller!.signal.aborted) setList(withCustom(merged));
        });
      }
    }

    return () => {
      customListeners.delete(refresh);
      controller?.abort();
    };
  }, []);

  return list;
}
