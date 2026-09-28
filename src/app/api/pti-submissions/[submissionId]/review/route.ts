import { NextResponse } from 'next/server';
import { Bot } from 'grammy';
import { z } from 'zod';
import { formatPtiReference } from '@/lib/pti-reference';
import { completePtiReview, defectInputSchema } from '@/services/defects';
import { requestIp, webActor } from '@/services/audit';
import { requireWebRole } from '@/services/web-users';

const reviewSchema=z.object({
  decision:z.enum(['approved','resend_requested']),note:z.string().trim().max(2000).optional().default(''),
  reviewedBy:z.string().trim().min(1).max(120).optional().default('Fleet Team'),
  defects:z.array(defectInputSchema).max(20).optional().default([]),
  editReviewed:z.boolean().optional().default(false),
}).superRefine((value,context)=>{if(value.decision==='resend_requested'&&!value.note)context.addIssue({code:'custom',path:['note'],message:'Add a note explaining what needs to be resent.'})});

export async function POST(request:Request,{params}:{params:Promise<{submissionId:string}>}){
  try{
    const auth=await requireWebRole(request,['ADMIN','SUPERADMIN']);if('response'in auth)return auth.response;
    const input=reviewSchema.parse(await request.json());const {submissionId}=await params;
    const beforeCommit=input.decision==='resend_requested'?async(submission:Record<string,unknown>)=>{
      const token=process.env.TELEGRAM_BOT_TOKEN;if(!token)throw new Error('TELEGRAM_BOT_TOKEN is not configured');
      await new Bot(token).api.sendMessage(String(submission.source_chat_id),`⚠️ PTI resend requested\n\nPTI ID: ${formatPtiReference(String(submission.pti_number))}\nUnit: ${submission.unit_number}\nFleet note: ${input.note}\n\nPlease send a new photo or video and reply to it with /pti.`,{reply_parameters:{message_id:Number(submission.source_message_id),allow_sending_without_reply:true}});
    }:undefined;
    const result=await completePtiReview({submissionId,decision:input.decision,note:input.note,reviewedBy:auth.user.display_name,defects:input.defects,actor:webActor(auth.user),ipAddress:requestIp(request),beforeCommit,editReviewed:input.editReviewed});
    return NextResponse.json({submission:result.submission,defects:result.defects});
  }catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:error.issues[0]?.message??'Invalid review'},{status:400});const message=error instanceof Error?error.message:'Unable to review PTI submission';return NextResponse.json({error:message},{status:message.includes('no longer')?409:500});}
}
