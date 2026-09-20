import {helpdeskRequest} from './helpdesk-http';
export const unreadAlarmName='helpdesk-unread-poll';
export type NotificationListItem={id:string;type:string;ticketId:string|null;ticketNumber?:string;payload?:{serviceName?:string}|null};
export async function fetchUnreadNotifications(input:{apiBaseUrl:string;accessToken:string}):Promise<NotificationListItem[]>{const r=await helpdeskRequest<{items:NotificationListItem[]}>({apiBaseUrl:input.apiBaseUrl,accessToken:input.accessToken,path:'/notifications?unreadOnly=true'});return r.items;}
export async function scheduleUnreadPolling(seconds:number):Promise<void>{await chrome.alarms.create(unreadAlarmName,{periodInMinutes:Math.max(0.5,seconds/60)});}
export async function stopUnreadPolling():Promise<void>{await chrome.alarms.clear(unreadAlarmName);}
