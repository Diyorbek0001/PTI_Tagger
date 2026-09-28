import { NextResponse } from 'next/server'; import { getDashboardData } from '@/services/dashboard';
export async function GET(){try{return NextResponse.json(await getDashboardData());}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to load dashboard'},{status:500});}}
