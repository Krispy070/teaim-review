export default function Spinner({ small=false }:{ small?: boolean }){
  const size = small ? "w-3 h-3" : "w-5 h-5";
  return (
    <span className={`${size} inline-block border border-slate-500 border-t-transparent rounded-full animate-spin`} />
  );
}
