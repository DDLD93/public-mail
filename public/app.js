function appShell() {
  return {
    theme: document.documentElement.dataset.theme || 'light',
    sidebarOpen: false,
    shortcutsOpen: false,
    selected: [],
    toasts: [],
    init() {
      this.refreshIcons();
      this.bindShortcuts();
      this.bindRowActions();
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
      this.toasts.push({ id, msg, icon: opts.icon, undo: opts.undo });
      setTimeout(() => { this.toasts = this.toasts.filter(t => t.id !== id); }, opts.duration || 3500);
      this.refreshIcons();
    },
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
        this.toast(`${action} · ${ids.length} mail${ids.length === 1 ? '' : 's'}`, { icon: 'check-circle-2' });
        this.clearSelect();
        setTimeout(() => location.reload(), 300);
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
            const i = btn.querySelector('i[data-lucide]') || btn.querySelector('svg');
            if (on) {
              btn.innerHTML = '<i data-lucide="star" class="w-4 h-4 text-ink-300"></i>';
            } else {
              btn.innerHTML = '<i data-lucide="star" class="w-4 h-4 fill-amber-400 text-amber-400"></i>';
            }
            this.refreshIcons();
            this.toast(on ? 'Unstarred' : 'Starred', { icon: 'star' });
          }
        } else if (['archive','trash','spam','read','unread'].includes(action)) {
          const ok = await this.actOn(id, action);
          if (ok) {
            this.toast(action.charAt(0).toUpperCase() + action.slice(1) + 'd', { icon: 'check-circle-2' });
            const row = document.querySelector(`.mail-row[data-mail-id="${id}"]`);
            if (row && ['archive','trash','spam'].includes(action)) {
              row.style.transition = 'opacity .15s, transform .15s';
              row.style.opacity = '0';
              row.style.transform = 'translateX(-12px)';
              setTimeout(() => row.remove(), 160);
            } else if (window.location.pathname.startsWith('/mail/')) {
              setTimeout(() => (location.href = '/'), 300);
            }
          }
        }
      });
    },
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
          this.actOn(id, map[e.key]).then(ok => ok && this.toast(map[e.key], { icon: 'check-circle-2' }));
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
  return {
    init() {
      // page-level hook if needed
    },
  };
}
