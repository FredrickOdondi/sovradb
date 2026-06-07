"use client";

import { useState } from "react";
import Editor from "@monaco-editor/react";
import { Play, Database, ShieldAlert, CheckCircle2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { executeRawEditorQuery } from "@/app/actions";

export default function SqlEditorPage() {
  const [query, setQuery] = useState("-- Execute federated or temporal queries across the global cluster\nSELECT * FROM sovereign_users\nFOR SYSTEM_TIME AS OF '2026-06-03 10:00:00';");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleExecute = async () => {
    setLoading(true);
    setResult(null);
    const res = await executeRawEditorQuery(query);
    setResult(res);
    setLoading(false);
  };

  return (
    <div className="space-y-6 h-[calc(100vh-6rem)] flex flex-col animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Federated SQL Editor</h1>
          <p className="text-muted-foreground mt-1">
            Execute queries through the Sovereign Gateway. Output is dynamically masked via pg_anon.
          </p>
        </div>
        <button 
          onClick={handleExecute}
          disabled={loading}
          className="flex items-center space-x-2 bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 disabled:opacity-50"
        >
          <Play className="w-4 h-4" />
          <span>{loading ? "Executing..." : "Execute Query"}</span>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6 flex-1 min-h-0">
        <div className="col-span-2 flex flex-col space-y-6">
          <Card className="flex flex-col overflow-hidden h-[60%] shadow-sm">
            <CardHeader className="border-b border-border bg-secondary/20 pb-4">
              <CardTitle className="text-sm font-mono flex items-center text-muted-foreground">
                <Database className="w-4 h-4 mr-2" /> query.sql
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 relative">
              <Editor
                height="100%"
                defaultLanguage="sql"
                theme="vs-dark"
                value={query}
                onChange={(value) => setQuery(value || "")}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  fontFamily: "var(--font-geist-mono)",
                  padding: { top: 16 },
                  scrollBeyondLastLine: false,
                }}
              />
            </CardContent>
          </Card>

          <Card className="flex flex-col h-[40%] overflow-hidden shadow-sm">
            <CardHeader className="py-3 border-b border-border bg-secondary/20">
              <CardTitle className="text-sm font-medium flex items-center">
                {result?.success ? <CheckCircle2 className="w-4 h-4 text-green-500 mr-2" /> : result ? <AlertCircle className="w-4 h-4 text-red-500 mr-2" /> : null}
                Query Results
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-auto bg-background font-mono text-xs text-muted-foreground">
              {result ? (
                <pre className="p-4">{JSON.stringify(result, null, 2)}</pre>
              ) : (
                <div className="h-full flex items-center justify-center italic opacity-50">Awaiting execution...</div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="col-span-1 h-fit shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center text-primary">
              <ShieldAlert className="w-5 h-5 mr-2" />
              Obfuscation Engine Active
            </CardTitle>
            <CardDescription>
              Your current role is mapped to developer_branch_role.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm">
              <div className="p-3 bg-secondary/50 rounded-md border border-border">
                <p className="font-medium text-foreground mb-1">Masking Applied:</p>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  <li><code className="text-primary">full_name</code> → anon.fake_first_name()</li>
                  <li><code className="text-primary">ssn</code> → FPE Encrypted</li>
                </ul>
              </div>
              <p className="text-xs text-muted-foreground">
                Notice: All FOR SYSTEM_TIME AS OF queries on the history tables will inherently inherit these pg_anon interception rules.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
