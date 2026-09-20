const key='pendingRemoteTicketIds';
export async function rememberPendingRemote(id:string):Promise<void>{const c=await readPendingRemoteTicketIds();if(!c.includes(id))await chrome.storage.session.set({[key]:[...c,id]});}
export async function forgetPendingRemote(id:string):Promise<void>{await chrome.storage.session.set({[key]:(await readPendingRemoteTicketIds()).filter(x=>x!==id)});}
export async function mergePendingRemoteTicketIds(ids:readonly string[]):Promise<void>{await chrome.storage.session.set({[key]:[...new Set([...(await readPendingRemoteTicketIds()),...ids])]});}
export async function readPendingRemoteTicketIds():Promise<readonly string[]>{const v=(await chrome.storage.session.get(key))[key];return Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'):[]}
export async function clearPendingRemoteTicketIds():Promise<void>{await chrome.storage.session.remove(key)}