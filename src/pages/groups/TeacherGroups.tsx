import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import GroupCard from "@/components/GroupCard";
import { fetchAllPages } from "@/api/fetchAllPages";
import { useOwnTeacher } from "./useOwnTeacher";
import type { Group } from "@/types/group.types";
import "./groups.css";

/**
 * O'qituvchi ko'rinishi — FAQAT o'ziga biriktirilgan guruhlar. Kartani bosganda
 * o'sha guruh davomatiga o'tadi (`GroupCard`).
 *
 * Guruh o'qituvchisi joriy hisobning xodim id siga teng bo'lsa — «o'z guruhi»
 * (`useOwnTeacher` → `permissions/scope.ts`: xodim-login `user.id`, foydalanuvchi `user.employee.id`).
 */
const TeacherGroups = () => {
  const { isOwnTeacher, isLoading: employeesLoading } = useOwnTeacher();

  // `useAllGroups()` (index.tsx) bilan bir xil kalit va queryFn — bitta kesh.
  const { data: allGroups, isLoading: groupsLoading } = useQuery<Group[]>({
    queryKey: ["groups", "list", "all"],
    queryFn: () => fetchAllPages<Group>("/groups"),
  });

  const myGroups = useMemo(
    () => (allGroups ?? []).filter((group) => isOwnTeacher(group.teacher)),
    [allGroups, isOwnTeacher],
  );

  const renderedGroups = useMemo(
    () => myGroups.map((group) => <GroupCard key={group.id} group={group} />),
    [myGroups],
  );

  return (
    <div className="teacher-groups-container">
      <div className="teacher-groups-grid">{renderedGroups}</div>

      {/* Yuklash oynasi yo'q: kartalar kelgani sari chiqadi; «topilmadi» faqat ma'lumot to'liq kelgach. */}
      {!groupsLoading && !employeesLoading && myGroups.length === 0 && (
        <div className="teacher-groups-empty">
          <p className="teacher-groups-empty-text">Hech qanday guruh topilmadi</p>
        </div>
      )}
    </div>
  );
};

export default TeacherGroups;
