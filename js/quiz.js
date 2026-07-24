const RecallQuiz = (() => {
  function shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function buildMultipleChoice(card, allCards, showPromptFirst) {
    const correct = showPromptFirst ? card.answer : card.prompt;
    const pool = allCards
      .filter((c) => c.id !== card.id)
      .map((c) => (showPromptFirst ? c.answer : c.prompt))
      .filter((text) => text && text.toLowerCase() !== String(correct).toLowerCase());

    const unique = [...new Set(pool)];
    const distractors = shuffle(unique).slice(0, 3);
    while (distractors.length < 3) {
      distractors.push(`(option ${distractors.length + 1})`);
    }

    const options = shuffle([correct, ...distractors.slice(0, 3)]);
    return {
      questionSide: showPromptFirst ? card.prompt : card.answer,
      correct,
      options,
    };
  }

  function normalizeAnswer(text) {
    return String(text || "")
      .trim()
      .toLowerCase()
      .replace(/[’']/g, "'")
      .replace(/\s+/g, " ");
  }

  function answersMatch(userInput, expected) {
    return normalizeAnswer(userInput) === normalizeAnswer(expected);
  }

  return { buildMultipleChoice, answersMatch };
})();
