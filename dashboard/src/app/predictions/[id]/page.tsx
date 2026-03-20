import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getPrediction, formatUSDC, timeUntil } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function PredictionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const prediction = await getPrediction(parseInt(id, 10));

  if (!prediction) notFound();

  const isUp = prediction.direction === "up";
  const isActive = prediction.status === "active";
  const remaining = timeUntil(prediction.expiry);
  const insuranceCoverage =
    prediction.stake > 0
      ? Math.round((prediction.insurancePool / prediction.stake) * 100)
      : 0;

  const statusConfig: Record<
    string,
    { bg: string; text: string; label: string }
  > = {
    active: {
      bg: "bg-blue-500/10 border-blue-500/20",
      text: "text-blue-400",
      label: "Active",
    },
    correct: {
      bg: "bg-emerald-500/10 border-emerald-500/20",
      text: "text-emerald-400",
      label: "Correct",
    },
    wrong: {
      bg: "bg-red-500/10 border-red-500/20",
      text: "text-red-400",
      label: "Wrong",
    },
    expired: {
      bg: "bg-zinc-500/10 border-zinc-500/20",
      text: "text-zinc-400",
      label: "Expired",
    },
  };

  const status = statusConfig[prediction.status];

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
        <Link href="/" className="hover:text-white transition-colors">
          Dashboard
        </Link>
        <span>/</span>
        <span className="text-white font-mono">Prediction #{prediction.id}</span>
      </div>

      {/* Main Card */}
      <Card className="border-0 bg-[#111118] ring-white/5 mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <CardTitle className="font-mono text-2xl text-white">
                {prediction.asset}
              </CardTitle>
              <span
                className={`text-3xl font-bold ${
                  isUp ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {isUp ? "\u2191" : "\u2193"}
              </span>
            </div>
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${status.bg} ${status.text}`}
            >
              {status.label}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                Agent
              </p>
              <Link
                href={`/agents/${encodeURIComponent(prediction.agent)}`}
                className="font-mono text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                {prediction.agent}
              </Link>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                Stake
              </p>
              <p className="font-mono text-lg font-bold text-white">
                {formatUSDC(prediction.stake)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                Direction
              </p>
              <p
                className={`font-mono text-lg font-bold ${
                  isUp ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {isUp ? "Long" : "Short"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                {isActive ? "Expires In" : "Expired At"}
              </p>
              <p className="font-mono text-lg font-bold text-white">
                {isActive
                  ? remaining
                  : new Date(prediction.expiry).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Insurance & Premium */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card className="border-0 bg-[#111118] ring-white/5">
          <CardHeader>
            <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground font-normal">
              Insurance Pool
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="font-mono text-3xl font-bold text-white">
                  {formatUSDC(prediction.insurancePool)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  of {formatUSDC(prediction.stake)} stake covered
                </p>
              </div>

              <Separator className="bg-white/5" />

              {/* Coverage Bar */}
              <div>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-muted-foreground">Coverage</span>
                  <span className="font-mono text-white">
                    {insuranceCoverage}%
                  </span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{
                      width: `${Math.min(insuranceCoverage, 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 bg-[#111118] ring-white/5">
          <CardHeader>
            <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground font-normal">
              Premium & Resolution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    Premium Rate
                  </p>
                  <p className="font-mono text-2xl font-bold text-white">
                    {prediction.premiumRate}%
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    Premium Cost
                  </p>
                  <p className="font-mono text-2xl font-bold text-white">
                    {formatUSDC(
                      Math.round(
                        prediction.insurancePool *
                          (prediction.premiumRate / 100)
                      )
                    )}
                  </p>
                </div>
              </div>

              <Separator className="bg-white/5" />

              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  Resolution
                </p>
                {prediction.resolvedAt ? (
                  <div className="space-y-1">
                    <p className="font-mono text-sm text-white">
                      Resolved:{" "}
                      {new Date(prediction.resolvedAt).toLocaleString(
                        "en-US",
                        {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }
                      )}
                    </p>
                    {prediction.result && (
                      <p className="font-mono text-sm text-muted-foreground">
                        Final Price: ${prediction.result.toLocaleString()}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="font-mono text-sm text-muted-foreground">
                    Awaiting resolution...
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card className="border-0 bg-[#111118] ring-white/5">
        <CardHeader>
          <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground font-normal">
            Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <div>
                <p className="text-xs text-white">Prediction Created</p>
                <p className="text-[10px] font-mono text-muted-foreground">
                  {new Date(prediction.createdAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
            {prediction.insurancePool > 0 && (
              <div className="flex items-center gap-4">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <div>
                  <p className="text-xs text-white">
                    Insurance Purchased ({formatUSDC(prediction.insurancePool)})
                  </p>
                </div>
              </div>
            )}
            {prediction.resolvedAt && (
              <div className="flex items-center gap-4">
                <div
                  className={`w-2 h-2 rounded-full ${
                    prediction.status === "correct"
                      ? "bg-emerald-500"
                      : "bg-red-500"
                  }`}
                />
                <div>
                  <p className="text-xs text-white">
                    Prediction{" "}
                    {prediction.status === "correct"
                      ? "Correct"
                      : "Wrong"}
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground">
                    {new Date(prediction.resolvedAt).toLocaleString(
                      "en-US",
                      {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }
                    )}
                  </p>
                </div>
              </div>
            )}
            {isActive && (
              <div className="flex items-center gap-4">
                <div className="w-2 h-2 rounded-full bg-white/20 animate-pulse" />
                <div>
                  <p className="text-xs text-muted-foreground">
                    Expiry: {remaining}
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
