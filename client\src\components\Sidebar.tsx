import { 
  LayoutDashboard, 
  Calendar, 
  Workflow, 
  Zap, 
  CheckSquare, 
  FileText, 
  GraduationCap, 
  Bug, 
  Truck, 
  BarChart3, 
  Heart, 
  DollarSign 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  pmExecOnly?: boolean;
}

const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "#dashboard" },
  { id: "timeline", label: "Timeline", icon: Calendar, href: "#timeline" },
  { id: "workstreams", label: "Workstreams", icon: Workflow, href: "#workstreams" },
  { id: "integrations", label: "Integrations & Tech", icon: Zap, href: "#integrations" },
  { id: "actions", label: "Actions", icon: CheckSquare, href: "#actions" },
  { id: "documents", label: "Documents", icon: FileText, href: "#documents" },
  { id: "training", label: "Training", icon: GraduationCap, href: "#training" },
  { id: "testing", label: "Testing", icon: Bug, href: "#testing" },
  { id: "logistics", label: "Logistics", icon: Truck, href: "#logistics" },
  { id: "reporting", label: "Data & Reporting", icon: BarChart3, href: "#reporting" },
  { id: "wellness", label: "Team Wellness", icon: Heart, href: "#wellness", pmExecOnly: true },
  { id: "financials", label: "Financials", icon: DollarSign, href: "#financials" },
];

export default function Sidebar() {
  const [activeItem, setActiveItem] = useState("dashboard");
  const userRole = "pm"; // TODO: Get from auth context

  const isVisible = (item: NavItem) => {
    if (item.pmExecOnly) {
      return userRole === "pm" || userRole === "owner" || userRole === "admin";
    }
    return true;
  };

  return (
    <aside className="w-64 bg-card border-r border-border">
      <nav className="p-4 space-y-2">
        {navItems.filter(isVisible).map((item) => {
          const Icon = item.icon;
          const isActive = activeItem === item.id;
          
          return (
            <a
              key={item.id}
              href={item.href}
              onClick={() => setActiveItem(item.id)}
              className={cn(
                "nav-link flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                isActive ? "active" : ""
              )}
              data-testid={`nav-${item.id}`}
            >
              <Icon className="w-5 h-5" />
              {item.label}
            </a>
          );
        })}
      </nav>
    </aside>
  );
}
