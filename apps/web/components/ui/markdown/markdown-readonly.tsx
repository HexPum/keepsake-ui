import React from "react";
import CopyBtn from "@/components/ui/copy-button";
import { toggleTaskListItem } from "@/lib/markdown/taskListItems";
import { cn } from "@/lib/utils";
import Markdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { dracula } from "react-syntax-highlighter/dist/cjs/styles/prism";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

function PreWithCopyBtn({ className, ...props }: React.ComponentProps<"pre">) {
  const ref = React.useRef<HTMLPreElement>(null);
  return (
    <span className="group relative">
      <CopyBtn
        className="absolute right-1 top-1 m-1 hidden text-white group-hover:block"
        getStringToCopy={() => {
          return ref.current?.textContent ?? "";
        }}
      />
      <pre ref={ref} className={cn(className, "")} {...props} />
    </span>
  );
}

export function MarkdownReadonly({
  children: markdown,
  className,
  onSave,
  disabled,
}: {
  children: string;
  className?: string;
  onSave?: (markdown: string) => void;
  /**
   * Set while a save is in flight. Without it a second click is computed
   * against the same, still-unchanged `markdown` prop, so the second save
   * contains the old state of the first task and silently undoes it.
   */
  disabled?: boolean;
}) {
  /**
   * This method is triggered when a checkbox is toggled from the masonry view
   * It finds the index of the clicked checkbox inside of the note
   * It then finds the corresponding markdown and changes it accordingly
   *
   * The mapping from rendered checkbox to source position lives in
   * `toggleTaskListItem`, because the rendered order and the source order
   * differ whenever task syntax sits inside a fenced code block or a block
   * quote.
   */
  const handleTodoClick = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (disabled) {
      return;
    }
    const parent = e.target.closest(".prose");
    if (!parent) return;
    const allCheckboxes = Array.from(parent.querySelectorAll(".todo-checkbox"));
    const checkboxIndex = allCheckboxes.findIndex((cb) => cb === e.target);
    if (checkboxIndex === -1) {
      return;
    }
    const newMarkdown = toggleTaskListItem(markdown, checkboxIndex);
    if (newMarkdown !== null && onSave) {
      onSave(newMarkdown);
    }
  };

  return (
    <Markdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      className={cn("prose dark:prose-invert", className)}
      components={{
        input: (props) =>
          props.type === "checkbox" ? (
            <input
              checked={props.checked}
              disabled={disabled}
              onChange={handleTodoClick}
              type="checkbox"
              className="todo-checkbox"
            />
          ) : (
            <input {...props} readOnly />
          ),
        pre({ ...props }) {
          return <PreWithCopyBtn {...props} />;
        },
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className ?? "");
          return match ? (
            <SyntaxHighlighter
              PreTag="div"
              language={match[1]}
              {...props}
              style={dracula}
            >
              {String(children).replace(/\n$/, "")}
            </SyntaxHighlighter>
          ) : (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
      }}
    >
      {markdown}
    </Markdown>
  );
}
