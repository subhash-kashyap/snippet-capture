(() => {
  // ── State ──────────────────────────────────────────────────────────────────
  let captureBtn = null;
  let sidebar = null;
  let currentSelection = "";

  // ── Helpers ────────────────────────────────────────────────────────────────
  function getChatName() {
    return document.title.replace(/ [-|] (Claude|ChatGPT).*$/i, "").trim() || "Untitled Chat";
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function getCurrentUrl() {
    return window.location.href;
  }

  // ── Storage ────────────────────────────────────────────────────────────────
  function loadSnippets(callback) {
    chrome.storage.local.get("snippets", (data) => {
      callback(data.snippets || []);
    });
  }

  function saveSnippet(snippetObj, callback) {
    loadSnippets((snippets) => {
      snippets.unshift(snippetObj);
      chrome.storage.local.set({ snippets }, () => {
        if (callback) callback(snippets);
      });
    });
  }

  // ── Capture Button ─────────────────────────────────────────────────────────
  function showCaptureBtn(x, y) {
    if (!captureBtn) {
      captureBtn = document.createElement("button");
      captureBtn.id = "sc-capture-btn";
      captureBtn.textContent = "Capture Snippet";
      captureBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        doCapture();
      });
      document.body.appendChild(captureBtn);
    }

    // Position just above the cursor, clamped to viewport
    const btnW = 150;
    const btnH = 36;
    let left = Math.min(x, window.innerWidth - btnW - 12);
    let top = Math.max(y - btnH - 8, 8);

    captureBtn.style.left = left + window.scrollX + "px";
    captureBtn.style.top = top + window.scrollY + "px";
    captureBtn.classList.add("sc-visible");
  }

  function hideCaptureBtn() {
    if (captureBtn) captureBtn.classList.remove("sc-visible");
  }

  function doCapture() {
    const text = currentSelection.trim();
    if (!text) return;

    const snippet = {
      id: uid(),
      url: getCurrentUrl(),
      chatName: getChatName(),
      snippet: text,
      timestamp: Date.now(),
      notes: "",
    };

    saveSnippet(snippet, () => {
      hideCaptureBtn();
      flashConfirmation();
      refreshSidebar();
    });

    window.getSelection()?.removeAllRanges();
  }

  function flashConfirmation() {
    const toast = document.createElement("div");
    toast.id = "sc-toast";
    toast.textContent = "Snippet captured!";
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("sc-toast-show"));
    setTimeout(() => {
      toast.classList.remove("sc-toast-show");
      setTimeout(() => toast.remove(), 300);
    }, 1800);
  }

  // ── Selection listener ─────────────────────────────────────────────────────
  document.addEventListener("mouseup", (e) => {
    // small delay so selection is settled
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : "";
      if (text.length > 10) {
        currentSelection = text;
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        showCaptureBtn(
          rect.left + rect.width / 2,
          rect.top
        );
      } else {
        hideCaptureBtn();
      }
    }, 10);
  });

  document.addEventListener("mousedown", (e) => {
    if (e.target !== captureBtn) {
      hideCaptureBtn();
    }
  });

  // ── Sidebar ────────────────────────────────────────────────────────────────
  function buildSidebar() {
    if (sidebar) return;

    sidebar = document.createElement("div");
    sidebar.id = "sc-sidebar";
    sidebar.innerHTML = `
      <div id="sc-sidebar-header">
        <span>Snippets</span>
        <div id="sc-sidebar-actions">
          <button id="sc-open-page" title="Open full page">&#8599;</button>
          <button id="sc-sidebar-toggle" title="Collapse">&#10094;</button>
        </div>
      </div>
      <div id="sc-sidebar-body"></div>
    `;
    document.body.appendChild(sidebar);

    // Persistent pull-tab that stays visible on the edge when collapsed
    const tab = document.createElement("button");
    tab.id = "sc-sidebar-tab";
    tab.title = "Open snippets";
    tab.innerHTML = "&#10095;";
    document.body.appendChild(tab);
    tab.addEventListener("click", toggleSidebar);

    document.getElementById("sc-sidebar-toggle").addEventListener("click", toggleSidebar);
    document.getElementById("sc-open-page").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "OPEN_SNIPPETS_PAGE" });
    });

    refreshSidebar();
  }

  function toggleSidebar() {
    sidebar.classList.toggle("sc-collapsed");
    const collapsed = sidebar.classList.contains("sc-collapsed");
    document.getElementById("sc-sidebar-toggle").innerHTML = collapsed ? "&#10095;" : "&#10094;";
    const tab = document.getElementById("sc-sidebar-tab");
    if (tab) tab.classList.toggle("sc-tab-visible", collapsed);
  }

  function refreshSidebar() {
    if (!sidebar) return;
    const currentUrl = getCurrentUrl();
    loadSnippets((all) => {
      const mine = all.filter((s) => s.url === currentUrl);
      const body = document.getElementById("sc-sidebar-body");
      if (mine.length === 0) {
        body.innerHTML = `<p class="sc-empty">No snippets for this chat yet.</p>`;
        return;
      }
      body.innerHTML = mine
        .map(
          (s) => `
        <div class="sc-item" data-id="${s.id}">
          <div class="sc-item-text">${escapeHtml(s.snippet)}</div>
          <div class="sc-item-meta">${formatDate(s.timestamp)}</div>
          <button class="sc-delete-btn" data-id="${s.id}" title="Delete">✕</button>
        </div>
      `
        )
        .join("");

      body.querySelectorAll(".sc-delete-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          deleteSnippet(btn.dataset.id);
        });
      });
    });
  }

  function deleteSnippet(id) {
    loadSnippets((snippets) => {
      const updated = snippets.filter((s) => s.id !== id);
      chrome.storage.local.set({ snippets: updated }, refreshSidebar);
    });
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  buildSidebar();

  // Re-check when URL changes (SPAs)
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      refreshSidebar();
    }
  }).observe(document.body, { subtree: true, childList: true });
})();
