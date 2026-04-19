export type NominatimSuggestion = {
  placeId: number;
  displayName: string;
  shortLabel: string;
  category: string;
  type: string;
  lat: string;
  lon: string;
};

type NominatimAddress = {
  road?: string;
  pedestrian?: string;
  footway?: string;
  cycleway?: string;
  path?: string;
  residential?: string;
  neighbourhood?: string;
  suburb?: string;
  village?: string;
  town?: string;
  city?: string;
  hamlet?: string;
  county?: string;
  state?: string;
  amenity?: string;
  shop?: string;
  building?: string;
  house_number?: string;
};

type NominatimRawItem = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  class: string;
  type: string;
  address?: NominatimAddress;
  name?: string;
};

function buildShortLabel(item: NominatimRawItem): string {
  const address = item.address ?? {};
  const street =
    address.road ||
    address.pedestrian ||
    address.footway ||
    address.cycleway ||
    address.path ||
    address.residential ||
    "";

  const place =
    address.amenity ||
    address.shop ||
    address.building ||
    item.name ||
    "";

  const houseNumber = address.house_number || "";
  const settlement =
    address.city ||
    address.town ||
    address.village ||
    address.hamlet ||
    address.suburb ||
    address.neighbourhood ||
    "";

  const parts: string[] = [];

  if (place && place !== street) parts.push(place);
  if (street) {
    parts.push(houseNumber ? `${street}, ${houseNumber}` : street);
  } else if (!place) {
    const fallback = item.display_name.split(",").slice(0, 2).join(",").trim();
    if (fallback) parts.push(fallback);
  }
  if (settlement) parts.push(settlement);

  const label = parts.join(", ");
  return label || item.display_name;
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

  const params = new URLSearchParams({
    q: city ? `${trimmed}, ${city}` : trimmed,
    format: "json",
    addressdetails: "1",
    limit: "10",
    countrycodes: "kg",
    "accept-language": "ky,ru",
    dedupe: "1",
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    signal,
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) return [];

  const data = (await response.json()) as NominatimRawItem[];
  return data.map((item) => ({
    placeId: item.place_id,
    displayName: item.display_name,
    shortLabel: buildShortLabel(item),
    category: item.class,
    type: item.type,
    lat: item.lat,
    lon: item.lon,
  }));
}
