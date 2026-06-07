"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Database, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerTenant, loginTenant } from "@/app/actions";

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [namespace, setNamespace] = useState("");

  const handleLogin = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    setIsLoading(true);
    
    if (isSignUp) {
      const res = await registerTenant(email, password, namespace);
      if (res.success) {
        setTimeout(() => {
          router.push("/studio");
        }, 800);
      } else {
        setIsLoading(false);
        alert("Failed to sign up: " + res.error);
      }
    } else {
      const res = await loginTenant(email, password);
      if (res.success) {
        setTimeout(() => {
          router.push("/studio");
        }, 800);
      } else {
        setIsLoading(false);
        alert("Failed to sign in: " + res.error);
      }
    }
  };

  return (
    <div className="relative h-screen flex-col items-center justify-center md:grid lg:max-w-none lg:grid-cols-2 lg:px-0 animate-in fade-in duration-700">
      
      {/* Left Branding Panel */}
      <div className="relative hidden h-full flex-col bg-muted p-10 text-white lg:flex border-r border-border">
        <div className="absolute inset-0 bg-zinc-950" />
        {/* Glow effect */}
        <div className="absolute inset-0 bg-gradient-to-tr from-orange-500/20 via-blue-500/10 to-transparent opacity-60" />
        
        <div className="relative z-20 flex items-center text-xl font-bold tracking-tight gap-2">
          <div className="h-8 w-8 bg-orange-500 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(249,115,22,0.5)]">
            <Database className="h-5 w-5 text-white" />
          </div>
          SovraDB
        </div>
        
        <div className="relative z-20 mt-auto">
          <blockquote className="space-y-2">
            <p className="text-lg leading-relaxed">
              &ldquo;SovraDB has completely transformed how we handle global data residency. What used to require months of manual sharding logic now happens instantly through the sovereign gateway.&rdquo;
            </p>
            <footer className="text-sm font-semibold text-orange-400">Sofia Davis, CTO at Vercel</footer>
          </blockquote>
        </div>
      </div>

      {/* Right Login Panel */}
      <div className="p-8 h-full flex items-center justify-center bg-background">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          <div className="flex flex-col space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              {isSignUp ? "Create an account" : "Welcome back"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isSignUp ? "Enter your email below to create your account." : "Enter your email below to sign in."}
            </p>
          </div>
          
          <div className="grid gap-6">
            <form onSubmit={handleLogin}>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="email" className="text-left">Email</Label>
                  <Input
                    id="email"
                    placeholder="mike@example.com"
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
                  <Label htmlFor="password" className="text-left">Password</Label>
                  <Input
                    id="password"
                    placeholder="••••••••"
                    type="password"
                    disabled={isLoading}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                {isSignUp && (
                  <div className="grid gap-2">
                    <Label htmlFor="namespace" className="text-left">Tenant Namespace</Label>
                    <Input
                      id="namespace"
                      placeholder="acme-corp"
                      type="text"
                      disabled={isLoading}
                      value={namespace}
                      onChange={(e) => setNamespace(e.target.value)}
                    />
                  </div>
                )}
                <Button type="submit" disabled={isLoading} className="w-full mt-2 font-bold" onClick={handleLogin}>
                  {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isSignUp ? "Sign Up with Email" : "Sign In with Email"}
                </Button>
                
                <div className="text-center text-sm mt-2">
                  <span className="text-muted-foreground">
                    {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
                  </span>
                  <button 
                    type="button"
                    onClick={(e) => { e.preventDefault(); setIsSignUp(!isSignUp); }} 
                    className="text-orange-500 hover:underline font-medium transition-colors"
                  >
                    {isSignUp ? "Sign In" : "Sign Up"}
                  </button>
                </div>
              </div>
            </form>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or continue with
                </span>
              </div>
            </div>
            <Button variant="outline" type="button" disabled={isLoading} onClick={handleLogin} className="w-full hover:bg-secondary">
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <svg
                  className="mr-2 h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
              )}{" "}
              GitHub
            </Button>
          </div>

          <p className="px-8 text-center text-sm text-muted-foreground">
            By clicking continue, you agree to our{" "}
            <Link href="#" className="underline underline-offset-4 hover:text-foreground transition-colors">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="#" className="underline underline-offset-4 hover:text-foreground transition-colors">
              Privacy Policy
            </Link>.
          </p>
          
          <div className="mt-8 flex justify-center border-t border-border pt-6">
             <Link href="/admin/login" className="text-xs font-semibold text-muted-foreground hover:text-orange-500 flex items-center transition-colors">
               Platform Admin Access <ArrowRight className="ml-1 h-3 w-3" />
             </Link>
          </div>
        </div>
      </div>
      
    </div>
  );
}
