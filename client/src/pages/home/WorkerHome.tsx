export default function WorkerHome() {
  return (
    <div className="mx-auto max-w-[900px] grid gap-4">
      <div className="card p-4"><h4 className="card__title">My Tasks</h4><div id="worker-tasks" /></div>
      <div className="card p-4"><h4 className="card__title">Docs I Need</h4><div id="worker-docs" /></div>
    </div>
  );
}