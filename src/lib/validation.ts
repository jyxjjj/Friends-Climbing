export const validUser=(u:string)=>/^[A-Za-z0-9]{4,32}$/.test(u);export const validPass=(p:string)=>p.length>=12;
export async function json(req:Request){return await req.json().catch(()=>({})) as any}
export const ok=(data:any=undefined,init:ResponseInit={})=>Response.json({ok:true,data},init);export const err=(message:string,status=400)=>Response.json({ok:false,error:message},{status});
export function requireFields(o:any,fs:string[]){for(const f of fs)if(o[f]===undefined||o[f]==='')throw new Error(`${f} 必填`)}
