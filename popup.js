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
const LIGHT_COLORS = new Set(['yellow', 'pink', 'orange']);

function storageGet(key) {
  return new Promise((resolve) => chrome.storage.sync.get(key, (r) => resolve(r || {})));
}
function normalizeColor(raw) {
  const c = String(raw || '').toLowerCase().trim();
  return TAB_GROUP_COLORS[c] ? c : 'grey';
}
function mixWithWhite(hex, amount) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/* Supports both new { sections: [...] } format and old flat map */
function sectionsFromConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return [];
  if (Array.isArray(cfg.sections)) return cfg.sections;

  const sections = [];
  const map = new Map();
  for (const [key, item] of Object.entries(cfg)) {
    if (!item || typeof item !== 'object') continue;
    const group = { id: key, name: item.name || key, urls: item.urls || [] };
    const sectionName = String(item.section || '').trim();
    if (sectionName) {
      let s = map.get(sectionName);
      if (!s) {
        s = { name: sectionName, color: item.color, groups: [] };
        sections.push(s);
        map.set(sectionName, s);
      }
      s.groups.push(group);
    } else {
      sections.push({ name: item.name || key, color: item.color, groups: [group] });
    }
  }
  return sections;
}

function renderSection(container, section) {
  const colorName = normalizeColor(section.color);
  const realColor = TAB_GROUP_COLORS[colorName];
  const isLight = LIGHT_COLORS.has(colorName);
  const groups = Array.isArray(section.groups) ? section.groups : [];
  if (groups.length === 0) return;

  /* Section with a single group => single flat button (uses section name) */
  if (groups.length === 1) {
    const group = groups[0];
    const btn = document.createElement('button');
    btn.className = 'group-btn' + (isLight ? ' light-text' : '');
    btn.textContent = section.name || group.name;
    btn.style.backgroundColor = realColor;
    btn.addEventListener('click', () => openAndGroupTicket(section, group));
    container.appendChild(btn);
    return;
  }

  /* Section with multiple groups => parent + collapsible sub-menu */
  const parentBtn = document.createElement('button');
  parentBtn.className = 'group-btn parent-btn' + (isLight ? ' light-text' : '');
  parentBtn.style.backgroundColor = realColor;

  const label = document.createElement('span');
  label.textContent = section.name;

  const arrow = document.createElement('span');
  arrow.className = 'arrow';
  arrow.innerHTML = '&#9660;';

  parentBtn.appendChild(label);
  parentBtn.appendChild(arrow);

  const subMenu = document.createElement('div');
  subMenu.className = 'sub-menu';
  subMenu.style.borderLeftColor = realColor;

  for (const group of groups) {
    const subBtn = document.createElement('button');
    subBtn.className = 'sub-btn';
    subBtn.textContent = group.name;
    subBtn.style.backgroundColor = mixWithWhite(realColor, 0.85);
    subBtn.addEventListener('click', () => openAndGroupTicket(section, group));
    subMenu.appendChild(subBtn);
  }

  let open = false;
  parentBtn.addEventListener('click', () => {
    open = !open;
    subMenu.classList.toggle('open', open);
    arrow.innerHTML = open ? '&#9650;' : '&#9660;';
  });

  container.appendChild(parentBtn);
  container.appendChild(subMenu);
}

async function renderGroups() {
  const data = await storageGet('ticketConfig');
  const saved = data.ticketConfig;
  const cfg = (saved && typeof saved === 'object' && Object.keys(saved).length > 0)
    ? saved
    : DEFAULT_CONFIG;

  const sections = sectionsFromConfig(cfg);
  const container = document.getElementById('groupList');
  container.innerHTML = '';

  if (sections.length === 0) {
    container.innerHTML =
      '<div class="empty-msg">No sections configured.<br>Click Edit Saved URLs to add some.</div>';
    return;
  }

  for (const section of sections) renderSection(container, section);
}

async function openAndGroupTicket(section, group) {
  if (!group || !Array.isArray(group.urls) || group.urls.length === 0) {
    alert('No URLs configured for this group. Click "Edit Saved URLs" to set them.');
    return;
  }
  const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const newTabs = await Promise.all(group.urls.map((url, i) =>
    chrome.tabs.create({ url, active: false, index: currentTab.index + 1 + i })
  ));
  const tabIdsToGroup = [currentTab.id, ...newTabs.map(t => t.id)];
  const groupId = await chrome.tabs.group({ tabIds: tabIdsToGroup });
  await chrome.tabGroups.update(groupId, {
    title: group.name || section.name || 'Ticket',
    color: normalizeColor(section.color)
  });
  window.close();
}

document.getElementById('openOptionsBtn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
document.addEventListener('DOMContentLoaded', renderGroups);