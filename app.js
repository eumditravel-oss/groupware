/* app.js (MVP v0.2) - CON COST Groupware
   - index.html(제공된 UI Shell)과 1:1 호환
   - GitHub Pages 정적 + localStorage 저장
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

  const LS_KEY  = "CONCOST_GW_DB_V02";
  const LS_USER = "CONCOST_GW_USER_V02";

  /***********************
   * Utils
   ***********************/
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  function safeJSONParse(s, fb){ try { return JSON.parse(s); } catch { return fb; } }
  function saveDB(db){ localStorage.setItem(LS_KEY, JSON.stringify(db)); }
  function loadDB(){ return safeJSONParse(localStorage.getItem(LS_KEY), null); }

  function pad(n){ return String(n).padStart(2,"0"); }
  function todayISO(){
    const d=new Date();
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }
  function nowISO(){
    const d=new Date();
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function clamp(n,a,b){ return Math.min(b, Math.max(a,n)); }

  function uuid(){
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = (crypto?.getRandomValues?.(new Uint8Array(1))?.[0] ?? Math.random()*256) & 15;
      const v = c==="x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /***********************
   * DB Seed
   ***********************/
  function seedDB(){
    const db = {
      meta: { version:"0.2", createdAt: nowISO() },
      users: [
        { userId:"u_staff_1", name:"작업자A", role:"staff" },
        { userId:"u_staff_2", name:"작업자B", role:"staff" },
        { userId:"u_leader",  name:"팀장",   role:"leader" },
        { userId:"u_manager", name:"실장",   role:"manager" },
        { userId:"u_director",name:"본부장", role:"director" },
        { userId:"u_vp",      name:"상무",   role:"vp" },
        { userId:"u_ceo",     name:"대표",   role:"ceo" }
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
    localStorage.setItem(LS_USER, db.users[0].userId);
    return db;
  }

  function ensureDB(){
    const db = loadDB();
    return db ? db : seedDB();
  }

  function getCurrentUserId(db){
    const id = localStorage.getItem(LS_USER);
    if (id && db.users.some(u=>u.userId===id)) return id;
    localStorage.setItem(LS_USER, db.users[0]?.userId || "");
    return db.users[0]?.userId || "";
  }

  function setCurrentUserId(id){ localStorage.setItem(LS_USER, id); }

  function getUser(db,id){ return db.users.find(u=>u.userId===id) || null; }
  function getProject(db,id){ return db.projects.find(p=>p.projectId===id) || null; }

  /***********************
   * Toast / Modal
   ***********************/
  const toastEl = () => $("#toast");

  function toast(msg){
    const t = toastEl();
    if (!t) return alert(msg);
    t.textContent = msg;
    t.style.display = "block";
    clearTimeout(toast._timer);
    toast._timer = setTimeout(()=>{ t.style.display="none"; }, 2200);
  }

  const modal = {
    backdrop: () => $("#modalBackdrop"),
    title: () => $("#modalTitle"),
    body: () => $("#modalBody"),
    foot: () => $("#modalFoot"),
    closeBtn: () => $("#modalClose"),
    open(title, bodyNode, footNode){
      modal.title().textContent = title;
      modal.body().innerHTML = "";
      modal.foot().innerHTML = "";
      if (bodyNode) modal.body().appendChild(bodyNode);
      if (footNode) modal.foot().appendChild(footNode);
      modal.backdrop().classList.remove("hidden");
    },
    close(){
      modal.backdrop().classList.add("hidden");
    }
  };

  function wireModal(){
    $("#modalClose")?.addEventListener("click", modal.close);
    $("#modalBackdrop")?.addEventListener("click", (e)=>{
      if (e.target?.id === "modalBackdrop") modal.close();
    });
    window.addEventListener("keydown", (e)=>{
      if (e.key==="Escape") modal.close();
    });
  }

  /***********************
   * Router
   ***********************/
  const ROUTES = {
    "/log": { title: "업무일지", render: renderLog },
    "/approve": { title: "승인", render: renderApprove },
    "/dashboard": { title: "프로젝트별 인원대비 소요시간", render: renderDashboard },
    "/calendar": { title: "종합 공정관리 & 체크리스트", render: renderCalendar }
  };

  function getRoutePath(){
    const h = location.hash || "#/log";
    const path = h.split("?")[0].replace("#","");
    return ROUTES[path] ? path : "/log";
  }

  function setActiveNav(){
    const path = getRoutePath();
    $$(".nav-item").forEach(a=>{
      const href = a.getAttribute("href") || "";
      a.classList.toggle("active", href === `#${path}`);
    });
  }

  function setRouteTitle(){
    const path = getRoutePath();
    $("#routeTitle").textContent = ROUTES[path].title;
  }

  /***********************
   * Common UI Builders
   ***********************/
  function el(tag, attrs={}, ...kids){
    const n = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs||{})){
      if (k==="class") n.className = v;
      else if (k==="html") n.innerHTML = v;
      else if (k.startsWith("on") && typeof v==="function") n.addEventListener(k.slice(2), v);
      else if (v != null) n.setAttribute(k, String(v));
    }
    for (const c of kids){
      if (c==null) continue;
      if (typeof c==="string") n.appendChild(document.createTextNode(c));
      else n.appendChild(c);
    }
    return n;
  }

  function buildSelect(options, value, onChange, cls="select"){
    const s = el("select", { class: cls, onchange: (e)=>onChange?.(e.target.value) });
    options.forEach(o=>{
      const opt = el("option", { value: o.value }, o.label);
      if (o.value === value) opt.selected = true;
      s.appendChild(opt);
    });
    return s;
  }

  function buildProjectSelect(db, value, onChange){
    return buildSelect(
      db.projects.map(p=>({ value:p.projectId, label:`${p.projectCode} (${p.projectName})` })),
      value,
      onChange
    );
  }

  /***********************
   * Badge Pending Count
   ***********************/
  function updatePendingBadge(db){
    const pending = db.logs.filter(l=>l.status==="submitted").length;
    const b = $("#badgePending");
    if (b) b.textContent = String(pending);
  }

  /***********************
   * Header User Select / Reset
   ***********************/
  function wireHeader(db){
    const userSelect = $("#userSelect");
    if (userSelect){
      userSelect.innerHTML = "";
      const current = getCurrentUserId(db);
      db.users.forEach(u=>{
        const opt = el("option", { value:u.userId }, `${u.name} (${u.role})`);
        if (u.userId === current) opt.selected = true;
        userSelect.appendChild(opt);
      });
      userSelect.onchange = (e)=>{
        setCurrentUserId(e.target.value);
        toast("사용자 전환 완료");
        render();
      };
    }

    $("#btnResetDemo")?.addEventListener("click", ()=>{
      if (!confirm("데모 데이터를 초기화할까요? (localStorage 삭제)")) return;
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem(LS_USER);
      toast("초기화 완료");
      location.hash = "#/log";
      render();
    });
  }

  /***********************
   * KPI logic (승인 시 +1 = 일수 카운트)
   ***********************/
  function projectDays(db, projectId){
    const set = new Set();
    db.logs.forEach(l=>{
      if (l.status!=="approved") return;
      if (l.projectId!==projectId) return;
      set.add(`${l.projectId}__${l.date}`);
    });
    return set.size;
  }
  function projectHeadcount(db, projectId){
    const set = new Set();
    db.logs.forEach(l=>{
      if (l.status!=="approved") return;
      if (l.projectId!==projectId) return;
      set.add(l.writerId);
    });
    return set.size;
  }
  function projectBreakdown(db, projectId){
    const map = {};
    db.logs.forEach(l=>{
      if (l.status!=="approved") return;
      if (l.projectId!==projectId) return;
      const k = `${l.category}||${l.process}`;
      map[k] = (map[k]||0) + (Number(l.ratio)||0);
    });
    return map;
  }

  /***********************
   * View: 업무일지 (#/log)
   ***********************/
  function renderLog(db, view){
    const currentUserId = getCurrentUserId(db);
    const firstProject = db.projects[0]?.projectId || "";
    let entries = [ makeEmptyEntry(firstProject) ];

    const dateInput = el("input", { class:"input", type:"date", value: todayISO() });

    const entriesHost = el("div", { class:"stack" });

    function rerenderEntries(){
      entriesHost.innerHTML = "";
      entries.forEach((ent, idx)=>{
        entriesHost.appendChild(renderEntry(ent, idx));
      });
    }

    function renderEntry(ent, idx){
      const projSel = buildProjectSelect(db, ent.projectId, (v)=>{ ent.projectId=v; });

      const catSel = buildSelect(
        Object.keys(PROCESS_MASTER).map(k=>({value:k, label:k})),
        ent.category,
        (v)=>{ ent.category=v; ent.process=PROCESS_MASTER[v][0]; rerenderEntries(); }
      );

      const procSel = buildSelect(
        PROCESS_MASTER[ent.category].map(p=>({value:p, label:p})),
        ent.process,
        (v)=>{ ent.process=v; }
      );

      const ratio = el("input", {
        class:"input",
        type:"number",
        min:"0", max:"100", step:"1",
        value: String(ent.ratio),
        oninput:(e)=>{ ent.ratio = clamp(Number(e.target.value||0),0,100); }
      });

      const content = el("textarea", {
        class:"textarea",
        rows:"4",
        placeholder:"작업내용을 입력하세요",
        oninput:(e)=>{ ent.content = e.target.value; }
      }, ent.content || "");

      const delBtn = el("button", {
        class:"btn ghost",
        onclick:()=>{
          if (entries.length<=1) return toast("최소 1개 항목은 필요합니다.");
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
          el("div", {}, el("div",{class:"label"},"프로젝트 코드"), projSel),
          el("div", {}, el("div",{class:"label"},"업무비율(%)"), ratio)
        ),
        el("div", { class:"grid2" },
          el("div", {}, el("div",{class:"label"},"대분류"), catSel),
          el("div", {}, el("div",{class:"label"},"세부 공정"), procSel)
        ),
        el("div", {}, el("div",{class:"label"},"작업내용"), content)
      );
    }

    const addBtn = el("button", { class:"btn", onclick:()=>{
      entries.push(makeEmptyEntry(firstProject));
      rerenderEntries();
    }}, "+ 업무 항목 추가");

    const submitBtn = el("button", { class:"btn primary", onclick:()=>{
      const date = dateInput.value;
      if (!date) return toast("날짜를 선택해 주세요.");

      for (let i=0;i<entries.length;i++){
        const e = entries[i];
        if (!e.projectId) return toast(`업무 항목 ${i+1}: 프로젝트 선택 필요`);
        if (!e.content || !e.content.trim()) return toast(`업무 항목 ${i+1}: 작업내용 입력 필요`);
        if (!(e.ratio>=0 && e.ratio<=100)) return toast(`업무 항목 ${i+1}: 비율(0~100)`);
      }

      const submittedAt = nowISO();
      entries.forEach(e=>{
        db.logs.push({
          logId: uuid(),
          date,
          projectId: e.projectId,
          category: e.category,
          process: e.process,
          content: e.content.trim(),
          ratio: Number(e.ratio)||0,
          writerId: currentUserId,
          status: "submitted",
          submittedAt,
          approvedBy: "",
          approvedAt: ""
        });
      });

      saveDB(db);
      toast("제출 완료 (승인 대기)");
      location.hash = "#/approve";
      render();
    }}, "제출하기");

    view.appendChild(
      el("div",{class:"stack"},
        el("div",{class:"card"},
          el("div",{class:"card-head"},
            el("div",{class:"card-title"},"날짜 선택"),
            addBtn
          ),
          dateInput
        ),
        entriesHost,
        el("div",{class:"footerbar"}, submitBtn)
      )
    );

    rerenderEntries();
  }

  function makeEmptyEntry(firstProjectId){
    return {
      projectId: firstProjectId,
      category: "구조",
      process: PROCESS_MASTER["구조"][0],
      ratio: 50,
      content: ""
    };
  }

  /***********************
   * View: 승인 (#/approve)
   ***********************/
  function renderApprove(db, view){
    const currentUserId = getCurrentUserId(db);
    const pending = db.logs.filter(l=>l.status==="submitted");

    // 작성자+날짜로 그룹 묶기
    const groups = new Map();
    pending.forEach(l=>{
      const key = `${l.writerId}__${l.date}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(l);
    });

    if (groups.size===0){
      view.appendChild(el("div",{class:"empty"}, "승인 대기 업무일지가 없습니다."));
      return;
    }

    const host = el("div",{class:"stack"});
    for (const [key, arr] of groups.entries()){
      const writer = getUser(db, arr[0].writerId);
      const date = arr[0].date;

      const list = el("div",{class:"list"},
        ...arr.map(l=>{
          const p = getProject(db, l.projectId);
          return el("div",{class:"item"},
            el("div",{class:"item-title"}, `${p?.projectName||"프로젝트"} · ${l.category}/${l.process} · ${l.ratio}%`),
            el("div",{class:"item-sub"}, l.content)
          );
        })
      );

      const approveBtn = el("button",{class:"btn primary", onclick:()=>{
        if (!confirm(`${writer?.name||"작성자"} · ${date} (${arr.length}건) 승인할까요?`)) return;
        const t = nowISO();
        arr.forEach(l=>{
          l.status="approved";
          l.approvedBy=currentUserId;
          l.approvedAt=t;
        });
        saveDB(db);
        toast("승인 완료");
        render();
      }},"승인");

      const rejectBtn = el("button",{class:"btn ghost", onclick:()=>{
        const reason = prompt("반려 사유(선택)") || "";
        if (!confirm(`${writer?.name||"작성자"} · ${date} (${arr.length}건) 반려할까요?`)) return;
        // MVP: 반려는 삭제 대신 rejected로 남길 수도 있지만, 단순화를 위해 상태만 변경
        const t = nowISO();
        arr.forEach(l=>{
          l.status="rejected";
          l.rejectedBy=currentUserId;
          l.rejectedAt=t;
          l.rejectReason=reason;
        });
        saveDB(db);
        toast("반려 완료");
        render();
      }},"반려");

      host.appendChild(
        el("div",{class:"card"},
          el("div",{class:"card-head"},
            el("div",{class:"card-title"}, `승인 대기: ${writer?.name||"작성자"} · ${date} (${arr.length}건)`),
            el("div",{class:"row"}, rejectBtn, approveBtn)
          ),
          list
        )
      );
    }
    view.appendChild(host);
  }

  /***********************
   * View: 대시보드 (#/dashboard)
   ***********************/
  function renderDashboard(db, view){
    const stats = db.projects.map(p=>{
      const days = projectDays(db, p.projectId);
      const head = projectHeadcount(db, p.projectId);
      const approvedEntries = db.logs.filter(l=>l.status==="approved" && l.projectId===p.projectId).length;
      return { ...p, days, head, approvedEntries };
    });

    if (stats.length===0){
      view.appendChild(el("div",{class:"empty"}, "프로젝트가 없습니다."));
      return;
    }

    // 선택 프로젝트(쿼리 p=)
    const h = location.hash;
    const q = h.includes("?") ? h.split("?")[1] : "";
    const params = new URLSearchParams(q);
    let selectedId = params.get("p") || stats[0].projectId;
    if (!db.projects.some(p=>p.projectId===selectedId)) selectedId = stats[0].projectId;

    const left = el("div",{class:"card"},
      el("div",{class:"card-head"},
        el("div",{class:"card-title"},"Project List")
      ),
      el("div",{class:"list"},
        ...stats.map(s=>{
          const maxDays = Math.max(1, ...stats.map(x=>x.days));
          const pct = clamp((s.days/maxDays)*100,0,100);
          const btn = el("button",{class:`list-btn ${s.projectId===selectedId?"active":""}`, onclick:()=>{
            location.hash = `#/dashboard?p=${s.projectId}`;
            render();
          }},
            el("div",{class:"item-title"}, `${s.projectName} (${s.days}일 / ${s.head}명)`),
            el("div",{class:"bar"}, el("div",{style:`width:${pct.toFixed(0)}%`}) ),
            el("div",{class:"item-sub"}, `승인 건수: ${s.approvedEntries}`)
          );
          return btn;
        })
      )
    );

    const selP = getProject(db, selectedId);
    const days = projectDays(db, selectedId);
    const head = projectHeadcount(db, selectedId);

    const breakdown = projectBreakdown(db, selectedId);
    const rows = Object.entries(breakdown).sort((a,b)=>b[1]-a[1]).slice(0, 12);

    const rightTop = el("div",{class:"card"},
      el("div",{class:"card-head"},
        el("div",{class:"card-title"}, `Selected Project: ${selP?.projectName||"-"}`),
        el("div",{class:"badge"}, selP?.projectCode || "")
      ),
      rows.length ? el("div",{class:"list"},
        ...rows.map(([k,v])=>{
          const [cat, proc] = k.split("||");
          const max = Math.max(1, rows[0][1]);
          const pct = clamp((v/max)*100,0,100);
          return el("div",{class:"item"},
            el("div",{class:"item-title"}, `${cat} · ${proc} (${v}%)`),
            el("div",{class:"bar"}, el("div",{style:`width:${pct.toFixed(0)}%`}) )
          );
        })
      ) : el("div",{class:"empty"},"승인된 업무일지가 없습니다.")
    );

    const rightBottom = el("div",{class:"grid2"},
      el("div",{class:"card"},
        el("div",{class:"card-head"}, el("div",{class:"card-title"},"총 투입 인원")),
        el("div",{style:"font-size:30px;font-weight:1100;padding:10px 0;"}, `${head}명`)
      ),
      el("div",{class:"card"},
        el("div",{class:"card-head"}, el("div",{class:"card-title"},"총 소요일수(카운트)")),
        el("div",{style:"font-size:30px;font-weight:1100;padding:10px 0;"}, `${days}일`)
      )
    );

    const wrap = el("div",{class:"stack"});
    const grid = el("div",{class:"grid2"});
    // grid2는 2컬럼이지만 폭이 커서 레이아웃이 부족할 수 있어 flex로 구성
    const layout = el("div",{style:"display:grid;grid-template-columns:360px 1fr;gap:14px;align-items:start;"});
    layout.appendChild(left);
    layout.appendChild(el("div",{class:"stack"}, rightTop, rightBottom));
    wrap.appendChild(layout);

    view.appendChild(wrap);
  }

  /***********************
   * View: 달력 + 체크리스트 (#/calendar)
   ***********************/
  function renderCalendar(db, view){
    const approved = db.logs.filter(l=>l.status==="approved");
    let modeMonths = 1;
    let filter = "전체";
    let base = new Date(); base.setDate(1);

    const monthLabel = el("div",{style:"font-weight:1100;"});
    const prevBtn = el("button",{class:"btn ghost", onclick:()=>{ base.setMonth(base.getMonth()-1); rerender(); }}, "◀");
    const nextBtn = el("button",{class:"btn ghost", onclick:()=>{ base.setMonth(base.getMonth()+1); rerender(); }}, "▶");

    const modeSel = buildSelect(
      [{value:"1",label:"1달"},{value:"3",label:"3달"}],
      "1",
      (v)=>{ modeMonths = Number(v); rerender(); },
      "select"
    );

    const catSel = buildSelect(
      [{value:"전체",label:"전체"},{value:"구조",label:"구조"},{value:"마감",label:"마감"}],
      "전체",
      (v)=>{ filter = v; rerender(); },
      "select"
    );

    const top = el("div",{class:"card"},
      el("div",{class:"row"},
        prevBtn, monthLabel, nextBtn,
        el("div",{style:"margin-left:auto;display:flex;gap:10px;flex-wrap:wrap;"},
          el("div",{class:"row"}, el("span",{style:"font-size:12px;color:var(--muted);font-weight:1000;"},"기간"), modeSel),
          el("div",{class:"row"}, el("span",{style:"font-size:12px;color:var(--muted);font-weight:1000;"},"필터"), catSel)
        )
      )
    );

    const calHost = el("div",{class:"cal-host"});
    const checklistPanel = el("div",{class:"card"});

    function getItems(dateISO){
      const list = approved.filter(l=>l.date===dateISO);
      const filtered = filter==="전체" ? list : list.filter(l=>l.category===filter);
      const set = new Set();
      filtered.forEach(l=>{
        const p = getProject(db, l.projectId);
        if (p) set.add(p.projectName);
      });
      return Array.from(set);
    }

    function openDetail(dateISO){
      const list = approved.filter(l=>l.date===dateISO);
      const filtered = filter==="전체" ? list : list.filter(l=>l.category===filter);

      const body = el("div",{class:"stack"});
      if (!filtered.length){
        body.appendChild(el("div",{class:"empty"},"승인된 업무일지가 없습니다."));
      } else {
        const byProj = new Map();
        filtered.forEach(l=>{
          if (!byProj.has(l.projectId)) byProj.set(l.projectId, []);
          byProj.get(l.projectId).push(l);
        });
        for (const [pid, logs] of byProj.entries()){
          const p = getProject(db, pid);
          body.appendChild(
            el("div",{class:"card"},
              el("div",{class:"card-head"},
                el("div",{class:"card-title"}, `${p?.projectName||"프로젝트"} (${logs.length}건)`),
                el("div",{class:"badge"}, p?.projectCode||"")
              ),
              el("div",{class:"list"},
                ...logs.map(l=>{
                  const writer = getUser(db, l.writerId);
                  const approver = getUser(db, l.approvedBy);
                  return el("div",{class:"item"},
                    el("div",{class:"item-title"}, `${l.category}/${l.process} · ${l.ratio}% · ${writer?.name||""}`),
                    el("div",{class:"item-sub"}, l.content),
                    el("div",{class:"item-sub"}, `승인: ${approver?.name||"-"} · ${l.approvedAt||"-"}`)
                  );
                })
              )
            )
          );
        }
      }
      const foot = el("div",{}, el("button",{class:"btn",onclick:modal.close},"닫기"));
      modal.open(`상세: ${dateISO}`, body, foot);
    }

    function renderOneMonth(d){
      const y=d.getFullYear(), m=d.getMonth();
      const first=new Date(y,m,1);
      const last=new Date(y,m+1,0);
      const startDow=first.getDay();
      const days=last.getDate();

      const month = el("div",{class:"cal-month"},
        el("div",{class:"cal-title"}, `${y}-${pad(m+1)}`),
        el("div",{class:"cal-dow"},
          ...["일","월","화","수","목","금","토"].map(s=>el("div",{},s))
        )
      );

      const grid = el("div",{class:"cal-grid"});
      for (let i=0;i<startDow;i++) grid.appendChild(el("div",{class:"cal-cell empty"}));

      for (let day=1; day<=days; day++){
        const dateISO = `${y}-${pad(m+1)}-${pad(day)}`;
        const items = getItems(dateISO);
        const cell = el("div",{class:"cal-cell", onclick:()=>openDetail(dateISO)},
          el("div",{class:"cal-day"}, String(day)),
          items.length ? el("div",{class:"chips"},
            ...items.slice(0,4).map(t=>el("div",{class:"chip"}, t)),
            items.length>4 ? el("div",{class:"more"}, `+${items.length-4}`) : null
          ) : null
        );
        grid.appendChild(cell);
      }

      month.appendChild(grid);
      return month;
    }

    function renderChecklist(){
      checklistPanel.innerHTML = "";

      let selectedProjectId = db.projects[0]?.projectId || "";

      const projectSel = buildProjectSelect(db, selectedProjectId, (v)=>{
        selectedProjectId = v;
        drawList();
      });

      const titleInput = el("input",{class:"input", placeholder:"체크리스트 제목"});
      const descInput = el("textarea",{class:"textarea", rows:"3", placeholder:"설명(선택)"});

      const assigneeSel = buildSelect(
        db.users.filter(u=>["staff","leader","manager"].includes(u.role)).map(u=>({value:u.userId,label:`${u.name} (${u.role})`})),
        db.users[0]?.userId || "",
        ()=>{}
      );

      const imgInput = el("input",{class:"input", type:"file", accept:"image/*"});

      const addBtn = el("button",{class:"btn primary", onclick:async ()=>{
        const t = titleInput.value.trim();
        if (!t) return toast("제목을 입력해 주세요.");

        const file = imgInput.files?.[0];
        const imageDataUrl = file ? await fileToDataURL(file) : "";

        db.checklists.push({
          itemId: uuid(),
          projectId: selectedProjectId,
          title: t,
          description: descInput.value.trim(),
          imageDataUrl,
          writerId: getCurrentUserId(db),
          assigneeId: assigneeSel.value,
          status: "open",
          createdAt: nowISO(),
          doneBy: "",
          doneAt: ""
        });

        saveDB(db);
        titleInput.value = "";
        descInput.value = "";
        imgInput.value = "";
        toast("체크리스트 추가 완료");
        drawList();
      }},"새 항목 추가");

      const listHost = el("div",{class:"list"});

      function drawList(){
        listHost.innerHTML = "";
        const items = db.checklists
          .filter(i=>i.projectId===selectedProjectId)
          .slice()
          .sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));

        if (!items.length){
          listHost.appendChild(el("div",{class:"empty"},"체크리스트 항목이 없습니다."));
          return;
        }

        for (const it of items){
          const writer = getUser(db, it.writerId);
          const assignee = getUser(db, it.assigneeId);
          const doneBy = it.doneBy ? getUser(db, it.doneBy) : null;

          const cb = el("input",{type:"checkbox"});
          cb.checked = it.status==="done";
          cb.onchange = ()=>{
            if (cb.checked){
              it.status="done";
              it.doneBy=getCurrentUserId(db);
              it.doneAt=nowISO();
            } else {
              it.status="open";
              it.doneBy=""; it.doneAt="";
            }
            saveDB(db);
            drawList();
          };

          const title = el("div",{class:`item-title ${it.status==="done"?"done-title":""}`}, it.title);
          const meta = el("div",{class:"item-sub"}, `작성: ${writer?.name||"-"} · 담당: ${assignee?.name||"-"} · ${it.createdAt||""}`);
          const doneMeta = it.status==="done" ? el("div",{class:"item-sub done-meta"}, `완료: ${doneBy?.name||"-"} · ${it.doneAt||"-"}`) : null;
          const desc = it.description ? el("div",{class:"item-sub"}, it.description) : null;

          const btnView = it.imageDataUrl
            ? el("button",{class:"btn ghost", onclick:()=>{
                const img = el("img",{src:it.imageDataUrl, style:"max-width:100%;border-radius:14px;display:block;"});
                modal.open("이미지 보기", img, el("div",{}, el("button",{class:"btn",onclick:modal.close},"닫기")));
              }}, "보기")
            : el("span",{style:"font-size:12px;color:var(--muted);font-weight:1000;"},"이미지 없음");

          const btnDel = el("button",{class:"btn ghost", onclick:()=>{
            if (!confirm("삭제할까요?")) return;
            db.checklists = db.checklists.filter(x=>x.itemId!==it.itemId);
            saveDB(db);
            toast("삭제 완료");
            drawList();
          }}, "삭제");

          const row = el("div",{class:`item ${it.status==="done"?"done-row":""}`, style:"display:flex;gap:10px;align-items:flex-start;"},
            el("div",{style:"padding-top:2px;"}, cb),
            el("div",{style:"flex:1;min-width:0;"}, title, meta, doneMeta, desc),
            el("div",{style:"display:flex;gap:8px;align-items:flex-start;"}, btnView, btnDel)
          );

          listHost.appendChild(row);
        }
      }

      checklistPanel.appendChild(
        el("div",{class:"card-head"},
          el("div",{class:"card-title"},"프로젝트별 체크리스트"),
          projectSel
        )
      );
      checklistPanel.appendChild(
        el("div",{class:"grid2"},
          el("div",{}, el("div",{class:"label"},"제목"), titleInput),
          el("div",{}, el("div",{class:"label"},"담당자"), assigneeSel)
        )
      );
      checklistPanel.appendChild(el("div",{}, el("div",{class:"label"},"설명(선택)"), descInput));
      checklistPanel.appendChild(
        el("div",{class:"grid2"},
          el("div",{}, el("div",{class:"label"},"이미지 첨부(선택)"), imgInput),
          el("div",{style:"display:flex;align-items:flex-end;justify-content:flex-end;"}, addBtn)
        )
      );
      checklistPanel.appendChild(el("div",{style:"height:10px;"}));
      checklistPanel.appendChild(listHost);

      drawList();
    }

    function rerender(){
      monthLabel.textContent = `${base.getFullYear()}-${pad(base.getMonth()+1)} (표시: ${modeMonths}달)`;
      calHost.innerHTML = "";
      const count = modeMonths===3 ? 3 : 1;
      for (let i=0;i<count;i++){
        const d = new Date(base);
        d.setMonth(base.getMonth()+i);
        calHost.appendChild(renderOneMonth(d));
      }
      renderChecklist();
    }

    view.appendChild(el("div",{class:"stack"}, top, calHost, checklistPanel));
    rerender();
  }

  function fileToDataURL(file){
    return new Promise((resolve,reject)=>{
      const fr = new FileReader();
      fr.onload = ()=>resolve(String(fr.result||""));
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  /***********************
   * Render entry
   ***********************/
  function render(){
    const db = ensureDB();

    wireHeader(db);
    updatePendingBadge(db);
    setActiveNav();
    setRouteTitle();

    const view = $("#view");
    view.innerHTML = "";

    const path = getRoutePath();
    ROUTES[path].render(db, view);
  }

  function boot(){
    wireModal();
    if (!location.hash) location.hash = "#/log";
    render();
  }

  window.addEventListener("hashchange", render);
  window.addEventListener("storage", (e)=>{
    if (e.key === LS_KEY) render();
  });

  boot();

})();
