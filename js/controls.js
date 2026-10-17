import { hazardColors, hazardDescriptions } from './hazards.js';

/* Local controls receive only their owner's mutable state and redraw callback. */
export function rangeControls(id, local, bounds, redraw) {
  const host = document.getElementById(id);
  if (!host.children.length) {
    for (const [key, title] of [['start', 'From'], ['end', 'To']]) {
      const label = document.createElement('label'); label.append(title);
      const select = document.createElement('select'); select.dataset.bound = key;
      select.setAttribute('aria-label', `${host.dataset.chart} ${title.toLowerCase()} year`);
      for (let y = bounds.start; y <= bounds.end; y++) select.add(new Option(String(y), y));
      label.append(select); host.append(label);
    }
  }
  for (const select of host.querySelectorAll('select')) {
    const key = select.dataset.bound; select.value = local[key];
    select.onchange = () => {
      local[key] = +select.value;
      if (key === 'start') local.end = Math.max(local.start, local.end);
      else local.start = Math.min(local.start, local.end);
      redraw();
    };
  }
}

export function setupStickyFilters() {
  const bar = document.querySelector('.filter-bar'), nav = document.querySelector('.masthead');
  const toggle = document.getElementById('filter-toggle');
  const measure = () => {
    document.documentElement.style.setProperty('--nav-height', `${nav.getBoundingClientRect().height}px`);
    document.documentElement.style.setProperty('--filter-height', `${bar.getBoundingClientRect().height}px`);
  };
  toggle.onclick = () => { toggle.setAttribute('aria-expanded', toggle.getAttribute('aria-expanded') !== 'true'); measure(); };
  const observer = new ResizeObserver(measure); observer.observe(bar); observer.observe(nav); measure();
}

// Sticky native selects can scroll their original document position into view in Chrome.
// Keep the select as the data control and use a fixed overlay for user interaction.
export function setupFilterMenus({ showTip, hideTip } = {}) {
  const menus = [...document.querySelectorAll('.filter-fields select')].map(select => {
    const multiple = select.multiple;
    select.hidden = true;
    const label = select.closest('label');
    const title = select.getAttribute('aria-label') || label.firstChild.textContent.trim();
    const button = document.createElement('button');
    button.type = 'button'; button.id = select.id + '-menu-button'; button.className = 'filter-menu-button';
    button.setAttribute('aria-label', title); button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-haspopup', multiple ? 'dialog' : 'listbox');
    const popup = document.createElement('div');
    popup.id = select.id + '-menu'; popup.className = 'filter-menu'; popup.hidden = true;
    popup.setAttribute('role', multiple ? 'dialog' : 'listbox'); popup.setAttribute('aria-label', title);
    button.setAttribute('aria-controls', popup.id); label.htmlFor = button.id;
    label.append(button); document.body.append(popup);
    let signature = '', search, list;
    const keepFocus = node => node.focus({ preventScroll: true });
    const close = (focus = false) => {
      popup.hidden = true; button.setAttribute('aria-expanded', 'false');
      hideTip?.(popup.id);
      if (focus) keepFocus(button);
    };
    const position = () => {
      if (popup.hidden) return;
      const rect = button.getBoundingClientRect();
      const width = Math.min(innerWidth - 16, Math.max(rect.width, multiple ? 310 : 260));
      popup.style.width = width + 'px';
      popup.style.left = Math.max(8, Math.min(rect.left, innerWidth - width - 8)) + 'px';
      const below = innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const upward = below < 220 && above > below;
      popup.style.top = upward ? 'auto' : rect.bottom + 5 + 'px';
      popup.style.bottom = upward ? innerHeight - rect.top + 5 + 'px' : 'auto';
      popup.style.maxHeight = Math.max(120, Math.min(380, upward ? above : below)) + 'px';
    };
    const change = () => {
      const x = scrollX, y = scrollY;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      window.scrollTo({ left: x, top: y, behavior: 'instant' });
    };
    const sync = () => {
      const choices = [...select.options];
      const selected = choices.filter(o => o.selected && !o.disabled);
      const all = selected.length === choices.filter(o => !o.disabled).length;
      button.textContent = multiple ? (all ? 'All natural hazards' : !selected.length ? 'No hazards selected' : selected.length <= 2 ? selected.map(o => o.label).join(' + ') : `${selected.length} hazards selected`) : select.selectedOptions[0]?.label || 'Select';
      button.title = multiple ? selected.map(o => o.label).join(', ') : button.textContent;
      const nextSignature = choices.map(o => `${o.value}|${o.label}|${o.disabled}`).join('\n');
      if (signature !== nextSignature) {
        signature = nextSignature; popup.replaceChildren();
        const heading = document.createElement('div'); heading.className = 'filter-menu-heading';
        heading.textContent = multiple ? 'Choose hazards · applies to all views' : title;
        popup.append(heading);
        if (multiple) {
          const actions = document.createElement('div'); actions.className = 'filter-menu-actions';
          for (const [text, checked] of [['All', true], ['None', false]]) {
            const action = document.createElement('button'); action.type = 'button'; action.textContent = text;
            action.onclick = () => { choices.forEach(o => { o.selected = checked && !o.disabled; }); change(); };
            actions.append(action);
          }
          popup.append(actions);
        }
        search = document.createElement('input'); search.type = 'search'; search.placeholder = 'Search…';
        search.setAttribute('aria-label', 'Search ' + title.toLowerCase());
        search.hidden = choices.length <= 10;
        popup.append(search);
        list = document.createElement('div'); list.className = 'filter-menu-list'; popup.append(list);
        choices.forEach(option => {
          const item = document.createElement(multiple ? 'label' : 'button');
          item.className = 'filter-menu-option'; item.dataset.value = option.value;
          if (multiple) {
            const check = document.createElement('input'); check.type = 'checkbox'; check.disabled = option.disabled;
            check.onchange = () => { option.selected = check.checked; change(); };
            item.append(check, document.createTextNode(option.label));
          } else {
            item.type = 'button'; item.setAttribute('role', 'option'); item.disabled = option.disabled; item.textContent = option.label;
            item.onclick = () => { select.value = option.value; change(); close(true); };
          }
          if (select.id === 'type') {
            const description = hazardDescriptions[option.value];
            const swatch = document.createElement('i'); swatch.className = 'hazard-swatch';
            swatch.style.backgroundColor = hazardColors[option.value];
            item.insertBefore(swatch, item.lastChild);
            const tip = event => showTip?.(event, option.value, description, option.disabled ? 'No explicitly classified records in this export.' : 'Checked types are included in all views. Click to toggle this type.');
            item.onpointerenter = tip; item.onpointerleave = () => hideTip?.();
            item.onfocusin = tip; item.onfocusout = () => hideTip?.();
            item.querySelector('input').setAttribute('aria-description', description);
          }
          list.append(item);
        });
        search.oninput = () => {
          const query = search.value.trim().toLowerCase();
          [...list.children].forEach(item => { item.hidden = !item.textContent.toLowerCase().includes(query); });
        };
      }
      [...list.children].forEach((item, i) => {
        if (multiple) item.querySelector('input').checked = choices[i].selected;
        else item.setAttribute('aria-selected', String(choices[i].selected));
      });
      position();
    };
    const open = () => {
      document.querySelectorAll('.filter-menu').forEach(other => {
        if (other !== popup) { other.hidden = true; document.querySelector(`[aria-controls="${other.id}"]`)?.setAttribute('aria-expanded', 'false'); }
      });
      sync(); popup.hidden = false; button.setAttribute('aria-expanded', 'true'); position();
      search.value = ''; search.oninput(); list.scrollTop = 0;
    };
    button.onclick = event => {
      if (!popup.hidden) { close(); return; }
      open();
      if (event.detail === 0) {
        const target = !search.hidden ? search : list.querySelector('button:not(:disabled),input:not(:disabled)');
        if (target) keepFocus(target);
      }
    };
    button.onpointerdown = event => { event.preventDefault(); keepFocus(button); };
    button.onkeydown = event => {
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault(); open();
        const target = !search.hidden ? search : list.querySelector('[aria-selected="true"],button:not(:disabled),input:not(:disabled)');
        if (target) keepFocus(target);
      }
      if (event.key === 'Escape') { event.stopPropagation(); close(true); }
    };
    popup.onkeydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
      if (event.key === 'Tab') {
        const items = [...popup.querySelectorAll('button:not(:disabled),input:not(:disabled)')].filter(node => !node.closest('[hidden]'));
        if (event.shiftKey && event.target === items[0]) { event.preventDefault(); close(true); }
        else if (!event.shiftKey && event.target === items.at(-1)) { close(); keepFocus(button); }
      }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && (event.target.type !== 'search' || event.key.startsWith('Arrow'))) {
        event.preventDefault();
        const items = [...list.querySelectorAll('button:not(:disabled),input:not(:disabled)')].filter(node => !node.closest('[hidden]'));
        const index = items.indexOf(document.activeElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : index < 0 ? (event.key === 'ArrowDown' ? 0 : items.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        if (items[next]) { keepFocus(items[next]); items[next].scrollIntoView({ block: 'nearest' }); }
      }
    };
    document.addEventListener('pointerdown', event => { if (!popup.contains(event.target) && event.target !== button) close(); });
    document.addEventListener('focusin', event => { if (!popup.contains(event.target) && event.target !== button) close(); });
    window.addEventListener('scroll', position, { passive: true }); window.addEventListener('resize', position);
    sync();
    return { sync };
  });
  return () => menus.forEach(menu => menu.sync());
}
