// Static MAIN-world snapshot implementation injected by the MV3 service worker.
// Keep this file free of eval/new Function so `chrome_snapshot` works on strict-CSP pages.
(() => {
  function getPiChromeState() {
    const state = window.__PI_CHROME_STATE__ || {
      nextElementUid: 1,
      elements: {},
      console: [],
      network: [],
      nextRequestId: 1,
      instrumentationInstalled: false,
    };
    window.__PI_CHROME_STATE__ = state;
    return state;
  }

  function rememberElement(element) {
    const state = getPiChromeState();
    if (!element.__piChromeUid) element.__piChromeUid = "el-" + state.nextElementUid++;
    state.elements[element.__piChromeUid] = element;
    return element.__piChromeUid;
  }

  function isElementVisible(element) {
    if (!element || !element.getBoundingClientRect) return false;
    const style = getComputedStyle(element);
    if (style.visibility === "hidden" || style.display === "none") return false;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    if (rect.bottom < 0 || rect.right < 0) return false;
    if (rect.top > innerHeight || rect.left > innerWidth) return false;
    return true;
  }

  function occluderAt(x, y, expected) {
    const top = document.elementFromPoint(x, y);
    if (!top || top === expected) return null;
    if (expected && expected.contains(top)) return null;
    if (top.contains(expected)) return null;
    return {
      tag: top.tagName.toLowerCase(),
      id: top.id || undefined,
      className: typeof top.className === "string" ? top.className : undefined,
    };
  }

  function installPiChromeInstrumentation() {
    const state = getPiChromeState();
    if (state.instrumentationInstalled) return;
    state.instrumentationInstalled = true;
    const pushConsole = (level, args) => {
      state.console.push({
        id: state.console.length + 1,
        level,
        timestamp: Date.now(),
        url: location.href,
        args: Array.from(args).map((arg) => {
          try {
            if (typeof arg === "string") return arg;
            if (arg instanceof Error) return { name: arg.name, message: arg.message, stack: arg.stack };
            return JSON.parse(JSON.stringify(arg));
          } catch {
            return String(arg);
          }
        }),
      });
      if (state.console.length > 500) state.console.splice(0, state.console.length - 500);
    };
    for (const level of ["debug", "log", "info", "warn", "error"]) {
      const original = console[level];
      if (typeof original !== "function" || original.__piChromeWrapped) continue;
      const wrapped = function(...args) {
        pushConsole(level, args);
        return original.apply(this, args);
      };
      wrapped.__piChromeWrapped = true;
      console[level] = wrapped;
    }
    window.addEventListener("error", (event) => pushConsole("pageerror", [event.message, event.filename + ":" + event.lineno + ":" + event.colno]));
    window.addEventListener("unhandledrejection", (event) => pushConsole("unhandledrejection", [event.reason]));

    const trimBody = (text) => typeof text === "string" && text.length > 200000 ? text.slice(0, 200000) + `\n[truncated ${text.length - 200000} chars]` : text;
    const record = (entry) => {
      state.network.push(entry);
      if (state.network.length > 1000) state.network.splice(0, state.network.length - 1000);
      return entry;
    };
    if (window.fetch && !window.fetch.__piChromeWrapped) {
      const originalFetch = window.fetch.bind(window);
      const wrappedFetch = async (...args) => {
        const id = "req-" + state.nextRequestId++;
        const startedAt = Date.now();
        const input = args[0];
        const init = args[1] || {};
        const url = typeof input === "string" ? input : input?.url;
        const method = (init.method || input?.method || "GET").toUpperCase();
        const entry = record({ id, type: "fetch", method, url: String(url || ""), startedAt, pageUrl: location.href, status: "pending" });
        try {
          const response = await originalFetch(...args);
          entry.status = response.status;
          entry.statusText = response.statusText;
          entry.ok = response.ok;
          entry.responseUrl = response.url;
          entry.durationMs = Date.now() - startedAt;
          entry.responseHeaders = Array.from(response.headers.entries());
          response.clone().text().then((text) => {
            entry.responseBody = trimBody(text);
            entry.responseBodyTruncated = typeof text === "string" && text.length > 200000;
          }).catch((error) => { entry.responseBodyError = error?.message || String(error); });
          return response;
        } catch (error) {
          entry.error = error?.message || String(error);
          entry.durationMs = Date.now() - startedAt;
          throw error;
        }
      };
      wrappedFetch.__piChromeWrapped = true;
      window.fetch = wrappedFetch;
    }
    if (window.XMLHttpRequest && !XMLHttpRequest.prototype.open.__piChromeWrapped) {
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this.__piChromeRequest = { method: String(method || "GET").toUpperCase(), url: String(url || "") };
        return originalOpen.call(this, method, url, ...rest);
      };
      XMLHttpRequest.prototype.open.__piChromeWrapped = true;
      XMLHttpRequest.prototype.send = function(body) {
        const id = "req-" + state.nextRequestId++;
        const startedAt = Date.now();
        const info = this.__piChromeRequest || {};
        const entry = record({ id, type: "xhr", method: info.method || "GET", url: info.url || "", startedAt, pageUrl: location.href, status: "pending" });
        this.addEventListener("loadend", () => {
          entry.status = this.status;
          entry.statusText = this.statusText;
          entry.responseUrl = this.responseURL;
          entry.durationMs = Date.now() - startedAt;
          try { entry.responseHeadersText = this.getAllResponseHeaders(); } catch {}
          try {
            if (typeof this.responseText === "string") {
              entry.responseBody = trimBody(this.responseText);
              entry.responseBodyTruncated = this.responseText.length > 200000;
            }
          } catch (error) { entry.responseBodyError = error?.message || String(error); }
        });
        this.addEventListener("error", () => { entry.error = "XMLHttpRequest error"; entry.durationMs = Date.now() - startedAt; });
        return originalSend.call(this, body);
      };
    }
  }

  function snapshotPage(maxElements, containingText, roleFilter, nearUid) {
    installPiChromeInstrumentation();
    const unique = (selector) => {
      try { return document.querySelectorAll(selector).length === 1; } catch { return false; }
    };
    const cssEscape = (value) => (window.CSS && CSS.escape) ? CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    const selectorFor = (element) => {
      if (element.id && unique("#" + cssEscape(element.id))) return "#" + cssEscape(element.id);
      const attr = ["aria-label", "name", "placeholder", "data-testid", "role"].find((name) => element.getAttribute(name));
      if (attr) {
        const candidate = element.tagName.toLowerCase() + "[" + attr + "=" + JSON.stringify(element.getAttribute(attr)) + "]";
        if (unique(candidate)) return candidate;
      }
      const parts = [];
      let current = element;
      while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
        let part = current.tagName.toLowerCase();
        if (current.classList.length > 0) part += "." + Array.from(current.classList).slice(0, 2).map(cssEscape).join(".");
        const siblings = Array.from(current.parentElement?.children ?? []).filter((sibling) => sibling.tagName === current.tagName);
        if (siblings.length > 1) part += ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")";
        parts.unshift(part);
        const candidate = parts.join(" > ");
        if (unique(candidate)) return candidate;
        current = current.parentElement;
      }
      return parts.join(" > ");
    };
    const visible = (element) => isElementVisible(element);
    const labelFor = (element) => (
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      element.getAttribute("placeholder") ||
      element.innerText ||
      element.value ||
      element.textContent ||
      ""
    ).trim().replace(/\s+/g, " ").slice(0, 160);
    let candidates = Array.from(document.querySelectorAll('a, button, input, textarea, select, summary, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="checkbox"], [contenteditable="true"], [tabindex]:not([tabindex="-1"])'));
    if (containingText) {
      const needle = String(containingText).toLowerCase();
      candidates = candidates.filter((element) => labelFor(element).toLowerCase().includes(needle));
    }
    if (roleFilter) {
      const wanted = String(roleFilter).toLowerCase();
      candidates = candidates.filter((element) => {
        const role = (element.getAttribute("role") || element.tagName).toLowerCase();
        return role === wanted;
      });
    }
    let near;
    if (nearUid) {
      const state = getPiChromeState();
      near = state.elements[nearUid];
    }
    if (near) {
      const nearRect = near.getBoundingClientRect();
      const cx = nearRect.left + nearRect.width / 2;
      const cy = nearRect.top + nearRect.height / 2;
      candidates.sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        const da = Math.hypot(ra.left + ra.width / 2 - cx, ra.top + ra.height / 2 - cy);
        const db = Math.hypot(rb.left + rb.width / 2 - cx, rb.top + rb.height / 2 - cy);
        return da - db;
      });
    }
    const elements = candidates.filter(visible).slice(0, maxElements).map((element, index) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const occluded = occluderAt(cx, cy, element);
      return {
        index,
        uid: rememberElement(element),
        tag: element.tagName.toLowerCase(),
        selector: selectorFor(element),
        label: labelFor(element),
        href: element.href || undefined,
        type: element.getAttribute("type") || undefined,
        role: element.getAttribute("role") || undefined,
        disabled: Boolean(element.disabled || element.getAttribute("aria-disabled") === "true"),
        inert: Boolean(element.closest?.("[inert]")),
        pointerEvents: style.pointerEvents,
        occluded: occluded || undefined,
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      };
    });
    return {
      title: document.title,
      url: location.href,
      viewport: { width: innerWidth, height: innerHeight, scrollX, scrollY },
      text: document.body ? document.body.innerText.replace(/\s+\n/g, "\n").trim().slice(0, 30000) : "",
      elements,
      filter: { containingText: containingText || undefined, roleFilter: roleFilter || undefined, nearUid: nearUid || undefined },
    };
  }

  globalThis.__piChromeSnapshotPage = snapshotPage;
})();
