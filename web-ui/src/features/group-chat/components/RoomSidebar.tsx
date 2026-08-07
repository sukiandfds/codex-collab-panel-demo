import { Folder, Users } from "lucide-react";
import type { GroupMember } from "../model/types";
import styles from "./RoomSidebar.module.css";

export function RoomSidebar({ project, members, onOpenProfile }: { project: string; members: GroupMember[]; onOpenProfile: (member: GroupMember) => void }) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.brandRow}><div className={styles.brand}>NEGUS</div></div>
      <div className={styles.projectHeader} title={project}><Folder aria-hidden="true" /><span>{project}</span></div>
      <section className={styles.memberSection}>
        <span className={styles.sectionLabel}><Users aria-hidden="true" />在线成员</span>
        <div className={styles.memberList}>
          {members.length ? members.map((member) => (
            <button className={styles.memberRow} type="button" key={member.id} onClick={() => onOpenProfile(member)}>
              <span className={styles.avatar}>{member.name.slice(0, 1)}</span><span>{member.name}</span><i />
            </button>
          )) : <span className={styles.emptyText}>等待成员加入</span>}
        </div>
      </section>
    </aside>
  );
}
