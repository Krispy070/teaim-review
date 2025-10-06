import { useEffect, useState } from "react";
import { pingApi } from "@/lib/api";

export default function ApiProbe() {
  const [out, setOut] = useState<any>(null);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    (async () => {
      try { setOut(await pingApi()); }
      catch (e:any) { setErr(e?.message || String(e)); }
    })();
  }, []);

  return (
    <pre style={{ background:"#0b0b0c", color:"#10ff70", padding:12, borderRadius:8 }}>
      {err ? `ERROR: ${err}` : JSON.stringify(out, null, 2)}
    </pre>
  );
}
