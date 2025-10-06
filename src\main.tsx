import React from "react";
import ReactDOM from "react-dom/client";
import AppRouter from "./router";
import ApiProbe from "./components/ApiProbe";
import SupabaseProbe from "./components/SupabaseProbe";

function Probes() {
  return (
    <div style={{ marginTop: 16 }}>
      <ApiProbe />
      <div style={{ height: 12 }} />
      <SupabaseProbe />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppRouter />
    <Probes />
  </React.StrictMode>
);
