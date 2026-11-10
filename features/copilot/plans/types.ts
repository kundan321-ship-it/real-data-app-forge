export type PlanStatus = 'draft' | 'active' | 'review' | 'completed';

export interface PlanMilestone {
  id: string;
  title: string;
  owner: string;
  dueDate: string;
  status: PlanStatus;
}

export interface PlanTask {
  id: string;
  title: string;
  description: string;
  owner: string;
  dueDate: string;
  status: PlanStatus;
  progress: number;
}

export interface PlanMetric {
  label: string;
  value: string;
  detail: string;
}

export interface Plan {
  id: string;
  title: string;
  summary: string;
  owner: string;
  status: PlanStatus;
  progress: number;
  updatedAt: string;
  milestones: PlanMilestone[];
  tasks: PlanTask[];
  metrics: PlanMetric[];
}

export const statusStyles: Record<PlanStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 ring-slate-200',
  active: 'bg-blue-100 text-blue-700 ring-blue-200',
  review: 'bg-amber-100 text-amber-700 ring-amber-200',
  completed: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
};

export const statusLabels: Record<PlanStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  review: 'In review',
  completed: 'Completed',
};
