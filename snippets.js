(() => {
  const DEFAULT_SITES = ["claude.ai", "chatgpt.com"];

  let allSnippets = [];
  let activeFilter = null; // null = all, string = url
  let searchQuery = "";
  let editingId = null;
  let currentView = "snippets"; // "snippets" | "settings"

  // ── Storage ────────────────────────────────────────────────────────────────
  function load(cb) {
    chrome.storage.local.get(["snippets", "userSites"], (data) => {
      cb(data.snippets || [], data.userSites || []);
    });
  }

  function persist(snippets, cb) {
    chrome.storage.local.set({ snippets }, () => { if (cb) cb(); });
  }

  function persistSites(sites, cb) {
    chrome.storage.local.set({ userSites: sites }, () => { if (cb) cb(); });
  }

  function refresh() {
    load((snippets) => {
      allSnippets = snippets;
      renderNav();
      if (currentView === "snippets") renderMain();
    });
  }

  // ── View toggle ────────────────────────────────────────────────────────────
  function showView(view) {
    currentView = view;
    document.getElementById("view-snippets").classList.toggle("hidden", view !== "snippets");
    document.getElementById("view-settings").classList.toggle("hidden", view !== "settings");
    document.getElementById("settings-nav-btn").classList.toggle("active", view === "settings");
    if (view === "settings") renderSettings();
    if (view === "snippets") renderMain();
  }

  document.getElementById("settings-nav-btn").addEventListener("click", () => {
    showView(currentView === "settings" ? "snippets" : "settings");
  });

  // ── Nav ────────────────────────────────────────────────────────────────────
  function renderNav() {
    const chatList = document.getElementById("chat-list");

    const groups = {};
    allSnippets.forEach((s) => {
      if (!groups[s.url]) groups[s.url] = { chatName: s.chatName, count: 0 };
      groups[s.url].count++;
    });

    let html = `
      <div class="chat-item nav-all ${activeFilter === null ? "active" : ""}" data-url="all">
        <span class="chat-item-label">All Snippets</span>
        <span class="chat-item-badge">${allSnippets.length}</span>
      </div>
    `;

    if (Object.keys(groups).length > 0) {
      html += `<div class="nav-divider" style="margin:4px 6px"></div>`;
    }

    Object.entries(groups).forEach(([url, { chatName, count }]) => {
      html += `
        <div class="chat-item ${activeFilter === url ? "active" : ""}" data-url="${escHtml(url)}" title="${escHtml(url)}">
          <span class="chat-item-label">${escHtml(chatName)}</span>
          <span class="chat-item-badge">${count}</span>
        </div>
      `;
    });

    chatList.innerHTML = html;
    chatList.querySelectorAll(".chat-item").forEach((el) => {
      el.addEventListener("click", () => {
        activeFilter = el.dataset.url === "all" ? null : el.dataset.url;
        showView("snippets");
        renderNav();
        renderMain();
      });
    });
  }

  // ── Main snippets view ─────────────────────────────────────────────────────
  function renderMain() {
    let visible = allSnippets;

    if (activeFilter) {
      visible = visible.filter((s) => s.url === activeFilter);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      visible = visible.filter(
        (s) =>
          s.snippet.toLowerCase().includes(q) ||
          s.chatName.toLowerCase().includes(q) ||
          (s.notes && s.notes.toLowerCase().includes(q))
      );
    }

    if (activeFilter) {
      const first = allSnippets.find((s) => s.url === activeFilter);
      document.getElementById("main-title").textContent = first ? first.chatName : "Chat";
      document.getElementById("main-subtitle").textContent = activeFilter;
    } else {
      document.getElementById("main-title").textContent = "All Snippets";
      document.getElementById("main-subtitle").textContent =
        `${visible.length} snippet${visible.length !== 1 ? "s" : ""}`;
    }

    const container = document.getElementById("snippets-container");

    if (visible.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h2>No snippets yet</h2>
          <p>Select text on Claude or ChatGPT and click "Capture Snippet".</p>
        </div>
      `;
      return;
    }

    container.innerHTML = visible.map((s) => `
      <div class="snippet-card" data-id="${s.id}">
        <div class="snippet-meta">
          <span class="snippet-chat-name" title="Click to rename">
            <span class="editable-name" contenteditable="true" data-id="${s.id}">${escHtml(s.chatName)}</span>
          </span>
          <a class="snippet-url" href="${escHtml(s.url)}" target="_blank" title="${escHtml(s.url)}">${escHtml(trimUrl(s.url))}</a>
          <span class="snippet-date">${formatDate(s.timestamp)}</span>
        </div>
        <div class="snippet-text">${escHtml(s.snippet)}</div>
        ${s.notes
          ? `<div class="snippet-notes has-notes"><strong>Notes:</strong> ${escHtml(s.notes)}</div>`
          : `<div class="snippet-notes">No notes — <span style="cursor:pointer;text-decoration:underline;color:var(--muted);" data-edit-id="${s.id}">add one</span></div>`
        }
        <div class="snippet-actions">
          <button class="btn-sm" data-copy-id="${s.id}">Copy</button>
          <button class="btn-sm" data-edit-id="${s.id}">Notes</button>
          <button class="btn-sm" data-delete-id="${s.id}">Delete</button>
        </div>
      </div>
    `).join("");

    // Inline rename
    container.querySelectorAll(".editable-name").forEach((el) => {
      el.addEventListener("blur", () => {
        const newName = el.textContent.trim();
        if (newName) renameChat(el.dataset.id, newName);
      });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); el.blur(); }
      });
      el.addEventListener("click", (e) => e.stopPropagation());
    });

    // Copy
    container.querySelectorAll("[data-copy-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const s = allSnippets.find((x) => x.id === btn.dataset.copyId);
        if (!s) return;
        navigator.clipboard.writeText(s.snippet).then(() => {
          btn.textContent = "Copied!";
          btn.classList.add("copied");
          setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("copied"); }, 1500);
        });
      });
    });

    // Delete
    container.querySelectorAll("[data-delete-id]").forEach((btn) => {
      btn.addEventListener("click", () => deleteSnippet(btn.dataset.deleteId));
    });

    // Notes
    container.querySelectorAll("[data-edit-id]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        openNoteModal(el.dataset.editId);
      });
    });
  }

  // ── Settings view ──────────────────────────────────────────────────────────
  function renderSettings() {
    load((_, userSites) => {
      const list = document.getElementById("sites-list");

      const allSites = [
        ...DEFAULT_SITES.map((s) => ({ name: s, isDefault: true })),
        ...userSites.map((s) => ({ name: s, isDefault: false })),
      ];

      list.innerHTML = allSites.map((site) => `
        <div class="site-row">
          <span class="site-row-name">${escHtml(site.name)}</span>
          ${site.isDefault
            ? `<span class="site-badge">built-in</span>`
            : `<button class="site-delete-btn" data-site="${escHtml(site.name)}">Remove</button>`
          }
        </div>
      `).join("");

      list.querySelectorAll("[data-site]").forEach((btn) => {
        btn.addEventListener("click", () => removeSite(btn.dataset.site));
      });
    });
  }

  function addSite() {
    const input = document.getElementById("new-site-input");
    const error = document.getElementById("site-error");
    let val = input.value.trim().toLowerCase();

    // Strip protocol/path — just keep hostname
    try { val = new URL(val.includes("://") ? val : "https://" + val).hostname; } catch {}

    error.textContent = "";

    if (!val || !val.includes(".")) {
      error.textContent = "Enter a valid domain like gemini.google.com";
      return;
    }

    if (DEFAULT_SITES.includes(val)) {
      error.textContent = `${val} is already built-in.`;
      return;
    }

    load((_, userSites) => {
      if (userSites.includes(val)) {
        error.textContent = `${val} is already added.`;
        return;
      }
      persistSites([...userSites, val], () => {
        input.value = "";
        renderSettings();
      });
    });
  }

  function removeSite(site) {
    load((_, userSites) => {
      persistSites(userSites.filter((s) => s !== site), renderSettings);
    });
  }

  document.getElementById("add-site-btn").addEventListener("click", addSite);
  document.getElementById("new-site-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addSite();
  });

  // ── Snippet actions ────────────────────────────────────────────────────────
  function deleteSnippet(id) {
    persist(allSnippets.filter((s) => s.id !== id), refresh);
  }

  function renameChat(id, newName) {
    const target = allSnippets.find((s) => s.id === id);
    if (!target) return;
    const updated = allSnippets.map((s) =>
      s.url === target.url ? { ...s, chatName: newName } : s
    );
    persist(updated, refresh);
  }

  // ── Note modal ─────────────────────────────────────────────────────────────
  function openNoteModal(id) {
    const s = allSnippets.find((x) => x.id === id);
    if (!s) return;
    editingId = id;
    document.getElementById("modal-snippet-preview").textContent =
      s.snippet.slice(0, 200) + (s.snippet.length > 200 ? "…" : "");
    document.getElementById("modal-notes").value = s.notes || "";
    document.getElementById("modal-overlay").classList.remove("hidden");
    document.getElementById("modal-notes").focus();
  }

  function closeModal() {
    document.getElementById("modal-overlay").classList.add("hidden");
    editingId = null;
  }

  document.getElementById("modal-cancel").addEventListener("click", closeModal);
  document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target === document.getElementById("modal-overlay")) closeModal();
  });
  document.getElementById("modal-save").addEventListener("click", () => {
    const notes = document.getElementById("modal-notes").value.trim();
    persist(allSnippets.map((s) => s.id === editingId ? { ...s, notes } : s), () => {
      closeModal();
      refresh();
    });
  });

  // ── Search ─────────────────────────────────────────────────────────────────
  document.getElementById("search").addEventListener("input", (e) => {
    searchQuery = e.target.value;
    showView("snippets");
    renderNav();
    renderMain();
  });

  // ── Exports ────────────────────────────────────────────────────────────────
  document.getElementById("export-json-btn").addEventListener("click", () => {
    download(JSON.stringify(allSnippets, null, 2), `snippets-${datestamp()}.json`, "application/json");
  });

  document.getElementById("export-md-btn").addEventListener("click", () => {
    const groups = {};
    allSnippets.forEach((s) => {
      if (!groups[s.url]) groups[s.url] = { chatName: s.chatName, url: s.url, items: [] };
      groups[s.url].items.push(s);
    });
    let md = `# Snippets\n\n`;
    Object.values(groups).forEach(({ chatName, url, items }) => {
      md += `## ${chatName}\n${url}\n\n`;
      items.forEach((s) => {
        md += `> ${s.snippet.replace(/\n/g, "\n> ")}\n\n`;
        if (s.notes) md += `**Notes:** ${s.notes}\n\n`;
        md += `*${formatDate(s.timestamp)}*\n\n---\n\n`;
      });
    });
    download(md, `snippets-${datestamp()}.md`, "text/markdown");
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  function download(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function datestamp() {
    return new Date().toISOString().slice(0, 10);
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleDateString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }

  function trimUrl(url) {
    try {
      const u = new URL(url);
      return u.hostname + u.pathname.slice(0, 28) + (u.pathname.length > 28 ? "…" : "");
    } catch { return url.slice(0, 50); }
  }

  // ── Boot ───────────────────────────────────────────────────────────────────
  refresh();
})();
