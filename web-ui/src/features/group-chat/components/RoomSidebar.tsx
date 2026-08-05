import { FolderKanban, Users } from "lucide-react";
import type { GroupMember } from "../model/types";
import styles from "./RoomSidebar.module.css";

export function RoomSidebar({ project, members }: { project: string; members: GroupMember[] }) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}><span className={styles.brandMark}>N</span><span>negus</span></div>
      <section className={styles.sidebarSection}>
        <span className={styles.sectionLabel}>当前项目</span>
        <div className={styles.projectRow}><FolderKanban /><span>{project}</span></div>
      </section>
      <section className={styles.sidebarSection}>
        <span className={styles.sectionLabel}><Users />在线成员</span>
        <div className={styles.memberList}>
          {members.length ? members.map((member) => (
            <div className={styles.memberRow} key={member.id}><span className={styles.avatar}>{member.name.slice(0, 1)}</span><span>{member.name}</span><i /></div>
          )) : <span className={styles.emptyText}>等待成员加入</span>}
        </div>
      </section>
    </aside>
  );
}
