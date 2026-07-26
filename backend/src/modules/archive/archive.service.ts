import { Injectable } from "@nestjs/common";
import type {
  ArchiveSummary,
  ArchivedJobEntry,
  ArchivedOutputEntry,
  ArchivedProjectEntry,
  ArchivedTaskEntry,
} from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";

@Injectable()
export class ArchiveService {
  constructor(private supabase: SupabaseService) {}

  async getArchivedForUser(userId: string): Promise<ArchiveSummary> {
    const { data: allJobs, error: jobsError } = await this.supabase.client
      .from("jobs")
      .select("id, title, archived_at")
      .eq("owner_id", userId);
    if (jobsError) throw jobsError;

    const jobTitleMap = new Map<string, string>((allJobs ?? []).map((j: any) => [j.id, j.title]));

    const { data: allProjects, error: projectsError } = await this.supabase.client
      .from("projects")
      .select("id, title, job_id, archived_at")
      .eq("owner_id", userId);
    if (projectsError) throw projectsError;

    const projectMap = new Map<string, { title: string; jobId: string }>(
      (allProjects ?? []).map((p: any) => [p.id, { title: p.title, jobId: p.job_id }])
    );
    const projectIds = (allProjects ?? []).map((p: any) => p.id);

    let allTasks: any[] = [];
    let allOutputs: any[] = [];

    if (projectIds.length > 0) {
      const { data: tasksData, error: tasksError } = await this.supabase.client
        .from("tasks")
        .select("id, title, project_id, parent_task_id, archived_at")
        .in("project_id", projectIds);
      if (tasksError) throw tasksError;
      allTasks = tasksData ?? [];

      const { data: outputsData, error: outputsError } = await this.supabase.client
        .from("outputs")
        .select("id, title, project_id, archived_at")
        .in("project_id", projectIds);
      if (outputsError) throw outputsError;
      allOutputs = outputsData ?? [];
    }

    const taskTitleMap = new Map<string, string>(allTasks.map((t) => [t.id, t.title]));

    const jobs: ArchivedJobEntry[] = (allJobs ?? [])
      .filter((j: any) => j.archived_at)
      .map((j: any) => ({ id: j.id, title: j.title, archivedAt: j.archived_at }));

    const projects: ArchivedProjectEntry[] = (allProjects ?? [])
      .filter((p: any) => p.archived_at)
      .map((p: any) => ({
        id: p.id,
        title: p.title,
        archivedAt: p.archived_at,
        jobId: p.job_id,
        jobTitle: jobTitleMap.get(p.job_id) ?? "",
      }));

    const tasks: ArchivedTaskEntry[] = allTasks
      .filter((t) => t.archived_at)
      .map((t) => {
        const project = projectMap.get(t.project_id);
        return {
          id: t.id,
          title: t.title,
          archivedAt: t.archived_at,
          isSubtask: Boolean(t.parent_task_id),
          projectId: t.project_id,
          projectTitle: project?.title ?? "",
          jobId: project?.jobId ?? "",
          jobTitle: project ? jobTitleMap.get(project.jobId) ?? "" : "",
          parentTaskId: t.parent_task_id ?? undefined,
          parentTaskTitle: t.parent_task_id ? taskTitleMap.get(t.parent_task_id) : undefined,
        };
      });

    const outputs: ArchivedOutputEntry[] = allOutputs
      .filter((o) => o.archived_at)
      .map((o) => {
        const project = projectMap.get(o.project_id);
        return {
          id: o.id,
          title: o.title,
          archivedAt: o.archived_at,
          projectId: o.project_id,
          projectTitle: project?.title ?? "",
          jobId: project?.jobId ?? "",
          jobTitle: project ? jobTitleMap.get(project.jobId) ?? "" : "",
        };
      });

    return { jobs, projects, tasks, outputs };
  }
}
