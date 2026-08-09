import { useEffect, useState } from "react";
import type { Department, Group, Job, Operation, Organization, Project } from "@projelio/shared";
import { api } from "../api/client";

/**
 * Sidebar'daki gezinme ağacının veri modeli. Hiyerarşi: Grup -> Organizasyon -> (Departman | İş).
 * Bir Organizasyon bir Gruba bağlı olabilir ya da bağımsız durabilir; bir İş de aynı
 * şekilde bir Organizasyona, doğrudan bir Gruba ya da hiçbirine bağlı olabilir
 * (bkz. Job.organizationId / Job.groupId — @projelio/shared, ikisi birden set edilmez).
 * Departmanlar yalnızca organizasyonlara bağlıdır (bkz. Department.organizationId).
 */
export interface SidebarOrgNode {
  org: Organization;
  jobs: Job[];
  departments: Department[];
}

export interface SidebarGroupNode {
  group: Group;
  orgs: SidebarOrgNode[];
  // Organizasyon üzerinden değil, doğrudan bu gruba bağlı işler.
  jobs: Job[];
}

export interface SidebarHierarchy {
  groups: SidebarGroupNode[];
  standaloneOrgs: SidebarOrgNode[];
  // Ne bir organizasyona ne bir gruba bağlı, bağımsız (freelance) işler.
  standaloneJobs: Job[];
  // Her işin AÇIK (arşivlenmemiş/bitmemiş) projeleri ve rutinleri (kodda
  // "operation") — sidebar'da "Projeler"/"Rutinler" kısayollarının altında tek
  // tek listelenir (bkz. SidebarTree.renderJob). Job id'sine göre anahtarlanır.
  openProjectsByJobId: Map<string, Project[]>;
  openOperationsByJobId: Map<string, Operation[]>;
  loading: boolean;
}

function buildHierarchy(
  groups: Group[],
  orgs: Organization[],
  jobs: Job[],
  departmentsByOrgId: Map<string, Department[]>
): Omit<SidebarHierarchy, "loading" | "openProjectsByJobId" | "openOperationsByJobId"> {
  const jobsByOrgId = new Map<string, Job[]>();
  const jobsByGroupIdDirect = new Map<string, Job[]>();
  const standaloneJobs: Job[] = [];

  for (const job of jobs) {
    if (job.organizationId) {
      const list = jobsByOrgId.get(job.organizationId) ?? [];
      list.push(job);
      jobsByOrgId.set(job.organizationId, list);
    } else if (job.groupId) {
      const list = jobsByGroupIdDirect.get(job.groupId) ?? [];
      list.push(job);
      jobsByGroupIdDirect.set(job.groupId, list);
    } else {
      standaloneJobs.push(job);
    }
  }

  const orgsByGroupId = new Map<string, Organization[]>();
  const standaloneOrgList: Organization[] = [];
  // Bir organizasyonun groupId'si olabilir ama o grup kullanıcının erişebildiği
  // /groups listesinde yer almayabilir (örn. bir departmana kadro olarak kabul
  // edilen ama o grubun üyesi olmayan bir çalışan). Bu durumda organizasyon
  // hiç görünmemek yerine bağımsızmış gibi (grupsuz) gösterilir.
  const knownGroupIds = new Set(groups.map((g) => g.id));

  for (const org of orgs) {
    if (org.groupId && knownGroupIds.has(org.groupId)) {
      const list = orgsByGroupId.get(org.groupId) ?? [];
      list.push(org);
      orgsByGroupId.set(org.groupId, list);
    } else {
      standaloneOrgList.push(org);
    }
  }

  const toOrgNode = (org: Organization): SidebarOrgNode => ({
    org,
    jobs: jobsByOrgId.get(org.id) ?? [],
    departments: departmentsByOrgId.get(org.id) ?? [],
  });

  const groupNodes: SidebarGroupNode[] = groups.map((group) => ({
    group,
    orgs: (orgsByGroupId.get(group.id) ?? []).map(toOrgNode),
    jobs: jobsByGroupIdDirect.get(group.id) ?? [],
  }));

  return {
    groups: groupNodes,
    standaloneOrgs: standaloneOrgList.map(toOrgNode),
    standaloneJobs,
  };
}

/**
 * Sidebar'daki gezinme ağacı için gereken tüm veriyi tek seferde çeker (mevcut
 * /groups, /organizations, /jobs uçları — yeni bir backend uç noktasına gerek yok)
 * ve client tarafında Grup > Organizasyon > (Departman | İş) ağacını kurar.
 * Departmanlar organizasyon başına ayrıca çekilir (/organizations/:id/departments —
 * tüm organizasyonların departmanlarını tek seferde dönen bir uç nokta yok).
 */
export function useSidebarHierarchy(): SidebarHierarchy {
  const [groups, setGroups] = useState<Group[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [departmentsByOrgId, setDepartmentsByOrgId] = useState<Map<string, Department[]>>(new Map());
  const [openProjectsByJobId, setOpenProjectsByJobId] = useState<Map<string, Project[]>>(new Map());
  const [openOperationsByJobId, setOpenOperationsByJobId] = useState<Map<string, Operation[]>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get<Group[]>("/groups").catch(() => []),
      api.get<Organization[]>("/organizations").catch(() => []),
      api.get<Job[]>("/jobs").catch(() => []),
    ])
      .then(async ([g, o, j]) => {
        if (cancelled) return;
        setGroups(g);
        setOrgs(o);
        setJobs(j);

        const [deptLists, projectLists, operationLists] = await Promise.all([
          Promise.all(o.map((org) => api.get<Department[]>(`/organizations/${org.id}/departments`).catch(() => []))),
          Promise.all(j.map((job) => api.get<Project[]>(`/jobs/${job.id}/projects`).catch(() => []))),
          Promise.all(j.map((job) => api.get<Operation[]>(`/jobs/${job.id}/operations`).catch(() => []))),
        ]);
        if (cancelled) return;

        const deptMap = new Map<string, Department[]>();
        o.forEach((org, idx) => deptMap.set(org.id, deptLists[idx]));
        setDepartmentsByOrgId(deptMap);

        // Sidebar'da yalnızca AÇIK olanlar görünür: tamamlanmış/arşivlenmiş
        // projeler ve bitmiş rutinler gezinme ağacını kalabalıklaştırmasın
        // (bkz. SidebarTree.renderJob — "Projeler"/"Rutinler" altında listelenir).
        const projMap = new Map<string, Project[]>();
        j.forEach((job, idx) => projMap.set(job.id, projectLists[idx].filter((p) => p.status === "active")));
        setOpenProjectsByJobId(projMap);

        const opMap = new Map<string, Operation[]>();
        j.forEach((job, idx) => opMap.set(job.id, operationLists[idx].filter((o2) => o2.status !== "ended")));
        setOpenOperationsByJobId(opMap);

        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hierarchy = buildHierarchy(groups, orgs, jobs, departmentsByOrgId);
  return { ...hierarchy, openProjectsByJobId, openOperationsByJobId, loading };
}
