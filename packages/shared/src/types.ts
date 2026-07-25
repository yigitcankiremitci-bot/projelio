// Veritabanı şemasıyla birebir eşleşen paylaşılan tipler

export type UserRole = "admin" | "freelancer";

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export type ProjectStatus = "active" | "completed" | "archived";

export interface Project {
  id: string;
  ownerId: string;
  title: string;
  description?: string;
  totalBudget: number;
  startDate: string;
  deadline: string;
  status: ProjectStatus;
  createdAt: string;
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
  joinedAt: string;
}

export type TaskStatus = "todo" | "in_progress" | "completed";

export interface Task {
  id: string;
  projectId: string;
  assignedTo?: string;
  title: string;
  startDate?: string;
  deadline: string;
  status: TaskStatus;
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
    | "join_request";
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}
