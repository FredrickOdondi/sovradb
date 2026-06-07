"use client";

import { usePathname } from "next/navigation";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";

export function ClientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/" || pathname === "/admin/login";

  if (isLoginPage) {
    return <main className="flex-1">{children}</main>;
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1 overflow-x-hidden relative">
        <div className="absolute top-6 left-6 z-50">
          <SidebarTrigger className="hover:bg-secondary text-muted-foreground hover:text-foreground" />
        </div>
        <div className="p-6 pl-14">
          {children}
        </div>
      </main>
    </SidebarProvider>
  );
}
