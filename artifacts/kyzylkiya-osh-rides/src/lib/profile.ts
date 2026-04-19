const STORAGE_KEY = "mak.profile.v2";
const LEGACY_KEY = "mak.profile.v1";

export type Profile = {
  driverName: string;
  driverPhone: string;
  driverAge: number | null;
  driverExperience: number | null;
  carMake: string;
  carYear: number | null;
  carPlate: string;
  carColor: string;
  carSeats: number | null;
  lastOrigin: string;
  lastDestination: string;
};

const EMPTY: Profile = {
  driverName: "",
  driverPhone: "",
  driverAge: null,
  driverExperience: null,
  carMake: "",
  carYear: null,
  carPlate: "",
  carColor: "",
  carSeats: null,
  lastOrigin: "",
  lastDestination: "",
};

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asIntOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}

export function readProfile(): Profile {
  if (typeof window === "undefined") return EMPTY;
  try {
    let raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Profile>;
    return {
      driverName: asString(parsed.driverName),
      driverPhone: asString(parsed.driverPhone),
      driverAge: asIntOrNull(parsed.driverAge),
      driverExperience: asIntOrNull(parsed.driverExperience),
      carMake: asString(parsed.carMake),
      carYear: asIntOrNull(parsed.carYear),
      carPlate: asString(parsed.carPlate),
      carColor: asString(parsed.carColor),
      carSeats: asIntOrNull(parsed.carSeats),
      lastOrigin: asString(parsed.lastOrigin),
      lastDestination: asString(parsed.lastDestination),
    };
  } catch {
    return EMPTY;
  }
}

export function isProfileComplete(p: Profile): boolean {
  return (
    p.driverName.length >= 2 &&
    p.driverPhone.length >= 5 &&
    p.driverAge !== null && p.driverAge >= 18 &&
    p.driverExperience !== null && p.driverExperience >= 0 &&
    p.carMake.length >= 2 &&
    p.carYear !== null && p.carYear >= 1980 &&
    p.carPlate.length >= 3 &&
    p.carColor.length >= 2 &&
    p.carSeats !== null && p.carSeats >= 1
  );
}

export function updateProfile(patch: Partial<Profile>): Profile {
  const next = { ...readProfile(), ...patch };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / privacy errors
  }
  return next;
}

export function clearProfile(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
