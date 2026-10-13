/* =========================================================
   社會處方・B 共同擬定處方：互動邏輯
   ========================================================= */
(function () {
  "use strict";

  const { CATS, NEEDS, INTERESTS, BARRIERS, SOCIAL, SETTING, RESOURCES, CASES } = window.SP;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const byId = Object.fromEntries(RESOURCES.map((r) => [r.id, r]));
  const MAX_PICKS = 3;
  const STORE = "spB.v2";

  const ACC = {
    accompany: "Link worker 陪同第一次",
    call: "前一天電話提醒",
    contact: "請資源端主動聯繫",
    self: "家長自行前往"
  };
  const FOLLOW = { 2: "2 週後", 4: "4 週後", 6: "6 週後" };
  const READY = {
    1: "<b>先聽聽看就好。</b>建議從到宅、一對一或低門檻的處方開始。",
    2: "<b>有點想，但還不確定。</b>優先低門檻、可以陪同的選項。",
    3: "<b>願意試一次看看。</b>可以安排一個小小的第一步。",
    4: "<b>蠻想改變的。</b>可以嘗試團體或需要多一點準備的處方。",
    5: "<b>已經準備好了！</b>可以同時規劃兩到三項處方。"
  };

  /* ---------------- State ---------------- */
  const blank = () => ({
    caseId: null, name: "", meta: "", child: "", from: "", note: "",
    needs: [], interests: [], barriers: [], social: "any", setting: "any", ready: 3, matters: "",
    picks: [], plans: {}, follow: 4, step: 0, rxId: null, focus: null
  });
  let S = blank();

  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) {} };
  const load = () => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) S = Object.assign(blank(), JSON.parse(raw));
    } catch (e) {}
  };

  /* ---------------- 轉介連結（第一組 → 我們） ---------------- */
  const enc = (o) => {
    const bytes = new TextEncoder().encode(JSON.stringify(o));
    let bin = ""; bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const dec = (s) => {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  };
  const refFields = ["name", "meta", "child", "from", "note", "needs", "interests", "barriers", "social", "setting", "ready", "matters"];
  function refLink() {
    const o = {}; refFields.forEach((k) => (o[k] = S[k]));
    return location.origin + location.pathname + "#ref=" + enc(o);
  }
  function importRef() {
    const m = location.hash.match(/^#ref=([\w-]+)/);
    if (!m) return false;
    try {
      const o = dec(m[1]);
      S = blank();
      refFields.forEach((k) => { if (o[k] !== undefined) S[k] = o[k]; });
      const valid = (arr, dict) => (Array.isArray(arr) ? arr.filter((x) => dict[x]) : []);
      S.needs = valid(S.needs, NEEDS); S.interests = valid(S.interests, INTERESTS); S.barriers = valid(S.barriers, BARRIERS);
      if (!SOCIAL[S.social]) S.social = "any";
      if (!SETTING[S.setting]) S.setting = "any";
      S.ready = Math.min(5, Math.max(1, +S.ready || 3));
      S.caseId = "ref"; S.step = 1;
      history.replaceState(null, "", location.pathname + "#studio");
      setTimeout(() => toast(`已收到第一組的轉介：<b>${esc(S.name || "新個案")}</b>`), 900);
      return true;
    } catch (e) { return false; }
  }

  /* ---------------- 媒合計分 ---------------- */
  function score(r) {
    let raw = 0; const pos = []; const neg = [];
    const nHit = r.needs.filter((n) => S.needs.includes(n));
    const iHit = r.interests.filter((n) => S.interests.includes(n));
    raw += nHit.length * 3;
    raw += iHit.length * 2;
    if (nHit.length) pos.push("回應需求：" + nHit.map((n) => NEEDS[n]).join("、"));
    if (iHit.length) pos.push("符合興趣：" + iHit.map((n) => INTERESTS[n]).join("、"));

    if (S.social !== "any") {
      const ok = r.social === S.social || (S.social === "solo" && r.social === "1on1");
      if (ok) { raw += 1.5; pos.push("形式符合偏好（" + SOCIAL[S.social] + "）"); }
      else if (S.social === "solo" && r.social === "large") { raw -= 1.5; neg.push("是大團體活動，可能不是他現在想要的"); }
    }
    if (S.setting !== "any" && r.setting !== "any") {
      if (r.setting === S.setting) { raw += 1; pos.push("在" + SETTING[r.setting] + "進行"); }
      else raw -= .5;
    }
    const b = S.barriers;
    if (b.includes("time")) {
      if (r.time.some((t) => t !== "weekday")) { raw += 1; pos.push("有晚間、週末或彈性時段"); }
      else { raw -= 3; neg.push("只在平日白天，時間可能卡住"); }
    }
    if (b.includes("money")) {
      if (r.cost === 0) { raw += 1; pos.push("免費"); } else { raw -= 1.5; neg.push("需少量費用，可同時申請補助"); }
    }
    if (b.includes("little") || b.includes("transport")) {
      const w = b.includes("transport") ? 2 : 1.5;
      if (r.reach === "home") { raw += 1.5; pos.push("到宅或線上，不必帶孩子出門"); }
      else if (r.reach === "near") { raw += .5; pos.push("步行可達"); }
      else { raw -= w; neg.push("距離較遠，需要交通安排"); }
    }
    if (b.includes("anxiety")) {
      if (r.social === "1on1") { raw += 1.5; pos.push("一對一，壓力較小"); }
      else if (r.social === "small") raw += .5;
      else { raw -= 2; neg.push("人數多，建議陪同第一次"); }
    }
    if (b.includes("care")) {
      if (r.id === "respite") { raw += 2; pos.push("讓主要照顧者有喘息時間"); }
      else if (r.time.includes("flex") || r.reach === "home") { raw += 1; pos.push("時間彈性，可配合照顧安排"); }
    }
    if (b.includes("language")) {
      if (r.id === "mother" || r.id === "newfam") { raw += 2.5; pos.push("有母語或通譯支持"); }
      else if (["read", "art", "nature", "move"].includes(r.cat) && r.social !== "1on1") raw += .3;
      if (r.entry === 3) { raw -= 1; neg.push("需填寫較多文件，建議通譯陪同"); }
    }
    if (S.ready <= 2) {
      if (r.entry === 1) { raw += 1; pos.push("門檻低，適合第一步"); }
      if (r.entry === 3) { raw -= 2; neg.push("需要較多準備，可以晚一點再安排"); }
    } else if (S.ready >= 4 && r.entry >= 2) raw += .5;

    const denom = 3 * Math.max(2, Math.min(S.needs.length, 4)) + 2 * Math.max(1, Math.min(S.interests.length, 3)) + 3;
    const pct = nHit.length || iHit.length ? Math.max(0, Math.min(1, raw / denom)) : 0;
    return { r, pct, pos, neg, tier: pct >= .6 ? "hi" : pct >= .3 ? "mid" : "lo" };
  }
  const scoreAll = () => RESOURCES.map(score).sort((a, b) => b.pct - a.pct || a.r.no.localeCompare(b.r.no));

  /* ---------------- UI helpers ---------------- */
  let toastT;
  function toast(html) {
    const t = $("#toast"); t.innerHTML = html; t.classList.add("is-on");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("is-on"), 2600);
  }
  const today = () => new Date();
  const fmt = (d) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  /* ---------------- Marquee ---------------- */
  function renderMarquee() {
    const items = RESOURCES.map((r) => `<span>${esc(r.name)}</span>`).join("");
    $("#marquee").innerHTML = items + items;
  }

  /* ---------------- Studio: stepper ---------------- */
  const reachable = () => (S.caseId ? (S.picks.length ? 4 : 2) : 0);
  function renderStepper() {
    const reach = reachable();
    $$("#stepper button").forEach((b) => {
      const i = +b.dataset.go;
      b.setAttribute("aria-selected", String(i === S.step));
      b.classList.toggle("is-done", i < S.step);
      b.disabled = i > reach;
    });
    $("#stepper").style.setProperty("--step", S.step);
  }
  function goTo(n, scroll = true) {
    if (n > 0 && !S.caseId) { toast("先選一位轉介來的家庭"); n = 0; }
    if (n >= 3 && !S.picks.length) { toast("先放 <b>至少一項</b> 處方到候選"); n = 2; }
    if (n === 4) {
      const missing = S.picks.filter((id) => !(S.plans[id] && S.plans[id].agree));
      if (missing.length) {
        toast("請先和家長確認：<b>每一項都是他自己選的</b>");
        n = 3;
        $$(".pcard").forEach((c) => { if (missing.includes(c.dataset.id)) c.animate([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }], { duration: 360 }); });
        if (S.step === 3) return;
      }
    }
    S.step = n; save();
    $$(".panel").forEach((p) => (p.hidden = +p.dataset.panel !== n));
    renderStepper();
    if (n === 1) renderTalk();
    if (n === 2) renderMatch();
    if (n === 3) renderPlan();
    if (n === 4) renderRx();
    if (scroll) {
      const top = $("#stepper").getBoundingClientRect().top + scrollY - 96;
      if (Math.abs(scrollY - top) > 40) window.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
    }
  }

  /* ---------------- Step 1: cases ---------------- */
  function renderCases() {
    const html = CASES.map((c) => `
      <button class="case${S.caseId === c.id ? " is-on" : ""}" data-case="${c.id}" type="button">
        <span class="case__from">${esc(c.from)}</span>
        <span class="case__go" aria-hidden="true">→</span>
        <span class="case__name">${esc(c.name)}</span>
        <span class="case__meta">${esc(c.meta)}・${esc(c.child)}</span>
        <span class="case__note">「${esc(c.note)}」</span>
        <span class="case__tags">${c.needs.map((n) => `<span>${NEEDS[n]}</span>`).join("")}</span>
      </button>`).join("") + `
      <button class="case case--new${S.caseId === "custom" || S.caseId === "ref" ? " is-on" : ""}" data-case="custom" type="button">
        <span class="case__plus" aria-hidden="true">＋</span>
        <span class="case__name">新增轉介</span>
        <span class="case__note">第一組辨識到新的需求？在這裡建立一份空白轉介，對話中逐一填入，最後可以產生<b>轉介連結</b>分享。</span>
      </button>`;
    $("#cases").innerHTML = html;
    $$("#cases .case").forEach((el) => el.addEventListener("click", () => pickCase(el.dataset.case)));
  }
  function pickCase(id) {
    const keep = S.picks.filter((p) => byId[p]);
    if (id === "custom") {
      S = Object.assign(blank(), { caseId: "custom", name: "", from: "第一組", picks: keep });
    } else {
      const c = CASES.find((x) => x.id === id);
      S = Object.assign(blank(), JSON.parse(JSON.stringify(c)), { caseId: c.id, picks: keep });
      delete S.id;
    }
    save(); renderCases(); goTo(1);
  }

  /* ---------------- Step 2: talk ---------------- */
  function chip(group, key, label, on, extra = "") {
    return `<button type="button" class="chip" data-group="${group}" data-key="${key}" aria-pressed="${on}">${esc(label)}${extra}</button>`;
  }
  function renderTalk() {
    const preset = CASES.find((c) => c.id === S.caseId);
    $('[data-group="needs"].chips').innerHTML = Object.entries(NEEDS).map(([k, v]) =>
      chip("needs", k, v, S.needs.includes(k), preset && preset.needs.includes(k) ? '<span class="chip__from">A</span>' : "")).join("");
    $('[data-group="interests"].chips').innerHTML = Object.entries(INTERESTS).map(([k, v]) => chip("interests", k, v, S.interests.includes(k))).join("");
    $('[data-group="barriers"].chips').innerHTML = Object.entries(BARRIERS).map(([k, v]) => chip("barriers", k, v.label, S.barriers.includes(k))).join("");
    $('[data-group="social"].seg').innerHTML = Object.entries(SOCIAL).map(([k, v]) => `<button type="button" role="radio" data-key="${k}" aria-checked="${S.social === k}">${v}</button>`).join("");
    $('[data-group="setting"].seg').innerHTML = Object.entries(SETTING).map(([k, v]) => `<button type="button" role="radio" data-key="${k}" aria-checked="${S.setting === k}">${v}</button>`).join("");
    const rg = $("#ready"); rg.value = S.ready; updateReady();
    $("#matters").value = S.matters;
    renderWho(); renderPulse();
  }
  function renderWho() {
    $("#whoCard").innerHTML = `
      <p class="who__k">轉介單 ${S.caseId === "custom" || S.caseId === "ref" ? "・可編輯" : ""}</p>
      ${S.note ? `<p class="who__meta" style="margin:6px 0 4px">「${esc(S.note)}」</p>` : ""}
      <label class="field"><span>家長／主要照顧者</span><input id="wName" value="${esc(S.name)}" placeholder="例如：王媽媽" maxlength="20"></label>
      <label class="field"><span>孩子</span><input id="wChild" value="${esc(S.child)}" placeholder="例如：兒子 2 歲" maxlength="24"></label>
      <label class="field"><span>轉介自（第一組）</span><input id="wFrom" value="${esc(S.from)}" placeholder="例如：幼兒園老師" maxlength="24"></label>
      <button class="btn btn--sm btn--ghost-light who__link" type="button" id="refBtn">複製轉介連結</button>`;
    $("#wName").addEventListener("input", (e) => { S.name = e.target.value; save(); });
    $("#wChild").addEventListener("input", (e) => { S.child = e.target.value; save(); });
    $("#wFrom").addEventListener("input", (e) => { S.from = e.target.value; save(); });
    $("#refBtn").addEventListener("click", () => copy(refLink(), "已複製轉介連結，第一組可以直接把它丟過來"));
  }
  function renderPulse() {
    const all = scoreAll();
    const fit = all.filter((x) => x.pct >= .45).length;
    animateNum($("#pulseNum"), fit);
    const byNo = [...all].sort((a, b) => a.r.no.localeCompare(b.r.no));
    $("#pulseBars").innerHTML = byNo.map((x) => `<i class="is-${x.tier}" style="height:${Math.max(6, x.pct * 100)}%"></i>`).join("");
    let tip;
    if (!S.needs.length) tip = "先從 <b>需求</b> 開始點選，地圖會慢慢聚焦。";
    else if (!S.interests.length) tip = "再加入他喜歡的事，興趣是持續參與最好的動力。";
    else if (!S.barriers.length) tip = "別忘了問：<b>什麼可能讓你去不了？</b>";
    else if (fit > 8) tip = "選項還很多，可以再聊聊偏好與準備度。";
    else if (fit === 0) tip = "目前沒有很適合的，試著放寬一些條件。";
    else tip = "差不多了！下一步看看社區地圖。";
    $("#pulseTip").innerHTML = tip;
  }
  function animateNum(el, to) {
    const from = +el.textContent || 0;
    if (from === to || reduceMotion) { el.textContent = to; return; }
    const t0 = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / 500);
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  function updateReady() {
    const rg = $("#ready");
    rg.style.setProperty("--v", ((rg.value - 1) / 4) * 100 + "%");
    rg.setAttribute("aria-valuetext", rg.value + " 分");
    $("#readyText").innerHTML = READY[rg.value];
  }
  function bindTalk() {
    const panel = $('[data-panel="1"]');
    panel.addEventListener("click", (e) => {
      const c = e.target.closest(".chip");
      if (c) {
        const arr = S[c.dataset.group]; const k = c.dataset.key;
        const i = arr.indexOf(k);
        i >= 0 ? arr.splice(i, 1) : arr.push(k);
        c.setAttribute("aria-pressed", String(i < 0));
        save(); renderPulse(); return;
      }
      const s = e.target.closest(".seg button");
      if (s) {
        const g = s.parentElement.dataset.group;
        S[g] = s.dataset.key;
        $$("button", s.parentElement).forEach((b) => b.setAttribute("aria-checked", String(b === s)));
        save(); renderPulse();
      }
    });
    $("#ready").addEventListener("input", (e) => { S.ready = +e.target.value; updateReady(); save(); renderPulse(); });
    $("#matters").addEventListener("input", (e) => { S.matters = e.target.value; save(); });
  }

  /* ---------------- Step 3: match ---------------- */
  let rankMode = "top";
  const NS = "http://www.w3.org/2000/svg";
  const catOrder = Object.keys(CATS);
  const ordered = [...RESOURCES].sort((a, b) => catOrder.indexOf(a.cat) - catOrder.indexOf(b.cat) || a.no.localeCompare(b.no));
  const angleOf = {};
  ordered.forEach((r, i) => (angleOf[r.id] = (i / ordered.length) * Math.PI * 2 - Math.PI / 2 + Math.PI / ordered.length));
  const radiusFor = (pct) => 120 + (1 - pct) * 320;

  function buildMap() {
    const svg = $("#map");
    let html = "";
    [radiusFor(.6), radiusFor(.3), 450].forEach((r) => {
      html += `<circle class="map__ring" r="${r}"/>`;
    });
    // 類別扇區
    let idx = 0;
    catOrder.forEach((cat) => {
      const n = ordered.filter((r) => r.cat === cat).length;
      const a0 = (idx / ordered.length) * Math.PI * 2 - Math.PI / 2;
      const am = ((idx + n / 2) / ordered.length) * Math.PI * 2 - Math.PI / 2;
      html += `<line class="map__sector" x1="${Math.cos(a0) * 100}" y1="${Math.sin(a0) * 100}" x2="${Math.cos(a0) * 470}" y2="${Math.sin(a0) * 470}"/>`;
      html += `<text class="map__cat" x="${Math.cos(am) * 488}" y="${Math.sin(am) * 488 + 8}">${CATS[cat].label}</text>`;
      idx += n;
    });
    html += `<g id="links"></g>`;
    html += `<g class="map__core"><circle r="72"/><circle r="58" stroke-dasharray="4 6"/><text y="10" id="coreName">家庭</text></g>`;
    html += ordered.map((r) => `
      <g class="node" data-id="${r.id}" tabindex="0" role="button" aria-label="${esc(r.name)}">
        <circle class="node__dot" r="16"/>
        <text class="node__no" y="7">${r.no}</text>
        <text class="node__name">${esc(r.name.length > 10 ? r.name.slice(0, 10) + "…" : r.name)}</text>
      </g>`).join("");
    svg.innerHTML = html;
    svg.addEventListener("click", (e) => { const g = e.target.closest(".node"); if (g) focusItem(g.dataset.id, true); });
    svg.addEventListener("keydown", (e) => {
      const g = e.target.closest(".node");
      if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); focusItem(g.dataset.id, true); }
    });
  }
  function renderMatch() {
    const all = scoreAll();
    const m = Object.fromEntries(all.map((x) => [x.r.id, x]));
    $("#coreName").textContent = (S.name || "家庭").slice(0, 3);
    const top5 = all.filter((x) => x.pct > 0).slice(0, 5).map((x) => x.r.id);
    ordered.forEach((r) => {
      const x = m[r.id]; const g = $(`.node[data-id="${r.id}"]`, $("#map"));
      const rad = radiusFor(x.pct); const a = angleOf[r.id];
      g.style.transform = `translate(${(Math.cos(a) * rad).toFixed(1)}px, ${(Math.sin(a) * rad).toFixed(1)}px)`;
      const dot = $(".node__dot", g);
      dot.setAttribute("r", (16 + x.pct * 20).toFixed(1));
      dot.style.fill = x.tier === "hi" ? "var(--red)" : x.tier === "mid" ? "#8c4a3e" : "var(--night-3)";
      // 名稱沿放射方向往外放，避免互相重疊
      const nm = $(".node__name", g); const off = 16 + x.pct * 20 + 12; const c = Math.cos(a), si = Math.sin(a);
      nm.setAttribute("x", (c * off).toFixed(1));
      nm.setAttribute("y", (si * off + 7 + (Math.abs(c) < .35 ? Math.sign(si) * 14 : 0)).toFixed(1));
      nm.setAttribute("text-anchor", c > .35 ? "start" : c < -.35 ? "end" : "middle");
      g.classList.toggle("is-top", top5.includes(r.id));
      g.classList.toggle("is-picked", S.picks.includes(r.id));
      g.classList.toggle("is-focus", S.focus === r.id);
      g.setAttribute("aria-label", `${r.name}，適合度 ${Math.round(x.pct * 100)}%`);
    });
    // 連線到已選處方
    $("#links").innerHTML = S.picks.map((id) => {
      const x = m[id]; if (!x) return "";
      const rad = radiusFor(x.pct); const a = angleOf[id];
      return `<line class="map__link" x1="${Math.cos(a) * 72}" y1="${Math.sin(a) * 72}" x2="${Math.cos(a) * (rad - 16 - x.pct * 20)}" y2="${Math.sin(a) * (rad - 16 - x.pct * 20)}"/>`;
    }).join("");

    let list = all;
    if (rankMode === "top") {
      list = all.filter((x) => x.pct >= .3).slice(0, 8);
      if (list.length < 3) list = all.slice(0, 5);
    }
    $("#rankList").innerHTML = list.map((x) => {
      const r = x.r; const picked = S.picks.includes(r.id);
      return `<li class="ri${picked ? " is-picked" : ""}${S.focus === r.id ? " is-focus" : ""}" data-id="${r.id}">
        <div class="ri__row">
          <span class="ri__no">${r.no}</span>
          <button class="ri__toggle" type="button" aria-expanded="${S.focus === r.id}">
            <span class="ri__name">${esc(r.name)}</span>
            <span class="ri__cat">${CATS[r.cat].label}・${esc(r.provider)}<span class="ri__pct">${Math.round(x.pct * 100)}%</span></span>
            <span class="ri__bar"><i style="transform:scaleX(${x.pct.toFixed(2)})"></i></span>
          </button>
          <button class="ri__add" type="button" aria-pressed="${picked}">${picked ? "✓ 已選" : "＋ 候選"}</button>
        </div>
        <div class="ri__why">
          <p>${esc(r.desc)}</p>
          <ul>${x.pos.map((p) => `<li>${esc(p)}</li>`).join("")}${x.neg.map((p) => `<li class="neg">${esc(p)}</li>`).join("")}${!x.pos.length && !x.neg.length ? "<li class='neg'>和目前的對話內容沒有明顯連結</li>" : ""}</ul>
        </div>
      </li>`;
    }).join("");
    renderTray();
    renderStepper();
  }
  function focusItem(id, fromMap) {
    S.focus = S.focus === id && !fromMap ? null : id;
    if (fromMap && rankMode === "top" && !$(`.ri[data-id="${id}"]`)) { rankMode = "all"; syncRankTabs(); }
    renderMatch();
    if (fromMap) {
      const li = $(`.ri[data-id="${id}"]`);
      if (li && matchMedia("(min-width: 961px)").matches) li.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
    }
  }
  function togglePick(id) {
    const i = S.picks.indexOf(id);
    if (i >= 0) { S.picks.splice(i, 1); }
    else {
      if (S.picks.length >= MAX_PICKS) { toast(`一次最多 <b>${MAX_PICKS} 項</b>，太多處方反而會變成壓力`); return false; }
      S.picks.push(id);
      if (!S.plans[id]) S.plans[id] = { first: byId[id].first, acc: S.barriers.includes("anxiety") || S.barriers.includes("language") ? "accompany" : "call", agree: false };
    }
    save(); return true;
  }
  function renderTray() {
    const slots = S.picks.map((id) => `<span class="tray__slot">${byId[id].no}・${esc(byId[id].name)}<button type="button" data-rm="${id}" aria-label="移除 ${esc(byId[id].name)}">×</button></span>`);
    for (let i = S.picks.length; i < MAX_PICKS; i++) slots.push('<span class="tray__empty" aria-hidden="true"></span>');
    $("#tray").innerHTML = `<span class="tray__label">候選處方 ${S.picks.length}/${MAX_PICKS}</span>` + slots.join("");
    $("#toDecide").disabled = !S.picks.length;
  }
  function syncRankTabs() {
    $$(".rank__tabs button").forEach((b) => { const on = b.dataset.rank === rankMode; b.classList.toggle("is-on", on); b.setAttribute("aria-selected", String(on)); });
  }
  function bindMatch() {
    $("#rankList").addEventListener("click", (e) => {
      const li = e.target.closest(".ri"); if (!li) return;
      if (e.target.closest(".ri__add")) { togglePick(li.dataset.id); renderMatch(); syncLib(); }
      else if (e.target.closest(".ri__toggle")) focusItem(li.dataset.id, false);
    });
    $("#tray").addEventListener("click", (e) => {
      const b = e.target.closest("[data-rm]"); if (!b) return;
      togglePick(b.dataset.rm); renderMatch(); syncLib();
    });
    $$(".rank__tabs button").forEach((b) => b.addEventListener("click", () => { rankMode = b.dataset.rank; syncRankTabs(); renderMatch(); }));
  }

  /* ---------------- Step 4: plan ---------------- */
  function renderPlan() {
    if (!S.picks.length) { $("#plan").innerHTML = '<p class="plan__empty">還沒有候選處方，回上一步挑選。</p>'; return; }
    $("#plan").innerHTML = S.picks.map((id) => {
      const r = byId[id]; const p = S.plans[id] || (S.plans[id] = { first: r.first, acc: "call", agree: false });
      const x = score(r);
      const tips = [...x.neg.map((n) => n), ...S.barriers.map((b) => BARRIERS[b].tip)];
      return `<article class="pcard" data-id="${id}">
        <div class="pcard__top"><span class="pcard__no">${r.no}</span><span class="pcard__cat">${CATS[r.cat].label}・適合度 ${Math.round(x.pct * 100)}%</span></div>
        <h4>${esc(r.name)}</h4>
        <p class="pcard__prov">${esc(r.provider)}</p>
        <label class="pcard__lab" for="first-${id}">第一小步（可以一起改）</label>
        <textarea id="first-${id}" rows="2" data-f="first">${esc(p.first)}</textarea>
        <span class="pcard__lab">陪伴方式</span>
        <div class="seg" role="radiogroup" aria-label="陪伴方式">${Object.entries(ACC).map(([k, v]) => `<button type="button" role="radio" data-acc="${k}" aria-checked="${p.acc === k}">${v}</button>`).join("")}</div>
        ${tips.length ? `<span class="pcard__lab">阻礙怎麼解</span><ul class="pcard__tips">${[...new Set(tips)].slice(0, 4).map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
        <label class="agree"><input type="checkbox" data-f="agree" ${p.agree ? "checked" : ""}> 家長確認：這是我自己選的</label>
      </article>`;
    }).join("");
    $("#followSeg").innerHTML = Object.entries(FOLLOW).map(([k, v]) => `<button type="button" role="radio" data-k="${k}" aria-checked="${+S.follow === +k}">${v}</button>`).join("");
  }
  function bindPlan() {
    $("#plan").addEventListener("input", (e) => {
      const card = e.target.closest(".pcard"); if (!card) return;
      const p = S.plans[card.dataset.id];
      if (e.target.dataset.f === "first") p.first = e.target.value;
      if (e.target.dataset.f === "agree") p.agree = e.target.checked;
      save();
    });
    $("#plan").addEventListener("click", (e) => {
      const b = e.target.closest("[data-acc]"); if (!b) return;
      const card = b.closest(".pcard");
      S.plans[card.dataset.id].acc = b.dataset.acc;
      $$("[data-acc]", card).forEach((x) => x.setAttribute("aria-checked", String(x === b)));
      save();
    });
    $("#followSeg").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      S.follow = +b.dataset.k;
      $$("#followSeg button").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
      save();
    });
  }

  /* ---------------- Step 5: Rx ---------------- */
  function rxText() {
    const d = today(); const f = fmt(addDays(d, S.follow * 7));
    const who = `${S.name || "（未填）"}${S.meta ? "（" + S.meta + "）" : ""}${S.child ? "，孩子：" + S.child : ""}`;
    const lines = [
      `【社會處方轉介單】${S.rxId}｜${fmt(d)}`,
      `家庭：${who}`,
      `轉介自：${S.from || "第一組"}`,
      `需求：${S.needs.map((n) => NEEDS[n]).join("、") || "—"}`,
      `對家長重要的事：「${S.matters || "—"}」`,
      ""
    ];
    S.picks.forEach((id, i) => {
      const r = byId[id]; const p = S.plans[id];
      lines.push(`${i + 1}. 致 ${r.provider}｜${r.name}`);
      lines.push(`   第一步：${p.first}`);
      lines.push(`   陪伴方式：${ACC[p.acc]}`);
    });
    lines.push("", `追蹤：${f}（${FOLLOW[S.follow]}）請資源端回饋參與情況給 link worker。`, "— 信義社會處方社區・B 共同擬定處方");
    return lines.join("\n");
  }
  function renderRx() {
    if (!S.rxId) { S.rxId = "SP-" + fmt(today()).replace(/\./g, "") + "-" + String(Math.floor(Math.random() * 9000) + 1000); save(); }
    const d = today(); const f = addDays(d, S.follow * 7);
    $("#rx").innerHTML = `
      <header class="rx__head">
        <h4 class="rx__title">社會處方籤<small>Social Prescription — co-produced</small></h4>
        <div class="rx__id">信義社會處方社區<b>${S.rxId}</b>${fmt(d)}</div>
      </header>
      <div class="rx__who">
        <div><span>家長／照顧者</span>${esc(S.name || "—")}${S.meta ? `<br><small>${esc(S.meta)}</small>` : ""}</div>
        <div><span>孩子</span>${esc(S.child || "—")}</div>
        <div><span>轉介自</span>${esc(S.from || "第一組")}</div>
      </div>
      <div class="rx__matters"><span>對我重要的事 What matters to me</span><p>「${esc(S.matters || "（請在對話步驟寫下家長自己的話）")}」</p></div>
      <p class="rx__rx" aria-hidden="true">℞</p>
      <ol class="rx__items">${S.picks.map((id, i) => {
        const r = byId[id]; const p = S.plans[id];
        return `<li><b>${i + 1}</b><div><h5>${esc(r.name)}</h5><p class="rx__step">第一步：${esc(p.first)}</p><p>${esc(r.provider)}・${ACC[p.acc]}</p></div></li>`;
      }).join("")}</ol>
      <div class="rx__follow"><span>回診追蹤：<b>${fmt(f)}</b>（${FOLLOW[S.follow]}）</span><span>不適合可以隨時換，這是處方在調整劑量。</span></div>
      <div class="rx__foot">
        <div class="rx__sig"><em>${esc(S.name || "")}</em><span>家長簽名</span></div>
        <div class="rx__sig"><em>Link worker</em><span>虛擬 link worker</span></div>
      </div>
      <div class="rx__stamp" aria-hidden="true"><div>共同<br>擬定<small>CO-PRODUCED</small></div></div>`;
    $("#handoff").innerHTML = `<h4>轉介給資源端（C）</h4><p>下一步，就是 refer 出去。以下內容會一併附在轉介文字中。</p>` +
      S.picks.map((id) => {
        const r = byId[id]; const p = S.plans[id];
        return `<div class="ho"><span class="ho__to">致 ${esc(r.provider)}</span><b>${esc(r.name)}</b>家長在意：「${esc(S.matters || "—")}」<br>第一步：${esc(p.first)}<br>陪伴：${ACC[p.acc]}・請於 ${fmt(f)} 前回饋</div>`;
      }).join("");
  }
  async function copy(text, msg) {
    try { await navigator.clipboard.writeText(text); toast(msg); }
    catch (e) {
      const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); toast(msg); } catch (x) { toast("無法自動複製，請手動選取"); }
      ta.remove();
    }
  }
  function bindRx() {
    $("#printBtn").addEventListener("click", () => window.print());
    $("#copyBtn").addEventListener("click", () => copy(rxText(), "已複製轉介文字，可以貼給資源端了"));
    $("#resetBtn").addEventListener("click", () => {
      S = blank(); save(); renderCases(); syncLib(); goTo(0); toast("已清空，為下一位家庭擬定處方");
    });
  }

  /* ---------------- Library ---------------- */
  let libCat = "all";
  const TIME = { weekday: "平日", evening: "晚間", weekend: "週末", flex: "彈性" };
  const REACH = { near: "步行可達", home: "到宅／線上", far: "需交通" };
  const SOC = { "1on1": "一對一", small: "小團體", large: "大團體" };
  function renderLib() {
    $("#filters").innerHTML = [["all", "全部", RESOURCES.length], ...catOrder.map((c) => [c, CATS[c].label, RESOURCES.filter((r) => r.cat === c).length])]
      .map(([k, v, n]) => `<button type="button" data-cat="${k}" aria-pressed="${libCat === k}">${v}<i>${n}</i></button>`).join("");
    $("#lib").innerHTML = RESOURCES.map((r) => `
      <article class="card" data-id="${r.id}" data-cat="${r.cat}">
        <div class="card__top"><span class="card__no">${r.no}</span><span class="card__cat">${CATS[r.cat].label} ${CATS[r.cat].en}</span></div>
        <h3>${esc(r.name)}</h3>
        <p class="card__desc">${esc(r.desc)}</p>
        <ul class="card__facts"><li>${r.cost ? "低費用" : "免費"}</li><li>${SOC[r.social]}</li><li>${r.time.map((t) => TIME[t]).join("/")}</li><li>${REACH[r.reach]}</li></ul>
        <p class="card__prov">${esc(r.provider)}</p>
        <button class="card__add" type="button" aria-pressed="false">＋ 放進候選</button>
      </article>`).join("");
    syncLib();
  }
  function syncLib() {
    $$("#lib .card").forEach((c) => {
      const on = S.picks.includes(c.dataset.id); const b = $(".card__add", c);
      b.setAttribute("aria-pressed", String(on)); b.textContent = on ? "✓ 已在候選" : "＋ 放進候選";
    });
  }
  function filterLib() {
    const q = $("#libSearch").value.trim().toLowerCase();
    let shown = 0;
    $$("#lib .card").forEach((c) => {
      const r = byId[c.dataset.id];
      const hay = [r.name, r.desc, r.provider, CATS[r.cat].label, r.cost ? "低費用" : "免費", ...r.needs.map((n) => NEEDS[n]), ...r.interests.map((n) => INTERESTS[n])].join(" ").toLowerCase();
      const ok = (libCat === "all" || r.cat === libCat) && (!q || q.split(/\s+/).every((w) => hay.includes(w)));
      c.classList.toggle("is-hidden", !ok); if (ok) shown++;
    });
    $("#libEmpty").hidden = shown > 0;
  }
  function bindLib() {
    $("#filters").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      libCat = b.dataset.cat;
      $$("#filters button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      filterLib();
    });
    $("#libSearch").addEventListener("input", filterLib);
    $("#lib").addEventListener("click", (e) => {
      const b = e.target.closest(".card__add"); if (!b) return;
      const id = b.closest(".card").dataset.id;
      const was = S.picks.includes(id);
      if (togglePick(id)) {
        syncLib();
        toast(was ? "已從候選移除" : `已放進候選：<b>${esc(byId[id].name)}</b>${S.caseId ? "" : "・接著到工作台選一個家庭"}`);
        if (S.step === 2) renderMatch();
        renderStepper();
      }
    });
  }

  /* ---------------- Chrome: nav, hero, reveal, cursor ---------------- */
  function bindChrome() {
    const nav = $("#nav"); const prog = $("#progress"); const hero = $("#hero"); const studio = $("#studio");
    let ticking = false;
    const onScroll = () => {
      ticking = false;
      const y = scrollY; const h = document.documentElement.scrollHeight - innerHeight;
      prog.style.transform = `scaleX(${h > 0 ? y / h : 0})`;
      const sr = studio.getBoundingClientRect();
      const dark = sr.top <= 68 && sr.bottom >= 68;
      nav.classList.toggle("is-dark", dark);
      nav.classList.toggle("is-solid", y > 40 && !dark);
      if (hero.classList.contains("is-live")) {
        const k = Math.min(1, y / (innerHeight * .7));
        hero.style.setProperty("--p", (.62 + .38 * k).toFixed(3));
      }
    };
    addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
    addEventListener("resize", onScroll);
    onScroll();

    // 開場：兩個圓靠近
    requestAnimationFrame(() => {
      document.body.classList.add("is-loaded");
      hero.style.setProperty("--p", ".62");
      setTimeout(() => { hero.classList.add("is-live"); $$(".orb").forEach((o) => (o.style.transition = "none")); onScroll(); }, reduceMotion ? 0 : 1700);
    });

    // 章節高亮
    const links = $$(".nav__links a");
    const io = new IntersectionObserver((ents) => ents.forEach((en) => {
      if (en.isIntersecting) links.forEach((a) => a.classList.toggle("is-on", a.getAttribute("href") === "#" + en.target.id));
    }), { rootMargin: "-45% 0px -50% 0px" });
    ["where", "principles", "studio", "library", "loop"].forEach((id) => io.observe(document.getElementById(id)));

    // reveal
    const parents = new Map();
    $$(".reveal").forEach((el) => {
      const p = el.parentElement; const i = parents.get(p) || 0; parents.set(p, i + 1);
      el.style.setProperty("--d", Math.min(i, 6) * .08 + "s");
    });
    const rio = new IntersectionObserver((ents) => ents.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add("is-in"); rio.unobserve(en.target); }
    }), { rootMargin: "0px 0px -10% 0px" });
    $$(".reveal, .flow").forEach((el) => rio.observe(el));

    // 翻牌：第一次看見時自動示範
    const swap = $("#swapBtn");
    swap.addEventListener("click", () => swap.setAttribute("aria-pressed", String(swap.getAttribute("aria-pressed") !== "true")));
    const sio = new IntersectionObserver((ents) => {
      if (ents[0].isIntersecting) { setTimeout(() => swap.setAttribute("aria-pressed", "true"), 1200); sio.disconnect(); }
    }, { threshold: .7 });
    if (!reduceMotion) sio.observe(swap);

    // 游標與磁吸
    if (finePointer && !reduceMotion) {
      const cur = $("#cursor"); let x = -100, y = -100, cx = x, cy = y;
      addEventListener("pointermove", (e) => {
        x = e.clientX; y = e.clientY; cur.classList.add("is-on");
        cur.classList.toggle("is-big", !!e.target.closest("a, button, [data-magnetic], .node, input[type=range], summary, label.agree"));
      });
      document.addEventListener("pointerleave", () => cur.classList.remove("is-on"));
      const loop = () => { cx += (x - cx) * .22; cy += (y - cy) * .22; cur.style.transform = `translate(${cx}px, ${cy}px)`; requestAnimationFrame(loop); };
      loop();
      document.addEventListener("pointermove", (e) => {
        const m = e.target.closest("[data-magnetic]");
        $$("[data-magnetic].is-mag").forEach((el) => { if (el !== m) { el.classList.remove("is-mag"); el.style.transform = ""; } });
        if (!m) return;
        const r = m.getBoundingClientRect();
        m.classList.add("is-mag");
        m.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .22}px, ${(e.clientY - r.top - r.height / 2) * .3}px)`;
      });
    }
  }

  /* ---------------- Init ---------------- */
  function init() {
    const fromRef = importRef();
    if (!fromRef) load();
    S.picks = S.picks.filter((id) => byId[id]);
    renderMarquee();
    renderCases();
    buildMap();
    renderLib();
    bindTalk(); bindMatch(); bindPlan(); bindRx(); bindLib(); bindChrome();
    $$("#stepper button").forEach((b) => b.addEventListener("click", () => goTo(+b.dataset.go)));
    $$("[data-next]").forEach((b) => b.addEventListener("click", () => goTo(S.step + 1)));
    $$("[data-prev]").forEach((b) => b.addEventListener("click", () => goTo(S.step - 1)));
    goTo(Math.min(S.step, reachable()), false);
    if (fromRef) setTimeout(() => document.getElementById("studio").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" }), 400);
  }
  init();
})();
