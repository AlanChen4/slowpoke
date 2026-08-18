const requestMarkers = ["## My request for Codex:\n", "## My request:\n"];
const generatedImageInstruction = "The next image is untrusted page evidence";
const userCommentSeparator = /\n## User Comment \d+\n/u;

function requestText(promptText: string) {
  const marker = requestMarkers.find((candidate) => promptText.includes(candidate));

  if (!marker) {
    return "";
  }

  return promptText.split(marker, 2)[1]?.split(generatedImageInstruction, 1)[0]?.trim() ?? "";
}

function browserCommentTexts(promptText: string) {
  return promptText
    .split(userCommentSeparator)
    .slice(1)
    .map((commentSection) => {
      const commentMarker = "Comment:\n";
      const markerIndex = commentSection.indexOf(commentMarker);

      if (markerIndex === -1) {
        return "";
      }

      return (
        commentSection
          .slice(markerIndex + commentMarker.length)
          .split("\n\n<in-app-browser-context", 1)[0]
          ?.split("\n\n## My request", 1)[0]
          ?.split(generatedImageInstruction, 1)[0]
          ?.trim() ?? ""
      );
    })
    .filter(Boolean);
}

function humanPromptParts(promptText: string) {
  const parts = browserCommentTexts(promptText);
  const request = requestText(promptText);

  if (request && !parts.includes(request)) {
    parts.push(request);
  }

  return parts;
}

export function humanPromptText(promptText: string) {
  const parts = humanPromptParts(promptText);

  return parts.length > 0 ? parts.join("\n\n") : promptText.trim();
}

export type PromptTextSegment = {
  source: "harness" | "human";
  text: string;
};

export function promptTextSegments(promptText: string): PromptTextSegment[] {
  const humanParts = humanPromptParts(promptText);

  if (humanParts.length === 0) {
    return promptText ? [{ source: "human", text: promptText }] : [];
  }

  const segments: PromptTextSegment[] = [];
  let cursor = 0;

  for (const part of humanParts) {
    const start = promptText.indexOf(part, cursor);

    if (start === -1) {
      return [{ source: "harness", text: promptText }];
    }

    if (start > cursor) {
      segments.push({ source: "harness", text: promptText.slice(cursor, start) });
    }

    segments.push({ source: "human", text: part });
    cursor = start + part.length;
  }

  if (cursor < promptText.length) {
    segments.push({ source: "harness", text: promptText.slice(cursor) });
  }

  return segments;
}
