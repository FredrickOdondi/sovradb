import { fetchAllTenants, fetchRecentEvents, fetchPlatformMetrics } from "@/app/actions";
import { Activity, Server, Users, Database, Globe2, Shield, Zap } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import AdminManager from "./AdminManager";

export default async function AdminDashboard() {
  const [tenantsRes, eventsRes, metricsRes] = await Promise.all([
    fetchAllTenants(),
    fetchRecentEvents(),
    fetchPlatformMetrics(),
  ]);

  const tenants = tenantsRes.success ? tenantsRes.data : [];
  const events = eventsRes.success ? eventsRes.data : [];
  const m = metricsRes.success ? metricsRes.data : null;

  // Split tenants by region for the two tablespace sections
  const usTenants = tenants.filter((t: any) => t.region_code === "US" || t.region_pin?.includes("US") || t.region_pin === "Multi-Region");
  const euTenants = tenants.filter((t: any) => t.region_code === "EU" || t.region_pin?.includes("EU"));
  const afTenants = tenants.filter((t: any) => t.region_code === "AF" || t.region_pin?.includes("AF"));

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500 font-sans">
      <div className="flex items-center justify-between pb-4 border-b border-border/50">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-orange-500 flex items-center gap-2">
            <Server className="h-6 w-6" />
            SovraDB Platform Admin
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage DBaaS Tenants, Global Clusters, and Sovereign Infrastructure.
          </p>
        </div>
        <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20">
          Platform Status: All Systems Operational
        </Badge>
      </div>

      {/* Live Platform Metrics */}
      <div className="grid gap-6 md:grid-cols-4">
        <MetricBox
          title="Total Tenants (Projects)"
          value={m ? String(m.tenant_count) : tenants.length.toString()}
          subtitle="Sovereign workspaces"
          icon={Users}
        />
        <MetricBox
          title="Total User Records"
          value={m ? Number(m.total_user_rows).toLocaleString() : "—"}
          subtitle={`US: ${m?.us_user_rows ?? 0} · EU: ${m?.eu_user_rows ?? 0} · AF: ${m?.af_user_rows ?? 0}`}
          icon={Database}
        />
        <MetricBox
          title="Database Size"
          value={m ? m.db_size_pretty : "—"}
          subtitle="pg_database_size()"
          icon={Activity}
        />
        <MetricBox
          title="Active Connections"
          value={m ? String(m.active_connections) : "—"}
          subtitle="pg_stat_activity"
          icon={Globe2}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-12">
        {/* Tenant Table */}
        <div className="col-span-12 lg:col-span-8 rounded-md border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Database className="h-5 w-5 text-muted-foreground" />
              Active Tenant Databases
            </h2>
          </div>
          <div className="space-y-6">

            {/* US Tablespace */}
            {usTenants.length > 0 && (
              <div className="border border-border/50 rounded-md overflow-hidden">
                <div className="bg-secondary/40 px-4 py-2 border-b border-border/50 text-xs font-mono text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                  <span>Physical Tablespace: us_data_space</span>
                  <span>Location: N. Virginia</span>
                </div>
                <Table>
                  <TableHeader className="bg-secondary/20">
                    <TableRow>
                      <TableHead>Tenant Project</TableHead>
                      <TableHead>Region Pinning</TableHead>
                      <TableHead>Users</TableHead>
                      <TableHead>FPE Status</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usTenants.map((t: any) => (
                      <TableRow key={t.tenant_id}>
                        <TableCell className="font-medium">{t.company_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{t.region_pin}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{Number(t.user_count).toLocaleString()}</TableCell>
                        <TableCell>
                          {t.fpe_enabled ? (
                            <span className="text-orange-500 flex items-center gap-1">
                              <Shield className="h-3 w-3" /> Enabled
                            </span>
                          ) : (
                            <span className="text-muted-foreground flex items-center gap-1">Disabled</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge className="bg-orange-500/20 text-orange-500">Healthy</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* EU Tablespace */}
            {euTenants.length > 0 && (
              <div className="border border-border/50 rounded-md overflow-hidden">
                <div className="bg-secondary/40 px-4 py-2 border-b border-border/50 text-xs font-mono text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                  <span>Physical Tablespace: eu_data_space</span>
                  <span>Location: Frankfurt</span>
                </div>
                <Table>
                  <TableHeader className="bg-secondary/20">
                    <TableRow>
                      <TableHead>Tenant Project</TableHead>
                      <TableHead>Region Pinning</TableHead>
                      <TableHead>Users</TableHead>
                      <TableHead>FPE Status</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {euTenants.map((t: any) => (
                      <TableRow key={t.tenant_id}>
                        <TableCell className="font-medium">{t.company_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{t.region_pin}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{Number(t.user_count).toLocaleString()}</TableCell>
                        <TableCell>
                          {t.fpe_enabled ? (
                            <span className="text-orange-500 flex items-center gap-1">
                              <Shield className="h-3 w-3" /> Enabled
                            </span>
                          ) : (
                            <span className="text-muted-foreground flex items-center gap-1">Disabled</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge className="bg-orange-500/20 text-orange-500">Healthy</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* AF Tablespace */}
            {afTenants.length > 0 && (
              <div className="border border-border/50 rounded-md overflow-hidden">
                <div className="bg-secondary/40 px-4 py-2 border-b border-border/50 text-xs font-mono text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                  <span>Physical Tablespace: af_data_space</span>
                  <span>Location: Cape Town</span>
                </div>
                <Table>
                  <TableHeader className="bg-secondary/20">
                    <TableRow>
                      <TableHead>Tenant Project</TableHead>
                      <TableHead>Region Pinning</TableHead>
                      <TableHead>Users</TableHead>
                      <TableHead>FPE Status</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {afTenants.map((t: any) => (
                      <TableRow key={t.tenant_id}>
                        <TableCell className="font-medium">{t.company_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{t.region_pin}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{Number(t.user_count).toLocaleString()}</TableCell>
                        <TableCell>
                          {t.fpe_enabled ? (
                            <span className="text-orange-500 flex items-center gap-1">
                              <Shield className="h-3 w-3" /> Enabled
                            </span>
                          ) : (
                            <span className="text-muted-foreground flex items-center gap-1">Disabled</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge className="bg-orange-500/20 text-orange-500">Healthy</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {tenants.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-8">
                No tenants found. Ensure the database is running and seeded.
              </div>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          {/* Infrastructure Events */}
          <div className="rounded-md border border-border bg-card p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Zap className="h-5 w-5 text-muted-foreground" />
              Recent Infrastructure Events
            </h2>
            <div className="space-y-4">
              {events.length > 0 ? (
                events.map((ev: any, i: number) => (
                  <EventLine
                    key={i}
                    time={formatRelativeTime(ev.occurred_at)}
                    title={ev.title}
                    desc={ev.description}
                  />
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No events recorded yet.</p>
              )}
            </div>
          </div>

          {/* Node Distribution */}
          <div className="rounded-md border border-border bg-card p-6">
            <h2 className="text-lg font-semibold mb-4">Physical Node Distribution</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">US-East (N. Virginia)</span>
                <span className="font-medium font-mono">{m?.us_user_rows ?? 0} rows <span className="text-muted-foreground ml-1">({m?.us_node_size ?? "0 kB"})</span></span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2">
                <div
                  className="bg-orange-500 h-2 rounded-full transition-all duration-700"
                  style={{
                    width: m && m.total_user_rows > 0
                      ? `${Math.round((m.us_user_rows / m.total_user_rows) * 100)}%`
                      : "0%",
                  }}
                />
              </div>
              <div className="flex justify-between items-center text-sm pt-2">
                <span className="text-muted-foreground">EU-Central (Frankfurt)</span>
                <span className="font-medium font-mono">{m?.eu_user_rows ?? 0} rows <span className="text-muted-foreground ml-1">({m?.eu_node_size ?? "0 kB"})</span></span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2">
                <div
                  className="bg-orange-500 h-2 rounded-full transition-all duration-700"
                  style={{
                    width: m && m.total_user_rows > 0
                      ? `${Math.round((m.eu_user_rows / m.total_user_rows) * 100)}%`
                      : "0%",
                  }}
                />
              </div>
              <div className="flex justify-between items-center text-sm pt-2">
                <span className="text-muted-foreground">AF-South (Cape Town)</span>
                <span className="font-medium font-mono">{m?.af_user_rows ?? 0} rows <span className="text-muted-foreground ml-1">({m?.af_node_size ?? "0 kB"})</span></span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2">
                <div
                  className="bg-orange-500 h-2 rounded-full transition-all duration-700"
                  style={{
                    width: m && m.total_user_rows > 0
                      ? `${Math.round((m.af_user_rows / m.total_user_rows) * 100)}%`
                      : "0%",
                  }}
                />
              </div>
            </div>
          </div>
          
          {/* Platform Admins Management */}
          <AdminManager />
        </div>
      </div>
    </div>
  );
}

function formatRelativeTime(ts: string) {
  if (!ts) return "—";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function MetricBox({ title, value, subtitle, icon: Icon }: any) {
  return (
    <div className="border border-border bg-card p-5 rounded-md flex flex-col space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        {Icon && <Icon className="h-4 w-4 text-orange-500" />}
      </div>
      <span className="text-3xl font-bold text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground">{subtitle}</span>
    </div>
  );
}

function EventLine({ time, title, desc }: any) {
  return (
    <div className="flex flex-col border-l-2 border-orange-500/30 pl-3 py-1">
      <div className="flex items-center space-x-2">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{time}</span>
      </div>
      <span className="text-xs text-muted-foreground mt-0.5">{desc}</span>
    </div>
  );
}
