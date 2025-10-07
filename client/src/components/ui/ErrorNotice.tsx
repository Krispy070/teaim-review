export default function ErrorNotice({ msg }:{ msg:string }){
  return (
    <div className="text-xs px-2 py-1 border border-red-600 text-red-300 rounded-md bg-red-900/20">
      {msg}
    </div>
  );
}
