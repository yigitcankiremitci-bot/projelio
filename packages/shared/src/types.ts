// Veritabanı şemasıyla birebir eşleşen paylaşılan tipler

export type UserRole = "admin" | "freelancer";

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface Job {
  id: string;
  ownerId: string;
  ownerName?: string;
  title: string;
  description?: string;
  coverImageUrl?: string;
  createdAt: string;
  archivedAt?: string;
  sortOrder?: number;
}

export type ProjectStatus = "active" | "completed" | "archived";

export interface Project {
  id: string;
  jobId: string;
  ownerId: string;
  title: string;
  description?: string;
  coverImageUrl?: string;
  totalBudget: number;
  startDate: string;
  deadline: string;
  status: ProjectStatus;
  createdAt: string;
  archivedAt?: string;
  sortOrder?: number;
}

export type MemberRole = "owner" | "member" | "subcontractor";
export type MemberStatus = "pending" | "approved" | "rejected";

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  role: MemberRole;
  status: MemberStatus;
  customAgreedRate?: number;
  canViewBudget: boolean;
  joinedAt: string;
  fullName?: string;
  email?: string;
}

export interface Output {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  createdAt: string;
  archivedAt?: string;
  sortOrder?: number;
}

export type TaskStatus = "todo" | "in_progress" | "completed";
export type TaskBudgetStatus = "pending" | "planned" | "paid";

export interface Task {
  id: string;
  projectId: string;
  outputId?: string;
  assignedTo?: string;
  title: string;
  startDate?: string;
  deadline: string;
  status: TaskStatus;
  parentTaskId?: string;
  budget?: number;
  budgetStatus: TaskBudgetStatus;
  weekNumber?: number;
  createdAt: string;
  archivedAt?: string;
  sortOrder?: number;
}

export interface TaskComment {
  id: string;
  taskId: string;
  userId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface ProjectPost {
  id: string;
  projectId: string;
  userId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export type BudgetTransactionType = "income" | "expense" | "payout";

export interface BudgetTransaction {
  id: string;
  projectId: string;
  userId?: string;
  type: BudgetTransactionType;
  amount: number;
  description?: string;
  createdAt: string;
}

export interface NotificationPayload {
  id: string;
  userId: string;
  type:
    | "task_due_24h"
    | "task_due_1h"
    | "project_deadline_24h"
    | "team_invite"
    | "role_updated"
    | "budget_changed"
    | "join_request"
    | "task_assigned"
    | "task_updated"
    | "member_joined"
    | "daily_digest"
    | "weekly_digest";
  title: string;
  body: string;
  link?: string;
  createdAt: string;
  read: boolean;
}

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

export interface ArchivedJobEntry {
  id: string;
  title: string;
  archivedAt: string;
}

export interface ArchivedProjectEntry {
  id: string;
  title: string;
  archivedAt: string;
  jobId: string;
  jobTitle: string;
}

export interface ArchivedTaskEntry {
  id: string;
  title: string;
  archivedAt: string;
  isSubtask: boolean;
  projectId: string;
  projectTitle: string;
  jobId: string;
  jobTitle: string;
  parentTaskId?: string;
  parentTaskTitle?: string;
}

export interface ArchivedOutputEntry {
  id: string;
  title: string;
  archivedAt: string;
  projectId: string;
  projectTitle: string;
  jobId: string;
  jobTitle: string;
}

export interface ArchiveSummary {
  jobs: ArchivedJobEntry[];
  projects: ArchivedProjectEntry[];
  tasks: ArchivedTaskEntry[];
  outputs: ArchivedOutputEntry[];
}
