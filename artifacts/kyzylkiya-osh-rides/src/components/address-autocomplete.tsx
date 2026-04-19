import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { searchNominatim, type NominatimSuggestion } from "@/lib/nominatim";

type Props = {
  value: string;
  onChange: (value: string) => void;
  city: string;
  placeholder?: string;
  id?: string;
};

export function AddressAutocomplete({ value, onChange, city, placeholder, id }: Props) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<NominatimSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFocus, setHasFocus] = useState(false);
  const skipNextSearchRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }

    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const results = await searchNominatim({
          query: trimmed,
          city,
          signal: controller.signal,
        });
        setSuggestions(results);
        if (hasFocus) setOpen(true);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError("Издөө учурунда ката кетти");
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [value, city, hasFocus]);

  const handleSelect = (suggestion: NominatimSuggestion) => {
    skipNextSearchRef.current = true;
    onChange(suggestion.shortLabel);
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <Popover open={open && (suggestions.length > 0 || loading || !!error)} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
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
                if (!open) setOpen(true);
              }}
              onFocus={() => {
                setHasFocus(true);
                if (suggestions.length > 0) setOpen(true);
              }}
              onBlur={() => {
                setHasFocus(false);
                window.setTimeout(() => setOpen(false), 120);
              }}
            />
            {loading ? (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
            ) : (
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
            )}
          </div>
        </PopoverAnchor>

        <PopoverContent
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="w-[var(--radix-popover-trigger-width)] p-0 max-h-[300px] overflow-y-auto"
        >
          {loading && suggestions.length === 0 && (
            <div className="px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Изделүүдө...
            </div>
          )}

          {!loading && error && (
            <div className="px-4 py-3 text-sm text-destructive">{error}</div>
          )}

          {!loading && !error && suggestions.length === 0 && value.trim().length >= 2 && (
            <div className="px-4 py-3 text-sm text-muted-foreground">Эч нерсе табылган жок</div>
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
                <p className="font-medium text-sm leading-tight truncate">{suggestion.shortLabel}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{suggestion.displayName}</p>
              </div>
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
