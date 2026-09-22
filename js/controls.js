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
