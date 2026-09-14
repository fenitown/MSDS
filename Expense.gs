/*******************************************************
 * TCB-স্টাইল ডিলার ম্যানেজমেন্ট সফটওয়্যার
 * Expense.gs — খরচ (মূল এজেন্সির নিজস্ব খরচের হিসাব)
 *
 * MasterRegistry এর একই Apps Script প্রজেক্টে নতুন ফাইল
 * হিসেবে যোগ করুন (নাম দিন: Expense)
 * সব একশন শুধুমাত্র মূল এজেন্সি (AGENCY) লগইন করতে পারবে
 *
 * data.entries: [ { তারিখ, বিবরণ, পরিমাণ }, ... ]  — একাধিক এন্ট্রি একসাথে যোগ করা যাবে
 *******************************************************/

function addExpense(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  const masterSS = getMasterSS();
  const sheet = getSheet(masterSS, "Expense");

  const entries = (data.entries || []).map(function (entry) {
    return {
      "তারিখ": entry.তারিখ ? new Date(entry.তারিখ) : new Date(),
      "বিবরণ": entry.বিবরণ,
      "পরিমাণ": entry.পরিমাণ
    };
  });

  const addedIds = batchAppendRows(sheet, entries, "EX", "ExpenseID");

  return { success: true, expenseIds: addedIds, message: addedIds.length + " টি খরচ এন্ট্রি যোগ হয়েছে" };
}

function listExpenses(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  const masterSS = getMasterSS();
  const sheet = getSheet(masterSS, "Expense");
  return { success: true, expenses: genericListRows(sheet) };
}

function updateExpense(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  const masterSS = getMasterSS();
  const sheet = getSheet(masterSS, "Expense");
  const ok = genericUpdateRow(sheet, "ExpenseID", data.expenseId, data.fields || {});
  return { success: ok, message: ok ? "আপডেট হয়েছে" : "খরচ রেকর্ড পাওয়া যায়নি" };
}

function deleteExpense(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  const masterSS = getMasterSS();
  const sheet = getSheet(masterSS, "Expense");
  const ok = genericDeleteRow(sheet, "ExpenseID", data.expenseId);
  return { success: ok, message: ok ? "ডিলিট হয়েছে" : "খরচ রেকর্ড পাওয়া যায়নি" };
}
