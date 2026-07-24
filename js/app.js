(() => {
  const {
    loadState,
    saveState,
    createSet,
    createCard,
    getSet,
    countDueCards,
    exportSetAsCsv,
    exportSetAsJson,
  } = RecallStorage;
  const { applyRating, sortForReview, dueCards, nextDueAt, getCardStrength, countByStrength } = RecallSpaced;
  const { parseImportText } = RecallImport;
  const { shuffle, buildMultipleChoice, answersMatch } = RecallQuiz;

  const appEl = document.getElementById("app");
  const topActions = document.getElementById("top-actions");
  const toastEl = document.getElementById("toast");

  let state = loadState();
  let route = { name: "home" };
  let session = null;
  let toastTimer = null;
  let cardStrengthFilter = "all";
  let setCardOrderIds = null;
  let setCardOrderForId = null;

  document.getElementById("btn-home").addEventListener("click", () => navigate({ name: "home" }));

  function persist() {
    saveState(state);
  }

  function navigate(next) {
    route = next;
    session = null;
    if (next.name !== "set") {
      cardStrengthFilter = "all";
      setCardOrderIds = null;
      setCardOrderForId = null;
    } else {
      // Fresh open — reshuffle the visible card order.
      setCardOrderIds = null;
      setCardOrderForId = null;
    }
    render();
  }

  function orderedSetCards(set) {
    const cardIds = set.cards.map((c) => c.id);
    const idSet = new Set(cardIds);

    if (setCardOrderForId !== set.id || !setCardOrderIds) {
      setCardOrderIds = shuffle(cardIds);
      setCardOrderForId = set.id;
    } else {
      setCardOrderIds = setCardOrderIds.filter((id) => idSet.has(id));
      for (const id of cardIds) {
        if (!setCardOrderIds.includes(id)) setCardOrderIds.push(id);
      }
    }

    return setCardOrderIds.map((id) => set.cards.find((c) => c.id === id)).filter(Boolean);
  }

  function toast(message) {
    toastEl.hidden = false;
    toastEl.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, 2400);
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function setTopActions(html) {
    topActions.innerHTML = html;
  }

  function render() {
    if (route.name === "home") renderHome();
    else if (route.name === "set") renderSetDetail();
    else if (route.name === "study") renderStudy();
    else if (route.name === "quiz") renderQuiz();
    else renderHome();
  }

  function renderHome() {
    setTopActions(`<button type="button" class="btn btn-primary" id="btn-new-set">New set</button>`);

    const sets = [...state.sets].sort((a, b) => b.updatedAt - a.updatedAt);

    appEl.innerHTML = `
      <section class="hero">
        <h1>Recall</h1>
        <p>Build flashcard sets, study with a flip, quiz yourself, and let spaced repetition bring hard cards back sooner.</p>
      </section>
      <div class="section-head">
        <div>
          <h2>Your sets</h2>
          <p class="muted">${sets.length ? "Saved on this device in your browser." : "No sets yet — create one to begin."}</p>
        </div>
      </div>
      ${
        sets.length
          ? `<div class="set-grid">${sets.map(setCardHtml).join("")}</div>`
          : `<div class="panel empty">Create your first flashcard set to start studying.</div>`
      }
    `;

    document.getElementById("btn-new-set")?.addEventListener("click", openNewSetModal);
    appEl.querySelectorAll("[data-set-id]").forEach((el) => {
      el.addEventListener("click", () => navigate({ name: "set", setId: el.dataset.setId }));
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate({ name: "set", setId: el.dataset.setId });
        }
      });
    });
  }

  function setCardHtml(set) {
    const due = countDueCards(set);
    return `
      <article class="set-card" data-set-id="${set.id}" tabindex="0" role="button">
        <h3>${escapeHtml(set.title)}</h3>
        <p class="muted">${escapeHtml(set.description || "No description")}</p>
        <div class="set-meta">
          <span class="chip">${set.cards.length} cards</span>
          <span class="chip due">${due} due</span>
        </div>
      </article>
    `;
  }

  function openNewSetModal() {
    showModal(`
      <h3>New flashcard set</h3>
      <form class="form-grid" id="form-new-set">
        <label>Title
          <input name="title" required maxlength="80" placeholder="e.g. Spanish verbs" />
        </label>
        <label>Description (optional)
          <textarea name="description" maxlength="240" placeholder="A short note about this set"></textarea>
        </label>
        <div class="btn-row">
          <button type="submit" class="btn btn-primary">Create</button>
          <button type="button" class="btn btn-ghost" data-close>Cancel</button>
        </div>
      </form>
    `);

    document.getElementById("form-new-set").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const set = createSet(fd.get("title"), fd.get("description"));
      state.sets.unshift(set);
      persist();
      closeModal();
      toast("Set created");
      navigate({ name: "set", setId: set.id });
    });
  }

  function strengthFilterLabel(filter = cardStrengthFilter) {
    if (filter === "weak") return "weak";
    if (filter === "strong") return "strong";
    if (filter === "learning") return "in between";
    return "all";
  }

  function cardsMatchingStrength(cards, filter = cardStrengthFilter) {
    if (filter === "all") return [...cards];
    return cards.filter((c) => getCardStrength(c) === filter);
  }

  function renderSetDetail() {
    const set = getSet(state, route.setId);
    if (!set) {
      navigate({ name: "home" });
      return;
    }

    setTopActions(`
      <button type="button" class="btn btn-ghost" id="btn-back">Back</button>
      <button type="button" class="btn btn-secondary" id="btn-edit-set">Edit set</button>
    `);

    const due = countDueCards(set);
    const orderedCards = orderedSetCards(set);
    const strengthCounts = countByStrength(set.cards);
    const filteredCards = cardsMatchingStrength(orderedCards);
    const filterLabel = strengthFilterLabel();
    const studyLabel =
      cardStrengthFilter === "all" ? "Study" : `Study ${filterLabel}`;
    const quizLabel = cardStrengthFilter === "all" ? "Quiz" : `Quiz ${filterLabel}`;

    const filterOptions = [
      { id: "all", label: "All words", count: strengthCounts.all },
      { id: "weak", label: "Weak", count: strengthCounts.weak },
      { id: "learning", label: "In between", count: strengthCounts.learning },
      { id: "strong", label: "Strong", count: strengthCounts.strong },
    ];

    const filterButtons = filterOptions
      .map(
        (opt) => `
      <button
        type="button"
        class="filter-btn strength-${opt.id} ${cardStrengthFilter === opt.id ? "active" : ""}"
        data-strength-filter="${opt.id}"
        aria-pressed="${cardStrengthFilter === opt.id}"
      >
        <span>${opt.label}</span>
        <span class="filter-count">${opt.count}</span>
      </button>`
      )
      .join("");

    appEl.innerHTML = `
      <section class="hero" style="padding-bottom: 1rem;">
        <h1>${escapeHtml(set.title)}</h1>
        <p>${escapeHtml(set.description || "Manage cards, import a list, then study or take a quiz.")}</p>
        <div class="btn-row">
          <button type="button" class="btn btn-primary" id="btn-study" ${filteredCards.length ? "" : "disabled"}>${studyLabel}</button>
          <button type="button" class="btn btn-secondary" id="btn-quiz" ${filteredCards.length ? "" : "disabled"}>${quizLabel}</button>
          <button type="button" class="btn btn-ghost" id="btn-add-card">Add card</button>
          <button type="button" class="btn btn-ghost" id="btn-import">Import</button>
          <button type="button" class="btn btn-ghost" id="btn-export">Export</button>
          <button type="button" class="btn btn-danger" id="btn-delete-set">Delete set</button>
        </div>
      </section>

      <div class="stats-bar">
        <span class="chip">${set.cards.length} cards</span>
        <span class="chip due">${due} due for review</span>
        <span class="chip strength-weak">${strengthCounts.weak} weak</span>
        <span class="chip strength-learning">${strengthCounts.learning} in between</span>
        <span class="chip strength-strong">${strengthCounts.strong} strong</span>
      </div>

      <div class="section-head">
        <div>
          <h2>Word list</h2>
          <p class="muted">Filter by strength, then study or browse the matching words.</p>
        </div>
      </div>

      ${
        set.cards.length
          ? `<div class="cards-layout">
              <aside class="strength-filter" aria-label="Filter word list by strength">
                <p class="filter-title">Word strength</p>
                ${filterButtons}
                <p class="filter-hint">Showing ${filteredCards.length} of ${set.cards.length}</p>
              </aside>
              <div class="card-list">
                ${
                  filteredCards.length
                    ? filteredCards.map((c) => cardRowHtml(c)).join("")
                    : `<div class="panel empty">No ${filterLabel} words yet. Try another filter, or study a bit so strengths can change.</div>`
                }
              </div>
            </div>`
          : `<div class="panel empty">No cards yet. Add one or import a list.</div>`
      }
    `;

    document.getElementById("btn-back").addEventListener("click", () => navigate({ name: "home" }));
    document.getElementById("btn-edit-set").addEventListener("click", () => openEditSetModal(set));
    document.getElementById("btn-study").addEventListener("click", () => startStudy(set.id));
    document.getElementById("btn-quiz").addEventListener("click", () => openQuizSetup(set));
    document.getElementById("btn-add-card").addEventListener("click", () => openCardModal(set));
    document.getElementById("btn-import").addEventListener("click", () => openImportModal(set));
    document.getElementById("btn-export").addEventListener("click", () => openExportModal(set));
    document.getElementById("btn-delete-set").addEventListener("click", () => {
      if (confirm(`Delete "${set.title}" and all its cards?`)) {
        state.sets = state.sets.filter((s) => s.id !== set.id);
        persist();
        toast("Set deleted");
        navigate({ name: "home" });
      }
    });

    appEl.querySelectorAll("[data-strength-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        cardStrengthFilter = btn.dataset.strengthFilter;
        render();
      });
    });

    appEl.querySelectorAll("[data-edit-card]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = set.cards.find((c) => c.id === btn.dataset.editCard);
        openCardModal(set, card);
      });
    });
    appEl.querySelectorAll("[data-delete-card]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = set.cards.find((c) => c.id === btn.dataset.deleteCard);
        if (!card) return;
        if (!confirm("Delete this card?")) return;
        set.cards = set.cards.filter((c) => c.id !== card.id);
        set.updatedAt = Date.now();
        persist();
        toast("Card deleted");
        render();
      });
    });
  }

  function strengthLabel(strength) {
    if (strength === "weak") return "Weak";
    if (strength === "strong") return "Strong";
    return "In between";
  }

  function cardRowHtml(card) {
    const strength = getCardStrength(card);
    return `
      <div class="card-row">
        <div>
          <div class="label">Prompt</div>
          <p>${escapeHtml(card.prompt)}</p>
        </div>
        <div>
          <div class="label">Answer</div>
          <p>${escapeHtml(card.answer)}</p>
          <p class="muted" style="margin-top:0.4rem;font-size:0.85rem;">
            ✓ ${card.correctCount || 0} · ✗ ${card.wrongCount || 0} · streak ${card.correctStreak || 0}
          </p>
          <span class="chip strength-${strength}">${strengthLabel(strength)}</span>
        </div>
        <div class="card-actions">
          <button type="button" class="btn btn-ghost" data-edit-card="${card.id}">Edit</button>
          <button type="button" class="btn btn-danger" data-delete-card="${card.id}">Delete</button>
        </div>
      </div>
    `;
  }

  function openEditSetModal(set) {
    showModal(`
      <h3>Edit set</h3>
      <form class="form-grid" id="form-edit-set">
        <label>Title
          <input name="title" required maxlength="80" value="${escapeHtml(set.title)}" />
        </label>
        <label>Description
          <textarea name="description" maxlength="240">${escapeHtml(set.description || "")}</textarea>
        </label>
        <div class="btn-row">
          <button type="submit" class="btn btn-primary">Save</button>
          <button type="button" class="btn btn-ghost" data-close>Cancel</button>
        </div>
      </form>
    `);

    document.getElementById("form-edit-set").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      set.title = String(fd.get("title")).trim() || set.title;
      set.description = String(fd.get("description")).trim();
      set.updatedAt = Date.now();
      persist();
      closeModal();
      toast("Set updated");
      render();
    });
  }

  function openCardModal(set, card = null) {
    const editing = Boolean(card);
    showModal(`
      <h3>${editing ? "Edit card" : "Add card"}</h3>
      <form class="form-grid" id="form-card">
        <label>Prompt / word
          <textarea name="prompt" required placeholder="e.g. ephemera">${escapeHtml(card?.prompt || "")}</textarea>
        </label>
        <label>Answer / definition
          <textarea name="answer" required placeholder="e.g. things that exist only briefly">${escapeHtml(card?.answer || "")}</textarea>
        </label>
        <div class="btn-row">
          <button type="submit" class="btn btn-primary">${editing ? "Save" : "Add"}</button>
          <button type="button" class="btn btn-ghost" data-close>Cancel</button>
        </div>
      </form>
    `);

    document.getElementById("form-card").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const prompt = String(fd.get("prompt"));
      const answer = String(fd.get("answer"));
      if (editing) {
        card.prompt = prompt.trim();
        card.answer = answer.trim();
      } else {
        set.cards.push(createCard(prompt, answer));
      }
      set.updatedAt = Date.now();
      persist();
      closeModal();
      toast(editing ? "Card updated" : "Card added");
      render();
    });
  }

  function openImportModal(set) {
    showModal(`
      <h3>Import cards</h3>
      <p class="muted">Paste CSV, JSON, or lines like <code>word | definition</code>. You can also upload a .csv or .json file.</p>
      <form class="form-grid" id="form-import">
        <label>Upload file (optional)
          <input type="file" id="import-file" accept=".csv,.json,.txt,text/csv,application/json,text/plain" />
        </label>
        <label>Paste text
          <textarea name="text" placeholder="hola, hello&#10;gracias | thank you"></textarea>
        </label>
        <div class="btn-row">
          <button type="submit" class="btn btn-primary">Import</button>
          <button type="button" class="btn btn-ghost" data-close>Cancel</button>
        </div>
      </form>
    `);

    const fileInput = document.getElementById("import-file");
    const form = document.getElementById("form-import");
    const textarea = form.querySelector('textarea[name="text"]');

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      textarea.value = await file.text();
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const { cards, error } = parseImportText(textarea.value);
      if (error) {
        toast(error);
        return;
      }
      for (const pair of cards) {
        set.cards.push(createCard(pair.prompt, pair.answer));
      }
      set.updatedAt = Date.now();
      persist();
      closeModal();
      toast(`Imported ${cards.length} card${cards.length === 1 ? "" : "s"}`);
      render();
    });
  }

  function openExportModal(set) {
    showModal(`
      <h3>Export set</h3>
      <p class="muted">Download your cards, or copy JSON.</p>
      <div class="btn-row" style="margin-top:1rem;">
        <button type="button" class="btn btn-primary" id="btn-dl-csv">Download CSV</button>
        <button type="button" class="btn btn-secondary" id="btn-dl-json">Download JSON</button>
        <button type="button" class="btn btn-ghost" id="btn-copy-json">Copy JSON</button>
        <button type="button" class="btn btn-ghost" data-close>Close</button>
      </div>
    `);

    document.getElementById("btn-dl-csv").addEventListener("click", () => {
      downloadText(`${slug(set.title)}.csv`, exportSetAsCsv(set), "text/csv");
      toast("CSV downloaded");
    });
    document.getElementById("btn-dl-json").addEventListener("click", () => {
      downloadText(`${slug(set.title)}.json`, exportSetAsJson(set), "application/json");
      toast("JSON downloaded");
    });
    document.getElementById("btn-copy-json").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(exportSetAsJson(set));
        toast("Copied to clipboard");
      } catch {
        toast("Could not copy — try Download JSON instead");
      }
    });
  }

  function slug(text) {
    return (
      String(text)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "flashcards"
    );
  }

  function downloadText(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ---------------- Study mode ---------------- */

  function formatNextDue(timestamp) {
    if (timestamp == null) return "soon";
    const ms = timestamp - Date.now();
    if (ms <= 0) return "now";
    const mins = Math.max(1, Math.round(ms / 60000));
    if (mins < 60) return `in about ${mins} minute${mins === 1 ? "" : "s"}`;
    const hours = Math.round(mins / 60);
    if (hours < 48) return `in about ${hours} hour${hours === 1 ? "" : "s"}`;
    const days = Math.round(hours / 24);
    return `in about ${days} day${days === 1 ? "" : "s"}`;
  }

  function startStudy(setId, options = {}) {
    const set = getSet(state, setId);
    if (!set || !set.cards.length) return;

    const forceAll = Boolean(options.forceAll);
    const strengthFilter = options.strengthFilter || cardStrengthFilter;
    const pool = cardsMatchingStrength(forceAll ? [...set.cards] : dueCards(set.cards), strengthFilter);
    const queue = shuffle(sortForReview(pool));
    route = { name: "study", setId };

    if (!queue.length) {
      session = {
        type: "study",
        setId,
        caughtUp: true,
        forceAll: false,
        strengthFilter,
        showPromptFirst: state.settings.showPromptFirst,
        queue: [],
        index: 0,
        history: [],
        correct: 0,
        wrong: 0,
        done: false,
      };
      render();
      return;
    }

    session = {
      type: "study",
      setId,
      caughtUp: false,
      forceAll,
      strengthFilter,
      queue: queue.map((c) => c.id),
      index: 0,
      flipped: false,
      showPromptFirst: state.settings.showPromptFirst,
      correct: 0,
      wrong: 0,
      done: false,
      history: [],
    };
    render();
  }

  function renderCaughtUp(set, kind) {
    const strengthFilter = session?.strengthFilter || cardStrengthFilter;
    const filterLabel = strengthFilterLabel(strengthFilter);
    const scoped = strengthFilter !== "all";
    const when = formatNextDue(nextDueAt(cardsMatchingStrength(set.cards, strengthFilter)));
    const exitId = kind === "quiz" ? "btn-exit-quiz" : "btn-exit-study";
    const againLabel = kind === "quiz"
      ? scoped ? `Quiz all ${filterLabel} anyway` : "Quiz all anyway"
      : scoped ? `Study all ${filterLabel} anyway` : "Study all anyway";

    setTopActions(`
      <button type="button" class="btn btn-ghost" id="${exitId}">Back to set</button>
    `);
    document.getElementById(exitId).addEventListener("click", () => {
      navigate({ name: "set", setId: set.id });
    });

    appEl.innerHTML = `
      <section class="hero session-summary">
        <h1>You’re caught up</h1>
        <p>${
          scoped
            ? `No ${filterLabel} cards are due for review right now.`
            : "No cards are due for review right now."
        }</p>
        <p class="muted">Next review ${when}.</p>
        <div class="btn-row">
          <button type="button" class="btn btn-primary" id="btn-force-all">${againLabel}</button>
          <button type="button" class="btn btn-secondary" id="btn-back-set-caught">Back to set</button>
        </div>
      </section>
    `;

    document.getElementById("btn-back-set-caught").addEventListener("click", () => {
      navigate({ name: "set", setId: set.id });
    });
    document.getElementById("btn-force-all").addEventListener("click", () => {
      if (kind === "quiz") {
        startQuiz(set.id, session.mode, session.showPromptFirst, {
          forceAll: true,
          strengthFilter,
        });
      } else {
        startStudy(set.id, { forceAll: true, strengthFilter });
      }
    });
  }

  function renderStudy() {
    const set = getSet(state, route.setId);
    if (!set || !session || session.type !== "study") {
      navigate({ name: "set", setId: route.setId });
      return;
    }

    if (session.caughtUp) {
      renderCaughtUp(set, "study");
      return;
    }

    setTopActions(`
      <button type="button" class="btn btn-ghost" id="btn-exit-study">Exit study</button>
    `);
    document.getElementById("btn-exit-study").addEventListener("click", () => {
      navigate({ name: "set", setId: set.id });
    });

    if (session.done || session.index >= session.queue.length) {
      renderSessionSummary(set, "Study complete");
      return;
    }

    const cardId = session.queue[session.index];
    const card = set.cards.find((c) => c.id === cardId);
    if (!card) {
      session.index += 1;
      render();
      return;
    }

    const front = session.showPromptFirst ? card.prompt : card.answer;
    const back = session.showPromptFirst ? card.answer : card.prompt;
    const frontTag = session.showPromptFirst ? "Prompt" : "Answer";
    const backTag = session.showPromptFirst ? "Answer" : "Prompt";
    const progress = Math.round((session.index / session.queue.length) * 100);
    const canGoBack = session.history.length > 0;

    appEl.innerHTML = `
      <div class="study-wrap">
        <div class="settings-row">
          <label class="toggle">
            <input type="checkbox" id="toggle-side" ${session.showPromptFirst ? "checked" : ""} />
            Show prompt first
          </label>
          <span class="chip">${session.index + 1} / ${session.queue.length}</span>
          <span class="chip">✓ ${session.correct} · ✗ ${session.wrong}</span>
        </div>
        <div class="progress-line"><span style="width:${progress}%"></span></div>

        <div class="flashcard ${session.flipped ? "flipped" : ""}" id="flashcard" tabindex="0" role="button" aria-label="Flip card">
          <div class="flashcard-inner">
            <div class="face front">
              <div class="face-tag">${frontTag}</div>
              <p class="face-text">${escapeHtml(front)}</p>
              <p class="hint">Tap to flip</p>
            </div>
            <div class="face back">
              <div class="face-tag">${backTag}</div>
              <p class="face-text">${escapeHtml(back)}</p>
              <p class="hint">Tap to flip back</p>
            </div>
          </div>
        </div>

        <div class="study-actions">
          <div class="btn-row study-nav">
            <button type="button" class="btn btn-ghost" id="btn-prev-card" ${canGoBack ? "" : "disabled"}>Previous</button>
            <button type="button" class="btn btn-secondary" id="btn-shuffle" ${session.queue.length - session.index > 1 ? "" : "disabled"}>Shuffle</button>
          </div>
          <div class="btn-row study-rate">
            <button type="button" class="btn btn-warn" id="btn-wrong">Got it wrong</button>
            <button type="button" class="btn btn-ok" id="btn-right">Got it right</button>
          </div>
        </div>
      </div>
    `;

    const flip = () => {
      session.flipped = !session.flipped;
      render();
    };

    document.getElementById("flashcard").addEventListener("click", flip);
    document.getElementById("flashcard").addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        flip();
      }
    });

    document.getElementById("toggle-side").addEventListener("change", (e) => {
      session.showPromptFirst = e.target.checked;
      state.settings.showPromptFirst = e.target.checked;
      session.flipped = false;
      persist();
      render();
    });

    document.getElementById("btn-right").addEventListener("click", () => rateStudyCard(set, card, true));
    document.getElementById("btn-wrong").addEventListener("click", () => rateStudyCard(set, card, false));
    document.getElementById("btn-prev-card").addEventListener("click", () => goToPreviousStudyCard(set));
    document.getElementById("btn-shuffle").addEventListener("click", () => shuffleStudyQueue());
  }

  function shuffleStudyQueue() {
    if (!session || session.type !== "study") return;
    const remaining = session.queue.slice(session.index);
    if (remaining.length <= 1) return;
    session.queue = [...session.queue.slice(0, session.index), ...shuffle(remaining)];
    session.flipped = false;
    toast("Remaining cards shuffled");
    render();
  }

  function rateStudyCard(set, card, wasCorrect) {
    // Save a snapshot so Previous can undo this rating.
    session.history.push({
      cardId: card.id,
      cardBefore: { ...card },
      wasCorrect,
      flipped: session.flipped,
    });

    const updated = applyRating(card, wasCorrect);
    const idx = set.cards.findIndex((c) => c.id === card.id);
    set.cards[idx] = updated;
    set.updatedAt = Date.now();
    persist();

    if (wasCorrect) session.correct += 1;
    else session.wrong += 1;

    session.index += 1;
    session.flipped = false;
    if (session.index >= session.queue.length) session.done = true;
    render();
  }

  function goToPreviousStudyCard(set) {
    if (!session.history.length) return;

    const last = session.history.pop();
    const idx = set.cards.findIndex((c) => c.id === last.cardId);
    if (idx !== -1) {
      set.cards[idx] = { ...last.cardBefore };
      set.updatedAt = Date.now();
      persist();
    }

    if (last.wasCorrect) session.correct = Math.max(0, session.correct - 1);
    else session.wrong = Math.max(0, session.wrong - 1);

    session.done = false;
    session.index = Math.max(0, session.index - 1);
    // Make sure index points at the undone card
    const expectedIndex = session.queue.indexOf(last.cardId);
    if (expectedIndex !== -1) session.index = expectedIndex;
    session.flipped = Boolean(last.flipped);
    render();
  }

  /* ---------------- Quiz mode ---------------- */

  function openQuizSetup(set) {
    showModal(`
      <h3>Quiz setup</h3>
      <form class="form-grid" id="form-quiz">
        <label>Question type
          <select name="mode">
            <option value="multiple">Multiple choice</option>
            <option value="typed">Type the answer</option>
            <option value="mixed">Mixed</option>
          </select>
        </label>
        <label class="toggle" style="justify-self:start;">
          <input type="checkbox" name="promptFirst" ${state.settings.showPromptFirst ? "checked" : ""} />
          Show prompt first (guess the answer)
        </label>
        <p class="muted">Uncheck to show the answer first and guess the prompt/word.</p>
        <div class="btn-row">
          <button type="submit" class="btn btn-primary">Start quiz</button>
          <button type="button" class="btn btn-ghost" data-close>Cancel</button>
        </div>
      </form>
    `);

    document.getElementById("form-quiz").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const mode = String(fd.get("mode"));
      const showPromptFirst = fd.get("promptFirst") === "on";
      state.settings.showPromptFirst = showPromptFirst;
      persist();
      closeModal();
      startQuiz(set.id, mode, showPromptFirst, { forceAll: false });
    });
  }

  function startQuiz(setId, mode, showPromptFirst, options = {}) {
    const set = getSet(state, setId);
    if (!set || !set.cards.length) return;

    const forceAll = Boolean(options.forceAll);
    const strengthFilter = options.strengthFilter || cardStrengthFilter;
    const pool = cardsMatchingStrength(forceAll ? [...set.cards] : dueCards(set.cards), strengthFilter);
    const queue = shuffle(sortForReview(pool));
    route = { name: "quiz", setId };

    if (!queue.length) {
      session = {
        type: "quiz",
        setId,
        mode,
        showPromptFirst,
        caughtUp: true,
        forceAll: false,
        strengthFilter,
        queue: [],
        index: 0,
        correct: 0,
        wrong: 0,
        done: false,
        feedback: null,
        mc: null,
      };
      render();
      return;
    }

    session = {
      type: "quiz",
      setId,
      mode,
      showPromptFirst,
      caughtUp: false,
      forceAll,
      strengthFilter,
      queue: queue.map((c) => c.id),
      index: 0,
      correct: 0,
      wrong: 0,
      done: false,
      feedback: null,
      mc: null,
    };
    prepareQuizQuestion(set);
    render();
  }

  function prepareQuizQuestion(set) {
    if (!session || session.index >= session.queue.length) {
      session.done = true;
      return;
    }
    const card = set.cards.find((c) => c.id === session.queue[session.index]);
    if (!card) {
      session.index += 1;
      prepareQuizQuestion(set);
      return;
    }

    let qMode = session.mode;
    if (qMode === "mixed") {
      qMode = Math.random() < 0.5 ? "multiple" : "typed";
    }
    session.currentMode = qMode;
    session.feedback = null;
    session.mc =
      qMode === "multiple"
        ? buildMultipleChoice(card, set.cards, session.showPromptFirst)
        : null;
  }

  function renderQuiz() {
    const set = getSet(state, route.setId);
    if (!set || !session || session.type !== "quiz") {
      navigate({ name: "set", setId: route.setId });
      return;
    }

    if (session.caughtUp) {
      renderCaughtUp(set, "quiz");
      return;
    }

    setTopActions(`
      <button type="button" class="btn btn-ghost" id="btn-exit-quiz">Exit quiz</button>
    `);
    document.getElementById("btn-exit-quiz").addEventListener("click", () => {
      navigate({ name: "set", setId: set.id });
    });

    if (session.done || session.index >= session.queue.length) {
      renderSessionSummary(set, "Quiz complete");
      return;
    }

    const card = set.cards.find((c) => c.id === session.queue[session.index]);
    const progress = Math.round((session.index / session.queue.length) * 100);
    const question = session.showPromptFirst ? card.prompt : card.answer;
    const expected = session.showPromptFirst ? card.answer : card.prompt;
    const questionTag = session.showPromptFirst ? "Prompt" : "Answer";

    let body = "";
    if (session.currentMode === "multiple") {
      body = `
        <div class="quiz-options" id="quiz-options">
          ${session.mc.options
            .map((opt, i) => {
              let cls = "quiz-option";
              if (session.feedback) {
                if (opt === session.mc.correct) cls += " correct";
                else if (opt === session.feedback.chosen && !session.feedback.ok) cls += " wrong";
              }
              return `<button type="button" class="${cls}" data-opt="${i}" ${
                session.feedback ? "disabled" : ""
              }>${escapeHtml(opt)}</button>`;
            })
            .join("")}
        </div>
      `;
    } else {
      body = `
        <form class="typed-form" id="typed-form">
          <label>Your answer
            <input name="answer" autocomplete="off" ${session.feedback ? "disabled" : ""} placeholder="Type exactly..." value="${
              session.feedback ? escapeHtml(session.feedback.chosen || "") : ""
            }" />
          </label>
          ${
            session.feedback
              ? ""
              : `<button type="submit" class="btn btn-primary">Check</button>`
          }
        </form>
      `;
    }

    appEl.innerHTML = `
      <div class="study-wrap">
        <div class="settings-row">
          <span class="chip">${session.currentMode === "multiple" ? "Multiple choice" : "Typed answer"}</span>
          <span class="chip">${session.index + 1} / ${session.queue.length}</span>
          <span class="chip">✓ ${session.correct} · ✗ ${session.wrong}</span>
        </div>
        <div class="progress-line"><span style="width:${progress}%"></span></div>

        <div class="panel" style="width:min(100%,520px);text-align:center;">
          <div class="face-tag">${questionTag}</div>
          <p class="face-text">${escapeHtml(question)}</p>
        </div>

        ${body}

        ${
          session.feedback
            ? `<div class="result-banner ${session.feedback.ok ? "ok" : "bad"}">
                ${
                  session.feedback.ok
                    ? "Correct!"
                    : `Not quite — answer: ${escapeHtml(expected)}`
                }
              </div>
              <button type="button" class="btn btn-primary" id="btn-next-q">Next</button>`
            : ""
        }
      </div>
    `;

    if (!session.feedback && session.currentMode === "multiple") {
      appEl.querySelectorAll("[data-opt]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const chosen = session.mc.options[Number(btn.dataset.opt)];
          finishQuizAnswer(set, card, chosen, chosen === session.mc.correct);
        });
      });
    }

    if (!session.feedback && session.currentMode === "typed") {
      const form = document.getElementById("typed-form");
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const value = new FormData(form).get("answer");
        const ok = answersMatch(value, expected);
        finishQuizAnswer(set, card, String(value || ""), ok);
      });
      form.querySelector("input")?.focus();
    }

    document.getElementById("btn-next-q")?.addEventListener("click", () => {
      session.index += 1;
      if (session.index >= session.queue.length) session.done = true;
      else prepareQuizQuestion(set);
      render();
    });
  }

  function finishQuizAnswer(set, card, chosen, ok) {
    const updated = applyRating(card, ok);
    const idx = set.cards.findIndex((c) => c.id === card.id);
    set.cards[idx] = updated;
    set.updatedAt = Date.now();
    persist();

    if (ok) session.correct += 1;
    else session.wrong += 1;
    session.feedback = { ok, chosen };
    render();
  }

  function renderSessionSummary(set, title) {
    const total = session.correct + session.wrong;
    const pct = total ? Math.round((session.correct / total) * 100) : 0;
    const canGoBack = session.type === "study" && session.history?.length;

    appEl.innerHTML = `
      <section class="hero session-summary">
        <h1>${escapeHtml(title)}</h1>
        <p class="big">${pct}%</p>
        <p>${session.correct} correct · ${session.wrong} incorrect out of ${total}</p>
        <p class="muted">Results were saved into each card’s spaced-repetition schedule.</p>
        <div class="btn-row">
          ${
            canGoBack
              ? `<button type="button" class="btn btn-ghost" id="btn-prev-from-summary">Previous card</button>`
              : ""
          }
          <button type="button" class="btn btn-primary" id="btn-again">${
            session.type === "quiz" ? "Quiz again" : "Study again"
          }</button>
          <button type="button" class="btn btn-secondary" id="btn-back-set">Back to set</button>
        </div>
      </section>
    `;

    document.getElementById("btn-back-set").addEventListener("click", () => {
      navigate({ name: "set", setId: set.id });
    });
    document.getElementById("btn-again").addEventListener("click", () => {
      const strengthFilter = session.strengthFilter || cardStrengthFilter;
      if (session.type === "quiz") {
        startQuiz(set.id, session.mode, session.showPromptFirst, {
          forceAll: false,
          strengthFilter,
        });
      } else {
        startStudy(set.id, { forceAll: false, strengthFilter });
      }
    });
    document.getElementById("btn-prev-from-summary")?.addEventListener("click", () => {
      goToPreviousStudyCard(set);
    });
  }

  function showModal(innerHtml) {
    closeModal();
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.id = "modal-backdrop";
    backdrop.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${innerHtml}</div>`;
    document.body.appendChild(backdrop);

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal();
    });
    backdrop.querySelectorAll("[data-close]").forEach((btn) => {
      btn.addEventListener("click", closeModal);
    });
    backdrop.querySelector("input, textarea, select, button")?.focus();
  }

  function closeModal() {
    document.getElementById("modal-backdrop")?.remove();
  }

  render();
})();
