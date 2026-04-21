import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
};

/** Monogram «АК» for header / small brand slots */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <span
      className={cn(
        "font-display font-extrabold tracking-tight leading-none text-primary select-none",
        "text-[1.7rem] sm:text-[1.85rem] w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center",
        className,
      )}
      aria-hidden
    >
      АК
    </span>
  );
}
