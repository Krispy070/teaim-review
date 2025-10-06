export default function ExecPartnerHome() {
  return (
    <div className="mx-auto max-w-[1320px] grid gap-4">
      <div className="grid md:grid-cols-4 gap-3">
        <div className="card p-4"><b>Active Customers</b><div id="p-exec-customers" /></div>
        <div className="card p-4"><b>Projects (RAG)</b><div id="p-exec-projects" /></div>
        <div className="card p-4"><b>Resource Utilization</b><div id="p-exec-res" /></div>
        <div className="card p-4"><b>MRR / Pipeline</b><div id="p-exec-rev" /></div>
      </div>
      <div className="card p-4"><h4 className="card__title">Feedback</h4><div id="p-exec-feedback" /></div>
    </div>
  );
}