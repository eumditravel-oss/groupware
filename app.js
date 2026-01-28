/* app.js (CON COST Groupware MVP v0.5) — FULL (UPDATED)
   ✅ 상단 대분류 탭 도입
   - 전자메일 / 전자결재 / 업무관리 / 산출 / 일정관리
   ✅ 좌측 메뉴 = 선택된 탭의 소분류
   ✅ 기존(업무관리) 기능/권한/Sheets Auto Sync 유지
   ✅ 산출
   - FIN산출 클릭 시: https://eumditravel-oss.github.io/FIN2/ 로 이동
   - ㅇㅇ산출: placeholder
   ✅ 전자메일/전자결재: placeholder(아이덴티티 유지)
   ✅ 일정관리: 휴가관리/회사공식일정(캘린더 UI placeholder)
*/

(() => {
  "use strict";

  /***********************
   * 공정 마스터(고정) - 업무관리(종합공정관리)에 사용
   ***********************/
  const PROCESS_MASTER = {
    "구조": ["기초","기둥","보","슬라브","옹벽","철골","동바리","구조검토"],
    "마감": ["가설","창호","내부","외부","세대","마감검토"]
  };

  /***********************
 * Roles
 ***********************/
const ROLE_ORDER = ["staff","leader","manager","director","vp","svp","ceo"];

// ✅ 내부 표기(필요시 유지)
const ROLE_LABEL = {
  staff:"staff",
  leader:"leader",
  manager:"manager",
  director:"director",
  vp:"vp",
  svp:"svp",
  ceo:"ceo"
};

// ✅ UI 표시용(요청: 사원~대표)
const ROLE_LABEL_KO = {
  staff:"사원",
  leader:"팀장",
  manager:"실장",
  director:"본부장",
  vp:"상무",
  svp:"부사장",
  ceo:"대표"
};

function roleRank(role){
  const i = ROLE_ORDER.indexOf(role);
  return i >= 0 ? i : 0;
}
function isStaff(user){ return (user?.role || "staff") === "staff"; }
function isLeaderPlus(user){ return roleRank(user?.role || "staff") >= roleRank("leader"); }


  /***********************
   * Storage
   ***********************/
  const LS_KEY  = "CONCOST_GROUPWARE_DB_V05";
  const LS_USER = "CONCOST_GROUPWARE_USER_V05";

  // ✅ Google Apps Script WebApp URL (고정)
  const SHEETS_API_URL = "https://script.google.com/macros/s/AKfycbz0VVYfP-AFvH4GFRVeB9jRPROrmJeoewa7L45bueOn7cC2O6IGqztwhEgaXs1LY8Zo/exec";

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

  /***********************
 * Auto Sync (Sheets)
 ***********************/
// ✅ GitHub Pages에서는 Apps Script CORS가 막히는 경우가 많아서 기본 OFF
const IS_GITHUB_PAGES = location.hostname.endsWith("github.io");

// ✅ 필요할 때만 true로 켜세요 (CORS 허용된 Apps Script일 때만)
const SHEETS_ENABLED = false;

// ✅ 자동 동기화는 SHEETS_ENABLED가 true일 때만 동작
const AUTO_PULL_ON_START = SHEETS_ENABLED && !IS_GITHUB_PAGES;
const AUTO_PUSH_ON_SAVE  = SHEETS_ENABLED && !IS_GITHUB_PAGES;

const PUSH_DEBOUNCE_MS   = 1200;   // 저장 묶기


  let isPulling = false;            // ✅ Pull 중 Push 금지
  let isPushing = false;
  let pushTimer = null;
  let pendingPushAfter = false;

  function schedulePush(db){
  if (!AUTO_PUSH_ON_SAVE) return;
  if (isPulling) return;

  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    if (isPushing){
      pendingPushAfter = true;
      return;
    }

    isPushing = true;
    try{
      const payload = dbToSheetsPayload(db);
      const res = await sheetsImport(payload);
      if (res && res.ok){
        toast("✅ 자동 저장 완료(시트)");
      } else {
        toast("❌ 자동 저장 실패(시트 응답 오류)");
      }
    }catch(err){
      console.error(err);
      toast("❌ 자동 저장 실패(콘솔 확인)");
    }finally{
      isPushing = false;
      if (pendingPushAfter){
        pendingPushAfter = false;
        schedulePush(ensureDB());
      }
    }
  }, PUSH_DEBOUNCE_MS);
}


  function saveDB(db){
    localStorage.setItem(LS_KEY, JSON.stringify(db));
    schedulePush(db);
  }

  /***********************
   * Seed / Ensure
   ***********************/
  function makeSeedDB(){
  return {
    meta: { version:"0.5", createdAt: nowISO() },
    users: [
      { userId:"u_staff_1", name:"작업자A", role:"staff" },
      { userId:"u_staff_2", name:"작업자B", role:"staff" },
      { userId:"u_leader",  name:"팀장", role:"leader" },
      { userId:"u_manager", name:"실장", role:"manager" },
      { userId:"u_director",name:"본부장", role:"director" },
      { userId:"u_vp",      name:"상무", role:"vp" },
      { userId:"u_svp",     name:"부사장", role:"svp" },
      { userId:"u_ceo",     name:"대표", role:"ceo" }
    ],
    projects: [
      { projectId:"p_a123", projectCode:"Project A-123", projectName:"프로젝트 A", startDate:"2024-05-01", endDate:"" },
      { projectId:"p_b234", projectCode:"Project B-234", projectName:"프로젝트 B", startDate:"2024-05-10", endDate:"" },
      { projectId:"p_c345", projectCode:"Project C-345", projectName:"프로젝트 C", startDate:"2024-05-15", endDate:"" }
    ],

    // ✅ 전자메일(MVP 더미 데이터)
    mails: [
      { mailId: uuid(), box:"inbox", subject:"[현대산업개발] 의왕 스마트시티 문의사항 답변", from:"현대산업개발", at:"2026-01-26 09:12" },
      { mailId: uuid(), box:"inbox", subject:"[롯데건설] 마트 수지점 주상복합 개발사업 납품자료", from:"롯데건설", at:"2026-01-25 17:40" },
      { mailId: uuid(), box:"inbox", subject:"[고려건설] 안동동 프로젝트 샘플 도면 송부", from:"고려건설", at:"2026-01-24 10:03" },
      { mailId: uuid(), box:"sent",  subject:"Re: 견적요청 건 회신드립니다", from:"(보낸메일)", at:"2026-01-23 16:22" }
    ],

    // ✅ 게시판(MVP 더미 데이터)
    boardPosts: [
      { postId: uuid(), boardKey:"notice", title:"2025년 연말정산 안내", writer:"총무팀", at:"2026-01-26" },
      { postId: uuid(), boardKey:"hr",     title:"인사발령(260126)", writer:"인사팀", at:"2026-01-26" },
      { postId: uuid(), boardKey:"orders", title:"프로젝트 진행사항_Ver.260123", writer:"영업팀", at:"2026-01-23" },
      { postId: uuid(), boardKey:"minutes",title:"주간 회의록(1월 3주차)", writer:"PMO", at:"2026-01-21" },
      { postId: uuid(), boardKey:"manual", title:"신규 입사자 온보딩 메뉴얼", writer:"총무팀", at:"2026-01-15" }
    ],

    // ✅ 전자결재(MVP 더미 데이터)
    approvals: [
      { docId: uuid(), box:"inbox", title:"지출결의서(자재비) 승인 요청", from:"작업자A", at:"2026-01-26 11:20", status:"pending" },
      { docId: uuid(), box:"inbox", title:"휴가신청서 승인 요청", from:"작업자B", at:"2026-01-25 18:05", status:"pending" },
      { docId: uuid(), box:"sent",  title:"품의서(장비임차) 제출", from:"(보낸결재)", at:"2026-01-24 09:10", status:"submitted" }
    ],

    // ✅ 일정관리: 다가오는 휴가/외근(MVP 더미 데이터)
    staffSchedules: [
      { evId: uuid(), type:"휴가", name:"작업자A", date:"2026-01-29", note:"연차" },
      { evId: uuid(), type:"외근", name:"작업자B", date:"2026-01-30", note:"현장 방문(평택)" },
      { evId: uuid(), type:"외근", name:"팀장",   date:"2026-02-01", note:"미팅(발주처)" },
      { evId: uuid(), type:"휴가", name:"실장",   date:"2026-02-03", note:"반차" }
    ],

     // ✅ 다가오는 생일(MVP 더미 데이터) - 이름은 익명 처리
birthdays: [
  { bId: uuid(), name: "ㅇㅇㅇ 사원", md: "05-06" },
  { bId: uuid(), name: "ㅇㅇㅇ 사원", md: "05-11" },
  { bId: uuid(), name: "ㅇㅇㅇ 사원", md: "05-18" },
  { bId: uuid(), name: "ㅇㅇㅇ 사원", md: "06-02" },
  { bId: uuid(), name: "ㅇㅇㅇ 사원", md: "06-19" }
],


    logs: [],
    checklists: []
  };
}


  function seedDB(){
    const db = makeSeedDB();
    localStorage.setItem(LS_KEY, JSON.stringify(db)); // ✅ seed는 로컬만
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
    if (!host) return;
    const t = el("div", { class:"t" }, msg);
    host.appendChild(t);
    setTimeout(() => t.remove(), 2300);
  }

  function modalOpen(title, bodyNode, footNode){
    $("#modalTitle") && ($("#modalTitle").textContent = title || "");
    const body = $("#modalBody");
    const foot = $("#modalFoot");
    if (body){ body.innerHTML = ""; if (bodyNode) body.appendChild(bodyNode); }
    if (foot){ foot.innerHTML = ""; if (footNode) foot.appendChild(footNode); }
    $("#modalBackdrop")?.classList.remove("hidden");
  }
  function modalClose(){
    $("#modalBackdrop")?.classList.add("hidden");
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
   * Google Sheets API
   ***********************/
  async function sheetsExport(){
  const url = (SHEETS_API_URL || "").trim();
  if (!url) { toast("SHEETS_API_URL이 없습니다."); return null; }

  if (!SHEETS_ENABLED){
    toast("ℹ️ 시트 기능이 비활성화되어 있습니다. (SHEETS_ENABLED=false)");
    return null;
  }

  const res = await fetch(`${url}?action=export`, { method:"GET" });
  if (!res.ok) throw new Error("export failed");
  return await res.json();
}

async function sheetsImport(payload){
  const url = (SHEETS_API_URL || "").trim();
  if (!url) { toast("SHEETS_API_URL이 없습니다."); return null; }

  if (!SHEETS_ENABLED){
    toast("ℹ️ 시트 기능이 비활성화되어 있습니다. (SHEETS_ENABLED=false)");
    return null;
  }

  const res = await fetch(`${url}?action=import`, {
    method:"POST",
    headers:{ "Content-Type":"text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) throw new Error("import failed");
  return await res.json();
}




  function ensureChecklistShape(item){
    if (!Array.isArray(item.confirmations)) item.confirmations = [];
    if (typeof item.status !== "string") item.status = "open";
    if (typeof item.doneBy !== "string") item.doneBy = "";
    if (typeof item.doneAt !== "string") item.doneAt = "";
    if (typeof item.createdAt !== "string") item.createdAt = item.createdAt ? String(item.createdAt) : "";
    return item;
  }

  function dbToSheetsPayload(db){
    const meta = [
      ["key","value"],
      ["version", db.meta?.version || ""],
      ["createdAt", db.meta?.createdAt || ""],
      ["exportedAt", nowISO()]
    ];

    const users = [
      ["userId","name","role"],
      ...db.users.map(u => [u.userId, u.name, u.role])
    ];

    const projects = [
      ["projectId","projectCode","projectName","startDate","endDate"],
      ...db.projects.map(p => [p.projectId, p.projectCode, p.projectName, p.startDate||"", p.endDate||""])
    ];

    const logs = [
      ["logId","date","projectId","category","process","content","ratio","writerId","status","submittedAt","approvedBy","approvedAt","rejectedBy","rejectedAt","rejectReason"],
      ...db.logs.map(l => [
        l.logId, l.date, l.projectId, l.category, l.process, l.content,
        String(l.ratio ?? ""), l.writerId, l.status,
        l.submittedAt||"", l.approvedBy||"", l.approvedAt||"",
        l.rejectedBy||"", l.rejectedAt||"", l.rejectReason||""
      ])
    ];

    const checklists = [
      ["itemId","projectId","title","description","imageDataUrl","writerId","assigneeId","status","createdAt","doneBy","doneAt","confirmationsJson"],
      ...db.checklists.map(c => {
        ensureChecklistShape(c);
        return [
          c.itemId, c.projectId, c.title, c.description||"", c.imageDataUrl||"",
          c.writerId, c.assigneeId, c.status, c.createdAt||"",
          c.doneBy||"", c.doneAt||"",
          JSON.stringify(c.confirmations || [])
        ];
      })
    ];

    return { meta, users, projects, logs, checklists };
  }

  function sheetsPayloadToDB(data){
    const metaArr = Array.isArray(data.meta) ? data.meta : [];
    const usersArr = Array.isArray(data.users) ? data.users : [];
    const projectsArr = Array.isArray(data.projects) ? data.projects : [];
    const logsArr = Array.isArray(data.logs) ? data.logs : [];
    const checkArr = Array.isArray(data.checklists) ? data.checklists : [];

    const meta = { version:"0.5", createdAt: nowISO() };
    for (let i=1;i<metaArr.length;i++){
      const k = metaArr[i]?.[0];
      const v = metaArr[i]?.[1];
      if (k === "version") meta.version = String(v||"");
      if (k === "createdAt") meta.createdAt = String(v||"");
    }

    function rowsToObjects(arr){
      if (!arr.length) return [];
      const head = arr[0].map(String);
      const out = [];
      for (let i=1;i<arr.length;i++){
        const r = arr[i];
        if (!r || r.length===0) continue;
        const obj = {};
        head.forEach((h, idx)=> obj[h] = r[idx]);
        out.push(obj);
      }
      return out;
    }

    const users = rowsToObjects(usersArr).map(u => ({
      userId: String(u.userId||""),
      name: String(u.name||""),
      role: String(u.role||"staff")
    })).filter(u=>u.userId);

    const projects = rowsToObjects(projectsArr).map(p => ({
      projectId: String(p.projectId||""),
      projectCode: String(p.projectCode||""),
      projectName: String(p.projectName||""),
      startDate: String(p.startDate||""),
      endDate: String(p.endDate||"")
    })).filter(p=>p.projectId);

    const logs = rowsToObjects(logsArr).map(l => ({
      logId: String(l.logId||uuid()),
      date: String(l.date||""),
      projectId: String(l.projectId||""),
      category: String(l.category||"구조"),
      process: String(l.process||PROCESS_MASTER[String(l.category||"구조")]?.[0] || ""),
      content: String(l.content||""),
      ratio: Number(l.ratio||0),
      writerId: String(l.writerId||""),
      status: String(l.status||"submitted"),
      submittedAt: String(l.submittedAt||""),
      approvedBy: String(l.approvedBy||""),
      approvedAt: String(l.approvedAt||""),
      rejectedBy: String(l.rejectedBy||""),
      rejectedAt: String(l.rejectedAt||""),
      rejectReason: String(l.rejectReason||"")
    })).filter(l=>l.logId);

    const checklists = rowsToObjects(checkArr).map(c => {
      let confirmations = [];
      try{ confirmations = JSON.parse(String(c.confirmationsJson||"[]")); }catch{}
      const item = {
        itemId: String(c.itemId||uuid()),
        projectId: String(c.projectId||""),
        title: String(c.title||""),
        description: String(c.description||""),
        imageDataUrl: String(c.imageDataUrl||""),
        writerId: String(c.writerId||""),
        assigneeId: String(c.assigneeId||""),
        status: String(c.status||"open"),
        createdAt: String(c.createdAt||""),
        doneBy: String(c.doneBy||""),
        doneAt: String(c.doneAt||""),
        confirmations: Array.isArray(confirmations)? confirmations : []
      };
      return ensureChecklistShape(item);
    }).filter(c=>c.itemId);

    const seed = makeSeedDB();
    return {
      meta,
      users: users.length ? users : seed.users,
      projects: projects.length ? projects : seed.projects,
      logs,
      checklists
    };
  }

      /***********************
   * TOP TABS / SIDE MENUS
   ***********************/
  const TOP_TABS = [
  // { key:"대쉬보드", label:"대쉬보드" }, // ✅ 제거
  { key:"전자메일", label:"전자메일" },
  { key:"게시판",   label:"게시판" },
  { key:"전자결재", label:"전자결재" },
  { key:"업무관리", label:"업무관리" },
  { key:"산출",     label:"산출" },
  { key:"일정관리", label:"일정관리" }
];


  const WORK_ROUTES = ["log","approve","dashboard","calendar","checklist","checklist-view"];

  const SIDE_MENUS = {
  // "대쉬보드": [{ key:"home", label:"홈" }], // ✅ 제거

  "전자메일": [
    { key:"mail-inbox", label:"받은편지함" },
    { key:"mail-sent",  label:"보낸편지함" },
    { key:"mail-etc",   label:"기타" }
  ],
  "게시판": [
    { key:"ceo",     label:"CEO Message" },
    { key:"notice",  label:"전사공지" },
    { key:"hr",      label:"인사발령" },
    { key:"event",   label:"경조사" },
    { key:"orders",  label:"수주소식" },
    { key:"minutes", label:"회의록" },
    { key:"weekly",  label:"주간 프로젝트 진행사항" },
    { key:"manual",  label:"메뉴얼" },
    { key:"album",   label:"사진첩" },
    { key:"free",    label:"자유게시판" }
  ],
  "전자결재": [
    { key:"ea-inbox", label:"받은결재함" },
    { key:"ea-sent",  label:"보낸결재함" },
    { key:"ea-write", label:"문서작성" }
  ],
  "업무관리": [
    { key:"log",            label:"업무일지" },
    { key:"approve",        label:"승인", badge:"pending" },
    { key:"dashboard",      label:"프로젝트 소요시간" },
    { key:"calendar",       label:"종합 공정관리" },
    { key:"checklist",      label:"프로젝트별 체크리스트" },
    { key:"checklist-view", label:"체크리스트 목록" }
  ],
  "산출": [
    { key:"fin", label:"FIN산출" },
    { key:"etc", label:"ㅇㅇ산출" }
  ],
  "일정관리": [
    { key:"vacation",        label:"휴가관리" },
    { key:"company-calendar",label:"회사공식일정" }
  ]
};


  function parseHash(){
  const raw = (location.hash || "").replace(/^#/, "");
  const [tabEnc, subEncWithQ] = raw.split("/");

  const rawTab = decodeURIComponent(tabEnc || "대쉬보드");
  const tab = normalizeTabKey(rawTab);

  // sub에 ?p= 같은 쿼리가 붙는 케이스(viewDashboard) 대비
  const subEnc = (subEncWithQ || "").split("?")[0];
  const sub = decodeURIComponent(subEnc || firstMenuKey(tab));

  return { tab, sub };
}



function setHash(tab, sub){
  const t = encodeURIComponent(tab);
  const s = encodeURIComponent(sub || firstMenuKey(tab));
  location.hash = `#${t}/${s}`;
}


  function firstMenuKey(tab){
  if (tab === "대쉬보드") return "home";   // ✅ 추가
  return SIDE_MENUS[tab]?.[0]?.key || "log";
}


  /***********************
   * AUTH (업무관리만 강제)
   ***********************/
  function allowedWorkRoutesFor(user){
    if (isStaff(user)){
      return new Set(["log","checklist-view"]);
    }
    return new Set(["log","approve","dashboard","calendar","checklist","checklist-view"]);
  }

  function enforceAuth(db, tab, sub){
    if (tab !== "업무관리") return true;
    const me = userById(db, getUserId(db));
    const allowed = allowedWorkRoutesFor(me);
    if (!allowed.has(sub)){
      if (isStaff(me) && sub === "checklist") setHash("업무관리","checklist-view");
      else setHash("업무관리","log");
      return false;
    }
    return true;
  }

   /***********************
 * LEFT PROFILE CARD
 ***********************/
function renderLeftProfile(db){
  const host = $("#profileCard");
  if (!host) return;

  const uid = getUserId(db);
  const me = userById(db, uid);

  // ✅ users[].avatarDataUrl (없으면 빈값)
  if (me && typeof me.avatarDataUrl !== "string") me.avatarDataUrl = "";

  // Avatar upload UI (프로필 카드 내부에서 생성)
  const avatarInput = el("input", {
    id: "avatarInput",
    type: "file",
    accept: "image/*",
    class: "hidden"
  });

  const avatarPreview = el("img", {
    id: "avatarPreview",
    alt: "profile",
    ...(me?.avatarDataUrl ? { src: me.avatarDataUrl } : {}),
    ...(me?.avatarDataUrl ? {} : { hidden: true })
  });

  const avatarPlaceholder = el("div", {
    id: "avatarPlaceholder",
    class: "avatar-placeholder",
    ...(me?.avatarDataUrl ? { hidden: true } : {})
  },
    el("div", { class: "avatar-icon" }, "👤"),
    el("div", { class: "avatar-text" }, "사진 업로드")
  );

  const avatarBox = el("div", {
    class: "avatar",
    role: "button",
    tabindex: "0",
    onclick: () => avatarInput.click(),
    onkeydown: (e) => {
      if (e.key === "Enter" || e.key === " ") avatarInput.click();
    }
  },
    avatarPreview,
    avatarPlaceholder
  );

  avatarInput.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file || !me) return;

    try{
      const dataUrl = await fileToDataURL(file);
      me.avatarDataUrl = dataUrl;     // ✅ DB에 저장
      saveDB(db);

      // ✅ 즉시 UI 반영
      avatarPreview.src = dataUrl;
      avatarPreview.hidden = false;
      avatarPlaceholder.hidden = true;

      toast("프로필 사진 변경 완료");
    }catch(err){
      console.error(err);
      toast("프로필 사진 업로드 실패");
    }
  });

  // 프로필 UI (요청: 이름/부서 "-" 고정)
  const nameRow = el("div", { class:"profileRow" },
    el("div", { class:"profileKey" }, "성명"),
    el("div", { class:"profileVal" }, "-")
  );

  const roleSelect = el("select", {
    class:"select profileSelect",
    onchange:(e)=>{
      const v = e.target.value;
      if (!me) return;
      me.role = v;
      saveDB(db);
      toast("직급 변경 완료");
      const { tab, sub } = parseHash();
      enforceAuth(db, tab, sub);
      render();
    }
  });

  ROLE_ORDER.forEach(r=>{
    roleSelect.appendChild(el("option", { value:r }, ROLE_LABEL_KO[r] || r));
  });
  roleSelect.value = (me?.role || "staff");

  const roleRow = el("div", { class:"profileRow" },
    el("div", { class:"profileKey" }, "직급"),
    el("div", { class:"profileVal" }, roleSelect)
  );

  const deptRow = el("div", { class:"profileRow" },
    el("div", { class:"profileKey" }, "부서"),
    el("div", { class:"profileVal" }, "-")
  );

  host.innerHTML = "";
  host.appendChild(
    el("div", { class:"profileCard card" },
      el("div", { class:"profileTop" }, avatarBox, avatarInput),
      el("div", { class:"profileBody" }, nameRow, roleRow, deptRow)
    )
  );
}



     // =========================
  // Avatar upload preview
  // =========================
  const avatarInput = document.getElementById("avatarInput");
  const avatarPreview = document.getElementById("avatarPreview");
  const avatarPlaceholder = document.getElementById("avatarPlaceholder");

  if (avatarInput){
    avatarInput.onchange = (e)=>{
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const url = URL.createObjectURL(file);
      avatarPreview.src = url;
      avatarPreview.hidden = false;
      avatarPlaceholder.hidden = true;
    };
  }


  /***********************
   * UI RENDER: TABS / SIDE
   ***********************/
  function renderTopTabs(){
    const host = $("#topTabs");
    if (!host) return;
    host.innerHTML = "";

    const { tab:curTab } = parseHash();

    TOP_TABS.forEach(t=>{
      host.appendChild(
        el("button", {
          class: `top-tab ${curTab === t.key ? "active" : ""}`,
          onclick: ()=> setHash(t.key, firstMenuKey(t.key))
        }, t.label)
      );
    });
  }

  function pendingCount(db){
    return db.logs.filter(l => l.status === "submitted").length;
  }

 function renderSideMenu(db){
  const host = $("#sideMenu");
  if (!host) return;
  host.innerHTML = "";

  const { tab, sub } = parseHash();

  // ✅ 대쉬보드에서는 좌측 메뉴 자체가 필요 없음
  if (tab === "대쉬보드") return;

  const me = userById(db, getUserId(db));
  const menus = SIDE_MENUS[tab] || [];
  const allowedWork = (tab === "업무관리") ? allowedWorkRoutesFor(me) : null;

  menus.forEach(m=>{
    if (allowedWork && !allowedWork.has(m.key)) return;

    const badge =
      (tab === "업무관리" && m.badge === "pending")
        ? ` (${pendingCount(db)})`
        : "";

    host.appendChild(
      el("button", {
        class: `side-item ${sub === m.key ? "active" : ""}`,
        onclick: ()=> setHash(tab, m.key)
      }, `${m.label}${badge}`)
    );
  });
}


  function setRouteTitle(text){
    const t = $("#routeTitle");
    if (t) t.textContent = text || "";
  }

  /***********************
   * Aggregations (업무관리)
   ***********************/
  function computeProjectDays(db, projectId){
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
   * Control builders
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

   function normalizeTabKey(tabKey){
  // ✅ 대쉬보드는 탭에 없어도 라우트로는 허용(로고 홈 등)
  if (!tabKey) return "대쉬보드";
  if (tabKey === "Dashboard") return "대쉬보드";
  if (tabKey === "대쉬보드") return "대쉬보드";

  // ✅ TOP_TABS에 없는 탭이면 대쉬보드로 폴백
  const exists = TOP_TABS.some(t => t.key === tabKey);
  return exists ? tabKey : "대쉬보드";
}



     /***********************
   * VIEW: 대쉬보드 (NEW)
   * - 상단: 전자메일 / 게시판 (축소 카드)
   * - 하단: 전자결재 / 업무관리 / 일정관리 (축소 카드)
   * - 타이틀 클릭 시 해당 탭으로 이동
   ***********************/
  function viewHomeDashboard(db){
  const view = $("#view");
  if (!view) return;
  view.innerHTML = "";

  setRouteTitle("Dashboard");

  // ✅ 유틸: 날짜 정렬(문자열 기반)
  function sortByAtDesc(a, b){
    return String(b.at||"").localeCompare(String(a.at||""));
  }
  function sortByDateAsc(a, b){
    return String(a.date||"").localeCompare(String(b.date||""));
  }

  // ✅ 표시용 데이터 추출
  const inboxMails = (db.mails || []).filter(m => m.box === "inbox").slice().sort(sortByAtDesc).slice(0, 6);
  const recentPosts = (db.boardPosts || []).slice().sort((a,b)=>String(b.at||"").localeCompare(String(a.at||""))).slice(0, 7);
  const inboxApprovals = (db.approvals || []).filter(d => d.box === "inbox").slice().sort(sortByAtDesc).slice(0, 6);

  const upcoming = (db.staffSchedules || [])
    .slice()
    .sort(sortByDateAsc)
    .filter(x => x.date >= todayISO())
    .slice(0, 7);

  // 업무관리(기존 데이터 기반)
  const pending = pendingCount(db);
  const recentWorkLogs = db.logs
    .slice()
    .sort((a,b)=>String(b.submittedAt||"").localeCompare(String(a.submittedAt||"")))
    .slice(0, 6);

  // ✅ 카드 빌더(리스트형)
  function dashListCard({ title, subtitle, items, emptyText, onGo }){
    const head = el("div", { class:"dashCardHead" },
      el("button", { class:"dashCardTitleLink", onclick:onGo }, title),
      subtitle ? el("div", { class:"dashCardSub" }, subtitle) : el("div", { class:"dashCardSub muted" }, " ")
    );

    const list =
      (items && items.length)
        ? el("div", { class:"dashList" },
            ...items.map(it => el("div", { class:"dashItem" },
              el("div", { class:"dashItemTitle" }, it.title),
              el("div", { class:"dashItemMeta" }, it.meta || "")
            ))
          )
        : el("div", { class:"dashEmpty" }, emptyText || "자료가 존재하지 않습니다.");

    return el("div", { class:"dashCard card" }, head, list);
  }

  // ✅ 전자메일(받은메일함 리스트)
  const cardMail = dashListCard({
    title: "전자메일",
    subtitle: "받은메일함",
    items: inboxMails.map(m => ({
      title: m.subject,
      meta: `${m.from} · ${m.at}`
    })),
    emptyText: "받은메일함에 메일이 없습니다.",
    onGo: ()=> setHash("전자메일", "mail-inbox")
  });

  // ✅ 게시판(최근 게시물)
  const cardBoard = dashListCard({
    title: "게시판",
    subtitle: "최근 게시물",
    items: recentPosts.map(p => ({
      title: `[${(SIDE_MENUS["게시판"].find(x=>x.key===p.boardKey)?.label)||p.boardKey}] ${p.title}`,
      meta: `${p.writer} · ${p.at}`
    })),
    emptyText: "최근 게시물이 없습니다.",
    onGo: ()=> setHash("게시판", firstMenuKey("게시판"))
  });

  // ✅ 전자결재(받은결재함 리스트)
  const cardEA = dashListCard({
    title: "전자결재",
    subtitle: "받은결재함",
    items: inboxApprovals.map(d => ({
      title: d.title,
      meta: `${d.from} · ${d.at}`
    })),
    emptyText: "받은결재함에 문서가 없습니다.",
    onGo: ()=> setHash("전자결재", "ea-inbox")
  });

  // ✅ 업무관리(승인대기 + 최근 제출)
  const cardWork = dashListCard({
    title: "업무관리",
    subtitle: `승인대기 ${pending}건 · 최근 제출`,
    items: recentWorkLogs.length
      ? recentWorkLogs.map(l => {
          const p = projById(db, l.projectId);
          const w = userById(db, l.writerId);
          return {
            title: `${p?.projectName||"프로젝트"} · ${l.category}/${l.process} · ${l.ratio}%`,
            meta: `${w?.name||"-"} · ${l.submittedAt || l.date || ""}`
          };
        })
      : [],
    emptyText: "최근 제출된 업무일지가 없습니다.",
    onGo: ()=> setHash("업무관리", "log")
  });

  // ✅ 일정관리(다가오는 휴가/외근)
  const cardSchedule = dashListCard({
    title: "일정관리",
    subtitle: "다가오는 휴가/외근",
    items: upcoming.map(e => ({
      title: `${e.type} · ${e.name}`,
      meta: `${e.date} · ${e.note || ""}`.trim()
    })),
    emptyText: "다가오는 휴가/외근 일정이 없습니다.",
    onGo: ()=> setHash("일정관리", firstMenuKey("일정관리"))
  });

  // 레이아웃: 상단 2개(메일/게시판), 하단 3개(결재/업무/일정)
  const topRow = el("div", { class:"dashRow2" }, cardMail, cardBoard);
  const bottomRow = el("div", { class:"dashRow3" }, cardEA, cardWork, cardSchedule);

  view.appendChild(el("div", { class:"dashWrap" }, topRow, bottomRow));
}


  /***********************
   * VIEW: 게시판 (DB 기반 렌더링)
   ***********************/
  function viewBoard(db, sub){
    const view = $("#view");
    if (!view) return;
    view.innerHTML = "";

    const menus = SIDE_MENUS["게시판"] || [];
    const label = (menus.find(x=>x.key===sub)?.label) || "게시판";

    setRouteTitle(`게시판 · ${label}`);

    // ✅ sub(boardKey)에 해당하는 게시물만 보여줌
    const posts = (db.boardPosts || [])
      .filter(p => String(p.boardKey||"") === String(sub||""))
      .slice()
      .sort((a,b)=>String(b.at||"").localeCompare(String(a.at||"")))
      .slice(0, 30);

    const searchInput = el("input", { class:"input", placeholder:"검색(제목/작성자) - 데모", oninput:()=>draw() });
    const listHost = el("div", { class:"list" });

    function draw(){
      const q = (searchInput.value || "").trim().toLowerCase();

      const filtered = !q
        ? posts
        : posts.filter(p =>
            String(p.title||"").toLowerCase().includes(q) ||
            String(p.writer||"").toLowerCase().includes(q)
          );

      listHost.innerHTML = "";

      if (!filtered.length){
        listHost.appendChild(el("div", { class:"empty" }, "최근 게시물이 없습니다."));
        return;
      }

      filtered.forEach(p=>{
        listHost.appendChild(
          el("div", { class:"list-item" },
            el("div", { class:"list-title" }, p.title),
            el("div", { class:"list-sub" }, `${p.writer || "-"} · ${p.at || "-"}`)
          )
        );
      });
    }

    const top = el("div", { class:"card" },
      el("div", { class:"card-head" },
        el("div", { class:"card-title" }, label),
        el("div", { class:"row" },
          searchInput,
          el("button", { class:"btn" , onclick:()=>draw() }, "검색")
        )
      ),
      listHost
    );

    view.appendChild(el("div", { class:"stack" }, top));
    draw();
  }



  /***********************
   * VIEW: 전자메일 (placeholder)
   ***********************/
  function viewMail(db, sub){
  const view = $("#view");
  if (!view) return;
  view.innerHTML = "";

  const box = (sub === "mail-sent") ? "sent" : (sub === "mail-etc") ? "etc" : "inbox";
  setRouteTitle(`전자메일 · ${box === "inbox" ? "받은메일함" : box === "sent" ? "보낸메일함" : "기타"}`);

  const allItems = (db.mails || [])
    .filter(m => m.box === box)
    .slice()
    .sort((a,b)=>String(b.at||"").localeCompare(String(a.at||"")))
    .slice(0, 200); // ✅ 필요시 늘려도 됨

  // ✅ 검색 UI (메일목록 상단)
  const selField = el("select", { class:"select" },
    el("option", { value:"subject" }, "편지제목"),
    el("option", { value:"from" }, "보낸사람"),
    el("option", { value:"all" }, "제목+보낸사람")
  );

  const searchInput = el("input", {
    class:"input",
    placeholder:"검색어 입력",
    onkeydown:(e)=>{
      if (e.key === "Enter") draw();
    }
  });

  const btnSearch = el("button", { class:"btn", onclick:()=>draw() }, "찾기");

  const btnReset = el("button", {
    class:"btn ghost",
    onclick:()=>{
      searchInput.value = "";
      selField.value = "subject";
      draw();
    }
  }, "초기화");

  const tools = el("div", { class:"mail-toolbar" },
    selField,
    searchInput,
    btnSearch,
    btnReset
  );

  const listHost = el("div", { class:"list" });

  function draw(){
    const q = (searchInput.value || "").trim().toLowerCase();
    const field = selField.value;

    const filtered = !q ? allItems : allItems.filter(m=>{
      const s = String(m.subject||"").toLowerCase();
      const f = String(m.from||"").toLowerCase();
      if (field === "subject") return s.includes(q);
      if (field === "from") return f.includes(q);
      return s.includes(q) || f.includes(q);
    });

    // ✅ 건수 표시 업데이트
    countBadge.textContent = `${filtered.length}건`;

    listHost.innerHTML = "";
    if (!filtered.length){
      listHost.appendChild(el("div", { class:"empty" }, "자료가 존재하지 않습니다."));
      return;
    }

    filtered.slice(0, 30).forEach(m=>{
      listHost.appendChild(
        el("div", { class:"list-item" },
          el("div", { class:"list-title" }, m.subject),
          el("div", { class:"list-sub" }, `${m.from} · ${m.at}`)
        )
      );
    });
  }

  // ✅ 메일 목록 카드(폴더 카드 제거 → 단일 카드)
  const countBadge = el("div", { class:"badge" }, `${allItems.length}건`);

  const card = el("div", { class:"card" },
    el("div", { class:"card-head" },
      el("div", { class:"card-title" }, "메일 목록"),
      el("div", { class:"row" }, tools, countBadge)
    ),
    listHost
  );

  view.appendChild(el("div", { class:"stack" }, card));
  draw();
}



  /***********************
   * VIEW: 전자결재 (placeholder)
   ***********************/
  function viewEA(db, sub){
  const view = $("#view");
  if (!view) return;
  view.innerHTML = "";

  const box = (sub === "ea-sent") ? "sent" : "inbox";
  setRouteTitle(`전자결재 · ${box === "inbox" ? "받은결재함" : "보낸결재함"}`);

  const items = (db.approvals || [])
    .filter(d => d.box === box)
    .slice()
    .sort((a,b)=>String(b.at||"").localeCompare(String(a.at||"")))
    .slice(0, 30);

  view.appendChild(
    el("div", { class:"stack" },
      el("div", { class:"card" },
        el("div", { class:"card-head" },
          el("div", { class:"card-title" }, box === "inbox" ? "받은결재함" : "보낸결재함"),
          el("div", { class:"badge" }, `${items.length}건`)
        ),
        items.length
          ? el("div", { class:"list" },
              ...items.map(d => el("div", { class:"list-item" },
                el("div", { class:"list-title" }, d.title),
                el("div", { class:"list-sub" }, `${d.from} · ${d.at}`),
                el("div", { class:"list-sub" }, `상태: ${d.status || "-"}`)
              ))
            )
          : el("div", { class:"empty" }, "자료가 존재하지 않습니다.")
      )
    )
  );
}

   const FIN_URL = "https://eumditravel-oss.github.io/FIN2/"; // ✅ FIN 산출 링크(FIN2)



  /***********************
 * VIEW: 산출
 ***********************/
function viewCalc(db, sub){
  const view = $("#view");
  if (!view) return;

  view.innerHTML = "";
  setRouteTitle("산출");

  // sub: fin / etc
  const isFIN = (sub === "fin");
  const url = isFIN ? FIN_URL : "about:blank";

  // 우측 상단(노란 박스) - 새 창 열기 버튼
  const tools = el("div", { class: "viewTopTools" },
    el("button", {
      class: "btn",
      onclick: () => {
        if (url === "about:blank") return;
        window.open(url, "_blank", "noopener,noreferrer");
      },
      ...(url === "about:blank" ? { disabled:true } : {})
    }, "새 창으로 열기")
  );

  // 빨간 박스 영역 - iframe 임베드
  const wrap = el("div", { class: "embedWrap" },
    el("iframe", {
      class: "embedFrame",
      src: url,
      title: isFIN ? "FIN 산출" : "산출",
      loading: "lazy",
      referrerpolicy: "no-referrer"
    })
  );

  // etc(placeholder) 안내
  if (!isFIN){
    view.appendChild(
      el("div", { class:"card", style:"margin-bottom:10px;" },
        el("div", { class:"card-head" },
          el("div", { class:"card-title" }, "ㅇㅇ산출 (준비중)")
        ),
        el("div", { class:"muted", style:"padding:12px;" },
          "현재는 FIN산출만 연결되어 있습니다."
        )
      )
    );
  }

  view.appendChild(tools);
  view.appendChild(wrap);
}



  /***********************
   * VIEW: 일정관리 (휴가/회사일정 placeholder)
   ***********************/
  function viewSchedule(db, sub){
    const view = $("#view");
    if (!view) return;
    view.innerHTML = "";

    const title = (sub === "vacation") ? "휴가관리" : "회사공식일정";
    setRouteTitle(`일정관리 · ${title}`);

    // 공정관리 캘린더와 유사한 UI 골격만 (데이터/저장은 추후)
    let base = new Date(); base.setDate(1);
    let months = 1;

    const monthText = el("div", { class:"cal-month-title" });
    const btnPrev = el("button", { class:"pill-btn", onclick:()=>{ base.setMonth(base.getMonth()-1); rerender(); } }, "◀");
    const btnNext = el("button", { class:"pill-btn", onclick:()=>{ base.setMonth(base.getMonth()+1); rerender(); } }, "▶");

    const selMonths = el("select", { class:"select", onchange:(e)=>{ months = Number(e.target.value); rerender(); } },
      el("option", { value:"1" }, "1달"),
      el("option", { value:"3" }, "3달")
    );

    const toolbar = el("div", { class:"card cal-toolbar" },
      el("div", { class:"left" }, btnPrev, monthText, btnNext),
      el("div", { class:"right" },
        el("div", { style:"display:flex;flex-direction:column;gap:6px;min-width:120px;" },
          el("div", { class:"muted", style:"font-weight:1000;font-size:12px;" }, "기간"),
          selMonths
        )
      )
    );

    const host = el("div", { class:"stack" });

    function monthLabel(d){
      return `${d.getFullYear()}-${pad2(d.getMonth()+1)} (표시: ${months}달)`;
    }

    // 데모 칩(아이덴티티 유지용)
    function demoChipsFor(dateISO){
      // 아주 소량 규칙으로만 표시(저장 X)
      const day = Number(dateISO.slice(-2));
      if (sub === "vacation"){
        if (day === 3) return ["연차(샘플)"];
        if (day === 12) return ["반차(샘플)"];
        return [];
      } else {
        if (day === 5) return ["월간회의(샘플)"];
        if (day === 20) return ["워크샵(샘플)"];
        return [];
      }
    }

    function openDay(dateISO){
      const items = demoChipsFor(dateISO);
      const body = el("div", { class:"stack" },
        items.length
          ? el("div", { class:"list" }, ...items.map(t=>el("div",{class:"list-item"},
              el("div",{class:"list-title"}, t),
              el("div",{class:"list-sub"}, "MVP: 상세/등록 기능은 추후 연결")
            )))
          : el("div", { class:"empty" }, "등록된 일정이 없습니다.")
      );
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

      for (let i=0;i<startDow;i++) grid.appendChild(el("div", { class:"cal-cell cal-empty" }));

      for (let day=1; day<=daysInMonth; day++){
        const dateISO = `${y}-${pad2(m+1)}-${pad2(day)}`;
        const items = demoChipsFor(dateISO);

        const cell = el("div", { class:"cal-cell" },
          el("div", { class:"cal-day" }, String(day)),
          items.length ? el("div", { class:"chips" },
            ...items.slice(0,4).map(t=>el("div",{class:"chip"},t))
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
   * VIEW: 업무관리(기존) - route key 기반
   ***********************/
  function makeEmptyEntry(db){
    const p = db.projects[0]?.projectId || "";
    return { projectId: p, category:"구조", process: PROCESS_MASTER["구조"][0], ratio:50, content:"" };
  }

  function viewLog(db){
    const view = $("#view");
    view.innerHTML = "";

    setRouteTitle("업무관리 · 업무일지");

    const uid = getUserId(db);
    const dateInput = el("input", { class:"input", type:"date", value: todayISO() });

    let entries = [ makeEmptyEntry(db) ];
    const entriesHost = el("div", { class:"stack" });

    function rerenderEntries(){
      entriesHost.innerHTML = "";
      entries.forEach((ent, idx) => entriesHost.appendChild(renderEntryCard(ent, idx)));
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

  function viewApprove(db){
    const view = $("#view");
    view.innerHTML = "";

    setRouteTitle("업무관리 · 승인");

    const uid = getUserId(db);
    const submitted = db.logs.filter(l => l.status === "submitted")
      .sort((a,b)=>(a.submittedAt||"").localeCompare(b.submittedAt||""));

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

  function viewDashboard(db){
    const view = $("#view");
    view.innerHTML = "";

    setRouteTitle("업무관리 · 프로젝트 소요시간");

    const stats = db.projects.map(p=>{
      const days = computeProjectDays(db, p.projectId);
      const headcount = computeProjectHeadcount(db, p.projectId);
      const approvedEntries = db.logs.filter(l=>l.status==="approved" && l.projectId===p.projectId).length;
      return { ...p, days, headcount, approvedEntries };
    });

    let selected = stats[0]?.projectId || "";

    const h = location.hash;
    const m = h.match(/[?&]p=([^&]+)/);
    if (m && db.projects.some(p=>p.projectId===decodeURIComponent(m[1]))) selected = decodeURIComponent(m[1]);

    const left = el("div", { class:"card" },
      el("div", { class:"card-head" }, el("div", { class:"card-title" }, "Project List")),
      stats.length ? el("div", { class:"list" },
        ...stats.map(s=>{
          const btn = el("button", { class:"btn ghost", style:"width:100%;text-align:left;" }, "");
          btn.addEventListener("click", ()=>{
            selected = s.projectId;
            history.replaceState(null, "", `#업무관리/dashboard?p=${encodeURIComponent(selected)}`);
            render();
          });

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

    view.appendChild(
      el("div", { class:"dash" },
        left,
        el("div", { class:"stack" }, rightTop, rightBottom)
      )
    );
  }

  /***********************
   * VIEW: 업무관리 · 종합 공정관리 (기존 calendar 로직 유지)
   ***********************/
  function viewWorkCalendar(db){
    const view = $("#view");
    view.innerHTML = "";

    setRouteTitle("업무관리 · 종합 공정관리");

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

      for (let i=0;i<startDow;i++) grid.appendChild(el("div", { class:"cal-cell cal-empty" }));

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
   * Checklist helpers
   ***********************/
  function confirmChecklist(item, confirmerId){
    ensureChecklistShape(item);
    const exists = item.confirmations.some(c => c.userId === confirmerId);
    if (!exists){
      item.confirmations.push({ userId: confirmerId, at: nowISO() });
    } else {
      const c = item.confirmations.find(x => x.userId === confirmerId);
      if (c) c.at = nowISO();
    }
  }

  function setChecklistDone(db, item, done){
    ensureChecklistShape(item);
    if (done){
      item.status = "done";
      item.doneBy = getUserId(db);
      item.doneAt = nowISO();
    } else {
      item.status = "open";
      item.doneBy = "";
      item.doneAt = "";
    }
  }

  /***********************
   * VIEW: 체크리스트 작성/관리 (Leader+)
   ***********************/
  function viewChecklist(db){
    const view = $("#view");
    view.innerHTML = "";

    setRouteTitle("업무관리 · 프로젝트별 체크리스트");

    const uid = getUserId(db);
    const me = userById(db, uid);

    if (!isLeaderPlus(me)){
      setHash("업무관리","checklist-view");
      return;
    }

    let selectedProjectId = db.projects[0]?.projectId || "";

    const projectSel = buildProjectSelect(db, selectedProjectId, (v)=>{
      selectedProjectId = v;
      draw();
    });

    const titleInput = el("input", { class:"input", placeholder:"체크리스트 제목(예: H10 → H13 변경)" });
    const descInput  = el("textarea", { class:"textarea", rows:"3", placeholder:"설명(선택)" });

    const assigneeSel = el("select", { class:"select" },
      ...db.users
        .filter(u => u.role === "staff")
        .map(u => el("option", { value:u.userId }, `${u.name} (${ROLE_LABEL[u.role]})`))
    );

    const imageInput = el("input", { class:"input", type:"file", accept:"image/*" });

    const addBtn = el("button", {
      class:"btn primary",
      onclick: async ()=>{
        const title = titleInput.value.trim();
        if (!title) return toast("체크리스트 제목을 입력해 주세요.");

        const assigneeId = assigneeSel.value;
        let imageDataUrl = "";
        const file = imageInput.files?.[0];
        if (file) imageDataUrl = await fileToDataURL(file);

        db.checklists.push(ensureChecklistShape({
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
          doneAt: "",
          confirmations: []
        }));

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
        .map(ensureChecklistShape)
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

        const btnConfirm = el("button", {
          class:"btn tiny",
          onclick:()=>{
            confirmChecklist(it, uid);
            saveDB(db);
            toast("확인 기록 저장");
            draw();
          }
        }, "확인");

        const confirmText = it.confirmations.length
          ? it.confirmations
              .slice()
              .sort((a,b)=> (b.at||"").localeCompare(a.at||""))
              .map(c => `${userById(db,c.userId)?.name||"-"}(${c.at})`)
              .join(" · ")
          : "확인 기록 없음";

        const title = el("div", { class:`list-title ${it.status==="done" ? "done-title" : ""}` }, it.title);

        const meta = el("div", { class:"meta-line" },
          el("span",{class:"pill-mini orange"},`담당: ${assignee?.name||"-"}`),
          el("span",{class:"pill-mini"},`작성: ${writer?.name||"-"} · ${it.createdAt||"-"}`),
          it.status==="done"
            ? el("span",{class:"pill-mini green"},`체크완료: ${doneBy?.name||"-"} · ${it.doneAt||"-"}`)
            : el("span",{class:"pill-mini"},`체크완료: -`)
        );

        const confirmMeta = el("div", { class:"list-sub", style:"margin-top:6px;" }, `확인: ${confirmText}`);
        const desc = it.description ? el("div", { class:"list-sub" }, it.description) : null;

        const btnView = it.imageDataUrl
          ? el("button", {
              class:"btn tiny ghost",
              onclick:()=>{
                const body = el("div",{}, el("img",{src:it.imageDataUrl, style:"max-width:100%;border-radius:12px;display:block;"}));
                const foot = el("div",{}, el("button",{class:"btn", onclick:modalClose},"닫기"));
                modalOpen("이미지 보기", body, foot);
              }
            }, "이미지")
          : el("span", { class:"muted", style:"font-size:12px;" }, "이미지 없음");

        const delBtn = el("button", {
          class:"btn tiny ghost",
          onclick:()=>{
            if (!confirm("이 체크리스트 항목을 삭제할까요?")) return;
            db.checklists = db.checklists.filter(x => x.itemId !== it.itemId);
            saveDB(db);
            toast("삭제 완료");
            draw();
          }
        }, "삭제");

        const headRight = el("div", { class:"row" }, btnView, btnConfirm, delBtn);

        listHost.appendChild(
          el("div", { class:`list-item ${it.status==="done" ? "done" : ""}` },
            el("div", { class:"row", style:"justify-content:space-between;align-items:flex-start;gap:10px;" },
              el("div", { style:"min-width:0;" },
                title,
                meta,
                desc,
                confirmMeta
              ),
              headRight
            )
          )
        );
      }
    }

    view.appendChild(
      el("div", { class:"stack" },
        el("div", { class:"card" },
          el("div", { class:"card-head" },
            el("div", { class:"card-title" }, "체크리스트 작성"),
            el("div", { class:"row" },
              el("div", { class:"muted", style:"font-weight:1000;font-size:12px;" }, "프로젝트"),
              projectSel
            )
          ),
          el("div", { class:"grid2" },
            el("div", {},
              el("div", { class:"muted", style:"font-weight:1000;font-size:12px;margin:2px 0 6px;" }, "제목"),
              titleInput
            ),
            el("div", {},
              el("div", { class:"muted", style:"font-weight:1000;font-size:12px;margin:2px 0 6px;" }, "담당자(staff)"),
              assigneeSel
            )
          ),
          el("div", { class:"grid2" },
            el("div", {},
              el("div", { class:"muted", style:"font-weight:1000;font-size:12px;margin:2px 0 6px;" }, "설명(선택)"),
              descInput
            ),
            el("div", {},
              el("div", { class:"muted", style:"font-weight:1000;font-size:12px;margin:2px 0 6px;" }, "이미지 첨부(선택)"),
              imageInput
            )
          ),
          el("div", { class:"row", style:"justify-content:flex-end;margin-top:10px;" }, addBtn)
        ),

        el("div", { class:"card" },
          el("div", { class:"card-head" },
            el("div", { class:"card-title" }, "체크리스트 목록"),
            el("div", { class:"badge" }, "Leader+ 관리 화면")
          ),
          listHost
        )
      )
    );

    draw();
  }

  /***********************
   * VIEW: 체크리스트 목록 (staff도 접근)
   ***********************/
  function viewChecklistView(db){
    const view = $("#view");
    view.innerHTML = "";

    setRouteTitle("업무관리 · 체크리스트 목록");

    const uid = getUserId(db);
    const me = userById(db, uid);

    let selectedProjectId = db.projects[0]?.projectId || "";
    const projectSel = buildProjectSelect(db, selectedProjectId, (v)=>{
      selectedProjectId = v;
      draw();
    });

    const listHost = el("div", { class:"list" });

    function draw(){
      listHost.innerHTML = "";

      const items = db.checklists
        .map(ensureChecklistShape)
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

        // ✅ staff만 체크 가능
        const canCheck = isStaff(me);

        const check = el("input", {
          type:"checkbox",
          class:"chk",
          checked: it.status === "done",
          disabled: !canCheck,
          onchange:()=>{
            setChecklistDone(db, it, check.checked);
            saveDB(db);
            toast(check.checked ? "체크 완료 기록" : "체크 해제");
            draw();
          }
        });

        const title = el("div", { class:`list-title ${it.status==="done" ? "done-title" : ""}` }, it.title);

        const meta = el("div", { class:"meta-line" },
          el("span",{class:"pill-mini orange"},`담당: ${assignee?.name||"-"}`),
          el("span",{class:"pill-mini"},`작성: ${writer?.name||"-"} · ${it.createdAt||"-"}`),
          it.status==="done"
            ? el("span",{class:"pill-mini green"},`체크완료: ${doneBy?.name||"-"} · ${it.doneAt||"-"}`)
            : el("span",{class:"pill-mini"},`체크완료: -`)
        );

        const confirmText = it.confirmations.length
          ? it.confirmations
              .slice()
              .sort((a,b)=> (b.at||"").localeCompare(a.at||""))
              .map(c => `${userById(db,c.userId)?.name||"-"}(${c.at})`)
              .join(" · ")
          : "확인 기록 없음";

        const confirmMeta = el("div", { class:"list-sub", style:"margin-top:6px;" }, `확인: ${confirmText}`);
        const desc = it.description ? el("div", { class:"list-sub" }, it.description) : null;

        // ✅ leader+는 확인 버튼(검토 기록) 가능
        const btnConfirm = el("button", {
          class:"btn tiny",
          disabled: !isLeaderPlus(me),
          onclick:()=>{
            confirmChecklist(it, uid);
            saveDB(db);
            toast("확인 기록 저장");
            draw();
          }
        }, "확인");

        const btnView = it.imageDataUrl
          ? el("button", {
              class:"btn tiny ghost",
              onclick:()=>{
                const body = el("div",{}, el("img",{src:it.imageDataUrl, style:"max-width:100%;border-radius:12px;display:block;"}));
                const foot = el("div",{}, el("button",{class:"btn", onclick:modalClose},"닫기"));
                modalOpen("이미지 보기", body, foot);
              }
            }, "이미지")
          : el("span", { class:"muted", style:"font-size:12px;" }, "이미지 없음");

        listHost.appendChild(
          el("div", { class:`list-item ${it.status==="done" ? "done" : ""}` },
            el("div", { class:"row", style:"justify-content:space-between;align-items:flex-start;gap:10px;" },
              el("div", { style:"min-width:0;display:flex;gap:10px;align-items:flex-start;" },
                check,
                el("div", { style:"min-width:0;" },
                  title,
                  meta,
                  desc,
                  confirmMeta
                )
              ),
              el("div", { class:"row" }, btnView, btnConfirm)
            )
          )
        );
      }
    }

    view.appendChild(
      el("div", { class:"stack" },
        el("div", { class:"card" },
          el("div", { class:"card-head" },
            el("div", { class:"card-title" }, "체크리스트 목록(프로젝트별)"),
            el("div", { class:"row" },
              el("div", { class:"muted", style:"font-weight:1000;font-size:12px;" }, "프로젝트"),

              projectSel
            )
          ),
          listHost
        )
      )
    );

    draw();
  }

  /***********************
   * VIEW: 업무관리 라우팅 디스패처
   ***********************/
  function viewWork(db, sub){
    if (sub === "log") viewLog(db);
    else if (sub === "approve") viewApprove(db);
    else if (sub === "dashboard") viewDashboard(db);
    else if (sub === "calendar") viewWorkCalendar(db);
    else if (sub === "checklist") viewChecklist(db);
    else if (sub === "checklist-view") viewChecklistView(db);
    else {
      // fallback
      setHash("업무관리", "log");
      viewLog(db);
    }
  }


   /***********************
 * LEFT: 다가오는 생일 위젯
 ***********************/
function renderLeftBirthdays(db){
  const host = $("#birthdayCard");
  if (!host) return;

  const items = Array.isArray(db.birthdays) ? db.birthdays.slice() : [];

  // ✅ 오늘 기준 “다가오는 순” 정렬 (MM-DD -> 다음 발생일 계산)
  function nextTime(md){
    const [mm, dd] = String(md||"").split("-").map(Number);
    if (!mm || !dd) return Number.POSITIVE_INFINITY;

    const now = new Date();
    const y = now.getFullYear();

    const t0 = new Date(y, mm - 1, dd, 0, 0, 0, 0);
    if (t0 >= new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0,0,0,0)) return t0.getTime();

    const t1 = new Date(y + 1, mm - 1, dd, 0, 0, 0, 0);
    return t1.getTime();
  }

  items.sort((a,b)=> nextTime(a.md) - nextTime(b.md));
  const top = items.slice(0, 8);

  const body =
    top.length
      ? el("div", { class:"bdayGrid" },
          ...top.map(x=>{
            const md = String(x.md||"-- --");
            const name = String(x.name||"ㅇㅇㅇ 사원");

            return el("div", { class:"bdayItem" },
              el("div", { class:"bdayAvatar" }, "👤"),
              el("div", { class:"bdayName" }, name),
              el("div", { class:"bdayDate" }, md)
            );
          })
        )
      : el("div", { class:"bdayEmpty" }, "다가오는 생일이 없습니다.");

  host.innerHTML = "";
  host.appendChild(
    el("div", { class:"bdayCard card" },
      el("div", { class:"bdayHead" },
        el("div", { class:"bdayTitle" }, "다가오는 생일")
      ),
      body
    )
  );
}


  /***********************
   * Global Render (탭/좌측메뉴 기반)
   ***********************/
  function render(){
    const db = ensureDB();

    const { tab, sub } = parseHash();
    enforceAuth(db, tab, sub);

    // 상단 탭/좌측 메뉴
    renderTopTabs();
    renderSideMenu(db);
    renderLeftProfile(db);
renderLeftBirthdays(db); // ✅ 추가



    
    // 승인 배지(기존 상단 뱃지 유지용 - 있으면 업데이트)
    const b = $("#badgePending");
    if (b) b.textContent = String(pendingCount(db));

        // 메인 뷰
    const view = $("#view");
    if (!view) return;

    if (tab === "대쉬보드") viewHomeDashboard(db);
    else if (tab === "전자메일") viewMail(db, sub);
    else if (tab === "게시판") viewBoard(db, sub);
    else if (tab === "전자결재") viewEA(db, sub);
    else if (tab === "산출") viewCalc(db, sub);
    else if (tab === "일정관리") viewSchedule(db, sub);
    else if (tab === "업무관리") viewWork(db, sub);
      else {
    setHash("대쉬보드", "home");
    viewHomeDashboard(db);
  }
} // ✅ render() 종료 ← 이 줄이 반드시 있어야 함

/***********************
 * Wire events
 ***********************/
async function boot(){
  ensureDB();


    // ✅ 시작 시: 시트에서 최신 DB 자동 로드 → 로컬 캐시 갱신 → 화면 렌더
    // ✅ 시작 시: 시트에서 최신 DB 자동 로드 → 로컬 캐시 갱신 → 화면 렌더
if (AUTO_PULL_ON_START){
  isPulling = true;
  try{
    const data = await sheetsExport();
    if (data && data.ok){
      const db = sheetsPayloadToDB(data);
      // ✅ Pull 결과 저장은 "직접 localStorage"로 저장 (자동 push 방지)
      localStorage.setItem(LS_KEY, JSON.stringify(db));
      toast("✅ 시트에서 최신 데이터 불러옴");
    } else {
      toast("ℹ️ 시트 로드 생략/실패 → 로컬 데이터 사용");
    }
  }catch(err){
    // ✅ 콘솔 빨간 에러 최소화(원하면 console.error로 되돌려도 됨)
    toast("ℹ️ 시트 로드 실패(CORS 등) → 로컬 데이터 사용");
  }finally{
    isPulling = false;
  }
}


    // modal
    $("#modalClose")?.addEventListener("click", modalClose);
    $("#modalBackdrop")?.addEventListener("click", (e)=>{
      if (e.target === $("#modalBackdrop")) modalClose();
    });

    

    // reset demo
$("#btnResetDemo")?.addEventListener("click", ()=>{
  if (!confirm("데모 데이터를 초기화할까요? (localStorage 초기화)")) return;
  localStorage.removeItem(LS_KEY);
  localStorage.removeItem(LS_USER);
  toast("데모 데이터 초기화");
  render();
});

// sheets backup (수동 Push)
$("#btnSheetBackup")?.addEventListener("click", async ()=>{
  if (!SHEETS_ENABLED){
    toast("ℹ️ 시트 백업이 비활성화되어 있습니다. (SHEETS_ENABLED=true 필요)");
    return;
  }
  try{
    const db = ensureDB();
    const payload = dbToSheetsPayload(db);
    const res = await sheetsImport(payload);
    if (res && res.ok) toast("✅ 시트로 백업 완료");
    else toast("❌ 백업 실패(시트 응답 오류)");
  }catch(err){
    console.error(err);
    toast("❌ 백업 실패(콘솔 확인)");
  }
});

// sheets restore (수동 Pull)
$("#btnSheetRestore")?.addEventListener("click", async ()=>{
  if (!SHEETS_ENABLED){
    toast("ℹ️ 시트 복원이 비활성화되어 있습니다. (SHEETS_ENABLED=true 필요)");
    return;
  }

  isPulling = true;
  try{
    const data = await sheetsExport();
    if (!data || !data.ok){
      toast("❌ 시트 export 실패");
      return;
    }
    const db = sheetsPayloadToDB(data);
    localStorage.setItem(LS_KEY, JSON.stringify(db));
    toast("✅ 시트에서 복원 완료");
    render();
  }catch(err){
    console.error(err);
    toast("❌ 복원 실패(콘솔 확인)");
  }finally{
    isPulling = false;
  }
});



    // route
    window.addEventListener("hashchange", render);

        // default route (탭/서브 구조)
    if (!location.hash) setHash("대쉬보드", "home");

     // ✅ logo -> dashboard home
document.getElementById("logoHome")?.addEventListener("click", (e)=>{
  e.preventDefault();
  setHash("대쉬보드", "home");
});


    render();
  }

  document.addEventListener("DOMContentLoaded", boot);

})();

