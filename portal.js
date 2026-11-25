// 身份分流（民眾／專業人員）・Supabase 雲端・QR 報到・追蹤量表與成效
(function () {
  "use strict";
  const A = window.SPApp;
  if (!A) return;
  const { esc, toast, byId, fmt } = A;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const root = document.documentElement;
  const LS = {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch (e) {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, v);
      } catch (e) {}
    },
  };

  /* ---------------- Supabase ---------------- */
  const CFG = window.SP_CONFIG || {};
  const sb =
    CFG.supabaseUrl && CFG.supabaseKey && window.supabase
      ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey)
      : null;
  let user = null;
  let staff = false; // link worker／社工
  let resource = null; // 資源端工作人員：{name, resource_ids}
  let authReady = !sb;
  const genPin = () => {
    const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const b = crypto.getRandomValues(new Uint8Array(6));
    return [...b].map((x) => abc[x % abc.length]).join("");
  };
  const todayTPE = () =>
    new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  const isoDate = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  // 日期（YYYY-MM-DD）直接顯示；時間戳記換成臺北時間的日期
  const dot = (s) => {
    s = String(s || "");
    if (s.length > 10) s = new Date(s).toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
    return s.slice(0, 10).replace(/-/g, ".");
  };
  const publicLink = (code, pin) =>
    location.origin + location.pathname + "#rx=" + code + "." + pin;
  const MSG = {
    bad: "找不到這張處方，請確認編號與取件碼。",
    bound: "這張處方已綁定到另一個帳號。如果是你的，請用那個帳號登入。",
    login: "請先登入。",
    already: "這個活動今天已經報到過了。",
    not_in_rx: "這個活動不在這張處方裡。",
    not_staff: "報到要由活動現場的工作人員掃 QR code 後按下。",
    not_yours: "這個活動不是你負責的，無法幫忙報到。",
    not_resident: "工作人員帳號不能綁定處方。",
    resource: "資源端帳號不能填寫近況問卷。",
    invalid: "問卷還沒填完整。",
    bad_code: "開通碼不正確，請向管理者確認。",
    no_resource: "請至少選一個你負責的活動。",
    not_resource: "這個帳號不是資源端帳號。",
  };
  const errMsg = (e) =>
    /Invalid login/i.test(e?.message || "")
      ? "帳號或密碼不正確"
      : /already registered/i.test(e?.message || "")
        ? "這個 email 已經註冊過，請直接登入"
        : /Password should be/i.test(e?.message || "")
          ? "密碼至少 6 個字元"
          : "連線失敗：" + (e?.message || "請稍後再試");

  /* ---------------- 量表：ONS4 個人福祉 + UCLA 孤寂感 3 題 ---------------- */
  const ONS = [
    { k: "life", q: "整體而言，你對現在的生活有多滿意？", lo: "完全不滿意", hi: "非常滿意" },
    { k: "worth", q: "整體而言，你覺得自己生活中做的事有多值得？", lo: "完全不值得", hi: "非常值得" },
    { k: "happy", q: "昨天，你整體而言有多快樂？", lo: "完全不快樂", hi: "非常快樂" },
    { k: "anxious", q: "昨天，你整體而言有多焦慮？", lo: "完全不焦慮", hi: "非常焦慮" },
  ];
  const UCLA = [
    { k: "lack", q: "你多常覺得缺少同伴？" },
    { k: "left", q: "你多常覺得被冷落、被排除在外？" },
    { k: "isolated", q: "你多常覺得和別人隔絕？" },
  ];
  const FREQ = [
    [1, "幾乎從不"],
    [2, "有時"],
    [3, "經常"],
  ];
  const lonely = (a) => a.lack + a.left + a.isolated;
  const METRICS = [
    { label: "生活滿意", min: 0, max: 10, better: 1, v: (a) => a.life },
    { label: "覺得做的事值得", min: 0, max: 10, better: 1, v: (a) => a.worth },
    { label: "快樂", min: 0, max: 10, better: 1, v: (a) => a.happy },
    { label: "焦慮", min: 0, max: 10, better: -1, v: (a) => a.anxious },
    { label: "孤寂感", min: 3, max: 9, better: -1, v: lonely },
  ];

  function surveyHTML(id, a, carer) {
    a = a || {};
    const n11 = [...Array(11).keys()];
    return `<div class="sv" id="${id}">
      ${carer ? `<p class="sv__note">替家人填寫時，請依照<b>他的狀況</b>回答，或和他一起填。</p>` : ""}
      <fieldset class="sv__part"><legend>最近過得怎麼樣？<small>0 分最低，10 分最高</small></legend>
      ${ONS.map(
        (q) => `<div class="sv__q" data-k="${q.k}"><p>${q.q}</p>
          <div class="sv__scale" role="radiogroup" aria-label="${esc(q.q)}">${n11
            .map(
              (n) =>
                `<button type="button" role="radio" data-v="${n}" aria-checked="${a[q.k] === n}">${n}</button>`,
            )
            .join("")}</div>
          <div class="sv__ends"><span>${q.lo}</span><span>${q.hi}</span></div></div>`,
      ).join("")}
      </fieldset>
      <fieldset class="sv__part"><legend>和人的連結</legend>
      ${UCLA.map(
        (q) => `<div class="sv__q" data-k="${q.k}"><p>${q.q}</p>
          <div class="sv__scale sv__scale--3" role="radiogroup" aria-label="${esc(q.q)}">${FREQ.map(
            ([n, l]) =>
              `<button type="button" role="radio" data-v="${n}" aria-checked="${a[q.k] === n}">${l}</button>`,
          ).join("")}</div></div>`,
      ).join("")}
      </fieldset>
    </div>`;
  }
  function readSurvey(el) {
    const a = {};
    let missing = 0;
    $$(".sv__q", el).forEach((q) => {
      const on = $('button[aria-checked="true"]', q);
      if (on) a[q.dataset.k] = +on.dataset.v;
      else missing++;
    });
    return missing ? null : a;
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".sv__scale button");
    if (!b) return;
    $$("button", b.parentElement).forEach((x) =>
      x.setAttribute("aria-checked", String(x === b)),
    );
    b.closest(".sv").dispatchEvent(new CustomEvent("sv:change", { bubbles: true }));
  });

  /* ---------------- 進步圖：開處方時 vs 最近一次 ---------------- */
  function progressHTML(surveys, who) {
    const base = surveys.find((s) => s.kind === "baseline");
    const pts = [base, ...surveys.filter((s) => s.kind === "follow")].filter(Boolean);
    if (!base)
      return `<p class="pg__empty">這張處方沒有基線量表，所以還無法比較改變。${pts.length ? `目前有 ${pts.length} 次近況紀錄。` : ""}</p>`;
    if (pts.length < 2)
      return `<p class="pg__empty">已經有開處方那天的紀錄了。${who === "pro" ? "等當事人回來填近況" : "填第一次近況"}，就能看到這段時間的變化。</p>`;
    const last = pts[pts.length - 1];
    const rows = METRICS.map((m) => {
      const vals = pts.map((p) => m.v(p.answers));
      const b = vals[0];
      const l = vals[vals.length - 1];
      const d = l - b;
      const tone = d === 0 ? "same" : d * m.better > 0 ? "good" : "bad";
      const word = { same: "持平", good: "變好了", bad: "需要多關心" }[tone];
      const x = (v) => ((v - m.min) / (m.max - m.min)) * 100;
      const lo = Math.min(x(b), x(l));
      return `<li class="pg__row is-${tone}">
        <span class="pg__label">${m.label}<small>${m.better > 0 ? "越高越好" : "越低越好"}</small></span>
        <span class="pg__track" aria-hidden="true">
          <i class="pg__line" style="left:${lo}%;width:${Math.abs(x(l) - x(b))}%"></i>
          ${vals
            .slice(1, -1)
            .map((v) => `<i class="pg__dot pg__dot--mid" style="left:${x(v)}%"></i>`)
            .join("")}
          <i class="pg__dot pg__dot--base" style="left:${x(b)}%"></i>
          <i class="pg__dot pg__dot--now" style="left:${x(l)}%"></i>
          <span class="pg__min">${m.min}</span><span class="pg__max">${m.max}</span>
        </span>
        <span class="pg__val">${b} → <b>${l}</b><small>${d > 0 ? "↑ " : d < 0 ? "↓ " : ""}${word}</small></span>
        <span class="sr">${m.label}：開處方時 ${b}，最近 ${l}，${word}</span>
      </li>`;
    }).join("");
    return `<div class="pg">
      <p class="pg__legend"><span><i class="pg__dot pg__dot--base"></i>開處方時 ${dot(base.day)}</span><span><i class="pg__dot pg__dot--now"></i>最近一次 ${dot(last.day)}</span><span>共 ${pts.length} 次紀錄</span></p>
      <ul class="pg__rows">${rows}</ul></div>`;
  }
  function deltaLonely(surveys) {
    const base = surveys.find((s) => s.kind === "baseline");
    const f = surveys.filter((s) => s.kind === "follow");
    if (!base || !f.length) return null;
    return { b: lonely(base.answers), l: lonely(f[f.length - 1].answers) };
  }

  /* ---------------- QR ---------------- */
  function qrSVG(text) {
    if (!window.qrcode) return "";
    const qr = window.qrcode(0, "M");
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true, alt: "處方 QR code" });
  }

  /* ---------------- 身份 ---------------- */
  const carer = () => LS.get("spB.who") === "carer";
  const atDesk = () => LS.get("spB.who") === "resource";
  const roleLabel = (r) => (r === "pro" ? "專業人員" : atDesk() ? "資源端" : "民眾");
  function setRole(r) {
    root.dataset.role = r;
    LS.set("spB.role", r);
    $$("[data-role-label]").forEach((el) => (el.textContent = roleLabel(r)));
    renderAll();
  }
  function openGate() {
    $("#gate").hidden = false;
    root.dataset.gate = "open";
    $$("#gate [data-gate-step]").forEach((s) => (s.hidden = s.dataset.gateStep !== "1"));
    setTimeout(() => $("#gate .gate__opt")?.focus(), 30);
  }
  function closeGate(target) {
    $("#gate").hidden = true;
    delete root.dataset.gate;
    const el = target && document.getElementById(target);
    if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth" }), 60);
    else scrollTo({ top: 0 });
  }
  function bindGate() {
    $("#gate").addEventListener("click", (e) => {
      const b = e.target.closest("[data-pick]");
      if (!b) return;
      const v = b.dataset.pick;
      if (v === "public") {
        $$("#gate [data-gate-step]").forEach((s) => (s.hidden = s.dataset.gateStep !== "2"));
        setTimeout(() => $('#gate [data-gate-step="2"] button')?.focus(), 30);
      } else if (v === "self" || v === "carer") {
        LS.set("spB.who", v);
        setRole("public");
        closeGate();
      } else if (v === "resource") {
        LS.set("spB.who", "resource");
        setRole("public");
        closeGate("mine");
      } else if (v === "pro") {
        setRole("pro");
        closeGate();
      } else if (v === "browse") {
        setRole("pro");
        closeGate("where");
      } else if (v === "back") {
        $$("#gate [data-gate-step]").forEach((s) => (s.hidden = s.dataset.gateStep !== "1"));
      }
    });
    $("#roleBtn").addEventListener("click", openGate);
  }

  /* ---------------- 帳號 ---------------- */
  // ctx：public（民眾）｜pro（link worker／社工）｜resource（資源端）
  const SPD = window.SP || {};
  const ROLE_NAME = { pro: "link worker／社工", resource: "資源端工作人員" };
  function resPickHTML(sel = []) {
    const groups = Object.entries(SPD.CATS || {})
      .map(([k, c]) => {
        const rs = (SPD.RESOURCES || []).filter((r) => r.cat === k);
        if (!rs.length) return "";
        return `<fieldset class="rpick__g"><legend>${esc(c.label)}</legend>${rs
          .map(
            (r) =>
              `<label class="rpick__i"><input type="checkbox" name="res" value="${esc(r.id)}"${sel.includes(r.id) ? " checked" : ""}><span>${esc(r.name)}</span></label>`,
          )
          .join("")}</fieldset>`;
      })
      .join("");
    return `<div class="rpick"><p class="rpick__k">你負責哪些活動？<small>可複選，之後可以改</small></p><div class="rpick__box">${groups}</div></div>`;
  }
  // 開通需要的欄位（註冊時，或已有帳號要升級為工作人員時）
  const joinFieldsHTML = (ctx, sel) => `
      <label class="auth__f"><span>${ctx === "resource" ? "名稱（例如：植物園服務台 王小姐）" : "名稱（可用化名）"}</span><input name="name" autocomplete="nickname" maxlength="40" placeholder="${ctx === "resource" ? "單位＋稱呼" : "例如：示範社工"}"></label>
      <label class="auth__f"><span>開通碼</span><input name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="向管理者索取"></label>
      ${ctx === "resource" ? resPickHTML(sel) : ""}`;
  function authHTML(ctx) {
    const work = ctx === "pro" || ctx === "resource";
    return `<form class="auth" data-ctx="${ctx}" data-mode="in" novalidate>
      <label class="auth__f"><span>Email</span><input type="email" name="email" autocomplete="email" required placeholder="name@example.com"></label>
      <label class="auth__f"><span>密碼</span><input type="password" name="pw" autocomplete="current-password" minlength="6" required placeholder="至少 6 個字元"></label>
      ${work ? `<div class="auth__join" hidden>${joinFieldsHTML(ctx)}</div>` : ""}
      <div class="auth__go">
        <button class="btn btn--red btn--sm" type="submit" data-act="in">登入</button>
        ${
          work
            ? `<button class="btn btn--red btn--sm" type="submit" data-act="up" hidden>註冊並開通</button>
               <button class="btn btn--ghost btn--sm" type="button" data-mode-to="up">第一次使用？註冊</button>
               <button class="btn btn--text btn--sm" type="button" data-mode-to="in" hidden>已有帳號，登入</button>`
            : `<button class="btn btn--ghost btn--sm" type="submit" data-act="up">註冊新帳號</button>`
        }
      </div>
      <p class="auth__note">${
        work
          ? `<span data-show="in">已經開通的${ROLE_NAME[ctx]}直接登入。</span><span data-show="up" hidden>註冊需要管理者給的<b>${ctx === "resource" ? "資源端" : "專業人員"}開通碼</b>；名稱請用單位或化名，本站為教學示範。</span>`
          : "請勿使用真實姓名；本站為教學示範。"
      }</p>
    </form>`;
  }
  // 已登入但還不是工作人員：輸入開通碼升級
  const joinHTML = (ctx) => `<form class="auth join" data-ctx="${ctx}" novalidate>
      <p class="join__k">${ctx === "resource" ? "是活動現場的工作人員嗎？" : "是 link worker／社工嗎？"}輸入管理者給你的開通碼，這個帳號就能${ctx === "resource" ? "幫當事人報到" : "使用個案追蹤"}。</p>
      ${joinFieldsHTML(ctx)}
      <div class="auth__go"><button class="btn btn--red btn--sm" type="submit">開通</button></div>
    </form>`;
  function readJoin(f, ctx) {
    const j = {
      role: ctx === "resource" ? "resource" : "staff",
      code: (f.code?.value || "").trim().toUpperCase(),
      name: (f.name?.value || "").trim(),
      resources: $$('input[name="res"]:checked', f).map((x) => x.value),
    };
    if (!j.code) return toast("請輸入開通碼"), null;
    if (j.role === "resource" && !j.resources.length) return toast(MSG.no_resource), null;
    return j;
  }
  async function join(j) {
    const { data, error } = await sb.rpc("staff_join", {
      p_role: j.role,
      p_code: j.code,
      p_name: j.name || null,
      p_resources: j.resources,
    });
    if (error) return toast(errMsg(error)), false;
    if (data.status !== "ok") return toast(MSG[data.status] || MSG.bad_code), data.status;
    return true;
  }
  const setMode = (f, m) => {
    f.dataset.mode = m;
    $(".auth__join", f).hidden = m !== "up";
    $('[data-act="in"]', f).hidden = m !== "in";
    $('[data-act="up"]', f).hidden = m !== "up";
    $('[data-mode-to="up"]', f).hidden = m !== "in";
    $('[data-mode-to="in"]', f).hidden = m !== "up";
    $$("[data-show]", f).forEach((x) => (x.hidden = x.dataset.show !== m));
    f.pw.autocomplete = m === "up" ? "new-password" : "current-password";
  };
  document.addEventListener("click", (e) => {
    const b = e.target.closest("form.auth [data-mode-to]");
    if (!b) return;
    const f = b.closest("form");
    setMode(f, b.dataset.modeTo);
    (b.dataset.modeTo === "up" ? f.name : f.email).focus();
  });
  document.addEventListener("submit", async (e) => {
    const f = e.target.closest("form.auth");
    if (!f || !sb) return;
    e.preventDefault();
    const ctx = f.dataset.ctx;
    const btns = $$("button", f);
    const busy = (v) => btns.forEach((b) => (b.disabled = v));
    // 已登入帳號升級
    if (f.classList.contains("join")) {
      const j = readJoin(f, ctx);
      if (!j) return;
      busy(true);
      const ok = await join(j);
      busy(false);
      if (ok === true) {
        toast("開通完成");
        await refreshAuth((await sb.auth.getSession()).data.session);
      }
      return;
    }
    const act = f.dataset.mode === "up" || e.submitter?.dataset.act === "up" ? "up" : "in";
    const email = f.email.value.trim();
    const password = f.pw.value;
    if (!email || password.length < 6) return toast("請填 email 和至少 6 個字元的密碼");
    const work = ctx === "pro" || ctx === "resource";
    let j = null;
    if (act === "up" && work) {
      j = readJoin(f, ctx);
      if (!j) return;
      busy(true);
      const { data: ok } = await sb.rpc("signup_code_ok", { p_role: j.role, p_code: j.code });
      if (!ok) {
        busy(false);
        return toast(MSG.bad_code);
      }
      // 註冊後（或確認信後第一次登入時）自動開通
      LS.set("spB.join", JSON.stringify(j));
    }
    busy(true);
    const { data, error } =
      act === "up"
        ? await sb.auth.signUp({ email, password })
        : await sb.auth.signInWithPassword({ email, password });
    busy(false);
    if (error) {
      if (j) localStorage.removeItem("spB.join");
      return toast(errMsg(error));
    }
    if (act === "up" && !data.session) toast("註冊成功，請到信箱點確認信後再登入");
    else toast(act === "up" ? "註冊成功" : "已登入");
  });
  document.addEventListener("click", async (e) => {
    if (!e.target.closest("[data-logout]") || !sb) return;
    await sb.auth.signOut();
    toast("已登出");
  });
  document.addEventListener("submit", async (e) => {
    const f = e.target.closest("form.resEdit");
    if (!f || !sb) return;
    e.preventDefault();
    const ids = $$('input[name="res"]:checked', f).map((x) => x.value);
    if (!ids.length) return toast(MSG.no_resource);
    $$("button", f).forEach((b) => (b.disabled = true));
    const { data, error } = await sb.rpc("resource_update", { p_resources: ids });
    $$("button", f).forEach((b) => (b.disabled = false));
    if (error) return toast(errMsg(error));
    if (data.status !== "ok") return toast(MSG[data.status] || data.status);
    toast("已更新負責的活動");
    await refreshAuth((await sb.auth.getSession()).data.session);
  });
  async function refreshAuth(session) {
    user = session?.user || null;
    staff = false;
    resource = null;
    if (user) {
      let { data: role } = await sb.rpc("my_role");
      const pending = LS.get("spB.join");
      if (pending) {
        localStorage.removeItem("spB.join");
        if (role === "resident") {
          try {
            if ((await join(JSON.parse(pending))) === true) {
              toast("工作人員帳號已開通");
              role = (await sb.rpc("my_role")).data;
            }
          } catch (e) {}
        }
      }
      staff = role === "staff";
      if (role === "resource") {
        const { data } = await sb
          .from("resource_staff")
          .select("name,resource_ids")
          .eq("user_id", user.id)
          .maybeSingle();
        resource = data || { name: "", resource_ids: [] };
      }
    }
    authReady = true;
    await syncLikesFromAccount();
    renderAll();
  }

  /* ---------------- 民眾：我的處方 ---------------- */
  const M = { code: null, pin: null, data: null, list: null, busy: false };
  try {
    Object.assign(M, JSON.parse(LS.get("spB.mine") || "{}"));
  } catch (e) {}
  const remember = () => LS.set("spB.mine", JSON.stringify({ code: M.code, pin: M.pin }));

  const offlineHTML = (pro) =>
    `<div class="note-box"><b>雲端尚未連線</b><p>${pro ? "設定 <code>config.js</code> 的 Supabase 網址與金鑰後（步驟見 <code>supabase/README.md</code>），這裡就能登入、查看所有處方的報到與成效。" : "這個功能需要連上雲端。示範網站設定完成後，就能用處方籤上的 QR code 或編號查看自己的處方。"}</p></div>`;

  async function loadMine() {
    if (!sb || !M.code) return;
    M.busy = true;
    const { data, error } = await sb.rpc("rx_get", { p_code: M.code, p_pin: M.pin || null });
    M.busy = false;
    if (error) {
      toast(errMsg(error));
      M.data = null;
    } else if (data.status !== "ok") {
      toast(MSG[data.status] || MSG.bad);
      M.data = null;
      if (data.status === "bad" || data.status === "bound") M.code = M.pin = null;
      remember();
    } else {
      M.data = data;
      M.code = data.code;
      if (data.pin) M.pin = data.pin;
      remember();
    }
  }
  async function loadList() {
    M.list = null;
    if (!sb || !user || staff || resource) return;
    const { data } = await sb.rpc("rx_mine");
    M.list = data || [];
  }

  function mineHTML() {
    if (!sb) return offlineHTML(false);
    const c = carer();
    const desk = !!resource || staff;
    const acct = user
      ? `<div class="acct"><span>已登入 <b>${esc(user.email)}</b>${
          resource
            ? `（資源端${resource.name ? "：" + esc(resource.name) : ""}・負責 ${resource.resource_ids.map((id) => esc(byId[id]?.name || id)).join("、") || "—"}）`
            : staff
              ? "（專業人員）"
              : ""
        }</span><button class="btn btn--text btn--sm" type="button" data-logout>登出</button></div>`
      : atDesk()
        ? `<details class="acct acct--out" open><summary>資源端工作人員登入<small>登入後掃當事人的 QR code，就能幫他報到；第一次使用可以自己註冊</small></summary>${authHTML("resource")}</details>`
        : `<details class="acct acct--out"><summary>登入或註冊帳號<small>綁定處方後，換手機也看得到，也能避免處方被別人拿去用</small></summary>${authHTML("public")}</details>`;
    const list =
      user && M.list && M.list.length
        ? `<div class="mylist"><p class="mylist__k">我綁定的處方籤</p>${M.list
            .map(
              (r) =>
                `<button type="button" class="mylist__i${M.data && M.data.code === r.code ? " is-on" : ""}" data-open="${esc(r.code)}"><b>${esc(r.code)}</b><span>${dot(r.created_at)}・${r.items.length} 項處方</span></button>`,
            )
            .join("")}</div>`
        : "";
    const lookup = `<form class="lookup" id="lookup">
      <p class="lookup__k">${desk ? (M.data ? "下一位" : "掃描或輸入當事人的處方編號與取件碼") : M.data ? "查另一張處方籤" : "輸入處方籤上的編號與取件碼"}</p>
      <label><span class="sr">處方編號</span><input name="code" placeholder="處方編號，例如 SP-20261125-1234" autocomplete="off" value="${M.data ? "" : esc(M.code || "")}" required></label>
      <label><span class="sr">取件碼</span><input name="pin" placeholder="取件碼（6 碼）" autocomplete="off" maxlength="6" ${user && !desk ? "" : "required"}></label>
      <button class="btn btn--ink btn--sm" type="submit">查詢</button>
      <p class="lookup__hint">${desk ? "最快的方式：用手機相機掃當事人處方籤（或手機畫面）上的 QR code。" : `也可以直接用手機相機掃處方籤上的 QR code。${user ? "已綁定到帳號的處方不需要取件碼。" : ""}`}</p>
    </form>`;
    const body = M.data
      ? ["resource", "staff"].includes(M.data.access)
        ? deskViewHTML(M.data)
        : detailHTML(M.data, c)
      : "";
    const extra = !user
      ? ""
      : resource
        ? `<details class="acct acct--out acct--edit"><summary>修改負責的活動<small>目前 ${resource.resource_ids.length} 項</small></summary><form class="resEdit" novalidate>${resPickHTML(resource.resource_ids)}<div class="auth__go"><button class="btn btn--red btn--sm" type="submit">儲存</button></div></form></details>`
        : atDesk() && !staff
          ? `<div class="acct acct--out acct--join">${joinHTML("resource")}</div>`
          : "";
    return acct + extra + list + body + lookup;
  }

  function detailHTML(d, c) {
    const today = todayTPE();
    const bindState = d.mine
      ? `<span class="tag">✓ 已綁定我的帳號</span>`
      : user && !staff
        ? `<button class="btn btn--red btn--sm" type="button" data-claim>綁定到我的帳號</button>`
        : `<span class="tag tag--soft">登入後可以把這張處方綁定到帳號</span>`;
    const items = d.items
      .map((it, i) => {
        const r = byId[it.id] || {};
        const mine = d.checkins.filter((x) => x.resource_id === it.id);
        const done = mine.some((x) => x.day === today);
        const link = r.links && r.links[0];
        const go = A.travel(r, d.district || undefined);
        const q = encodeURIComponent(`${it.place || r.place || ""} ${it.provider || r.provider || ""}`.trim());
        return `<li class="my__item">
          <span class="my__n">${i + 1}</span>
          <div class="my__body">
            <h4>${esc(it.name || r.name)}</h4>
            <p class="my__where">${esc(it.provider || r.provider || "")}${it.place || r.place ? "・" + esc(it.place || r.place) : ""}</p>
            ${go && d.district ? `<p class="my__go">${go.kind === "far" ? "從" + esc(d.district) + "：" : ""}${esc(go.label)}</p>` : ""}
            ${it.first ? `<p class="my__first"><span>第一步</span>${esc(it.first)}</p>` : ""}
            <p class="my__links">${link ? `<a href="${esc(link.url)}" target="_blank" rel="noopener">活動資訊 ↗</a>` : ""}<a href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">怎麼去 ↗</a></p>
          </div>
          <div class="my__ci">
            ${done ? `<span class="tag">✓ 今天已報到</span>` : ""}
            <span>${mine.length ? `已去過 <b>${mine.length}</b> 次` : "還沒去過"}</span>
          </div>
        </li>`;
      })
      .join("");
    const filledToday = d.surveys.some((s) => s.kind === "follow" && s.day === today);
    return `<article class="my">
      <header class="my__head">
        <div><p class="my__code">${esc(d.code)}</p>
        <h3>嗨，${esc(d.name || "你好")}</h3>
        <p class="my__dates">開立 ${dot(d.created_at)}${d.follow_on ? `・約好 <b>${dot(d.follow_on)}</b> 回來聊聊` : ""}</p></div>
        <div class="my__bind">${bindState}</div>
      </header>
      ${d.matters ? `<blockquote class="my__matters"><span>${c ? "對他重要的事" : "對我重要的事"}</span>「${esc(d.matters)}」</blockquote>` : ""}
      ${
        d.pin
          ? `<section class="my__pass"><div class="my__qr">${qrSVG(publicLink(d.code, d.pin))}</div>
        <div><h4>報到用 QR code</h4><p>到了活動現場，請工作人員用手機掃這個 QR code 幫${c ? "他" : "你"}報到。沒帶處方籤也沒關係，出示這個畫面就可以。</p><p class="my__pin">取件碼 <b>${esc(d.pin)}</b></p></div></section>`
          : ""
      }
      <section class="my__sec"><h4 class="my__h">我的處方<small>到了現場，請工作人員掃 QR code 報到</small></h4><ol class="my__items">${items}</ol></section>
      <section class="my__sec"><h4 class="my__h">我的改變<small>和開處方那天比較</small></h4>${progressHTML(d.surveys, "public")}</section>
      <section class="my__sec"><h4 class="my__h">${filledToday ? "今天的近況（已填，可以修改）" : "填今天的近況"}<small>約 1 分鐘・建議每 2–4 週填一次</small></h4>
        ${surveyHTML("svMine", filledToday ? d.surveys.filter((s) => s.kind === "follow" && s.day === today).pop().answers : null, c)}
        <button class="btn btn--red" type="button" data-survey>送出近況</button>
      </section>
      ${c ? carerCardHTML() : ""}
    </article>`;
  }

  // 資源端（或 link worker）掃碼後看到的報到畫面
  function deskViewHTML(d) {
    const today = todayTPE();
    const can = d.can || [];
    const items = d.items
      .map((it) => {
        const r = byId[it.id] || {};
        const cs = d.checkins.filter((x) => x.resource_id === it.id);
        const done = cs.some((x) => x.day === today);
        const mineToo = can.includes(it.id);
        return `<li class="my__item${mineToo ? "" : " is-other"}">
          <span class="my__n">${mineToo ? "✓" : "・"}</span>
          <div class="my__body"><h4>${esc(it.name || r.name)}</h4>
            <p class="my__where">${esc(it.provider || r.provider || "")}${mineToo ? "" : "・非本單位活動"}</p>
            <p class="my__where">${cs.length ? `已參加 ${cs.length} 次：${cs.map((x) => dot(x.day).slice(5)).join("、")}` : "還沒參加過"}</p></div>
          <div class="my__ci">${
            mineToo
              ? done
                ? `<span class="tag">✓ 今天已報到</span>`
                : `<button class="btn btn--red" type="button" data-checkin="${esc(it.id)}">幫他報到</button>`
              : ""
          }</div>
        </li>`;
      })
      .join("");
    return `<article class="my my--desk">
      <header class="my__head"><div><p class="my__code">${esc(d.code)}</p>
        <h3>${esc(d.name || "—")}</h3>
        <p class="my__dates">${esc(d.meta || "")}${d.district ? "・住" + esc(d.district) : ""}</p></div>
        <div class="my__bind">${d.bound ? `<span class="tag">已綁定民眾帳號</span>` : `<span class="tag tag--soft">紙本處方籤</span>`}</div></header>
      <p class="my__verify">請先和當事人確認姓名，再按報到。同一張處方、同一個活動，一天只能報到一次。</p>
      <section class="my__sec"><h4 class="my__h">處方內容</h4><ol class="my__items">${items}</ol></section>
    </article>`;
  }

  async function renderMine() {
    const el = $("#mineBody");
    if (!el || root.dataset.role !== "public") return;
    if (!authReady) {
      el.innerHTML = `<p class="loading">連線中…</p>`;
      return;
    }
    el.innerHTML = mineHTML();
    // 資源端：同一頁當作現場報到使用
    const desk = !!resource || atDesk();
    $("#mineTitle").textContent = desk ? "現場報到" : "我的處方籤";
    $("#mine .sec-kicker").textContent = desk
      ? "Scan the resident's QR code, confirm who they are, then check them in."
      : "Scan the QR code on your prescription — check in, and see how you're doing.";
    $$('a[href="#mine"]').forEach((a) => {
      if (!a.dataset.label) a.dataset.label = a.textContent;
      a.textContent = desk ? "現場報到" : a.dataset.label;
    });
  }
  function bindMine() {
    const el = $("#mineBody");
    el.addEventListener("submit", async (e) => {
      if (e.target.id !== "lookup") return;
      e.preventDefault();
      const f = e.target;
      M.code = f.code.value.trim().toUpperCase();
      M.pin = f.pin.value.trim().toUpperCase() || null;
      await loadMine();
      renderMine();
    });
    el.addEventListener("click", async (e) => {
      const open = e.target.closest("[data-open]");
      if (open) {
        M.code = open.dataset.open;
        M.pin = null;
        await loadMine();
        return renderMine();
      }
      if (e.target.closest("[data-claim]")) {
        const { data, error } = await sb.rpc("rx_claim", { p_code: M.code, p_pin: M.pin });
        if (error || data.status !== "ok") return toast(error ? errMsg(error) : MSG[data.status]);
        toast("已綁定到你的帳號，之後登入就看得到");
        await Promise.all([loadMine(), loadList()]);
        return renderMine();
      }
      const ci = e.target.closest("[data-checkin]");
      if (ci) {
        ci.disabled = true;
        const { data, error } = await sb.rpc("rx_checkin", {
          p_code: M.code,
          p_pin: M.pin || null,
          p_resource: ci.dataset.checkin,
        });
        if (error || data.status !== "ok") {
          ci.disabled = false;
          return toast(error ? errMsg(error) : MSG[data.status]);
        }
        toast(`已報到！這是他第 <b>${data.count}</b> 次參加`);
        await loadMine();
        return renderMine();
      }
      if (e.target.closest("[data-survey]")) {
        const a = readSurvey($("#svMine"));
        if (!a) return toast("還有題目沒填喔");
        const { data, error } = await sb.rpc("rx_survey", {
          p_code: M.code,
          p_pin: M.pin || null,
          p_answers: a,
        });
        if (error || data.status !== "ok") return toast(error ? errMsg(error) : MSG[data.status]);
        toast("謝謝你！近況已送出");
        await loadMine();
        renderMine();
        $("#mine .my__sec:nth-of-type(2)")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }

  /* ---------------- 專業人員：工作台第 5 步的雲端區塊 ---------------- */
  const sig = () => {
    const S = A.state;
    return JSON.stringify([
      S.name,
      S.district,
      S.confirm && S.confirm.sign,
      S.matters,
      S.follow,
      S.picks,
      S.picks.map((id) => S.plans[id]),
      S.baseline,
    ]);
  };
  function payload(S) {
    return {
      resident: {
        name: S.name || "",
        age: S.age,
        meta: S.meta || "",
        child: S.child || "",
        from: S.from || "",
        district: S.district || "",
        caseId: S.caseId,
        confirm: S.confirm ? { sign: S.confirm.sign, at: S.confirm.at } : null,
      },
      needs: S.needs,
      matters: S.matters || "",
      items: S.picks.map((id) => {
        const r = byId[id];
        const p = S.plans[id] || {};
        const t = A.travel(r);
        return { id, name: r.name, provider: r.provider, place: r.place, first: p.first || "", acc: p.acc || "", travel: t ? t.label : "" };
      }),
      hp: A.hpHit().map((d) => d.label),
      follow_weeks: +S.follow,
      follow_on: isoDate(A.addDays(new Date(), S.follow * 7)),
    };
  }
  function renderCloud() {
    const el = $("#cloud");
    if (!el) return;
    const S = A.state;
    if (!sb) {
      el.innerHTML = `<div class="cloud"><h4>存到雲端</h4><p>雲端尚未連線。設定 <code>config.js</code> 後，可以把這張處方存到雲端、印出 QR code，讓當事人報到並回報近況。</p></div>`;
      return;
    }
    if (!user || !staff) {
      el.innerHTML = `<div class="cloud"><h4>存到雲端</h4><p>${user ? "這個帳號不是專業人員帳號。" : "登入專業人員帳號後，"}可以把這張處方存到雲端、產生 QR code，之後在「個案追蹤」看到報到與改變。</p><a class="btn btn--ghost-light btn--sm" href="#desk">${user ? "到個案追蹤" : "登入"}</a></div>`;
      return;
    }
    const saved = S.cloud && S.cloud.code === S.rxId;
    const stale = saved && S.cloud.sig !== sig();
    el.innerHTML = `<div class="cloud">
      <h4>存到雲端・產生 QR code</h4>
      <details class="cloud__base"${S.baseline ? "" : " open"}>
        <summary>${S.baseline ? "✓ 基線量表已填" : "先和當事人一起填基線量表"}<small>這是「改變」的起點，之後每次近況都會和它比較</small></summary>
        ${surveyHTML("svBase", S.baseline, false)}
      </details>
      ${saved && !stale ? "" : `<button class="btn btn--red btn--sm" type="button" data-save>${saved ? "更新雲端內容" : "存到雲端並產生 QR code"}</button>`}
      ${
        saved
          ? `<div class="cloud__qr">
          <div class="cloud__code">${qrSVG(publicLink(S.cloud.code, S.cloud.pin))}</div>
          <div><p>處方編號<b>${esc(S.cloud.code)}</b></p><p>取件碼<b class="pin">${esc(S.cloud.pin)}</b></p>
          <p class="cloud__tip">QR code 與取件碼會印在處方籤上。當事人掃碼可以看處方、填近況，登入後可綁定到自己的帳號；到了活動現場，由資源端工作人員掃同一個 QR code 幫他報到。</p>
          <div class="cloud__act"><button class="btn btn--ghost-light btn--sm" type="button" data-copylink>複製民眾連結</button><a class="btn btn--text-light btn--sm" href="${esc(publicLink(S.cloud.code, S.cloud.pin))}" target="_blank" rel="noopener">開啟民眾頁 ↗</a></div></div>
        </div>`
          : `<p class="cloud__tip">當事人姓名請用化名。</p>`
      }
    </div>`;
  }
  function injectQR() {
    const S = A.state;
    const rx = $("#rx");
    if (!rx || $(".rx__qr", rx)) return;
    if (!(S.cloud && S.cloud.code === S.rxId)) return;
    const box = document.createElement("div");
    box.className = "rx__qr";
    box.innerHTML = `${qrSVG(publicLink(S.cloud.code, S.cloud.pin))}<p>掃描查看處方、回報近況<br>到活動現場請工作人員掃碼報到<br>取件碼 <b>${esc(S.cloud.pin)}</b></p>`;
    rx.appendChild(box);
  }
  async function saveCloud(btn) {
    const S = A.state;
    const base = readSurvey($("#svBase"));
    if (!base) {
      $(".cloud__base").open = true;
      return toast("請先和當事人一起填完基線量表");
    }
    A.patch({ baseline: base });
    btn.disabled = true;
    const saved = S.cloud && S.cloud.code === S.rxId;
    const pin = saved ? S.cloud.pin : genPin();
    let err = null;
    if (saved) {
      ({ error: err } = await sb.from("prescriptions").update(payload(S)).eq("code", S.rxId));
    } else {
      for (let i = 0; i < 3; i++) {
        ({ error: err } = await sb.from("prescriptions").insert({ code: S.rxId, pin, ...payload(S) }));
        if (err && err.code === "23505") {
          A.patch({ rxId: A.newRxId() });
          continue;
        }
        break;
      }
    }
    if (!err) {
      await sb.from("surveys").delete().eq("code", S.rxId).eq("kind", "baseline");
      ({ error: err } = await sb
        .from("surveys")
        .insert({ code: S.rxId, kind: "baseline", answers: base, by_role: "pro" }));
    }
    btn.disabled = false;
    if (err) return toast(errMsg(err));
    A.patch({ cloud: { code: S.rxId, pin, sig: sig() } });
    A.renderRx();
    toast(saved ? "已更新雲端內容" : `已存到雲端・取件碼 <b>${pin}</b>`);
    desk.list = null;
  }
  function bindCloud() {
    const el = $("#cloud");
    if (!el) return;
    el.addEventListener("sv:change", () => {
      const a = readSurvey($("#svBase"));
      if (a) {
        A.patch({ baseline: a });
        const sum = $(".cloud__base summary");
        if (sum) sum.firstChild.textContent = "✓ 基線量表已填";
        if (A.state.cloud && A.state.cloud.code === A.state.rxId && A.state.cloud.sig !== sig() && !$("[data-save]", el))
          renderCloud();
      }
    });
    el.addEventListener("click", (e) => {
      const s = e.target.closest("[data-save]");
      if (s) return saveCloud(s);
      if (e.target.closest("[data-copylink]")) {
        const S = A.state;
        A.copy(publicLink(S.cloud.code, S.cloud.pin), "已複製民眾連結");
      }
    });
    document.addEventListener("sp:rx", () => {
      renderCloud();
      injectQR();
    });
  }

  /* ---------------- 專業人員：個案追蹤 ---------------- */
  const desk = { list: null, q: "", open: null, err: null, who: {} };
  async function loadDesk() {
    const { data, error } = await sb
      .from("prescriptions")
      .select(
        "code,created_at,resident,needs,matters,items,follow_on,resident_user,checkins(resource_id,day,by_user,created_at),surveys(kind,answers,day,created_at)",
      )
      .order("created_at", { ascending: false });
    const { data: rs } = await sb.from("resource_staff").select("user_id,name");
    desk.who = Object.fromEntries((rs || []).map((x) => [x.user_id, x.name]));
    desk.err = error ? errMsg(error) : null;
    desk.list = (data || []).map((r) => {
      r.checkins.sort((a, b) => a.created_at.localeCompare(b.created_at));
      r.surveys.sort((a, b) => a.created_at.localeCompare(b.created_at));
      return r;
    });
  }
  function kpiHTML(list) {
    const n = list.length;
    const went = list.filter((r) => r.checkins.length).length;
    const fol = list.filter((r) => r.surveys.some((s) => s.kind === "follow")).length;
    const ds = list.map((r) => deltaLonely(r.surveys)).filter(Boolean);
    const avg = ds.length ? ds.reduce((s, d) => s + (d.l - d.b), 0) / ds.length : null;
    const today = todayTPE();
    const due = list.filter(
      (r) => r.follow_on && r.follow_on <= today && !r.surveys.some((s) => s.kind === "follow"),
    ).length;
    const pct = (a) => (n ? Math.round((a / n) * 100) + "%" : "—");
    return `<ul class="kpi">
      <li><span>開立處方</span><b>${n}</b><small>張</small></li>
      <li><span>至少去過一次</span><b>${pct(went)}</b><small>${went} / ${n}</small></li>
      <li><span>回來填近況</span><b>${pct(fol)}</b><small>${fol} / ${n}</small></li>
      <li><span>孤寂感平均變化</span><b>${avg === null ? "—" : (avg > 0 ? "+" : avg < 0 ? "−" : "") + Math.abs(avg).toFixed(1)}</b><small>${ds.length ? `${ds.length} 位有前後測・越低越好` : "尚無前後測"}</small></li>
      <li class="${due ? "is-warn" : ""}"><span>該追蹤了</span><b>${due}</b><small>已過約定日、還沒回來填近況</small></li>
    </ul>`;
  }
  function rowHTML(r) {
    const today = todayTPE();
    const dl = deltaLonely(r.surveys);
    const due = r.follow_on && r.follow_on <= today && !r.surveys.some((s) => s.kind === "follow");
    return `<tr class="${desk.open === r.code ? "is-open" : ""}" data-row="${esc(r.code)}" tabindex="0">
      <td><b>${esc(r.code)}</b></td>
      <td>${esc(r.resident?.name || "—")}<small>${esc(r.resident?.from || "")}</small></td>
      <td>${dot(r.created_at)}</td>
      <td>${r.follow_on ? dot(r.follow_on) : "—"}${due ? `<small class="due">該追蹤了</small>` : ""}</td>
      <td>${r.items.length} 項</td>
      <td>${r.checkins.length} 次</td>
      <td>${dl ? `${dl.b} → <b>${dl.l}</b>` : "—"}</td>
      <td>${esc(r.resident?.district || "—")}</td>
      <td>${r.resident_user ? "已綁帳號" : "紙本"}</td>
    </tr>`;
  }
  function deskDetailHTML(r) {
    const items = r.items
      .map((it) => {
        const cs = r.checkins.filter((c) => c.resource_id === it.id);
        return `<li><b>${esc(it.name)}</b><span>${esc(it.provider || "")}</span>
          ${it.travel ? `<span>${esc(it.travel)}</span>` : ""}
          <span class="dd__ci">${cs.length ? cs.map((c) => `<i title="${esc(desk.who[c.by_user] ? "由 " + desk.who[c.by_user] + " 報到" : "")}">${dot(c.day).slice(5)}${desk.who[c.by_user] ? "・" + esc(desk.who[c.by_user]) : ""}</i>`).join("") : "尚未報到"}</span></li>`;
      })
      .join("");
    return `<div class="dd">
      <header class="dd__head"><div><p class="my__code">${esc(r.code)}</p><h3>${esc(r.resident?.name || "—")}</h3>
        <p>${esc(r.resident?.meta || "")}${r.resident?.district ? "・住" + esc(r.resident.district) : ""}${r.resident?.from ? "・轉介自 " + esc(r.resident.from) : ""}</p></div>
        <button class="btn btn--text btn--sm" type="button" data-close>收合 ✕</button></header>
      ${r.matters ? `<blockquote class="my__matters"><span>對當事人重要的事</span>「${esc(r.matters)}」</blockquote>` : ""}
      <div class="dd__grid">
        <section><h4 class="my__h">報到紀錄<small>由資源端工作人員掃碼登記</small></h4><ul class="dd__items">${items}</ul></section>
        <section><h4 class="my__h">改變</h4>${progressHTML(r.surveys, "pro")}</section>
      </div>
      <details class="dd__phone"><summary>電話追蹤：代當事人填近況</summary>
        ${surveyHTML("svPhone", null, false)}
        <button class="btn btn--ink btn--sm" type="button" data-phone="${esc(r.code)}">送出</button></details>
    </div>`;
  }
  async function renderDesk() {
    const el = $("#deskBody");
    if (!el || root.dataset.role === "public") return;
    if (!sb) return (el.innerHTML = offlineHTML(true));
    if (!authReady) return (el.innerHTML = `<p class="loading">連線中…</p>`);
    if (!user)
      return (el.innerHTML = `<div class="desk__login"><h3>專業人員登入</h3><p>登入後可以查看所有處方的報到紀錄、追蹤問卷與前後變化，也能用處方編號查詢。第一次使用可以自己註冊，需要管理者給的開通碼。</p>${authHTML("pro")}</div>`);
    if (resource)
      return (el.innerHTML = `<div class="note-box"><b>這是資源端帳號</b><p>請用手機相機掃當事人的處方 QR code，網頁打開後按「幫他報到」。也可以從右上角切換到「資源端」，輸入處方編號與取件碼。</p><button class="btn btn--ghost btn--sm" type="button" data-logout>登出</button></div>`);
    if (!staff)
      return (el.innerHTML = `<div class="desk__login"><div class="acct"><span>已登入 <b>${esc(user.email)}</b>（尚未開通專業人員權限）</span><button class="btn btn--text btn--sm" type="button" data-logout>登出</button></div>${joinHTML("pro")}</div>`);
    if (!desk.list) {
      el.innerHTML = `<p class="loading">讀取中…</p>`;
      await loadDesk();
    }
    const q = desk.q.trim().toUpperCase();
    const shown = desk.list.filter(
      (r) => !q || r.code.includes(q) || (r.resident?.name || "").toUpperCase().includes(q),
    );
    const open = desk.list.find((r) => r.code === desk.open);
    el.innerHTML = `
      <div class="acct"><span>已登入 <b>${esc(user.email)}</b>（專業人員）</span><button class="btn btn--text btn--sm" type="button" data-logout>登出</button></div>
      ${desk.err ? `<div class="note-box"><b>讀取失敗</b><p>${esc(desk.err)}</p></div>` : ""}
      ${kpiHTML(desk.list)}
      <div class="desk__bar">
        <label class="search"><span class="sr">以編號或姓名查詢</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
        <input type="search" id="deskQ" placeholder="以處方編號或姓名查詢" value="${esc(desk.q)}"></label>
        <button class="btn btn--ghost btn--sm" type="button" data-reload>重新整理</button>
      </div>
      ${open ? deskDetailHTML(open) : ""}
      <div class="desk__table"><table>
        <thead><tr><th>處方編號</th><th>當事人</th><th>開立</th><th>回來聊聊</th><th>處方</th><th>報到</th><th>孤寂感</th><th>居住地</th><th>帳號</th></tr></thead>
        <tbody>${shown.map(rowHTML).join("") || `<tr><td colspan="9" class="desk__empty">${desk.list.length ? "找不到符合的處方" : "還沒有處方。到處方工作台開立第一張，並在最後一步按「存到雲端」。"}</td></tr>`}</tbody>
      </table></div>`;
  }
  function bindDesk() {
    const el = $("#deskBody");
    el.addEventListener("input", (e) => {
      if (e.target.id !== "deskQ") return;
      desk.q = e.target.value;
      const pos = e.target.selectionStart;
      renderDesk().then(() => {
        const i = $("#deskQ");
        i.focus();
        i.setSelectionRange(pos, pos);
      });
    });
    const openRow = (code) => {
      desk.open = desk.open === code ? null : code;
      renderDesk().then(() => desk.open && $(".dd")?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    };
    el.addEventListener("click", async (e) => {
      const row = e.target.closest("[data-row]");
      if (row) return openRow(row.dataset.row);
      if (e.target.closest("[data-close]")) return openRow(desk.open);
      if (e.target.closest("[data-reload]")) {
        desk.list = null;
        return renderDesk();
      }
      const ph = e.target.closest("[data-phone]");
      if (ph) {
        const a = readSurvey($("#svPhone"));
        if (!a) return toast("還有題目沒填喔");
        const { data, error } = await sb.rpc("rx_survey", { p_code: ph.dataset.phone, p_pin: null, p_answers: a });
        if (error || data.status !== "ok") return toast(error ? errMsg(error) : MSG[data.status]);
        toast("已記錄這次電話追蹤");
        desk.list = null;
        renderDesk();
      }
    });
    el.addEventListener("keydown", (e) => {
      const row = e.target.closest("[data-row]");
      if (row && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        openRow(row.dataset.row);
      }
    });
  }

  /* ---------------- 浮動清單：民眾「我有興趣」／專業人員「候選」 ---------------- */
  const CATS = window.SP.CATS;
  const likesLink = (ids) => location.origin + location.pathname + "#likes=" + ids.join(",");
  function mountFab() {
    const b = document.createElement("div");
    b.innerHTML = `<button class="fab" id="fab" type="button" aria-haspopup="dialog" aria-controls="drawer"><span class="fab__i" aria-hidden="true"></span><span class="fab__t"></span><b class="fab__n"></b></button>
      <div class="drawer" id="drawer" hidden>
        <div class="drawer__bg" data-close-drawer></div>
        <aside class="drawer__panel" role="dialog" aria-modal="true" aria-labelledby="drawerTitle">
          <header class="drawer__head"><h3 id="drawerTitle"></h3><button class="drawer__x" type="button" data-close-drawer aria-label="關閉">✕</button></header>
          <div class="drawer__body" id="drawerBody"></div>
        </aside>
      </div>`;
    document.body.append(...b.children);
    $("#fab").addEventListener("click", openDrawer);
    $("#drawer").addEventListener("click", (e) => {
      if (e.target.closest("[data-close-drawer]")) return closeDrawer();
      const un = e.target.closest("[data-unlike]");
      if (un) {
        A.setLikes(A.likes.filter((x) => x !== un.dataset.unlike));
        return renderDrawer();
      }
      const up = e.target.closest("[data-unpick]");
      if (up) {
        A.removePick(up.dataset.unpick);
        return renderDrawer();
      }
      if (e.target.closest("[data-copylikes]")) return A.copy(likesLink(A.likes), "已複製連結，可以傳給 link worker");
      if (e.target.closest("[data-gostudio]")) {
        closeDrawer();
        const S = A.state;
        A.goTo(!S.caseId ? 0 : S.picks.length ? 3 : 2);
        return;
      }
      const go = e.target.closest("[data-golib]");
      if (go) {
        closeDrawer();
        $("#library").scrollIntoView({ behavior: "smooth" });
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("#drawer").hidden) closeDrawer();
    });
    ["sp:save", "sp:likes", "sp:picks"].forEach((ev) => document.addEventListener(ev, renderFab));
  }
  const fabMode = () =>
    root.dataset.role === "public" ? (atDesk() || resource ? null : "likes") : "picks";
  function renderFab() {
    const f = $("#fab");
    if (!f) return;
    const m = fabMode();
    f.hidden = !m;
    if (!m) return;
    const S = A.state;
    $(".fab__i", f).textContent = m === "likes" ? "♡" : "℞";
    $(".fab__t", f).textContent = m === "likes" ? "我有興趣" : "候選處方";
    $(".fab__n", f).textContent = m === "likes" ? A.likes.length : `${S.picks.length}/${A.MAX_PICKS}`;
    f.classList.toggle("is-empty", m === "likes" ? !A.likes.length : !S.picks.length);
    if (!$("#drawer").hidden) renderDrawer();
  }
  function openDrawer() {
    renderDrawer();
    $("#drawer").hidden = false;
    root.dataset.drawer = "open";
    setTimeout(() => $(".drawer__x").focus(), 30);
  }
  function closeDrawer() {
    $("#drawer").hidden = true;
    delete root.dataset.drawer;
    $("#fab").focus();
  }
  function itemRow(id, btn) {
    const r = byId[id];
    // 專業人員看目前個案的居住地；民眾看自己在處方庫選的
    const d =
      root.dataset.role === "pro"
        ? A.state.district
        : LS.get("spB.dist") || A.state.district;
    const t = A.travel(r, d || "");
    const link = r.links && r.links[0];
    return `<li class="dl__i"><div><span class="dl__cat">${esc(CATS[r.cat].label)}</span><b>${esc(r.name)}</b>
      <span class="dl__meta">${esc(r.provider)}${t ? "・" + esc(t.label) : ""}</span>
      ${link ? `<a href="${esc(link.url)}" target="_blank" rel="noopener">活動資訊 ↗</a>` : ""}</div>${btn}</li>`;
  }
  function renderDrawer() {
    const m = fabMode();
    const body = $("#drawerBody");
    if (!m) return;
    if (m === "likes") {
      const ids = A.likes;
      $("#drawerTitle").textContent = `我有興趣（${ids.length}）`;
      body.innerHTML = !ids.length
        ? `<p class="dl__empty">還沒有標記。在「社區處方」看到想試試的活動，按卡片上的「♡ 我有興趣」，就會出現在這裡。</p>
           <button class="btn btn--ink btn--sm" type="button" data-golib>去看社區處方</button>`
        : `<p class="dl__lead">這份清單<b>不是處方</b>。和醫師、社工或 link worker 談的時候拿出來，一起決定哪一個最適合${carer() ? "他" : "你"}、第一步怎麼開始。</p>
           <ul class="dl">${ids.map((id) => itemRow(id, `<button class="dl__rm" type="button" data-unlike="${id}" aria-label="移除 ${esc(byId[id].name)}">✕</button>`)).join("")}</ul>
           <section class="dl__share"><div class="dl__qr">${qrSVG(likesLink(ids))}</div>
             <div><h4>給 link worker 看</h4><p>請他用手機掃這個 QR code，或把連結傳給他。打開後，他在擬定處方時會看到你標記的活動。</p>
             <button class="btn btn--ghost btn--sm" type="button" data-copylikes>複製連結</button></div></section>
           <p class="dl__note">${user && !staff && !resource ? "✓ 已存到你的帳號，換手機登入也看得到。" : "清單存在這台裝置上；登入帳號後會一起存到帳號。"}</p>`;
      return;
    }
    const S = A.state;
    $("#drawerTitle").textContent = `候選處方（${S.picks.length}/${A.MAX_PICKS}）`;
    const liked = S.likes.filter((id) => !S.picks.includes(id));
    body.innerHTML = `
      ${S.caseId ? `<p class="dl__lead">目前的居民：<b>${esc(S.name || "（未命名）")}</b>${S.district ? "・住" + esc(S.district) : ""}</p>` : `<p class="dl__lead">還沒選居民。候選會先保留，選好居民後一起帶入。</p>`}
      ${
        S.picks.length
          ? `<ul class="dl">${S.picks.map((id) => itemRow(id, `<button class="dl__rm" type="button" data-unpick="${id}" aria-label="移除 ${esc(byId[id].name)}">✕</button>`)).join("")}</ul>`
          : `<p class="dl__empty">還沒有候選。在媒合結果或社區處方庫按「＋ 放進候選」。</p>`
      }
      ${liked.length ? `<h4 class="dl__h">♡ 當事人自己有興趣的</h4><ul class="dl dl--soft">${liked.map((id) => itemRow(id, "")).join("")}</ul>` : ""}
      <button class="btn btn--red btn--sm" type="button" data-gostudio>${!S.caseId ? "到工作台選居民" : S.picks.length ? "到工作台：共同決定" : "到工作台：媒合"} →</button>`;
  }
  // 民眾帳號：「我有興趣」存在帳號的 user_metadata，換裝置也看得到
  async function syncLikesFromAccount() {
    if (!sb || !user || staff || resource) return;
    const remote = (user.user_metadata && user.user_metadata.likes) || [];
    const merged = [...new Set([...remote, ...A.likes])];
    A.setLikes(merged, true);
    if (merged.length !== remote.length) await sb.auth.updateUser({ data: { likes: merged } });
  }
  document.addEventListener("sp:likes", () => {
    if (sb && user && !staff && !resource) sb.auth.updateUser({ data: { likes: A.likes } });
  });

  /* ---------------- 照顧者模式 ---------------- */
  const CARER_IDS = window.SP.RESOURCES.filter((r) => r.cat === "carer").map((r) => r.id);
  function renderCarerBand() {
    const el = $("#carerBand");
    if (!el) return;
    const on = root.dataset.role === "public" && carer();
    el.innerHTML = on
      ? `<aside class="carer-band"><div><p class="carer-band__k">給照顧者</p>
          <h3>照顧別人，也要照顧自己</h3>
          <p>喘息服務、照顧者專線、支持團體、日間照顧……這些是為<b>你</b>準備的，不是為了你照顧的人。</p></div>
          <button class="btn btn--red btn--sm" type="button" data-carerfilter>看給照顧者的資源（${CARER_IDS.length}）</button></aside>`
      : "";
  }
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-carerfilter]")) return;
    $('#filters button[data-cat="carer"]')?.click();
    $("#library")?.scrollIntoView({ behavior: "smooth" });
  });
  function carerCardHTML() {
    const pick = ["carerline", "carer-hub", "ltc"].filter((id) => byId[id]);
    return `<section class="my__sec my__carer"><h4 class="my__h">你自己也需要喘息<small>給照顧者</small></h4>
      <p>照顧的路很長。這幾個資源是給照顧者本人的，可以先從一通電話開始。</p>
      <ul>${pick
        .map((id) => {
          const r = byId[id];
          const l = r.links && r.links[0];
          return `<li><b>${esc(r.name)}</b><span>${esc(r.first)}</span>${l ? `<a href="${esc(l.url)}" target="_blank" rel="noopener">了解更多 ↗</a>` : ""}</li>`;
        })
        .join("")}</ul>
      <button class="btn btn--ghost btn--sm" type="button" data-carerfilter>看全部照顧者資源</button></section>`;
  }

  /* ---------------- 共用 ---------------- */
  async function renderAll() {
    renderFab();
    renderCarerBand();
    if (root.dataset.role === "public") {
      if (user && !staff && !resource && M.list === null) await loadList();
      if (M.code && !M.data && !M.busy) await loadMine();
      renderMine();
    } else {
      renderDesk();
    }
    renderCloud();
  }

  function init() {
    // 從 QR code 進來：#rx=CODE.PIN
    const m = location.hash.match(/^#rx=([\w-]+)\.([A-Za-z0-9]{6})$/);
    if (m) {
      M.code = m[1].toUpperCase();
      M.pin = m[2].toUpperCase();
      M.data = null;
      remember();
      history.replaceState(null, "", location.pathname + "#mine");
      LS.set("spB.role", "public");
      root.dataset.role = "public";
    }
    if (A.fromRef || A.fromLikes) {
      LS.set("spB.role", "pro");
      root.dataset.role = "pro";
    }
    mountFab();
    bindGate();
    bindMine();
    bindCloud();
    bindDesk();
    const r = root.dataset.role;
    if (r) $$("[data-role-label]").forEach((el) => (el.textContent = roleLabel(r)));
    else openGate();
    if (sb) {
      sb.auth.onAuthStateChange((ev, session) => {
        // 不在 callback 內直接呼叫 supabase，避免鎖死
        setTimeout(() => {
          // token 自動更新、或同一位使用者再次觸發：不重繪，避免清掉填到一半的問卷
          if (authReady && (session?.user?.id || null) === (user?.id || null)) {
            user = session?.user || null;
            return;
          }
          if (ev === "SIGNED_OUT" || ev === "SIGNED_IN") {
            desk.list = null;
            M.list = null;
            if (ev === "SIGNED_OUT") M.data = null;
          }
          refreshAuth(session);
        }, 0);
      });
    } else renderAll();
    if (m) setTimeout(() => $("#mine")?.scrollIntoView(), 300);
  }
  init();
})();
