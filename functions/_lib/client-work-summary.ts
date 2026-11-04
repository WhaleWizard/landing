import { hasWorkspace } from './admin-workspace';
export interface WorkSummaryRow {id:number;client_id:number;title:string;status:string;billing:string;amount:number;currency:string;created_at:string;reported:number}
export async function readClientWorkSummary(db:D1Database,today:string):Promise<WorkSummaryRow[]|null>{
  if(!await hasWorkspace(db))return null;
  const d=new Date(`${today.slice(0,7)}-01T12:00:00Z`);d.setUTCMonth(d.getUTCMonth()-1);const previous=d.toISOString().slice(0,7);
  return (await db.prepare(`SELECT w.id,w.client_id,w.title,w.status,w.billing,w.amount,w.currency,w.created_at,
    EXISTS(SELECT 1 FROM client_work_months m WHERE m.work_id=w.id AND m.month=? AND m.report_sent_at IS NOT NULL AND m.report_sent_at!='') AS reported
    FROM client_work w WHERE w.billing='monthly'`).bind(previous).all<WorkSummaryRow>()).results||[];
}
