import { fetchDatabaseMetrics, fetchTemporalCommits, getActiveNamespace } from "@/app/actions";
import { Database, HardDrive, Activity, Clock, Zap, Network, ArrowDownToLine, ArrowUpFromLine, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default async function StudioDashboard() {
  // Fetch real metrics from the database
  const [metricsRes, commitsRes, activeNamespace] = await Promise.all([
    fetchDatabaseMetrics(),
    fetchTemporalCommits(),
    getActiveNamespace()
  ]);

  const m = metricsRes.success ? metricsRes.data : null;
  const recentCommits = commitsRes.success ? commitsRes.data.slice(0, 4) : [];

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500 font-sans">
      <div className="flex items-center justify-between pb-4 border-b border-border/50">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary flex items-center gap-2">
            <Database className="h-6 w-6" />
            Project Overview
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Tenant Namespace:{" "}
            <span className="font-mono text-xs bg-secondary/50 px-1 py-0.5 rounded">
              {activeNamespace}
            </span>
          </p>
        </div>
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
          Environment: Production
        </Badge>
      </div>

      {/* Live Infrastructure Metrics */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <MetricBox
          title="Total User Records"
          value={m ? Number(m.total_user_rows).toLocaleString() : "—"}
          subtitle={`US: ${m?.us_user_rows ?? 0} · EU: ${m?.eu_user_rows ?? 0}`}
          icon={Zap}
          trend="up"
        />
        <MetricBox
          title="Table Count"
          value={m ? String(m.table_count) : "—"}
          subtitle="Active namespace tables"
          icon={ArrowDownToLine}
          trend="neutral"
        />
        <MetricBox
          title="Active Connections"
          value={m ? String(m.active_connections) : "—"}
          subtitle="pg_stat_activity (active)"
          icon={ArrowUpFromLine}
          trend="up"
        />
        <MetricBox
          title="Total Write Ops"
          value={m ? Number(m.total_writes_ever).toLocaleString() : "—"}
          subtitle="INSERT + UPDATE + DELETE ever"
          icon={Clock}
          trend="neutral"
        />
        <MetricBox
          title="Database Size"
          value={m ? m.db_size_pretty : "—"}
          subtitle="pg_database_size()"
          icon={HardDrive}
          trend="up"
        />
        <MetricBox
          title="Tenant Projects"
          value={m ? String(m.tenant_count) : "—"}
          subtitle="Active sovereign workspaces"
          icon={Network}
          trend="up"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-12">
        {/* Temporal History — Recent Commits */}
        <div className="col-span-12 lg:col-span-8 rounded-md border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Activity className="h-5 w-5 text-muted-foreground" />
              Recent Temporal Mutations
            </h2>
            <span className="text-xs text-muted-foreground font-mono">sovereign_users_history</span>
          </div>
          {recentCommits.length > 0 ? (
            <div className="space-y-3">
              {recentCommits.map((commit: any, i: number) => (
                <div key={i} className="flex items-start gap-4 p-3 rounded-md bg-secondary/10 border border-border/40">
                  <div className="h-2 w-2 rounded-full bg-primary mt-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono text-foreground truncate">
                      {commit.affected_record_id}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Region: <span className="font-medium">{commit.region_code}</span>
                      {" · "}
                      {commit.mutation_timestamp
                        ? new Date(commit.mutation_timestamp).toLocaleString()
                        : "—"}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">{commit.region_code}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              No temporal mutations recorded yet. Insert or update a row to see history here.
            </div>
          )}
        </div>

        {/* Platform Capabilities */}
        <div className="col-span-12 lg:col-span-4 rounded-md border border-border bg-card p-6 space-y-6">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            Platform Capabilities
          </h2>
          <div className="space-y-4 pt-2">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium">Data Residency Pinning</div>
                <div className="text-sm text-muted-foreground">App is locked to US-East infrastructure.</div>
              </div>
              <Badge>Active</Badge>
            </div>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium">Edge Sync (PowerSync)</div>
                <div className="text-sm text-muted-foreground">Logical replication to local SQLite devices.</div>
              </div>
              <Badge>Active</Badge>
            </div>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium">Format-Preserving Encryption</div>
                <div className="text-sm text-muted-foreground">NIST FF1 tokenization for PII columns.</div>
              </div>
              <Badge variant="outline" className="text-muted-foreground border-border">
                Disabled
              </Badge>
            </div>
            {m && (
              <div className="pt-3 border-t border-border/50 text-xs text-muted-foreground font-mono space-y-1">
                <div>DB: {m.db_size_pretty}</div>
                <div>Rows: {Number(m.total_user_rows).toLocaleString()}</div>
                <div>Tables: {m.table_count}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricBox({ title, value, subtitle, icon: Icon, trend }: any) {
  return (
    <div className="border border-border bg-card p-5 rounded-md flex flex-col space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        {Icon && (
          <Icon
            className={`h-4 w-4 ${trend === "up" ? "text-primary" : "text-muted-foreground"}`}
          />
        )}
      </div>
      <span className="text-3xl font-bold text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground">{subtitle}</span>
    </div>
  );
}
