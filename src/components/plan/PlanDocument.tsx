"use client";

import { useMemo, type ReactNode } from "react";
import { parsePlan, segment, type Block, type Highlight, type Inline } from "@/ui/markdown";
import styles from "./plan.module.css";

type Props = {
  text: string;
  highlights: readonly Highlight[];
  active: string | null;
  /** Highlights shown faintly even when not active (findings, deadline). */
  isStanding: (id: string) => boolean;
  onSelect: (id: string) => void;
};

export function PlanDocument({ text, highlights, active, isStanding, onSelect }: Props) {
  const blocks = useMemo(() => parsePlan(text), [text]);

  const renderInline = (nodes: Inline[], key: string): ReactNode[] =>
    nodes.map((node, i) => {
      const k = `${key}.${i}`;
      switch (node.type) {
        case "text":
          return segment(node.value, node.start, highlights).map((part, j) => {
            const isActive = active !== null && part.ids.includes(active);
            const standing = part.ids.filter(isStanding);
            if (!isActive && standing.length === 0)
              return <span key={`${k}.${j}`}>{part.text}</span>;
            const target = isActive ? active : standing[0]!;
            return (
              <mark
                key={`${k}.${j}`}
                data-ids={part.ids.join(" ")}
                data-active={isActive ? "true" : undefined}
                className={isActive ? styles.markActive : styles.mark}
                onClick={() => onSelect(target)}
              >
                {part.text}
              </mark>
            );
          });
        case "code":
          return <code key={k}>{node.value}</code>;
        case "strong":
          return <strong key={k}>{renderInline(node.children, k)}</strong>;
        case "emphasis":
          return <em key={k}>{renderInline(node.children, k)}</em>;
        case "delete":
          return <del key={k}>{renderInline(node.children, k)}</del>;
        case "link":
          return <span key={k}>{renderInline(node.children, k)}</span>;
        case "break":
          return <br key={k} />;
      }
    });

  const renderBlock = (block: Block, key: string): ReactNode => {
    switch (block.type) {
      case "heading": {
        const Tag = (["h3", "h3", "h4", "h5", "h5", "h5"] as const)[block.depth - 1] ?? "h5";
        return (
          <Tag key={key} className={styles[`docH${Math.min(block.depth, 3)}`]}>
            {renderInline(block.children, key)}
          </Tag>
        );
      }
      case "paragraph":
        return <p key={key}>{renderInline(block.children, key)}</p>;
      case "table": {
        const [head, ...rows] = block.rows;
        return (
          <div key={key} className={styles.docTableWrap}>
            <table className={styles.docTable}>
              {head && (
                <thead>
                  <tr>
                    {head.map((cell, c) => (
                      <th key={c} scope="col">
                        {renderInline(cell, `${key}.h${c}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, c) => (
                      <td key={c}>{renderInline(cell, `${key}.${r}.${c}`)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      case "list": {
        const List = block.ordered ? "ol" : "ul";
        return (
          <List key={key}>
            {block.items.map((item, i) => (
              <li key={i}>{item.map((child, j) => renderBlock(child, `${key}.${i}.${j}`))}</li>
            ))}
          </List>
        );
      }
      case "quote":
        return (
          <blockquote key={key}>
            {block.children.map((child, i) => renderBlock(child, `${key}.${i}`))}
          </blockquote>
        );
      case "rule":
        return <hr key={key} />;
      case "codeblock":
        return <pre key={key}>{block.value}</pre>;
    }
  };

  return (
    <div className={styles.document}>{blocks.map((block, i) => renderBlock(block, String(i)))}</div>
  );
}

/** The plan without highlights, for pages that have no verified review. */
export function PlainPlanDocument({ text }: { text: string }) {
  return (
    <PlanDocument
      text={text}
      highlights={[]}
      active={null}
      isStanding={() => false}
      onSelect={() => {}}
    />
  );
}
