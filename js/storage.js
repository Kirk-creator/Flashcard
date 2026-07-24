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
      },
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.sets)) return defaultState();
      return {
        sets: parsed.sets,
        settings: {
          showPromptFirst: parsed.settings?.showPromptFirst !== false,
        },
      };
    } catch {
      return defaultState();
    }
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
