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
        <ellipse cx="32" cy="14" rx="13" ry="14" fill="currentColor" opacity="0.95" />
        <ellipse cx="14" cy="32" rx="14" ry="13" fill="currentColor" opacity="0.85" />
        <ellipse cx="50" cy="32" rx="14" ry="13" fill="currentColor" opacity="0.85" />
        <ellipse cx="32" cy="50" rx="13" ry="14" fill="currentColor" opacity="0.9" />
        <ellipse cx="20" cy="20" rx="10" ry="11" fill="currentColor" opacity="0.7" transform="rotate(-25 20 20)" />
        <ellipse cx="44" cy="20" rx="10" ry="11" fill="currentColor" opacity="0.7" transform="rotate(25 44 20)" />
        <circle cx="32" cy="32" r="9" fill="#1a1a1a" />
        <circle cx="32" cy="32" r="7" fill="#2a1a14" />
        <g fill="#1a1a1a">
          <circle cx="32" cy="26" r="1.4" />
          <circle cx="37" cy="29" r="1.4" />
          <circle cx="37" cy="35" r="1.4" />
          <circle cx="32" cy="38" r="1.4" />
          <circle cx="27" cy="35" r="1.4" />
          <circle cx="27" cy="29" r="1.4" />
          <circle cx="32" cy="32" r="1.6" />
        </g>
      </g>
    </svg>
  );
}
