import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TrustGauge } from "@/components/trust-gauge";
import { getAgent, getAgentPredictions, formatUSDC } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const decodedAddress = decodeURIComponent(address);
  const agent = await getAgent(decodedAddress);

  if (!agent) notFound();

  const predictions = await getAgentPredictions(decodedAddress);
  const totalPredictions = agent.totalPredictions ?? 0;
  const correctPredictions = agent.correctPredictions ?? 0;
  const totalStaked = agent.totalStaked ?? 0;
  const insuranceBought = agent.insuranceBought ?? 0;
  const insuranceSold = agent.insuranceSold ?? 0;

  const accuracy =
    totalPredictions > 0
      ? Math.round((correctPredictions / totalPredictions) * 100)
      : 0;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
        <Link href="/" className="hover:text-white transition-colors">
          Dashboard
        </Link>
        <span>/</span>
        <span className="text-white font-mono">{agent.address}</span>
      </div>

      {/* Agent Header */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
        {/* Trust Gauge */}
        <Card className="border-0 bg-[#111118] ring-white/5 lg:col-span-1">
          <CardContent className="p-6 flex items-center justify-center">
            <TrustGauge score={agent.trustScore} size={180} />
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="lg:col-span-3 grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              label: "Total Predictions",
              value: totalPredictions.toString(),
            },
            {
              label: "Correct Predictions",
              value: correctPredictions.toString(),
            },
            { label: "Accuracy", value: `${accuracy}%` },
            {
              label: "Total Staked",
              value: formatUSDC(totalStaked),
            },
            {
              label: "Insurance Bought",
              value: formatUSDC(insuranceBought),
            },
            {
              label: "Insurance Sold",
              value: formatUSDC(insuranceSold),
            },
          ].map((stat) => (
            <Card
              key={stat.label}
              className="border-0 bg-[#111118] ring-white/5"
            >
              <CardContent className="p-4">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  {stat.label}
                </p>
                <p className="font-mono text-xl font-bold text-white">
                  {stat.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Prediction History */}
      <Card className="border-0 bg-[#111118] ring-white/5">
        <CardHeader>
          <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground font-normal">
            Prediction History
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Date
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Asset
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Direction
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">
                  Stake
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">
                  Insurance
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">
                  Result
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {predictions.map((p) => (
                <TableRow
                  key={p.id}
                  className="border-white/5 hover:bg-white/[0.02]"
                >
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {new Date(p.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-white">
                    {p.asset}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`font-bold ${
                        p.direction === "up"
                          ? "text-emerald-400"
                          : "text-red-400"
                      }`}
                    >
                      {p.direction === "up" ? "\u2191 Long" : "\u2193 Short"}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-sm text-right">
                    {formatUSDC(p.stake)}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-right">
                    {formatUSDC(p.insurancePool)}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-right">
                    {p.result ? `$${p.result.toLocaleString()}` : "--"}
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                        p.status === "correct"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : p.status === "wrong"
                          ? "bg-red-500/10 text-red-400 border-red-500/20"
                          : p.status === "active"
                          ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                          : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                      }`}
                    >
                      {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
