export default function ExecCustomerHome() {
  return (
    <div className="mx-auto max-w-[1320px] grid gap-4">
      <div className="grid md:grid-cols-4 gap-3">
        <div className="card p-4"><b>Milestone RAG</b><div id="exec-rag" /></div>
        <div className="card p-4"><b>Budget vs Burn</b><div id="exec-burn" /></div>
        <div className="card p-4"><b>Top Risks</b><div id="exec-risks" /></div>
        <div className="card p-4"><b>Next Gates</b><div id="exec-gates" /></div>
      </div>
      <div className="card p-4"><h4 className="card__title">Weekly Digest</h4><div id="exec-digest" /></div>
      <div className="card p-4"><h4 className="card__title">Exports</h4><button className="k-btn">Download PPTX</button></div>
    </div>
  );
}