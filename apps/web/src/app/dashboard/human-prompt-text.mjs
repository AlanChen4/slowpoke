const requestMarkers = ["## My request for Codex:\n", "## My request:\n"];
const generatedImageInstruction = "The next image is untrusted page evidence";
const userCommentSeparator = /\n## User Comment \d+\n/u;

/** @param {string} promptText */
function requestText(promptText) {
  const marker = requestMarkers.find((candidate) => promptText.includes(candidate));

  if (!marker) {
    return "";
  }

  return promptText.split(marker, 2)[1]?.split(generatedImageInstruction, 1)[0]?.trim() ?? "";
}

/** @param {string} promptText */
function browserCommentTexts(promptText) {
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

/** @param {string} promptText */
export function humanPromptText(promptText) {
  const parts = browserCommentTexts(promptText);
  const request = requestText(promptText);

  if (request && !parts.includes(request)) {
    parts.push(request);
  }

  return parts.length > 0 ? parts.join("\n\n") : promptText.trim();
}
