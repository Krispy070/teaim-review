import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function SupabaseProbe() {
  const [out, setOut] = useState<any>(null);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const s = await supabase.auth.getSession();
        setOut({ session: !!s.data?.session, url: import.meta.env.VITE_SUPABASE_URL });
      } catch (e:any) { setErr(e?.message || String(e)); }
    })();
  }, []);

  return (
    <pre style={{ background:"#0b0b0c", color:"#60a5fa", padding:12, borderRadius:8 }}>
      {err ? `SUPABASE ERROR: ${err}` : JSON.stringify(out, null, 2)}
    </pre>
  );
}
