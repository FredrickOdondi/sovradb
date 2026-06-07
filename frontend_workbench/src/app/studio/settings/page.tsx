"use client";

import { useState, useEffect } from "react";
import { Settings, Link2, CheckCircle2, Key, Plus, Trash2, Eye, EyeOff, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fetchApiKeys, createApiKey, revokeApiKey, fetchProjectPolicy } from "@/app/actions";

export default function SettingsPage() {
  const [keys, setKeys] = useState<any[]>([]);
  const [policy, setPolicy] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showSecrets, setShowSecrets] = useState(false);
  const [isCreateKeyModalOpen, setIsCreateKeyModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyType, setNewKeyType] = useState<"pk" | "sk">("pk");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const init = async () => {
      const [keysRes, policyRes] = await Promise.all([
        fetchApiKeys(),
        fetchProjectPolicy(),
      ]);
      if (keysRes.success) setKeys(keysRes.data);
      if (policyRes.success) setPolicy(policyRes.data);
      setLoading(false);
    };
    init();
  }, []);

  const openCreateModal = () => {
    setNewKeyName("");
    setNewKeyType("pk");
    setIsCreateKeyModalOpen(true);
  };

  const submitCreateKey = async () => {
    if (!newKeyName.trim()) {
      toast.error("Please provide a name for the API Key.");
      return;
    }
    setSaving(true);
    // Use the first project's id from policy if available
    const projectId = policy?.id ?? "b0000000-0000-0000-0000-000000000001";
    const res = await createApiKey(projectId, newKeyName, newKeyType);
    if (res.success) {
      setKeys([res.data, ...keys]);
      setIsCreateKeyModalOpen(false);
      toast.success("API Key Generated", { description: "The key is now active and ready to use." });
    } else {
      toast.error("Failed to create key", { description: res.error });
    }
    setSaving(false);
  };

  const handleRevoke = async (keyId: string) => {
    const res = await revokeApiKey(keyId);
    if (res.success) {
      setKeys(keys.filter((k) => k.id !== keyId));
      toast.success("API Key Revoked", { description: "Any apps using this key will immediately lose access." });
    } else {
      toast.error("Failed to revoke key");
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500 font-sans">
      <div className="flex items-center justify-between pb-4 border-b border-border/50">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Project Settings
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage your connection strings, API keys, and project configuration.
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Connection Info */}
        <div className="rounded-md border border-border bg-card p-6 space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Link2 className="h-5 w-5 text-muted-foreground" />
            Connection Details
          </h2>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                PostgreSQL URI (Direct Connection)
              </label>
              <div className="bg-secondary/30 p-3 rounded-md border border-border/50 font-mono text-sm text-primary break-all">
                {`postgres://admin:***@gateway.sovradb.io:5432/sovra_db?search_path=${policy?.company_name?.replace(/[^a-zA-Z0-9_]/gi, '') ?? 'public'}`}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                This connects directly through the Sovereign Gateway to your assigned partitions.
              </p>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-border/30">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                REST / GraphQL Endpoint
              </label>
              <div className="bg-secondary/30 p-3 rounded-md border border-border/50 font-mono text-sm text-primary break-all">
                {`https://api.sovradb.io/v1/${policy?.company_name?.replace(/[^a-zA-Z0-9_]/gi, '') ?? 'public'}/graphql`}
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm text-orange-500 pt-2 font-medium">
              <CheckCircle2 className="h-4 w-4" />
              {policy?.region_pin ? `Actively routing to ${policy.region_pin}` : "Actively routing to US-East"}
            </div>

            {policy && (
              <div className="pt-2 border-t border-border/30 text-xs text-muted-foreground space-y-1">
                <div>Tenant ID: <span className="font-mono text-foreground">{policy.tenant_id}</span></div>
                <div>Region Pin: <span className="font-mono text-foreground">{policy.region_pin}</span></div>
                <div>FPE: <span className={policy.fpe_enabled ? "text-orange-500" : "text-muted-foreground"}>
                  {policy.fpe_enabled ? "Enabled" : "Disabled"}
                </span></div>
              </div>
            )}
          </div>
        </div>

        {/* API Keys */}
        <div className="rounded-md border border-border bg-card flex flex-col overflow-hidden">
          <div className="p-6 border-b border-border flex items-center justify-between bg-card">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Key className="h-5 w-5 text-muted-foreground" />
              API Keys
            </h2>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowSecrets(!showSecrets)}>
                {showSecrets ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                {showSecrets ? "Hide" : "Reveal"}
              </Button>
              <Button size="sm" onClick={openCreateModal} className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4 mr-2" /> New Key
              </Button>
            </div>
          </div>
          <div className="p-6 space-y-4 flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : keys.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                No active API keys found. Generate one above.
              </div>
            ) : (
              keys.map((key) => (
                <div
                  key={key.id}
                  className="flex flex-col p-3 border border-border rounded-md bg-secondary/10 group relative"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-sm flex items-center gap-2">
                      {key.name}
                      <Badge variant="outline" className="text-[10px] h-4 py-0 uppercase">
                        {key.key_type === "sk" ? "Secret" : "Publishable"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-orange-500/20 text-orange-500 hover:bg-orange-500/20 border-none">
                        {key.status}
                      </Badge>
                      <button
                        onClick={() => handleRevoke(key.id)}
                        className="text-muted-foreground hover:text-red-500 transition-colors ml-2"
                        title="Revoke Key"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono bg-background p-2 rounded border border-border select-all">
                    {showSecrets ? key.key_value : key.key_value?.substring(0, 12) + "****************"}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <Dialog open={isCreateKeyModalOpen} onOpenChange={setIsCreateKeyModalOpen}>
        <DialogContent className="sm:max-w-[425px] border-border bg-card">
          <DialogHeader>
            <DialogTitle>Generate New API Key</DialogTitle>
            <DialogDescription>
              Create a new key to authenticate requests to the Sovereign Gateway.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Key Name</label>
              <Input
                placeholder="e.g. Mobile App (iOS)"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="bg-secondary/20"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Key Type</label>
              <div className="flex gap-4">
                {(["pk", "sk"] as const).map((type) => (
                  <label
                    key={type}
                    className="flex items-center gap-2 text-sm cursor-pointer border border-border p-3 rounded-md flex-1 bg-secondary/10 hover:bg-secondary/30 transition-colors"
                  >
                    <input
                      type="radio"
                      name="keyType"
                      value={type}
                      checked={newKeyType === type}
                      onChange={() => setNewKeyType(type)}
                      className="text-primary"
                    />
                    <div>
                      <div className="font-semibold">{type === "pk" ? "Publishable" : "Secret"}</div>
                      <div className="text-xs text-muted-foreground">
                        {type === "pk" ? "For frontend clients" : "For backend servers"}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateKeyModalOpen(false)}>Cancel</Button>
            <Button
              onClick={submitCreateKey}
              disabled={saving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Generate Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
