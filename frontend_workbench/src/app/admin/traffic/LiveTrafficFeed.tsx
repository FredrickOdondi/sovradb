"use client";

import { useEffect, useState } from "react";
import { Activity, ArrowRightLeft, Globe2, Shield, Network } from "lucide-react";
import { fetchTrafficLogs, fetchTrafficSummary } from "@/app/actions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function LiveTrafficFeed() {
  const [logs, setLogs] = useState<any[]>([]);
  const [summary, setSummary] = useState({ total_requests: 0, failed_requests: 0 });

  useEffect(() => {
    const poll = async () => {
      const [logsRes, summaryRes] = await Promise.all([
        fetchTrafficLogs(),
        fetchTrafficSummary()
      ]);
      if (logsRes.success) setLogs(logsRes.data);
      if (summaryRes.success) setSummary(summaryRes.data);
    };

    poll();
    const interval = setInterval(poll, 2000); // 2 second live polling
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-border/50">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-orange-500 flex items-center gap-2">
            <Activity className="h-6 w-6" />
            Tenant Traffic
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            L7 Sovereign Gateway routing and MaxMind ASN telemetry.
          </p>
        </div>
        <div className="flex gap-4">
          <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20 px-3 py-1">
            <span className="relative flex h-2 w-2 mr-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
            </span>
            LIVE
          </Badge>
          <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20">
            {summary.total_requests.toLocaleString()} Logged Req
          </Badge>
        </div>
      </div>

      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[180px]">Timestamp</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Target Namespace</TableHead>
              <TableHead>L7 Gateway Routing</TableHead>
              <TableHead>MaxMind ASN Telemetry</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length > 0 ? (
              logs.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {new Date(log.occurred_at).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      log.event_type === "READ" ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                      log.event_type === "WRITE" ? "bg-purple-500/10 text-purple-500 border-purple-500/20" :
                      "bg-amber-500/10 text-amber-500 border-amber-500/20"
                    }>
                      {log.event_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Shield className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium text-sm">{log.company_name || "public"}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm font-mono">
                      <Network className="h-3 w-3 text-muted-foreground" />
                      {log.metadata?.gateway_node || "L7-Edge-Unknown"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{log.metadata?.asn || "Unknown ASN"}</span>
                      <span className="font-mono">IP: {log.metadata?.ip || "0.0.0.0"} ({log.metadata?.latency_ms || 0}ms lag)</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  <ArrowRightLeft className="h-8 w-8 opacity-20 mx-auto mb-2" />
                  No traffic logged yet. Generate traffic via Table Explorer to see it here!
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
