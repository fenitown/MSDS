/*******************************************************
 * TCB-স্টাইল ডিলার ম্যানেজমেন্ট সফটওয়্যার
 * Master Spreadsheet এর Apps Script (Code.gs)
 *
 * এই স্ক্রিপ্ট Master Spreadsheet-এ বসাতে হবে।
 * প্রথমবার setupMasterSheet() ফাংশনটি একবার ম্যানুয়ালি রান করলে
 * সকল ট্যাব ও কলাম হেডার নিজে থেকেই তৈরি হয়ে যাবে।
 *******************************************************/

// ==== কনফিগারেশন ====
// এই স্ক্রিপ্ট Master Spreadsheet-এর সাথে বাউন্ড থাকলে নিচের লাইন পরিবর্তনের দরকার নেই।
// যদি স্ট্যান্ডঅ্যালোন স্ক্রিপ্ট হিসেবে রাখেন, তাহলে MASTER_SS_ID বসিয়ে দিন।
const MASTER_SS_ID = ""; // খালি রাখলে বাউন্ড স্প্রেডশিট ব্যবহার হবে
const TEMPLATE_SS_ID = "এখানে DealerTemplate স্প্রেডশিটের ID বসান"; // DealerTemplate বানানোর পর তার ID এখানে বসান

// Web App এর নিজের Deployment URL — একবার Deploy করার পর এখানে বসিয়ে রাখলে
// বারবার আলাদা করে সংরক্ষণ/শেয়ার করার দরকার নেই, কোডেই থেকে যাবে।
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxmseU_Vj8xwWzq9rxK6b8NN5ZPvb3GNlc-LNN-hgwa2kr3kS6lAe11ZWseK7qd9PuB-g/exec";

function getMasterSS() {
  if (MASTER_SS_ID && MASTER_SS_ID.trim() !== "") {
    return SpreadsheetApp.openById(MASTER_SS_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet(ss, tabName) {
  return ss.getSheetByName(tabName);
}

/*******************************************************
 * প্যাকেজ শীটের হেডার তৈরি — এক রো তে একটি প্যাকেজ, প্রতিটি পণ্য
 * নিজের নিজের কলামে বসে (সর্বোচ্চ ১০টি পণ্য স্লট)
 * এটি MASTER_SHEETS_DEF এর উপরে থাকা আবশ্যক — নাহলে
 * "Cannot access before initialization" এরর আসবে
 *******************************************************/
const MAX_PACKAGE_ITEMS = 10;
function buildPackageHeaders() {
  const headers = ["PackageID", "নাম", "তারিখ", "ধরন"];
  for (let i = 1; i <= MAX_PACKAGE_ITEMS; i++) {
    headers.push(
      "পণ্য" + i + " - নাম ও পরিমাণ",
      "পণ্য" + i + " - বাজার মূল্য",
      "পণ্য" + i + " - কম্বো মূল্য",
      "পণ্য" + i + " - সাশ্রয়"
    );
  }
  headers.push("সর্বমোট বাজার মূল্য", "সর্বমোট কম্বো মূল্য (সর্বমোট মূল্য)", "সর্বমোট সাশ্রয়");
  return headers;
}

/*******************************************************
 * Master Spreadsheet এর ট্যাব ও হেডার সংজ্ঞা
 *******************************************************/
const MASTER_SHEETS_DEF = {
  "Dealers": [
    "DealerID", "তারিখ", "নাম", "পিতার নাম", "NID/জন্মসনদ",
    "মোবাইল", "Gmail", "ট্রেড লাইসেন্স নং", "ঠিকানা", "ডিলারের ছবি(URL)",
    "SpreadsheetID", "স্ট্যাটাস"
  ],
  "DealerNominee": [
    "NomineeID", "DealerID", "নমিনির নাম", "NID নং", "মোবাইল নং", "সম্পর্ক", "নমিনির ছবি(URL)"
  ],
  "Users": [
    "UserID", "DealerID", "ইউজারনেম", "পাসওয়ার্ড", "রোল", "নাম", "মোবাইল"
  ],
  "Agency": [
    "নাম", "মোবাইল", "লোগো(URL)"
  ],
  // সংস্থার তথ্য — শুধু এজেন্সি এন্ট্রি করবে, সব ডিলার একই তথ্য দেখবে
  "AboutInfo": [
    "প্রতিষ্ঠাকাল", "উদ্দেশ্য", "প্রধান কার্যালয়ের ঠিকানা",
    "জেলা ডিপুর ঠিকানা", "নিয়মাবলি", "সংক্ষিপ্ত বিবরণ"
  ],
  // প্যাকেজ — এক রো = এক প্যাকেজ, পণ্য সর্বোচ্চ ১০টি পর্যন্ত কলাম-ভিত্তিক
  // (নাম১/বাজার১/কম্বো১/সাশ্রয়১, নাম২/বাজার২/কম্বো২/সাশ্রয়২, ...)
  "Packages": buildPackageHeaders(),
  // কমিশন — এজেন্সি থেকে প্রতিটি ডিলারকে দেওয়া কমিশনের হিসাব
  "Commission": [
    "CommissionID", "DealerID", "ডিলারের নাম", "মোবাইল নং", "ঠিকানা", "টাকার পরিমাণ", "তারিখ"
  ],
  // খরচ — এজেন্সির নিজস্ব খরচের হিসাব (ভাউচার নং এর মতো একাধিক সারি শেয়ার করে)
  "Expense": [
    "EntryID", "ভাউচার নং", "তারিখ", "ক্রম", "বিবরণ", "টাকা", "সর্বমোট", "পরিশোধ", "বকেয়া"
  ],
  // স্টক: পণ্য তালিকা
  "Products": [
    "ProductID", "পণ্যের নাম", "ব্র্যান্ড", "বাজার মূল্য", "কম্বো মূল্য", "সাশ্রয়ী"
  ],
  // স্টক ইন ভাউচার — এক ভাউচারে একাধিক পণ্য (ইনভয়েস নং এর মতো ভাউচার নং শেয়ার করে)
  "StockInVoucher": [
    "EntryID", "ভাউচার নং", "তারিখ", "ProductID", "পণ্যের নাম",
    "বাজার মূল্য", "কম্বো মূল্য", "সাশ্রয়ী", "সংখ্যা", "মোট মূল্য"
  ],
  // বিক্রয় ইনভয়েস — এজেন্সি থেকে ডিলারকে প্যাকেজ বিক্রি
  "SalesInvoice": [
    "EntryID", "ইনভয়েস নং", "তারিখ", "DealerID", "ডিলার নাম", "মোবাইল", "ঠিকানা",
    "PackageID", "প্যাকেজ", "একক মূল্য", "সংখ্যা", "মোট মূল্য",
    "কমিশন %", "কমিশন মূল্য", "পরিশোধযোগ্য মূল্য",
    "সাবটোটাল", "ডিসকাউন্ট", "পরিশোধ", "বকেয়া"
  ]
};

/*******************************************************
 * প্রতিটি ডিলার Spreadsheet (টেমপ্লেট) এর ট্যাব ও হেডার সংজ্ঞা
 * (প্যাকেজ এখানে নেই — এজেন্সি থেকে আসে, Master Spreadsheet এ থাকে)
 *******************************************************/
const DEALER_SHEETS_DEF = {
  "Customers": [
    "CustomerID", "তারিখ", "নাম", "পিতার নাম", "মোবাইল নং", "NID/জন্মসনদ নং",
    "বাড়ির নাম", "গ্রাম", "ওয়ার্ড নং", "ইউনিয়ন/পৌরসভা", "প্রাপ্তির স্থান", "কার্ড ফি"
  ],
  "Sales": [
    "SaleID", "CustomerID", "PackageID", "তারিখ", "মূল্য", "স্ট্যাটাস"
  ],
  "Orders": [
    "OrderID", "ইনভয়েস নং", "তারিখ", "PackageID", "সংখ্যা", "একক মূল্য",
    "মোট মূল্য", "কমিশন %", "মোট কমিশন", "সর্বমোট মূল্য"
  ],
  // খরচ ভাউচার — প্রতিটি ডিলারের নিজস্ব খরচের হিসাব
  "ExpenseVoucher": [
    "VoucherID", "তারিখ", "বিবরণ", "পরিমাণ"
  ]
};

/*******************************************************
 * ফাংশন: একটি স্প্রেডশিটে ট্যাব ও হেডার তৈরি (না থাকলে)
 *******************************************************/
function ensureSheetsWithHeaders(ss, sheetsDef) {
  const definedNames = Object.keys(sheetsDef);

  definedNames.forEach(function (tabName) {
    let sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
    }
    const headers = sheetsDef[tabName];
    const existingHeaderRange = sheet.getRange(1, 1, 1, headers.length);
    const existingValues = existingHeaderRange.getValues()[0];

    // হেডার না থাকলে বা ভিন্ন হলে বসিয়ে দেওয়া
    let needsHeader = false;
    for (let i = 0; i < headers.length; i++) {
      if (existingValues[i] !== headers[i]) {
        needsHeader = true;
        break;
      }
    }
    if (needsHeader) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
  });

  // ডিফল্ট "Sheet1" থাকলে এবং খালি হলে মুছে ফেলা
  const defaultSheet = ss.getSheetByName("Sheet1");
  if (defaultSheet && ss.getSheets().length > 1) {
    const isEmpty = defaultSheet.getLastRow() === 0;
    if (isEmpty) {
      ss.deleteSheet(defaultSheet);
    }
  }
}

/*******************************************************
 * এই ফাংশনটি Master Spreadsheet-এ একবার ম্যানুয়ালি রান করুন
 * (Apps Script এডিটরে ফাংশন সিলেক্ট করে ▶ Run চাপুন)
 * এতে Dealers, DealerNominee, Users, Agency ট্যাব ও হেডার
 * স্বয়ংক্রিয়ভাবে তৈরি হয়ে যাবে।
 *******************************************************/
function setupMasterSheet() {
  const ss = getMasterSS();
  ensureSheetsWithHeaders(ss, MASTER_SHEETS_DEF);

  // মোবাইল নং কলামগুলো টেক্সট ফরম্যাট করে রাখা
  formatMobileColumnAsText(ss, "Dealers", "মোবাইল");
  formatMobileColumnAsText(ss, "DealerNominee", "মোবাইল নং");
  formatMobileColumnAsText(ss, "Users", "মোবাইল");
  formatMobileColumnAsText(ss, "Commission", "মোবাইল নং");

  SpreadsheetApp.getUi().alert("Master Spreadsheet সেটআপ সম্পন্ন হয়েছে। সকল ট্যাব ও হেডার তৈরি হয়েছে।");
}

/*******************************************************
 * এই ফাংশনটি একটি খালি Spreadsheet-এ একবার রান করলে সেটি
 * ডিলার-টেমপ্লেট হিসেবে প্রস্তুত হয়ে যাবে (সকল ট্যাব ও হেডার সহ)।
 * এই Spreadsheet-টিকে পরে TEMPLATE_SS_ID হিসেবে ব্যবহার করবেন।
 *******************************************************/
function setupDealerTemplateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheetsWithHeaders(ss, DEALER_SHEETS_DEF);

  formatMobileColumnAsText(ss, "Customers", "মোবাইল নং");

  SpreadsheetApp.getUi().alert("Dealer Template Spreadsheet প্রস্তুত হয়েছে। এই স্প্রেডশিটের ID টি Code.gs এর TEMPLATE_SS_ID তে বসান।");
}

/*******************************************************
 * মোবাইল নং কলামকে টেক্সট ফরম্যাট করার সহায়ক ফাংশন
 * (যাতে শুরুর 0 কখনো হারিয়ে না যায়)
 *******************************************************/
function formatMobileColumnAsText(ss, tabName, headerName) {
  const sheet = ss.getSheetByName(tabName);
  if (!sheet) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colIndex = headers.indexOf(headerName);
  if (colIndex === -1) return;
  const colNumber = colIndex + 1;
  // পুরো কলাম (হেডার বাদে ১০০০ রো পর্যন্ত) টেক্সট ফরম্যাট
  sheet.getRange(2, colNumber, 1000, 1).setNumberFormat("@");
}

/*******************************************************
 * আইডি জেনারেটর (prefix + ক্রমিক সংখ্যা, ৪ ডিজিট প্যাডেড)
 *******************************************************/
function generateId(sheet, prefix) {
  const lastRow = sheet.getLastRow();
  const num = lastRow < 2 ? 1 : lastRow; // header বাদ দিয়ে
  return prefix + Utilities.formatString("%04d", num);
}

/*******************************************************
 * পারফরম্যান্স হেল্পার: একাধিক রো একসাথে যোগ করা
 * (প্রতিটি রো এর জন্য আলাদা appendRow কল না করে, একবারে
 * setValues() দিয়ে সব রো লিখলে অনেক দ্রুত হয়)
 * rowObjects: [{header: value, ...}, ...]
 * প্রতিটি অবজেক্টের জন্য একটি করে নতুন ID ফেরত দেয় (idPrefix দিয়ে)
 *******************************************************/
function batchAppendRows(sheet, rowObjects, idPrefix, idHeaderName) {
  if (!rowObjects || rowObjects.length === 0) return [];

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const startRow = sheet.getLastRow() + 1;
  let nextNum = sheet.getLastRow() < 1 ? 1 : sheet.getLastRow();
  const generatedIds = [];

  const rows = rowObjects.map(function (obj) {
    let newId = "";
    if (idPrefix) {
      newId = idPrefix + Utilities.formatString("%04d", nextNum);
      nextNum++;
      generatedIds.push(newId);
    }
    return headers.map(function (h) {
      if (idHeaderName && h === idHeaderName) return newId;
      return obj.hasOwnProperty(h) ? obj[h] : "";
    });
  });

  sheet.getRange(startRow, 1, rows.length, headers.length).setValues(rows);
  return generatedIds;
}

/*******************************************************
 * পাসওয়ার্ড হ্যাশ (SHA-256)
 *******************************************************/
function hashPassword(password) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
  return raw.map(function (b) {
    return (b < 0 ? b + 256 : b).toString(16).padStart(2, "0");
  }).join("");
}

/*******************************************************
 * base64 ছবি ডেটা Google Drive এ সেভ করে পাবলিক-ভিউ URL রিটার্ন করে
 * imageBase64 ফরম্যাট: "data:image/png;base64,AAAA..." অথবা শুধু base64 অংশ
 *******************************************************/
/*******************************************************
 * ছবি সংরক্ষণ — Google Drive/Web App এর মধ্য দিয়ে সার্ভ করার একাধিক
 * চেষ্টা বারবার অনির্ভরযোগ্য প্রমাণিত হওয়ায় (Drive এর পাবলিক লিংক
 * ব্লক হয়ে যাওয়া, doGet এর মাধ্যমে বাইনারি সার্ভ করা অস্থিতিশীল
 * হওয়া), এখন ছবি সরাসরি একটি কমপ্রেসড base64 data URI হিসেবে
 * শীটের সেলেই সংরক্ষণ করা হয় — এটি কোনো বাহ্যিক লিংক/শেয়ারিং/
 * ডিপ্লয়মেন্ট URL এর উপর নির্ভর করে না, তাই সম্পূর্ণ নির্ভরযোগ্য।
 * ফ্রন্টএন্ড আপলোডের আগেই ছবি ছোট (৪০০পিক্সেল) ও কমপ্রেস করে পাঠায়,
 * তাই Google Sheet এর প্রতি-সেল ৫০,০০০ ক্যারেক্টার সীমার মধ্যেই থাকে।
 *******************************************************/
function processImageForStorage(imageBase64) {
  if (!imageBase64) return "";
  if (imageBase64.indexOf("data:image/") !== 0) return "";
  // Google Sheet এর একটি সেলে সর্বোচ্চ ৫০,০০০ ক্যারেক্টার রাখা যায়;
  // নিরাপদ মার্জিন রেখে ৪৮,০০০ এ সীমা বাঁধা হলো
  if (imageBase64.length > 48000) return null; // খুব বড় — সেভ করা যাবে না
  return imageBase64;
}


/*******************************************************
 * নতুন ডিলার রেজিস্ট্রেশন
 * data প্যারামিটারে যা থাকবে:
 * {
 *   নাম, পিতারনাম, nid, mobile, tradeLicense, thikana,
 *   adminUsername, adminPassword, adminName,
 *   nominee: { নাম, nid, mobile, somporko }   <-- নমিনি তথ্য
 * }
 *******************************************************/
function registerDealer(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  const masterSS = getMasterSS();
  const dealersSheet = getSheet(masterSS, "Dealers");
  const nomineeSheet = getSheet(masterSS, "DealerNominee");
  const usersSheet = getSheet(masterSS, "Users");

  // ১. টেমপ্লেট কপি করে নতুন Spreadsheet বানানো (Spreadsheet ID স্বয়ংক্রিয় তৈরি হয়)
  const templateFile = DriveApp.getFileById(TEMPLATE_SS_ID);
  const newFile = templateFile.makeCopy(data.নাম + " - Dealer Sheet");
  const newSpreadsheetId = newFile.getId();

  // ২. ডিলারের Gmail দেওয়া থাকলে সেই Gmail-কে নতুন শীটে Editor হিসেবে শেয়ার করা
  if (data.gmail && data.gmail.trim() !== "") {
    try {
      newFile.addEditor(data.gmail.trim());
    } catch (shareErr) {
      // ভুল/অবৈধ Gmail হলে শেয়ারিং বাদ দিয়ে বাকি প্রক্রিয়া চালিয়ে যাওয়া হবে
    }
  }

  // ৩. Dealer আইডি তৈরি
  const dealerId = generateId(dealersSheet, "D");

  // ৪. ডিলারের ছবি (base64, ফ্রন্টএন্ডেই কমপ্রেসড) সরাসরি সেভ করা
  let dealerPhotoUrl = "";
  let photoWarning = "";
  if (data.dealerPhotoBase64) {
    const processed = processImageForStorage(data.dealerPhotoBase64);
    if (processed === null) { photoWarning = " (⚠️ ডিলারের ছবি খুব বড়, সেভ হয়নি — ছোট ছবি দিয়ে আবার চেষ্টা করুন)"; }
    else { dealerPhotoUrl = processed; }
  }

  // ৫. Dealers ট্যাবে রো যোগ
  dealersSheet.appendRow([
    dealerId,
    new Date(),
    data.নাম,
    data.পিতারনাম,
    data.nid,
    data.mobile,
    data.gmail || "",
    data.tradeLicense,
    data.thikana,
    dealerPhotoUrl,
    newSpreadsheetId,
    "সক্রিয়"
  ]);
  dealersSheet.getRange(dealersSheet.getLastRow(), 6).setNumberFormat("@");

  // ৬. ডিলারের নমিনি তথ্য যোগ (যদি দেওয়া থাকে)
  if (data.nominee) {
    let nomineePhotoUrl = "";
    if (data.nominee.photoBase64) {
      const processedN = processImageForStorage(data.nominee.photoBase64);
      if (processedN === null) { photoWarning += " (⚠️ নমিনির ছবি খুব বড়, সেভ হয়নি)"; }
      else { nomineePhotoUrl = processedN; }
    }
    const nomineeId = generateId(nomineeSheet, "N");
    nomineeSheet.appendRow([
      nomineeId,
      dealerId,
      data.nominee.নাম,
      data.nominee.nid,
      data.nominee.mobile,
      data.nominee.somporko,
      nomineePhotoUrl
    ]);
    nomineeSheet.getRange(nomineeSheet.getLastRow(), 5).setNumberFormat("@");
  }

  // ৫. প্রথম Admin ইউজার তৈরি
  const userId = generateId(usersSheet, "U");
  usersSheet.appendRow([
    userId,
    dealerId,
    data.adminUsername,
    data.adminPassword,
    "Admin",
    data.adminName,
    data.mobile
  ]);
  usersSheet.getRange(usersSheet.getLastRow(), 7).setNumberFormat("@");

  invalidateAgencyCaches();

  return {
    success: true,
    dealerId: dealerId,
    spreadsheetId: newSpreadsheetId,
    message: "ডিলার সফলভাবে রেজিস্ট্রেশন হয়েছে" + photoWarning
  };
}

/*******************************************************
 * ওয়েব অ্যাপ এন্ট্রি পয়েন্ট — সকল action এখানে রাউট হয়
 * ফ্রন্টএন্ড থেকে POST বডিতে { action: "...", data: {...} } পাঠাতে হবে
 *******************************************************/
function doPost(e) {
  const params = JSON.parse(e.postData.contents);
  const action = params.action;
  const data = params.data || {};

  let result;
  try {
    switch (action) {
      // ---- রেজিস্ট্রেশন ----
      case "registerDealer":
        result = registerDealer(data);
        break;

      // ---- অথেনটিকেশন ----
      case "login":
        result = loginUser(data);
        break;
      case "addUser":
        result = addUser(data);
        break;
      case "recoverPassword":
        result = recoverPassword(data);
        break;

      // ---- গ্রাহক ----
      case "addCustomer":
        result = addCustomer(data);
        break;
      case "listCustomers":
        result = listCustomers(data);
        break;
      case "listCustomersForDealer":
        result = listCustomersForDealer(data);
        break;
      case "updateCustomer":
        result = updateCustomer(data);
        break;
      case "deleteCustomer":
        result = deleteCustomer(data);
        break;

      // ---- প্যাকেজ ----
      case "addPackage":
        result = addPackage(data);
        break;
      case "listPackages":
        result = listPackages(data);
        break;
      case "updatePackage":
        result = updatePackage(data);
        break;
      case "deletePackage":
        result = deletePackage(data);
        break;

      // ---- বিক্রি ----
      case "addSale":
        result = addSale(data);
        break;
      case "updateSalePrice":
        result = updateSalePrice(data);
        break;
      case "cancelSale":
        result = cancelSale(data);
        break;
      case "listSales":
        result = listSales(data);
        break;
      case "getSalesPageData":
        result = getSalesPageData(data);
        break;

      // ---- অর্ডার ----
      case "addOrder":
        result = addOrder(data);
        break;
      case "listOrders":
        result = listOrders(data);
        break;
      case "getOrdersPageData":
        result = getOrdersPageData(data);
        break;
      case "updateOrder":
        result = updateOrder(data);
        break;
      case "deleteOrder":
        result = deleteOrder(data);
        break;

      // ---- ড্যাশবোর্ড ----
      case "dashboardSummary":
        result = getDashboardSummary(data);
        break;

      // ---- রিপোর্ট ----
      case "dailyReport":
        result = dailyReport(data);
        break;
      case "monthlyReport":
        result = monthlyReport(data);
        break;
      case "totalReport":
        result = totalReport(data);
        break;

      // ---- এজেন্সি সেটাপ (শুধু মূল এজেন্সি) ----
      case "getAgencyInfo":
        result = getAgencyInfo(data);
        break;
      case "updateAgencyInfo":
        result = updateAgencyInfo(data);
        break;

      // ---- ডিলার তালিকা/এডিট (শুধু মূল এজেন্সি) ----
      case "listDealers":
        result = listDealers(data);
        break;
      case "updateDealerInfo":
        result = updateDealerInfo(data);
        break;
      case "setDealerStatus":
        result = setDealerStatus(data);
        break;
      case "updateDealerNominee":
        result = updateDealerNominee(data);
        break;
      case "getDealerFullInfo":
        result = getDealerFullInfo(data);
        break;
      case "updateDealerFull":
        result = updateDealerFull(data);
        break;

      // ---- প্রতি ডিলারের নিজস্ব "সম্পর্কে" ----
      case "getAbout":
        result = getAbout(data);
        break;
      case "updateAbout":
        result = updateAbout(data);
        break;

      // ---- কমিশন (শুধু মূল এজেন্সি) ----
      case "addCommission":
        result = addCommission(data);
        break;
      case "listCommissions":
        result = listCommissions(data);
        break;
      case "updateCommission":
        result = updateCommission(data);
        break;
      case "deleteCommission":
        result = deleteCommission(data);
        break;

      // ---- খরচ (শুধু মূল এজেন্সি) ----
      case "addExpense":
        result = addExpense(data);
        break;
      case "listExpenses":
        result = listExpenses(data);
        break;
      case "updateExpense":
        result = updateExpense(data);
        break;
      case "deleteExpense":
        result = deleteExpense(data);
        break;

      // ---- স্টক: পণ্য তালিকা (শুধু মূল এজেন্সি) ----
      case "addProduct":
        result = addProduct(data);
        break;
      case "listProducts":
        result = listProducts(data);
        break;
      case "updateProduct":
        result = updateProduct(data);
        break;
      case "deleteProduct":
        result = deleteProduct(data);
        break;

      // ---- স্টক ইন ভাউচার (শুধু মূল এজেন্সি) ----
      case "addStockVoucher":
        result = addStockVoucher(data);
        break;
      case "listStockVouchers":
        result = listStockVouchers(data);
        break;
      case "updateStockVoucherEntry":
        result = updateStockVoucherEntry(data);
        break;
      case "deleteStockVoucher":
        result = deleteStockVoucher(data);
        break;

      // ---- বিক্রয় ইনভয়েস (শুধু মূল এজেন্সি) ----
      case "addSalesInvoice":
        result = addSalesInvoice(data);
        break;
      case "listSalesInvoices":
        result = listSalesInvoices(data);
        break;
      case "updateSalesInvoiceEntry":
        result = updateSalesInvoiceEntry(data);
        break;
      case "deleteSalesInvoice":
        result = deleteSalesInvoice(data);
        break;

      // ---- এজেন্সি রিপোর্ট ----
      case "agencySalesReport":
        result = agencySalesReport(data);
        break;

      // ---- খরচ ভাউচার (ডিলারের নিজস্ব) ----
      case "addExpenseVoucher":
        result = addExpenseVoucher(data);
        break;
      case "listExpenseVouchers":
        result = listExpenseVouchers(data);
        break;
      case "updateExpenseVoucher":
        result = updateExpenseVoucher(data);
        break;
      case "deleteExpenseVoucher":
        result = deleteExpenseVoucher(data);
        break;

      // ---- এজেন্সি ড্যাশবোর্ড ----
      case "agencyDashboardSummary":
        result = getAgencyDashboardSummary(data);
        break;

      default:
        result = { success: false, message: "অজানা action: " + action };
    }
  } catch (err) {
    result = { success: false, message: err.toString() };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    // গ্রাহক কার্ডের QR কোড স্ক্যান করলে এই পেজ দেখাবে
    if (e && e.parameter && e.parameter.view === "customer" && e.parameter.dealerId && e.parameter.customerId) {
      return renderCustomerCardPage(e.parameter.dealerId, e.parameter.customerId);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: "TCB Dealer System API চালু আছে", url: ScriptApp.getService().getUrl() }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    // কোনো অপ্রত্যাশিত এরর হলেও যেন Google এর জেনেরিক "unable to open"
    // এরর পেজের বদলে আমাদের নিজস্ব বোধগম্য এরর পেজ দেখায়
    return HtmlService.createHtmlOutput(
      '<div style="font-family:sans-serif;padding:20px;color:#a3352b;">সমস্যা হয়েছে: ' + err.toString() + '</div>'
    ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}

/*******************************************************
 * QR কোড স্ক্যান করলে খোলা হবে এমন একটি সাধারণ, মোবাইল-বান্ধব HTML পেজ
 *******************************************************/
function renderCustomerCardPage(dealerId, customerId) {
  const info = getCustomerCardInfo(dealerId, customerId);

  function fmtDate(d) {
    if (!d) return "—";
    const dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt.getTime())) return "—";
    return Utilities.formatDate(dt, Session.getScriptTimeZone(), "dd/MM/yyyy");
  }

  let bodyHtml;
  if (!info.success) {
    bodyHtml = '<p style="color:#a3352b;">' + info.message + '</p>';
  } else {
    bodyHtml =
      '<h2 style="margin:0 0 14px;color:#153f37;">' + info.customerName + '</h2>' +
      '<table style="width:100%;border-collapse:collapse;">' +
      '<tr><td style="padding:8px;border:1px solid #d8d2c2;font-weight:600;background:#eef0e9;">গ্রাহক হওয়ার তারিখ</td><td style="padding:8px;border:1px solid #d8d2c2;">' + fmtDate(info.joinDate) + '</td></tr>' +
      '<tr><td style="padding:8px;border:1px solid #d8d2c2;font-weight:600;background:#eef0e9;">মোট ক্রয় সংখ্যা</td><td style="padding:8px;border:1px solid #d8d2c2;">' + info.purchaseCount + ' বার</td></tr>' +
      '<tr><td style="padding:8px;border:1px solid #d8d2c2;font-weight:600;background:#eef0e9;">সর্বশেষ ক্রয়ের তারিখ</td><td style="padding:8px;border:1px solid #d8d2c2;">' + fmtDate(info.lastPurchaseDate) + '</td></tr>' +
      '</table>';
  }

  const html =
    '<!DOCTYPE html><html lang="bn"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>গ্রাহক তথ্য</title>' +
    '<style>body{font-family:sans-serif;background:#f6f4ee;padding:20px;color:#1c2b28;}' +
    '.card{background:#fff;border-radius:10px;padding:20px;max-width:400px;margin:0 auto;box-shadow:0 4px 14px rgba(0,0,0,0.08);}</style>' +
    '</head><body><div class="card">' + bodyHtml + '</div></body></html>';

  return HtmlService.createHtmlOutput(html)
    .setTitle("গ্রাহক তথ্য")
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

