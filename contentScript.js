// Extract channel ID from URL
function extractChannelIdFromUrl(url) {
	const channelMatch = url.match(/\/channel\/([^/?&]+)/);
	if (channelMatch) return channelMatch[1];
	const userMatch = url.match(/\/user\/([^/?&]+)/);
	if (userMatch) return userMatch[1];
	return url;
}

function scrapeSubscriptions() {
	const subs = [];
	const channelElements = document.querySelectorAll('ytd-channel-renderer');

	channelElements.forEach((el) => {
		const nameEl = el.querySelector('#text.ytd-channel-name');
		const linkEl = el.querySelector('a#main-link');
		const imgEl = el.querySelector('#img');

		if (nameEl && linkEl && imgEl) {
			const rawImg = imgEl.getAttribute('src') || '';
			const iconUrl = rawImg.startsWith('//') ? 'https:' + rawImg : rawImg;

			subs.push({
				channelId: extractChannelIdFromUrl(linkEl.href),
				name: nameEl.textContent.trim(),
				url: linkEl.href,
				icon: iconUrl,
			});
		}
	});

	return subs;
}

// Respond to scrape request
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.type === 'SCRAPE_SUBSCRIPTIONS') {
		const subs = scrapeSubscriptions();
		sendResponse({ subs });
	}
});
