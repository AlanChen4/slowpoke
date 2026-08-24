"use client";

import { CheckIcon, ClipboardIcon } from "@phosphor-icons/react";
import * as React from "react";
import type { BundledLanguage } from "shiki";

import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/ui/utils";

export type CodeBlockFile = {
  filename: string;
  code: string;
  language?: BundledLanguage;
  panelClassName?: string;
  paneStyle?: React.CSSProperties;
  highlightLines?: number[];
  highlightClassName?: string;
  showLineNumbers?: boolean;
};

export type CodeBlockProps = React.ComponentProps<"div"> & {
  code?: string;
  language?: BundledLanguage;
  filename?: string;
  files?: CodeBlockFile[];
  panelClassName?: string;
  paneStyle?: React.CSSProperties;
  highlightLines?: number[];
  highlightClassName?: string;
  showLineNumbers?: boolean;
};

type CodeBlockPaneProps = {
  code: string;
  language?: BundledLanguage;
  showCopy?: boolean;
  className?: string;
  style?: React.CSSProperties;
  highlightLines?: number[];
  highlightClassName?: string;
  showLineNumbers?: boolean;
};

function splitShikiLines(html: string): string[] {
  const match = html.match(/<code[^>]*>([\s\S]*?)<\/code>/);
  if (!match) {
    return [html];
  }

  const lines = match[1].split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}

function escapeHtml(code: string) {
  return code.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function highlight(code: string, language: BundledLanguage = "tsx") {
  try {
    const { codeToHtml } = await import("shiki");
    return await codeToHtml(code, {
      lang: language,
      themes: { light: "github-light", dark: "github-dark" },
    });
  } catch {
    return `<pre><code>${escapeHtml(code)}</code></pre>`;
  }
}

function fallbackCopy(text: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.cssText = "position:fixed;top:-9999px;left:-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

function CodeBlockCopyButton({
  code,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "children"> & { code: string }) {
  const [copied, setCopied] = React.useState(false);
  const resetTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined);

  React.useEffect(
    () => () => {
      clearTimeout(resetTimer.current);
    },
    [],
  );

  const handleCopy = React.useCallback(async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(code);
      } else {
        fallbackCopy(code);
      }
    } catch {
      fallbackCopy(code);
    }

    setCopied(true);
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 1500);
  }, [code]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      data-slot="code-block-copy"
      aria-label={copied ? "Copied" : "Copy code"}
      onClick={handleCopy}
      className={cn("shrink-0", className)}
      {...props}
    >
      {copied ? <CheckIcon /> : <ClipboardIcon />}
    </Button>
  );
}

function CodeBlockPane({
  code,
  language = "tsx",
  showCopy = true,
  className,
  style,
  highlightLines,
  highlightClassName = "bg-accent",
  showLineNumbers = false,
}: CodeBlockPaneProps) {
  const [html, setHtml] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    void highlight(code, language).then((result) => {
      if (!cancelled) {
        setHtml(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  const useLineView = Boolean(highlightLines?.length) || showLineNumbers;
  const lines = React.useMemo(() => (html ? splitShikiLines(html) : []), [html]);

  return (
    <div data-slot="code-block-pane" className={cn("relative", className)} style={style}>
      <ScrollArea className="max-h-44 *:data-[slot=scroll-area-viewport]:h-auto! *:data-[slot=scroll-area-viewport]:max-h-44">
        {showCopy ? (
          <CodeBlockCopyButton code={code} className="absolute right-2 top-2 z-10" />
        ) : null}
        {html ? (
          useLineView ? (
            <pre className="shiki bg-transparent! p-0 font-mono text-xs leading-relaxed">
              <code className="block w-max min-w-full">
                {lines.map((line, index) => {
                  const lineNumber = index + 1;
                  const isHighlighted = highlightLines?.includes(lineNumber) ?? false;
                  return (
                    <span
                      key={lineNumber}
                      className={cn(
                        "flex items-stretch px-4 py-px",
                        isHighlighted && highlightClassName,
                      )}
                    >
                      {showLineNumbers ? (
                        <span className="mr-4 w-4 shrink-0 select-none text-right font-mono text-xs leading-relaxed text-muted-foreground/50">
                          {lineNumber}
                        </span>
                      ) : null}
                      <span
                        className="flex-1"
                        dangerouslySetInnerHTML={{ __html: line || "&nbsp;" }}
                      />
                    </span>
                  );
                })}
              </code>
            </pre>
          ) : (
            <div
              className="[&>pre]:bg-transparent! [&>pre]:p-4 [&>pre]:font-mono [&>pre]:text-xs [&>pre]:leading-relaxed [&>pre]:whitespace-pre"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )
        ) : (
          <pre className="p-4 font-mono text-xs leading-relaxed opacity-0">{code}</pre>
        )}
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}

function CodeBlock({
  code,
  language = "tsx",
  filename,
  files,
  className,
  panelClassName,
  paneStyle,
  highlightLines,
  highlightClassName,
  showLineNumbers,
  ...props
}: CodeBlockProps) {
  const normalizedFiles = React.useMemo<CodeBlockFile[]>(() => {
    if (files?.length) {
      return files;
    }
    if (code === undefined) {
      return [];
    }
    return [
      {
        filename: filename ?? language,
        code,
        language,
        panelClassName,
        paneStyle,
        highlightLines,
        highlightClassName,
        showLineNumbers,
      },
    ];
  }, [
    code,
    filename,
    files,
    highlightClassName,
    highlightLines,
    language,
    paneStyle,
    panelClassName,
    showLineNumbers,
  ]);
  const [activeTab, setActiveTab] = React.useState(() => normalizedFiles[0]?.filename ?? "");
  const activeFile =
    normalizedFiles.find((file) => file.filename === activeTab) ?? normalizedFiles[0];

  if (!activeFile) {
    return null;
  }

  const renderPane = (file: CodeBlockFile) => (
    <CodeBlockPane
      code={file.code}
      language={file.language}
      showCopy={false}
      className={file.panelClassName}
      style={file.paneStyle}
      highlightLines={file.highlightLines}
      highlightClassName={file.highlightClassName}
      showLineNumbers={file.showLineNumbers}
    />
  );

  return (
    <div
      data-slot="code-block"
      className={cn("overflow-hidden rounded-none border bg-muted/50 text-sm", className)}
      {...props}
    >
      {normalizedFiles.length > 1 ? (
        <Tabs value={activeFile.filename} onValueChange={setActiveTab} className="gap-0">
          <div className="flex items-center justify-between gap-2 border-b">
            <TabsList variant="line" className="h-auto flex-none p-0">
              {normalizedFiles.map((file) => (
                <TabsTrigger
                  key={file.filename}
                  value={file.filename}
                  className="h-auto flex-none px-3 py-2 group-data-horizontal/tabs:after:bottom-0"
                >
                  {file.filename}
                </TabsTrigger>
              ))}
            </TabsList>
            <CodeBlockCopyButton code={activeFile.code} className="mr-1" />
          </div>
          {normalizedFiles.map((file) => (
            <TabsContent key={file.filename} value={file.filename}>
              {renderPane(file)}
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 border-b">
            <span className="px-3 py-2 text-xs font-medium text-muted-foreground">
              {activeFile.filename}
            </span>
            <CodeBlockCopyButton code={activeFile.code} className="mr-1" />
          </div>
          {renderPane(activeFile)}
        </>
      )}
    </div>
  );
}

export { CodeBlock, CodeBlockCopyButton, CodeBlockPane };
