export default function HanilLogo({ className = "h-7 w-auto" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 70" className={className} role="img" aria-label="HANIL 로고">
      <defs>
        <clipPath id="hanil-pill">
          <rect x="0" y="5" width="200" height="60" rx="30" />
        </clipPath>
      </defs>
      <g clipPath="url(#hanil-pill)">
        <rect x="0" y="5" width="100" height="60" fill="#e2001a" />
        <rect x="100" y="5" width="100" height="60" fill="#0033a0" />
      </g>
      <ellipse cx="100" cy="35" rx="58" ry="21" fill="#0a0a23" />
      <text
        x="100"
        y="44"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="bold"
        fontSize="27"
        fill="#ffffff"
        letterSpacing="1"
      >
        HANIL
      </text>
    </svg>
  );
}
