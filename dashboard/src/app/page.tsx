import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PredictionCard } from "@/components/prediction-card";
import { AgentRow } from "@/components/agent-row";
import { LiveFeed } from "@/components/live-feed";
import { DemoBanner } from "@/components/demo-banner";
import { getAgents, getPredictions, formatUSDC } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [agents, predictions] = await Promise.all([
    getAgents(),
    getPredictions(),
  ]);

  const activePredictions = predictions.filter((p) => p.status === "active");
  const totalStaked = predictions.reduce((sum, p) => sum + (p.stake ?? 0), 0);
  const avgTrustScore =
    agents.length > 0
      ? Math.round(
          agents.reduce((sum, a) => sum + (a.trustScore ?? 0), 0) / agents.length
        )
      : 0;
  const insuranceVolume = predictions.reduce(
    (sum, p) => sum + (p.insurancePool ?? 0),
    0
  );

  const sortedAgents = [...agents].sort(
    (a, b) => b.trustScore - a.trustScore
  );

  const stats = [
    {
      label: "Active Predictions",
      value: activePredictions.length.toString(),
      sub: `${predictions.length} total`,
    },
    {
      label: "Total USDC Staked",
      value: formatUSDC(totalStaked),
      sub: "across all predictions",
    },
    {
      label: "Avg Trust Score",
      value: `${avgTrustScore}%`,
      sub: `${agents.length} agents tracked`,
    },
    {
      label: "Insurance Volume",
      value: formatUSDC(insuranceVolume),
      sub: "total premiums collected",
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <DemoBanner />
      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <Card
            key={stat.label}
            className="border-0 bg-[#111118] ring-white/5"
          >
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                {stat.label}
              </p>
              <p className="font-mono text-2xl font-bold text-white">
                {stat.value}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {stat.sub}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Live Predictions Feed */}
        <div className="lg:col-span-3 space-y-6">
          <div>
            <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-4">
              Live Predictions
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {activePredictions.map((prediction) => (
                <PredictionCard
                  key={prediction.id}
                  prediction={prediction}
                />
              ))}
            </div>
          </div>

          {/* Recent Resolved */}
          <div>
            <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-4">
              Recently Resolved
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {predictions
                .filter(
                  (p) => p.status === "correct" || p.status === "wrong"
                )
                .slice(0, 4)
                .map((prediction) => (
                  <PredictionCard
                    key={prediction.id}
                    prediction={prediction}
                  />
                ))}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Agent Leaderboard */}
          <Card className="border-0 bg-[#111118] ring-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground font-normal">
                Agent Leaderboard
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/5 hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground w-12">
                      #
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Agent
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Trust
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">
                      Preds
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">
                      Acc
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">
                      Staked
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedAgents.map((agent, i) => (
                    <AgentRow
                      key={agent.address}
                      agent={agent}
                      rank={i + 1}
                    />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Live Feed */}
          <Card className="border-0 bg-[#111118] ring-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground font-normal flex items-center gap-2">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
                Event Feed
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              <LiveFeed />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
