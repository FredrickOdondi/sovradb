"use client";

import { useState, useEffect } from "react";

import { Home, Database, Shield, GitBranch, TerminalSquare, Table2, Server, Activity, Globe, ShieldAlert, Settings, Sun, Moon, LogOut, Zap, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter
} from "@/components/ui/sidebar";

const studioItems = [
  { title: "Global Overview", url: "/studio", icon: Home },
  { title: "Table Explorer", url: "/studio/tables", icon: Table2 },
  { title: "Edge Sync Catalyst", url: "/studio/local-first", icon: Zap },
  { title: "Federated SQL Editor", url: "/studio/sql", icon: TerminalSquare },
  { title: "Geo-Partition ERD", url: "/studio/schema", icon: Database },
  { title: "Temporal Branching", url: "/studio/branches", icon: GitBranch },
  { title: "Obfuscation Rules", url: "/studio/rules", icon: Shield },
  { title: "Project Settings", url: "/studio/settings", icon: Settings },
];

const adminItems = [
  { title: "Platform Telemetry", url: "/admin", icon: Server },
  { title: "Sovereign Nodes", url: "/admin/nodes", icon: Globe },
  { title: "Tenant Traffic", url: "/admin/traffic", icon: Activity },
  { title: "Platform Admins", url: "/admin/admins", icon: Users },
  { title: "FPE Vaults", url: "/admin/vaults", icon: ShieldAlert },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const isStudio = pathname.startsWith("/studio");
  const isAdmin = pathname.startsWith("/admin");
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // If we are on the root selector page, don't show the sidebar, or show a generic one.
  if (!isStudio && !isAdmin) {
    return null;
  }

  const items = isAdmin ? adminItems : studioItems;
  const title = isAdmin ? "SovraDB Admin" : "SovraDB Studio";
  const iconBg = isAdmin ? "bg-orange-500" : "bg-orange-500";
  const label = isAdmin ? "Platform Infrastructure" : "Tenant Control Plane";

  return (
    <Sidebar variant="inset" collapsible="icon" className="border-r border-border/50">
      <SidebarHeader className="p-4 flex flex-row items-center space-x-2">
        <div className={`h-8 w-8 rounded-md ${iconBg} flex items-center justify-center`}>
          {isAdmin ? (
            <Server className="text-orange-50 text-white h-5 w-5" />
          ) : (
            <Database className="text-white h-5 w-5" />
          )}
        </div>
        <span className="font-bold text-lg tracking-tight group-data-[collapsible=icon]:hidden truncate">
          <span className={isAdmin ? "text-orange-500" : "text-orange-500"}>SovraDB</span>{" "}
          {isAdmin ? "Admin" : "Studio"}
        </span>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground/70 uppercase tracking-wider text-xs">
            {label}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const isActive = pathname === item.url || pathname.startsWith(item.url + "/");
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton tooltip={item.title} isActive={isActive}>
                      <Link href={item.url} className={`flex items-center space-x-3 w-full transition-colors ${isActive ? (isAdmin ? 'text-orange-500' : 'text-primary') : 'text-muted-foreground hover:text-foreground'}`}>
                        <item.icon className="w-4 h-4" />
                        <span className="font-medium">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-border/50 flex flex-col gap-2">
         <button 
           onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
           className="flex items-center gap-3 text-sm text-muted-foreground hover:text-foreground w-full p-2 rounded-md hover:bg-secondary/80 transition-colors"
         >
           {mounted ? (
             resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />
           ) : (
             <span className="h-4 w-4" />
           )}
           <span className="font-medium group-data-[collapsible=icon]:hidden truncate">
             {mounted ? (resolvedTheme === "dark" ? "Light Mode" : "Dark Mode") : "Toggle Theme"}
           </span>
         </button>
         <Link href={isAdmin ? "/admin/login" : "/"} className="text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-3 w-full p-2 rounded-md hover:bg-red-500/10 hover:text-red-500 transition-colors">
           <LogOut className="h-4 w-4 shrink-0" />
           <span className="group-data-[collapsible=icon]:hidden">Log Out</span>
         </Link>
      </SidebarFooter>
    </Sidebar>
  );
}
