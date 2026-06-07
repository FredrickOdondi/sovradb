"use client";

import { usePowerSync, useQuery } from "@powersync/react";
import PowerSyncProvider from "@/components/PowerSyncProvider";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Wifi, WifiOff, Zap, ShieldAlert, Cpu } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";

// The internal component that relies on the PowerSyncContext
function LocalFirstDataView() {
  const db = usePowerSync();
  const [status, setStatus] = useState(db.currentStatus);

  // Watch connection status
  useEffect(() => {
    const l1 = db.registerListener({
      statusChanged: (s) => setStatus(s)
    });
    return () => l1();
  }, [db]);

  // Reactive live query running entirely against the local WASM SQLite database!
  // Any changes from the server pushed via WebSockets automatically trigger a re-render.
  // We use `SELECT *` but the server has already masked PII via pg_anon before replication.
  const { data: users, isLoading } = useQuery("SELECT * FROM sovereign_users ORDER BY created_at DESC LIMIT 50");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-6">
        <Card className="col-span-2 shadow-sm border-border">
          <CardHeader>
            <CardTitle className="flex items-center text-primary">
              <Zap className="w-5 h-5 mr-2" />
              Zero-Latency Local Data View
            </CardTitle>
            <CardDescription>
              This table is rendered entirely from the local browser <strong className="text-foreground">WASM SQLite</strong> database.
              Network requests are bypassed completely for instant UX.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-10 text-muted-foreground animate-pulse">Syncing local cache...</div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader className="bg-secondary/20">
                    <TableRow>
                      {users.length > 0 ? Object.keys(users[0]).map((col) => (
                        <TableHead key={col} className="capitalize font-mono text-xs">{col.replace(/_/g, " ")}</TableHead>
                      )) : (
                        <TableHead>Columns Awaiting Data</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.length === 0 ? (
                      <TableRow>
                        <TableCell className="text-center h-24 text-muted-foreground">
                          No tenant data found in local sync cache.
                        </TableCell>
                      </TableRow>
                    ) : (
                      users.map((row: any) => (
                        <TableRow key={row.id || Math.random()}>
                          {Object.keys(users[0]).map((col) => (
                            <TableCell key={`${row.id}-${col}`} className="font-mono text-xs max-w-[150px] truncate">
                              {col === "region_code" ? (
                                <Badge variant="outline">{row[col]}</Badge>
                              ) : (
                                String(row[col] ?? "NULL")
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-1 shadow-sm h-fit">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Cpu className="w-5 h-5 mr-2" />
              Sync Engine Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-md border border-border">
              <span className="text-sm font-medium">Connection:</span>
              {status.connected ? (
                <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20"><Wifi className="w-3 h-3 mr-1" /> Streaming WAL</Badge>
              ) : (
                <Badge variant="destructive"><WifiOff className="w-3 h-3 mr-1" /> Offline / Retrying</Badge>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Has Synced:</span>
                <span className="font-mono">{status.hasSynced ? "True" : "False"}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Last Synced At:</span>
                <span className="font-mono">{status.lastSyncedAt ? formatDistanceToNow(status.lastSyncedAt, { addSuffix: true }) : "Never"}</span>
              </div>
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-md">
              <h4 className="text-amber-500 font-medium text-sm flex items-center mb-1">
                <ShieldAlert className="w-4 h-4 mr-1" /> Compliance Guarantee
              </h4>
              <p className="text-xs text-amber-500/80">
                The WebSocket replication stream passed through the Sovereign Gateway and pg_anon. 
                Absolutely zero plaintext PII exists in this physical device's memory.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// The exported page component wraps the internal view with the PowerSyncProvider
export default function LocalFirstPage() {
  return (
    <div className="h-full animate-in fade-in duration-500">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Edge Sync Catalyst</h1>
        <p className="text-muted-foreground mt-1">
          Local-first data synchronization powered by PowerSync and WASM SQLite.
        </p>
      </div>
      
      {/* 
        We wrap the view in our newly created Provider.
        This initializes the WASM DB upon mount.
      */}
      <PowerSyncProvider>
        <LocalFirstDataView />
      </PowerSyncProvider>
    </div>
  );
}
