import { Link, useLocation } from "wouter";
import React from "react";
import "./navbar.css";

export default function NavBar() {
  const [location] = useLocation();
  
  const pill = (path: string) => {
    const isActive = location === path;
    return isActive ? "nav-pill active" : "nav-pill";
  };

  return (
    <div className="nav-bar">
      <Link href="/admin" className={pill("/admin")}>Admin</Link>
      <Link href="/pm" className={pill("/pm")}>Project Manager</Link>
      <Link href="/csuite" className={pill("/csuite")}>C-suite</Link>
      <Link href="/functional" className={pill("/functional")}>Functional Lead</Link>
      <Link href="/data" className={pill("/data")}>Data Lead</Link>
      <Link href="/worker" className={pill("/worker")}>Worker</Link>
      <Link href="/testing" className={pill("/testing")}>Testing</Link>
    </div>
  );
}
