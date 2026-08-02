import { useEffect, useState } from "react";
import type { Group, Job, Organization } from "@projelio/shared";
import { api } from "../api/client";

/**
 * Sidebar'daki gezinme ağacının veri modeli. Hiyerarşi: Grup -> Organizasyon -> İş.
 * Bir Organizasyon bir Gruba bağlı olabilir ya da bağımsız durabilir; bir İş de aynı
 * şekilde bir Organizasyona, doğrudan bir Gruba ya da hiçbirine bağlı olabilir
 * (bkz. Job.organizationId / Job.groupId — @projelio/shared, ikisi birden set edilmez).
 */
export interface SidebarOrgNode {
  org: Organization;
  jobs: Job[];
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
  loading: boolean;
}

function buildHierarchy(groups: Group[], orgs: Organization[], jobs: Job[]): Omit<SidebarHierarchy, "loading"> {
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

  for (const org of orgs) {
    if (org.groupId) {
      const list = orgsByGroupId.get(org.groupId) ?? [];
      list.push(org);
      orgsByGroupId.set(org.groupId, list);
    } else {
      standaloneOrgList.push(org);
    }
  }

  const toOrgNode = (org: Organization): SidebarOrgNode => ({ org, jobs: jobsByOrgId.get(org.id) ?? [] });

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
 * ve client tarafında Grup > Organizasyon > İş ağacını kurar.
 */
export function useSidebarHierarchy(): SidebarHierarchy {
  const [groups, setGroups] = useState<Group[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get<Group[]>("/groups").catch(() => []),
      api.get<Organization[]>("/organizations").catch(() => []),
      api.get<Job[]>("/jobs").catch(() => []),
    ]).then(([g, o, j]) => {
      if (cancelled) return;
      setGroups(g);
      setOrgs(o);
      setJobs(j);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const hierarchy = buildHierarchy(groups, orgs, jobs);
  return { ...hierarchy, loading };
}
