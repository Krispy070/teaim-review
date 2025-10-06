export default function AdminHome() {
  return (
    <div className="mx-auto max-w-[1320px] grid gap-4">
      <div className="card p-4">
        <h3 className="card__title">System Overview</h3>
        <ul className="grid md:grid-cols-3 gap-3 mt-3">
          <li className="card p-4"><b>Customers</b><div id="sys-customers" /></li>
          <li className="card p-4"><b>Active Projects</b><div id="sys-projects" /></li>
          <li className="card p-4"><b>Users</b><div id="sys-users" /></li>
        </ul>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4"><h4 className="card__title">Revenue & Projections</h4><div id="sys-revenue" /></div>
        <div className="card p-4"><h4 className="card__title">Feedback Stream</h4><div id="sys-feedback" /></div>
      </div>
      <div className="card p-4"><h4 className="card__title">Ingestion / LLM Health</h4><div id="sys-health" /></div>
    </div>
  );
}