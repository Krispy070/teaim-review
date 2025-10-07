import { Button } from "@/components/ui/Button";
import { ExternalIcon } from "@/components/ui/Icon";

export default function OpenButton({ href, label="Open", small=false }:{ href?:string|null; label?:string; small?:boolean }){
  const can = !!href;
  return (
    <Button variant="primary" disabled={!can} className={`${small?"!px-1 !py-0.5":""} flex items-center gap-1`}
      onClick={()=> href && window.open(href, "_blank")}>
      <ExternalIcon /><span className="text-[11px]">{label}</span>
    </Button>
  );
}
