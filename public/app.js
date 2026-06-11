function appShell() {
  return {
    theme: document.documentElement.dataset.theme || 'light',
    sidebarOpen: false,
    shortcutsOpen: false,
    selected: [],
    toasts: [],
    refreshing: false,
    lastRefresh: Date.now(),
    refreshLabel: 'Updated just now',
    autoRefreshMs: 8_000,
    _tickTimer: null,
    _autoTimer: null,

    init() {
      this.refreshIcons();
      this.bindShortcuts();
      this.bindRowActions();
      this.startRefreshClock();
    },
    refreshIcons() {
      if (window.lucide) window.lucide.createIcons();
      setTimeout(() => window.lucide && window.lucide.createIcons(), 50);
    },
    toggleTheme() {
      this.theme = this.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = this.theme;
      document.documentElement.classList.toggle('dark', this.theme === 'dark');
      try { localStorage.setItem('theme', this.theme); } catch {}
      this.refreshIcons();
    },
    toast(msg, opts = {}) {
      const id = Math.random().toString(36).slice(2);
      this.toasts.push({ id, msg, icon: opts.icon });
      setTimeout(() => { this.toasts = this.toasts.filter(t => t.id !== id); }, opts.duration || 3200);
      this.refreshIcons();
    },

    // ===== Refresh =====
    startRefreshClock() {
      this.updateRefreshLabel();
      this._tickTimer = setInterval(() => this.updateRefreshLabel(), 1000);
      this._autoTimer = setTimeout(() => this.refreshNow(true), this.autoRefreshMs);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && Date.now() - this.lastRefresh > this.autoRefreshMs) {
          this.refreshNow(true);
        }
      });
    },
    updateRefreshLabel() {
      const s = Math.max(0, Math.floor((Date.now() - this.lastRefresh) / 1000));
      let label;
      if (s < 5) label = 'Updated just now';
      else if (s < 60) label = `Updated ${s}s ago`;
      else if (s < 3600) label = `Updated ${Math.floor(s/60)}m ago`;
      else label = `Updated ${Math.floor(s/3600)}h ago`;
      this.refreshLabel = label;
    },
    refreshNow(auto = false) {
      if (this.refreshing) return;
      this.refreshing = true;
      this.refreshIcons();
      if (this._autoTimer) clearTimeout(this._autoTimer);
      // Soft refresh: re-fetch current URL, swap <main> contents
      fetch(location.href, { headers: { 'Accept': 'text/html' } })
        .then(r => r.text())
        .then(html => {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          const newMain = doc.querySelector('main');
          const curMain = document.querySelector('main');
          if (newMain && curMain) {
            curMain.innerHTML = newMain.innerHTML;
          }
          const newSidebar = doc.querySelector('aside .flex-1');
          const curSidebar = document.querySelector('aside .flex-1');
          if (newSidebar && curSidebar) curSidebar.innerHTML = newSidebar.innerHTML;

          this.lastRefresh = Date.now();
          this.updateRefreshLabel();
          if (!auto) this.toast('Refreshed', { icon: 'refresh-cw' });
          this.refreshIcons();
        })
        .catch(() => {
          if (!auto) this.toast('Refresh failed', { icon: 'alert-triangle' });
        })
        .finally(() => {
          setTimeout(() => { this.refreshing = false; }, 600);
          this._autoTimer = setTimeout(() => this.refreshNow(true), this.autoRefreshMs);
        });
    },

    // ===== Selection / bulk =====
    toggleSelect(id) {
      const i = this.selected.indexOf(id);
      if (i >= 0) this.selected.splice(i, 1);
      else this.selected.push(id);
      this.syncRowState();
    },
    clearSelect() {
      this.selected = [];
      document.querySelectorAll('[data-mail-check]').forEach(c => (c.checked = false));
      this.syncRowState();
    },
    syncRowState() {
      document.querySelectorAll('.mail-row').forEach(r => {
        const id = r.dataset.mailId;
        r.classList.toggle('selected', this.selected.includes(id));
      });
    },
    async bulk(action, value) {
      if (!this.selected.length) return;
      const ids = [...this.selected];
      const res = await fetch('/mail/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action, value }),
      });
      if (res.ok) {
        this.toast(`${action} · ${ids.length}`, { icon: 'check' });
        this.clearSelect();
        setTimeout(() => this.refreshNow(true), 200);
      } else {
        this.toast('Action failed', { icon: 'alert-triangle' });
      }
    },
    async actOn(id, action, value) {
      const res = await fetch(`/mail/${id}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ action, value }),
      });
      return res.ok;
    },
    bindRowActions() {
      document.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (!id) return;
        e.preventDefault();
        e.stopPropagation();

        if (action === 'star') {
          const on = btn.dataset.state === 'on';
          const ok = await this.actOn(id, on ? 'unstar' : 'star');
          if (ok) {
            btn.dataset.state = on ? 'off' : 'on';
            btn.innerHTML = on
              ? '<i data-lucide="star" class="w-3.5 h-3.5 text-coal-200 dark:text-coal-400"></i>'
              : '<i data-lucide="star" class="w-3.5 h-3.5 fill-phos-400 text-phos-400"></i>';
            this.refreshIcons();
            this.toast(on ? 'Unstarred' : 'Starred', { icon: 'star' });
          }
        } else if (['archive','trash','spam','read','unread'].includes(action)) {
          const ok = await this.actOn(id, action);
          if (ok) {
            const labels = { archive:'Archived', trash:'Trashed', spam:'Marked spam', read:'Read', unread:'Unread' };
            this.toast(labels[action], { icon: 'check' });
            const row = document.querySelector(`.mail-row[data-mail-id="${id}"]`);
            if (row && ['archive','trash','spam'].includes(action)) {
              row.style.transition = 'opacity .18s ease, transform .18s ease, max-height .25s ease, padding .25s ease';
              row.style.maxHeight = row.offsetHeight + 'px';
              requestAnimationFrame(() => {
                row.style.opacity = '0';
                row.style.transform = 'translateX(-12px)';
                row.style.maxHeight = '0';
                row.style.paddingTop = '0';
                row.style.paddingBottom = '0';
              });
              setTimeout(() => row.remove(), 260);
            } else if (window.location.pathname.startsWith('/mail/')) {
              setTimeout(() => (location.href = '/'), 280);
            }
          }
        }
      });
    },

    // ===== Shortcuts =====
    bindShortcuts() {
      let lastG = 0;
      const focusable = () => document.activeElement && /input|textarea/i.test(document.activeElement.tagName);
      document.addEventListener('keydown', (e) => {
        if (focusable() && e.key !== 'Escape') return;
        if (e.key === '/') {
          e.preventDefault();
          document.getElementById('searchInput')?.focus();
        } else if (e.key === '?') {
          this.shortcutsOpen = true;
        } else if (e.key === 'r') {
          this.refreshNow();
        } else if (e.key === 'Escape') {
          this.shortcutsOpen = false;
          this.sidebarOpen = false;
        } else if (e.key === 'g') {
          lastG = Date.now();
        } else if (e.key === 'i' && Date.now() - lastG < 800) {
          location.href = '/';
        } else if (e.key === 'j' || e.key === 'k') {
          this.moveCursor(e.key === 'j' ? 1 : -1);
        } else if (e.key === 'Enter') {
          const cur = document.querySelector('.mail-row[data-current="1"]');
          if (cur) location.href = cur.getAttribute('href');
        } else if (['e', '#', 's', 'u'].includes(e.key)) {
          const path = location.pathname;
          let id = null;
          if (path.startsWith('/mail/')) id = path.split('/')[2];
          else {
            const cur = document.querySelector('.mail-row[data-current="1"]');
            id = cur?.dataset.mailId;
          }
          if (!id) return;
          const map = { e: 'archive', '#': 'trash', s: 'star', u: 'unread' };
          this.actOn(id, map[e.key]).then(ok => ok && this.toast(map[e.key], { icon: 'check' }));
        }
      });
    },
    moveCursor(delta) {
      const rows = [...document.querySelectorAll('.mail-row')];
      if (!rows.length) return;
      let idx = rows.findIndex(r => r.dataset.current === '1');
      idx = Math.max(0, Math.min(rows.length - 1, (idx < 0 ? 0 : idx + delta)));
      rows.forEach(r => r.removeAttribute('data-current'));
      rows[idx].setAttribute('data-current', '1');
      rows[idx].scrollIntoView({ block: 'nearest' });
    },
  };
}

function mailList() {
  return { init() {} };
}
