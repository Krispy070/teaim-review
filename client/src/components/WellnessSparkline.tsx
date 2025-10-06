export default function WellnessSparkline({ data }:{ data:{created_at:string;score:number}[] }){
  // newest last for left->right
  const series = data.slice().reverse().map(r=> Number(r.score||0));
  // 3-point moving average smoothing
  const smooth = series.map((v,i,arr)=>{
    const a = arr[i-1] ?? v, b = v, c = arr[i+1] ?? v;
    return Math.round(((a+b+c)/3)*100)/100;
  });
  return (
    <div className="h-[60px] flex items-end gap-1">
      {smooth.map((v,i)=>(
        <div key={i} title={`${v}`} style={{
          height: `${(v/5)*60}px`, width:'5px', background:'var(--brand-accent)', opacity:.85
        }}/>
      ))}
    </div>
  );
}