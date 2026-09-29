const DEFAULT_CONFIG = {
  sections: [
    {
      id: 'sec_support',
      name: 'Support Portal',
      color: 'blue',
      groups: [
        { id: 'g_support_1', name: 'Support Portal', urls: ['https://support.example.com/login'] }
      ]
    },
    {
      id: 'sec_package',
      name: 'Package Tracker',
      color: 'cyan',
      groups: [
        { id: 'g_pkg_1', name: 'Universal Tracking', urls: ['https://tracking.example.com/'] },
        { id: 'g_pkg_2', name: 'Marketplace Orders', urls: ['https://marketplace.example.com/orders'] }
      ]
    },
    {
      id: 'sec_printer',
      name: 'Printer Support',
      color: 'red',
      groups: [
        { id: 'g_printer_1', name: 'Printer Support', urls: ['https://kb.example.com/search?q=printer'] }
      ]
    },
    {
      id: 'sec_cameras',
      name: 'Camera Feeds',
      color: 'purple',
      groups: [
        { id: 'g_cam_1', name: 'Camera A', urls: ['http://192.0.2.10'] },
        { id: 'g_cam_2', name: 'Camera B', urls: ['http://192.0.2.11'] },
        { id: 'g_cam_3', name: 'Camera C', urls: ['http://192.0.2.12'] }
      ]
    }
  ]
};

let currentConfig = { sections: [] };
let dragState = null;

const TAB_GROUP_COLORS = {
  grey:   '#5f6368',
  blue:   '#1a73e8',
  red:    '#d93025',
  yellow: '#f9ab00',
  green:  '#188038',
  pink:   '#ff8bcb',
  purple: '#a142f4',
  cyan:   '#007b83',
  orange: '#fa903e'
};
const VALID_COLORS = Object.keys(TAB_GROUP_COLORS);
const LIGHT_COLORS = new Set(['yellow', 'pink', 'orange']);

/* ---------- helpers ---------- */
function newId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return prefix + '_' + crypto.randomUUID();
  }
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}
function storageGet(key) {
  return new Promise((resolve) => chrome.storage.sync.get(key, (r) => resolve(r || {})));
}
function storageSet(obj) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(obj, () => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
}
function storageRemove(key) {
  return new Promise((resolve) => chrome.storage.sync.remove(key, () => resolve()));
}
function mixWithWhite(hex, amount) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}
function normalizeColor(raw) {
  const c = String(raw || '').toLowerCase().trim();
  return VALID_COLORS.includes(c) ? c : 'grey';
}

/* ---------- migration / normalization ---------- */
function migrateOldFormat(old) {
  const sections = [];
  const sectionMap = new Map();
  for (const [key, item] of Object.entries(old)) {
    if (!item || typeof item !== 'object') continue;
    const group = {
      id: newId('g'),
      name: item.name || key,
      urls: Array.isArray(item.urls) ? item.urls.slice() : []
    };
    const sectionName = String(item.section || '').trim();
    if (sectionName) {
      let section = sectionMap.get(sectionName);
      if (!section) {
        section = { id: newId('sec'), name: sectionName, color: normalizeColor(item.color), groups: [] };
        sections.push(section);
        sectionMap.set(sectionName, section);
      }
      section.groups.push(group);
    } else {
      sections.push({
        id: newId('sec'),
        name: item.name || key,
        color: normalizeColor(item.color),
        groups: [group]
      });
    }
  }
  return { sections };
}

function normalizeConfig(cfg) {
  const out = { sections: [] };
  if (!cfg || typeof cfg !== 'object') return out;
  if (!Array.isArray(cfg.sections)) return migrateOldFormat(cfg);
  for (const s of cfg.sections) {
    if (!s || typeof s !== 'object' || !s.name) continue;
    const section = {
      id: s.id || newId('sec'),
      name: String(s.name),
      color: normalizeColor(s.color),
      groups: []
    };
    if (Array.isArray(s.groups)) {
      for (const g of s.groups) {
        if (!g || typeof g !== 'object' || !g.name) continue;
        section.groups.push({
          id: g.id || newId('g'),
          name: String(g.name),
          urls: Array.isArray(g.urls) ? g.urls.slice() : []
        });
      }
    }
    out.sections.push(section);
  }
  return out;
}

/* ---------- load ---------- */
async function loadSettings() {
  const data = await storageGet('ticketConfig');
  const saved = data.ticketConfig;

  let usedDefaults = false;
  if (saved && typeof saved === 'object' && Object.keys(saved).length > 0) {
    currentConfig = normalizeConfig(saved);
  } else {
    currentConfig = normalizeConfig(DEFAULT_CONFIG);
    usedDefaults = true;
  }

  const status = document.getElementById('statusText');
  const sectionCount = currentConfig.sections.length;
  const groupCount = currentConfig.sections.reduce((n, s) => n + s.groups.length, 0);
  status.textContent = usedDefaults
    ? `No saved configuration found — showing ${sectionCount} default sections (${groupCount} groups). Click Save to persist.`
    : `Loaded ${sectionCount} sections and ${groupCount} groups.`;

  renderAll();
}

/* ---------- rendering ---------- */
function renderAll() {
  const container = document.getElementById('sectionsContainer');
  container.innerHTML = '';
  for (const section of currentConfig.sections) {
    container.appendChild(renderSection(section));
  }
}

function renderSection(section) {
  const el = document.createElement('div');
  el.className = 'section-card';
  el.dataset.sectionId = section.id;

  const realColor = TAB_GROUP_COLORS[section.color];
  const isLight = LIGHT_COLORS.has(section.color);
  const headerTextColor = isLight ? '#202124' : '#ffffff';

  /* --- Header --- */
  const header = document.createElement('div');
  header.className = 'section-header';
  header.style.backgroundColor = realColor;
  header.style.color = headerTextColor;
  header.draggable = true;

  const grip = document.createElement('span');
  grip.className = 'grip';
  grip.textContent = '⋮⋮';
  grip.title = 'Drag anywhere on this bar to reorder';

  const nameInput = document.createElement('input');
  nameInput.className = 'section-name';
  nameInput.type = 'text';
  nameInput.value = section.name;
  nameInput.style.color = headerTextColor;
  nameInput.draggable = false;
  nameInput.addEventListener('input', () => { section.name = nameInput.value; });

  const colorSelect = document.createElement('select');
  colorSelect.className = 'color-select';
  colorSelect.draggable = false;
  VALID_COLORS.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c.charAt(0).toUpperCase() + c.slice(1);
    if (c === section.color) opt.selected = true;
    colorSelect.appendChild(opt);
  });
  colorSelect.addEventListener('change', () => {
    section.color = normalizeColor(colorSelect.value);
    renderAll();
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-section-btn';
  deleteBtn.textContent = '×';
  deleteBtn.title = 'Delete section';
  deleteBtn.draggable = false;
  deleteBtn.addEventListener('click', () => {
    if (confirm(`Delete section "${section.name}" and all its groups?`)) {
      currentConfig.sections = currentConfig.sections.filter(s => s.id !== section.id);
      renderAll();
    }
  });

  header.appendChild(grip);
  header.appendChild(nameInput);
  header.appendChild(colorSelect);
  header.appendChild(deleteBtn);

  /* --- Body --- */
  const body = document.createElement('div');
  body.className = 'section-body';
  body.style.backgroundColor = mixWithWhite(realColor, 0.94);

  const groupList = document.createElement('div');
  groupList.className = 'group-list';
  groupList.dataset.sectionId = section.id;

  for (const group of section.groups) {
    groupList.appendChild(renderGroup(group, section));
  }

  const addGroupBtn = document.createElement('button');
  addGroupBtn.className = 'add-group-btn';
  addGroupBtn.textContent = '＋ Add Group';
  addGroupBtn.addEventListener('click', () => {
    section.groups.push({ id: newId('g'), name: 'New Group', urls: [] });
    renderAll();
  });

  body.appendChild(groupList);
  body.appendChild(addGroupBtn);

  el.appendChild(header);
  el.appendChild(body);

  setupSectionDrag(header, el, section);
  setupSectionDropTarget(el, section);
  setupGroupListDrop(groupList, section);

  return el;
}

function renderGroup(group, section) {
  const el = document.createElement('div');
  el.className = 'group-card';
  el.dataset.groupId = group.id;
  el.draggable = true;

  const realColor = TAB_GROUP_COLORS[section.color];

  /* Header row */
  const header = document.createElement('div');
  header.className = 'group-header';

  const grip = document.createElement('span');
  grip.className = 'grip';
  grip.textContent = '⋮⋮';
  grip.title = 'Drag anywhere on this card to move it';

  const nameInput = document.createElement('input');
  nameInput.className = 'group-name';
  nameInput.type = 'text';
  nameInput.value = group.name;
  nameInput.draggable = false;
  nameInput.addEventListener('input', () => { group.name = nameInput.value; });

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-group-btn';
  deleteBtn.textContent = '×';
  deleteBtn.title = 'Delete group';
  deleteBtn.draggable = false;
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm(`Delete group "${group.name}"?`)) {
      section.groups = section.groups.filter(g => g.id !== group.id);
      renderAll();
    }
  });

  header.appendChild(grip);
  header.appendChild(nameInput);
  header.appendChild(deleteBtn);

  /* URLs */
  const label = document.createElement('label');
  label.textContent = 'URLs (one per line):';

  const textarea = document.createElement('textarea');
  textarea.draggable = false;
  textarea.value = group.urls.join('\n');
  textarea.style.backgroundColor = mixWithWhite(realColor, 0.88);
  textarea.style.borderColor = mixWithWhite(realColor, 0.60);

  el.appendChild(header);
  el.appendChild(label);
  el.appendChild(textarea);

  setupGroupDrag(el, group, section);

  return el;
}

/* ---------- drag: sections ---------- */
function setupSectionDrag(header, sectionEl, section) {
  header.addEventListener('dragstart', (e) => {
    if (e.target.closest('input, select, textarea, button')) {
      e.preventDefault();
      return;
    }
    dragState = { type: 'section', sectionId: section.id, element: sectionEl };
    sectionEl.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'section');
  });
  header.addEventListener('dragend', () => {
    sectionEl.classList.remove('dragging');
    dragState = null;
    clearAllDropIndicators();
  });
}

function setupSectionDropTarget(sectionEl, section) {
  sectionEl.addEventListener('dragover', (e) => {
    if (!dragState || dragState.type !== 'section') return;
    if (dragState.sectionId === section.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    clearSectionIndicators();
    const rect = sectionEl.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    sectionEl.classList.toggle('drop-above', before);
    sectionEl.classList.toggle('drop-below', !before);
  });

  sectionEl.addEventListener('dragleave', (e) => {
    if (!sectionEl.contains(e.relatedTarget)) {
      sectionEl.classList.remove('drop-above', 'drop-below');
    }
  });

  sectionEl.addEventListener('drop', (e) => {
    if (!dragState || dragState.type !== 'section') return;
    if (dragState.sectionId === section.id) return;
    e.preventDefault();

    const rect = sectionEl.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    const container = document.getElementById('sectionsContainer');
    const draggedEl = dragState.element;

    if (before) container.insertBefore(draggedEl, sectionEl);
    else container.insertBefore(draggedEl, sectionEl.nextSibling);

    currentConfig = collectFromDom();
    dragState = null;
    clearAllDropIndicators();
    renderAll();
    showToast('Section moved! Click Save to apply.');
  });
}

/* ---------- drag: groups ---------- */
function setupGroupDrag(groupEl, group, section) {
  groupEl.addEventListener('dragstart', (e) => {
    if (e.target.closest('textarea, input, select, button')) {
      e.preventDefault();
      return;
    }
    dragState = { type: 'group', groupId: group.id, sectionId: section.id, element: groupEl };
    groupEl.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'group');
  });
  groupEl.addEventListener('dragend', () => {
    groupEl.classList.remove('dragging');
    dragState = null;
    clearAllDropIndicators();
  });
}

function setupGroupListDrop(groupListEl) {
  groupListEl.addEventListener('dragover', (e) => {
    if (!dragState || dragState.type !== 'group') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const cards = [...groupListEl.querySelectorAll('.group-card:not(.dragging)')];
    const target = findGroupDropTarget(cards, e.clientY);

    clearGroupIndicators();
    if (target) {
      target.element.classList.add(target.before ? 'drop-above' : 'drop-below');
    }
  });

  groupListEl.addEventListener('dragleave', (e) => {
    if (!groupListEl.contains(e.relatedTarget)) clearGroupIndicators();
  });

  groupListEl.addEventListener('drop', (e) => {
    if (!dragState || dragState.type !== 'group') return;
    e.preventDefault();

    const cards = [...groupListEl.querySelectorAll('.group-card:not(.dragging)')];
    const target = findGroupDropTarget(cards, e.clientY);
    const draggedEl = dragState.element;

    if (target) {
      if (target.before) groupListEl.insertBefore(draggedEl, target.element);
      else groupListEl.insertBefore(draggedEl, target.element.nextSibling);
    } else {
      groupListEl.appendChild(draggedEl);
    }

    currentConfig = collectFromDom();
    dragState = null;
    clearAllDropIndicators();
    renderAll();
    showToast('Group moved! Click Save to apply.');
  });
}

function findGroupDropTarget(cards, y) {
  if (cards.length === 0) return null;
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    if (y < rect.top + rect.height / 2) return { element: card, before: true };
  }
  return { element: cards[cards.length - 1], before: false };
}

function clearGroupIndicators() {
  document.querySelectorAll('.group-card.drop-above, .group-card.drop-below').forEach(el => {
    el.classList.remove('drop-above', 'drop-below');
  });
}
function clearSectionIndicators() {
  document.querySelectorAll('.section-card.drop-above, .section-card.drop-below').forEach(el => {
    el.classList.remove('drop-above', 'drop-below');
  });
}
function clearAllDropIndicators() {
  clearGroupIndicators();
  clearSectionIndicators();
}

/* ---------- read current layout from DOM ---------- */
function collectFromDom() {
  const sections = [];
  document.querySelectorAll('#sectionsContainer > .section-card').forEach(sectionEl => {
    const nameInput = sectionEl.querySelector('.section-name');
    const colorSelect = sectionEl.querySelector('.color-select');
    const section = {
      id: sectionEl.dataset.sectionId,
      name: (nameInput ? nameInput.value.trim() : '') || 'Untitled Section',
      color: normalizeColor(colorSelect ? colorSelect.value : 'grey'),
      groups: []
    };
    sectionEl.querySelectorAll('.group-list > .group-card').forEach(groupEl => {
      const nameEl = groupEl.querySelector('.group-name');
      const textarea = groupEl.querySelector('textarea');
      section.groups.push({
        id: groupEl.dataset.groupId,
        name: (nameEl ? nameEl.value.trim() : '') || 'Untitled Group',
        urls: (textarea ? textarea.value : '')
          .split('\n').map(u => u.trim()).filter(u => u.length > 0)
      });
    });
    sections.push(section);
  });
  return { sections };
}

/* ---------- add / save / reset ---------- */
function addNewSection() {
  const nameInput = document.getElementById('newSectionName');
  const colorInput = document.getElementById('newSectionColor');
  const name = nameInput.value.trim();
  if (!name) { alert('Please enter a name for the new section.'); return; }

  currentConfig.sections.push({
    id: newId('sec'),
    name,
    color: normalizeColor(colorInput.value),
    groups: [{ id: newId('g'), name, urls: [] }]
  });
  nameInput.value = '';
  renderAll();
  showToast('Section added! Click Save to apply.');
}

async function saveSettings() {
  currentConfig = collectFromDom();
  try {
    await storageSet({ ticketConfig: currentConfig });
    const totalGroups = currentConfig.sections.reduce((n, s) => n + s.groups.length, 0);
    document.getElementById('statusText').textContent =
      `Saved ${currentConfig.sections.length} sections / ${totalGroups} groups at ${new Date().toLocaleTimeString()}.`;
    showToast('✓ Settings Saved Successfully!');
  } catch (err) {
    console.error('Save failed:', err);
    showToast('⚠ Save failed: ' + (err.message || err));
  }
}

async function resetDefaults() {
  if (!confirm('This will wipe your saved configuration and restore the built-in defaults. Continue?')) return;
  await storageRemove('ticketConfig');
  await loadSettings();
  showToast('Reset to defaults. Click Save to persist them.');
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 2500);
}

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  document.getElementById('saveBtn').addEventListener('click', saveSettings);
  document.getElementById('addSectionBtn').addEventListener('click', addNewSection);
  document.getElementById('resetBtn').addEventListener('click', resetDefaults);
  document.getElementById('newSectionName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addNewSection();
  });
});