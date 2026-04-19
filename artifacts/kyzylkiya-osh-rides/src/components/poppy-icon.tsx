import type { SVGProps } from "react";

export function PoppyIcon({
  className,
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <g>
        <path
          d="M32 6 C 22 6, 16 14, 18 24 C 10 22, 4 30, 8 38 C 12 46, 22 46, 26 40 C 24 50, 32 58, 40 52 C 46 48, 46 40, 42 36 C 52 38, 58 30, 54 22 C 50 14, 40 14, 38 20 C 40 12, 38 6, 32 6 Z"
          fill="currentColor"
        />
        <path
          d="M32 10 C 26 10, 22 16, 24 22 C 26 20, 30 19, 32 22 C 32 16, 36 14, 32 10 Z M22 24 C 16 24, 12 30, 14 36 C 18 32, 24 32, 26 36 C 28 30, 28 26, 22 24 Z M42 24 C 48 24, 52 30, 50 36 C 46 32, 40 32, 38 36 C 36 30, 36 26, 42 24 Z M26 38 C 24 44, 28 50, 34 50 C 38 50, 40 46, 38 42 C 34 44, 30 42, 26 38 Z"
          fill="currentColor"
          opacity="0.55"
        />
        <circle cx="32" cy="32" r="6.5" fill="#1a1a1a" />
        <g fill="#1a1a1a">
          <ellipse cx="32" cy="26.5" rx="1.4" ry="2.2" />
          <ellipse cx="37" cy="30" rx="2.2" ry="1.4" transform="rotate(35 37 30)" />
          <ellipse cx="36" cy="35.5" rx="2.2" ry="1.4" transform="rotate(-35 36 35.5)" />
          <ellipse cx="28" cy="35.5" rx="2.2" ry="1.4" transform="rotate(35 28 35.5)" />
          <ellipse cx="27" cy="30" rx="2.2" ry="1.4" transform="rotate(-35 27 30)" />
        </g>
      </g>
    </svg>
  );
}
