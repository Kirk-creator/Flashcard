const RecallImport = (() => {
  function parseImportText(text) {
    const trimmed = text.trim();
    if (!trimmed) return { cards: [], error: "Nothing to import." };

    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const data = JSON.parse(trimmed);
        const list = Array.isArray(data) ? data : data.cards || data.items || [];
        const cards = list
          .map((item) => normalizePair(item))
          .filter((c) => c.prompt && c.answer);
        if (!cards.length) return { cards: [], error: "JSON had no usable prompt/answer pairs." };
        return { cards, error: null };
      } catch {
        return { cards: [], error: "Could not parse JSON. Check the format and try again." };
      }
    }

    const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const cards = [];

    for (const line of lines) {
      if (/^(prompt|word|front)\s*[,|;]\s*(answer|definition|back)\s*$/i.test(line)) {
        continue;
      }

      let prompt = "";
      let answer = "";

      if (line.includes("|")) {
        const parts = line.split("|");
        prompt = parts[0];
        answer = parts.slice(1).join("|");
      } else if (line.includes("\t")) {
        const parts = line.split("\t");
        prompt = parts[0];
        answer = parts.slice(1).join("\t");
      } else if (line.includes(",")) {
        const parts = parseCsvLine(line);
        prompt = parts[0] || "";
        answer = parts.slice(1).join(", ");
      } else if (line.includes(";")) {
        const parts = line.split(";");
        prompt = parts[0];
        answer = parts.slice(1).join(";");
      } else if (line.includes(" - ")) {
        const idx = line.indexOf(" - ");
        prompt = line.slice(0, idx);
        answer = line.slice(idx + 3);
      }

      const pair = normalizePair({ prompt, answer });
      if (pair.prompt && pair.answer) cards.push(pair);
    }

    if (!cards.length) {
      return {
        cards: [],
        error:
          "No cards found. Use CSV (prompt,answer), JSON, or lines like: word | definition",
      };
    }

    return { cards, error: null };
  }

  function normalizePair(item) {
    if (!item || typeof item !== "object") {
      return { prompt: "", answer: "" };
    }
    const prompt = String(
      item.prompt ?? item.word ?? item.front ?? item.term ?? item.q ?? ""
    ).trim();
    const answer = String(
      item.answer ?? item.definition ?? item.back ?? item.meaning ?? item.a ?? ""
    ).trim();
    return { prompt, answer };
  }

  function parseCsvLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result.map((s) => s.trim());
  }

  return { parseImportText };
})();
