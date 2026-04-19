import type { SVGProps } from "react";

const PETAL_ANGLES = [0, 72, 144, 216, 288];

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
      <g transform="translate(32 32)">
        {PETAL_ANGLES.map((angle) => (
          <ellipse
            key={angle}
            cx="0"
            cy="-15"
            rx="11"
            ry="14"
            fill="currentColor"
            transform={`rotate(${angle})`}
          />
        ))}
        <circle r="8" fill="#1a1a1a" />
        <g fill="#1a1a1a" stroke="#1a1a1a" strokeWidth="1.6" strokeLinecap="round">
          {PETAL_ANGLES.map((angle) => (
            <line
              key={angle}
              x1="0"
              y1="-7"
              x2="0"
              y2="-11"
              transform={`rotate(${angle + 36})`}
            />
          ))}
        </g>
        <circle r="1.6" fill="#3a1414" />
      </g>
    </svg>
  );
}
