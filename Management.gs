/*******************************************************
 * TCB-স্টাইল ডিলার ম্যানেজমেন্ট সফটওয়্যার
 * Management.gs — ব্যবস্থাপনা: এজেন্সি সেটাপ, ডিলার সেটাপ/লিস্ট,
 * এবং প্রতি ডিলারের নিজস্ব "সম্পর্কে" তথ্য
 *
 * MasterRegistry এর একই Apps Script প্রজেক্টে নতুন ফাইল
 * হিসেবে যোগ করুন (নাম দিন: Management)
 *
 * ================= গুরুত্বপূর্ণ ধারণা =================
 * এজেন্সি-লেভেল কাজ (এজেন্সি সেটাপ, ডিলার তৈরি/এডিট/নমিনি এডিট) —
 * এগুলো মূল এজেন্সির নিজস্ব "AGENCY" লগইন দিয়ে করতে হবে, কোনো
 * সাধারণ ডিলারের Admin দিয়ে নয়। একবার নিচের
 * createAgencyAdminOnce() ফাংশনটি ম্যানুয়ালি রান করে মূল
 * এজেন্সির জন্য একটি লগইন তৈরি করে নিন।
 *
 * প্রতিটি ডিলারের নিজস্ব "সম্পর্কে" তথ্য (যা তার সাইটের "সম্পর্কে"
 * মেনুতে দেখা যাবে) — এটি সেই ডিলারের নিজের Admin এডিট করতে পারবে,
 * কারণ এটি তার নিজের Spreadsheet এর "About" ট্যাবে থাকে।
 *******************************************************/

const AGENCY_ID = "AGENCY";

/*******************************************************
 * পারফরম্যান্স: এজেন্সি-লেভেল রিড-হেভি ডাটা (ডিলার তালিকা, এজেন্সি
 * তথ্য, সংস্থার তথ্য) ক্যাশ করা — এগুলো কম পরিবর্তন হয় কিন্তু প্রতিটি
 * ডিলারের প্রতিটি পেজ লোডে বারবার পড়া হয়, তাই ক্যাশ করলে বড় গতি লাভ হয়
 *******************************************************/
function invalidateAgencyCaches() {
  const cache = CacheService.getScriptCache();
  cache.removeAll(["dealers_cache_v1", "agency_info_cache_v3", "about_info_cache_v1"]);
}

/*******************************************************
 * একবার ম্যানুয়ালি রান করুন — মূল এজেন্সির জন্য প্রথম লগইন তৈরি হবে
 * (ফাংশন ড্রপডাউন থেকে createAgencyAdminOnce সিলেক্ট করে ▶ Run করুন,
 * নিচের username/password চাইলে বদলে নিন)
 *******************************************************/
function createAgencyAdminOnce() {
  const masterSS = getMasterSS();
  const usersSheet = getSheet(masterSS, "Users");

  const username = "agencyadmin";      // চাইলে বদলান
  const password = "ChangeThis123";    // অবশ্যই পরে বদলে নিন

  const userId = generateId(usersSheet, "U");
  usersSheet.appendRow([
    userId,
    AGENCY_ID,
    username,
    password,
    "Admin",
    "মূল ডিপু এডমিন",
    ""
  ]);

  SpreadsheetApp.getUi().alert(
    "ডিপু এডমিন তৈরি হয়েছে।\nইউজারনেম: " + username + "\nপাসওয়ার্ড: " + password +
    "\n\nঅনুগ্রহ করে লগইন করার পর এই পাসওয়ার্ড অবশ্যই পরিবর্তন করুন।"
  );
}

/*******************************************************
 * এজেন্সি-লেভেল পারমিশন চেক (শুধু AGENCY_ID এর Admin)
 *******************************************************/
function checkAgencyPermission(token) {
  const perm = checkPermission(token, ["Admin"]);
  if (!perm.ok) return perm;
  if (perm.payload.dealerId !== AGENCY_ID) {
    return { ok: false, message: "এই কাজ শুধুমাত্র মূল ডিপু করতে পারবে" };
  }
  return perm;
}

/*=========================================================
 *  এজেন্সি সেটাপ (নাম, মোবাইল নং, লোগো)
 *=======================================================*/
function getAgencyInfo(data) {
  // এজেন্সির নাম/মোবাইল/লোগো/ব্যবস্থাপক তালিকা/সোশ্যাল লিংক — স্পর্শকাতর
  // তথ্য না, তাই ডিলার ও এজেন্সি উভয়েই দেখতে পারবে (মেনুবার লোগো,
  // ফেভিকন, ফুটার, "আমাদের সম্পর্কে" ইত্যাদিতে ব্যবহারের জন্য); শুধু
  // এডিট (updateAgencyInfo) এজেন্সি-নির্দিষ্ট থাকবে
  const perm = checkPermission(data.token, ["Admin", "প্রতিনিধি"]);
  if (!perm.ok) return { success: false, message: perm.message };

  const cache = CacheService.getScriptCache();
  const cached = cache.get("agency_info_cache_v3");
  if (cached) return { success: true, agency: JSON.parse(cached) };

  const masterSS = getMasterSS();
  const sheet = getSheet(masterSS, "Agency");
  const rows = genericListRows(sheet);
  const raw = rows.length > 0 ? rows[0] : {
    "নাম": "", "মোবাইল": "", "লোগো(URL)": "",
    "ব্যবস্থাপক তালিকা (JSON)": "[]",
    "Facebook Link": "", "Youtube Link": ""
  };

  let managers = [];
  try { managers = JSON.parse(raw["ব্যবস্থাপক তালিকা (JSON)"] || "[]"); } catch (e) { managers = []; }

  const info = {
    "নাম": raw["নাম"] || "",
    "মোবাইল": raw["মোবাইল"] || "",
    "লোগো(URL)": raw["লোগো(URL)"] || "",
    "managers": managers,
    "Facebook Link": raw["Facebook Link"] || "",
    "Youtube Link": raw["Youtube Link"] || ""
  };

  try { cache.put("agency_info_cache_v3", JSON.stringify(info), 60); } catch (e) { /* বাদ */ }

  return { success: true, agency: info };
}

function updateAgencyInfo(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  const masterSS = getMasterSS();
  const sheet = getSheet(masterSS, "Agency");
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rows = genericListRows(sheet);
  const existing = rows.length > 0 ? rows[0] : {};

  // নতুন লোগো ছবি (base64, ফ্রন্টএন্ডেই কমপ্রেসড) দেওয়া থাকলে সরাসরি সেভ
  let logoUrl = data.logoUrl || "";
  let photoWarning = "";
  if (data.logoBase64) {
    const processed = processImageForStorage(data.logoBase64);
    if (processed === null) { photoWarning = " (⚠️ লোগো ছবি খুব বড়, সেভ হয়নি — ছোট ছবি দিয়ে আবার চেষ্টা করুন)"; }
    else { logoUrl = processed; }
  }

  // ব্যবস্থাপক তালিকা — একাধিক ব্যবস্থাপক (নাম, পদবি, মোবাইল) JSON আকারে সংরক্ষণ
  const managersJson = data.managers ? JSON.stringify(data.managers) : (existing["ব্যবস্থাপক তালিকা (JSON)"] || "[]");

  const fieldMap = {
    "নাম": data.নাম,
    "মোবাইল": data.mobile,
    "লোগো(URL)": logoUrl,
    "ব্যবস্থাপক তালিকা (JSON)": managersJson,
    "Facebook Link": data.facebookLink,
    "Youtube Link": data.youtubeLink
  };

  const rowValues = headers.map(function (h) {
    if (h === "লোগো(URL)") return logoUrl || existing[h] || "";
    if (h === "ব্যবস্থাপক তালিকা (JSON)") return managersJson;
    const v = fieldMap[h];
    return (v !== undefined && v !== null && v !== "") ? v : (existing[h] || "");
  });

  if (rows.length === 0) {
    sheet.appendRow(rowValues);
  } else {
    sheet.getRange(2, 1, 1, headers.length).setValues([rowValues]);
  }
  sheet.getRange(2, headers.indexOf("মোবাইল") + 1).setNumberFormat("@");
  sheet.getRange(2, headers.indexOf("ব্যবস্থাপকের মোবাইল") + 1).setNumberFormat("@");
  invalidateAgencyCaches();

  return { success: true, message: "ডিপু তথ্য সংরক্ষিত হয়েছে" + photoWarning };
}

/*=========================================================
 *  ডিলার তালিকা / এডিট / স্ট্যাটাস (এজেন্সি-লেভেল)
 *=======================================================*/
function listDealers(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  const cache = CacheService.getScriptCache();
  const cached = cache.get("dealers_cache_v1");
  if (cached) return { success: true, dealers: JSON.parse(cached) };

  const masterSS = getMasterSS();
  const dealersSheet = getSheet(masterSS, "Dealers");
  const nomineeSheet = getSheet(masterSS, "DealerNominee");

  const dealers = genericListRows(dealersSheet);
  const nominees = genericListRows(nomineeSheet);

  dealers.forEach(function (d) {
    d.nominee = nominees.find(function (n) { return n["DealerID"] === d["DealerID"]; }) || null;
  });

  try { cache.put("dealers_cache_v1", JSON.stringify(dealers), 30); } catch (e) { /* খুব বড় হলে বাদ */ }

  return { success: true, dealers: dealers };
}

function updateDealerInfo(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  const masterSS = getMasterSS();
  const sheet = getSheet(masterSS, "Dealers");
  const ok = genericUpdateRow(sheet, "DealerID", data.dealerId, data.fields || {});
  invalidateAgencyCaches();

  return { success: ok, message: ok ? "ডিলার তথ্য আপডেট হয়েছে" : "ডিলার পাওয়া যায়নি" };
}

function setDealerStatus(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  const masterSS = getMasterSS();
  const sheet = getSheet(masterSS, "Dealers");
  const ok = genericUpdateRow(sheet, "DealerID", data.dealerId, { "স্ট্যাটাস": data.status });
  invalidateAgencyCaches();

  return { success: ok, message: ok ? "স্ট্যাটাস পরিবর্তন হয়েছে" : "ডিলার পাওয়া যায়নি" };
}

function updateDealerNominee(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  const masterSS = getMasterSS();
  const sheet = getSheet(masterSS, "DealerNominee");
  const existingRowIndex = genericFindRowIndex(sheet, "DealerID", data.dealerId);

  if (existingRowIndex === -1) {
    const nomineeId = generateId(sheet, "N");
    genericAddRow(sheet, {
      "NomineeID": nomineeId,
      "DealerID": data.dealerId,
      "নমিনির নাম": data.fields["নমিনির নাম"] || "",
      "NID নং": data.fields["NID নং"] || "",
      "মোবাইল নং": data.fields["মোবাইল নং"] || "",
      "সম্পর্ক": data.fields["সম্পর্ক"] || ""
    });
  } else {
    genericUpdateRow(sheet, "DealerID", data.dealerId, data.fields || {});
  }

  invalidateAgencyCaches();
  return { success: true, message: "নমিনি তথ্য সংরক্ষিত হয়েছে" };
}

/*=========================================================
 *  সংস্থার তথ্য — শুধু এজেন্সি এন্ট্রি করবে (Master Spreadsheet এ),
 *  সব ডিলার একই তথ্য দেখতে ও প্রিন্ট করতে পারবে (এডিট করতে পারবে না)
 *=======================================================*/
const ABOUT_FIELDS = ["প্রতিষ্ঠাকাল", "উদ্দেশ্য", "প্রধান কার্যালয়ের ঠিকানা", "জেলা ডিপুর ঠিকানা", "নিয়মাবলি", "সংক্ষিপ্ত বিবরণ"];

function getAbout(data) {
  const perm = checkPermission(data.token, ["Admin", "প্রতিনিধি"]);
  if (!perm.ok) return { success: false, message: perm.message };

  const cache = CacheService.getScriptCache();
  const cached = cache.get("about_info_cache_v1");
  if (cached) return { success: true, about: JSON.parse(cached) };

  const masterSS = getMasterSS();
  const sheet = getSheet(masterSS, "AboutInfo");
  const rows = genericListRows(sheet);
  const info = rows.length > 0 ? rows[0] : {};
  ABOUT_FIELDS.forEach(function (f) { if (!(f in info)) info[f] = ""; });

  try { cache.put("about_info_cache_v1", JSON.stringify(info), 60); } catch (e) { /* বাদ */ }

  return { success: true, about: info };
}

function updateAbout(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  const masterSS = getMasterSS();
  const sheet = getSheet(masterSS, "AboutInfo");
  const rows = genericListRows(sheet);

  const fields = {
    "প্রতিষ্ঠাকাল": data.protisthakal || "",
    "উদ্দেশ্য": data.uddessho || "",
    "প্রধান কার্যালয়ের ঠিকানা": data.prodhanKaryaloy || "",
    "জেলা ডিপুর ঠিকানা": data.jelaDipur || "",
    "নিয়মাবলি": data.niyomaboli || "",
    "সংক্ষিপ্ত বিবরণ": data.songkhiptoBiboron || ""
  };

  if (rows.length === 0) {
    genericAddRow(sheet, fields);
  } else {
    sheet.getRange(2, 1, 1, ABOUT_FIELDS.length).setValues([ABOUT_FIELDS.map(function (f) { return fields[f]; })]);
  }

  invalidateAgencyCaches();
  return { success: true, message: "সংস্থার তথ্য সংরক্ষিত হয়েছে" };
}

/*******************************************************
 * একজন ডিলারের সম্পূর্ণ তথ্য (ডিলার + নমিনি + এডমিন লগইন) একসাথে
 * — ডিলার লিস্টের "এডিট" বাটনে ক্লিক করলে এটি কল হয়ে সব তথ্য
 * ফরমে লোড করে দেয়
 *******************************************************/
function getDealerFullInfo(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  const masterSS = getMasterSS();
  const dealersSheet = getSheet(masterSS, "Dealers");
  const nomineeSheet = getSheet(masterSS, "DealerNominee");
  const usersSheet = getSheet(masterSS, "Users");

  const dealers = genericListRows(dealersSheet);
  const dealer = dealers.find(function (d) { return d["DealerID"] === data.dealerId; });
  if (!dealer) return { success: false, message: "ডিলার পাওয়া যায়নি" };

  const nominees = genericListRows(nomineeSheet);
  const nominee = nominees.find(function (n) { return n["DealerID"] === data.dealerId; }) || null;

  const users = genericListRows(usersSheet);
  const adminUser = users.find(function (u) {
    return u["DealerID"] === data.dealerId && u["রোল"] === "Admin";
  }) || null;

  return { success: true, dealer: dealer, nominee: nominee, adminUser: adminUser };
}

/*******************************************************
 * একজন ডিলারের সম্পূর্ণ তথ্য একসাথে আপডেট — ডিলার তথ্য, নমিনি তথ্য,
 * এবং (দেওয়া থাকলে) এডমিন লগইনের ইউজারনেম/পাসওয়ার্ড
 * data: {
 *   token, dealerId,
 *   dealerFields: { নাম, পিতার নাম, মোবাইল, Gmail, NID/জন্মসনদ,
 *                   ট্রেড লাইসেন্স নং, ঠিকানা, "ডিলারের ছবি(URL)"(ঐচ্ছিক) },
 *   nomineeFields: { নমিনির নাম, NID নং, মোবাইল নং, সম্পর্ক, "নমিনির ছবি(URL)"(ঐচ্ছিক) },
 *   adminUsername, adminPassword (ঐচ্ছিক — খালি রাখলে বদলাবে না)
 * }
 *******************************************************/
function updateDealerFull(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  const masterSS = getMasterSS();
  const dealersSheet = getSheet(masterSS, "Dealers");
  const usersSheet = getSheet(masterSS, "Users");

  const dealerFields = data.dealerFields || {};
  const nomineeFields = data.nomineeFields || {};
  let photoWarning = "";

  // নতুন ছবি (base64, ফ্রন্টএন্ডেই কমপ্রেসড) দেওয়া থাকলে সরাসরি সেভ
  if (data.dealerPhotoBase64) {
    const processed = processImageForStorage(data.dealerPhotoBase64);
    if (processed === null) { photoWarning += " (⚠️ ডিলারের নতুন ছবি খুব বড়, সেভ হয়নি)"; }
    else { dealerFields["ডিলারের ছবি(URL)"] = processed; }
  }
  if (data.nomineePhotoBase64) {
    const processedN = processImageForStorage(data.nomineePhotoBase64);
    if (processedN === null) { photoWarning += " (⚠️ নমিনির নতুন ছবি খুব বড়, সেভ হয়নি)"; }
    else { nomineeFields["নমিনির ছবি(URL)"] = processedN; }
  }

  // ১. ডিলারের মূল তথ্য আপডেট
  const dealerOk = genericUpdateRow(dealersSheet, "DealerID", data.dealerId, dealerFields);
  if (!dealerOk) return { success: false, message: "ডিলার পাওয়া যায়নি" };

  // ২. নমিনি তথ্য আপডেট (updateDealerNominee এর একই লজিক পুনঃব্যবহার)
  updateDealerNominee({ token: data.token, dealerId: data.dealerId, fields: nomineeFields });

  // ৩. এডমিন লগইন তথ্য (দেওয়া থাকলে) আপডেট
  if (data.adminUsername || data.adminPassword) {
    const users = usersSheet.getDataRange().getValues();
    const headers = users[0];
    const idxDealerId = headers.indexOf("DealerID");
    const idxRole = headers.indexOf("রোল");
    const idxUsername = headers.indexOf("ইউজারনেম");
    const idxPassword = headers.indexOf("পাসওয়ার্ড");

    for (let i = 1; i < users.length; i++) {
      if (users[i][idxDealerId] === data.dealerId && users[i][idxRole] === "Admin") {
        if (data.adminUsername) usersSheet.getRange(i + 1, idxUsername + 1).setValue(data.adminUsername);
        if (data.adminPassword) usersSheet.getRange(i + 1, idxPassword + 1).setValue(data.adminPassword);
        break;
      }
    }
  }

  invalidateAgencyCaches();
  return { success: true, message: "ডিলারের সম্পূর্ণ তথ্য আপডেট হয়েছে" + photoWarning };
}
