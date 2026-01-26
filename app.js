/* app.js (MVP v0.1) - CON COST Groupware (GitHub Pages / localStorage Only)
   - ✅ 업무일지: 비율(%) 입력, 제출(submitted)
   - ✅ 승인: 승인 시 approved, 프로젝트 "일수"는 (프로젝트+날짜) unique로 +1 카운트
   - ✅ 대시보드: 프로젝트별 투입인원/일수, 공정별 분포
   - ✅ 종합 공정관리 달력: 승인된 업무일지 기반 자동 기입 + 구조/마감 필터 + 1달/3달
   - ✅ 체크리스트: 이미지 첨부 + 완료 시 취소선(소거) + 완료자/완료일 표기
   - ✅ 정적(MVP): 유저 전환(가짜 로그인), 데이터는 localStorage 저장

   [필수] index.html에 아래 중 하나가 있으면 됩니다.
   - <div id="app"></div>  (없으면 자동 생성)
*/

(() => {
  "use strict";

  /***********************
   * 1) 공정 마스터(고정)
   ***********************/
  const PROCESS_MASTER = {
    "구조": [
      "기초",
      "기둥",
      "보",
      "슬라브",
      "벽/옹벽",
      "철골",
      "접합/도장",
      "구조검토/샵도"
    ],
    "마감": [
      "내화(뿜칠/도장)",
      "단열/방수",
      "창호",
      "내부마감(석고/도장/타일 등)",
      "외부마감",
      "MEP 협업(간섭/수정)",
      "마감검토/펀치(하자/잔손)"
    ]
  };

  /***********************
   * 2) localStorage DB
   ***********************/
  const LS_KEY = "CONCOST_GROUPWARE_DB_V01";
  const LS_USER = "CONCOST_GROUPWARE_CURRENT_USER_V01";

  function uuid() {
    // 간단 UUID
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (crypto?.getRandomValues?.(new Uint8Array(1))?.[0] ?? Math.random() * 256) & 15;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function nowISO() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  }

  function todayISODate() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function clamp(n, a, b) {
    return Math.min(b, Math.max(a, n));
  }

  function safeJSONParse(s, fallback) {
    try {
      return JSON.parse(s);
    } catch {
      return fallback;
    }
  }

  function loadDB() {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return safeJSONParse(raw, null);
  }

  function saveDB(db) {
    localStorage.setItem(LS_KEY, JSON.stringify(db));
  }

  function ensureDB() {
    let db = loadDB();
    if (db) return db;

    // 샘플 시드(처음 실행)
    db = {
      meta: { version: "0.1", createdAt: nowISO() },
      users: [
        { userId: "u_staff_1", name: "작업자A", role: "staff" },
        { userId: "u_staff_2", name: "작업자B", role: "staff" },
        { userId: "u_leader", name: "팀장", role: "leader" },
        { userId: "u_manager", name: "실장", role: "manager" },
        { userId: "u_director", name: "본부장", role: "director" },
        { userId: "u_vp", name: "상무", role: "vp" },
        { userId: "u_ceo", name: "대표", role: "ceo" }
      ],
      projects: [
        { projectId: "p_a123", projectCode: "Project A-123", projectName: "프로젝트 A", startDate: "2024-05-01", endDate: "" },
        { projectId: "p_b234", projectCode: "Project B-234", projectName: "프로젝트 B", startDate: "2024-05-10", endDate: "" },
        { projectId: "p_c345", projectCode: "Project C-345", projectName: "프로젝트 C", startDate: "2024-05-15", endDate: "" }
      ],
      logs: [
        // { logId, date, projectId, category, process, content, ratio, writerId, status, submittedAt, approvedBy, approvedAt, rejectedBy, rejectedAt, rejectReason }
      ],
      checklists: [
        // { itemId, projectId, title, description, imageDataUrl, writerId, assigneeId, status, createdAt, doneBy, doneAt }
      ]
    };

    saveDB(db);
    return db;
  }

  function getCurrentUserId(db) {
    const saved = localStorage.getItem(LS_USER);
    if (saved && db.users.some(u => u.userId === saved)) return saved;
    // 기본: 작업자A
    localStorage.setItem(LS_USER, db.users[0].userId);
    return db.users[0].userId;
  }

  function setCurrentUserId(userId) {
    localStorage.setItem(LS_USER, userId);
  }

  function getUser(db, userId) {
    return db.users.find(u => u.userId === userId) || null;
  }

  function getProject(db, projectId) {
    return db.projects.find(p => p.projectId === projectId) || null;
  }

  /***********************
   * 3) 승인 체계(정적 MVP)
   ***********************/
  // 정적 MVP에서는 "제출된 문서 = 누구나 승인 화면에서 승인 가능"
  // 실제 단계 승인(팀장→실장→...)은 추후 서버에서 구현 권장

  /***********************
   * 4) 집계 로직 (승인 시 +1 = 일수 카운트)
   ***********************/
  function getApprovedLogs(db) {
    return db.logs.filter(l => l.status === "approved");
  }

  function computeProjectDays(db, projectId) {
    // 승인된 업무일지에서 (projectId + date) unique count
    const set = new Set();
    for (const l of db.logs) {
      if (l.status !== "approved") continue;
      if (l.projectId !== projectId) continue;
      set.add(`${l.projectId}__${l.date}`);
    }
    return set.size;
  }

  function computeProjectHeadcount(db, projectId) {
    const set = new Set();
    for (const l of db.logs) {
      if (l.status !== "approved") continue;
      if (l.projectId !== projectId) continue;
      set.add(l.writerId);
    }
    return set.size;
  }

  function computeProjectProcessBreakdown(db, projectId) {
    // 공정별 비율 합(같은 날 여러 건일 수 있음)
    const breakdown = {}; // key: "구조|기초" -> sumRatio
    for (const l of db.logs) {
      if (l.status !== "approved") continue;
      if (l.projectId !== projectId) continue;
      const key = `${l.category}||${l.process}`;
      breakdown[key] = (breakdown[key] || 0) + (Number(l.ratio) || 0);
    }
    return breakdown;
  }

  function computeProjectListStats(db) {
    return db.projects.map(p => {
      const days = computeProjectDays(db, p.projectId);
      const hc = computeProjectHeadcount(db, p.projectId);
      const totalApproved = db.logs.filter(l => l.status === "approved" && l.projectId === p.projectId).length;
      return { projectId: p.projectId, projectCode: p.projectCode, projectName: p.projectName, days, headcount: hc, approvedEntries: totalApproved };
    });
  }

  /***********************
   * 5) DOM Helpers
   ***********************/
  function $(sel, root = document) {
    return root.querySelector(sel);
  }
  function $all(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") node.className = v;
      else if (k === "dataset") {
        for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
      } else if (k.startsWith("on") && typeof v === "function") {
        node.addEventListener(k.slice(2), v);
      } else if (k === "html") node.innerHTML = v;
      else if (v === false || v == null) {
        // skip
      } else node.setAttribute(k, String(v));
    }
    for (const c of children) {
      if (c == null) continue;
      if (typeof c === "string") node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    }
    return node;
  }

  function toast(msg) {
    const host = $("#__toast_host") || (() => {
      const h = el("div", { id: "__toast_host", style: "position:fixed;left:12px;bottom:12px;z-index:99999;display:flex;flex-direction:column;gap:8px;" });
      document.body.appendChild(h);
      return h;
    })();
    const t = el("div", {
      style: "padding:10px 12px;border-radius:12px;background:rgba(0,0,0,.78);color:#fff;font-size:13px;max-width:75vw;box-shadow:0 10px 26px rgba(0,0,0,.18);"
    }, msg);
    host.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }

  function confirmBox(message) {
    // 단순 confirm 사용(정적 MVP)
    return window.confirm(message);
  }

  /***********************
   * 6) 앱 Shell / Router
   ***********************/
  const ROUTES = [
    { hash: "#daily", title: "업무일지" },
    { hash: "#approve", title: "승인" },
    { hash: "#dashboard", title: "프로젝트 소요시간" },
    { hash: "#calendar", title: "종합 공정관리/체크리스트" }
  ];

  function ensureRoot() {
    let root = $("#app");
    if (!root) {
      root = el("div", { id: "app" });
      document.body.appendChild(root);
    }
    return root;
  }

  function renderShell(db) {
    const root = ensureRoot();
    root.innerHTML = "";

    const currentUserId = getCurrentUserId(db);
    const currentUser = getUser(db, currentUserId);

    // 상단 바(없어도 동작, styles.css에서 디자인)
    const top = el("div", { class: "cc-topbar" },
      el("div", { class: "cc-brand" },
        el("div", { class: "cc-brand-title" }, "CON COST Groupware"),
        el("div", { class: "cc-brand-sub" }, "업무일지 → 승인 → 프로젝트/달력/체크리스트 자동화 (정적 MVP)")
      ),
      el("div", { class: "cc-actions" },
        el("label", { class: "cc-label" }, "사용자"),
        buildUserSelect(db, currentUserId),
        el("button", {
          class: "cc-btn cc-btn-ghost",
          onclick: () => {
            if (!confirmBox("모든 데이터를 초기화할까요? (localStorage 삭제)")) return;
            localStorage.removeItem(LS_KEY);
            toast("초기화 완료");
            location.hash = "#daily";
            boot();
          }
        }, "초기화")
      )
    );

    const nav = el("div", { class: "cc-nav" },
      ...ROUTES.map(r => el("a", {
        class: "cc-nav-item",
        href: r.hash
      }, r.title))
    );

    const main = el("div", { class: "cc-main" }, el("div", { id: "cc-view" }));

    root.appendChild(top);
    root.appendChild(nav);
    root.appendChild(main);

    // 현재 사용자 표시(안전)
    if (!currentUser) toast("사용자를 선택해 주세요.");
  }

  function buildUserSelect(db, currentUserId) {
    const sel = el("select", {
      class: "cc-select",
      onchange: (e) => {
        setCurrentUserId(e.target.value);
        toast("사용자 전환 완료");
        render();
      }
    });

    for (const u of db.users) {
      const opt = el("option", { value: u.userId }, `${u.name} (${u.role})`);
      if (u.userId === currentUserId) opt.selected = true;
      sel.appendChild(opt);
    }
    return sel;
  }

  function setActiveNav() {
    const h = location.hash || "#daily";
    $all(".cc-nav-item").forEach(a => {
      a.classList.toggle("active", a.getAttribute("href") === h);
    });
  }

  /***********************
   * 7) Views
   ***********************/
  function renderDaily(db) {
    const view = $("#cc-view");
    view.innerHTML = "";

    const currentUserId = getCurrentUserId(db);

    // Draft entries (메모리만, 제출 시 logs로 저장)
    let entries = [
      makeEmptyEntry(db)
    ];

    const dateInput = el("input", { type: "date", class: "cc-input", value: todayISODate() });

    const entriesHost = el("div", { class: "cc-stack" });

    function rerenderEntries() {
      entriesHost.innerHTML = "";
      entries.forEach((ent, idx) => {
        entriesHost.appendChild(renderEntryCard(ent, idx));
      });
    }

    function renderEntryCard(ent, idx) {
      const projectSel = buildProjectSelect(db, ent.projectId, (v) => {
        ent.projectId = v;
      });

      const categorySel = el("select", {
        class: "cc-select",
        onchange: (e) => {
          ent.category = e.target.value;
          // category 변경 시 process 초기화
          ent.process = PROCESS_MASTER[ent.category][0];
          rerenderEntries();
        }
      },
        ...Object.keys(PROCESS_MASTER).map(k => {
          const opt = el("option", { value: k }, k);
          if (k === ent.category) opt.selected = true;
          return opt;
        })
      );

      const processSel = el("select", {
        class: "cc-select",
        onchange: (e) => (ent.process = e.target.value)
      },
        ...PROCESS_MASTER[ent.category].map(p => {
          const opt = el("option", { value: p }, p);
          if (p === ent.process) opt.selected = true;
          return opt;
        })
      );

      const ratioInput = el("input", {
        type: "number",
        min: "0",
        max: "100",
        step: "1",
        class: "cc-input",
        value: ent.ratio,
        oninput: (e) => (ent.ratio = clamp(Number(e.target.value || 0), 0, 100))
      });

      const content = el("textarea", {
        class: "cc-textarea",
        placeholder: "작업내용을 입력하세요",
        rows: "4",
        oninput: (e) => (ent.content = e.target.value)
      }, ent.content || "");

      const removeBtn = el("button", {
        class: "cc-btn cc-btn-ghost",
        onclick: () => {
          if (entries.length <= 1) {
            toast("최소 1개 항목은 필요합니다.");
            return;
          }
          entries.splice(idx, 1);
          rerenderEntries();
        }
      }, "삭제");

      return el("div", { class: "cc-card" },
        el("div", { class: "cc-card-head" },
          el("div", { class: "cc-card-title" }, `업무 항목 ${idx + 1}`),
          removeBtn
        ),
        el("div", { class: "cc-grid2" },
          el("div", {},
            el("div", { class: "cc-field-label" }, "프로젝트 코드"),
            projectSel
          ),
          el("div", {},
            el("div", { class: "cc-field-label" }, "업무비율(%)"),
            ratioInput
          )
        ),
        el("div", { class: "cc-grid2" },
          el("div", {},
            el("div", { class: "cc-field-label" }, "대분류"),
            categorySel
          ),
          el("div", {},
            el("div", { class: "cc-field-label" }, "세부 공정"),
            processSel
          )
        ),
        el("div", {},
          el("div", { class: "cc-field-label" }, "작업내용"),
          content
        )
      );
    }

    const addBtn = el("button", {
      class: "cc-btn",
      onclick: () => {
        entries.push(makeEmptyEntry(db));
        rerenderEntries();
      }
    }, "+ 업무 항목 추가");

    const submitBtn = el("button", {
      class: "cc-btn cc-btn-primary",
      onclick: () => {
        const date = dateInput.value;
        if (!date) {
          toast("날짜를 선택해 주세요.");
          return;
        }

        // 검증
        for (const [i, ent] of entries.entries()) {
          if (!ent.projectId) return toast(`업무 항목 ${i + 1}: 프로젝트를 선택해 주세요.`);
          if (!ent.category) return toast(`업무 항목 ${i + 1}: 대분류를 선택해 주세요.`);
          if (!ent.process) return toast(`업무 항목 ${i + 1}: 세부 공정을 선택해 주세요.`);
          if (!ent.content || !ent.content.trim()) return toast(`업무 항목 ${i + 1}: 작업내용을 입력해 주세요.`);
          if (!(ent.ratio >= 0 && ent.ratio <= 100)) return toast(`업무 항목 ${i + 1}: 업무비율(0~100)을 입력해 주세요.`);
        }

        // 저장
        const submittedAt = nowISO();
        for (const ent of entries) {
          db.logs.push({
            logId: uuid(),
            date,
            projectId: ent.projectId,
            category: ent.category,
            process: ent.process,
            content: ent.content.trim(),
            ratio: Number(ent.ratio) || 0,
            writerId: currentUserId,
            status: "submitted",
            submittedAt,
            approvedBy: "",
            approvedAt: "",
            rejectedBy: "",
            rejectedAt: "",
            rejectReason: ""
          });
        }

        saveDB(db);
        toast("업무일지 제출 완료 (승인 대기)");
        location.hash = "#approve";
        render();
      }
    }, "제출하기");

    view.appendChild(
      el("div", { class: "cc-page" },
        el("div", { class: "cc-page-title" }, "업무일지"),
        el("div", { class: "cc-row" },
          el("div", { class: "cc-field" },
            el("div", { class: "cc-field-label" }, "날짜 선택"),
            dateInput
          ),
          el("div", { class: "cc-row-right" },
            addBtn
          )
        ),
        entriesHost,
        el("div", { class: "cc-footerbar" }, submitBtn)
      )
    );

    rerenderEntries();
  }

  function makeEmptyEntry(db) {
    const firstProject = db.projects[0]?.projectId || "";
    const defaultCategory = "구조";
    const defaultProcess = PROCESS_MASTER[defaultCategory][0];
    return {
      projectId: firstProject,
      category: defaultCategory,
      process: defaultProcess,
      ratio: 50,
      content: ""
    };
  }

  function buildProjectSelect(db, selectedId, onChange) {
    const sel = el("select", {
      class: "cc-select",
      onchange: (e) => onChange?.(e.target.value)
    });

    for (const p of db.projects) {
      const opt = el("option", { value: p.projectId }, `${p.projectCode} (${p.projectName})`);
      if (p.projectId === selectedId) opt.selected = true;
      sel.appendChild(opt);
    }
    return sel;
  }

  function renderApprove(db) {
    const view = $("#cc-view");
    view.innerHTML = "";

    const currentUserId = getCurrentUserId(db);

    const submitted = db.logs
      .filter(l => l.status === "submitted")
      .sort((a, b) => (a.submittedAt || "").localeCompare(b.submittedAt || ""));

    const rejected = db.logs
      .filter(l => l.status === "rejected")
      .slice(-20)
      .reverse();

    function groupKey(l) {
      // 같은 작성자/날짜로 묶어서 승인 처리 편의
      return `${l.writerId}__${l.date}`;
    }

    const groups = new Map();
    for (const l of submitted) {
      const k = groupKey(l);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(l);
    }

    const groupCards = [];
    for (const [k, arr] of groups.entries()) {
      const writer = getUser(db, arr[0].writerId);
      const date = arr[0].date;

      const list = el("div", { class: "cc-list" },
        ...arr.map(l => {
          const proj = getProject(db, l.projectId);
          return el("div", { class: "cc-list-item" },
            el("div", { class: "cc-list-title" }, `${proj?.projectName || "프로젝트"} · ${l.category} / ${l.process} · ${l.ratio}%`),
            el("div", { class: "cc-list-sub" }, l.content)
          );
        })
      );

      const approveBtn = el("button", {
        class: "cc-btn cc-btn-primary",
        onclick: () => {
          const ok = confirmBox(`${writer?.name || "작성자"} (${date}) 묶음 ${arr.length}건을 승인할까요?`);
          if (!ok) return;

          const t = nowISO();
          for (const l of arr) {
            l.status = "approved";
            l.approvedBy = currentUserId;
            l.approvedAt = t;
          }
          saveDB(db);
          toast("승인 완료");
          render();
        }
      }, "승인");

      const rejectBtn = el("button", {
        class: "cc-btn cc-btn-ghost",
        onclick: () => {
          const reason = prompt("반려 사유를 입력하세요 (선택)");
          const ok = confirmBox(`${writer?.name || "작성자"} (${date}) 묶음 ${arr.length}건을 반려할까요?`);
          if (!ok) return;

          const t = nowISO();
          for (const l of arr) {
            l.status = "rejected";
            l.rejectedBy = currentUserId;
            l.rejectedAt = t;
            l.rejectReason = reason || "";
          }
          saveDB(db);
          toast("반려 처리 완료");
          render();
        }
      }, "반려");

      groupCards.push(
        el("div", { class: "cc-card" },
          el("div", { class: "cc-card-head" },
            el("div", { class: "cc-card-title" }, `승인 대기: ${writer?.name || "작성자"} · ${date} (${arr.length}건)`),
            el("div", { class: "cc-row" }, rejectBtn, approveBtn)
          ),
          list
        )
      );
    }

    const rejectedBox = el("div", { class: "cc-card" },
      el("div", { class: "cc-card-head" },
        el("div", { class: "cc-card-title" }, "최근 반려 내역(최대 20건)")
      ),
      rejected.length
        ? el("div", { class: "cc-list" },
          ...rejected.map(l => {
            const proj = getProject(db, l.projectId);
            const writer = getUser(db, l.writerId);
            const by = getUser(db, l.rejectedBy);
            return el("div", { class: "cc-list-item" },
              el("div", { class: "cc-list-title" },
                `${l.date} · ${proj?.projectName || ""} · ${writer?.name || ""} · ${l.category}/${l.process}`
              ),
              el("div", { class: "cc-list-sub" },
                `반려자: ${by?.name || "-"} · ${l.rejectedAt || "-"}${l.rejectReason ? ` · 사유: ${l.rejectReason}` : ""}`
              )
            );
          })
        )
        : el("div", { class: "cc-empty" }, "반려 내역이 없습니다.")
    );

    view.appendChild(
      el("div", { class: "cc-page" },
        el("div", { class: "cc-page-title" }, "승인"),
        groupCards.length
          ? el("div", { class: "cc-stack" }, ...groupCards)
          : el("div", { class: "cc-empty" }, "승인 대기 업무일지가 없습니다."),
        el("div", { style: "height:12px;" }),
        rejectedBox
      )
    );
  }

  function renderDashboard(db) {
    const view = $("#cc-view");
    view.innerHTML = "";

    const stats = computeProjectListStats(db);
    const selectedId = (location.hash.split("?p=")[1] || stats[0]?.projectId || "").trim();
    let selectedProjectId = db.projects.some(p => p.projectId === selectedId) ? selectedId : (stats[0]?.projectId || "");

    function selectProject(pid) {
      selectedProjectId = pid;
      // URL에 반영(선택)
      location.hash = `#dashboard?p=${pid}`;
      render();
    }

    const listLeft = el("div", { class: "cc-card" },
      el("div", { class: "cc-card-head" },
        el("div", { class: "cc-card-title" }, "Project List")
      ),
      stats.length ? el("div", { class: "cc-list" },
        ...stats.map(s => {
          const active = s.projectId === selectedProjectId;
          const barPct = clamp((s.days / Math.max(1, Math.max(...stats.map(x => x.days), 1))) * 100, 0, 100);

          return el("button", {
            class: `cc-list-btn ${active ? "active" : ""}`,
            onclick: () => selectProject(s.projectId)
          },
            el("div", { class: "cc-list-title" }, `${s.projectName} (${s.days}일 / ${s.headcount}명)`),
            el("div", { class: "cc-bar" },
              el("div", { class: "cc-bar-fill", style: `width:${barPct.toFixed(0)}%` })
            ),
            el("div", { class: "cc-list-sub" }, `승인 건수: ${s.approvedEntries}`)
          );
        })
      ) : el("div", { class: "cc-empty" }, "프로젝트가 없습니다.")
    );

    const breakdown = computeProjectProcessBreakdown(db, selectedProjectId);
    const breakdownRows = Object.entries(breakdown)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);

    const selProj = getProject(db, selectedProjectId);
    const days = computeProjectDays(db, selectedProjectId);
    const hc = computeProjectHeadcount(db, selectedProjectId);

    const rightTop = el("div", { class: "cc-card" },
      el("div", { class: "cc-card-head" },
        el("div", { class: "cc-card-title" }, `Selected Project: ${selProj?.projectName || "-"}`),
        el("div", { class: "cc-badge" }, selProj?.projectCode || "")
      ),
      breakdownRows.length
        ? el("div", { class: "cc-list" },
          ...breakdownRows.map(([k, v]) => {
            const [cat, proc] = k.split("||");
            const pct = clamp((v / Math.max(1, breakdownRows[0][1])) * 100, 0, 100);
            return el("div", { class: "cc-list-item" },
              el("div", { class: "cc-list-title" }, `${cat} · ${proc} (${v}%)`),
              el("div", { class: "cc-bar" },
                el("div", { class: "cc-bar-fill", style: `width:${pct.toFixed(0)}%` })
              )
            );
          })
        )
        : el("div", { class: "cc-empty" }, "승인된 업무일지가 없습니다.")
    );

    const rightBottom = el("div", { class: "cc-grid2" },
      el("div", { class: "cc-card" },
        el("div", { class: "cc-card-head" },
          el("div", { class: "cc-card-title" }, "총 투입 인원")
        ),
        el("div", { class: "cc-big" }, `${hc}명`)
      ),
      el("div", { class: "cc-card" },
        el("div", { class: "cc-card-head" },
          el("div", { class: "cc-card-title" }, "총 소요일수(카운트)")
        ),
        el("div", { class: "cc-big" }, `${days}일`)
      )
    );

    view.appendChild(
      el("div", { class: "cc-page" },
        el("div", { class: "cc-page-title" }, "프로젝트별 인원대비 소요시간 대시보드"),
        el("div", { class: "cc-grid-dashboard" },
          listLeft,
          el("div", { class: "cc-stack" }, rightTop, rightBottom)
        )
      )
    );
  }

  function renderCalendar(db) {
    const view = $("#cc-view");
    view.innerHTML = "";

    const approved = getApprovedLogs(db);

    // 필터
    let modeMonths = 1; // 1 or 3
    let filterCategory = "전체"; // 전체/구조/마감

    const modeToggle = el("select", {
      class: "cc-select",
      onchange: (e) => {
        modeMonths = Number(e.target.value);
        rerender();
      }
    },
      el("option", { value: "1" }, "1달"),
      el("option", { value: "3" }, "3달")
    );

    const catToggle = el("select", {
      class: "cc-select",
      onchange: (e) => {
        filterCategory = e.target.value;
        rerender();
      }
    },
      el("option", { value: "전체" }, "전체"),
      el("option", { value: "구조" }, "구조"),
      el("option", { value: "마감" }, "마감")
    );

    // 달력 기준 월(현재)
    let base = new Date();
    base.setDate(1);

    const monthLabel = el("div", { class: "cc-month-label" });

    const prevBtn = el("button", { class: "cc-btn cc-btn-ghost", onclick: () => { base.setMonth(base.getMonth() - 1); rerender(); } }, "◀");
    const nextBtn = el("button", { class: "cc-btn cc-btn-ghost", onclick: () => { base.setMonth(base.getMonth() + 1); rerender(); } }, "▶");

    const calendarHost = el("div", { class: "cc-calendar-host" });

    // 체크리스트 영역
    const checklistHost = el("div", { class: "cc-card" });

    function rerender() {
      // label
      monthLabel.textContent = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")} (표시: ${modeMonths}달)`;

      // calendar grid
      calendarHost.innerHTML = "";
      const monthsToRender = modeMonths === 3 ? 3 : 1;
      for (let i = 0; i < monthsToRender; i++) {
        const d = new Date(base);
        d.setMonth(base.getMonth() + i);
        calendarHost.appendChild(renderOneMonth(d));
      }

      // checklist
      renderChecklistPanel();
    }

    function renderOneMonth(monthDate) {
      const y = monthDate.getFullYear();
      const m = monthDate.getMonth(); // 0-based

      const first = new Date(y, m, 1);
      const last = new Date(y, m + 1, 0);
      const startDow = first.getDay(); // 0 sun
      const daysInMonth = last.getDate();

      const title = el("div", { class: "cc-cal-title" }, `${y}-${String(m + 1).padStart(2, "0")}`);

      const dowRow = el("div", { class: "cc-cal-dow" },
        ...["일", "월", "화", "수", "목", "금", "토"].map(s => el("div", { class: "cc-cal-dow-cell" }, s))
      );

      const grid = el("div", { class: "cc-cal-grid" });

      // 빈칸
      for (let i = 0; i < startDow; i++) {
        grid.appendChild(el("div", { class: "cc-cal-cell empty" }));
      }

      for (let day = 1; day <= daysInMonth; day++) {
        const dateISO = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const items = getCalendarItemsForDate(dateISO);

        const cell = el("div", { class: "cc-cal-cell" },
          el("div", { class: "cc-cal-day" }, String(day)),
          items.length
            ? el("div", { class: "cc-cal-items" },
              ...items.slice(0, 4).map(t => el("div", { class: "cc-chip" }, t)),
              items.length > 4 ? el("div", { class: "cc-more" }, `+${items.length - 4}`) : null
            )
            : null
        );

        cell.addEventListener("click", () => openDateDetail(dateISO));
        grid.appendChild(cell);
      }

      return el("div", { class: "cc-cal-month" }, title, dowRow, grid);
    }

    function getCalendarItemsForDate(dateISO) {
      // 승인된 로그에서 해당 날짜에 수행된 프로젝트 자동 기입
      const list = approved.filter(l => l.date === dateISO);
      const filtered = filterCategory === "전체" ? list : list.filter(l => l.category === filterCategory);

      // 프로젝트명 unique 표시
      const set = new Set();
      for (const l of filtered) {
        const p = getProject(db, l.projectId);
        if (!p) continue;
        set.add(p.projectName);
      }
      return Array.from(set);
    }

    function openDateDetail(dateISO) {
      const list = approved.filter(l => l.date === dateISO);
      const filtered = filterCategory === "전체" ? list : list.filter(l => l.category === filterCategory);

      const modal = buildModal(`상세: ${dateISO}`, () => modal.remove());
      const body = $(".cc-modal-body", modal);

      if (!filtered.length) {
        body.appendChild(el("div", { class: "cc-empty" }, "승인된 업무일지가 없습니다."));
      } else {
        // 프로젝트별로 묶기
        const byProj = new Map();
        for (const l of filtered) {
          if (!byProj.has(l.projectId)) byProj.set(l.projectId, []);
          byProj.get(l.projectId).push(l);
        }

        for (const [pid, logs] of byProj.entries()) {
          const p = getProject(db, pid);
          body.appendChild(
            el("div", { class: "cc-card" },
              el("div", { class: "cc-card-head" },
                el("div", { class: "cc-card-title" }, `${p?.projectName || "프로젝트"} (${logs.length}건)`),
                el("div", { class: "cc-badge" }, p?.projectCode || "")
              ),
              el("div", { class: "cc-list" },
                ...logs.map(l => {
                  const writer = getUser(db, l.writerId);
                  const approver = getUser(db, l.approvedBy);
                  return el("div", { class: "cc-list-item" },
                    el("div", { class: "cc-list-title" },
                      `${l.category}/${l.process} · ${l.ratio}% · ${writer?.name || ""}`
                    ),
                    el("div", { class: "cc-list-sub" }, l.content),
                    el("div", { class: "cc-list-sub" },
                      `승인: ${approver?.name || "-"} · ${l.approvedAt || "-"}`
                    )
                  );
                })
              )
            )
          );
        }
      }

      document.body.appendChild(modal);
    }

    function renderChecklistPanel() {
      checklistHost.innerHTML = "";

      let selectedProjectId = db.projects[0]?.projectId || "";

      const projectSel = buildProjectSelect(db, selectedProjectId, (v) => {
        selectedProjectId = v;
        drawList();
      });

      const titleInput = el("input", { class: "cc-input", placeholder: "체크리스트 제목(예: H10 → H13 변경)" });
      const descInput = el("textarea", { class: "cc-textarea", rows: "3", placeholder: "추가 설명(선택)" });

      const assigneeSel = el("select", { class: "cc-select" },
        ...db.users
          .filter(u => u.role === "staff" || u.role === "leader")
          .map(u => el("option", { value: u.userId }, `${u.name} (${u.role})`))
      );

      const imageInput = el("input", { type: "file", accept: "image/*", class: "cc-input" });

      const addBtn = el("button", {
        class: "cc-btn cc-btn-primary",
        onclick: async () => {
          const t = titleInput.value.trim();
          if (!t) return toast("체크리스트 제목을 입력해 주세요.");

          const currentUserId = getCurrentUserId(db);
          const assigneeId = assigneeSel.value;

          let imageDataUrl = "";
          const file = imageInput.files?.[0];
          if (file) {
            imageDataUrl = await fileToDataURL(file);
          }

          db.checklists.push({
            itemId: uuid(),
            projectId: selectedProjectId,
            title: t,
            description: descInput.value.trim(),
            imageDataUrl,
            writerId: currentUserId,
            assigneeId,
            status: "open",
            createdAt: nowISO(),
            doneBy: "",
            doneAt: ""
          });

          saveDB(db);
          titleInput.value = "";
          descInput.value = "";
          imageInput.value = "";
          toast("체크리스트 항목 추가 완료");
          drawList();
        }
      }, "새 항목 추가");

      const listHost = el("div", { class: "cc-list" });

      function drawList() {
        listHost.innerHTML = "";
        const items = db.checklists
          .filter(i => i.projectId === selectedProjectId)
          .slice()
          .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

        if (!items.length) {
          listHost.appendChild(el("div", { class: "cc-empty" }, "체크리스트 항목이 없습니다."));
          return;
        }

        for (const it of items) {
          const writer = getUser(db, it.writerId);
          const assignee = getUser(db, it.assigneeId);
          const doneBy = it.doneBy ? getUser(db, it.doneBy) : null;

          const titleLine = el("div", {
            class: `cc-list-title ${it.status === "done" ? "done" : ""}`
          }, it.title);

          const meta = el("div", { class: "cc-list-sub" },
            `작성: ${writer?.name || "-"} · 담당: ${assignee?.name || "-"} · ${it.createdAt || ""}`
          );

          const doneMeta = it.status === "done"
            ? el("div", { class: "cc-list-sub done-meta" },
              `완료: ${doneBy?.name || "-"} · ${it.doneAt || "-"}`
            )
            : null;

          const desc = it.description ? el("div", { class: "cc-list-sub" }, it.description) : null;

          const checkbox = el("input", {
            type: "checkbox",
            checked: it.status === "done",
            onchange: (e) => {
              const checked = e.target.checked;
              if (checked) {
                it.status = "done";
                it.doneBy = getCurrentUserId(db);
                it.doneAt = nowISO();
              } else {
                it.status = "open";
                it.doneBy = "";
                it.doneAt = "";
              }
              saveDB(db);
              drawList();
            }
          });

          const viewImgBtn = it.imageDataUrl
            ? el("button", {
              class: "cc-btn cc-btn-ghost",
              onclick: () => {
                const modal = buildModal("이미지 보기", () => modal.remove());
                const body = $(".cc-modal-body", modal);
                body.appendChild(el("img", { src: it.imageDataUrl, style: "max-width:100%;border-radius:12px;display:block;" }));
                document.body.appendChild(modal);
              }
            }, "보기")
            : el("span", { class: "cc-muted" }, "이미지 없음");

          const delBtn = el("button", {
            class: "cc-btn cc-btn-ghost",
            onclick: () => {
              if (!confirmBox("이 항목을 삭제할까요?")) return;
              db.checklists = db.checklists.filter(x => x.itemId !== it.itemId);
              saveDB(db);
              toast("삭제 완료");
              drawList();
            }
          }, "삭제");

          const row = el("div", { class: `cc-list-item ${it.status === "done" ? "done-row" : ""}` },
            el("div", { class: "cc-list-left" }, checkbox),
            el("div", { class: "cc-list-mid" }, titleLine, meta, doneMeta, desc),
            el("div", { class: "cc-list-right" }, viewImgBtn, delBtn)
          );

          listHost.appendChild(row);
        }
      }

      checklistHost.appendChild(
        el("div", { class: "cc-card-head" },
          el("div", { class: "cc-card-title" }, "프로젝트별 체크리스트"),
          el("div", { class: "cc-row" }, projectSel)
        )
      );

      checklistHost.appendChild(
        el("div", { class: "cc-grid2" },
          el("div", {},
            el("div", { class: "cc-field-label" }, "제목"),
            titleInput
          ),
          el("div", {},
            el("div", { class: "cc-field-label" }, "담당자"),
            assigneeSel
          )
        )
      );

      checklistHost.appendChild(
        el("div", {},
          el("div", { class: "cc-field-label" }, "설명(선택)"),
          descInput
        )
      );

      checklistHost.appendChild(
        el("div", { class: "cc-grid2" },
          el("div", {},
            el("div", { class: "cc-field-label" }, "이미지 첨부(선택)"),
            imageInput
          ),
          el("div", { style: "display:flex;align-items:flex-end;gap:8px;justify-content:flex-end;" },
            addBtn
          )
        )
      );

      checklistHost.appendChild(el("div", { style: "height:10px;" }));
      checklistHost.appendChild(listHost);

      drawList();
    }

    // 상단
    view.appendChild(
      el("div", { class: "cc-page" },
        el("div", { class: "cc-page-title" }, "종합 공정관리 달력"),
        el("div", { class: "cc-row" },
          el("div", { class: "cc-row" },
            prevBtn,
            monthLabel,
            nextBtn
          ),
          el("div", { class: "cc-row" },
            el("div", { class: "cc-field-inline" }, el("span", { class: "cc-muted" }, "기간"), modeToggle),
            el("div", { class: "cc-field-inline" }, el("span", { class: "cc-muted" }, "필터"), catToggle)
          )
        ),
        calendarHost,
        el("div", { style: "height:14px;" }),
        checklistHost
      )
    );

    rerender();
  }

  /***********************
   * 8) Modal / File
   ***********************/
  function buildModal(title, onClose) {
    const overlay = el("div", { class: "cc-modal-overlay" });
    const box = el("div", { class: "cc-modal" },
      el("div", { class: "cc-modal-head" },
        el("div", { class: "cc-modal-title" }, title),
        el("button", { class: "cc-btn cc-btn-ghost", onclick: onClose }, "닫기")
      ),
      el("div", { class: "cc-modal-body" })
    );
    overlay.appendChild(box);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) onClose();
    });

    return overlay;
  }

  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ""));
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  /***********************
   * 9) Render / Boot
   ***********************/
  function render() {
    const db = ensureDB();
    renderShell(db);
    setActiveNav();

    const h = location.hash || "#daily";
    const viewHash = h.split("?")[0];

    if (viewHash === "#daily") renderDaily(db);
    else if (viewHash === "#approve") renderApprove(db);
    else if (viewHash === "#dashboard") renderDashboard(db);
    else if (viewHash === "#calendar") renderCalendar(db);
    else {
      location.hash = "#daily";
      renderDaily(db);
    }
  }

  function boot() {
    ensureDB();
    if (!location.hash) location.hash = "#daily";
    render();
  }

  window.addEventListener("hashchange", render);
  window.addEventListener("storage", (e) => {
    if (e.key === LS_KEY) render();
  });

  // 첫 실행
  boot();

})();
