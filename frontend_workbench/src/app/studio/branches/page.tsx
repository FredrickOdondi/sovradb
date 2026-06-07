"use client";

import { useState, useEffect } from "react";
import { GitBranch, Plus, Clock, Database, Copy, Trash2, GitMerge, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fetchTemporalCommits } from "@/app/actions";

export default function BranchesPage() {
  const [commits, setCommits] = useState<any[]>([]);
  const [namespace, setNamespace] = useState<string>("");
  useEffect(() => {
    fetchTemporalCommits().then((res) => {
      if (res.success) {
        setCommits(res.data);
        if (res.namespace) setNamespace(res.namespace);
      }
    });
  }, []);
  const [branches, setBranches] = useState<any[]>([]);

  useEffect(() => {
    if (!namespace) return;
    const storageKey = `sovra_mock_branches_${namespace}`;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      setBranches(JSON.parse(saved));
    } else {
      const initialBranches = [
        { 
          id: "br_main", 
          name: "main", 
          status: "Primary", 
          created: "2024-01-01 00:00 UTC", 
          dataSize: "48.2 GB",
          uri: `postgres://tenant_admin:***@gateway.sovradb.io:5432/sovra_db?search_path=${namespace}`,
          isMain: true
        }
      ];
      setBranches(initialBranches);
      localStorage.setItem(storageKey, JSON.stringify(initialBranches));
    }
  }, [namespace]);

  useEffect(() => {
    if (branches.length > 0 && namespace) {
      localStorage.setItem(`sovra_mock_branches_${namespace}`, JSON.stringify(branches));
      // Dispatch custom event to notify other tabs/components
      window.dispatchEvent(new Event(`sovra_branches_updated_${namespace}`));
    }
  }, [branches, namespace]);
  
  // Dialog State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [timeTravel, setTimeTravel] = useState("now");

  const openCreateModal = () => {
    setNewBranchName("");
    setTimeTravel("now");
    setIsCreateModalOpen(true);
  };

  const submitCreateBranch = () => {
    if (!newBranchName.trim()) {
      toast.error("Please provide a branch name.");
      return;
    }
    
    const formattedName = newBranchName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    
    const newBranch = {
      id: `br_${Date.now()}`,
      name: formattedName,
      status: "Active",
      created: new Date().toISOString().replace('T', ' ').substring(0, 16) + " UTC",
      dataSize: "0 GB (Copy-on-Write)",
      uri: `postgres://mike:***@gateway.sovradb.io:5432/sovra_db?search_path=tenant_mike&branch=${formattedName}`,
      isMain: false
    };

    setBranches([...branches, newBranch]);
    setIsCreateModalOpen(false);
    
    if (timeTravel !== "now") {
      toast.success("Time-Travel Branch Created", { description: `Restored snapshot from ${timeTravel}` });
    } else {
      toast.success("Branch Created", { description: "Instantaneous Copy-on-Write branch ready in 42ms." });
    }
  };

  const deleteBranch = (id: string) => {
    setBranches(branches.filter(b => b.id !== id));
    toast.success("Branch Deleted", { description: "Resources have been reclaimed." });
  };

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500 font-sans pb-12">
      <div className="flex items-center justify-between pb-4 border-b border-border/50">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary flex items-center gap-2">
            <GitBranch className="h-6 w-6" />
            Temporal Branching
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Create instantaneous Copy-on-Write database clones for testing, CI/CD, or point-in-time recovery.
          </p>
        </div>
        <Button onClick={openCreateModal} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-2" /> Create Branch
        </Button>
      </div>

      <div className="grid gap-6">
        {branches.map((branch) => (
          <div key={branch.id} className={`rounded-xl border ${branch.isMain ? 'border-primary/50 bg-primary/5 shadow-[0_0_15px_-3px_rgba(var(--primary),0.1)]' : 'border-border bg-card'} p-6 relative overflow-hidden group`}>
            
            {branch.isMain && (
              <div className="absolute top-0 right-0 bg-primary/20 text-primary px-3 py-1 text-xs font-bold rounded-bl-lg">
                PRODUCTION ENVIRONMENT
              </div>
            )}

            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <GitBranch className={`h-5 w-5 ${branch.isMain ? 'text-primary' : 'text-muted-foreground'}`} />
                  {branch.name}
                </h2>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Created: {branch.created}</span>
                  <span className="flex items-center gap-1"><Database className="h-3 w-3" /> Size: <span className="font-mono text-foreground">{branch.dataSize}</span></span>
                </div>
              </div>
              
              {!branch.isMain && (
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="outline" size="sm" className="h-8 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10" onClick={() => toast.info("Schema diffing tool would open here.")}>
                    <GitMerge className="h-3 w-3 mr-1.5" /> Compare & Merge
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 text-red-500 hover:text-red-600 hover:bg-red-500/10" onClick={() => deleteBranch(branch.id)}>
                    <Trash2 className="h-3 w-3 mr-1.5" /> Delete
                  </Button>
                </div>
              )}
            </div>

            <div className="mt-6 space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Gateway Connection String</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-secondary/50 p-3 rounded-md border border-border/50 font-mono text-sm text-foreground break-all flex items-center justify-between">
                  {branch.uri}
                  <Copy 
                    className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-primary transition-colors" 
                    onClick={() => toast.success("Connection string copied!")}
                  />
                </div>
              </div>
              {!branch.isMain && (
                <p className="text-xs text-muted-foreground">
                  The <code className="text-primary bg-primary/10 px-1 rounded">?branch={branch.name}</code> parameter instructs the Sovereign Gateway to route this connection to the isolated CoW snapshot.
                </p>
              )}
            </div>

          </div>
        ))}
      </div>

      {/* Live Temporal History */}
      <div className="rounded-md border border-border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <History className="h-5 w-5 text-muted-foreground" />
          Temporal Mutation Log
          <span className="text-xs text-muted-foreground font-mono font-normal ml-2">
            {namespace ? `${namespace}.authors_history` : "authors_history"}
          </span>
        </h2>
        {commits.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center">
            No temporal mutations recorded yet. Update or delete an authors row to see history.
          </div>
        ) : (
          <div className="overflow-auto max-h-64">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-border">
                <tr>
                  <th className="pb-2 text-xs font-semibold text-muted-foreground">Record ID</th>
                  <th className="pb-2 text-xs font-semibold text-muted-foreground">Region</th>
                  <th className="pb-2 text-xs font-semibold text-muted-foreground">Mutated At</th>
                </tr>
              </thead>
              <tbody>
                {commits.map((c: any, i: number) => (
                  <tr key={i} className="border-b border-border/30 hover:bg-secondary/10">
                    <td className="py-2 font-mono text-xs text-muted-foreground">{c.affected_record_id?.substring(0, 12)}...</td>
                    <td className="py-2">
                      <Badge variant="outline" className="text-[10px]">{c.region_code}</Badge>
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {c.mutation_timestamp ? new Date(c.mutation_timestamp).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-[500px] border-border bg-card">
          <DialogHeader>
            <DialogTitle>Create Temporal Branch</DialogTitle>
            <DialogDescription>
              Spin up an isolated Copy-on-Write clone of your database. Costs $0 in extra storage initially.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Branch Name</label>
              <Input 
                placeholder="e.g. feat/add-user-profiles" 
                value={newBranchName} 
                onChange={(e) => setNewBranchName(e.target.value)} 
                className="bg-secondary/20 font-mono"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" /> Point in Time Recovery
              </label>
              <div className="space-y-3 p-3 bg-secondary/10 border border-border/50 rounded-md">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="radio" 
                    name="timeTravel" 
                    value="now" 
                    checked={timeTravel === "now"} 
                    onChange={() => setTimeTravel("now")}
                    className="text-primary accent-primary w-4 h-4"
                  />
                  <div>
                    <div className="text-sm font-semibold">Latest (Now)</div>
                    <div className="text-xs text-muted-foreground">Branch from the current state of production.</div>
                  </div>
                </label>
                <div className="border-t border-border/50"></div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="radio" 
                    name="timeTravel" 
                    value="custom" 
                    checked={timeTravel !== "now"} 
                    onChange={() => setTimeTravel("10 minutes ago")}
                    className="text-primary accent-primary w-4 h-4"
                  />
                  <div>
                    <div className="text-sm font-semibold">Time Travel</div>
                    <div className="text-xs text-muted-foreground mb-2">Branch from a specific point in the past.</div>
                    {timeTravel !== "now" && (
                      <Input 
                        type="datetime-local" 
                        className="bg-background h-8 text-xs" 
                        onChange={(e) => setTimeTravel(e.target.value)}
                      />
                    )}
                  </div>
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>Cancel</Button>
            <Button onClick={submitCreateBranch} className="bg-primary text-primary-foreground hover:bg-primary/90">Create Snapshot</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
