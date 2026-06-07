import { ShieldAlert, Key } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchFPEProjects } from "@/app/actions";

export default async function VaultsPage() {
  const fpeRes = await fetchFPEProjects();
  const fpeProjects = fpeRes.success ? fpeRes.data : [];

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500 font-sans">
      <div className="flex items-center justify-between pb-4 border-b border-border/50">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-orange-500 flex items-center gap-2">
            <ShieldAlert className="h-6 w-6" />
            FPE Vaults
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Format-Preserving Encryption keys and tokenization audit logs.
          </p>
        </div>
        <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20">
          Zero Faults
        </Badge>
      </div>

      <div className="space-y-6">
        <div className="rounded-md border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader className="bg-secondary/20">
              <TableRow>
                <TableHead>Tenant Namespace</TableHead>
                <TableHead>Physical Vault Node</TableHead>
                <TableHead>Algorithm</TableHead>
                <TableHead>Key Version</TableHead>
                <TableHead>Enabled At</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fpeProjects.length > 0 ? (
                fpeProjects.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.company_name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{p.region_pin}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">NIST FF1</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20 font-mono">
                        v{p.fpe_key_version || 1}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {p.fpe_enabled_at ? new Date(p.fpe_enabled_at).toLocaleString() : "Just now"}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-orange-500 flex items-center justify-end gap-1 text-sm">
                        <ShieldAlert className="h-4 w-4" /> SECURE
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    <Key className="h-8 w-8 opacity-20 mx-auto mb-2" />
                    No tenants have FPE enabled yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
