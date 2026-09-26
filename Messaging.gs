/*******************************************************
 * TCB-স্টাইল ডিলার ম্যানেজমেন্ট সফটওয়্যার
 * Messaging.gs — গ্রাহক/ডিলারদের কাছে SMS ও WhatsApp এ একসাথে
 * বাল্ক মেসেজ পাঠানো
 *
 * MasterRegistry এর একই Apps Script প্রজেক্টে নতুন ফাইল
 * হিসেবে যোগ করুন (নাম দিন: Messaging)
 *
 * ================= গুরুত্বপূর্ণ =================
 * Google Apps Script নিজে থেকে SMS/WhatsApp পাঠাতে পারে না —
 * এর জন্য একটি তৃতীয় পক্ষের গেটওয়ে/API লাগে। এজেন্সি সাইটের
 * "ব্যবস্থাপনা → ডিপু সেটাপ" পেজ থেকে নিচের তথ্য একবার দিয়ে
 * দিলেই SMS/WhatsApp চালু হয়ে যাবে:
 *
 * ১) SMS গেটওয়ে URL টেমপ্লেট (উদাহরণ — BulkSMSBD এর মতো
 *    বাংলাদেশি গেটওয়ে সাধারণত এভাবে কাজ করে):
 *    http://bulksmsbd.net/api/smsapi?api_key={api_key}&type=text&number={to}&senderid={from}&message={message}
 *    URL এর ভেতরে {api_key}, {from}, {to}, {message} — এই চারটি
 *    প্লেসহোল্ডার ঠিক এভাবেই থাকতে হবে, বাকিটা প্রতিটি গেটওয়ের
 *    নিজস্ব ডকুমেন্টেশন অনুযায়ী বসবে।
 * ২) SMS API Key — গেটওয়ে থেকে পাওয়া চাবি
 * ৩) WhatsApp API Endpoint URL — যেমন Meta এর অফিসিয়াল
 *    WhatsApp Business Cloud API:
 *    https://graph.facebook.com/v20.0/<PHONE_NUMBER_ID>/messages
 *    (Twilio/360dialog এর মতো অন্য প্রোভাইডার ব্যবহার করলে তাদের
 *    endpoint বসবে — কিন্তু payload ফরম্যাট মিলাতে sendWhatsAppMessage()
 *    ফাংশনটি সেই অনুযায়ী সামান্য পরিবর্তন করতে হতে পারে)
 * ৪) WhatsApp Access Token — Meta/প্রোভাইডার থেকে পাওয়া টোকেন
 *
 * imo মেসেজিং সাপোর্ট করা হয়নি — imo কোনো পাবলিক/বিজনেস API
 * সরবরাহ করে না, তাই কোনো সফটওয়্যার থেকে imo তে সরাসরি মেসেজ
 * পাঠানো প্রযুক্তিগতভাবে সম্ভব না।
 *
 * SMS ও WhatsApp সম্পূর্ণ স্বাধীন — একটি সেটআপ না থাকলেও অন্যটি
 * কাজ করবে (উপরের কনফিগ ফাঁকা থাকলে সেই চ্যানেলটি শুধু স্কিপ হবে)।
 *******************************************************/

const MESSAGING_CONFIG_KEYS = ["smsGatewayUrlTemplate", "smsApiKey", "whatsappApiUrl", "whatsappToken"];

/*******************************************************
 * ScriptProperties থেকে মেসেজিং কনফিগ পড়া
 *******************************************************/
function getMessagingConfigRaw() {
  const props = PropertiesService.getScriptProperties();
  const config = {};
  MESSAGING_CONFIG_KEYS.forEach(function (k) {
    config[k] = props.getProperty("MSG_" + k) || "";
  });
  return config;
}

/*******************************************************
 * এজেন্সি — মেসেজিং কনফিগ দেখা (ডিপু সেটাপ পেজে)
 *******************************************************/
function getMessagingConfig(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };
  return { success: true, config: getMessagingConfigRaw() };
}

/*******************************************************
 * এজেন্সি — মেসেজিং কনফিগ সংরক্ষণ
 *******************************************************/
function saveMessagingConfig(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  const props = PropertiesService.getScriptProperties();
  MESSAGING_CONFIG_KEYS.forEach(function (k) {
    props.setProperty("MSG_" + k, data[k] || "");
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
function sendBulkToNumbers(fromMobile, message, numbers) {
  const config = getMessagingConfigRaw();
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
 * data: { token, fromMobile, message, type: "all"|"location", locations: [...] }
 *******************************************************/
function sendCustomerMessage(data) {
  const perm = checkPermission(data.token, ["Admin", "প্রতিনিধি"]);
  if (!perm.ok) return { success: false, message: perm.message };

  if (!data.fromMobile) return { success: false, message: "মোবাইল নং (Sender) দিন" };
  if (!data.message) return { success: false, message: "মেসেজ লিখুন" };

  const ss = getDealerSpreadsheet(perm.payload.dealerId);
  const customers = genericListRows(getSheet(ss, "Customers"));

  let targeted = customers;
  if (data.type === "location" && data.locations && data.locations.length) {
    targeted = customers.filter(function (c) {
      return data.locations.indexOf(c["প্রাপ্তির স্থান"]) !== -1;
    });
  }

  const numbers = targeted.map(function (c) { return c["মোবাইল নং"]; });
  const result = sendBulkToNumbers(data.fromMobile, data.message, numbers);

  return Object.assign({ success: true, message: "মেসেজ পাঠানো সম্পন্ন হয়েছে" }, result);
}

/*******************************************************
 * এজেন্সি সাইট — ডিলারদের মেসেজ পাঠানো (শুধু মূল এজেন্সি)
 * data: { token, fromMobile, message, dealerIds: [...] } — dealerIds
 * খালি রাখলে সকল ডিলারকে পাঠানো হবে
 *******************************************************/
function sendDealerMessage(data) {
  const perm = checkAgencyPermission(data.token);
  if (!perm.ok) return { success: false, message: perm.message };

  if (!data.fromMobile) return { success: false, message: "মোবাইল নং (Sender) দিন" };
  if (!data.message) return { success: false, message: "মেসেজ লিখুন" };

  const masterSS = getMasterSS();
  const dealers = genericListRows(getSheet(masterSS, "Dealers"));

  let targeted = dealers;
  if (data.dealerIds && data.dealerIds.length) {
    targeted = dealers.filter(function (d) {
      return data.dealerIds.indexOf(d["DealerID"]) !== -1;
    });
  }

  const numbers = targeted.map(function (d) { return d["মোবাইল"]; });
  const result = sendBulkToNumbers(data.fromMobile, data.message, numbers);

  return Object.assign({ success: true, message: "মেসেজ পাঠানো সম্পন্ন হয়েছে" }, result);
}
