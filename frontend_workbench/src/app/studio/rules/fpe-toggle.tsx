"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toggleFpeStatus } from "@/app/actions";

export default function FpeToggle({ tenantId, initialStatus }: { tenantId: string, initialStatus: boolean }) {
  const [enabled, setEnabled] = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleToggle = async () => {
    setLoading(true);
    const newStatus = !enabled;
    const res = await toggleFpeStatus(tenantId, newStatus);
    if (res.success) {
      setEnabled(newStatus);
      router.refresh();
    } else {
      alert("Failed to toggle FPE: " + res.error);
    }
    setLoading(false);
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider transition-colors ${
        enabled 
          ? "bg-primary/20 text-primary hover:bg-primary/30" 
          : "border border-border text-muted-foreground hover:bg-secondary"
      }`}
    >
      {loading ? "Updating..." : enabled ? "Enabled (Click to Disable)" : "Disabled (Click to Enable)"}
    </button>
  );
}
