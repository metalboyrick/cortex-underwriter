import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Prediction } from "@/lib/types";
import { formatUSDC, timeUntil } from "@/lib/api";

const statusColors: Record<string, string> = {
  active:
    "bg-blue-500/10 text-blue-400 border-blue-500/20",
  correct:
    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  wrong:
    "bg-red-500/10 text-red-400 border-red-500/20",
  expired:
    "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

export function PredictionCard({ prediction }: { prediction: Prediction }) {
  const isUp = prediction.direction === "up";
  const remaining = timeUntil(prediction.expiry);

  return (
    <Link href={`/predictions/${prediction.id}`}>
      <Card className="border-0 bg-[#111118] ring-white/5 hover:ring-blue-500/30 transition-all cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                {prediction.agent}
              </span>
            </div>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                statusColors[prediction.status]
              }`}
            >
              {prediction.status.charAt(0).toUpperCase() +
                prediction.status.slice(1)}
            </span>
          </div>

          <div className="flex items-center gap-3 mb-3">
            <span className="font-mono text-sm font-semibold text-white">
              {prediction.asset}
            </span>
            <span
              className={`text-lg font-bold ${
                isUp ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {isUp ? "\u2191" : "\u2193"}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <div className="text-muted-foreground mb-0.5">Stake</div>
              <div className="font-mono text-white">
                {formatUSDC(prediction.stake)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground mb-0.5">Insurance</div>
              <div className="font-mono text-white">
                {formatUSDC(prediction.insurancePool)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground mb-0.5">
                {prediction.status === "active" ? "Expires" : "Result"}
              </div>
              <div className="font-mono text-white">
                {prediction.status === "active"
                  ? remaining
                  : prediction.result
                  ? `$${prediction.result.toLocaleString()}`
                  : "--"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
