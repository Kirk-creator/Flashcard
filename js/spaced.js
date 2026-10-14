const RecallSpaced = (() => {
  /**
   * A correct answer moves up one stage. A wrong answer moves back one stage.
   * Stages: 0 = 1 day, 1 = 1 day, 2 = 3 days, then previous interval × ease.
   * A reviewed card is never due again sooner than one day.
   */
  function intervalForStreak(streak, previousIntervalDays, ease) {
    if (streak <= 1) return 1;
    if (streak === 2) return 3;
    const prev = Math.max(previousIntervalDays || 1, 1);
    return Math.round(prev * ease);
  }

  function applyRating(card, wasCorrect) {
    const now = Date.now();
    const next = { ...card, lastReviewedAt: now };

    if (wasCorrect) {
      next.correctCount = (card.correctCount || 0) + 1;
      next.correctStreak = (card.correctStreak || 0) + 1;
      next.ease = Math.min(3.0, (card.ease || 2.5) + 0.05);
      const history = Array.isArray(card.intervalHistory) ? card.intervalHistory.slice() : [];
      history.push(card.intervalDays || 0);
      next.intervalHistory = history;
      next.intervalDays = intervalForStreak(next.correctStreak, card.intervalDays, next.ease);
    } else {
      const easeUsed = card.ease || 2.5;
      next.wrongCount = (card.wrongCount || 0) + 1;
      next.correctStreak = Math.max(0, (card.correctStreak || 0) - 1);
      next.ease = Math.max(1.3, easeUsed - 0.2);
      const history = Array.isArray(card.intervalHistory) ? card.intervalHistory.slice() : [];
      if ((card.correctStreak || 0) > 0 && history.length) {
        next.intervalDays = history.pop();
        next.intervalHistory = history;
      } else if (next.correctStreak <= 2) {
        next.intervalDays = intervalForStreak(next.correctStreak);
        next.intervalHistory = history;
      } else {
        const current = Math.max(card.intervalDays || 1, 1);
        next.intervalDays = Math.max(1, Math.round(current / easeUsed));
        next.intervalHistory = history;
      }
    }

    const dayMs = 24 * 60 * 60 * 1000;
    next.intervalDays = Math.max(1, next.intervalDays || 0);
    next.nextReviewAt = now + next.intervalDays * dayMs;
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