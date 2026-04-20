import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchNominatim, type NominatimSuggestion } from "@/lib/nominatim";
import { useTranslation } from "@/lib/i18n";

type Props = {
  value: string;
  onChange: (value: string) => void;
  city: string;
  placeholder?: string;
  id?: string;
};

export function AddressAutocomplete({ value, onChange, city, placeholder, id }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<NominatimSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipNextSearchRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchGenerationRef = useRef(0);

  useEffect(() => {
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }

    const trimmed = value.trim();
    if (trimmed.length < 1) {
      setSuggestions([]);
      setError(null);
      setLoading(false);
      return;
    }

    const generation = ++searchGenerationRef.current;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const debounceMs = 380;
    const timer = setTimeout(async () => {
      try {
        const results = await searchNominatim({
          query: trimmed,
          city,
          signal: controller.signal,
        });
        if (generation !== searchGenerationRef.current) return;
        setSuggestions(results);
        setOpen(true);
      } catch (err) {
        if (generation !== searchGenerationRef.current) return;
        if ((err as Error).name === "AbortError") return;
        setError(t("address.error"));
        setOpen(true);
      } finally {
        if (generation === searchGenerationRef.current) {
          setLoading(false);
        }
      }
    }, debounceMs);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [value, city]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSelect = (suggestion: NominatimSuggestion) => {
    skipNextSearchRef.current = true;
    onChange(suggestion.shortLabel);
    setSuggestions([]);
    setOpen(false);
  };

  const showDropdown =
    open && (loading || !!error || suggestions.length > 0 || value.trim().length >= 1);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
        <Input
          id={id}
          autoComplete="off"
          placeholder={placeholder}
          className="pl-10 pr-10 h-12 text-base"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (value.trim().length >= 1) setOpen(true);
          }}
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
        ) : (
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-[300px] overflow-y-auto">
          {loading && suggestions.length === 0 && (
            <div className="px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("address.searching")}
            </div>
          )}

          {!loading && error && (
            <div className="px-4 py-3 text-sm text-destructive">{error}</div>
          )}

          {!loading && !error && suggestions.length === 0 && value.trim().length >= 1 && (
            <div className="px-4 py-3 space-y-2">
              <p className="text-sm text-muted-foreground">{t("address.empty")}</p>
              <button
                type="button"
                className="w-full text-left px-3 py-2 rounded-md bg-accent hover:bg-accent/80 transition-colors flex items-center gap-2"
                onMouseDown={(event) => {
                  event.preventDefault();
                  setOpen(false);
                }}
              >
                <MapPin className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm font-medium truncate">
                  {t("address.use-as-is")}: «{value.trim()}»
                </span>
              </button>
            </div>
          )}

          {suggestions.map((suggestion) => (
            <button
              key={suggestion.placeId}
              type="button"
              className="w-full text-left px-4 py-2.5 hover:bg-accent transition-colors flex items-start gap-2.5 border-b border-border/40 last:border-0"
              onMouseDown={(event) => {
                event.preventDefault();
                handleSelect(suggestion);
              }}
            >
              <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm leading-tight">{suggestion.shortLabel}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {suggestion.displayName}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
