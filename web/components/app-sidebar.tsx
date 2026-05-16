"use client"

import * as React from "react"
import {
  LayoutDashboard, BarChart2, Plane, ClipboardList, TrendingUp,
  Upload, FileText, CreditCard, AlertTriangle, Users, BookOpen,
  Bell, Settings, Shield, AudioWaveform, Command, GalleryVerticalEnd,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail,
} from "@/components/ui/sidebar"

const data = {
  user: {
    name: "Admin User",
    email: "admin@cargo.in",
    avatar: "",
  },
  teams: [
    { name: "Cargo ERP", logo: Plane, plan: "Domestic Billing" },
    { name: "Branch 2", logo: AudioWaveform, plan: "Startup" },
    { name: "Branch 3", logo: Command, plan: "Free" },
  ],
  navMain: [
    {
      title: "Overview",
      url: "#",
      icon: LayoutDashboard,
      isActive: true,
      items: [
        { title: "Dashboard", url: "/dashboard" },
        { title: "Analytics", url: "/dashboard/analytics" },
      ],
    },
    {
      title: "Bookings",
      url: "#",
      icon: Plane,
      items: [
        { title: "AWB Bookings", url: "/dashboard/bookings/awb" },
        { title: "Docket Bookings", url: "/dashboard/bookings/dockets" },
      ],
    },
    {
      title: "Rates & Import",
      url: "#",
      icon: TrendingUp,
      items: [
        { title: "Import Wizard", url: "/dashboard/import" },
      ],
    },
    {
      title: "Finance",
      url: "#",
      icon: FileText,
      items: [
        { title: "All Invoices", url: "/dashboard/invoices" },
        { title: "New Invoice", url: "/dashboard/invoices/new" },
        { title: "Payments", url: "/dashboard/payments" },
        { title: "Outstanding & Aging", url: "/dashboard/outstanding" },
        { title: "Reports", url: "/dashboard/reports" },
      ],
    },
    {
      title: "Master Data",
      url: "#",
      icon: Users,
      items: [
        { title: "Parties / Customers", url: "/dashboard/parties" },
        { title: "Audit Log", url: "/dashboard/audit" },
      ],
    },
    {
      title: "System",
      url: "#",
      icon: Settings,
      items: [
        { title: "Notifications", url: "/dashboard/notifications" },
        { title: "Settings", url: "/dashboard/settings" },
        { title: "Admin & RBAC", url: "/dashboard/admin" },
      ],
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
