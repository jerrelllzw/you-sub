////////////////////
// Initialization //
////////////////////

// Ensure the popup is ready before adding event listeners
document.addEventListener('DOMContentLoaded', () => {
	document
		.getElementById('openAndSyncBtn')
		.addEventListener('click', openAndSync);
	document.getElementById('addGroupBtn').addEventListener('click', addNewGroup);
	loadAndDisplayGroups();
});

/////////////////////
// Group functions //
/////////////////////

// Load groups and subscriptions from storage and display them
function loadAndDisplayGroups() {
	chrome.storage.local.get(['subscriptions', 'groups'], (result) => {
		const container = document.getElementById('groups');
		container.innerHTML = '';

		let groups = result.groups || [defaultGroup];
		const subs = result.subscriptions || {};
		const grouped = {};

		// Group subscriptions by their group name
		for (const id in subs) {
			const sub = subs[id];
			if (!grouped[sub.group]) grouped[sub.group] = [];
			grouped[sub.group].push(sub);
		}

		// Sort everything alphabetically
		groups.sort((a, b) => a.localeCompare(b));
		for (const group in grouped) {
			grouped[group].sort((a, b) => a.name.localeCompare(b.name));
		}

		// For each group
		for (const group of groups) {
			// Skip groups that have no subscriptions
			if (!grouped[group] || grouped[group].length === 0) continue;

			// Create group header
			const header = document.createElement('div');
			header.className = 'group-header';

			// Create title element
			const title = document.createElement('span');
			title.textContent = group;
			header.appendChild(title);

			// Create delete button for non-default groups
			if (group !== defaultGroup) {
				const delBtn = document.createElement('button');
				delBtn.textContent = 'Delete';
				delBtn.className = 'delete-btn';
				delBtn.addEventListener('click', () => deleteGroup(group));
				header.appendChild(delBtn);
			}

			// Append header
			container.appendChild(header);

			// For each subscription in the group
			for (const sub of grouped[group]) {
				// Create row
				const row = document.createElement('div');
				row.className = 'channel-row';

				// Create icon
				const iconImg = document.createElement('img');
				iconImg.src = sub.icon;
				iconImg.className = 'channel-icon';
				row.appendChild(iconImg);

				// Create link to channel
				const link = document.createElement('a');
				link.textContent = sub.name;
				link.href = sub.url;
				link.className = 'channel-link';
				link.onclick = (e) => {
					e.preventDefault();
					chrome.tabs.create({ url: sub.url, active: false });
				};
				row.appendChild(link);

				// Create dropdown for group selection
				const dropdown = document.createElement('select');
				groups.forEach((group) => {
					const option = document.createElement('option');
					option.value = group;
					option.textContent = group;
					if (group === sub.group) option.selected = true;
					dropdown.appendChild(option);
				});
				dropdown.addEventListener('change', () =>
					updateSubscriptionGroup(
						sub.channelId,
						dropdown.value,
						loadAndDisplayGroups
					)
				);
				row.appendChild(dropdown);

				// Append row
				container.appendChild(row);
			}
		}
	});
}

// Update subscription group in local storage
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

////////////////////
// Sync functions //
////////////////////

// Open YouTube subscriptions page and sync with local storage
function openAndSync() {
	chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
		const tab = tabs[0];

		// Go to subscriptions page if not already there, then sync
		if (tab.url.includes('youtube.com/feed/channels')) {
			fetchAndSyncWithTab(tab.id);
		} else {
			chrome.tabs.update(
				tab.id,
				{ url: 'https://www.youtube.com/feed/channels' },
				(updatedTab) => {
					waitForTabLoad(updatedTab.id, fetchAndSyncWithTab);
				}
			);
		}
	});
}

// Wait for the tab to finish loading before syncing
function waitForTabLoad(tabId, callback) {
	function handleUpdate(updatedTabId, info) {
		if (updatedTabId === tabId && info.status === 'complete') {
			chrome.tabs.onUpdated.removeListener(handleUpdate);
			callback(tabId);
		}
	}
	chrome.tabs.onUpdated.addListener(handleUpdate);
}

// Sync subscriptions from the active YouTube tab
function fetchAndSyncWithTab(tabId) {
	chrome.tabs.sendMessage(
		tabId,
		{ type: 'FETCH_SUBSCRIPTIONS' },
		(response) => {
			// Handle errors or no response
			if (chrome.runtime.lastError || !response) {
				alert(
					'Could not fetch subscriptions. Try refreshing the YouTube page.'
				);
				return;
			}

			// Sync with local storage
			const subs = response.subs;
			syncWithStorage(subs, loadAndDisplayGroups);
		}
	);
}

// Sync subscriptions from YouTube with local storage
function syncWithStorage(subsFromYouTube, done) {
	chrome.storage.local.get(['subscriptions', 'groups'], (result) => {
		const subscriptions = result.subscriptions || {};
		const groups = result.groups || [defaultGroup];
		const updated = {};

		// Update existing subscriptions and remove old ones
		for (const sub of subsFromYouTube) {
			updated[sub.channelId] = {
				...sub,
				group: subscriptions[sub.channelId]?.group || defaultGroup,
			};
		}

		// Update local storage
		chrome.storage.local.set({ subscriptions: updated, groups }, done);
	});
}

///////////////////////////
// Group CRUD operations //
///////////////////////////

// Default group name
const defaultGroup = 'Ungrouped';

// Add new group from input
function addNewGroup() {
	// Validate input
	const input = document.getElementById('newGroupInput');
	const newGroup = input.value.trim();
	if (!newGroup) return;

	// Add new group to storage if it doesn't already exist
	chrome.storage.local.get('groups', (result) => {
		const groups = result.groups || [defaultGroup];
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

// Delete a group and move affected subscriptions to default group
function deleteGroup(group) {
	chrome.storage.local.get(['subscriptions', 'groups'], (result) => {
		const subs = result.subscriptions || {};
		const groups = result.groups || [];

		// Move affected subs to default group
		for (const id in subs) {
			if (subs[id].group === group) {
				subs[id].group = defaultGroup;
			}
		}

		// Remove the group
		const updatedGroups = groups.filter((g) => g !== group);
		chrome.storage.local.set(
			{ subscriptions: subs, groups: updatedGroups },
			() => {
				loadAndDisplayGroups();
			}
		);
	});
}
