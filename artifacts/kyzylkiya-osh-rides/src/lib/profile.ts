const STORAGE_KEY = "mak.profile.v1";

export type Profile = {
  driverName: string;
  driverPhone: string;
  lastOrigin: string;
  lastDestination: string;
};

const EMPTY: Profile = {
  driverName: "",
  driverPhone: "",
  lastOrigin: "",
  lastDestination: "",
};

export function readProfile(): Profile {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Profile>;
    return {
      driverName: typeof parsed.driverName === "string" ? parsed.driverName : "",
      driverPhone: typeof parsed.driverPhone === "string" ? parsed.driverPhone : "",
      lastOrigin: typeof parsed.lastOrigin === "string" ? parsed.lastOrigin : "",
      lastDestination: typeof parsed.lastDestination === "string" ? parsed.lastDestination : "",
    };
  } catch {
    return EMPTY;
  }
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
