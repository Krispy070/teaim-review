export default function DataLeadHome() {
  return (
    <div className="mx-auto max-w-[1320px] grid gap-4">
      <div className="grid md:grid-cols-3 gap-4">
        <div className="card p-4"><b>Loads</b><div id="data-loads" /></div>
        <div className="card p-4"><b>Defects</b><div id="data-defects" /></div>
        <div className="card p-4"><b>Validation</b><div id="data-validation" /></div>
      </div>
      <div className="card p-4"><h4 className="card__title">Conversion Plan</h4><div id="data-plan" /></div>
    </div>
  );
}