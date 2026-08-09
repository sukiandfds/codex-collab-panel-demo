import { Bot, ChevronDown, Command, FileText, Image, Plug, ScanSearch, Sparkles, type LucideIcon } from "lucide-react";
import styles from "./SlashCommandMenu.module.css";

export interface SlashCommandOption {
  id: string;
  command: string;
  group: string;
  label: string;
  detail: string;
}

const iconForGroup: Record<string, LucideIcon> = {
  会话: Command,
  Codex: ScanSearch,
  文件: FileText,
  "MCP 工具": Image,
  Skills: Sparkles,
  Apps: Plug,
};

export function SlashCommandMenu({ options, collapsedGroups, activeIndex, onActiveChange, onToggleGroup, onSelect }: {
  options: SlashCommandOption[];
  collapsedGroups: Record<string, boolean>;
  activeIndex: number;
  onActiveChange: (index: number) => void;
  onToggleGroup: (group: string) => void;
  onSelect: (option: SlashCommandOption) => void;
}) {
  if (!options.length) return null;

  const groups = [...new Set(options.map((option) => option.group))];
  let visibleIndex = 0;

  return (
    <div className={styles.menu} role="listbox" aria-label="选择 Codex 命令">
      <div className={styles.heading}>命令</div>
      {groups.map((group) => {
        const GroupIcon = iconForGroup[group] || Bot;
        const collapsed = Boolean(collapsedGroups[group]);
        return (
          <section className={styles.group} key={group}>
            <button className={styles.groupHeader} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onToggleGroup(group)}>
              <span><GroupIcon aria-hidden="true" />{group}</span>
              <ChevronDown className={collapsed ? styles.collapsed : ""} aria-hidden="true" />
            </button>
            {!collapsed ? options.filter((option) => option.group === group).map((option) => {
              const index = visibleIndex++;
              return (
                <button
                  className={`${styles.option} ${index === activeIndex ? styles.active : ""}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  key={option.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => onActiveChange(index)}
                  onClick={() => onSelect(option)}
                >
                  <span className={styles.icon}><GroupIcon aria-hidden="true" /></span>
                  <span className={styles.text}><strong>{option.label}</strong><small>{option.detail}</small></span>
                  <code>{option.command}</code>
                </button>
              );
            }) : null}
          </section>
        );
      })}
    </div>
  );
}
