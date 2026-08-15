export function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => item?.speaker && item?.text)
    .slice(-16)
    .map((item) => ({ speaker: item.speaker, text: String(item.text) }));
}

function repairPartialJson(rawText) {
  const cleaned = String(rawText || '').trim();
  if (!cleaned) return cleaned;

  let repaired = cleaned;
  const openBrackets = (repaired.match(/\[/g) || []).length - (repaired.match(/\]/g) || []).length;
  const openBraces = (repaired.match(/{/g) || []).length - (repaired.match(/}/g) || []).length;

  if (openBrackets > 0) repaired += ']'.repeat(openBrackets);
  if (openBraces > 0) repaired += '}'.repeat(openBraces);

  return repaired;
}

function coerceReplyArray(items, desiredRounds) {
  const parsed = items
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      speaker: String(item.speaker || 'Nova').trim() || 'Nova',
      text: String(item.text || '').trim()
    }))
    .filter((item) => item.text);

  return parsed.slice(0, desiredRounds);
}

export function parseGeneratedReplies(rawText, desiredRounds) {
  const cleaned = String(rawText || '').trim();
  if (!cleaned) return [];

  const candidates = new Set([cleaned, repairPartialJson(cleaned)]);

  for (const candidate of candidates) {
    try {
      const json = JSON.parse(candidate);
      if (Array.isArray(json)) {
        const parsed = coerceReplyArray(json, desiredRounds);
        if (parsed.length) return parsed;
      }
    } catch {
      // fall through to more forgiving parsing
    }
  }

  const lines = cleaned
    .split(/\n+/)
    .map((line) => line.replace(/^[-*\d.\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, desiredRounds);

  return lines.map((line, index) => ({
    speaker: ['Nova', 'Astra', 'Slate'][index % 3],
    text: line
  }));
}
