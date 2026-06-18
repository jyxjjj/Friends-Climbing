import type { Env, Session, User } from '../types';import { getJson, putJson } from './kv';import { randomId } from './crypto';
const MAX=30*24*3600,COOKIE='sid';
export async function createSession(env:Env,username:string){const id=randomId(32),now=Date.now(),s:Session={id,username,createdAt:now,expiresAt:now+MAX*1000};await putJson(env.CLIMB_KV,`sessions:${id}`,s,{expirationTtl:MAX});return id}
export function cookie(id:string){return `${COOKIE}=${id}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX}`}
export function clearCookie(){return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`}
export function sid(req:Request){return /(?:^|; )sid=([^;]+)/.exec(req.headers.get('Cookie')||'')?.[1]}
export async function currentUser(req:Request,env:Env):Promise<User|null>{const id=sid(req);if(!id)return null;const s=await getJson<Session>(env.CLIMB_KV,`sessions:${id}`);if(!s||s.expiresAt<Date.now())return null;s.expiresAt=Date.now()+MAX*1000;await putJson(env.CLIMB_KV,`sessions:${id}`,s,{expirationTtl:MAX});return getJson<User>(env.CLIMB_KV,`users:${s.username}`)}
