export default function FunctionalHome() {
  return (
    <div className="mx-auto max-w-[1320px] grid gap-4">
      <div className="card p-4"><h4 className="card__title">My Area (BPs & Actions)</h4><div id="fl-areas" /></div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4"><h4 className="card__title">Pending Tests</h4><div id="fl-tests" /></div>
        <div className="card p-4"><h4 className="card__title">Artifacts</h4><div id="fl-artifacts" /></div>
      </div>
    </div>
  );
}