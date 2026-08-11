import { Folder, MessageSquare, Users } from "lucide-react";
import type { DirectoryProject } from "../../project-directory/model/types";
import type { GroupMember, GroupRoom } from "../model/types";
import styles from "./RoomSidebar.module.css";

export function RoomSidebar({ projects, rooms, selectedRoomId, project, projectId, room, members, onSelectRoom, onOpenProfile }: {
  projects: DirectoryProject[];
  rooms: GroupRoom[];
  selectedRoomId: string;
  project: string;
  projectId: string;
  room: GroupRoom;
  members: GroupMember[];
  onSelectRoom: (roomId: string) => void;
  onOpenProfile: (member: GroupMember) => void;
}) {
  const roomsByProjectId = new Map(rooms.map((entry) => [entry.projectId, entry]));
  const projectRows = projects.length
    ? projects
    : rooms.map((entry) => ({ id: entry.projectId, projectId: entry.projectId, name: entry.name.replace(/\s*项目群$/u, "") }));

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brandRow}><div className={styles.brand}>NEGUS</div></div>
      <section className={styles.projectList} aria-label="项目群聊管理">
        {projectRows.map((projectEntry) => {
          const linkedRoom = roomsByProjectId.get(projectEntry.projectId || projectEntry.id)
            || (projectEntry.projectId === projectId ? room : null);
          if (!linkedRoom) return null;
          const active = linkedRoom.id === selectedRoomId;
          return (
          <div className={styles.projectBlock} data-project-id={projectEntry.projectId || projectEntry.id} key={linkedRoom.id}>
          <button className={styles.projectHeader} type="button" title={projectEntry.name} onClick={() => onSelectRoom(linkedRoom.id)}>
            <Folder aria-hidden="true" /><span>{projectEntry.name}</span>
          </button>
          <div className={styles.roomList}>
            <button className={`${styles.roomRow} ${active ? styles.activeRoom : ""}`} type="button" aria-current={active ? "page" : undefined} title={linkedRoom.name} onClick={() => onSelectRoom(linkedRoom.id)}>
              <MessageSquare aria-hidden="true" />
              <span>{linkedRoom.name}</span>
            </button>
          </div>
        </div>
          );
        })}
      </section>
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
