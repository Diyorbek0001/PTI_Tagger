import { db } from '@/lib/database';
import type { WebRole } from '@/lib/web-auth';

export type CompanyPermission = { company_name: string; can_view: boolean; can_edit: boolean };

export async function getCompanyPermissions(userId: string): Promise<CompanyPermission[]> {
  const { rows } = await db.query<CompanyPermission>(
    `select a.company_name, a.can_view, a.can_edit
       from web_user_company_access a join companies c on c.name=a.company_name
      where a.user_id=$1 order by lower(a.company_name)`, [userId]);
  return rows;
}

export async function companyNamesForUser(userId: string, role: WebRole, mode: 'view' | 'edit' = 'view') {
  if (role === 'SUPERADMIN') {
    const { rows } = await db.query<{ name: string }>('select name from companies where is_active order by lower(name)');
    return rows.map(row => row.name);
  }
  const column = mode === 'edit' ? 'can_edit' : 'can_view';
  const { rows } = await db.query<{ company_name: string }>(
    `select a.company_name from web_user_company_access a join companies c on c.name=a.company_name
      where a.user_id=$1 and a.${column} order by lower(a.company_name)`, [userId]);
  return rows.map(row => row.company_name);
}

export async function canAccessCompany(userId: string, role: WebRole, company: string, mode: 'view' | 'edit' = 'view') {
  if (role === 'SUPERADMIN') return true;
  const column = mode === 'edit' ? 'can_edit' : 'can_view';
  const { rowCount } = await db.query(
    `select 1 from web_user_company_access a join companies c on c.name=a.company_name
      where a.user_id=$1 and a.company_name=$2 and a.${column} and c.is_active`, [userId, company]);
  return Boolean(rowCount);
}

export async function canAccessUnit(userId: string, role: WebRole, unitId: string, mode: 'view' | 'edit' = 'view') {
  if (role === 'SUPERADMIN') return true;
  const column = mode === 'edit' ? 'can_edit' : 'can_view';
  const { rowCount } = await db.query(
    `select 1 from units u join web_user_company_access a on a.company_name=u.company
      join companies c on c.name=a.company_name
      where u.id=$1 and a.user_id=$2 and a.${column} and c.is_active`, [unitId, userId]);
  return Boolean(rowCount);
}
