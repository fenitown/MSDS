/*******************************************************
 * TCB-স্টাইল ডিলার ম্যানেজমেন্ট সফটওয়্যার
 * Crud.gs — গ্রাহক, প্যাকেজ, বিক্রি, অর্ডার এর CRUD
 *
 * এই ফাইলটিও MasterRegistry এর একই Apps Script প্রজেক্টে
 * নতুন ফাইল হিসেবে যোগ করুন (নাম দিন: Crud)
 *
 * নিয়ম: Admin সব করতে পারবে।
 * প্রতিনিধি শুধু গ্রাহক তৈরি, বিক্রি, বিক্রি বাতিল করতে পারবে।
 *******************************************************/

/*******************************************************
 * টোকেন থেকে ডিলারের নিজের Spreadsheet খুলে দেওয়া
 * — এবং প্রয়োজনে হেডার স্বয়ংক্রিয়ভাবে হালনাগাদ করে দেওয়া (নতুন
 * কলাম যোগ হলে পুরনো ডিলারদের শীটেও এটা এমনিতেই বসে যাবে)
 *******************************************************/
function getDealerSpreadsheet(dealerId) {
  const ss = SpreadsheetApp.openById(getDealerSpreadsheetId(dealerId));
  ensureDealerSheetHeadersUpToDate(ss, dealerId);
  return ss;
}

/*******************************************************
 * প্রতিটি ডিলারের নিজস্ব Spreadsheet-এর হেডার বর্তমান
 * DEALER_SHEETS_DEF এর সাথে মিলে কিনা যাচাই করে, না মিললে
 * স্বয়ংক্রিয়ভাবে নতুন কলাম যোগ করে দেয় (পুরনো ডাটা অক্ষত থাকে)।
 * প্রতিটি API কলে বারবার চেক না করে ১ ঘণ্টার জন্য ক্যাশ করা হয়,
 * যাতে পারফরম্যান্সে প্রভাব না পড়ে।
 *******************************************************/
function ensureDealerSheetHeadersUpToDate(ss, dealerId) {
  const cache = CacheService.getScriptCache();
  const cacheKey = "headers_synced_" + dealerId;
  if (cache.get(cacheKey)) return; // সম্প্রতি চেক করা হয়েছে, আবার লাগবে না

  ensureSheetsWithHeaders(ss, DEALER_SHEETS_DEF);

  try { cache.put(cacheKey, "1", 3600); } catch (e) { /* বাদ */ }
}

/*******************************************************
 * পারফরম্যান্স: dealerId → SpreadsheetID ম্যাপিং ক্যাশ করা হয়
 * (৬ ঘণ্টা — এটা কখনো বদলায় না) — প্রতিটি ডিলার-সাইড API কলে
 * পুরো Dealers শীট স্ক্যান করার বদলে ক্যাশ থেকে সরাসরি পাওয়া যায়
 *******************************************************/
function getDealerSpreadsheetId(dealerId) {
  const cache = CacheService.getScriptCache();
  const cacheKey = "dealer_ssid_" + dealerId;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const masterSS = getMasterSS();
  const dealersSheet = getSheet(masterSS, "Dealers");
  const dealerInfo = getDealerRow(dealersSheet, dealerId);
  if (!dealerInfo) throw new Error("ডিলার পাওয়া যায়নি");

  try { cache.put(cacheKey, dealerInfo.spreadsheetId, 21600); } catch (e) { /* বাদ */ }
  return dealerInfo.spreadsheetId;
}

/*******************************************************
 * জেনেরিক: হেডার-ভিত্তিক রো যোগ (ফরমের ফিল্ড ছাড়া অতিরিক্ত কিছু যোগ হবে না)
 *******************************************************/
function genericAddRow(sheet, rowObject) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(function (h) {
    return rowObject.hasOwnProperty(h) ? rowObject[h] : "";
  });
  sheet.appendRow(row);
  return sheet.getLastRow();
}

/*******************************************************
 * জেনেরিক: সব রো অবজেক্ট আকারে রিড (rowIndex সহ, এডিট/ডিলিটের জন্য দরকার)
 *******************************************************/
function genericListRows(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  const result = [];
  for (let i = 1; i < data.length; i++) {
    const obj = { rowIndex: i + 1 };
    headers.forEach(function (h, idx) {
      obj[h] = data[i][idx];
    });
    result.push(obj);
  }
  return result;
}

/*******************************************************
 * জেনেরিক: idColumn দিয়ে একটি রো খুঁজে বের করা
 *******************************************************/
function genericFindRowIndex(sheet, idColumnName, idValue) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idx = headers.indexOf(idColumnName);
  for (let i = 1; i < data.length; i++) {
    if (data[i][idx] === idValue) return i + 1; // sheet row number
  }
  return -1;
}

/*******************************************************
 * জেনেরিক: রো আপডেট (শুধু ফরমের ফিল্ড, extra কিছু না)
 *******************************************************/
function genericUpdateRow(sheet, idColumnName, idValue, updatedFields) {
  const rowIndex = genericFindRowIndex(sheet, idColumnName, idValue);
  if (rowIndex === -1) return false;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  headers.forEach(function (h, colIdx) {
    if (updatedFields.hasOwnProperty(h)) {
      sheet.getRange(rowIndex, colIdx + 1).setValue(updatedFields[h]);
    }
  });
  return true;
}

/*******************************************************
 * জেনেরিক: রো ডিলিট
 *******************************************************/
function genericDeleteRow(sheet, idColumnName, idValue) {
  const rowIndex = genericFindRowIndex(sheet, idColumnName, idValue);
  if (rowIndex === -1) return false;
  sheet.deleteRow(rowIndex);
  return true;
}

/*=========================================================
 *  গ্রাহক (Customers) — Admin + প্রতিনিধি
 *=======================================================*/
function addCustomer(data) {
  const perm = checkPermission(data.token, ["Admin", "প্রতিনিধি"]);
  if (!perm.ok) return { success: false, message: perm.message };

  const ss = getDealerSpreadsheet(perm.payload.dealerId);
  const sheet = getSheet(ss, "Customers");
  const customerId = generateId(sheet, "C");

  genericAddRow(sheet, {
    "CustomerID": customerId,
    "তারিখ": new Date(),
    "নাম": data.নাম,
    "পিতার নাম": data.পিতারনাম,
    "মোবাইল নং": data.mobile,
    "NID/জন্মসনদ নং": data.nid,
    "বাড়ির নাম": data.বাড়িরনাম,
    "গ্রাম": data.গ্রাম,
    "ওয়ার্ড নং": data.ward,
    "ইউনিয়ন/পৌরসভা": data.union,
    "প্রাপ্তির স্থান": data.praptirsthan,
    "কার্ড ফি": data.cardFee || 0
  });
  sheet.getRange(sheet.getLastRow(), sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].indexOf("মোবাইল নং") + 1).setNumberFormat("@");

  return { success: true, customerId: customerId, message: "গ্রাহক যোগ হয়েছে" };
}

function listCustomers(data) {
  const perm = checkPermission(data.token, ["Admin", "প্রতিনিধি"]);
  if (!perm.ok) return { success: false, message: perm.message };
  const ss = getDealerSpreadsheet(perm.payload.dealerId);
  const sheet = getSheet(ss, "Customers");
  return { success: true, customers: genericListRows(sheet) };
}

/*******************************************************
 * এজেন্সি থেকে যেকোনো নির্দিষ্ট ডিলারের গ্রাহক তালিকা দেখা
 * (গ্রাহক কার্ড তৈরির জন্য ব্যবহৃত) — শুধু মূল এজেন্সি করতে পারবে
 * data: { token, dealerId }
 *******************************************************/
function listCustomersForDealer(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  const ss = getDealerSpreadsheet(data.dealerId);
  const sheet = getSheet(ss, "Customers");
  return { success: true, customers: genericListRows(sheet) };
}

function updateCustomer(data) {
  const perm = checkPermission(data.token, ["Admin"]);
  if (!perm.ok) return { success: false, message: perm.message };
  const ss = getDealerSpreadsheet(perm.payload.dealerId);
  const sheet = getSheet(ss, "Customers");
  const ok = genericUpdateRow(sheet, "CustomerID", data.customerId, data.fields);
  return { success: ok, message: ok ? "আপডেট হয়েছে" : "গ্রাহক পাওয়া যায়নি" };
}

function deleteCustomer(data) {
  const perm = checkPermission(data.token, ["Admin"]);
  if (!perm.ok) return { success: false, message: perm.message };
  const ss = getDealerSpreadsheet(perm.payload.dealerId);
  const sheet = getSheet(ss, "Customers");
  const ok = genericDeleteRow(sheet, "CustomerID", data.customerId);
  return { success: ok, message: ok ? "ডিলিট হয়েছে" : "গ্রাহক পাওয়া যায়নি" };
}

/*=========================================================
 *  প্যাকেজ — এক রো = এক প্যাকেজ, পণ্য কলাম-ভিত্তিক (একবারেই এক লেখা, দ্রুততম)
 *  — যোগ/এডিট/ডিলিট শুধু মূল এজেন্সি (AGENCY) করতে পারবে
 *  — ডিলার (Admin/প্রতিনিধি) শুধু লিস্ট/ভিউ করতে পারবে
 *=======================================================*/
function addPackage(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  const masterSS = getMasterSS();
  const pkgSheet = getSheet(masterSS, "Packages");
  const packageId = generateId(pkgSheet, "P");

  const items = (data.items || []).slice(0, MAX_PACKAGE_ITEMS);
  let totalBazar = 0, totalCombo = 0, totalSashroy = 0;
  const row = { "PackageID": packageId, "নাম": data.নাম, "তারিখ": new Date(), "ধরন": data.ধরন };

  for (let i = 0; i < MAX_PACKAGE_ITEMS; i++) {
    const n = i + 1;
    const item = items[i];
    if (item) {
      const bazar = Number(item.bazarMulyo) || 0;
      const combo = Number(item.comboMulyo) || 0;
      const sashroy = bazar - combo;
      totalBazar += bazar; totalCombo += combo; totalSashroy += sashroy;
      row["পণ্য" + n + " - নাম ও পরিমাণ"] = item.naamPoriman || "";
      row["পণ্য" + n + " - বাজার মূল্য"] = bazar;
      row["পণ্য" + n + " - কম্বো মূল্য"] = combo;
      row["পণ্য" + n + " - সাশ্রয়"] = sashroy;
    } else {
      row["পণ্য" + n + " - নাম ও পরিমাণ"] = "";
      row["পণ্য" + n + " - বাজার মূল্য"] = "";
      row["পণ্য" + n + " - কম্বো মূল্য"] = "";
      row["পণ্য" + n + " - সাশ্রয়"] = "";
    }
  }
  row["সর্বমোট বাজার মূল্য"] = totalBazar;
  row["সর্বমোট কম্বো মূল্য (সর্বমোট মূল্য)"] = totalCombo;
  row["সর্বমোট সাশ্রয়"] = totalSashroy;

  // একটিমাত্র রো, একটিমাত্র লেখার কল — সবচেয়ে দ্রুত পদ্ধতি
  genericAddRow(pkgSheet, row);

  invalidatePackageCache();
  return { success: true, packageId: packageId, total: totalCombo, message: "প্যাকেজ যোগ হয়েছে" };
}

/*******************************************************
 * প্যাকেজ লিস্ট ৩০ সেকেন্ডের জন্য ক্যাশ করা হয়
 *******************************************************/
function invalidatePackageCache() {
  CacheService.getScriptCache().remove("packages_cache_v3");
}

/*******************************************************
 * একটি প্যাকেজ-রো কে কলাম-ভিত্তিক ফরম্যাট থেকে items[] আকারে রূপান্তর
 * (ফ্রন্টএন্ডের জন্য সুবিধাজনক গঠন)
 *******************************************************/
function expandPackageRow(pkg) {
  const items = [];
  for (let i = 1; i <= MAX_PACKAGE_ITEMS; i++) {
    const naam = pkg["পণ্য" + i + " - নাম ও পরিমাণ"];
    if (naam) {
      items.push({
        "পণ্যের নাম ও পরিমাণ": naam,
        "বাজার মূল্য": pkg["পণ্য" + i + " - বাজার মূল্য"],
        "কম্বো মূল্য": pkg["পণ্য" + i + " - কম্বো মূল্য"],
        "সাশ্রয়": pkg["পণ্য" + i + " - সাশ্রয়"]
      });
    }
  }
  pkg.items = items;
  pkg.itemCount = items.length;
  pkg["সর্বমোট মূল্য"] = pkg["সর্বমোট কম্বো মূল্য (সর্বমোট মূল্য)"];
  return pkg;
}

function listPackages(data) {
  const perm = checkPermission(data.token, ["Admin", "প্রতিনিধি"]);
  if (!perm.ok) return { success: false, message: perm.message };

  const cache = CacheService.getScriptCache();
  const cached = cache.get("packages_cache_v3");
  if (cached) {
    return { success: true, packages: JSON.parse(cached) };
  }

  const masterSS = getMasterSS();
  const pkgSheet = getSheet(masterSS, "Packages");
  const packages = genericListRows(pkgSheet).map(expandPackageRow);

  try {
    cache.put("packages_cache_v3", JSON.stringify(packages), 30); // ৩০ সেকেন্ড
  } catch (e) { /* ক্যাশ সাইজ বেশি হলে চুপচাপ বাদ */ }

  return { success: true, packages: packages };
}

function updatePackage(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };
  const masterSS = getMasterSS();
  const sheet = getSheet(masterSS, "Packages");

  // fields এ items[] থাকলে সম্পূর্ণ রো নতুন করে হিসাব করে বসানো হয়
  let fields = data.fields || {};
  if (data.items) {
    const items = data.items.slice(0, MAX_PACKAGE_ITEMS);
    let totalBazar = 0, totalCombo = 0, totalSashroy = 0;
    for (let i = 0; i < MAX_PACKAGE_ITEMS; i++) {
      const n = i + 1;
      const item = items[i];
      if (item) {
        const bazar = Number(item.bazarMulyo) || 0;
        const combo = Number(item.comboMulyo) || 0;
        const sashroy = bazar - combo;
        totalBazar += bazar; totalCombo += combo; totalSashroy += sashroy;
        fields["পণ্য" + n + " - নাম ও পরিমাণ"] = item.naamPoriman || "";
        fields["পণ্য" + n + " - বাজার মূল্য"] = bazar;
        fields["পণ্য" + n + " - কম্বো মূল্য"] = combo;
        fields["পণ্য" + n + " - সাশ্রয়"] = sashroy;
      } else {
        fields["পণ্য" + n + " - নাম ও পরিমাণ"] = "";
        fields["পণ্য" + n + " - বাজার মূল্য"] = "";
        fields["পণ্য" + n + " - কম্বো মূল্য"] = "";
        fields["পণ্য" + n + " - সাশ্রয়"] = "";
      }
    }
    fields["সর্বমোট বাজার মূল্য"] = totalBazar;
    fields["সর্বমোট কম্বো মূল্য (সর্বমোট মূল্য)"] = totalCombo;
    fields["সর্বমোট সাশ্রয়"] = totalSashroy;
  }

  const ok = genericUpdateRow(sheet, "PackageID", data.packageId, fields);
  invalidatePackageCache();
  return { success: ok, message: ok ? "আপডেট হয়েছে" : "প্যাকেজ পাওয়া যায়নি" };
}

function deletePackage(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };
  const masterSS = getMasterSS();
  const pkgSheet = getSheet(masterSS, "Packages");
  const ok = genericDeleteRow(pkgSheet, "PackageID", data.packageId);
  invalidatePackageCache();
  return { success: ok, message: ok ? "প্যাকেজ ডিলিট হয়েছে" : "প্যাকেজ পাওয়া যায়নি" };
}

/*=========================================================
 *  বিক্রি (Sales) — Admin + প্রতিনিধি
 *=======================================================*/
function addSale(data) {
  const perm = checkPermission(data.token, ["Admin", "প্রতিনিধি"]);
  if (!perm.ok) return { success: false, message: perm.message };

  const ss = getDealerSpreadsheet(perm.payload.dealerId);
  const sheet = getSheet(ss, "Sales");
  const saleId = generateId(sheet, "S");

  genericAddRow(sheet, {
    "SaleID": saleId,
    "CustomerID": data.customerId,
    "PackageID": data.packageId,
    "তারিখ": new Date(),
    "মূল্য": data.price || 0,
    "স্ট্যাটাস": "বিক্রিত"
  });

  return { success: true, saleId: saleId, message: "বিক্রি সম্পন্ন হয়েছে" };
}

/*******************************************************
 * বিক্রির মূল্য পরিবর্তন (প্যাকেজের ডিফল্ট মূল্য থেকে বদলাতে চাইলে)
 *******************************************************/
function updateSalePrice(data) {
  const perm = checkPermission(data.token, ["Admin", "প্রতিনিধি"]);
  if (!perm.ok) return { success: false, message: perm.message };

  const ss = getDealerSpreadsheet(perm.payload.dealerId);
  const sheet = getSheet(ss, "Sales");
  const ok = genericUpdateRow(sheet, "SaleID", data.saleId, { "মূল্য": data.price });

  return { success: ok, message: ok ? "মূল্য আপডেট হয়েছে" : "বিক্রি রেকর্ড পাওয়া যায়নি" };
}

function cancelSale(data) {
  const perm = checkPermission(data.token, ["Admin", "প্রতিনিধি"]);
  if (!perm.ok) return { success: false, message: perm.message };

  const ss = getDealerSpreadsheet(perm.payload.dealerId);
  const sheet = getSheet(ss, "Sales");
  const ok = genericUpdateRow(sheet, "SaleID", data.saleId, { "স্ট্যাটাস": "বাতিল" });

  return { success: ok, message: ok ? "বিক্রি বাতিল হয়েছে" : "বিক্রি রেকর্ড পাওয়া যায়নি" };
}

function listSales(data) {
  const perm = checkPermission(data.token, ["Admin", "প্রতিনিধি"]);
  if (!perm.ok) return { success: false, message: perm.message };
  const ss = getDealerSpreadsheet(perm.payload.dealerId);
  const sheet = getSheet(ss, "Sales");
  return { success: true, sales: genericListRows(sheet) };
}

/*******************************************************
 * পারফরম্যান্স: বিক্রি পেজের জন্য প্যাকেজ+গ্রাহক+বিক্রি — তিনটি আলাদা
 * কল না করে একবারেই সব ডাটা ফেরত দেওয়া (নেটওয়ার্ক রাউন্ড-ট্রিপ কমাতে)
 *******************************************************/
function getSalesPageData(data) {
  const perm = checkPermission(data.token, ["Admin", "প্রতিনিধি"]);
  if (!perm.ok) return { success: false, message: perm.message };

  const ss = getDealerSpreadsheet(perm.payload.dealerId);
  const pkgResult = listPackages(data); // ক্যাশড থাকলে দ্রুত
  const customers = genericListRows(getSheet(ss, "Customers"));
  const sales = genericListRows(getSheet(ss, "Sales"));

  return {
    success: true,
    packages: pkgResult.success ? pkgResult.packages : [],
    customers: customers,
    sales: sales
  };
}

/*=========================================================
 *  ড্যাশবোর্ড সামারি — Admin + প্রতিনিধি
 *=======================================================*/
function getDashboardSummary(data) {
  const perm = checkPermission(data.token, ["Admin", "প্রতিনিধি"]);
  if (!perm.ok) return { success: false, message: perm.message };

  const ss = getDealerSpreadsheet(perm.payload.dealerId);
  const masterSS = getMasterSS();
  const packages = genericListRows(getSheet(masterSS, "Packages"));
  const customers = genericListRows(getSheet(ss, "Customers"));
  const sales = genericListRows(getSheet(ss, "Sales")).filter(function (s) { return s["স্ট্যাটাস"] === "বিক্রিত"; });

  // অর্ডার ইনভয়েস এখন শেয়ার্ড মাস্টার SalesInvoice শীটে থাকে (ইনভয়েস নং
  // অনুযায়ী ডিডুপ করে গোনা হচ্ছে, নিজের DealerID এর সীমার মধ্যে)
  const invoiceLines = genericListRows(getSheet(masterSS, "SalesInvoice"))
    .filter(function (e) { return e["DealerID"] === perm.payload.dealerId; });
  const seenInvoiceNos = {};
  invoiceLines.forEach(function (e) { seenInvoiceNos[e["ইনভয়েস নং"]] = true; });
  const totalOrders = Object.keys(seenInvoiceNos).length;

  const runningPackages = packages.filter(function (p) { return p["ধরন"] === "এক্টিভ"; });

  return {
    success: true,
    summary: {
      totalPackages: packages.length,
      runningPackages: runningPackages.length,
      totalCustomers: customers.length,
      totalOrders: totalOrders,
      totalSales: sales.length
    }
  };
}

/*=========================================================
 *  খরচ ভাউচার (ExpenseVoucher) — ডিলারের নিজস্ব খরচ, Admin + প্রতিনিধি
 *=======================================================*/
function addExpenseVoucher(data) {
  const perm = checkPermission(data.token, ["Admin", "প্রতিনিধি"]);
  if (!perm.ok) return { success: false, message: perm.message };

  const ss = getDealerSpreadsheet(perm.payload.dealerId);
  const sheet = getSheet(ss, "ExpenseVoucher");

  const entries = (data.entries || []).map(function (entry) {
    return {
      "তারিখ": entry.তারিখ ? new Date(entry.তারিখ) : new Date(),
      "বিবরণ": entry.বিবরণ,
      "পরিমাণ": entry.পরিমাণ
    };
  });

  const addedIds = batchAppendRows(sheet, entries, "EV", "VoucherID");

  return { success: true, voucherIds: addedIds, message: addedIds.length + " টি খরচ এন্ট্রি যোগ হয়েছে" };
}

function listExpenseVouchers(data) {
  const perm = checkPermission(data.token, ["Admin", "প্রতিনিধি"]);
  if (!perm.ok) return { success: false, message: perm.message };

  const ss = getDealerSpreadsheet(perm.payload.dealerId);
  const sheet = getSheet(ss, "ExpenseVoucher");
  return { success: true, vouchers: genericListRows(sheet) };
}

function updateExpenseVoucher(data) {
  const perm = checkPermission(data.token, ["Admin"]);
  if (!perm.ok) return { success: false, message: perm.message };

  const ss = getDealerSpreadsheet(perm.payload.dealerId);
  const sheet = getSheet(ss, "ExpenseVoucher");
  const ok = genericUpdateRow(sheet, "VoucherID", data.voucherId, data.fields || {});
  return { success: ok, message: ok ? "আপডেট হয়েছে" : "খরচ রেকর্ড পাওয়া যায়নি" };
}

function deleteExpenseVoucher(data) {
  const perm = checkPermission(data.token, ["Admin"]);
  if (!perm.ok) return { success: false, message: perm.message };

  const ss = getDealerSpreadsheet(perm.payload.dealerId);
  const sheet = getSheet(ss, "ExpenseVoucher");
  const ok = genericDeleteRow(sheet, "VoucherID", data.voucherId);
  return { success: ok, message: ok ? "ডিলিট হয়েছে" : "খরচ রেকর্ড পাওয়া যায়নি" };
}

/*=========================================================
 *  এজেন্সি ড্যাশবোর্ড সামারি — মোট ডিলার, ব্যবহারকারী, টাকা, কমিশন, খরচ
 *=======================================================*/
function getAgencyDashboardSummary(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  const masterSS = getMasterSS();
  const dealers = genericListRows(getSheet(masterSS, "Dealers"));
  const users = genericListRows(getSheet(masterSS, "Users"));
  const commissions = genericListRows(getSheet(masterSS, "Commission"));
  const expenses = genericListRows(getSheet(masterSS, "Expense"));

  let totalCommission = 0;
  commissions.forEach(function (c) { totalCommission += Number(c["টাকার পরিমাণ"]) || 0; });

  let totalExpense = 0;
  expenses.forEach(function (e) { totalExpense += Number(e["টাকা"]) || 0; });

  return {
    success: true,
    summary: {
      totalDealers: dealers.length,
      totalUsers: users.length,
      totalCommission: totalCommission,
      totalExpense: totalExpense,
      totalMoney: totalCommission // "মোট টাকা" — এজেন্সি থেকে ডিলারদের দেওয়া মোট কমিশন/টাকার সমষ্টি
    }
  };
}

/*******************************************************
 * QR কোড স্ক্যান করলে যা দেখাবে — গ্রাহক হওয়ার তারিখ, মোট কতবার
 * ক্রয় করেছে, সর্বশেষ ক্রয়ের তারিখ (কোনো টোকেন লাগে না, পাবলিক ভিউ)
 *******************************************************/
function getCustomerCardInfo(dealerId, customerId) {
  try {
    const ss = getDealerSpreadsheet(dealerId);
    const customers = genericListRows(getSheet(ss, "Customers"));
    const customer = customers.find(function (c) { return c["CustomerID"] === customerId; });
    if (!customer) return { success: false, message: "গ্রাহক পাওয়া যায়নি" };

    const sales = genericListRows(getSheet(ss, "Sales")).filter(function (s) {
      return s["CustomerID"] === customerId && s["স্ট্যাটাস"] === "বিক্রিত";
    });

    let lastPurchaseDate = null;
    sales.forEach(function (s) {
      const d = (s["তারিখ"] instanceof Date) ? s["তারিখ"] : new Date(s["তারিখ"]);
      if (!lastPurchaseDate || d > lastPurchaseDate) lastPurchaseDate = d;
    });

    return {
      success: true,
      customerName: customer["নাম"],
      joinDate: customer["তারিখ"],
      purchaseCount: sales.length,
      lastPurchaseDate: lastPurchaseDate
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}
