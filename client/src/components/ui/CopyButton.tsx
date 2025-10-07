import { Button } from "@/components/ui/Button";
import { CopyIcon } from "@/components/ui/Icon";
import { pushToast } from "@/lib/toast";

export default function CopyButton({ text, label="Copy", small=false }:{ text:string; label?:string; small?:boolean }){
  return (
    <Button variant="ghost" className={`flex items-center gap-1 ${small?"!px-1 !py-0.5":""}`}
      onClick={async()=>{ await navigator.clipboard.writeText(text||""); pushToast({ type:"success", message:"Copied" }); }}>
      <CopyIcon /><span className="text-[11px]">{label}</span>
    </Button>
  );
}
