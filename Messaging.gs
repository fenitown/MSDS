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
  let m = String(mobile === undefined || mobile === null ? "" : mobile);
  m = m.replace(/[০-৯]/g, function (d) { return "০১২৩৪৫৬৭৮৯".indexOf(d); }); // বাংলা অঙ্ক → ইংরেজি
  m = m.replace(/[^0-9+]/g, "");
  if (m.indexOf("+") === 0) m = m.substring(1);
  if (m.indexOf("880") === 0) return m;
  if (m.indexOf("0") === 0) return "88" + m;
  // শীটে শুরুর ০ কেটে গিয়ে ১০ ডিজিট (1712345678) থাকলে ০ বসিয়ে নেওয়া
  if (m.length === 10 && m.charAt(0) === "1") return "880" + m;
  return m;
}

function isValidBdMobile(normalized) {
  return /^8801[0-9]{9}$/.test(normalized);
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
  const cache = CacheService.getScriptCache();
  const key = "dealer_nameaddr_" + dealerId;
  try {
    const hit = cache.get(key);
    if (hit) return JSON.parse(hit);
  } catch (e) { /* ক্যাশ না থাকলে সরাসরি পড়া হবে */ }

  const sheet = getSheet(getMasterSS(), "Dealers");
  const rows = genericListRows(sheet);
  let info = { name: "", address: "" };
  for (let i = 0; i < rows.length; i++) {
    if (rows[i]["DealerID"] === dealerId) {
      info = {
        name: String(rows[i]["নাম"] || "").trim(),
        address: String(rows[i]["ঠিকানা"] || "").trim()
      };
      break;
    }
  }
  try { cache.put(key, JSON.stringify(info), 600); } catch (e) { /* বাদ */ }
  return info;
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

  // ডুপ্লিকেট/খালি/ভুল নম্বর বাদ
  const unique = [];
  const seen = {};
  let invalid = 0;
  (recipients || []).forEach(function (r) {
    const clean = normalizeMobileBD(r && r.mobile);
    if (!clean) return;
    if (!isValidBdMobile(clean)) { invalid++; return; }
    if (!seen[clean]) { seen[clean] = true; unique.push({ norm: clean, name: r.name }); }
  });

  // সব রিকোয়েস্ট আগে তৈরি করে একসাথে (প্যারালাল) পাঠানো হয় — একটা একটা করে পাঠালে অনেক ধীর
  const smsReqs = [], waReqs = [];
  unique.forEach(function (rcp) {
    const text = composeCustomerMessage(rcp.name, mainText, dealerInfo.name, dealerInfo.address);
    if (smsEnabled) {
      if (providerType === "traccar") {
        smsReqs.push({
          url: config.smsTraccarUrl, method: "post", contentType: "application/json",
          headers: { Authorization: config.smsApiKey },
          payload: JSON.stringify({ to: "+" + rcp.norm, message: text }),
          muteHttpExceptions: true
        });
      } else {
        smsReqs.push({
          url: config.smsGatewayUrlTemplate
            .replace(/\{api_key\}/g, encodeURIComponent(config.smsApiKey || ""))
            .replace(/\{from\}/g, encodeURIComponent(fromMobile || ""))
            .replace(/\{to\}/g, encodeURIComponent(rcp.norm))
            .replace(/\{message\}/g, encodeURIComponent(text)),
          method: "get", muteHttpExceptions: true
        });
      }
    }
    if (waEnabled) {
      waReqs.push({
        url: config.whatsappApiUrl, method: "post", contentType: "application/json",
        headers: { Authorization: "Bearer " + config.whatsappToken },
        payload: JSON.stringify({ messaging_product: "whatsapp", to: rcp.norm, type: "text", text: { body: text } }),
        muteHttpExceptions: true
      });
    }
  });

  const smsRes = smsEnabled ? fetchAllSafe(smsReqs) : [];
  const waRes = waEnabled ? fetchAllSafe(waReqs) : [];

  let smsSent = 0, smsFailed = 0, waSent = 0, waFailed = 0;
  let smsLastError = "", waLastError = "";
  smsRes.forEach(function (r) {
    if (r.ok) smsSent++; else { smsFailed++; smsLastError = String(r.response || r.reason || "").substring(0, 300); }
  });
  waRes.forEach(function (r) {
    if (r.ok) waSent++; else { waFailed++; waLastError = String(r.response || r.reason || "").substring(0, 300); }
  });

  return {
    total: unique.length, invalid: invalid,
    firstNumber: unique.length ? unique[0].norm : "",
    smsEnabled: smsEnabled, smsSent: smsSent, smsFailed: smsFailed, smsLastError: smsLastError,
    waEnabled: waEnabled, waSent: waSent, waFailed: waFailed, waLastError: waLastError
  };
}

/*******************************************************
 * UrlFetchApp.fetchAll দিয়ে প্যারালালে পাঠানো (২০টি করে ব্যাচ)।
 * ফেরত: প্রতিটি রিকোয়েস্টের জন্য { ok, response, reason }
 *******************************************************/
function fetchAllSafe(requests) {
  const out = [];
  const CHUNK = 20;
  for (let i = 0; i < requests.length; i += CHUNK) {
    const chunk = requests.slice(i, i + CHUNK);
    try {
      const resps = UrlFetchApp.fetchAll(chunk);
      resps.forEach(function (resp) {
        const code = resp.getResponseCode();
        out.push({ ok: code >= 200 && code < 300, response: resp.getContentText() });
      });
    } catch (e) {
      // ব্যাচে কোনো একটা রিকোয়েস্ট ভুল হলে পুরো ব্যাচ ব্যর্থ হয় — একটা একটা করে আবার চেষ্টা
      chunk.forEach(function (req) {
        try {
          const resp = UrlFetchApp.fetch(req.url, req);
          const code = resp.getResponseCode();
          out.push({ ok: code >= 200 && code < 300, response: resp.getContentText() });
        } catch (e2) {
          out.push({ ok: false, reason: e2.toString() });
        }
      });
    }
  }
  return out;
}

/*******************************************************
 * ডিলার সাইট — নিজের গ্রাহকদের মেসেজ পাঠানো (Admin + প্রতিনিধি)
 * ডিলার নিজের সেট করা কনফিগ ব্যবহার করেই পাঠানো হয়
 * data: { token, fromMobile, message (শুধু মূল লেখা), type: "all"|"location"|"ward"|"single" (single এ customerId লাগে), locations: [...] (প্রাপ্তির স্থানের নাম অথবা ওয়ার্ড নং) }
 * গ্রাহকের নাম এবং ডিলারের নাম/ঠিকানা সার্ভার নিজেই বসিয়ে দেয়
 *******************************************************/
function sendCustomerMessage(data) {
  const perm = checkPermission(data.token, ["Admin", "প্রতিনিধি"]);
  if (!perm.ok) return { success: false, message: perm.message };

  if (!data.message || !String(data.message).trim()) return { success: false, message: "মেসেজ লিখুন" };

  const dealerId = perm.payload.dealerId;

  // একই অনুরোধ দুইবার এলে (ডাবল ক্লিক/ধীর নেটওয়ার্কে আবার চাপা) দ্বিতীয়টি আটকে দেওয়া হয়
  if (data.requestId) {
    const lock = LockService.getScriptLock();
    lock.waitLock(5000);
    try {
      const cache = CacheService.getScriptCache();
      const key = "msgreq_" + dealerId + "_" + data.requestId;
      if (cache.get(key)) return { success: false, message: "এই মেসেজটি ইতিমধ্যে পাঠানো হয়েছে বা পাঠানো চলছে" };
      cache.put(key, "1", 600);
    } finally {
      lock.releaseLock();
    }
  }
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

  // তিন ধরনের মেসেজ: সকল গ্রাহক / প্রাপ্তির স্থান ভিত্তিক / ওয়ার্ড ভিত্তিক
  let targeted = customers;
  let statusText = "সকল গ্রাহক";
  const picked = (data.locations || []).map(function (x) { return String(x).trim(); });
  if (data.type === "location" && picked.length) {
    targeted = customers.filter(function (c) {
      return picked.indexOf(String(c["প্রাপ্তির স্থান"] || "").trim()) !== -1;
    });
    statusText = picked.join(", ");
  } else if (data.type === "single" && data.customerId) {
    // নতুন গ্রাহক সংরক্ষণের পর শুধু সেই একজনকে মেসেজ
    targeted = customers.filter(function (c) { return c["CustomerID"] === data.customerId; });
    statusText = targeted.length ? ("গ্রাহক: " + targeted[0]["নাম"]) : "গ্রাহক";
  } else if (data.type === "ward" && picked.length) {
    targeted = customers.filter(function (c) {
      return picked.indexOf(String(c["ওয়ার্ড নং"] === undefined || c["ওয়ার্ড নং"] === null ? "" : c["ওয়ার্ড নং"]).trim()) !== -1;
    });
    statusText = "ওয়ার্ড: " + picked.join(", ");
  }

  const recipients = targeted.map(function (c) {
    return { mobile: c["মোবাইল নং"], name: c["নাম"] };
  });
  const dealerInfo = getDealerNameAndAddress(dealerId);
  const result = sendBulkToRecipients(config, data.fromMobile, String(data.message).trim(), recipients, dealerInfo);

  // মেসেজ তালিকায় সংরক্ষণ (ব্যর্থ হলেও পাঠানোর ফলাফল আটকাবে না)
  try {
    const msgSheet = getMessagesSheet(ss);
    // সারি ডিলিট করা যায় বলে সারি-সংখ্যা ভিত্তিক আইডি না নিয়ে সময় ভিত্তিক ইউনিক আইডি
    const msgId = "MS" + Utilities.formatDate(new Date(), "UTC", "yyMMddHHmmss") + Math.floor(100 + Math.random() * 900);
    genericAddRow(msgSheet, {
      "MessageID": msgId,
      "মেসেজ": String(data.message).trim(),
      "তারিখ ও সময়": new Date(),
      "ধরন": data.type === "location" ? "প্রাপ্তির স্থান" : (data.type === "ward" ? "ওয়ার্ড" : (data.type === "single" ? "একক গ্রাহক" : "সকল গ্রাহক")),
      "স্ট্যাটাস": statusText,
      "মোট প্রাপক": result.total
    });
  } catch (e) { /* লগ সংরক্ষণ ব্যর্থ হলে বাদ */ }

  return Object.assign({ success: true, message: "মেসেজ পাঠানো সম্পন্ন হয়েছে" }, result);
}

/*******************************************************
 * "Messages" ট্যাব — আগের ডিলারদের শীটে না থাকলে নিজে তৈরি হবে
 *******************************************************/
function getMessagesSheet(ss) {
  let sheet = ss.getSheetByName("Messages");
  if (!sheet) {
    ensureSheetsWithHeaders(ss, { "Messages": DEALER_SHEETS_DEF["Messages"] });
    sheet = ss.getSheetByName("Messages");
  }
  return sheet;
}

/*******************************************************
 * পাঠানো মেসেজের তালিকা (পুরনো → নতুন ক্রমে) — Admin + প্রতিনিধি
 * data: { token }
 *******************************************************/
function listMessages(data) {
  const perm = checkPermission(data.token, ["Admin", "প্রতিনিধি"]);
  if (!perm.ok) return { success: false, message: perm.message };

  const ss = getDealerSpreadsheet(perm.payload.dealerId);
  const sheet = getMessagesSheet(ss);
  return { success: true, messages: genericListRows(sheet) };
}

/*******************************************************
 * মেসেজ তালিকা থেকে একটি মেসেজ ডিলিট (শুধু তালিকার রেকর্ড মোছে,
 * আগে পাঠানো মেসেজ ফেরত যায় না) — Admin + প্রতিনিধি
 * data: { token, messageId }
 *******************************************************/
function deleteMessage(data) {
  const perm = checkPermission(data.token, ["Admin", "প্রতিনিধি"]);
  if (!perm.ok) return { success: false, message: perm.message };

  const ss = getDealerSpreadsheet(perm.payload.dealerId);
  const sheet = getMessagesSheet(ss);
  const ok = genericDeleteRow(sheet, "MessageID", data.messageId);
  return { success: ok, message: ok ? "মেসেজ ডিলিট হয়েছে" : "মেসেজ পাওয়া যায়নি" };
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
