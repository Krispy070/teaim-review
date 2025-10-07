export default function Skeleton({ w="100%", h=18 }:{ w?:string|number; h?:number }){
  return (
    <div style={{ width:w, height:h }}
      className="rounded-md bg-slate-800/70 animate-pulse" />
  );
}
