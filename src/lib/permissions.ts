import type { User } from '../types';
export type ResourceType =
  | 'users'
  | 'members'
  | 'templates'
  | 'plans'
  | 'records'
  | 'images'
  | 'export'
  | 'dashboard';
const owned = (o: any, u: User) => !!o && o.createdBy === u.username;
export function canRead(_u: User, _type: ResourceType, _o?: any) {
  return true;
}
export function canCreate(u: User, type: ResourceType, parent?: any) {
  if (u.role === 'Owner') return true;
  if (type === 'plans' || type === 'records') return true;
  if (type === 'images') return owned(parent, u);
  return false;
}
export function canUpdate(u: User, type: ResourceType, o?: any) {
  if (u.role === 'Owner') return true;
  if (type === 'plans' || type === 'records') return owned(o, u);
  if (type === 'images') return owned(o, u);
  return false;
}
export function canDelete(u: User, type: ResourceType, o?: any) {
  return canUpdate(u, type, o);
}
