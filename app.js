/* app.js (CON COST Groupware MVP v0.2)
   - index.html: topbar/sidebar/#view 라우팅 구조 사용
   - routes: #/log, #/approve, #/dashboard, #/calendar, #/checklist
   - 저장소: localStorage(정적 GitHub MVP)
*/

(() => {
  "use strict";

  /***********************
   * 공정 마스터(고정)
   ***********************/
  const PROCESS_MASTER = {
    "구조": ["기초","기둥","보","슬라브","벽/옹벽","철골","접합/도장","구조검토/샵도"],
    "마감": ["내화(뿜칠/도장)","단열/방수","창호","내부마감(석고/도장/타일 등)","외부마감","MEP 협업(간섭/수정)","마감검토/펀치(하자/잔손)"]
  };

  /***********************
   * localStorage DB
   ***********************/
  const LS_KEY = "CONCOST_GROUPWARE_DB_V02";
  const LS_USER = "CONCOST_GROUPWARE_USER_V02";

  function safeParse(s, fallback){ try { return JSON.parse(s); } catch { return fallback; } }

  function uuid(){
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (crypto?.getRandomValues?.(new Uint8Array(1))?.[0] ?? Math.random() * 256) & 15;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function pad2(n){ return String(n).padStart(2,"0"); }

  function nowISO(){
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function todayISO(){
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  }

  function clamp(n,a,b){ return Math.min(b, Math.max(a,n)); }

  function loadDB(){
    const raw = localStorage.getItem(LS_KEY);
    return raw ? safeParse(raw, null) : null;
  }

  function saveDB(db){
    localStorage.setItem(LS_KEY, JSON.stringify(db));
  }

  function seedDB(){
    const db = {
      meta: { version:"0.2", createdAt: nowISO() },
      users: [
        { userId:"u_staff_1", name:"작업자A", role:"staff" },
        { userId:"u_staff_2", name:"작업자B", role:"staff" },
        { userId:"u_leader",  name:"팀장", role:"leader" },
        { userId:"u_manager", name:"실장", role:"manager" },
        { userId:"u_director",name:"본부장", role:"director" },
        { userId:"u_vp",      name:"상무", role:"vp" },
        { userId:"u_ceo",     name:"대표", role:"ceo" }
      ],
      projects: [
        { projectId:"p_a123", projectCode:"Project A-123", projectName:"프로젝트 A", startDate:"2024-05-01", endDate:"" },
        { projectId:"p_b234", projectCode:"Project B-234", projectName:"프로젝트 B", startDate:"2024-05-10", endDate:"" },
        { projectId:"p_c345", projectCode:"Project C-345", projectName:"프로젝트 C", startDate:"2024-05-15", endDate:"" }
      ],
      logs: [],
      checklists: []
    };
    saveDB(db);
    return db;
  }

  function ensureDB(){
    return loadDB() || seedDB();
  }

  function getUserId(db){
    const saved = localStorage.getItem(LS_USER);
    if (saved && db.users.some(u => u.userId === saved)) return saved;
    localStorage.setItem(LS_USER, db.users[0].userId);
    return db.users[0].userId;
  }

  function setUserId(uid){ localStorage.setItem(LS_USER, uid); }

  function userById(db, id){ return db.users.find(u => u.userId === id) || null; }
  function projById(db, id){ return db.projects.find(p => p.projectId === id) || null; }

  /***********************
   * DOM helpers
   ***********************/
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  function el(tag, attrs={}, ...children){
    const n = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs||{})){
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else if (v != null && v !== false) n.setAttribute(k, String(v));
    }
    for (const c of children){
      if (c == null) continue;
      if (typeof c === "string") n.appendChild(document.createTextNode(c));
      else n.appendChild(c);
    }
    return n;
  }

  function toast(msg){
    const host = $("#toast");
    const t = el("div", { class:"t" }, msg);
    host.appendChild(t);
    setTimeout(() => t.remove(), 2300);
  }

  function modalOpen(title, bodyNode, footNode){
    $("#modalTitle").textContent = title || "";
    const body = $("#modalBody");
    const foot = $("#modalFoot");
    body.innerHTML = "";
    foot.innerHTML = "";
    if (bodyNode) body.appendChild(bodyNode);
    if (footNode) foot.appendChild(footNode);
    $("#modalBackdrop").classList.remove("hidden");
  }

  function modalClose(){
    $("#modalBackdrop").classList.add("hidden");
  }

  async function fileToDataURL(file){
    return new Promise((resolve,reject)=>{
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result||""));
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  /***********************
   * Route
   ***********************/
  const ROUTE_META = {
    "/log":       "업무일지",
    "/approve":   "승인",
    "/dashboard": "프로젝트별 인원대비 소요시간",
    "/calendar":  "종합 공정관리",
    "/checklist": "프로젝트별 체크리스트"
  };

  function getRoute(){
    const h = location.hash || "#/log";
    const m = h.match(/^#(\/[^?]*)/);
    return m ? m[1] : "/log";
  }

  function setActiveNav(){
    const route = getRoute();
    $$(".nav-item").forEach(a => {
      const href = a.getAttribute("href") || "";
      const is = href === `#${route}`;
      a.classList.toggle("active", is);
    });
    $("#routeTitle").textContent = ROUTE_META[route] || "";
  }

  /***********************
   * Aggregations
   ***********************/
  function pendingCount(db){
    return db.logs.filter(l => l.status === "submitted").length;
  }

  function computeProjectDays(db, projectId){
    // 승인된 업무일지에서 (projectId + date) unique count
    const set = new Set();
    for (const l of db.logs){
      if (l.status !== "approved") continue;
      if (l.projectId !== projectId) continue;
      set.add(`${l.projectId}__${l.date}`);
    }
    return set.size;
  }

  function computeProjectHeadcount(db, projectId){
    const set = new Set();
    for (const l of db.logs){
      if (l.status !== "approved") continue;
      if (l.projectId !== projectId) continue;
      set.add(l.writerId);
    }
    return set.size;
  }

  function computeProjectBreakdown(db, projectId){
    const map = {};
    for (const l of db.logs){
      if (l.status !== "approved") continue;
      if (l.projectId !== projectId) continue;
      const k = `${l.category}||${l.process}`;
      map[k] = (map[k]||0) + (Number(l.ratio)||0);
    }
    return map;
  }

  /***********************
   * Controls Builders
   ***********************/
  function buildProjectSelect(db, value, onChange){
    const s = el("select", { class:"select", onchange:(e)=>onChange?.(e.target.value) });
    for (const p of db.projects){
      const o = el("option", { value:p.projectId }, `${p.projectCode} (${p.projectName})`);
      if (p.projectId === value) o.selected = true;
      s.appendChild(o);
    }
    return s;
  }

  function buildCategorySelect(value, onChange){
    const s = el("select", { class:"select", onchange:(e)=>onChange?.(e.target.value) },
      el("option", { value:"구조" }, "구조"),
      el("option", { value:"마감" }, "마감")
    );
    s.value = value;
    return s;
  }

  function buildProcessSelect(category, value, onChange){
    const s = el("select", { class:"select", onchange:(e)=>onChange?.(e.target.value) });
    for (const p of PROCESS_MASTER[category]){
      const o = el("option", { value:p }, p);
      if (p === value) o.selected = true;
      s.appendChild(o);
    }
    return s;
  }

  /***********************
   * View: 업무일지 (#/log)
   ***********************/
  function viewLog(db){
    const view = $("#view");
    view.innerHTML = "";

    const uid = getUserId(db);

    const dateInput = el("input", { class:"input", type:"date", value: todayISO() });

    let entries = [ makeEmptyEntry(db) ];

    const entriesHost = el("div", { class:"stack" });

    function rerenderEntries(){
      entriesHost.innerHTML = "";
      entries.forEach((ent, idx) => {
        entriesHost.appendChild(renderEntryCard(ent, idx));
      });
    }

    function renderEntryCard(ent, idx){
      const projectSel = buildProjectSelect(db, ent.projectId, v => ent.projectId = v);

      const ratio = el("input", {
        class:"input",
        type:"number", min:"0", max:"100", step:"1",
        value: ent.ratio,
        oninput:(e)=> ent.ratio = clamp(Number(e.target.value||0),0,100)
      });

      const catSel = buildCategorySelect(ent.category, (v)=>{
        ent.category = v;
        ent.process = PROCESS_MASTER[v][0];
        rerenderEntries();
      });

      const procSel = buildProcessSelect(ent.category, ent.process, (v)=> ent.process = v);

      const content = el("textarea", {
        class:"textarea",
        rows:"4",
        placeholder:"작업내용을 입력하세요",
        oninput:(e)=> ent.content = e.target.value
      }, ent.content || "");

      const delBtn = el("button", {
        class:"btn ghost",
        onclick:()=>{
          if (entries.length <= 1) return toast("최소 1개 항목은 필요합니다.");
          entries.splice(idx,1);
          rerenderEntries();
        }
      }, "삭제");

      return el("div", { class:"card" },
        el("div", { class:"card-head" },
          el("div", { class:"card-title" }, `업무 항목 ${idx+1}`),
          delBtn
        ),
        el("div", { class:"grid2" },
          el("div", {},
            el("div", { class:"muted", style:"font-weight:1000;font-size:12px;margin:2px 0 6px;" }, "프로젝트 코드"),
            projectSel
          ),
          el("div", {},
            el("div", { class:"muted", style:"font-weight:1000;font-size:12px;margin:2px 0 6px;" }, "업무비율(%)"),
            ratio
          )
        ),
        el("div", { class:"grid2" },
          el("div", {},
            el("div", { class:"muted", style:"font-weight:1000;font-size:12px;margin:2px 0 6px;" }, "대분류"),
            catSel
          ),
          el("div", {},
            el("div", { class:"muted", style:"font-weight:1000;font-size:12px;margin:2px 0 6px;" }, "세부 공정"),
            procSel
          )
        ),
        el("div", {},
          el("div", { class:"muted", style:"font-weight:1000;font-size:12px;margin:2px 0 6px;" }, "작업내용"),
          content
        )
      );
    }

    const addBtn = el("button", { class:"btn", onclick:()=>{ entries.push(makeEmptyEntry(db)); rerenderEntries(); } }, "+ 업무 항목 추가");

    const submitBtn = el("button", {
      class:"btn primary",
      onclick:()=>{
        const date = dateInput.value;
        if (!date) return toast("날짜를 선택해 주세요.");

        for (let i=0;i<entries.length;i++){
          const e = entries[i];
          if (!e.projectId) return toast(`업무 항목 ${i+1}: 프로젝트를 선택해 주세요.`);
          if (!e.content || !e.content.trim()) return toast(`업무 항목 ${i+1}: 작업내용을 입력해 주세요.`);
          if (!(e.ratio>=0 && e.ratio<=100)) return toast(`업무 항목 ${i+1}: 업무비율(0~100)을 입력해 주세요.`);
        }

        const submittedAt = nowISO();
        for (const e of entries){
          db.logs.push({
            logId: uuid(),
            date,
            projectId: e.projectId,
            category: e.category,
            process: e.process,
            content: e.content.trim(),
            ratio: Number(e.ratio)||0,
            writerId: uid,
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
        location.hash = "#/approve";
        render();
      }
    }, "제출하기");

    view.appendChild(
      el("div", { class:"stack" },
        el("div", { class:"card" },
          el("div", { class:"card-head" },
            el("div", { class:"card-title" }, "업무일지 작성"),
            addBtn
          ),
          el("div", { class:"row", style:"margin-bottom:10px;" },
            el("div", { class:"muted", style:"font-weight:1000;font-size:12px;" }, "날짜 선택"),
            dateInput
          ),
          entriesHost,
          el("div", { class:"row", style:"justify-content:flex-end;margin-top:12px;" }, submitBtn)
        )
      )
    );

    rerenderEntries();
  }

  function makeEmptyEntry(db){
    const p = db.projects[0]?.projectId || "";
    return { projectId: p, category:"구조", process: PROCESS_MASTER["구조"][0], ratio:50, content:"" };
  }

  /***********************
   * View: 승인 (#/approve)
   ***********************/
  function viewApprove(db){
    const view = $("#view");
    view.innerHTML = "";

    const uid = getUserId(db);
    const submitted = db.logs.filter(l => l.status === "submitted")
      .sort((a,b)=>(a.submittedAt||"").localeCompare(b.submittedAt||""));

    // 작성자+날짜로 묶기
    const groups = new Map();
    for (const l of submitted){
      const k = `${l.writerId}__${l.date}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(l);
    }

    const cards = [];

    for (const arr of groups.values()){
      const writer = userById(db, arr[0].writerId);
      const date = arr[0].date;

      const list = el("div", { class:"list" },
        ...arr.map(l=>{
          const p = projById(db, l.projectId);
          return el("div", { class:"list-item" },
            el("div", { class:"list-title" }, `${p?.projectName||"프로젝트"} · ${l.category}/${l.process} · ${l.ratio}%`),
            el("div", { class:"list-sub" }, l.content)
          );
        })
      );

      const approveBtn = el("button", {
        class:"btn primary",
        onclick:()=>{
          if (!confirm(`${writer?.name||"작성자"} · ${date} (${arr.length}건) 승인할까요?`)) return;
          const t = nowISO();
          for (const l of arr){
            l.status = "approved";
            l.approvedBy = uid;
            l.approvedAt = t;
          }
          saveDB(db);
          toast("승인 완료");
          render();
        }
      }, "승인");

      const rejectBtn = el("button", {
        class:"btn ghost",
        onclick:()=>{
          const reason = prompt("반려 사유(선택)") || "";
          if (!confirm(`${writer?.name||"작성자"} · ${date} (${arr.length}건) 반려할까요?`)) return;
          const t = nowISO();
          for (const l of arr){
            l.status = "rejected";
            l.rejectedBy = uid;
            l.rejectedAt = t;
            l.rejectReason = reason;
          }
          saveDB(db);
          toast("반려 처리 완료");
          render();
        }
      }, "반려");

      cards.push(
        el("div", { class:"card" },
          el("div", { class:"card-head" },
            el("div", { class:"card-title" }, `승인 대기: ${writer?.name||"작성자"} · ${date} (${arr.length}건)`),
            el("div", { class:"row" }, rejectBtn, approveBtn)
          ),
          list
        )
      );
    }

    view.appendChild(
      el("div", { class:"stack" },
        cards.length ? el("div", { class:"stack" }, ...cards)
          : el("div", { class:"empty" }, "승인 대기 업무일지가 없습니다.")
      )
    );
  }

  /***********************
   * View: 대시보드 (#/dashboard)
   ***********************/
  function viewDashboard(db){
    const view = $("#view");
    view.innerHTML = "";

    const stats = db.projects.map(p=>{
      const days = computeProjectDays(db, p.projectId);
      const headcount = computeProjectHeadcount(db, p.projectId);
      const approvedEntries = db.logs.filter(l=>l.status==="approved" && l.projectId===p.projectId).length;
      return { ...p, days, headcount, approvedEntries };
    });

    let selected = stats[0]?.projectId || "";

    const left = el("div", { class:"card" },
      el("div", { class:"card-head" }, el("div", { class:"card-title" }, "Project List")),
      stats.length ? el("div", { class:"list" },
        ...stats.map(s=>{
          const btn = el("button", { class:"btn ghost", style:"width:100%;text-align:left;border-radius:14px;border:1px solid rgba(0,0,0,.06);background:#fff;" }, "");
          btn.addEventListener("click", ()=>{ selected = s.projectId; render(); });

          const maxDays = Math.max(1, ...stats.map(x=>x.days));
          const pct = clamp((s.days/maxDays)*100,0,100);

          btn.innerHTML = `
            <div style="font-weight:1100;font-size:13px;">${s.projectName} (${s.days}일 / ${s.headcount}명)</div>
            <div class="bar"><div style="width:${pct.toFixed(0)}%"></div></div>
            <div style="margin-top:6px;color:var(--muted);font-size:12px;">승인 건수: ${s.approvedEntries}</div>
          `;

          return btn;
        })
      ) : el("div", { class:"empty" }, "프로젝트가 없습니다.")
    );

    // URL 선택 지원
    const h = location.hash;
    const m = h.match(/[?&]p=([^&]+)/);
    if (m && db.projects.some(p=>p.projectId===decodeURIComponent(m[1]))) selected = decodeURIComponent(m[1]);

    const sp = projById(db, selected) || db.projects[0];
    const days = computeProjectDays(db, sp?.projectId);
    const hc = computeProjectHeadcount(db, sp?.projectId);

    const breakdown = computeProjectBreakdown(db, sp?.projectId);
    const rows = Object.entries(breakdown).sort((a,b)=>b[1]-a[1]).slice(0, 12);

    const rightTop = el("div", { class:"card" },
      el("div", { class:"card-head" },
        el("div", { class:"card-title" }, `Selected Project: ${sp?.projectName||"-"}`),
        el("div", { class:"badge" }, sp?.projectCode || "")
      ),
      rows.length ? el("div", { class:"list" },
        ...rows.map(([k,v])=>{
          const [cat, proc] = k.split("||");
          const top = rows[0][1] || 1;
          const pct = clamp((v/top)*100,0,100);
          return el("div", { class:"list-item" },
            el("div", { class:"list-title" }, `${cat} · ${proc} (${v}%)`),
            el("div", { class:"bar" }, el("div", { style:`width:${pct.toFixed(0)}%` }))
          );
        })
      ) : el("div", { class:"empty" }, "승인된 업무일지가 없습니다.")
    );

    const rightBottom = el("div", { class:"grid2" },
      el("div", { class:"card" },
        el("div", { class:"card-head" }, el("div", { class:"card-title" }, "총 투입 인원")),
        el("div", { class:"big" }, `${hc}명`)
      ),
      el("div", { class:"card" },
        el("div", { class:"card-head" }, el("div", { class:"card-title" }, "총 소요일수(카운트)")),
        el("div", { class:"big" }, `${days}일`)
      )
    );

    const right = el("div", { class:"stack" }, rightTop, rightBottom);

    view.appendChild(
      el("div", { class:"dash" },
        left,
        right
      )
    );

    // 선택 유지 위해 hash 갱신
    if (sp?.projectId){
      const base = "#/dashboard";
      if (!location.hash.includes("?p=") || decodeURIComponent((location.hash.match(/p=([^&]+)/)||[])[1]||"") !== sp.projectId){
        history.replaceState(null, "", `${base}?p=${encodeURIComponent(sp.projectId)}`);
        setActiveNav();
      }
    }
  }

  /***********************
   * View: 달력 (#/calendar)
   ***********************/
  function viewCalendar(db){
    const view = $("#view");
    view.innerHTML = "";

    const approved = db.logs.filter(l => l.status === "approved");

    let base = new Date();
    base.setDate(1);

    let months = 1;
    let filter = "전체";

    const monthText = el("div", { class:"cal-month-title" });

    const btnPrev = el("button", { class:"pill-btn", onclick:()=>{ base.setMonth(base.getMonth()-1); rerender(); } }, "◀");
    const btnNext = el("button", { class:"pill-btn", onclick:()=>{ base.setMonth(base.getMonth()+1); rerender(); } }, "▶");

    const selMonths = el("select", { class:"select", onchange:(e)=>{ months = Number(e.target.value); rerender(); } },
      el("option", { value:"1" }, "1달"),
      el("option", { value:"3" }, "3달")
    );

    const selFilter = el("select", { class:"select", onchange:(e)=>{ filter = e.target.value; rerender(); } },
      el("option", { value:"전체" }, "전체"),
      el("option", { value:"구조" }, "구조"),
      el("option", { value:"마감" }, "마감")
    );

    const toolbar = el("div", { class:"card cal-toolbar" },
      el("div", { class:"left" }, btnPrev, monthText, btnNext),
      el("div", { class:"right" },
        el("div", { style:"display:flex;flex-direction:column;gap:6px;min-width:120px;" },
          el("div", { class:"muted", style:"font-weight:1000;font-size:12px;" }, "기간"),
          selMonths
        ),
        el("div", { style:"display:flex;flex-direction:column;gap:6px;min-width:120px;" },
          el("div", { class:"muted", style:"font-weight:1000;font-size:12px;" }, "필터"),
          selFilter
        )
      )
    );

    const host = el("div", { class:"stack" });

    function monthLabel(d){
      return `${d.getFullYear()}-${pad2(d.getMonth()+1)} (표시: ${months}달)`;
    }

    function getItemsForDate(dateISO){
      const list = approved.filter(l=>l.date===dateISO);
      const filtered = filter==="전체" ? list : list.filter(l=>l.category===filter);
      const set = new Set();
      for (const l of filtered){
        const p = projById(db, l.projectId);
        if (p) set.add(p.projectName);
      }
      return Array.from(set);
    }

    function openDay(dateISO){
      const list = approved.filter(l=>l.date===dateISO);
      const filtered = filter==="전체" ? list : list.filter(l=>l.category===filter);

      const body = el("div", { class:"stack" });

      if (!filtered.length){
        body.appendChild(el("div", { class:"empty" }, "승인된 업무일지가 없습니다."));
      } else {
        const byProj = new Map();
        for (const l of filtered){
          if (!byProj.has(l.projectId)) byProj.set(l.projectId, []);
          byProj.get(l.projectId).push(l);
        }

        for (const [pid, logs] of byProj.entries()){
          const p = projById(db, pid);
          body.appendChild(
            el("div", { class:"card" },
              el("div", { class:"card-head" },
                el("div", { class:"card-title" }, `${p?.projectName||"프로젝트"} (${logs.length}건)`),
                el("div", { class:"badge" }, p?.projectCode||"" )
              ),
              el("div", { class:"list" },
                ...logs.map(l=>{
                  const w = userById(db, l.writerId);
                  const a = userById(db, l.approvedBy);
                  return el("div", { class:"list-item" },
                    el("div", { class:"list-title" }, `${l.category}/${l.process} · ${l.ratio}% · ${w?.name||""}`),
                    el("div", { class:"list-sub" }, l.content),
                    el("div", { class:"list-sub" }, `승인: ${a?.name||"-"} · ${l.approvedAt||"-"}`)
                  );
                })
              )
            )
          );
        }
      }

      const foot = el("div", {}, el("button", { class:"btn", onclick: modalClose }, "닫기"));
      modalOpen(`상세: ${dateISO}`, body, foot);
    }

    function renderOneMonth(d){
      const y = d.getFullYear();
      const m = d.getMonth();

      const first = new Date(y,m,1);
      const last = new Date(y,m+1,0);
      const startDow = first.getDay();
      const daysInMonth = last.getDate();

      const box = el("div", { class:"card calendar-wrap" });
      box.appendChild(el("div", { class:"card-title" }, `${y}-${pad2(m+1)}`));

      const dow = el("div", { class:"cal-dow" },
        ...["일","월","화","수","목","금","토"].map(s=>el("div",{},s))
      );
      box.appendChild(dow);

      const grid = el("div", { class:"cal-grid" });

      for (let i=0;i<startDow;i++){
        grid.appendChild(el("div", { class:"cal-cell cal-empty" }));
      }

      for (let day=1; day<=daysInMonth; day++){
        const dateISO = `${y}-${pad2(m+1)}-${pad2(day)}`;
        const items = getItemsForDate(dateISO);

        const cell = el("div", { class:"cal-cell" },
          el("div", { class:"cal-day" }, String(day)),
          items.length ? el("div", { class:"chips" },
            ...items.slice(0,4).map(t=>el("div",{class:"chip"},t)),
            items.length>4 ? el("div",{class:"muted",style:"font-size:12px;padding-left:2px;"},`+${items.length-4}`) : null
          ) : null
        );
        cell.addEventListener("click", ()=>openDay(dateISO));
        grid.appendChild(cell);
      }

      box.appendChild(grid);
      return box;
    }

    function rerender(){
      monthText.textContent = monthLabel(base);
      host.innerHTML = "";
      const count = months === 3 ? 3 : 1;
      for (let i=0;i<count;i++){
        const md = new Date(base);
        md.setMonth(base.getMonth()+i);
        host.appendChild(renderOneMonth(md));
      }
    }

    view.appendChild(el("div", { class:"stack" }, toolbar, host));
    rerender();
  }

  /***********************
   * View: 체크리스트 (#/checklist)  ✅ 분리 탭
   ***********************/
  function viewChecklist(db){
    const view = $("#view");
    view.innerHTML = "";

    let selectedProjectId = db.projects[0]?.projectId || "";

    const projectSel = buildProjectSelect(db, selectedProjectId, (v)=>{
      selectedProjectId = v;
      draw();
    });

    const titleInput = el("input", { class:"input", placeholder:"체크리스트 제목(예: H10 → H13 변경)" });
    const descInput  = el("textarea", { class:"textarea", rows:"3", placeholder:"설명(선택)" });

    const assigneeSel = el("select", { class:"select" },
      ...db.users
        .filter(u => u.role === "staff" || u.role === "leader")
        .map(u => el("option", { value:u.userId }, `${u.name} (${u.role})`))
    );

    const imageInput = el("input", { class:"input", type:"file", accept:"image/*" });

    const addBtn = el("button", {
      class:"btn primary",
      onclick: async ()=>{
        const title = titleInput.value.trim();
        if (!title) return toast("체크리스트 제목을 입력해 주세요.");

        const uid = getUserId(db);
        const assigneeId = assigneeSel.value;

        let imageDataUrl = "";
        const file = imageInput.files?.[0];
        if (file) imageDataUrl = await fileToDataURL(file);

        db.checklists.push({
          itemId: uuid(),
          projectId: selectedProjectId,
          title,
          description: descInput.value.trim(),
          imageDataUrl,
          writerId: uid,
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
        draw();
      }
    }, "새 항목 추가");

    const listHost = el("div", { class:"list" });

    function draw(){
      listHost.innerHTML = "";
      const items = db.checklists
        .filter(i => i.projectId === selectedProjectId)
        .slice()
        .sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));

      if (!items.length){
        listHost.appendChild(el("div",{class:"empty"}, "체크리스트 항목이 없습니다."));
        return;
      }

      for (const it of items){
        const writer = userById(db, it.writerId);
        const assignee = userById(db, it.assigneeId);
        const doneBy = it.doneBy ? userById(db, it.doneBy) : null;

        const checkbox = el("input", {
          type:"checkbox",
          checked: it.status === "done",
          onchange:(e)=>{
            const checked = e.target.checked;
            if (checked){
              it.status = "done";
              it.doneBy = getUserId(db);
              it.doneAt = nowISO();
            } else {
              it.status = "open";
              it.doneBy = "";
              it.doneAt = "";
            }
            saveDB(db);
            draw();
          }
        });

        const title = el("div", { class:`list-title ${it.status==="done" ? "done-title" : ""}` }, it.title);

        const meta = el("div", { class:"list-sub" },
          `작성: ${writer?.name||"-"} · 담당: ${assignee?.name||"-"} · ${it.createdAt||""}`
        );

        const doneMeta = it.status==="done"
          ? el("div", { class:"list-sub done-meta" }, `완료: ${doneBy?.name||"-"} · ${it.doneAt||"-"}`)
          : null;

        const desc = it.description ? el("div", { class:"list-sub" }, it.description) : null;

        const btnView = it.imageDataUrl
          ? el("button", {
              class:"btn ghost",
              onclick:()=>{
                const body = el("div",{}, el("img",{src:it.imageDataUrl, style:"max-width:100%;border-radius:12px;display:block;"}));
                const foot = el("div",{}, el("button",{class:"btn", onclick:modalClose},"닫기"));
                modalOpen("이미지 보기", body, foot);
              }
            }, "보기")
          : el("span", { class:"muted", style:"font-size:12px;align-self:flex-start;padding-top:8px;" }, "이미지 없음");

        const btnDel = el("button", {
          class:"btn ghost",
          onclick:()=>{
            if (!confirm("이 항목을 삭제할까요?")) return;
            db.checklists = db.checklists.filter(x => x.itemId !== it.itemId);
            saveDB(db);
            toast("삭제 완료");
            draw();
          }
        }, "삭제");

        const row = el("div", { class:`list-item ${it.status==="done" ? "done-row" : ""}` },
          el("div", { class:"list-row" },
            el("div", { class:"list-left" }, checkbox),
            el("div", { class:"list-mid" }, title, meta, doneMeta, desc),
            el("div", { class:"list-right" }, btnView, btnDel)
          )
        );

        listHost.appendChild(row);
      }
    }

    const form = el("div", { class:"card" },
      el("div", { class:"card-head" },
        el("div", { class:"card-title" }, "체크리스트 작성"),
        el("div", { class:"row" }, el("div",{class:"muted",style:"font-weight:1000;font-size:12px;"},"프로젝트"), projectSel)
      ),
      el("div", { class:"grid2" },
        el("div", {},
          el("div", { class:"muted", style:"font-weight:1000;font-size:12px;margin:2px 0 6px;" }, "제목"),
          titleInput
        ),
        el("div", {},
          el("div", { class:"muted", style:"font-weight:1000;font-size:12px;margin:2px 0 6px;" }, "담당자"),
          assigneeSel
        )
      ),
      el("div", {},
        el("div", { class:"muted", style:"font-weight:1000;font-size:12px;margin:2px 0 6px;" }, "설명(선택)"),
        descInput
      ),
      el("div", { class:"grid2" },
        el("div", {},
          el("div", { class:"muted", style:"font-weight:1000;font-size:12px;margin:2px 0 6px;" }, "이미지 첨부(선택)"),
          imageInput
        ),
        el("div", { style:"display:flex;align-items:flex-end;justify-content:flex-end;" }, addBtn)
      )
    );

    view.appendChild(el("div",{class:"stack"}, form, el("div",{class:"card"}, el("div",{class:"card-head"}, el("div",{class:"card-title"},"체크리스트 목록")), listHost)));

    draw();
  }

  /***********************
   * Boot / Render
   ***********************/
  function wireTopbar(db){
    const sel = $("#userSelect");
    sel.innerHTML = "";
    const current = getUserId(db);

    for (const u of db.users){
      const opt = el("option", { value:u.userId }, `${u.name} (${u.role})`);
      if (u.userId === current) opt.selected = true;
      sel.appendChild(opt);
    }

    sel.onchange = (e)=>{
      setUserId(e.target.value);
      toast("사용자 전환 완료");
      render();
    };

    $("#btnResetDemo").onclick = ()=>{
      if (!confirm("데모 데이터를 초기화할까요? (localStorage 삭제)")) return;
      localStorage.removeItem(LS_KEY);
      toast("초기화 완료");
      location.hash = "#/log";
      render();
    };

    $("#modalClose").onclick = modalClose;
    $("#modalBackdrop").addEventListener("click", (e)=>{
      if (e.target === $("#modalBackdrop")) modalClose();
    });
  }

  function updateBadge(db){
    $("#badgePending").textContent = String(pendingCount(db));
  }

  function render(){
    const db = ensureDB();

    wireTopbar(db);
    updateBadge(db);
    setActiveNav();

    const route = getRoute();
    if (route === "/log") viewLog(db);
    else if (route === "/approve") viewApprove(db);
    else if (route === "/dashboard") viewDashboard(db);
    else if (route === "/calendar") viewCalendar(db);
    else if (route === "/checklist") viewChecklist(db);
    else {
      location.hash = "#/log";
      viewLog(db);
    }
  }

  window.addEventListener("hashchange", render);
  window.addEventListener("storage", (e)=>{ if (e.key === LS_KEY) render(); });

  // init
  if (!location.hash) location.hash = "#/log";
  render();

})();
