const tokenSessionKey='helpdeskAccessToken';const apiBaseUrlLocalKey='helpdeskApiBaseUrl';let memoryToken:string|null=null;
export async function readAccessToken(){if(memoryToken)return memoryToken;const v=(await chrome.storage.session.get(tokenSessionKey))[tokenSessionKey];if(typeof v!=='string'||!v)return null;memoryToken=v;return v}
export async function writeAccessToken(v:string){memoryToken=v;await chrome.storage.session.set({[tokenSessionKey]:v})}
export async function clearAccessToken(){memoryToken=null;await chrome.storage.session.remove(tokenSessionKey)}
export async function readApiBaseUrl(){const v=(await chrome.storage.local.get(apiBaseUrlLocalKey))[apiBaseUrlLocalKey];return typeof v==='string'?v.replace(/\/$/,''):''}
export async function writeApiBaseUrl(v:string){await chrome.storage.local.set({[apiBaseUrlLocalKey]:v.replace(/\/$/,'')})}