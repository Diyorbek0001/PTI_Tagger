'use client';import { useEffect,useState } from 'react';import type { WebRole } from '@/lib/web-auth';
export type CurrentUser={id:string;username:string;displayName:string;role:WebRole;companyAccess?:Array<{company_name:string;can_view:boolean;can_edit:boolean}>};
let cached:CurrentUser|null=null;
export function useCurrentUser(){const [user,setUser]=useState<CurrentUser|null>(cached);useEffect(()=>{if(cached)return;void fetch('/api/auth/me').then(async response=>{if(response.ok){cached=(await response.json()).user;setUser(cached)}})},[]);return user}
export function canManage(user:CurrentUser|null){return user?.role==='ADMIN'||user?.role==='SUPERADMIN'}
