"use client";

import { useState, useEffect } from "react";
import { fetchPlatformAdmins, createPlatformAdmin } from "@/app/actions";
import { Shield, Plus, Loader2, Key } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AdminManager() {
  const [admins, setAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPlatformAdmins().then((res) => {
      if (res.success) setAdmins(res.data);
      setLoading(false);
    });
  }, []);

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please provide both email and password.");
      return;
    }
    setSaving(true);
    const res = await createPlatformAdmin(email, password);
    if (res.success) {
      setAdmins([...admins, res.data]);
      setEmail("");
      setPassword("");
      toast.success("Platform Administrator Added");
    } else {
      toast.error("Failed to add admin", { description: res.error });
    }
    setSaving(false);
  };

  return (
    <div className="rounded-md border border-border bg-card p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Shield className="h-5 w-5 text-orange-500" />
        Platform Administrators
      </h2>
      
      {/* List of Admins */}
      <div className="space-y-3 mb-6">
        {loading ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : admins.length > 0 ? (
          admins.map((admin) => (
            <div key={admin.id} className="flex items-center justify-between p-3 rounded-md bg-secondary/20 border border-border/40">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-orange-500/10 flex items-center justify-center">
                  <Key className="h-4 w-4 text-orange-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">{admin.email}</p>
                  <p className="text-xs text-muted-foreground">Added: {new Date(admin.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No platform admins found.</p>
        )}
      </div>

      {/* Add Admin Form */}
      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-medium mb-3">Authorize New Admin</h3>
        <form onSubmit={handleAddAdmin} className="space-y-3">
          <Input 
            placeholder="admin@sovradb.internal" 
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={saving}
          />
          <Input 
            placeholder="Master Password" 
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={saving}
          />
          <Button type="submit" disabled={saving} className="w-full" variant="outline">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            Grant Master Access
          </Button>
        </form>
      </div>
    </div>
  );
}
