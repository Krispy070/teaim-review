import AdminPanel from "@/pages/AdminPanel";
import React from "react";
import { createBrowserRouter, RouterProvider, Outlet, NavLink } from "react-router-dom";
import TestLibrary from "@/pages/TestLibrary";

function Nav() {
  const base: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, textDecoration: "none", color: "#111", background:"#eee" };
  const active = ({ isActive }: { isActive: boolean }) => ({ ...base, background: isActive ? "#c7d2fe" : "#eee" });
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      <NavLink to="/admin" style={active}>Admin</NavLink>
      <NavLink to="/pm" style={active}>Project Manager</NavLink>
      <NavLink to="/csuite" style={active}>C-suite</NavLink>
      <NavLink to="/functional" style={active}>Functional Lead</NavLink>
      <NavLink to="/data" style={active}>Data Lead</NavLink>
      <NavLink to="/worker" style={active}>Worker</NavLink>
      <NavLink to="/testing" style={active}>Testing</NavLink>
    </div>
  );
}

function Layout() {
  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h2 style={{ marginTop: 0 }}>TEAIM local</h2>
      <Nav />
      <Outlet />
    </div>
  );
}

function Card({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", padding: 16, borderRadius: 12, marginBottom: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{title}</div>
      <div>{children}</div>
    </div>
  );
}

// Simple role pages (placeholders)
const Admin = () => (<AdminPanel />);

const PM = () => (<><Card title="My Projects">Health • Milestones</Card><Card title="Testing">Create test case • Library</Card></>);
const Csuite = () => (<><Card title="Portfolio">KPIs • Budget</Card><Card title="Reports">Status deck • Risks</Card></>);
const Functional = () => (<><Card title="Module Work">HCM/Payroll/Fin tasks</Card><Card title="UAT">Assigned tests • Defects</Card></>);
const DataLead = () => (<><Card title="Data Loads">Templates • Results</Card><Card title="Validation">Recon • Issues</Card></>);
const Worker = () => (<><Card title="My Tasks">Assigned items</Card><Card title="Resources">Guides • FAQs</Card></>);

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Admin /> },         // default
      { path: "admin", element: <Admin /> },
      { path: "pm", element: <PM /> },
      { path: "csuite", element: <Csuite /> },
      { path: "functional", element: <Functional /> },
      { path: "data", element: <DataLead /> },
      { path: "worker", element: <Worker /> },
      { path: "testing", element: <TestLibrary /> },   // <— your new page
    ],
  },
]);

export default function AppRouter() {
  return <RouterProvider router={router} />;
}
