"use client";

interface TrustGaugeProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
}

function getScoreColor(score: number): string {
  if (score < 30) return "#ef4444";
  if (score < 60) return "#eab308";
  return "#22c55e";
}

export function TrustGauge({
  score,
  size = 160,
  strokeWidth = 12,
  showLabel = true,
}: TrustGaugeProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = getScoreColor(score);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-label={`Trust score: ${score}%`}
        role="meter"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-white/5"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          style={{
            transition: "stroke-dashoffset 1s ease-out",
            filter: `drop-shadow(0 0 6px ${color}40)`,
          }}
        />
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-white font-mono text-3xl font-bold"
          style={{ transform: "rotate(90deg)", transformOrigin: "center" }}
        >
          {score}
        </text>
      </svg>
      {showLabel && (
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          Trust Score
        </span>
      )}
    </div>
  );
}
