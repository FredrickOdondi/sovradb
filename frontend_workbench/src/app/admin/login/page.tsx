"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Server, ShieldAlert, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { loginPlatformAdmin } from "@/app/actions";

export default function AdminLoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    setIsLoading(true);

    const res = await loginPlatformAdmin(email, password);
    if (res.success) {
      toast.success("Authentication Successful");
      router.push("/admin");
    } else {
      toast.error("Access Denied", { description: res.error });
      setIsLoading(false);
    }
  };

  return (
    <div className="relative h-screen flex-col items-center justify-center md:grid lg:max-w-none lg:grid-cols-2 lg:px-0 animate-in fade-in duration-700">
      
      {/* Left Branding Panel */}
      <div className="relative hidden h-full flex-col bg-muted p-10 text-white lg:flex border-r border-border">
        <div className="absolute inset-0 bg-zinc-950" />
        {/* Glow effect */}
        <div className="absolute inset-0 bg-gradient-to-tr from-orange-500/30 via-red-500/10 to-transparent opacity-60" />
        
        <div className="relative z-20 flex items-center text-xl font-bold tracking-tight gap-2">
          <div className="h-8 w-8 bg-orange-500 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(249,115,22,0.5)]">
            <Server className="h-5 w-5 text-white" />
          </div>
          SovraDB Platform Admin
        </div>
        
        <div className="relative z-20 mt-auto">
          <div className="space-y-4 mb-8 bg-black/40 backdrop-blur-md border border-orange-500/20 p-6 rounded-xl">
             <div className="flex items-center gap-3 text-orange-400 font-semibold mb-2">
               <ShieldAlert className="h-5 w-5" />
               Restricted Access
             </div>
             <p className="text-sm text-zinc-300 leading-relaxed">
               You are accessing the global infrastructure control plane. All actions, including geo-partitioning configurations and key rotations, are strictly logged and audited.
             </p>
          </div>
        </div>
      </div>

      {/* Right Login Panel */}
      <div className="p-8 h-full flex items-center justify-center bg-background">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          <div className="flex flex-col space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              Admin Authentication
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter your elevated credentials to proceed.
            </p>
          </div>
          
          <div className="grid gap-6">
            <form onSubmit={handleLogin}>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="email" className="text-left">Admin ID</Label>
                  <Input
                    id="email"
                    placeholder="sysadmin@sovradb.internal"
                    type="email"
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect="off"
                    disabled={isLoading}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password" className="text-left">Master Password</Label>
                  <Input
                    id="password"
                    placeholder="••••••••"
                    type="password"
                    disabled={isLoading}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={isLoading} className="w-full mt-4 font-bold" onClick={handleLogin}>
                  {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Authenticate via SSO
                </Button>
              </div>
            </form>
          </div>
          
          <div className="mt-8 flex justify-center border-t border-border pt-6">
             <Link href="/" className="text-xs font-semibold text-muted-foreground hover:text-orange-500 flex items-center transition-colors">
               <ArrowLeft className="mr-1 h-3 w-3" /> Return to Developer Login
             </Link>
          </div>
        </div>
      </div>
      
    </div>
  );
}
