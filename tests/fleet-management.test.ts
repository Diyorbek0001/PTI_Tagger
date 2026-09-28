import { describe,expect,it,vi } from 'vitest';
import { calculateCompliance } from '@/services/compliance';
import { defectInputSchema,defectUpdateSchema } from '@/services/defects';
import { defectCategories,defectSeverities,defectStatuses,formatDefectReference } from '@/lib/fleet-constants';
import { detectRepeatGroups } from '@/lib/repeat-detection';
import { endOfWeekDate,startOfMondayWeek,weeksAgoStart } from '@/lib/date-ranges';
import { logAudit } from '@/services/audit';

describe('fleet management domain',()=>{
  it('validates defect creation and its PTI-review fields',()=>{expect(defectInputSchema.parse({category:'Tire',description:'Sidewall damage',severity:'CRITICAL'})).toEqual({category:'Tire',description:'Sidewall damage',severity:'CRITICAL'});expect(()=>defectInputSchema.parse({category:'Tire',description:'',severity:'MINOR'})).toThrow()});
  it('supports exactly the configured severity values',()=>{expect(defectSeverities).toEqual(['MINOR','ATTENTION','CRITICAL']);expect(()=>defectInputSchema.parse({category:'Tire',description:'x',severity:'URGENT'})).toThrow()});
  it('supports all defect statuses and requires notes for resolution',()=>{expect(defectStatuses).toContain('IN_REPAIR');expect(defectUpdateSchema.safeParse({severity:'MINOR',status:'RESOLVED',resolutionNotes:null}).success).toBe(false);expect(defectUpdateSchema.safeParse({severity:'MINOR',status:'RESOLVED',resolutionNotes:'Replaced tire'}).success).toBe(true)});
  it('keeps the category list deterministic and extensible',()=>{expect(defectCategories).toContain('Other');expect(defectCategories).toContain('Registration / Plate')});
  it('formats human-friendly defect ids without using them as primary keys',()=>{expect(formatDefectReference(87)).toBe('DEF-000087')});
  it('calculates weighted compliance and raw statistics',()=>{expect(calculateCompliance({expected:8,onTime:6,late:1,missing:1,excused:0,resends:2,approved:6})).toMatchObject({score:83.8,submitted:7,expected:8,missing:1,resends:2})});
  it('excludes excused weeks from the compliance denominator',()=>{expect(calculateCompliance({expected:2,onTime:1,late:0,missing:1,excused:3,resends:0,approved:1})).toMatchObject({score:50,availableWeeks:5,excused:3})});
  it('reports insufficient history instead of fabricating a score',()=>{expect(calculateCompliance({expected:0,onTime:0,late:0,missing:0,excused:0,resends:0,approved:0}).score).toBeNull()});
  it('uses Monday-Sunday date ranges in the configured timezone',()=>{const date=new Date('2026-09-30T15:00:00Z');expect(startOfMondayWeek(date,'America/New_York')).toBe('2026-09-28');expect(endOfWeekDate('2026-09-28')).toBe('2026-10-04');expect(weeksAgoStart(2,date,'America/New_York')).toBe('2026-09-21')});
  it('detects same-unit same-category repeats only inside the window',()=>{const now=new Date('2026-09-28T12:00:00Z');const result=detectRepeatGroups([{id:'1',unitId:'u1',category:'Tire',detectedAt:'2026-09-20'},{id:'2',unitId:'u1',category:'Tire',detectedAt:'2026-09-25'},{id:'3',unitId:'u1',category:'Brake',detectedAt:'2026-09-25'},{id:'4',unitId:'u1',category:'Tire',detectedAt:'2026-01-01'}],now,8);expect(result).toEqual([{key:'u1:Tire',count:2,ids:['1','2']}])});
  it('creates a centralized audit row without secrets',async()=>{const query=vi.fn().mockResolvedValue({rows:[]});await logAudit({actor:{type:'WEB_USER',id:'admin',displayName:'Admin'},action:'DEFECT_CREATED',entityType:'DEFECT',entityId:'d1',description:'Created defect',metadata:{severity:'CRITICAL'}},{query} as never);expect(query).toHaveBeenCalledOnce();const args=query.mock.calls[0];expect(args[0]).toContain('insert into audit_logs');expect(JSON.stringify(args)).not.toContain('password')});
});
