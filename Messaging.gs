/*******************************************************
 * TCB-স্টাইল ডিলার ম্যানেজমেন্ট সফটওয়্যার
 * Messaging.gs — ডিলার নিজের গ্রাহকদের কাছে SMS ও WhatsApp এ
 * একসাথে বাল্ক মেসেজ পাঠানো
 *
 * MasterRegistry এর একই Apps Script প্রজেক্টে নতুন ফাইল
 * হিসেবে যোগ করুন (নাম দিন: Messaging)
 *
 * ================= গুরুত্বপূর্ণ =================
 * এই মেসেজিং ফিচার শুধুমাত্র ডিলার সাইটে থাকে — প্রত্যেক ডিলার
 * নিজের গ্রাহকদের মেসেজ পাঠানোর জন্য নিজের নিজের SMS/WhatsApp
 * API নিজে সেট করে নেবে (গ্রাহক → মেসেজিং সেটাপ থেকে, শুধু Admin
 * রোল দেখতে/বদলাতে পারবে)। প্রতিটি ডিলারের কনফিগ আলাদা আলাদাভাবে
 * সংরক্ষিত থাকে, একজনেরটা আরেকজনের সাথে মিশবে না। মূল এজেন্সি
 * (ডিপু) সাইটে কোনো মেসেজিং সুবিধা নেই।
 *
 * Google Apps Script নিজে থেকে SMS/WhatsApp পাঠাতে পারে না —
 * SMS এর জন্য দুইটা অপশন আছে (ডিলার সেটাপ ফরম থেকে যেকোনো একটা
 * বেছে নেবে):
 *
 * === অপশন A: নিজের ফোনের সিম দিয়ে — Traccar SMS Gateway (Play Store) ===
 * Google Play Store থেকে সরাসরি "Traccar SMS Gateway" অ্যাপ ইনস্টল করা
 * যায়, কোনো সাইডলোডের ঝামেলা নেই। অ্যাপ খুলে SMS পারমিশন দিন, সেটিংসে
 * "Cloud" মোড চালু করুন (Local/LAN মোড Apps Script থেকে কাজ করবে
 * না, কারণ Apps Script গুগলের সার্ভারে চলে, আপনার ফোনের একই WiFi
 * নেটওয়ার্কে না) — তখন একটা URL ও Token পাবেন, সেটাপ ফরমে বসান।
 * মেসেজ পাঠালে ঠিক ম্যানুয়ালি ওই ফোন থেকে পাঠানোর মতোই সেই সিমের
 * প্যাকেজ/ব্যালেন্স থেকে কাটবে — সম্পূর্ণ ফ্রি সফটওয়্যার, শুধু
 * ফোনের সিমের স্বাভাবিক SMS খরচ লাগবে।
 *
 * === অপশন B: পেইড SMS গেটওয়ে (BulkSMSBD ইত্যাদি) ===
 *    http://bulksmsbd.net/api/smsapi?api_key={api_key}&type=text&number={to}&senderid={from}&message={message}
 *    URL এর ভেতরে {api_key}, {from}, {to}, {message} — এই চারটি
 *    প্লেসহোল্ডার ঠিক এভাবেই থাকতে হবে, বাকিটা প্রতিটি গেটওয়ের
 *    নিজস্ব ডকুমেন্টেশন অনুযায়ী বসবে।
 * ২) SMS API Key — গেটওয়ে থেকে পাওয়া চাবি
 * ৩) WhatsApp API Endpoint URL — যেমন Meta এর অফিসিয়াল
 *    WhatsApp Business Cloud API:
 *    https://graph.facebook.com/v20.0/<PHONE_NUMBER_ID>/messages
 * ৪) WhatsApp Access Token — Meta/প্রোভাইডার থেকে পাওয়া টোকেন
 *
 * imo মেসেজিং সাপোর্ট করা হয়নি — imo কোনো পাবলিক/বিজনেস API
 * সরবরাহ করে না।
 *
 * SMS ও WhatsApp সম্পূর্ণ স্বাধীন — একটি সেটআপ না থাকলেও অন্যটি
 * কাজ করবে (কনফিগ ফাঁকা থাকলে সেই চ্যানেলটি শুধু স্কিপ হবে)।
 *******************************************************/

const MESSAGING_CONFIG_KEYS = ["smsProviderType", "smsGatewayUrlTemplate", "smsApiKey", "smsSenderId", "smsTraccarUrl", "whatsappApiUrl", "whatsappToken"];
// smsProviderType সম্ভাব্য মান:
//  "traccar"      — নিজের Android ফোনের সিম দিয়ে (Traccar SMS Gateway অ্যাপ — Play Store
//                   থেকে সরাসরি ইনস্টল করা যায়, APK সাইডলোডের ঝামেলা নেই)
//  "url_template" — পেইড SMS গেটওয়ে (BulkSMSBD ইত্যাদি), URL টেমপ্লেট দিয়ে GET রিকোয়েস্ট
// (আগে textbee অপশন ছিল, এখন বাদ — পুরনো "textbee" সেভ করা থাকলে সেটা "traccar"
//  হিসেবে ধরা হয়, এবং Traccar URL/Token না থাকলে "সেটআপ হয়নি" দেখাবে)

/*******************************************************
 * SMS প্রোভাইডারের ধরন ও প্রস্তুত আছে কিনা — একই লজিক সব জায়গায় ব্যবহার হয়
 *******************************************************/
function getSmsProviderType(config) {
  return config.smsProviderType === "url_template" ? "url_template" : "traccar";
}

function isSmsReady(config) {
  return getSmsProviderType(config) === "traccar"
    ? !!(config.smsTraccarUrl && config.smsApiKey)
    : !!config.smsGatewayUrlTemplate;
}

function isWhatsAppReady(config) {
  return !!(config.whatsappApiUrl && config.whatsappToken);
}

/*******************************************************
 * ScriptProperties থেকে একটি নির্দিষ্ট ডিলারের মেসেজিং কনফিগ পড়া
 * (প্রতিটি ডিলারের জন্য আলাদা কী দিয়ে সংরক্ষিত)
 *******************************************************/
function getDealerMessagingConfigRaw(dealerId) {
  const props = PropertiesService.getScriptProperties();
  const config = {};
  MESSAGING_CONFIG_KEYS.forEach(function (k) {
    config[k] = props.getProperty("MSG_" + dealerId + "_" + k) || "";
  });
  return config;
}

/*******************************************************
 * ডিলার — নিজের মেসেজিং কনফিগ দেখা (শুধু Admin)
 * data: { token }
 *******************************************************/
function getDealerMessagingConfig(data) {
  const perm = checkPermission(data.token, ["Admin"]);
  if (!perm.ok) return { success: false, message: perm.message };
  return { success: true, config: getDealerMessagingConfigRaw(perm.payload.dealerId) };
}

/*******************************************************
 * ডিলার — নিজের মেসেজিং কনফিগ সংরক্ষণ (শুধু Admin)
 * data: { token, smsProviderType, smsGatewayUrlTemplate, smsApiKey, smsSenderId,
 *         smsTraccarUrl, whatsappApiUrl, whatsappToken }
 *******************************************************/
function saveDealerMessagingConfig(data) {
  const perm = checkPermission(data.token, ["Admin"]);
  if (!perm.ok) return { success: false, message: perm.message };

  const props = PropertiesService.getScriptProperties();
  const dealerId = perm.payload.dealerId;
  MESSAGING_CONFIG_KEYS.forEach(function (k) {
    props.setProperty("MSG_" + dealerId + "_" + k, data[k] || "");
  });

  return { success: true, message: "মেসেজিং সেটিংস সংরক্ষিত হয়েছে" };
}

/*******************************************************
 * "মেসেজ" ফরম খোলার সময় ব্যবহারের জন্য হালকা স্ট্যাটাস —
 * Admin ও প্রতিনিধি দুজনেই পড়তে পারবে (আসল API Key/Token
 * শেয়ার না করে শুধু দরকারি তথ্যটুকু দেওয়া হয়, যাতে মেসেজ ফরমে
 * ঠিকভাবে বোঝা যায় গেটওয়ে সেটআপ করা আছে কিনা)
 *******************************************************/
function getMessagingStatus(data) {
  const perm = checkPermission(data.token, ["Admin", "প্রতিনিধি"]);
  if (!perm.ok) return { success: false, message: perm.message };

  const config = getDealerMessagingConfigRaw(perm.payload.dealerId);

  return {
    success: true,
    smsProviderType: getSmsProviderType(config),
    smsSenderId: config.smsSenderId || "",
    smsReady: isSmsReady(config),
    waReady: isWhatsAppReady(config)
  };
}

/*******************************************************
 * বাংলাদেশি লোকাল নম্বর (01XXXXXXXXX) কে আন্তর্জাতিক ফরম্যাটে
 * (৮৮01XXXXXXXXX) রূপান্তর — অধিকাংশ BD SMS/WhatsApp গেটওয়ে এই
 * ফরম্যাটই চায়। ইতিমধ্যে + বা ৮৮ দিয়ে শুরু থাকলে অপরিবর্তিত রাখা হয়
 *******************************************************/
function normalizeMobileBD(mobile) {
  let m = String(mobile || "").replace(/[^0-9+]/g, "");
  if (m.indexOf("+") === 0) m = m.substring(1);
  if (m.indexOf("880") === 0) return m;
  if (m.indexOf("0") === 0) return "88" + m;
  return m;
}

/*******************************************************
 * একটি নম্বরে SMS গেটওয়ে দিয়ে মেসেজ পাঠানো
 * config.smsGatewayUrlTemplate এ {api_key},{from},{to},{message}
 * প্লেসহোল্ডারগুলো আসল মান দিয়ে বদলে দিয়ে GET রিকোয়েস্ট পাঠানো হয়
 * {from} এর জায়গায় Sender ID (BulkSMSBD এর ক্ষেত্রে এটা মোবাইল
 * নম্বর না, তাদের দেওয়া Approved Sender ID কোড) বসে
 *******************************************************/
function sendSmsViaGateway(config, fromMobile, toMobile, message) {
  if (!config.smsGatewayUrlTemplate) return { ok: false, skipped: true };
  try {
    const url = config.smsGatewayUrlTemplate
      .replace(/\{api_key\}/g, encodeURIComponent(config.smsApiKey || ""))
      .replace(/\{from\}/g, encodeURIComponent(fromMobile || ""))
      .replace(/\{to\}/g, encodeURIComponent(normalizeMobileBD(toMobile)))
      .replace(/\{message\}/g, encodeURIComponent(message));
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const code = resp.getResponseCode();
    return { ok: code >= 200 && code < 300, response: resp.getContentText() };
  } catch (e) {
    return { ok: false, reason: e.toString() };
  }
}

/*******************************************************
 * একটি নম্বরে WhatsApp Business Cloud API (Meta) ফরম্যাটে
 * মেসেজ পাঠানো — অন্য প্রোভাইডার ব্যবহার করলে payload বদলাতে হবে
 *******************************************************/
function sendWhatsAppMessage(config, toMobile, message) {
  if (!config.whatsappApiUrl || !config.whatsappToken) return { ok: false, skipped: true };
  try {
    const payload = {
      messaging_product: "whatsapp",
      to: normalizeMobileBD(toMobile),
      type: "text",
      text: { body: message }
    };
    const resp = UrlFetchApp.fetch(config.whatsappApiUrl, {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + config.whatsappToken },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    const code = resp.getResponseCode();
    return { ok: code >= 200 && code < 300, response: resp.getContentText() };
  } catch (e) {
    return { ok: false, reason: e.toString() };
  }
}

/*******************************************************
 * Traccar SMS Gateway (Play Store অ্যাপ, cloud মোডে) — নিজের
 * Android ফোনকে SMS গেটওয়ে বানিয়ে সেই ফোনের সিম দিয়ে মেসেজ
 * পাঠানো। প্রতি নম্বরে আলাদা POST রিকোয়েস্ট লাগে (bulk সাপোর্ট নেই)
 *******************************************************/
function sendSmsViaTraccar(config, toMobile, message) {
  if (!config.smsTraccarUrl || !config.smsApiKey) return { ok: false, skipped: true };
  try {
    const payload = { to: "+" + normalizeMobileBD(toMobile), message: message };
    const resp = UrlFetchApp.fetch(config.smsTraccarUrl, {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: config.smsApiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    const code = resp.getResponseCode();
    return { ok: code >= 200 && code < 300, response: resp.getContentText() };
  } catch (e) {
    return { ok: false, reason: e.toString() };
  }
}

/*******************************************************
 * ডিলারের নাম ও ঠিকানা (Master "Dealers" ট্যাব থেকে) — মেসেজের নিচে অটো বসে
 *******************************************************/
function getDealerNameAndAddress(dealerId) {
  const sheet = getSheet(getMasterSS(), "Dealers");
  const rows = genericListRows(sheet);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i]["DealerID"] === dealerId) {
      return {
        name: String(rows[i]["নাম"] || "").trim(),
        address: String(rows[i]["ঠিকানা"] || "").trim()
      };
    }
  }
  return { name: "", address: "" };
}

/*******************************************************
 * চূড়ান্ত মেসেজ তৈরি — ডিলার শুধু মূল লেখাটা লেখেন, বাকিটা অটো বসে:
 *
 *   প্রিয় <গ্রাহকের নাম>,
 *   <ডিলারের লেখা মূল মেসেজ>
 *
 *   <ডিলারের নাম>
 *   <ডিলারের ঠিকানা>
 *******************************************************/
function composeCustomerMessage(customerName, mainText, dealerName, dealerAddress) {
  const greeting = "প্রিয় " + (String(customerName || "").trim() || "গ্রাহক") + ",";
  const signature = [dealerName, dealerAddress]
    .map(function (s) { return String(s || "").trim(); })
    .filter(function (s) { return s; })
    .join("\n");
  return greeting + "\n" + mainText + (signature ? "\n\n" + signature : "");
}

/*******************************************************
 * একাধিক প্রাপককে (ডুপ্লিকেট/খালি নম্বর বাদ দিয়ে) SMS + WhatsApp —
 * যেটা কনফিগার করা আছে সেটাই পাঠানো হবে, অন্যটা স্কিপ হবে।
 * প্রতিটি গ্রাহকের নাম আলাদা বলে প্রতি নম্বরে আলাদা মেসেজ তৈরি হয়।
 * recipients: [ { mobile, name }, ... ]
 *******************************************************/
function sendBulkToRecipients(config, fromMobile, mainText, recipients, dealerInfo) {
  const providerType = getSmsProviderType(config);
  const smsEnabled = isSmsReady(config);
  const waEnabled = isWhatsAppReady(config);

  const unique = [];
  const seen = {};
  (recipients || []).forEach(function (r) {
    const clean = String((r && r.mobile) || "").trim();
    if (clean && !seen[clean]) { seen[clean] = true; unique.push({ mobile: clean, name: r.name }); }
  });

  let smsSent = 0, smsFailed = 0, waSent = 0, waFailed = 0;
  let smsLastError = "", waLastError = "";

  unique.forEach(function (rcp) {
    const text = composeCustomerMessage(rcp.name, mainText, dealerInfo.name, dealerInfo.address);

    if (smsEnabled) {
      const r = (providerType === "traccar")
        ? sendSmsViaTraccar(config, rcp.mobile, text)
        : sendSmsViaGateway(config, fromMobile, rcp.mobile, text);
      if (r.ok) smsSent++; else { smsFailed++; smsLastError = String(r.response || r.reason || "").substring(0, 300); }
    }

    if (waEnabled) {
      const r2 = sendWhatsAppMessage(config, rcp.mobile, text);
      if (r2.ok) waSent++; else { waFailed++; waLastError = String(r2.response || r2.reason || "").substring(0, 300); }
    }
  });

  return {
    total: unique.length,
    smsEnabled: smsEnabled, smsSent: smsSent, smsFailed: smsFailed, smsLastError: smsLastError,
    waEnabled: waEnabled, waSent: waSent, waFailed: waFailed, waLastError: waLastError
  };
}

/*******************************************************
 * ডিলার সাইট — নিজের গ্রাহকদের মেসেজ পাঠানো (Admin + প্রতিনিধি)
 * ডিলার নিজের সেট করা কনফিগ ব্যবহার করেই পাঠানো হয়
 * data: { token, fromMobile, message (শুধু মূল লেখা), type: "all"|"location", locations: [...] }
 * গ্রাহকের নাম এবং ডিলারের নাম/ঠিকানা সার্ভার নিজেই বসিয়ে দেয়
 *******************************************************/
function sendCustomerMessage(data) {
  const perm = checkPermission(data.token, ["Admin", "প্রতিনিধি"]);
  if (!perm.ok) return { success: false, message: perm.message };

  if (!data.message || !String(data.message).trim()) return { success: false, message: "মেসেজ লিখুন" };

  const dealerId = perm.payload.dealerId;
  const config = getDealerMessagingConfigRaw(dealerId);
  const providerType = getSmsProviderType(config);
  if (!isSmsReady(config) && !isWhatsAppReady(config)) {
    return { success: false, message: "এখনো কোনো SMS/WhatsApp সেটআপ করা হয়নি। গ্রাহক → মেসেজিং সেটাপ থেকে আগে সেটআপ করুন।" };
  }
  // শুধু url_template (পেইড গেটওয়ে) মোডে Sender ID আবশ্যক — traccar এ
  // ফোনের নিজের নম্বর স্বয়ংক্রিয়ভাবে ব্যবহৃত হয়, আলাদা করে লাগে না
  if (providerType === "url_template" && !data.fromMobile) {
    return { success: false, message: "Sender ID / মোবাইল নং দিন" };
  }

  const ss = getDealerSpreadsheet(dealerId);
  const customers = genericListRows(getSheet(ss, "Customers"));

  let targeted = customers;
  if (data.type === "location" && data.locations && data.locations.length) {
    targeted = customers.filter(function (c) {
      return data.locations.indexOf(c["প্রাপ্তির স্থান"]) !== -1;
    });
  }

  const recipients = targeted.map(function (c) {
    return { mobile: c["মোবাইল নং"], name: c["নাম"] };
  });
  const dealerInfo = getDealerNameAndAddress(dealerId);
  const result = sendBulkToRecipients(config, data.fromMobile, String(data.message).trim(), recipients, dealerInfo);

  return Object.assign({ success: true, message: "মেসেজ পাঠানো সম্পন্ন হয়েছে" }, result);
}

/*******************************************************
 * একবারের অনুমতি (UrlFetchApp / external_request) নেওয়ার জন্য —
 * এডিটর থেকে একবার Run করলে "Connect to an external service"
 * পারমিশন চাইবে। এরপর চাইলে এটা রেখে দিতে পারেন
 *******************************************************/
function authorizeExternalRequest() {
  UrlFetchApp.fetch("https://www.google.com", { muteHttpExceptions: true });
  Logger.log("অনুমতি সম্পন্ন");
}
