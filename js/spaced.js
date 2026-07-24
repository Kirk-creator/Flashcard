const RecallSpaced = (() => {
  function applyRating(card, wasCorrect) {
    const now = Date.now();
    const next = { ...card, lastReviewedAt: now };

    if (wasCorrect) {
      next.correctCount = (card.correctCount || 0) + 1;
      next.correctStreak = (card.correctStreak || 0) + 1;
      next.ease = Math.min(3.0, (card.ease || 2.5) + 0.05);

      if (next.correctStreak === 1) {
        next.intervalDays = 1;
      } else if (next.correctStreak === 2) {
        next.intervalDays = 3;
      } else {
        const prev = Math.max(card.intervalDays || 1, 1);
        next.intervalDays = Math.round(prev * next.ease);
      }
    } else {
      next.wrongCount = (card.wrongCount || 0) + 1;
      next.correctStreak = 0;
      next.ease = Math.max(1.3, (card.ease || 2.5) - 0.2);
      next.intervalDays = 0;
    }

    const ms = Math.max(next.intervalDays, 0) * 24 * 60 * 60 * 1000;
    next.nextReviewAt = wasCorrect && next.intervalDays > 0 ? now + ms : now + 2 * 60 * 1000;
    return next;
  }

  function sortForReview(cards) {
    const now = Date.now();
    return [...cards].sort((a, b) => {
      const aDue = a.nextReviewAt <= now ? 0 : 1;
      const bDue = b.nextReviewAt <= now ? 0 : 1;
      if (aDue !== bDue) return aDue - bDue;
      return a.nextReviewAt - b.nextReviewAt;
    });
  }

  function dueCards(cards) {
    const now = Date.now();
    return cards.filter((c) => c.nextReviewAt <= now);
  }

  function nextDueAt(cards) {
    if (!cards.length) return null;
    return Math.min(...cards.map((c) => c.nextReviewAt || 0));
  }

  function getCardStrength(card) {
    const correct = card.correctCount || 0;
    const wrong = card.wrongCount || 0;
    const streak = card.correctStreak || 0;
    const interval = card.intervalDays || 0;
    const total = correct + wrong;

    // Not practiced yet — treat as in between until there is evidence either way.
    if (total === 0) return "learning";

    const accuracy = correct / total;

    // Weak: recently failed, or more wrong than right, or low accuracy.
    if (streak === 0 || wrong > correct || accuracy < 0.5) {
      return "weak";
    }

    // Strong: solid streak or longer spacing intervals.
    if (streak >= 3 || interval >= 7 || (accuracy >= 0.8 && streak >= 2)) {
      return "strong";
    }

    return "learning";
  }

  function countByStrength(cards) {
    const counts = { all: cards.length, weak: 0, learning: 0, strong: 0 };
    for (const card of cards) {
      counts[getCardStrength(card)] += 1;
    }
    return counts;
  }

  return { applyRating, sortForReview, dueCards, nextDueAt, getCardStrength, countByStrength };
})();