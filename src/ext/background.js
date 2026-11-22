// Service worker: starts/stops the offscreen recorder and keeps status for the popup.

const OFFSCREEN_URL = 'offscreen.html';

async function hasOffscreen() {
  const ctx = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  return ctx.length > 0;
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['USER_MEDIA'],
    justification: 'Record the LiveATC tab you are listening to and transcribe it on this computer.',
  });
}

async function setStatus(patch) {
  const { status = {} } = await chrome.storage.session.get('status');
  const next = { ...status, ...patch };
  await chrome.storage.session.set({ status: next });
  const on = next.state === 'listening' || next.state === 'loading';
  chrome.action.setBadgeBackgroundColor({ color: next.state === 'error' ? '#d33' : '#1a8f5a' });
  chrome.action.setBadgeText({ text: on ? String(next.count ?? 0) : '' });
  return next;
}

async function pushRecent(tx) {
  const { recent = [] } = await chrome.storage.session.get('recent');
  recent.unshift({ id: tx.id, ts: tx.ts, text: tx.text, phase: tx.phase, speaker: tx.speaker });
  await chrome.storage.session.set({ recent: recent.slice(0, 8) });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target === 'offscreen') return false; // not for us

  if (msg.type === 'start') {
    (async () => {
      try {
        const { status = {} } = await chrome.storage.session.get('status');
        if (status.state === 'listening' || status.state === 'loading') {
          await chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop' }).catch(() => {});
        }
        await ensureOffscreen();
        const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: msg.tabId });
        await setStatus({ state: 'loading', detail: 'Starting…', meta: msg.meta, tabId: msg.tabId, count: 0, startedAt: Date.now() });
        await chrome.storage.session.set({ recent: [] });
        await chrome.runtime.sendMessage({ target: 'offscreen', type: 'start', streamId, meta: msg.meta, settings: msg.settings });
        sendResponse({ ok: true });
      } catch (e) {
        await setStatus({ state: 'error', detail: String(e?.message || e) });
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  if (msg.type === 'stop') {
    (async () => {
      if (await hasOffscreen()) {
        await chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop' }).catch(() => {});
      }
      await setStatus({ state: 'idle', detail: 'Stopped' });
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.type === 'status') { setStatus(msg.status); return false; }

  if (msg.type === 'tx') {
    (async () => {
      const { status = {} } = await chrome.storage.session.get('status');
      await setStatus({ count: (status.count || 0) + 1 });
      await pushRecent(msg.tx);
    })();
    return false;
  }

  if (msg.type === 'closed') {
    // offscreen finished stopping; free it so the next start gets a fresh capture
    chrome.offscreen.closeDocument().catch(() => {});
    return false;
  }
  return false;
});

// If the captured tab closes, stop.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { status = {} } = await chrome.storage.session.get('status');
  if (status.tabId === tabId && status.state !== 'idle') {
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop' }).catch(() => {});
    setStatus({ state: 'idle', detail: 'Tab closed' });
  }
});
