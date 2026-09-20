import type {EdgeExtensionBootstrap} from './bootstrap-client';
import {rememberEventId,rememberTicketForEvent} from './event-dedup';
import {rememberPendingRemote} from './pending-remote';
import {sendNotificationReceipt} from './receipts-client';
import {showRedactedToast} from './redacted-toast';
import {changeNotificationState} from './notification-state';
type P={eventId?:string;notification?:{id:string;type:string;title?:string|null;body?:string|null;ticketId:string|null;ticketNumber?:string;payload?:{serviceName?:string}|null}|null};
export async function handleNotificationCreated(input:{payload:P;bootstrap:EdgeExtensionBootstrap;apiBaseUrl:string;accessToken:string}):Promise<void>{
 const n=input.payload.notification;if(!n)return;const eventId=input.payload.eventId??n.id;if(!(await rememberEventId(eventId,input.bootstrap.dedupEnabled)))return;
 await rememberTicketForEvent(eventId,n.ticketId);
 if(n.type==='remote.requested'&&n.ticketId)await rememberPendingRemote(n.ticketId);
 const toast=await import('./redacted-toast'); await toast.showRedactedToast({eventId,type:n.type,ticketNumber:n.ticketNumber,ticketId:n.ticketId,serviceName:n.payload?.serviceName});
 const actionRequired=toast.buildRedactedToast({eventId,type:n.type,ticketNumber:n.ticketNumber,ticketId:n.ticketId,serviceName:n.payload?.serviceName}).actionRequired;
 await changeNotificationState({unread:1,actionRequired:actionRequired?1:0});
 if(input.bootstrap.receiptsEnabled){try{await sendNotificationReceipt({apiBaseUrl:input.apiBaseUrl,accessToken:input.accessToken,notificationId:n.id,eventId,kind:'delivered'});}catch{}}
}