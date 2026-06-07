import { Globe, Server, Activity, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fetchReplicationLag } from "@/app/actions";

export default async function NodesPage() {
  const lagRes = await fetchReplicationLag();
  const slots = lagRes.success ? lagRes.data : [];

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500 font-sans">
      <div className="flex items-center justify-between pb-4 border-b border-border/50">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-orange-500 flex items-center gap-2">
            <Globe className="h-6 w-6" />
            Sovereign Nodes
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Global physical infrastructure for pgEdge/Yugabyte Storage Fabric.
          </p>
        </div>
        <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20">
          {slots.length} Active Edge Slots
        </Badge>
      </div>
      
      <div className="grid md:grid-cols-2 gap-6">
        {slots.map((slot: any) => (
          <RegionCard 
            key={slot.slot_name}
            region={slot.slot_name === "powersync_primary" ? "US-East (Primary)" : "EU-Central (Heartbeat)"} 
            slotName={slot.slot_name}
            isActive={slot.active}
            latency={slot.lag_size}
            alertLevel={slot.alert_level}
          />
        ))}
        {/* Mocking the AF-South edge node since it's an external read replica in this architecture */}
        <RegionCard 
          region="AF-South (Edge)" 
          slotName="powersync_africa" 
          isActive={true} 
          latency="124ms" 
          alertLevel="OK"
        />
      </div>
    </div>
  );
}

function RegionCard({ region, slotName, isActive, latency, alertLevel }: any) {
  return (
    <div className="border border-border bg-card p-6 rounded-md space-y-4">
      <div className="flex justify-between items-start">
        <h3 className="font-semibold">{region}</h3>
        {alertLevel === "OK" ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-orange-500" />
        )}
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Replication Slot</span>
          <span className="font-mono">{slotName}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Status</span>
          <span className="font-mono">{isActive ? 'Active' : 'Inactive'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Replication Lag</span>
          <span className={`font-mono flex items-center gap-1 ${alertLevel === 'OK' ? 'text-green-500' : 'text-orange-500'}`}>
            <Activity className="h-3 w-3" /> {latency || "0 bytes"}
          </span>
        </div>
      </div>
    </div>
  );
}
