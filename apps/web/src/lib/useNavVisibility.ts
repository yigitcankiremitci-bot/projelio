import { useEffect, useState } from "react";
import type { Group, Organization } from "@projelio/shared";
import { api } from "../api/client";

// Organizasyonlar / Gruplar navigasyon öğeleri yalnızca kullanıcının erişebildiği en az
// bir kayıt varsa (sahibi olduğu ya da üyesi olduğu) gösterilir. Bu, hesap tipinden
// bağımsız veri odaklı bir kural: bir freelancer bir organizasyona üye eklendiyse de
// görür, bir organization_owner henüz organizasyon oluşturmadıysa da (onboarding bunu
// garanti eder, ama yine de) sağlam kalır.
export function useNavVisibility() {
  const [showOrganizations, setShowOrganizations] = useState(false);
  const [showGroups, setShowGroups] = useState(false);

  useEffect(() => {
    api
      .get<Organization[]>("/organizations")
      .then((list) => setShowOrganizations(list.length > 0))
      .catch(() => setShowOrganizations(false));
    api
      .get<Group[]>("/groups")
      .then((list) => setShowGroups(list.length > 0))
      .catch(() => setShowGroups(false));
  }, []);

  return { showOrganizations, showGroups };
}
