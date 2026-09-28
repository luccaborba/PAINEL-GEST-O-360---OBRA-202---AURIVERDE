ALTER TABLE public.cx_reimbursements
ADD COLUMN IF NOT EXISTS expense_on date,
ADD COLUMN IF NOT EXISTS supplier text,
ADD COLUMN IF NOT EXISTS category text,
ADD COLUMN IF NOT EXISTS reimbursement_type text,
ADD COLUMN IF NOT EXISTS field_leave_start date,
ADD COLUMN IF NOT EXISTS field_leave_end date;

CREATE INDEX IF NOT EXISTS idx_cx_reimbursements_expense_on ON public.cx_reimbursements(project_id, expense_on);
CREATE INDEX IF NOT EXISTS idx_cx_reimbursements_category ON public.cx_reimbursements(project_id, category);

DROP POLICY IF EXISTS cx_reimbursement_competences_read ON public.cx_reimbursement_competences;
DROP POLICY IF EXISTS cx_reimbursement_competences_create ON public.cx_reimbursement_competences;
DROP POLICY IF EXISTS cx_reimbursements_read ON public.cx_reimbursements;
DROP POLICY IF EXISTS cx_reimbursements_create ON public.cx_reimbursements;
DROP POLICY IF EXISTS cx_reimbursements_edit ON public.cx_reimbursements;
DROP POLICY IF EXISTS cx_reimbursements_delete ON public.cx_reimbursements;
CREATE POLICY cx_reimbursement_competences_read ON public.cx_reimbursement_competences FOR SELECT USING (cx_can_access(project_id,'reimbursements','view'));
CREATE POLICY cx_reimbursement_competences_create ON public.cx_reimbursement_competences FOR INSERT WITH CHECK (cx_can_access(project_id,'reimbursements','create'));
CREATE POLICY cx_reimbursements_read ON public.cx_reimbursements FOR SELECT USING (cx_can_access(project_id,'reimbursements','view'));
CREATE POLICY cx_reimbursements_create ON public.cx_reimbursements FOR INSERT WITH CHECK (cx_can_access(project_id,'reimbursements','create'));
CREATE POLICY cx_reimbursements_edit ON public.cx_reimbursements FOR UPDATE USING (cx_can_access(project_id,'reimbursements','edit')) WITH CHECK (cx_can_access(project_id,'reimbursements','edit'));
CREATE POLICY cx_reimbursements_delete ON public.cx_reimbursements FOR DELETE USING (cx_can_access(project_id,'reimbursements','delete'));
