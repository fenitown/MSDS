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
 * এর জন্য একটি তৃতীয় পক্ষের গেটওয়ে/API লাগে:
 *
 * ১) SMS গেটওয়ে URL টেমপ্লেট (উদাহরণ — BulkSMSBD):
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

const MESSAGING_CONFIG_KEYS = ["smsGatewayUrlTemplate", "smsApiKey", "whatsappApiUrl", "whatsappToken"];

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
 * data: { token, smsGatewayUrlTemplate, smsApiKey, whatsappApiUrl, whatsappToken }
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
 * বাংলাদেশি লোকাল নম্বর (01XXXXXXXXX) কে WhatsApp/আন্তর্জাতিক
 * ফরম্যাটে (৮৮01XXXXXXXXX) রূপান্তর — ইতিমধ্যে + বা ৮৮ দিয়ে
 * শুরু থাকলে অপরিবর্তিত রাখা হয়
 *******************************************************/
function normalizeMobileForWhatsApp(mobile) {
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
 *******************************************************/
function sendSmsViaGateway(config, fromMobile, toMobile, message) {
  if (!config.smsGatewayUrlTemplate) return { ok: false, skipped: true };
  try {
    const url = config.smsGatewayUrlTemplate
      .replace(/\{api_key\}/g, encodeURIComponent(config.smsApiKey || ""))
      .replace(/\{from\}/g, encodeURIComponent(fromMobile || ""))
      .replace(/\{to\}/g, encodeURIComponent(toMobile))
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
      to: normalizeMobileForWhatsApp(toMobile),
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
 * একাধিক নম্বরে (ডুপ্লিকেট/খালি বাদ দিয়ে) SMS + WhatsApp —
 * যেটা কনফিগার করা আছে সেটাই পাঠানো হবে, অন্যটা স্কিপ হবে
 *******************************************************/
function sendBulkToNumbers(config, fromMobile, message, numbers) {
  const smsEnabled = !!config.smsGatewayUrlTemplate;
  const waEnabled = !!(config.whatsappApiUrl && config.whatsappToken);

  const uniqueNumbers = [];
  const seen = {};
  (numbers || []).forEach(function (n) {
    const clean = String(n || "").trim();
    if (clean && !seen[clean]) { seen[clean] = true; uniqueNumbers.push(clean); }
  });

  let smsSent = 0, smsFailed = 0, waSent = 0, waFailed = 0;
  uniqueNumbers.forEach(function (num) {
    if (smsEnabled) {
      const r = sendSmsViaGateway(config, fromMobile, num, message);
      if (r.ok) smsSent++; else smsFailed++;
    }
    if (waEnabled) {
      const r2 = sendWhatsAppMessage(config, num, message);
      if (r2.ok) waSent++; else waFailed++;
    }
  });

  return {
    total: uniqueNumbers.length,
    smsEnabled: smsEnabled, smsSent: smsSent, smsFailed: smsFailed,
    waEnabled: waEnabled, waSent: waSent, waFailed: waFailed
  };
}

/*******************************************************
 * ডিলার সাইট — নিজের গ্রাহকদের মেসেজ পাঠানো (Admin + প্রতিনিধি)
 * ডিলার নিজের সেট করা কনফিগ ব্যবহার করেই পাঠানো হয়
 * data: { token, fromMobile, message, type: "all"|"location", locations: [...] }
 *******************************************************/
function sendCustomerMessage(data) {
  const perm = checkPermission(data.token, ["Admin", "প্রতিনিধি"]);
  if (!perm.ok) return { success: false, message: perm.message };

  if (!data.fromMobile) return { success: false, message: "মোবাইল নং (Sender) দিন" };
  if (!data.message) return { success: false, message: "মেসেজ লিখুন" };

  const dealerId = perm.payload.dealerId;
  const config = getDealerMessagingConfigRaw(dealerId);
  if (!config.smsGatewayUrlTemplate && !(config.whatsappApiUrl && config.whatsappToken)) {
    return { success: false, message: "এখনো কোনো SMS/WhatsApp API সেটআপ করা হয়নি। গ্রাহক → মেসেজিং সেটাপ থেকে আগে সেটআপ করুন।" };
  }

  const ss = getDealerSpreadsheet(dealerId);
  const customers = genericListRows(getSheet(ss, "Customers"));

  let targeted = customers;
  if (data.type === "location" && data.locations && data.locations.length) {
    targeted = customers.filter(function (c) {
      return data.locations.indexOf(c["প্রাপ্তির স্থান"]) !== -1;
    });
  }

  const numbers = targeted.map(function (c) { return c["মোবাইল নং"]; });
  const result = sendBulkToNumbers(config, data.fromMobile, data.message, numbers);

  return Object.assign({ success: true, message: "মেসেজ পাঠানো সম্পন্ন হয়েছে" }, result);
}
