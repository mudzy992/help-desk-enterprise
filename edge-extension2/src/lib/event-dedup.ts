const key='edgeEventState'; const max=500;
type State={seen:string[];ticketByEvent:Record<string,string|null>};
async function read():Promise<State>{const v=(await chrome.storage.session.get(key))[key] as State|undefined;return {seen:Array.isArray(v?.seen)?v.seen:[],ticketByEvent:v?.ticketByEvent&&typeof v.ticketByEvent==='object'?v.ticketByEvent:{}}}
export async function rememberEventId(id:string,enabled:boolean):Promise<boolean>{
  if(!enabled)return true; const s=await read(); if(!id.trim()||s.seen.includes(id))return false;
  s.seen.push(id); if(s.seen.length>max){const old=s.seen.shift();if(old)delete s.ticketByEvent[old];} await chrome.storage.session.set({[key]:s}); return true;
}
export async function rememberTicketForEvent(id:string,ticket:string|null):Promise<void>{const s=await read();s.ticketByEvent[id]=ticket;await chrome.storage.session.set({[key]:s});}
export async function ticketIdForEvent(id:string):Promise<string|null>{return (await read()).ticketByEvent[id]??null}
export async function resetEventDedup():Promise<void>{await chrome.storage.session.remove(key)}