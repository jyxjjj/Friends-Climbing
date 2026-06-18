import type { PasswordHash } from '../types';
const te=new TextEncoder();
export const b64u=(b:ArrayBuffer|Uint8Array)=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export const ub64=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'=')),c=>c.charCodeAt(0));
export async function hashPassword(password:string):Promise<PasswordHash>{const salt=crypto.getRandomValues(new Uint8Array(32));const key=await crypto.subtle.importKey('raw',te.encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:524288},key,512);return{algorithm:'PBKDF2',digest:'SHA-256',iterations:524288,salt:b64u(salt),derivedKey:b64u(bits),derivedKeyLength:64};}
export async function verifyPassword(password:string,h:PasswordHash){const key=await crypto.subtle.importKey('raw',te.encode(password),'PBKDF2',false,['deriveBits']);const bits=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:ub64(h.salt),iterations:h.iterations},key,h.derivedKeyLength*8));return timingSafeEqual(bits,ub64(h.derivedKey));}
export function timingSafeEqual(a:Uint8Array,b:Uint8Array){let diff=a.length^b.length;const n=Math.max(a.length,b.length);for(let i=0;i<n;i++)diff|=(a[i]??0)^(b[i]??0);return diff===0;}
export function randomId(bytes=32){const a=crypto.getRandomValues(new Uint8Array(bytes));return b64u(a)}
