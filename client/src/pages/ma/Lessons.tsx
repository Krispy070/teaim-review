import { getProjectId } from "@/lib/project";
import { authFetch } from "@/lib/authFetch";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function MALessons() {
  const pid = getProjectId();
  const [items, setItems] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [whatHappened, setWhatHappened] = useState("");
  const [recommendation, setRecommendation] = useState("");

  async function load() {
    const r = await authFetch(`/api/ma/lessons?projectId=${encodeURIComponent(pid!)}`);
    const j = await r.json(); 
    setItems(j.items || []);
  }
  
  useEffect(() => { 
    load(); 
  }, [pid]);

  async function add() {
    const r = await authFetch(`/api/ma/lessons`, {
      method: "POST", 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: pid, title, category, whatHappened, recommendation })
    });
    if (r.ok) { 
      setTitle(""); 
      setCategory("");
      setWhatHappened("");
      setRecommendation("");
      load(); 
    }
  }

  return (
    
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Lessons Learned</h1>
        <div className="space-y-2">
          <Input 
            data-testid="input-lesson-title"
            placeholder="Lesson Title" 
            value={title} 
            onChange={e => setTitle(e.target.value)} 
          />
          <Input 
            data-testid="input-lesson-category"
            placeholder="Category (people, process, tech, vendor, cutover)" 
            value={category} 
            onChange={e => setCategory(e.target.value)} 
          />
          <Textarea 
            data-testid="input-lesson-what-happened"
            placeholder="What Happened?" 
            value={whatHappened} 
            onChange={e => setWhatHappened(e.target.value)} 
          />
          <Textarea 
            data-testid="input-lesson-recommendation"
            placeholder="Recommendation" 
            value={recommendation} 
            onChange={e => setRecommendation(e.target.value)} 
          />
          <Button data-testid="button-add-lesson" onClick={add}>Add Lesson</Button>
        </div>
        <ul className="space-y-2">
          {items.map((it: any) => (
            <li 
              key={it.id} 
              data-testid={`lesson-item-${it.id}`}
              className="p-3 border rounded-2xl text-sm"
            >
              <div className="font-medium">{it.title}</div>
              {it.category && <div className="text-xs opacity-50 mt-1">Category: {it.category}</div>}
              {(it.whatHappened || it.what_happened) && <div className="text-xs mt-1">{it.whatHappened || it.what_happened}</div>}
              {it.recommendation && <div className="text-xs opacity-70 mt-1">→ {it.recommendation}</div>}
            </li>
          ))}
          {!items.length && <li className="opacity-70 text-sm">No lessons yet.</li>}
        </ul>
      </div>
    
  );
}
