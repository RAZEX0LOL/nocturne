/** Логотип — те же пять полосок звука, что на экране входа в приложении. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      {[
        [4, 13, 6],
        [10, 8, 16],
        [16, 3, 26],
        [22, 8, 16],
        [28, 13, 6],
      ].map(([x, y, h]) => (
        <rect key={x} x={x! - 1.6} y={y} width="3.2" height={h} rx="1.6" fill="#a78bfa" />
      ))}
    </svg>
  )
}

