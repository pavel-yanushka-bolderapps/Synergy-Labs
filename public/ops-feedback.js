// Synergy Ops on-site feedback (BugHerd-style). Loaded only for people signed
// in to /ops -- see src/components/layout/FeedbackLoader.astro. Click
// "Feedback", click any element, write a comment: it is saved as a numbered
// pin (with a screenshot) that both of you see on the page and in /ops.
//
// Everything lives in a shadow root so the site's CSS and this UI never mix.
(() => {
  if (window.__opsFeedback) return;
  window.__opsFeedback = true;

  const API = "/api/ops";
  const PEOPLE = ["Pavel", "Andrew"];
  const STATUS = { open: "Open", doing: "In progress", done: "Done" };
  const COLORS = { open: "#e8590c", doing: "#1c7ed6", done: "#868e96" };

  // ---- Shell --------------------------------------------------------------
  const host = document.createElement("div");
  host.id = "ops-feedback-root";
  host.style.cssText = "position:absolute;top:0;left:0;width:0;height:0;z-index:2147483000;";
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
  <style>
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; }
    .bar { position: fixed; left: 16px; bottom: 16px; display: flex; gap: 6px; align-items: center; background: #0a332c; color: #fff;
           border-radius: 999px; padding: 6px 6px 6px 14px; box-shadow: 0 6px 24px rgba(0,0,0,.25); font-size: 13px; }
    .bar button, .bar a { all: unset; cursor: pointer; padding: 6px 12px; border-radius: 999px; font-size: 13px; color: #fff; }
    .bar button:hover, .bar a:hover { background: rgba(255,255,255,.15); }
    .bar .primary { background: #12b886; color: #062b22; font-weight: 600; }
    .bar .primary.on { background: #ffd43b; }
    .hint { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); background: #212529; color: #fff; padding: 8px 14px;
            border-radius: 8px; font-size: 13px; box-shadow: 0 4px 16px rgba(0,0,0,.25); }
    .hl { position: absolute; pointer-events: none; outline: 2px solid #ffd43b; background: rgba(255,212,59,.12); border-radius: 3px; transition: all .05s; }
    .pin { position: absolute; width: 26px; height: 26px; margin: -13px 0 0 -13px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg);
           color: #fff; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; cursor: pointer;
           border: 2px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,.35); }
    .pin span { transform: rotate(45deg); }
    .pin.flash { animation: flash 1s ease-in-out 3; }
    @keyframes flash { 50% { box-shadow: 0 0 0 10px rgba(255,212,59,.6); } }
    .pop { position: absolute; width: 340px; background: #fff; color: #212529; border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.3);
           padding: 14px; font-size: 14px; line-height: 1.45; }
    .pop h4 { margin: 0 0 6px; font-size: 13px; color: #868e96; font-weight: 600; display: flex; justify-content: space-between; gap: 8px; }
    .pop textarea { width: 100%; min-height: 80px; border: 1px solid #ced4da; border-radius: 8px; padding: 8px; font-size: 14px; resize: vertical; color: #212529; }
    .pop select { border: 1px solid #ced4da; border-radius: 6px; padding: 4px 6px; font-size: 13px; color: #212529; background: #fff; }
    .row { display: flex; gap: 8px; align-items: center; margin-top: 10px; flex-wrap: wrap; }
    .row .grow { flex: 1; }
    .btn { all: unset; cursor: pointer; padding: 6px 12px; border-radius: 8px; font-size: 13px; font-weight: 600; background: #0a332c; color: #fff; }
    .btn.ghost { background: #f1f3f5; color: #212529; }
    .btn[disabled] { opacity: .5; pointer-events: none; }
    .muted { color: #868e96; font-size: 12px; }
    .title { white-space: pre-wrap; margin: 4px 0 8px; }
    .comments { max-height: 220px; overflow: auto; border-top: 1px solid #f1f3f5; margin-top: 8px; padding-top: 6px; }
    .c { background: #f8f9fa; border-radius: 8px; padding: 6px 8px; margin: 6px 0; white-space: pre-wrap; }
    .shot { display: block; margin-top: 8px; border-radius: 8px; overflow: hidden; border: 1px solid #e9ecef; }
    .shot img { display: block; width: 100%; }
    .status { display: inline-block; border-radius: 999px; padding: 1px 8px; font-size: 11px; color: #fff; }
    label.chk { font-size: 12px; color: #495057; display: flex; gap: 4px; align-items: center; }
    a { color: #007244; }
  </style>
  <div class="layer"></div>
  <div class="bar">
    <span class="count">Feedback</span>
    <button class="primary add">+ Add</button>
    <button class="toggle">Hide pins</button>
    <a class="ops" href="/ops#Feedback" target="_blank" rel="noopener">Ops ↗</a>
  </div>`;
  const $ = (s) => root.querySelector(s);
  const layer = $(".layer");
  const el = (html) => {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const when = (iso) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  async function api(action, body) {
    const res = await fetch(`${API}/${action}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      $(".count").innerHTML = 'Signed out — <a href="/ops" style="color:#ffd43b">sign in</a>';
      throw new Error("Signed out of Ops");
    }
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  // ---- Locating elements ------------------------------------------------------
  function cssPath(node) {
    const parts = [];
    while (node && node.nodeType === 1 && node !== document.body && node !== document.documentElement) {
      if (node.id && document.querySelectorAll(`#${CSS.escape(node.id)}`).length === 1) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        break;
      }
      let part = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.tagName === node.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(" > ") || "body";
  }

  function pinPosition(f) {
    let target = null;
    try {
      target = f.selector ? document.querySelector(f.selector) : null;
    } catch {}
    if (target && target.getClientRects().length) {
      const r = target.getBoundingClientRect();
      return { x: r.left + scrollX + f.offsetX * r.width, y: r.top + scrollY + f.offsetY * r.height, exact: true };
    }
    return { x: f.pageX, y: f.pageY, exact: false };
  }

  // ---- Pins -----------------------------------------------------------------------
  let items = [];
  let showPins = true;
  let openPop = null;
  const params = new URLSearchParams(location.search);

  async function load() {
    try {
      items = await api(`feedback?path=${encodeURIComponent(location.pathname)}&host=${encodeURIComponent(location.host)}`);
    } catch (e) {
      return;
    }
    const open = items.filter((f) => f.status !== "done").length;
    $(".count").textContent = `Feedback · ${open} open${items.length > open ? `, ${items.length - open} done` : ""}`;
    render();
    const focus = params.get("feedback");
    if (focus) {
      const f = items.find((x) => String(x.number) === focus);
      if (f) {
        const p = pinPosition(f);
        scrollTo({ top: Math.max(0, p.y - innerHeight / 3), behavior: "smooth" });
        setTimeout(() => showThread(f), 600);
      }
      params.delete("feedback");
    }
  }

  function render() {
    layer.querySelectorAll(".pin").forEach((p) => p.remove());
    if (!showPins) return;
    for (const f of items) {
      const p = pinPosition(f);
      const pin = el(`<div class="pin" title="#${f.number} ${esc(f.title.slice(0, 80))}${p.exact ? "" : " (element moved)"}"><span>${f.number}</span></div>`);
      pin.style.left = `${p.x}px`;
      pin.style.top = `${p.y}px`;
      pin.style.background = COLORS[f.status] || COLORS.open;
      if (!p.exact) pin.style.opacity = ".6";
      if (f.status === "done") pin.style.opacity = ".45";
      pin.addEventListener("click", (e) => {
        e.stopPropagation();
        showThread(f);
      });
      if (params.get("feedback") === String(f.number)) pin.classList.add("flash");
      layer.appendChild(pin);
    }
  }
  addEventListener("resize", () => render());
  setInterval(() => !picking && !openPop && render(), 2000);

  function place(pop, x, y) {
    const w = 340;
    const left = Math.min(Math.max(8 + scrollX, x + 16), scrollX + innerWidth - w - 16);
    pop.style.left = `${left}px`;
    pop.style.top = `${y + 12}px`;
    layer.appendChild(pop);
    openPop = pop;
    // Flip above the pin when it would run under the bottom of the screen
    // (and the feedback bar); scroll it into view if neither side fits.
    const h = pop.offsetHeight;
    const bottomLimit = scrollY + innerHeight - 72;
    if (y + 12 + h > bottomLimit) {
      const above = y - h - 16;
      if (above >= scrollY + 8) pop.style.top = `${above}px`;
      else scrollTo({ top: y + 12 + h - innerHeight + 80, behavior: "smooth" });
    }
  }
  function closePop() {
    openPop?._marker?.remove();
    openPop?.remove();
    openPop = null;
  }

  function showThread(f) {
    if (picking) stopPicking();
    closePop();
    const p = pinPosition(f);
    const pop = el(`<div class="pop">
      <h4><span>#${f.number} · ${esc(f.createdBy)} · ${when(f.createdAt)}</span><span class="status" style="background:${COLORS[f.status]}">${STATUS[f.status]}</span></h4>
      <div class="title">${esc(f.title)}</div>
      <div class="muted">${esc(f.viewport)}${f.assignee ? ` · assigned to ${esc(f.assignee)}` : ""}${p.exact ? "" : " · element not found, shown where it was"}</div>
      ${f.screenshot ? `<a class="shot" href="${esc(f.screenshot)}" target="_blank" rel="noopener"><img src="${esc(f.screenshot)}?w=640" alt="Screenshot"></a>` : ""}
      <div class="comments">${(f.comments || []).map((c) => `<div class="c"><span class="muted"><b>${esc(c.by)}</b> · ${when(c.at)}</span><br>${esc(c.text)}</div>`).join("")}</div>
      <textarea class="reply" placeholder="Reply… (⌘↵ to send)" style="min-height:56px;margin-top:6px"></textarea>
      <div class="row">
        <select class="st">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === f.status ? "selected" : ""}>${v}</option>`).join("")}</select>
        <select class="as"><option value="">Unassigned</option>${PEOPLE.map((x) => `<option ${x === f.assignee ? "selected" : ""}>${x}</option>`).join("")}</select>
        <span class="grow"></span>
        <button class="btn ghost close">Close</button>
        <button class="btn send">Reply</button>
      </div>
      <div class="row"><a href="/ops#Feedback" target="_blank" rel="noopener" class="muted">Open in Ops ↗</a></div>
    </div>`);
    pop.addEventListener("click", (e) => e.stopPropagation());
    const save = async (fields) => {
      Object.assign(f, await api("save", { _id: f._id, _type: "opsFeedback", ...fields }));
      await load();
      showThread(items.find((x) => x._id === f._id) || f);
    };
    pop.querySelector(".st").addEventListener("change", (e) => save({ status: e.target.value }));
    pop.querySelector(".as").addEventListener("change", (e) => save({ assignee: e.target.value }));
    pop.querySelector(".close").addEventListener("click", closePop);
    const send = async () => {
      const text = pop.querySelector(".reply").value.trim();
      if (!text) return;
      pop.querySelector(".send").setAttribute("disabled", "");
      await api("comment", { _id: f._id, text });
      await load();
      showThread(items.find((x) => x._id === f._id) || f);
    };
    pop.querySelector(".send").addEventListener("click", send);
    pop.querySelector(".reply").addEventListener("keydown", (e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && send());
    place(pop, p.x, p.y);
  }

  // ---- Adding a pin -------------------------------------------------------------
  let picking = false;
  let hl = null;
  let hint = null;

  function startPicking() {
    closePop();
    picking = true;
    $(".add").classList.add("on");
    $(".add").textContent = "Cancel";
    hl = el('<div class="hl"></div>');
    layer.appendChild(hl);
    hint = el('<div class="hint">Click the element your comment is about · Esc to cancel</div>');
    root.appendChild(hint);
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onPick, true);
    document.documentElement.style.cursor = "crosshair";
  }
  function stopPicking() {
    picking = false;
    $(".add").classList.remove("on");
    $(".add").textContent = "+ Add";
    hl?.remove();
    hint?.remove();
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onPick, true);
    document.documentElement.style.cursor = "";
  }
  function onMove(e) {
    if (e.target === host) return;
    const r = e.target.getBoundingClientRect();
    Object.assign(hl.style, { left: `${r.left + scrollX}px`, top: `${r.top + scrollY}px`, width: `${r.width}px`, height: `${r.height}px` });
  }
  function onPick(e) {
    if (e.target === host) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.target;
    const r = target.getBoundingClientRect();
    stopPicking();
    compose({
      target,
      selector: cssPath(target),
      offsetX: r.width ? (e.clientX - r.left) / r.width : 0,
      offsetY: r.height ? (e.clientY - r.top) / r.height : 0,
      pageX: e.pageX,
      pageY: e.pageY,
      clientX: e.clientX,
      clientY: e.clientY,
      elementText: (target.innerText || target.getAttribute("alt") || target.getAttribute("aria-label") || "").trim().slice(0, 200),
    });
  }

  function compose(spot) {
    const pop = el(`<div class="pop">
      <h4><span>New feedback</span><span class="muted">${esc(location.pathname)}</span></h4>
      <textarea class="text" placeholder="What should change here?"></textarea>
      <div class="row">
        <select class="as"><option value="">Assign to…</option>${PEOPLE.map((x) => `<option>${x}</option>`).join("")}</select>
        <label class="chk"><input type="checkbox" class="shotchk" checked> Screenshot</label>
        <span class="grow"></span>
        <button class="btn ghost cancel">Cancel</button>
        <button class="btn save">Save</button>
      </div>
      <div class="muted err"></div>
    </div>`);
    pop.addEventListener("click", (e) => e.stopPropagation());
    const marker = el('<div class="pin" style="background:#ffd43b;color:#212529"><span>+</span></div>');
    marker.style.left = `${spot.pageX}px`;
    marker.style.top = `${spot.pageY}px`;
    layer.appendChild(marker);
    pop._marker = marker;
    const cancel = () => {
      marker.remove();
      closePop();
    };
    pop.querySelector(".cancel").addEventListener("click", cancel);
    pop.querySelector(".save").addEventListener("click", async () => {
      const title = pop.querySelector(".text").value.trim();
      if (!title) return pop.querySelector(".text").focus();
      const btn = pop.querySelector(".save");
      btn.setAttribute("disabled", "");
      btn.textContent = "Saving…";
      let screenshot;
      if (pop.querySelector(".shotchk").checked) {
        btn.textContent = "Screenshot…";
        screenshot = await capture(spot).catch((err) => {
          console.warn("[ops-feedback] screenshot failed", err);
          return undefined;
        });
      }
      try {
        btn.textContent = "Saving…";
        const { target, clientX, clientY, ...fields } = spot;
        await api("feedback", {
          ...fields,
          title,
          assignee: pop.querySelector(".as").value || undefined,
          host: location.host,
          path: location.pathname,
          viewport: `${innerWidth}×${innerHeight}`,
          screenshot,
        });
        marker.remove();
        closePop();
        await load();
      } catch (err) {
        pop.querySelector(".err").textContent = err.message;
        btn.removeAttribute("disabled");
        btn.textContent = "Save";
      }
    });
    place(pop, spot.pageX, spot.pageY);
    setTimeout(() => pop.querySelector(".text").focus(), 0);
  }

  // The visible viewport, with the clicked spot circled. html2canvas-pro (a
  // fork of html2canvas that understands the oklab/oklch colours Tailwind 4
  // emits -- the original throws on them) is only fetched the first time
  // someone saves with "Screenshot" ticked.
  let h2c;
  async function capture(spot) {
    h2c ??= new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/html2canvas-pro@2.5.2/dist/html2canvas-pro.min.js";
      // The UMD build exposes a module namespace: the function is its default.
      s.onload = () => resolve(window.html2canvas?.default || window.html2canvas);
      s.onerror = () => reject(new Error("Could not load html2canvas"));
      document.head.appendChild(s);
    });
    const html2canvas = await h2c;
    const canvas = await html2canvas(document.documentElement, {
      x: scrollX,
      y: scrollY,
      width: innerWidth,
      height: innerHeight,
      windowWidth: document.documentElement.clientWidth,
      scale: Math.min(devicePixelRatio || 1, 1.5),
      useCORS: true,
      logging: false,
      ignoreElements: (node) => node === host,
    });
    const ctx = canvas.getContext("2d");
    const k = canvas.width / innerWidth;
    ctx.strokeStyle = "#e8590c";
    ctx.lineWidth = 4 * k;
    ctx.beginPath();
    ctx.arc(spot.clientX * k, spot.clientY * k, 22 * k, 0, Math.PI * 2);
    ctx.stroke();
    const { url } = await api("screenshot", { dataUrl: canvas.toDataURL("image/jpeg", 0.72) });
    return url;
  }

  // ---- Wiring ---------------------------------------------------------------------
  $(".add").addEventListener("click", () => (picking ? stopPicking() : startPicking()));
  $(".toggle").addEventListener("click", () => {
    showPins = !showPins;
    $(".toggle").textContent = showPins ? "Hide pins" : "Show pins";
    if (!showPins) closePop();
    render();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (picking) stopPicking();
    else closePop();
  });
  document.addEventListener("click", (e) => {
    if (openPop && !picking && e.target !== host) closePop();
  });
  if (document.readyState === "complete") load();
  else addEventListener("load", load);
})();
