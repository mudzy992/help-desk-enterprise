const staffOnly=new Set(['INTERNAL_NOTE','SYSTEM_EVENT','APPROVAL_DECISION']);
export type ExtensionVisibleMessage={id:string;type:string;body:string;createdAt:string};
export function filterExtensionChatMessages(m:readonly ExtensionVisibleMessage[],max:number){const v=m.filter(x=>!staffOnly.has(x.type));return v.length<=max?v:v.slice(v.length-max);}
export function isOpenRequesterTicket(i:{requesterId:string;subjectId:string;status:string}){return i.requesterId===i.subjectId&&i.status!=='CLOSED'&&i.status!=='ARCHIVED';}