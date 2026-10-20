const RecallStorage = (() => {
  const STORAGE_KEY = "recall-flashcards-v1";

  function uid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function defaultState() {
    return {
      sets: [],
      settings: {
        showPromptFirst: true,
        darkMode: false,
      },
      builtinCatalogVersion: 0,
    };
  }

  function readStoredState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.sets)) return defaultState();
      return {
        sets: parsed.sets,
        settings: {
          showPromptFirst: parsed.settings?.showPromptFirst !== false,
          darkMode: Boolean(parsed.settings?.darkMode),
        },
        builtinCatalogVersion: Number(parsed.builtinCatalogVersion) || 0,
      };
    } catch {
      return defaultState();
    }
  }

  function freshBuiltinCard(card, now) {
    return {
      id: card.id,
      prompt: String(card.prompt || "").trim(),
      answer: String(card.answer || "").trim(),
      correctStreak: 0,
      wrongCount: 0,
      correctCount: 0,
      intervalDays: 0,
      ease: 2.5,
      nextReviewAt: now,
      lastReviewedAt: null,
    };
  }

  function applyBuiltinCatalog(state) {
    const catalog = typeof RecallBuiltin === "undefined" ? null : RecallBuiltin;
    if (!catalog || !Array.isArray(catalog.sets)) return state;
    const version = Number(catalog.version) || 1;
    if ((state.builtinCatalogVersion || 0) >= version) return state;

    const existing = new Set(state.sets.map((set) => set.id));
    const now = Date.now();
    for (const source of catalog.sets) {
      if (!source || existing.has(source.id)) continue;
      const cards = (source.cards || [])
        .map((card) => freshBuiltinCard(card, now))
        .filter((card) => card.prompt && card.answer);
      state.sets.push({
        id: source.id,
        title: source.title,
        description: source.description || "",
        builtinWeek: source.week,
        createdAt: now,
        updatedAt: now,
        cards,
      });
    }
    state.builtinCatalogVersion = version;
    return state;
  }

  function loadState() {
    return applyBuiltinCatalog(readStoredState());
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function createSet(title, description = "") {
    const now = Date.now();
    return {
      id: uid(),
      title: title.trim() || "Untitled set",
      description: description.trim(),
      createdAt: now,
      updatedAt: now,
      cards: [],
    };
  }

  function createCard(prompt, answer) {
    const now = Date.now();
    return {
      id: uid(),
      prompt: prompt.trim(),
      answer: answer.trim(),
      correctStreak: 0,
      wrongCount: 0,
      correctCount: 0,
      intervalDays: 0,
      ease: 2.5,
      nextReviewAt: now,
      lastReviewedAt: null,
    };
  }

  function getSet(state, setId) {
    return state.sets.find((s) => s.id === setId) || null;
  }

  function countDueCards(set) {
    const now = Date.now();
    return set.cards.filter((c) => c.nextReviewAt <= now).length;
  }

  function exportSetAsJson(set) {
    return JSON.stringify(
      {
        title: set.title,
        description: set.description,
        cards: set.cards.map((c) => ({ prompt: c.prompt, answer: c.answer })),
      },
      null,
      2
    );
  }

  function exportSetAsCsv(set) {
    const escape = (value) => `"${String(value).replaceAll('"', '""')}"`;
    const rows = [["prompt", "answer"], ...set.cards.map((c) => [c.prompt, c.answer])];
    return rows.map((row) => row.map(escape).join(",")).join("\n");
  }

  return {
    loadState,
    saveState,
    createSet,
    createCard,
    getSet,
    countDueCards,
    exportSetAsJson,
    exportSetAsCsv,
  };
})();
