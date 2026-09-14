/*******************************************************
 * TCB-স্টাইল ডিলার ম্যানেজমেন্ট সফটওয়্যার
 * Reports.gs — দৈনিক, মাসিক, সর্বমোট রিপোর্ট
 *
 * MasterRegistry এর একই Apps Script প্রজেক্টে নতুন ফাইল
 * হিসেবে যোগ করুন (নাম দিন: Reports)
 *******************************************************/

/*******************************************************
 * তারিখ কে yyyy-MM-dd স্ট্রিং এ রূপান্তর (স্ক্রিপ্টের টাইমজোন অনুযায়ী)
 *******************************************************/
function toDateStr(value) {
  const d = (value instanceof Date) ? value : new Date(value);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

/*******************************************************
 * মূল রিপোর্ট বিল্ডার — বিক্রিত সেলস ফিল্টার করে প্যাকেজ-ভিত্তিক গ্রুপ করে
 * (প্যাকেজ তথ্য এখন Master Spreadsheet থেকে আসে, Sales ডিলারের নিজের শীট থেকে)
 *******************************************************/
function buildSalesReport(ss, filterFn) {
  const salesSheet = getSheet(ss, "Sales");
  const masterSS = getMasterSS();
  const pkgSheet = getSheet(masterSS, "Packages");

  const allSales = genericListRows(salesSheet).filter(function (s) {
    return s["স্ট্যাটাস"] === "বিক্রিত";
  });
  const packages = genericListRows(pkgSheet);
  const pkgMap = {};
  packages.forEach(function (p) { pkgMap[p["PackageID"]] = p; });

  const filtered = allSales.filter(filterFn);

  const byPackage = {};
  let grandTotal = 0;

  filtered.forEach(function (s) {
    const pkg = pkgMap[s["PackageID"]];
    // বিক্রির সময় নির্ধারিত মূল্যই আসল হিসাব — এটা প্যাকেজের ডিফল্ট
    // মূল্য থেকে ম্যানুয়ালি বদলানো থাকতে পারে; না থাকলে (পুরনো
    // রেকর্ড) প্যাকেজের বর্তমান মূল্য দিয়ে হিসাব করা হয়
    const price = (s["মূল্য"] !== undefined && s["মূল্য"] !== "" && s["মূল্য"] !== null)
      ? Number(s["মূল্য"]) || 0
      : (pkg ? (Number(pkg["সর্বমোট কম্বো মূল্য (সর্বমোট মূল্য)"]) || 0) : 0);
    grandTotal += price;

    const key = s["PackageID"];
    if (!byPackage[key]) {
      byPackage[key] = {
        packageId: key,
        packageName: pkg ? pkg["নাম"] : "(অজানা প্যাকেজ)",
        count: 0,
        total: 0
      };
    }
    byPackage[key].count += 1;
    byPackage[key].total += price;
  });

  return {
    totalCount: filtered.length,
    grandTotal: grandTotal,
    byPackage: Object.keys(byPackage).map(function (k) { return byPackage[k]; })
  };
}

/*******************************************************
 * দৈনিক রিপোর্ট — data: { token, date: "yyyy-MM-dd" }
 *******************************************************/
function dailyReport(data) {
  const perm = checkPermission(data.token, ["Admin", "প্রতিনিধি"]);
  if (!perm.ok) return { success: false, message: perm.message };

  const ss = getDealerSpreadsheet(perm.payload.dealerId);
  const targetDate = data.date; // "yyyy-MM-dd"

  const report = buildSalesReport(ss, function (s) {
    return toDateStr(s["তারিখ"]) === targetDate;
  });

  return { success: true, date: targetDate, report: report };
}

/*******************************************************
 * মাসিক রিপোর্ট — data: { token, year: 2026, month: 9 }
 *******************************************************/
function monthlyReport(data) {
  const perm = checkPermission(data.token, ["Admin", "প্রতিনিধি"]);
  if (!perm.ok) return { success: false, message: perm.message };

  const ss = getDealerSpreadsheet(perm.payload.dealerId);
  const year = Number(data.year);
  const month = Number(data.month); // ১-১২

  const report = buildSalesReport(ss, function (s) {
    const d = (s["তারিখ"] instanceof Date) ? s["তারিখ"] : new Date(s["তারিখ"]);
    return d.getFullYear() === year && (d.getMonth() + 1) === month;
  });

  return { success: true, year: year, month: month, report: report };
}

/*******************************************************
 * সর্বমোট রিপোর্ট — data: { token }
 *******************************************************/
function totalReport(data) {
  const perm = checkPermission(data.token, ["Admin", "প্রতিনিধি"]);
  if (!perm.ok) return { success: false, message: perm.message };

  const ss = getDealerSpreadsheet(perm.payload.dealerId);
  const report = buildSalesReport(ss, function () { return true; });

  return { success: true, report: report };
}
