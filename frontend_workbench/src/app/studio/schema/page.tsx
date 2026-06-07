import { Database, Table as TableIcon, MapPin, ArrowDown, Network, Lock, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fetchSchemaNodes, fetchTableColumns, fetchProjectPolicy } from "@/app/actions";

export default async function SchemaPage() {
  const [nodesRes, policyRes] = await Promise.all([
    fetchSchemaNodes(),
    fetchProjectPolicy()
  ]);

  const nodes = nodesRes.success ? nodesRes.data : [];
  const policy = policyRes.success ? policyRes.data : null;

  // Fetch columns for each table
  const schemaMap: any = {};
  if (nodesRes.success) {
    await Promise.all(
      nodes.map(async (n: any) => {
        const colsRes = await fetchTableColumns(n.table_name);
        schemaMap[n.table_name] = colsRes.success ? colsRes.data : [];
      })
    );
  }

  const regionPin = policy?.region_pin ?? "US-East Only";
  const tenantName = policy?.company_name ?? "your_namespace";
  const isEuEnabled = regionPin === "Multi-Region" || regionPin.includes("EU");
  const isUsEnabled = regionPin === "Multi-Region" || regionPin.includes("US");
  const isAfEnabled = regionPin === "Multi-Region" || regionPin.includes("AF");

  return (
    <div className="space-y-12 animate-in fade-in zoom-in-95 duration-500 font-sans pb-12">
      <div className="flex items-center justify-between pb-4 border-b border-border/50">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary flex items-center gap-2">
            <Network className="h-6 w-6" />
            Infrastructure Mapping ERD
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Visualizing mapping from Logical Namespace (<span className="font-mono text-primary">{tenantName}</span>) to Physical Infrastructure.
          </p>
        </div>
      </div>

      <div className="relative space-y-16">
        
        {/* LOGICAL LAYER */}
        <div className="border border-border/50 bg-secondary/10 rounded-xl p-8 relative">
          <div className="absolute -top-3 left-6 bg-background px-2 text-sm font-bold text-muted-foreground uppercase tracking-wider">
            Logical Schema Layer (What App Sees)
          </div>
          
          <div className="flex flex-wrap justify-center gap-6 mt-4">
            {nodes.map((n: any) => (
              <div key={n.table_name} className="w-full md:w-80">
                <SchemaCard tableName={n.table_name} columns={schemaMap[n.table_name] || []} />
              </div>
            ))}
            {nodes.length === 0 && (
              <div className="text-muted-foreground text-sm text-center w-full py-8">
                No tables found in public schema. Create tables to see them mapped here.
              </div>
            )}
          </div>
          <div className="text-center mt-6 text-sm text-muted-foreground">
            Developers write standard SQL against these logical tables.
          </div>
        </div>

        {/* ROUTER / PARTITION DEFINITION */}
        <div className="flex justify-center items-center">
          <div className="flex flex-col items-center">
            <div className="h-8 w-0.5 bg-border"></div>
            <div className="bg-primary text-primary-foreground px-6 py-3 rounded-full font-bold flex items-center gap-2 shadow-lg shadow-primary/20">
              <ArrowDown className="h-5 w-5" /> 
              Sovereign Gateway Routing
              <ArrowDown className="h-5 w-5" />
            </div>
            <div className="mt-2 text-xs text-muted-foreground font-mono bg-secondary/30 px-3 py-1 rounded border border-border/50 flex items-center gap-1 text-amber-500 border-amber-500/30">
              <Lock className="h-3 w-3" /> RULE: REGION_PIN = '{regionPin}'
            </div>
            <div className="h-8 w-0.5 bg-border mt-2"></div>
          </div>
        </div>

        {/* PHYSICAL LAYER */}
        <div className="grid md:grid-cols-2 gap-8 relative">
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-background px-4 py-1 text-sm font-bold text-muted-foreground uppercase tracking-wider rounded-full border border-border">
            Physical Storage Layer
          </div>
          
          {/* US Node */}
          <div className={`border-2 rounded-xl p-6 pt-10 relative transition-all ${isUsEnabled ? "border-blue-500/50 bg-blue-500/5 shadow-[0_0_30px_-5px_rgba(59,130,246,0.1)]" : "border-border border-dashed bg-secondary/5 opacity-60 grayscale"}`}>
            {isUsEnabled ? (
              <div className="absolute top-4 right-4 text-blue-500 bg-blue-500/10 px-3 py-1 rounded-full text-xs font-bold uppercase flex items-center gap-1">
                <MapPin className="h-3 w-3" /> US-East
              </div>
            ) : (
              <div className="absolute top-4 right-4 text-muted-foreground bg-secondary px-3 py-1 rounded-full text-xs font-bold uppercase flex items-center gap-1">
                <Lock className="h-3 w-3" /> Locked
              </div>
            )}
            
            <h2 className={`text-xl font-bold mb-1 ${isUsEnabled ? "text-foreground" : "text-muted-foreground"}`}>Physical Node A</h2>
            <p className="text-sm mb-6 text-muted-foreground font-mono">Tablespace: <span className={isUsEnabled ? "text-blue-400" : ""}>us_data_space</span></p>
            
            {isUsEnabled ? (
              <div className="space-y-6">
                {nodes.map((n: any) => (
                  <SchemaCard key={`us-${n.table_name}`} tableName={n.table_name} columns={schemaMap[n.table_name] || []} highlight={regionPin === "Multi-Region" ? "US ROWS ONLY" : "ALL ROWS"} />
                ))}
                {nodes.length === 0 && <div className="text-muted-foreground text-sm">No tables.</div>}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 border border-border/50 border-dashed rounded-lg bg-background/50">
                <Lock className="h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground font-medium">Data Storage Disabled</p>
                <p className="text-xs text-muted-foreground/70 mt-1 max-w-[200px] text-center">Tenant rule prevents data replication to US-East.</p>
              </div>
            )}
          </div>

          {/* EU Node */}
          <div className={`border-2 rounded-xl p-6 pt-10 relative transition-all ${isEuEnabled ? "border-green-500/50 bg-green-500/5 shadow-[0_0_30px_-5px_rgba(34,197,94,0.1)]" : "border-border border-dashed bg-secondary/5 opacity-60 grayscale"}`}>
            {isEuEnabled ? (
              <div className="absolute top-4 right-4 text-green-500 bg-green-500/10 px-3 py-1 rounded-full text-xs font-bold uppercase flex items-center gap-1">
                <MapPin className="h-3 w-3" /> EU-Central
              </div>
            ) : (
              <div className="absolute top-4 right-4 text-muted-foreground bg-secondary px-3 py-1 rounded-full text-xs font-bold uppercase flex items-center gap-1">
                <Lock className="h-3 w-3" /> Locked
              </div>
            )}
            
            <h2 className={`text-xl font-bold mb-1 ${isEuEnabled ? "text-foreground" : "text-muted-foreground"}`}>Physical Node B (EU-Central)</h2>
            <p className="text-sm mb-6 text-muted-foreground font-mono">Tablespace: <span className={isEuEnabled ? "text-green-400" : ""}>eu_data_space</span></p>
            
            {isEuEnabled ? (
              <div className="space-y-6">
                {nodes.map((n: any) => (
                  <SchemaCard key={`eu-${n.table_name}`} tableName={n.table_name} columns={schemaMap[n.table_name] || []} highlight={regionPin === "Multi-Region" ? "EU ROWS ONLY" : "ALL ROWS"} />
                ))}
                {nodes.length === 0 && <div className="text-muted-foreground text-sm">No tables.</div>}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 border border-border/50 border-dashed rounded-lg bg-background/50">
                <Lock className="h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground font-medium">Data Storage Disabled</p>
                <p className="text-xs text-muted-foreground/70 mt-1 max-w-[200px] text-center">Tenant rule prevents data replication to EU-Central.</p>
              </div>
            )}
          </div>

          {/* AF Node */}
          <div className={`border-2 rounded-xl p-6 pt-10 relative transition-all ${isAfEnabled ? "border-purple-500/50 bg-purple-500/5 shadow-[0_0_30px_-5px_rgba(168,85,247,0.1)]" : "border-border border-dashed bg-secondary/5 opacity-60 grayscale"}`}>
            {isAfEnabled ? (
              <div className="absolute top-4 right-4 text-purple-500 bg-purple-500/10 px-3 py-1 rounded-full text-xs font-bold uppercase flex items-center gap-1">
                <MapPin className="h-3 w-3" /> AF-South
              </div>
            ) : (
              <div className="absolute top-4 right-4 text-muted-foreground bg-secondary px-3 py-1 rounded-full text-xs font-bold uppercase flex items-center gap-1">
                <Lock className="h-3 w-3" /> Locked
              </div>
            )}
            
            <h2 className={`text-xl font-bold mb-1 ${isAfEnabled ? "text-foreground" : "text-muted-foreground"}`}>Physical Node C (AF-South)</h2>
            <p className="text-sm mb-6 text-muted-foreground font-mono">Tablespace: <span className={isAfEnabled ? "text-purple-400" : ""}>af_data_space</span></p>
            
            {isAfEnabled ? (
              <div className="space-y-6">
                {nodes.map((n: any) => (
                  <SchemaCard key={`af-${n.table_name}`} tableName={n.table_name} columns={schemaMap[n.table_name] || []} highlight={regionPin === "Multi-Region" ? "AF ROWS ONLY" : "ALL ROWS"} />
                ))}
                {nodes.length === 0 && <div className="text-muted-foreground text-sm">No tables.</div>}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 border border-border/50 border-dashed rounded-lg bg-background/50">
                <Lock className="h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground font-medium">Data Storage Disabled</p>
                <p className="text-xs text-muted-foreground/70 mt-1 max-w-[200px] text-center">Tenant rule prevents data replication to AF-South.</p>
              </div>
            )}
          </div>
          
        </div>
      </div>
    </div>
  );
}

function SchemaCard({ tableName, columns, highlight }: any) {
  return (
    <div className="border border-border/80 bg-card rounded-md overflow-hidden shadow-sm">
      <div className="bg-secondary/40 px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TableIcon className="h-4 w-4 text-primary" />
          <span className="font-semibold font-mono text-sm">{tableName}</span>
        </div>
        {highlight && (
          <Badge variant="outline" className={`text-[10px] bg-background/50 ${highlight.includes('EU') ? 'text-green-500 border-green-500/30' : 'text-blue-500 border-blue-500/30'}`}>{highlight}</Badge>
        )}
      </div>
      <div className="p-4 space-y-2">
        {columns.map((col: any) => (
          <div key={col.column_name || col.name} className="flex justify-between items-center text-sm font-mono border-b border-border/30 pb-1.5 last:border-0 last:pb-0">
            <div className="flex items-center gap-2">
              <span className={col.is_primary_key || col.pk ? "font-bold text-foreground" : "text-muted-foreground"}>{col.column_name || col.name}</span>
              {(col.is_primary_key || col.pk) && <Badge variant="outline" className="text-[9px] h-3.5 px-1 py-0 bg-primary/10 text-primary border-primary/20">PK</Badge>}
              {(col.is_fpe || col.fpe) && <Badge variant="outline" className="text-[9px] h-3.5 px-1 py-0 border-orange-500/30 text-orange-500 bg-orange-500/10">FPE</Badge>}
            </div>
            <span className="text-muted-foreground/60 text-xs">{col.data_type || col.type}</span>
          </div>
        ))}
        {columns.length === 0 && <div className="text-muted-foreground text-xs italic">No columns</div>}
      </div>
    </div>
  );
}
