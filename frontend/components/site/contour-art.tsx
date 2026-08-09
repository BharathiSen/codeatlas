/**
 * The hero's decorative artwork: concentric topographic contours around a
 * single glowing point — the "map" metaphor, rendered as inline SVG so it costs
 * no request and inherits the accent token.
 */
export function ContourArt({ className }: { className?: string }) {
  // Rings widen as they move outward and fade as they go.
  const rings = Array.from({ length: 11 }, (_, i) => ({
    rx: 42 + i * 40,
    ry: 26 + i * 25,
    opacity: 0.42 - i * 0.032,
  }))

  return (
    <svg
      viewBox="0 0 620 520"
      className={className}
      aria-hidden="true"
      focusable="false"
      role="presentation"
    >
      <defs>
        <radialGradient id="ca-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#c4b5fd" stopOpacity="1" />
          <stop offset="45%" stopColor="#8b5cf6" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ca-beam" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0" />
          <stop offset="100%" stopColor="#c4b5fd" stopOpacity="0.55" />
        </linearGradient>
      </defs>

      <g transform="translate(310 268)">
        {rings.map((ring) => (
          <ellipse
            key={ring.rx}
            rx={ring.rx}
            ry={ring.ry}
            fill="none"
            stroke="#8b5cf6"
            strokeWidth="1"
            strokeOpacity={Math.max(ring.opacity, 0.05)}
          />
        ))}

        {/* Off-centre contours suggest terrain rather than a perfect target. */}
        <ellipse rx="196" ry="128" cx="-38" cy="16" fill="none" stroke="#8b5cf6" strokeWidth="1" strokeOpacity="0.16" />
        <ellipse rx="268" ry="176" cx="-56" cy="26" fill="none" stroke="#8b5cf6" strokeWidth="1" strokeOpacity="0.11" />
        <ellipse rx="342" ry="222" cx="-72" cy="34" fill="none" stroke="#8b5cf6" strokeWidth="1" strokeOpacity="0.07" />

        {/* Vertical beam and the survey point itself. */}
        <rect x="-1.5" y="-268" width="3" height="268" fill="url(#ca-beam)" />
        <circle r="86" fill="url(#ca-core)" />
        <circle r="4.5" fill="#ffffff" />
      </g>
    </svg>
  )
}
