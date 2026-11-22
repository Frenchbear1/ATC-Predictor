// src/ext/background.js
var OFFSCREEN_URL = "offscreen.html";
async function hasOffscreen() {
  const ctx = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  return ctx.length > 0;
}
async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ["USER_MEDIA", "BLOBS"],
    justification: "Record LiveATC audio and transcribe it on this computer."
  });
}
async function setStatus(patch) {
  const { status = {}, feedState = {} } = await chrome.storage.session.get(["status", "feedState"]);
  const next = { ...status, ...patch };
  await chrome.storage.session.set({ status: next });
  const on = next.state === "listening" || next.state === "loading";
  const total = next.count || 0;
  chrome.action.setBadgeBackgroundColor({ color: next.state === "error" ? "#d33" : "#1a8f5a" });
  chrome.action.setBadgeText({ text: on ? String(total) : "" });
  return next;
}
async function setFeedState(id, patch) {
  const { feedState = {} } = await chrome.storage.session.get("feedState");
  feedState[id] = { ...feedState[id] || {}, ...patch };
  await chrome.storage.session.set({ feedState });
}
async function pushRecent(tx) {
  const { recent = [] } = await chrome.storage.session.get("recent");
  recent.unshift({ id: tx.id, ts: tx.ts, text: tx.text, phase: tx.phase, speaker: tx.speaker, airport: tx.airport, feed: tx.feed });
  await chrome.storage.session.set({ recent: recent.slice(0, 8) });
}
async function settings() {
  const { popup = {} } = await chrome.storage.local.get("popup");
  const model = popup.model === "custom" ? popup.customModel || "Xenova/whisper-base.en" : popup.model || "Xenova/whisper-base.en";
  return { model, sensitivity: +(popup.sensitivity ?? 3), gapMs: +(popup.gapMs ?? 700), keepAudio: popup.keepAudio ?? true };
}
async function startFeeds(feeds) {
  if (!feeds.length) return;
  await ensureOffscreen();
  const { status = {} } = await chrome.storage.session.get("status");
  if (status.state !== "listening" && status.state !== "loading") {
    await setStatus({ state: "loading", detail: "Starting\u2026", count: 0, startedAt: Date.now() });
  }
  for (const f of feeds) await setFeedState(`feed:${f.mount}`, { state: "connecting", detail: "Connecting\u2026", count: 0 });
  await chrome.runtime.sendMessage({ target: "offscreen", type: "startFeeds", feeds, settings: await settings() });
}
async function startFavorites() {
  const { favorites = [] } = await chrome.storage.local.get("favorites");
  await startFeeds(favorites.filter((f) => f.enabled !== false));
}
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target === "offscreen") return false;
  const reply = (fn) => {
    fn().then(() => sendResponse({ ok: true })).catch(async (e) => {
      await setStatus({ state: "error", detail: String(e?.message || e) });
      sendResponse({ ok: false, error: String(e?.message || e) });
    });
    return true;
  };
  if (msg.type === "start") {
    return reply(async () => {
      await ensureOffscreen();
      const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: msg.tabId });
      const { status = {} } = await chrome.storage.session.get("status");
      await setStatus({ state: "loading", detail: "Starting\u2026", tabId: msg.tabId, count: status.state === "listening" ? status.count || 0 : 0 });
      await chrome.runtime.sendMessage({ target: "offscreen", type: "start", streamId, meta: msg.meta, settings: msg.settings });
    });
  }
  if (msg.type === "startFavorites") return reply(startFavorites);
  if (msg.type === "startFeeds") return reply(() => startFeeds(msg.feeds));
  if (msg.type === "stopFeed") {
    return reply(async () => {
      if (await hasOffscreen()) await chrome.runtime.sendMessage({ target: "offscreen", type: "stopFeed", id: msg.id }).catch(() => {
      });
      await setFeedState(msg.id, { state: "idle", detail: "Stopped" });
    });
  }
  if (msg.type === "stop") {
    return reply(async () => {
      if (await hasOffscreen()) await chrome.runtime.sendMessage({ target: "offscreen", type: "stop" }).catch(() => {
      });
      const { feedState = {} } = await chrome.storage.session.get("feedState");
      for (const k of Object.keys(feedState)) feedState[k] = { ...feedState[k], state: "idle", detail: "Stopped" };
      await chrome.storage.session.set({ feedState });
      await setStatus({ state: "idle", detail: "Stopped" });
    });
  }
  if (msg.type === "status") {
    setStatus(msg.status);
    return false;
  }
  if (msg.type === "feedStatus") {
    setFeedState(msg.id, msg.status);
    return false;
  }
  if (msg.type === "tx") {
    (async () => {
      const { status = {}, feedState = {} } = await chrome.storage.session.get(["status", "feedState"]);
      await setStatus({ count: (status.count || 0) + 1 });
      if (msg.sessionId?.startsWith("feed:")) await setFeedState(msg.sessionId, { count: (feedState[msg.sessionId]?.count || 0) + 1, last: Date.now() });
      await pushRecent(msg.tx);
    })();
    return false;
  }
  if (msg.type === "closed") {
    chrome.offscreen.closeDocument().catch(() => {
    });
    return false;
  }
  return false;
});
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { status = {} } = await chrome.storage.session.get("status");
  if (status.tabId === tabId && await hasOffscreen()) {
    chrome.runtime.sendMessage({ target: "offscreen", type: "stopFeed", id: "tab" }).catch(() => {
    });
  }
});
chrome.runtime.onStartup.addListener(async () => {
  const { feedPrefs = {} } = await chrome.storage.local.get("feedPrefs");
  if (feedPrefs.autoStart) startFavorites().catch((e) => setStatus({ state: "error", detail: String(e?.message || e) }));
});
