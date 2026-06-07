import { fetchProjectPolicy } from "@/app/actions";
import { Shield, Globe, Lock } from "lucide-react";

export default async function RulesPage() {
  const policyRes = await fetchProjectPolicy();
  const policy = policyRes.success ? policyRes.data : null;

  const regionPin = policy?.region_pin ?? "US-East Only";
  const fpeEnabled = policy?.fpe_enabled ?? false;
  const tenantName = policy?.company_name ?? "tenant_mike";

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500 font-sans">
      <div className="flex items-center justify-between pb-4 border-b border-border/50">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Compliance &amp; Routing Rules
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Control exactly how the Sovereign Gateway handles your data before it reaches the Postgres fabric.
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Region Pinning */}
        <div className="rounded-md border border-border bg-card p-6 space-y-6">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
              <Globe className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Region Pinning (Data Residency)</h3>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                Force all data for{" "}
                <code className="font-mono text-xs">{tenantName}</code> to remain within a
                specific geographic boundary to comply with local laws.
              </p>

              <div className="mt-4 p-4 border border-border rounded-md bg-secondary/20">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Active Policy:</span>
                  <span className="bg-primary/20 text-primary px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                    {regionPin}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  The Sovereign Gateway will drop connections that attempt to route your data
                  to nodes outside the pinned region.
                </p>
                {policy && (
                  <div className="mt-3 pt-3 border-t border-border/50 text-xs font-mono text-muted-foreground space-y-1">
                    <div>Tenant ID: {policy.tenant_id}</div>
                    <div>Primary Region Code: {policy.region_code ?? "US"}</div>
                    <div>FPE Key Version: v{policy.fpe_key_version ?? 1}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* FPE Status */}
        <div className="rounded-md border border-border bg-card p-6 space-y-6">
          <div className="flex items-start gap-4">
            <div
              className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                fpeEnabled ? "bg-primary/10" : "bg-secondary"
              }`}
            >
              <Lock className={`h-5 w-5 ${fpeEnabled ? "text-primary" : "text-muted-foreground"}`} />
            </div>
            <div className="flex-1">
              <h3 className={`font-semibold text-lg ${fpeEnabled ? "" : "text-muted-foreground"}`}>
                Format-Preserving Encryption
              </h3>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                Automatically tokenize specific columns (e.g., SSN, phone numbers) at the
                network layer using NIST FF1.
              </p>

              <div
                className={`mt-4 p-4 border border-border rounded-md ${
                  fpeEnabled ? "bg-primary/5" : "bg-secondary/10 opacity-70"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`font-medium ${fpeEnabled ? "" : "text-muted-foreground"}`}>
                    Active Policy:
                  </span>
                  {fpeEnabled ? (
                    <span className="bg-primary/20 text-primary px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                      Enabled
                    </span>
                  ) : (
                    <span className="border border-border text-muted-foreground px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                      Disabled
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  {fpeEnabled
                    ? "NIST FF1 tokenization is active on PII columns (ssn, national_id_number). Ciphertext is format-preserving."
                    : "Your project is currently storing plaintext strings on the underlying PostgreSQL fabric."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
