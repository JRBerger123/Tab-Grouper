chrome.action.onClicked.addListener(async (currentTab) => {
  // Generic placeholder URLs — replace with your real ones.
  const urlsToOpen = [
    "https://support.example.com/login",
    "https://portal.example.com",
    "https://rmm.example.com/devices"
  ];

  // Open the new tabs right next to your current ticket
  const newTabs = await Promise.all(
    urlsToOpen.map((url, i) => chrome.tabs.create({
      url: url,
      active: false,
      index: currentTab.index + 1 + i
    }))
  );

  // Gather the IDs of your ticket tab + the newly opened tabs
  const tabIdsToGroup = [currentTab.id, ...newTabs.map(t => t.id)];

  // Group them together
  const groupId = await chrome.tabs.group({ tabIds: tabIdsToGroup });

  // Name and color the tab group
  await chrome.tabGroups.update(groupId, {
    title: "Support Ticket",
    color: "blue"
  });
});