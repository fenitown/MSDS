/*******************************************************
 * TCB/MSDS ডিলার ম্যানেজমেন্ট সফটওয়্যার
 * Stock.gs — স্টক (পণ্য তালিকা, স্টক ইন ভাউচার), বিক্রয় ইনভয়েস
 * (এজেন্সি থেকে ডিলারকে প্যাকেজ বিক্রি), এবং এজেন্সি রিপোর্ট
 *
 * MasterRegistry এর একই Apps Script প্রজেক্টে নতুন ফাইল হিসেবে
 * যোগ করুন (নাম দিন: Stock)
 * সব একশন শুধুমাত্র মূল এজেন্সি (AGENCY) লগইন করতে পারবে
 *******************************************************/

/*=========================================================
 *  পণ্য তালিকা (Products)
 *=======================================================*/
function addProduct(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  const masterSS = getMasterSS();
  const sheet = getSheet(masterSS, "Products");
  const productId = generateId(sheet, "PR");
  const marketPrice = Number(data.marketPrice) || 0;
  const comboPrice = Number(data.comboPrice) || 0;

  genericAddRow(sheet, {
    "ProductID": productId,
    "পণ্যের নাম": data.নাম,
    "ব্র্যান্ড": data.brand,
    "বাজার মূল্য": marketPrice,
    "কম্বো মূল্য": comboPrice,
    "সাশ্রয়ী": marketPrice - comboPrice
  });

  invalidateAgencyCaches();
  return { success: true, productId: productId, message: "পণ্য যোগ হয়েছে" };
}

function listProducts(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  const cache = CacheService.getScriptCache();
  const cached = cache.get("products_cache_v1");
  if (cached) return { success: true, products: JSON.parse(cached) };

  const masterSS = getMasterSS();
  const sheet = getSheet(masterSS, "Products");
  const products = genericListRows(sheet);

  try { cache.put("products_cache_v1", JSON.stringify(products), 30); } catch (e) { /* বাদ */ }
  return { success: true, products: products };
}

function updateProduct(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  const masterSS = getMasterSS();
  const sheet = getSheet(masterSS, "Products");
  const ok = genericUpdateRow(sheet, "ProductID", data.productId, data.fields || {});
  invalidateProductCache();
  return { success: ok, message: ok ? "পণ্য আপডেট হয়েছে" : "পণ্য পাওয়া যায়নি" };
}

function deleteProduct(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  const masterSS = getMasterSS();
  const sheet = getSheet(masterSS, "Products");
  const ok = genericDeleteRow(sheet, "ProductID", data.productId);
  invalidateProductCache();
  return { success: ok, message: ok ? "পণ্য ডিলিট হয়েছে" : "পণ্য পাওয়া যায়নি" };
}

function invalidateProductCache() {
  CacheService.getScriptCache().remove("products_cache_v1");
}

/*=========================================================
 *  স্টক ইন ভাউচার (StockInVoucher) — এক ভাউচারে একাধিক পণ্য
 *=======================================================*/
function addStockVoucher(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  const masterSS = getMasterSS();
  const sheet = getSheet(masterSS, "StockInVoucher");
  const voucherNo = "SV" + Utilities.formatString("%06d", Math.floor(Math.random() * 900000) + 100000);
  const now = new Date();

  const items = data.items || [];
  let grandTotal = 0;
  const rows = items.map(function (item) {
    const marketPrice = Number(item.marketPrice) || 0;
    const comboPrice = Number(item.comboPrice) || 0;
    const total = (Number(item.quantity) || 0) * comboPrice;
    grandTotal += total;
    return {
      "ভাউচার নং": voucherNo,
      "তারিখ": now,
      "ProductID": item.productId,
      "পণ্যের নাম": item.productName || "",
      "বাজার মূল্য": marketPrice,
      "কম্বো মূল্য": comboPrice,
      "সাশ্রয়ী": marketPrice - comboPrice,
      "সংখ্যা": item.quantity,
      "মোট মূল্য": total
    };
  });

  batchAppendRows(sheet, rows, "SVE", "EntryID");

  return { success: true, voucherNo: voucherNo, total: grandTotal, message: "স্টক ইন ভাউচার যোগ হয়েছে" };
}

function listStockVouchers(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  const masterSS = getMasterSS();
  const sheet = getSheet(masterSS, "StockInVoucher");
  return { success: true, entries: genericListRows(sheet) };
}

function updateStockVoucherEntry(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  const masterSS = getMasterSS();
  const sheet = getSheet(masterSS, "StockInVoucher");
  const ok = genericUpdateRow(sheet, "EntryID", data.entryId, data.fields || {});
  return { success: ok, message: ok ? "আপডেট হয়েছে" : "এন্ট্রি পাওয়া যায়নি" };
}

/*******************************************************
 * পুরো ভাউচার (তার সব পণ্য-লাইন) ডিলিট করা
 *******************************************************/
function deleteStockVoucher(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  const masterSS = getMasterSS();
  const sheet = getSheet(masterSS, "StockInVoucher");
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idx = headers.indexOf("ভাউচার নং");

  for (let i = values.length - 1; i >= 1; i--) {
    if (values[i][idx] === data.voucherNo) {
      sheet.deleteRow(i + 1);
    }
  }
  return { success: true, message: "ভাউচার ডিলিট হয়েছে" };
}

/*=========================================================
 *  বিক্রয় ইনভয়েস (SalesInvoice) — এজেন্সি থেকে ডিলারকে বিক্রি
 *=======================================================*/
function addSalesInvoice(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  const masterSS = getMasterSS();
  const sheet = getSheet(masterSS, "SalesInvoice");
  const dealersSheet = getSheet(masterSS, "Dealers");
  const dealerInfo = getDealerRow(dealersSheet, data.dealerId);
  if (!dealerInfo) return { success: false, message: "ডিলার পাওয়া যায়নি" };

  // ডিলারের মোবাইল/ঠিকানা Dealers ট্যাব থেকে অটো আনা
  const dealersData = dealersSheet.getDataRange().getValues();
  const dHeaders = dealersData[0];
  const idxId = dHeaders.indexOf("DealerID");
  const idxMobile = dHeaders.indexOf("মোবাইল");
  const idxThikana = dHeaders.indexOf("ঠিকানা");
  let dealerMobile = "", dealerThikana = "";
  for (let i = 1; i < dealersData.length; i++) {
    if (dealersData[i][idxId] === data.dealerId) {
      dealerMobile = dealersData[i][idxMobile];
      dealerThikana = dealersData[i][idxThikana];
      break;
    }
  }

  const invoiceNo = "SI" + Utilities.formatString("%06d", Math.floor(Math.random() * 900000) + 100000);
  const now = new Date();

  const items = data.items || [];
  let subtotal = 0;
  items.forEach(function (item) {
    subtotal += (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
  });
  const discount = Number(data.discount) || 0;
  const paid = Number(data.paid) || 0;
  const due = subtotal - discount - paid;

  const rows = items.map(function (item) {
    const total = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
    const commissionPct = Number(item.commissionPercent) || 0;
    const commissionAmt = total * commissionPct / 100;
    return {
      "ইনভয়েস নং": invoiceNo,
      "তারিখ": now,
      "DealerID": data.dealerId,
      "ডিলার নাম": dealerInfo.name,
      "মোবাইল": dealerMobile,
      "ঠিকানা": dealerThikana,
      "PackageID": item.packageId,
      "প্যাকেজ": item.packageName || "",
      "একক মূল্য": item.unitPrice,
      "সংখ্যা": item.quantity,
      "মোট মূল্য": total,
      "কমিশন %": commissionPct,
      "কমিশন মূল্য": commissionAmt,
      "পরিশোধযোগ্য মূল্য": total - commissionAmt,
      "সাবটোটাল": subtotal,
      "ডিসকাউন্ট": discount,
      "পরিশোধ": paid,
      "বকেয়া": due
    };
  });

  batchAppendRows(sheet, rows, "SIE", "EntryID");

  return {
    success: true, invoiceNo: invoiceNo, subtotal: subtotal, discount: discount, paid: paid, due: due,
    message: "বিক্রয় ইনভয়েস যোগ হয়েছে"
  };
}

function listSalesInvoices(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  const masterSS = getMasterSS();
  const sheet = getSheet(masterSS, "SalesInvoice");
  return { success: true, entries: genericListRows(sheet) };
}

function updateSalesInvoiceEntry(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  const masterSS = getMasterSS();
  const sheet = getSheet(masterSS, "SalesInvoice");
  const ok = genericUpdateRow(sheet, "EntryID", data.entryId, data.fields || {});
  return { success: ok, message: ok ? "আপডেট হয়েছে" : "এন্ট্রি পাওয়া যায়নি" };
}

function deleteSalesInvoice(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  const masterSS = getMasterSS();
  const sheet = getSheet(masterSS, "SalesInvoice");
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idx = headers.indexOf("ইনভয়েস নং");

  for (let i = values.length - 1; i >= 1; i--) {
    if (values[i][idx] === data.invoiceNo) {
      sheet.deleteRow(i + 1);
    }
  }
  return { success: true, message: "ইনভয়েস ডিলিট হয়েছে" };
}

/*=========================================================
 *  এজেন্সি রিপোর্ট — বিক্রয় ইনভয়েসের ভিত্তিতে দৈনিক/মাসিক/মোট,
 *  ডিলার-ভিত্তিক অথবা সব ডিলার মিলিয়ে
 *  data: { token, mode: "daily"/"monthly"/"total", date, year, month, dealerId (ঐচ্ছিক) }
 *=======================================================*/
function agencySalesReport(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  const masterSS = getMasterSS();
  const sheet = getSheet(masterSS, "SalesInvoice");
  let entries = genericListRows(sheet);

  // একই ইনভয়েসের একাধিক লাইন থেকে ডুপ্লিকেট সাবটোটাল এড়াতে,
  // প্রতিটি ইনভয়েস নং একবারই গোনা হবে সাবটোটাল/ডিসকাউন্ট/পরিশোধ/বকেয়ার জন্য,
  // কিন্তু "মোট মূল্য" প্রতিটি লাইন থেকেই যোগ হবে (পণ্য/প্যাকেজ-ভিত্তিক বিক্রি)
  if (data.dealerId) {
    entries = entries.filter(function (e) { return e["DealerID"] === data.dealerId; });
  }

  if (data.mode === "daily" && data.date) {
    entries = entries.filter(function (e) {
      return toDateStr(e["তারিখ"]) === data.date;
    });
  } else if (data.mode === "monthly" && data.year && data.month) {
    const year = Number(data.year), month = Number(data.month);
    entries = entries.filter(function (e) {
      const d = (e["তারিখ"] instanceof Date) ? e["তারিখ"] : new Date(e["তারিখ"]);
      return d.getFullYear() === year && (d.getMonth() + 1) === month;
    });
  }
  // mode === "total" হলে ফিল্টার ছাড়াই সব

  const seenInvoices = {};
  let totalSale = 0, totalDiscount = 0, totalPaid = 0, totalDue = 0;
  const byDealer = {};

  entries.forEach(function (e) {
    totalSale += Number(e["মোট মূল্য"]) || 0;

    const dealerKey = e["DealerID"];
    if (!byDealer[dealerKey]) {
      byDealer[dealerKey] = { dealerId: dealerKey, dealerName: e["ডিলার নাম"], totalSale: 0, totalDiscount: 0, totalPaid: 0, totalDue: 0 };
    }
    byDealer[dealerKey].totalSale += Number(e["মোট মূল্য"]) || 0;

    // ইনভয়েস-লেভেল মান (সাবটোটাল/ডিসকাউন্ট/পরিশোধ/বকেয়া) প্রতিটি ইনভয়েসে একবারই গোনা
    const invKey = e["ইনভয়েস নং"];
    if (!seenInvoices[invKey]) {
      seenInvoices[invKey] = true;
      totalDiscount += Number(e["ডিসকাউন্ট"]) || 0;
      totalPaid += Number(e["পরিশোধ"]) || 0;
      totalDue += Number(e["বকেয়া"]) || 0;
      byDealer[dealerKey].totalDiscount += Number(e["ডিসকাউন্ট"]) || 0;
      byDealer[dealerKey].totalPaid += Number(e["পরিশোধ"]) || 0;
      byDealer[dealerKey].totalDue += Number(e["বকেয়া"]) || 0;
    }
  });

  return {
    success: true,
    report: {
      totalInvoiceCount: Object.keys(seenInvoices).length,
      totalSale: totalSale,
      totalDiscount: totalDiscount,
      totalPaid: totalPaid,
      totalDue: totalDue,
      byDealer: Object.keys(byDealer).map(function (k) { return byDealer[k]; })
    }
  };
}
