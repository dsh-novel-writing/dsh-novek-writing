import { useEffect, useRef } from "react";

import { parseMarkdownBlocks, type MdInline } from "../core/markdown.ts";

function Inline(props: { nodes: MdInline[] }) {
  return (
    <>
      {props.nodes.map((node, index) => {
        const key = `${node.kind}-${index}`;
        if (node.kind === "strong") return <strong key={key}>{node.value}</strong>;
        if (node.kind === "em") return <em key={key}>{node.value}</em>;
        if (node.kind === "code") return <code key={key}>{node.value}</code>;
        if (node.kind === "img") {
          return <img key={key} alt={node.alt} src={node.src} className="ns-inline-img" />;
        }
        return <span key={key}>{node.value}</span>;
      })}
    </>
  );
}

export function MarkdownView(props: { text: string; className?: string; live?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const blocks = parseMarkdownBlocks(props.text);
  useEffect(() => {
    const node = root.current;
    if (node === null || props.live !== true) return;
    node.scrollTop = node.scrollHeight;
  }, [props.text, props.live]);
  const className = [props.className ?? "ns-md", props.live === true ? "ns-live" : ""]
    .filter((part) => part !== "")
    .join(" ");
  return (
    <div ref={root} className={className}>
      {blocks.map((block, index) => {
        const key = `${block.kind}-${index}`;
        if (block.kind === "hr") return <hr key={key} />;
        if (block.kind === "pre") return <pre key={key}>{block.value}</pre>;
        if (block.kind === "h") {
          if (block.level === 1) return <h1 key={key}><Inline nodes={block.inlines} /></h1>;
          if (block.level === 2) return <h2 key={key}><Inline nodes={block.inlines} /></h2>;
          if (block.level === 3) return <h3 key={key}><Inline nodes={block.inlines} /></h3>;
          return <h4 key={key}><Inline nodes={block.inlines} /></h4>;
        }
        if (block.kind === "quote") return <blockquote key={key}><Inline nodes={block.inlines} /></blockquote>;
        if (block.kind === "li") return <li key={key}><Inline nodes={block.inlines} /></li>;
        return <p key={key}><Inline nodes={block.inlines} /></p>;
      })}
    </div>
  );
}
