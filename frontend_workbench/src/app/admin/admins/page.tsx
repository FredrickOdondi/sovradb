"use client";

import { useState, useEffect } from "react";
import { fetchPlatformAdmins, createPlatformAdmin, deletePlatformAdmin } from "@/app/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users, Trash2, Plus, ShieldCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function PlatformAdminsPage() {
  const [admins, setAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadAdmins = async () => {
    setLoading(true);
    const res = await fetchPlatformAdmins();
    if (res.success) {
      setAdmins(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAdmins();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");
    
    // In production, we'd hash the password here or on the server.
    // We are passing plaintext to the server action, which currently stores it directly
    // per the implementation plan demonstration constraints.
    const res = await createPlatformAdmin(email, btoa(password));
    
    if (res.success) {
      setEmail("");
      setPassword("");
      await loadAdmins();
    } else {
      setError(res.error || "Failed to create admin");
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to revoke this admin's access?")) return;
    
    const res = await deletePlatformAdmin(id);
    if (res.success) {
      await loadAdmins();
    } else {
      alert(res.error || "Failed to delete admin");
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500 font-sans pb-12">
      <div className="flex items-center justify-between pb-4 border-b border-border/50">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-orange-500 flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" />
            Platform Administrators
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage system-level access to the SovraDB Control Plane.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <Card className="col-span-2 shadow-sm border-border">
          <CardHeader>
            <CardTitle className="flex items-center text-foreground">
              <Users className="w-5 h-5 mr-2" />
              Active Administrator Accounts
            </CardTitle>
            <CardDescription>
              These accounts bypass tenant isolation and have full access to platform telemetry and billing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader className="bg-secondary/20">
                  <TableRow>
                    <TableHead>Email Address</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center h-24 text-muted-foreground animate-pulse">
                        Loading administrators...
                      </TableCell>
                    </TableRow>
                  ) : admins.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                        No administrators found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    admins.map((admin: any) => (
                      <TableRow key={admin.id}>
                        <TableCell className="font-medium">{admin.email}</TableCell>
                        <TableCell>
                          <Badge variant={admin.email === 'admin@sovradb.io' ? 'default' : 'outline'} className={admin.email === 'admin@sovradb.io' ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}>
                            {admin.email === 'admin@sovradb.io' ? 'Super Admin' : 'Admin'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {admin.created_at ? formatDistanceToNow(new Date(admin.created_at), { addSuffix: true }) : 'Unknown'}
                        </TableCell>
                        <TableCell className="text-right">
                          <button 
                            onClick={() => handleDelete(admin.id)}
                            disabled={admin.email === 'admin@sovradb.io'}
                            className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title={admin.email === 'admin@sovradb.io' ? "Cannot delete the default super admin" : "Revoke Access"}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-1 shadow-sm h-fit border-border">
          <CardHeader>
            <CardTitle className="flex items-center text-foreground">
              <Plus className="w-5 h-5 mr-2" />
              Provision Access
            </CardTitle>
            <CardDescription>
              Grant a new engineer access to the Control Plane.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              {error && (
                <div className="p-3 text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-md">
                  {error}
                </div>
              )}
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Email Address</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="engineer@sovradb.io"
                  className="w-full p-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Temporary Password</label>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full p-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                />
              </div>
              
              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full py-2 px-4 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-md transition-colors disabled:opacity-50"
              >
                {isSubmitting ? "Provisioning..." : "Provision Admin"}
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
