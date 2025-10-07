export default function PmHome() {
  return (
    <div className="mx-auto max-w-[1320px] grid gap-4">
      <div className="grid md:grid-cols-4 gap-3">
        <div className="card p-4"><b>Risks Open</b><div id="pm-risks" /></div>
        <div className="card p-4"><b>Overdue Actions</b><div id="pm-actions" /></div>
        <div className="card p-4"><b>Sign-offs Pending</b><div id="pm-signoffs" /></div>
        <div className="card p-4"><b>Team Wellness</b><div id="pm-wellness" /></div>
      </div>
      <div className="card p-4"><h4 className="card__title">Staged Items Requiring Review</h4><div id="pm-review-queue" /></div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4"><h4 className="card__title">Timeline</h4><div id="pm-timeline" /></div>
        <div className="card p-4"><h4 className="card__title">Reports</h4><div id="pm-reports" /></div>
      </div>
    </div>
  );
}