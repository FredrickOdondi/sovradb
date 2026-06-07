"use client";

import { useEffect, useState } from "react";
import { PowerSyncContext } from "@powersync/react";
import { setupPowerSync } from "@/lib/powersync/PowerSync";
import { AbstractPowerSyncDatabase } from "@powersync/web";

export default function PowerSyncProvider({ children }: { children: React.ReactNode }) {
  const [powerSync, setPowerSync] = useState<AbstractPowerSyncDatabase | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Only initialize PowerSync in the browser
    if (typeof window !== "undefined") {
      setupPowerSync()
        .then((db) => {
          setPowerSync(db);
        })
        .catch((err) => {
          console.error("Failed to initialize PowerSync:", err);
          setError(err);
        });
    }
  }, []);

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-md">
        Failed to initialize Local-First database. Ensure PowerSync is running locally on port 8080.
        <br />
        Details: {error.message}
      </div>
    );
  }

  if (!powerSync) {
    // Provide a loader while WASM SQLite is bootstrapping
    return (
      <div className="flex flex-col items-center justify-center p-12 text-muted-foreground animate-pulse">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
        Bootstrapping Local Edge Sync Engine (WASM)...
      </div>
    );
  }

  return (
    <PowerSyncContext.Provider value={powerSync}>
      {children}
    </PowerSyncContext.Provider>
  );
}
