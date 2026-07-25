import { Injectable } from "@nestjs/common";
import type { BudgetTransaction } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { NotificationsService } from "../notifications/notifications.service";

function mapTransaction(row: any): BudgetTransaction {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id ?? undefined,
    type: row.type,
    amount: Number(row.amount),
    description: row.description ?? undefined,
    createdAt: row.created_at,
  };
}

@Injectable()
export class BudgetService {
  constructor(
    private supabase: SupabaseService,
    private notificationsService: NotificationsService
  ) {}

  async findByProject(projectId: string): Promise<BudgetTransaction[]> {
    const { data, error } = await this.supabase.client
      .from("budget_transactions")
      .select()
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapTransaction);
  }

  async add(projectId: string, data: Partial<BudgetTransaction>): Promise<BudgetTransaction> {
    const { data: row, error } = await this.supabase.client
      .from("budget_transactions")
      .insert({
        project_id: projectId,
        user_id: data.userId ?? null,
        type: data.type ?? "expense",
        amount: data.amount ?? 0,
        description: data.description ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    const tx = mapTransaction(row);
    if (tx.userId) {
      this.notificationsService.notifyUser(
        tx.userId,
        "budget_changed",
        "Bütçe Güncellendi",
        `${tx.type}: ${tx.amount} ₺`
      );
    }
    return tx;
  }

  // Toplam bütçe - gider - hakediş/ödeme = kalan marj
  async calculateRemainingMargin(projectId: string, totalBudget: number): Promise<number> {
    const txs = await this.findByProject(projectId);
    const spent = txs
      .filter((t) => t.type === "expense" || t.type === "payout")
      .reduce((sum, t) => sum + t.amount, 0);
    const income = txs.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
    return totalBudget + income - spent;
  }
}
