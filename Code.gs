// === CON COST MVP Sheets Gateway (No Auth) ===
const SHEET_NAMES = ["meta","projects","users","logs","checklists"];

function doGet(e) {
  const action = (e.parameter.action || "").toLowerCase();

  if (action === "ping") {
    return json({ ok:true, ts: new Date().toISOString() });
  }

  if (action === "export") {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const payload = readAll(ss);
    return json(payload);
  }

  return json({ ok:false, error:"Unknown action. Use ?action=ping or ?action=export" });
}

function doPost(e) {
  const action = (e.parameter.action || "").toLowerCase();
  const body = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : null;

  if (action === "import") {
    if (!body) return json({ ok:false, error:"No JSON body" });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    writeAll(ss, body);
    return json({ ok:true });
  }

  return json({ ok:false, error:"Unknown action. Use POST ?action=import" });
}

function readAll(ss){
  const out = { ok:true, exportedAt: new Date().toISOString() };

  SHEET_NAMES.forEach(name => {
    const sh = ensureSheet(ss, name);
    const values = sh.getDataRange().getValues();
    // values: 2D array. If empty, it will be [[...]] sometimes; normalize.
    out[name] = values && values.length ? values : [];
  });

  return out;
}

function writeAll(ss, payload){
  SHEET_NAMES.forEach(name => {
    const sh = ensureSheet(ss, name);
    sh.clearContents();

    const values = payload[name] || [];
    if (values && values.length){
      sh.getRange(1,1, values.length, values[0].length).setValues(values);
    }
  });
}

function ensureSheet(ss, name){
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function json(obj){
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
