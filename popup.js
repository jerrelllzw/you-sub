function syncWithStorage(subsFromYouTube, done) {
	chrome.storage.local.get(['subscriptions', 'groups'], (result) => {
		const stored = result.subscriptions || {};
		const groups = result.groups || ['Ungrouped'];
		const updated = {};

		for (const sub of subsFromYouTube) {
			if (stored[sub.channelId]) {
				updated[sub.channelId] = {
					...sub,
					group: stored[sub.channelId].group || 'Ungrouped',
				};
			} else {
				updated[sub.channelId] = {
					...sub,
					group: 'Ungrouped',
				};
			}
		}

		chrome.storage.local.set({ subscriptions: updated, groups }, done);
	});
}

function loadAndDisplayGroups() {
	chrome.storage.local.get(['subscriptions', 'groups'], (result) => {
		const container = document.getElementById('groups');
		container.innerHTML = '';

		let groups = result.groups || ['Ungrouped'];
		groups.sort((a, b) => a.localeCompare(b)); // Sort groups alphabetically

		const subs = result.subscriptions || {};
		const grouped = {};

		for (const id in subs) {
			const sub = subs[id];
			if (!grouped[sub.group]) grouped[sub.group] = [];
			grouped[sub.group].push(sub);
		}

		for (const groupName of groups) {
			// Skip groups that have no subscriptions
			if (!grouped[groupName] || grouped[groupName].length === 0) continue;

			// Create group header and delete button, etc.
			const header = document.createElement('div');
			header.className = 'group-header';

			const title = document.createElement('span');
			title.textContent = groupName;
			header.appendChild(title);

			if (groupName !== 'Ungrouped') {
				const delBtn = document.createElement('button');
				delBtn.textContent = 'delete';
				delBtn.className = 'delete-btn';
				delBtn.title = 'Delete group';
				delBtn.addEventListener('click', () => deleteGroup(groupName));
				header.appendChild(delBtn);
			}
			container.appendChild(header);

			// Append subscriptions in original order (no sorting)
			for (const sub of grouped[groupName]) {
				const row = document.createElement('div');
				row.className = 'channel-row';

				const iconImg = document.createElement('img');
				iconImg.src = sub.icon || 'default-icon.png'; // fallback icon if none
				iconImg.className = 'channel-icon';
				row.appendChild(iconImg);

				const link = document.createElement('a');
				link.textContent = sub.name;
				link.href = sub.url;
				link.className = 'channel-link';
				link.onclick = (e) => {
					e.preventDefault(); // Prevent default navigation
					chrome.tabs.create({ url: sub.url, active: false }); // Open in background
				};

				row.appendChild(link);

				const dropdown = document.createElement('select');
				groups.forEach((g) => {
					const opt = document.createElement('option');
					opt.value = g;
					opt.textContent = g;
					if (g === sub.group) opt.selected = true;
					dropdown.appendChild(opt);
				});
				dropdown.addEventListener('change', () =>
					updateSubscriptionGroup(
						sub.channelId,
						dropdown.value,
						loadAndDisplayGroups
					)
				);
				row.appendChild(dropdown);

				container.appendChild(row);
			}
		}
	});
}

function updateSubscriptionGroup(channelId, newGroup, callback) {
	chrome.storage.local.get('subscriptions', (result) => {
		const subs = result.subscriptions || {};
		if (subs[channelId]) {
			subs[channelId].group = newGroup;
			chrome.storage.local.set({ subscriptions: subs }, () => {
				if (callback) callback();
			});
		}
	});
}

function addNewGroup() {
	const input = document.getElementById('newGroupInput');
	const newGroup = input.value.trim();
	if (!newGroup) return;

	chrome.storage.local.get('groups', (result) => {
		const groups = result.groups || ['Ungrouped'];
		if (!groups.includes(newGroup)) {
			groups.push(newGroup);
			chrome.storage.local.set({ groups }, () => {
				input.value = '';
				loadAndDisplayGroups();
			});
		} else {
			alert('Group already exists.');
		}
	});
}

function deleteGroup(groupName) {
	chrome.storage.local.get(['subscriptions', 'groups'], (result) => {
		const subs = result.subscriptions || {};
		const groups = result.groups || [];

		// Move affected subs to 'Ungrouped'
		for (const id in subs) {
			if (subs[id].group === groupName) {
				subs[id].group = 'Ungrouped';
			}
		}

		// Remove the group
		const updatedGroups = groups.filter((g) => g !== groupName);

		chrome.storage.local.set(
			{ subscriptions: subs, groups: updatedGroups },
			() => {
				loadAndDisplayGroups();
			}
		);
	});
}

document.addEventListener('DOMContentLoaded', () => {
	document
		.getElementById('openAndSyncBtn')
		.addEventListener('click', openAndSync);
	document.getElementById('addGroupBtn').addEventListener('click', addNewGroup);
	loadAndDisplayGroups();
});

function openAndSync() {
	chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
		const tab = tabs[0];
		const subsUrl = 'https://www.youtube.com/feed/channels';

		function doSyncWithTab(targetTabId) {
			chrome.tabs.sendMessage(
				targetTabId,
				{ type: 'SCRAPE_SUBSCRIPTIONS' },
				(response) => {
					if (chrome.runtime.lastError || !response) {
						alert(
							'Could not fetch subscriptions. Try refreshing the YouTube page.'
						);
						return;
					}
					const subs = response.subs;
					syncWithStorage(subs, loadAndDisplayGroups);
				}
			);
		}

		if (tab.url.includes('youtube.com/feed/channels')) {
			doSyncWithTab(tab.id);
		} else {
			chrome.tabs.update(tab.id, { url: subsUrl }, (updatedTab) => {
				chrome.tabs.onUpdated.addListener(function waitForLoad(tabId, info) {
					if (tabId === updatedTab.id && info.status === 'complete') {
						chrome.tabs.onUpdated.removeListener(waitForLoad);
						doSyncWithTab(tabId);
					}
				});
			});
		}
	});
}
