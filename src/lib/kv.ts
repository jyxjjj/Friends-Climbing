export async function getJson<T>(kv:KVNamespace,key:string):Promise<T|null>{return kv.get<T>(key,'json')}
export async function putJson(kv:KVNamespace,key:string,value:unknown,opts?:KVNamespacePutOptions){await kv.put(key,JSON.stringify(value),opts)}
export async function listJson<T>(kv:KVNamespace,prefix:string):Promise<T[]>{let cursor: string|undefined;const out:T[]=[];do{const r=await kv.list({prefix,cursor});cursor=r.cursor;await Promise.all(r.keys.map(async k=>{const v=await getJson<T>(kv,k.name);if(v)out.push(v)}));if(r.list_complete)break}while(cursor);return out}
export async function del(kv:KVNamespace,key:string){await kv.delete(key)}
