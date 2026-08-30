#include "web_app.h"
#include "config.h"
#include "can_manager.h"
#include "simulator.h"
#include "logger.h"
#include <WiFi.h>
#include <LittleFS.h>
#include <esp_system.h>
#include <esp_heap_caps.h>
#include <cstdarg>

WebApp Web;

namespace {
File dbcUploadFile;
String dbcUploadPath;
size_t dbcUploadSize = 0U;
bool dbcUploadFailed = false;

bool appendFormat(char* buffer, size_t capacity, size_t& used, const char* format, ...) {
  if (!buffer || used >= capacity) return false;
  va_list args;
  va_start(args, format);
  const int written = vsnprintf(buffer + used, capacity - used, format, args);
  va_end(args);
  if (written < 0) return false;
  const size_t count = static_cast<size_t>(written);
  if (count >= capacity - used) {
    buffer[capacity - 1U] = '\0';
    used = capacity - 1U;
    return false;
  }
  used += count;
  return true;
}

void bytesToHex(const uint8_t* data, uint8_t dlc, char* output, size_t capacity) {
  static constexpr char HEX_DIGITS[] = "0123456789ABCDEF";
  if (!output || capacity == 0U) return;
  const uint8_t safeDlc = dlc > 8U ? 8U : dlc;
  const size_t needed = static_cast<size_t>(safeDlc) * 2U + 1U;
  if (capacity < needed) { output[0] = '\0'; return; }
  for (uint8_t i = 0; i < safeDlc; ++i) {
    output[i * 2U] = HEX_DIGITS[(data[i] >> 4U) & 0x0FU];
    output[i * 2U + 1U] = HEX_DIGITS[data[i] & 0x0FU];
  }
  output[safeDlc * 2U] = '\0';
}

}  // namespace

static bool parseHexByte(const String& text, uint8_t& out) {
  if (text.length() != 2U) return false;
  char* end = nullptr;
  const long value = strtol(text.c_str(), &end, 16);
  if (*end != '\0' || value < 0 || value > 255) return false;
  out = static_cast<uint8_t>(value);
  return true;
}

void WebApp::begin() {
  lastPipelineStatsMs_ = millis();
  minFreeHeap_ = ESP.getFreeHeap();
  minLargestHeapBlock_ = heap_caps_get_largest_free_block(MALLOC_CAP_8BIT);
  addDiagnosticEvent("Systemstart");
  WiFi.mode(WIFI_AP);
  if (!WiFi.softAP(Config::AP_SSID, Config::AP_PASSWORD)) {
    Serial.println("[WIFI] Access Point konnte nicht gestartet werden");
  } else {
    Serial.printf("[WIFI] AP %s gestartet, IP %s\n", Config::AP_SSID,
                  WiFi.softAPIP().toString().c_str());
  }
  setupRoutes();
  server_.begin();
  ws_.begin();
  // Keep dead browser connections from occupying a WebSocket client slot.
  // The library sends protocol-level PING frames and disconnects clients that
  // do not answer with PONG twice in succession.
  ws_.enableHeartbeat(10000U, 3000U, 2U);
  ws_.onEvent([this](uint8_t client, WStype_t type, uint8_t* payload, size_t length) {
    if (type == WStype_CONNECTED) {
      if (wsClientCount_ < 255) ++wsClientCount_;
      addDiagnosticEvent("Browser verbunden");
      Serial.printf("[WS] Client %u verbunden\n", client);
    } else if (type == WStype_DISCONNECTED) {
      if (wsClientCount_ > 0) --wsClientCount_;
      addDiagnosticEvent("Browser getrennt");
      Serial.printf("[WS] Client %u getrennt\n", client);
    } else if (type == WStype_TEXT && payload && length > 3U && length < 80U) {
      char text[80]{}; memcpy(text, payload, length); text[length] = '\0';
      unsigned long id = 0; unsigned ext = 0, rtr = 0; char data[17]{};
      if (sscanf(text, "TX:%lx:%u:%u:%16s", &id, &ext, &rtr, data) == 4) {
        const size_t hexLength = strlen(data);
        CanFrame frame{}; frame.timestampUs = micros(); frame.id = static_cast<uint32_t>(id);
        frame.extended = ext != 0U; frame.rtr = rtr != 0U;
        frame.dlc = static_cast<uint8_t>((hexLength / 2U) > 8U ? 8U : (hexLength / 2U));
        bool valid = hexLength % 2U == 0U && id <= (frame.extended ? 0x1FFFFFFFUL : 0x7FFUL);
        for (uint8_t i = 0; valid && i < frame.dlc; ++i) {
          char part[3]{data[i * 2U], data[i * 2U + 1U], '\0'}; char* end = nullptr;
          frame.data[i] = static_cast<uint8_t>(strtoul(part, &end, 16)); valid = end && *end == '\0';
        }
        if (valid) Can.send(frame);
      }
    }
  });
}

void WebApp::setupRoutes() {
  server_.on("/", HTTP_GET, [this]() {
    File file = LittleFS.open("/index.html", "r");
    if (!file) {
      server_.send(500, "text/plain", "index.html missing - run: pio run -t uploadfs");
      return;
    }
    server_.sendHeader("Cache-Control", "no-store, max-age=0");
    server_.streamFile(file, "text/html");
    file.close();
  });

  server_.on("/api/dbc/upload", HTTP_POST,
    [this]() {
      if (dbcUploadFile) dbcUploadFile.close();
      if (dbcUploadFailed) {
        if (dbcUploadPath.length()) LittleFS.remove(dbcUploadPath);
        server_.send(400, "application/json", "{\"ok\":false,\"error\":\"upload failed\"}");
      } else {
        server_.send(200, "application/json", "{\"ok\":true,\"size\":" + String(dbcUploadSize) + "}");
      }
    },
    [this]() {
      HTTPUpload& upload = server_.upload();
      if (upload.status == UPLOAD_FILE_START) {
        dbcUploadFailed = false;dbcUploadSize = 0U;dbcUploadPath = "";
        String name = upload.filename;
        const int slash = max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
        if (slash >= 0) name = name.substring(slash + 1);
        if (!name.length() || name.indexOf("..") >= 0 || !(name.endsWith(".dbc") || name.endsWith(".DBC"))) {
          dbcUploadFailed = true;return;
        }
        if (!LittleFS.exists("/dbc")) LittleFS.mkdir("/dbc");
        dbcUploadPath = "/dbc/" + name;
        dbcUploadFile = LittleFS.open(dbcUploadPath, FILE_WRITE);
        if (!dbcUploadFile) dbcUploadFailed = true;
      } else if (upload.status == UPLOAD_FILE_WRITE) {
        if (dbcUploadFailed) return;
        if (dbcUploadSize + upload.currentSize > Config::DBC_MAX_FILE_SIZE) {
          dbcUploadFailed = true;if (dbcUploadFile) dbcUploadFile.close();if (dbcUploadPath.length()) LittleFS.remove(dbcUploadPath);return;
        }
        if (!dbcUploadFile || dbcUploadFile.write(upload.buf, upload.currentSize) != upload.currentSize) {
          dbcUploadFailed = true;if (dbcUploadFile) dbcUploadFile.close();if (dbcUploadPath.length()) LittleFS.remove(dbcUploadPath);return;
        }
        dbcUploadSize += upload.currentSize;
      } else if (upload.status == UPLOAD_FILE_END) {
        if (dbcUploadFile) dbcUploadFile.close();
        if (!dbcUploadSize) {dbcUploadFailed = true;if (dbcUploadPath.length()) LittleFS.remove(dbcUploadPath);}
      } else if (upload.status == UPLOAD_FILE_ABORTED) {
        dbcUploadFailed = true;if (dbcUploadFile) dbcUploadFile.close();if (dbcUploadPath.length()) LittleFS.remove(dbcUploadPath);
      }
    });

  server_.on("/api/dbc/delete", HTTP_POST, [this]() {
    String name = server_.arg("name");name.replace("\\", "");
    if (name.indexOf('/') >= 0 || name.indexOf("..") >= 0 || !(name.endsWith(".dbc") || name.endsWith(".DBC"))) {
      server_.send(400, "application/json", "{\"ok\":false,\"error\":\"invalid name\"}");return;
    }
    const String path = "/dbc/" + name;
    const bool ok = LittleFS.exists(path) && LittleFS.remove(path);
    server_.send(ok ? 200 : 404, "application/json", ok ? "{\"ok\":true}" : "{\"ok\":false,\"error\":\"not found\"}");
  });
  server_.on("/style.css", HTTP_GET, [this]() {
    File file = LittleFS.open("/style.css", FILE_READ);
    if (!file) {
      server_.send(404, "text/plain", "style.css missing - run: pio run -t uploadfs");
      return;
    }
    server_.sendHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    server_.sendHeader("Pragma", "no-cache");
    server_.streamFile(file, "text/css");
    file.close();
  });

  server_.on("/app.js", HTTP_GET, [this]() {
    File file = LittleFS.open("/app.js", FILE_READ);
    if (!file) {
      server_.send(404, "text/plain", "app.js missing - run: pio run -t uploadfs");
      return;
    }
    server_.sendHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    server_.sendHeader("Pragma", "no-cache");
    server_.streamFile(file, "application/javascript");
    file.close();
  });

  server_.on("/api/status", HTTP_GET, [this]() {
    server_.send(200, "application/json", statusJsonString());
  });

  // DBC-Dateien werden zur Laufzeit durch die Weboberflaeche verwaltet.
  server_.on("/api/dbc/list", HTTP_GET, [this]() {
    String json = "{\"files\":[";
    bool first = true;
    File root = LittleFS.open("/dbc");
    if (root && root.isDirectory()) {
      File file = root.openNextFile();
      while (file) {
        if (!file.isDirectory()) {
          String name = file.name();
          const size_t size = file.size();
          const int slash = name.lastIndexOf('/');
          if (slash >= 0) name = name.substring(slash + 1);
          if (name.endsWith(".dbc") || name.endsWith(".DBC")) {
            name.replace("\\", "\\\\");
            name.replace("\"", "\\\"");
            if (!first) json += ',';
            json += "{\"name\":\"" + name + "\",\"size\":" + String(size) + "}";
            first = false;
          }
        }
        file.close();
        file = root.openNextFile();
        delay(0);
      }
      root.close();
    }
    json += "],\"maxSize\":" + String(Config::DBC_MAX_FILE_SIZE) + "}";
    server_.sendHeader("Cache-Control", "no-store, max-age=0");
    server_.send(200, "application/json", json);
  });

  server_.on("/api/dbc/file", HTTP_GET, [this]() {
    String name = server_.arg("name");
    name.replace("\\", "");
    if (name.indexOf('/') >= 0 || name.indexOf("..") >= 0 ||
        !(name.endsWith(".dbc") || name.endsWith(".DBC"))) {
      server_.send(400, "text/plain", "invalid dbc name");
      return;
    }
    const String path = "/dbc/" + name;
    File file = LittleFS.open(path, FILE_READ);
    if (!file || file.isDirectory()) {
      if (file) file.close();
      server_.send(404, "text/plain", "dbc file not found");
      return;
    }
    const size_t size = file.size();
    if (size > Config::DBC_MAX_FILE_SIZE) {
      file.close();
      server_.send(413, "text/plain", "dbc file too large");
      return;
    }
    server_.sendHeader("Cache-Control", "no-store, max-age=0");
    server_.sendHeader("X-DEACS-DBC-Size", String(size));
    server_.streamFile(file, "text/plain");
    file.close();
  });

  server_.on("/api/diagnostics/reset", HTTP_POST, [this]() {
    resetDiagnosticPeaks();
    server_.send(200, "application/json", statusJsonString());
  });

  server_.on("/api/diagnostics/selftest", HTTP_GET, [this]() {
    server_.send(200, "application/json", selfTestJson());
  });

  server_.on("/api/diagnostics/events", HTTP_GET, [this]() {
    server_.send(200, "application/json", diagnosticEventsJson());
  });

  server_.on("/api/sim/clear", HTTP_POST, [this]() {
    Simulator.clear();
    server_.send(200, "application/json", statusJsonString());
  });

  server_.on("/api/sim/add", HTTP_POST, [this]() {
    const bool extended = server_.arg("extended") == "1";
    const uint32_t id = strtoul(server_.arg("id").c_str(), nullptr, 16);
    String dataText = server_.arg("data");
    dataText.replace(" ", "");
    dataText.replace(",", "");
    dataText.replace("0x", "");
    bool valid = (dataText.length() % 2U == 0U) && dataText.length() <= 16U;
    const uint8_t dlc = static_cast<uint8_t>(dataText.length() / 2U);
    uint8_t data[8]{};
    for (uint8_t i = 0; i < dlc && valid; ++i) {
      valid = parseHexByte(dataText.substring(i * 2U, i * 2U + 2U), data[i]);
    }
    const bool ok = valid && Simulator.add(
      id, extended, data, dlc,
      constrain(server_.arg("interval").toInt(), 10, 60000),
      server_.arg("enabled") != "0", server_.arg("dynamic") == "1",
      static_cast<uint8_t>(server_.arg("dynamicIndex").toInt()));
    server_.send(ok ? 200 : 400, "application/json",
                 String("{\"ok\":") + (ok ? "true" : "false") + "}");
  });

  server_.on("/api/sim/start", HTTP_POST, [this]() {
    Simulator.setLiveTx(server_.arg("liveTx") == "1" || server_.arg("liveTx") == "true");
    Simulator.start();
    server_.send(200, "application/json", statusJsonString());
  });

  server_.on("/api/sim/stop", HTTP_POST, [this]() {
    Simulator.stop();
    server_.send(200, "application/json", statusJsonString());
  });

  server_.on("/api/sim/inject", HTTP_POST, [this]() {
    CanFrame frame;
    frame.timestampUs = micros();
    frame.simulated = true;
    frame.id = strtoul(server_.arg("id").c_str(), nullptr, 16);
    frame.extended = server_.arg("extended") == "1";
    frame.rtr = false;
    const uint32_t maxId = frame.extended ? 0x1FFFFFFF : 0x7FF;
    String data = server_.arg("data");
    data.replace(" ", "");
    data.replace(",", "");
    data.replace("0x", "");
    bool valid = frame.id <= maxId && (data.length() % 2U == 0U) && data.length() <= 16U;
    frame.dlc = static_cast<uint8_t>(data.length() / 2U);
    for (uint8_t i = 0; i < frame.dlc && valid; ++i) {
      valid = parseHexByte(data.substring(i * 2U, i * 2U + 2U), frame.data[i]);
    }
    if (valid) Can.inject(frame);
    server_.send(valid ? 200 : 400, "application/json",
                 String("{\"ok\":") + (valid ? "true" : "false") + "}");
  });

  server_.on("/api/can", HTTP_POST, [this]() {
    const uint32_t bitrate = server_.arg("bitrate").toInt();
    const String mode = server_.arg("mode");
    const bool validBitrate = bitrate == 1000000U || bitrate == 500000U ||
                              bitrate == 250000U || bitrate == 125000U ||
                              bitrate == 100000U || bitrate == 50000U ||
                              bitrate == 25000U;
    const bool validMode = mode == "listen" || mode == "normal" || mode == "noack";
    if (!validBitrate || !validMode) {
      server_.send(400, "application/json", statusJsonString());
      return;
    }
    const bool ok = Can.restart(bitrate, mode == "listen", mode == "noack");
    server_.send(ok ? 200 : 500, "application/json", statusJsonString());
  });

  server_.on("/api/can/toggle", HTTP_POST, [this]() {
    const bool ok = Can.running() ? Can.disconnect() : Can.reconnect();
    server_.send(ok ? 200 : 500, "application/json", statusJsonString());
  });

  server_.on("/api/filter", HTTP_POST, [this]() {
    const bool enabled = server_.arg("enabled") == "1" || server_.arg("enabled") == "true";
    filterInverted_ = server_.arg("mode") == "exclude";
    setServerFilter(server_.arg("ids"), enabled);
    server_.send(200, "application/json", statusJsonString());
  });

  server_.on("/api/send", HTTP_POST, [this]() {
    CanFrame frame;
    frame.timestampUs = micros();
    frame.id = strtoul(server_.arg("id").c_str(), nullptr, 16);
    frame.extended = server_.arg("extended") == "1";
    frame.rtr = server_.arg("rtr") == "1";
    const uint32_t maxId = frame.extended ? 0x1FFFFFFF : 0x7FF;
    String data = server_.arg("data");
    data.replace(" ", "");
    data.replace(",", "");
    data.replace("0x", "");
    bool valid = frame.id <= maxId && (data.length() % 2U == 0U) && data.length() <= 16U;
    frame.dlc = static_cast<uint8_t>(data.length() / 2U);
    if (frame.rtr && server_.hasArg("dlc")) frame.dlc = constrain(server_.arg("dlc").toInt(), 0, 8);
    for (uint8_t i = 0; i < frame.dlc && !frame.rtr && valid; ++i) {
      valid = parseHexByte(data.substring(i * 2U, i * 2U + 2U), frame.data[i]);
    }
    const bool ok = valid && Can.send(frame);
    if (ok) {
      broadcastFrame(frame, "TX");
      Logger.log(frame, "TX");
    }
    server_.send(ok ? 200 : 400, "application/json",
                 String("{\"ok\":") + (ok ? "true" : "false") + "}");
  });


  server_.on("/api/log/start", HTTP_POST, [this]() {
    const bool truncateFile = server_.arg("append") != "1";
    const bool ok = Logger.start(truncateFile);
    server_.send(ok ? 200 : 500, "application/json", statusJsonString());
  });

  server_.on("/api/log/stop", HTTP_POST, [this]() {
    Logger.stop();
    server_.send(200, "application/json", statusJsonString());
  });

  server_.on("/api/log/delete", HTTP_POST, [this]() {
    Logger.stop();
    const bool ok = !LittleFS.exists(Config::LOG_PATH) || LittleFS.remove(Config::LOG_PATH);
    server_.send(ok ? 200 : 500, "application/json", statusJsonString());
  });

  server_.on("/api/log/download", HTTP_GET, [this]() {
    if (!LittleFS.exists(Config::LOG_PATH)) {
      server_.send(404, "text/plain", "Kein Log vorhanden");
      return;
    }
    File file = LittleFS.open(Config::LOG_PATH, "r");
    server_.sendHeader("Content-Disposition", "attachment; filename=deacs_canlog.csv");
    server_.streamFile(file, "text/csv");
    file.close();
  });

  server_.onNotFound([this]() { server_.send(404, "text/plain", "Not found"); });
}

void WebApp::setServerFilter(const String& idsText, bool enabled) {
  filterIdCount_ = 0;
  String token;
  for (size_t i = 0; i <= idsText.length(); ++i) {
    const char c = i < idsText.length() ? idsText[i] : ' ';
    if (c == ' ' || c == ',' || c == ';' || c == '\t' || c == '\r' || c == '\n') {
      token.trim();
      if (token.length() > 0 && filterIdCount_ < MAX_SERVER_FILTER_IDS) {
        token.toLowerCase();
        int base = 16; // Bare CAN IDs use the usual hexadecimal notation.
        if (token.startsWith("dec:")) { token.remove(0, 4); base = 10; }
        else if (token.endsWith("d")) { token.remove(token.length() - 1); base = 10; }
        else {
          if (token.startsWith("0x")) token.remove(0, 2);
          if (token.endsWith("h")) token.remove(token.length() - 1);
        }
        char* end = nullptr;
        const unsigned long value = strtoul(token.c_str(), &end, base);
        if (end != token.c_str() && *end == '\0' && value <= 0x1FFFFFFFUL) {
          bool duplicate = false;
          for (uint8_t n = 0; n < filterIdCount_; ++n) {
            if (filterIds_[n] == value) { duplicate = true; break; }
          }
          if (!duplicate) filterIds_[filterIdCount_++] = static_cast<uint32_t>(value);
        }
      }
      token = "";
    } else {
      token += c;
    }
  }
  filterEnabled_ = enabled && filterIdCount_ > 0;
  const bool useHardwareFilter = filterEnabled_ && !filterInverted_;
  Can.setAcceptanceFilter(useHardwareFilter ? filterIds_ : nullptr,
                          useHardwareFilter ? filterIdCount_ : 0);
}

String WebApp::serverFilterIdsText() const {
  String text;
  for (uint8_t i = 0; i < filterIdCount_; ++i) {
    if (i > 0) text += ' ';
    text += String(filterIds_[i], HEX);
  }
  text.toUpperCase();
  return text;
}

bool WebApp::frameAllowed(const CanFrame& frame) const {
  if (!filterEnabled_ || filterIdCount_ == 0) return true;
  bool found = false;
  for (uint8_t i = 0; i < filterIdCount_; ++i) {
    if (filterIds_[i] == frame.id) { found = true; break; }
  }
  return filterInverted_ ? !found : found;
}


void WebApp::addDiagnosticEvent(const char* text) {
  DiagnosticEvent& event = diagnosticEvents_[diagnosticEventWrite_];
  event.ms = millis();
  snprintf(event.text, sizeof(event.text), "%s", text ? text : "");
  diagnosticEventWrite_ = (diagnosticEventWrite_ + 1U) % DIAGNOSTIC_EVENT_COUNT;
  if (diagnosticEventUsed_ < DIAGNOSTIC_EVENT_COUNT) ++diagnosticEventUsed_;
}

String WebApp::diagnosticEventsJson() const {
  String json = "{\"events\":[";
  for (uint8_t i = 0; i < diagnosticEventUsed_; ++i) {
    const uint8_t index = (diagnosticEventWrite_ + DIAGNOSTIC_EVENT_COUNT - diagnosticEventUsed_ + i) % DIAGNOSTIC_EVENT_COUNT;
    if (i) json += ',';
    json += "{\"ms\":" + String(diagnosticEvents_[index].ms) + ",\"text\":\"";
    String text = diagnosticEvents_[index].text;
    text.replace("\\", "\\\\"); text.replace("\"", "\\\"");
    json += text + "\"}";
  }
  json += "]}";
  return json;
}

String WebApp::selfTestJson() const {
  const uint32_t heap = ESP.getFreeHeap();
  const uint32_t queuePct = Can.queueUtilizationPercent();
  String json = "{";
  json += "\"can\":" + String(Can.running() ? "true" : "false") + ',';
  json += "\"websocket\":" + String(wsClientCount_ > 0 ? "true" : "false") + ',';
  json += "\"heap\":" + String(heap > 30000U ? "true" : "false") + ',';
  json += "\"queue\":" + String(queuePct < 90U ? "true" : "false") + ',';
  json += "\"queuePercent\":" + String(queuePct) + ',';
  json += "\"freeHeap\":" + String(heap) + ',';
  json += "\"drops\":" + String(Can.queueDrops() + Can.twaiRxMissed() + Can.twaiRxOverrun());
  json += '}';
  return json;
}

void WebApp::resetDiagnosticPeaks() {
  minFreeHeap_ = ESP.getFreeHeap();
  minLargestHeapBlock_ = heap_caps_get_largest_free_block(MALLOC_CAP_8BIT);
  maxWsBatchBytes_ = 0;
  maxWsBroadcastUs_ = 0;
  maxRxDrainUs_ = 0;
  maxRxDrainFrames_ = 0;
  rxBacklogEvents_ = 0;
  lastRxBacklogEventMs_ = millis();
}

size_t WebApp::statusJson(char* buffer, size_t capacity) const {
  if (!buffer || capacity == 0U) return 0U;
  size_t used = 0U;
  buffer[0] = '\0';
  const IPAddress ip = WiFi.softAPIP();
  char filterIds[320]{};
  size_t filterUsed = 0U;
  for (uint8_t i = 0; i < filterIdCount_; ++i) {
    if (i > 0U && filterUsed + 1U < sizeof(filterIds)) filterIds[filterUsed++] = ' ';
    const int written = snprintf(filterIds + filterUsed, sizeof(filterIds) - filterUsed, "%lX",
                                 static_cast<unsigned long>(filterIds_[i]));
    if (written <= 0 || static_cast<size_t>(written) >= sizeof(filterIds) - filterUsed) break;
    filterUsed += static_cast<size_t>(written);
  }
  filterIds[filterUsed] = '\0';

  const uint32_t nowMs = millis();
  appendFormat(buffer, capacity, used,
    "{\"fw\":\"%s\",\"ip\":\"%u.%u.%u.%u\",\"ssid\":\"%s\","
    "\"stations\":%u,\"uptime\":%lu,\"freeHeap\":%lu,\"largestHeapBlock\":%lu,"
    "\"minFreeHeap\":%lu,\"minLargestHeapBlock\":%lu,\"wsBatchCount\":%lu,"
    "\"maxWsBatchBytes\":%lu,\"maxWsBroadcastUs\":%lu,\"canRunning\":%s,"
    "\"listenOnly\":%s,\"noAck\":%s,\"ackMissing\":%s,\"bitrate\":%lu,\"rx\":%lu,\"tx\":%lu,\"rxRate\":%lu,"
    "\"ringWriteCount\":%lu,\"ringWriteRate\":%lu,\"ringReadCount\":%lu,"
    "\"ringReadRate\":%lu,\"wsFrameCount\":%lu,\"wsFrameRate\":%lu,"
    "\"filteredFrameCount\":%lu,\"filteredFrameRate\":%lu,\"txRate\":%lu,"
    "\"busLoad\":%.1f,\"errors\":%lu,\"busOff\":%lu,\"busErrors\":%lu,"
    "\"rxQueueFullAlerts\":%lu,\"errorPassive\":%lu,\"txFailed\":%lu,"
    "\"arbLostAlerts\":%lu,\"aboveWarningAlerts\":%lu,\"belowWarningAlerts\":%lu,"
    "\"busRecoveredAlerts\":%lu,\"lastAlertMask\":%lu,\"lastAlertMaskHex\":\"%s\","
    "\"alertReadCount\":%lu,\"lastAlert\":\"%s\",\"twaiState\":\"%s\","
    "\"txErrorCounter\":%lu,\"rxErrorCounter\":%lu,\"driverBusErrors\":%lu,"
    "\"driverBusErrorDelta\":%lu,\"driverArbitrationLost\":%lu,\"driverTxFailed\":%lu,"
    "\"driverRxQueued\":%lu,\"driverTxQueued\":%lu,\"rxPinLevel\":%d,"
    "\"rxPinLowPercent\":%lu,\"queue\":%u,\"drops\":%lu,\"queueHighWater\":%u,"
    "\"queueCapacity\":%u,\"queueUtilization\":%lu,\"maxRxDrainUs\":%lu,"
    "\"maxRxDrainFrames\":%u,\"rxBacklogEvents\":%lu,\"twaiRxMissed\":%lu,"
    "\"twaiRxOverrun\":%lu,\"maxRxBurst\":%lu,\"simulator\":%s,\"simCount\":%u,"
    "\"simProfile\":\"%s\",\"logging\":%s,\"logFrames\":%lu,\"logSize\":%lu,"
    "\"lastCanFrameAgoMs\":%lu,\"lastWsPacketAgoMs\":%lu,\"wsClients\":%u,"
    "\"diagnosticEventCount\":%u,\"filterEnabled\":%s,\"filterMode\":\"%s\",\"filterIds\":\"%s\"}",
    Config::FW_VERSION, ip[0], ip[1], ip[2], ip[3], Config::AP_SSID,
    static_cast<unsigned>(WiFi.softAPgetStationNum()),
    static_cast<unsigned long>(nowMs / 1000UL),
    static_cast<unsigned long>(ESP.getFreeHeap()),
    static_cast<unsigned long>(heap_caps_get_largest_free_block(MALLOC_CAP_8BIT)),
    static_cast<unsigned long>(minFreeHeap_), static_cast<unsigned long>(minLargestHeapBlock_),
    static_cast<unsigned long>(wsBatchCount_), static_cast<unsigned long>(maxWsBatchBytes_),
    static_cast<unsigned long>(maxWsBroadcastUs_), Can.running() ? "true" : "false",
    Can.listenOnly() ? "true" : "false", Can.noAck() ? "true" : "false",
    Can.ackMissing() ? "true" : "false",
    static_cast<unsigned long>(Can.bitrate()),
    static_cast<unsigned long>(Can.rxCount()), static_cast<unsigned long>(Can.txCount()),
    static_cast<unsigned long>(Can.rxRate()), static_cast<unsigned long>(Can.ringWriteCount()),
    static_cast<unsigned long>(Can.ringWriteRate()), static_cast<unsigned long>(Can.ringReadCount()),
    static_cast<unsigned long>(Can.ringReadRate()), static_cast<unsigned long>(wsFrameCount_),
    static_cast<unsigned long>(wsFrameRate_), static_cast<unsigned long>(filteredFrameCount_),
    static_cast<unsigned long>(filteredFrameRate_), static_cast<unsigned long>(Can.txRate()),
    static_cast<double>(Can.busLoadPercent()), static_cast<unsigned long>(Can.errorCount()),
    static_cast<unsigned long>(Can.busOffCount()), static_cast<unsigned long>(Can.busErrorCount()),
    static_cast<unsigned long>(Can.rxQueueFullAlerts()), static_cast<unsigned long>(Can.errorPassiveCount()),
    static_cast<unsigned long>(Can.txFailedCount()), static_cast<unsigned long>(Can.arbitrationLostAlerts()),
    static_cast<unsigned long>(Can.aboveWarningAlerts()), static_cast<unsigned long>(Can.belowWarningAlerts()),
    static_cast<unsigned long>(Can.busRecoveredAlerts()), static_cast<unsigned long>(Can.lastAlertMask()),
    Can.lastAlertMaskHex(), static_cast<unsigned long>(Can.alertReadCount()), Can.lastAlertText(),
    Can.driverStateText(), static_cast<unsigned long>(Can.txErrorCounter()),
    static_cast<unsigned long>(Can.rxErrorCounter()), static_cast<unsigned long>(Can.driverBusErrors()),
    static_cast<unsigned long>(Can.driverBusErrorDelta()), static_cast<unsigned long>(Can.driverArbitrationLost()),
    static_cast<unsigned long>(Can.driverTxFailed()), static_cast<unsigned long>(Can.driverRxQueued()),
    static_cast<unsigned long>(Can.driverTxQueued()), Can.rxPinLevel(),
    static_cast<unsigned long>(Can.rxPinLowPercent()), static_cast<unsigned>(Can.queueSize()),
    static_cast<unsigned long>(Can.queueDrops()), static_cast<unsigned>(Can.queueHighWater()),
    static_cast<unsigned>(Can.queueCapacity()), static_cast<unsigned long>(Can.queueUtilizationPercent()),
    static_cast<unsigned long>(maxRxDrainUs_), static_cast<unsigned>(maxRxDrainFrames_),
    static_cast<unsigned long>(rxBacklogEvents_), static_cast<unsigned long>(Can.twaiRxMissed()),
    static_cast<unsigned long>(Can.twaiRxOverrun()), static_cast<unsigned long>(Can.maxRxBurst()),
    Simulator.enabled() ? "true" : "false", static_cast<unsigned>(Simulator.count()),
    Simulator.profileName(), Logger.active() ? "true" : "false",
    static_cast<unsigned long>(Logger.writtenFrames()), static_cast<unsigned long>(Logger.fileSize()),
    static_cast<unsigned long>(lastCanFrameMs_ ? nowMs - lastCanFrameMs_ : 0U),
    static_cast<unsigned long>(lastWsPacketMs_ ? nowMs - lastWsPacketMs_ : 0U),
    static_cast<unsigned>(wsClientCount_), static_cast<unsigned>(diagnosticEventUsed_),
    filterEnabled_ ? "true" : "false", filterInverted_ ? "exclude" : "include", filterIds);
  return used;
}

String WebApp::statusJsonString() const {
  char json[4096];
  const size_t length = statusJson(json, sizeof(json));
  return String(json, length);
}

void WebApp::broadcastFrame(const CanFrame& frame, const char* direction) {
  if (!frameAllowed(frame)) return;
  char data[17]{};
  bytesToHex(frame.data, frame.dlc, data, sizeof(data));
  char json[256];
  snprintf(json, sizeof(json),
           "{\"type\":\"frame\",\"dir\":\"%s\",\"us\":%lu,\"id\":\"%lX\",\"dlc\":%u,\"data\":\"%s\",\"ext\":%s,\"rtr\":%s,\"sim\":%s}",
           direction, static_cast<unsigned long>(frame.timestampUs),
           static_cast<unsigned long>(frame.id), frame.dlc, data,
           frame.extended ? "true" : "false", frame.rtr ? "true" : "false",
           frame.simulated ? "true" : "false");
  ws_.broadcastTXT(json);
  lastWsPacketMs_ = millis();
}

void WebApp::broadcastFrames(const CanFrame* frames, size_t count, const char* direction) {
  if (count == 0U) return;

  // Fixed buffer avoids repeated heap allocations and String growth during
  // high-rate CAN traffic. 64 frames fit with a comfortable reserve.
  static char json[16384];
  size_t used = 0U;
  const int prefix = snprintf(json, sizeof(json), "{\"type\":\"frames\",\"items\":[");
  if (prefix <= 0) return;
  used = static_cast<size_t>(prefix);

  bool first = true;
  uint32_t included = 0;
  uint32_t filtered = 0;
  for (size_t n = 0; n < count; ++n) {
    const CanFrame& frame = frames[n];
    if (!frameAllowed(frame)) { ++filtered; continue; }

    char data[17]{};
    bytesToHex(frame.data, frame.dlc, data, sizeof(data));

    // Write the item directly into the remaining batch buffer. This avoids
    // one temporary item buffer and one memcpy for every CAN frame.
    const size_t remaining = sizeof(json) - used;
    const int itemLength = snprintf(json + used, remaining,
             "%s{\"dir\":\"%s\",\"us\":%lu,\"id\":\"%lX\",\"dlc\":%u,\"data\":\"%s\",\"ext\":%s,\"rtr\":%s,\"sim\":%s}",
             first ? "" : ",", direction, static_cast<unsigned long>(frame.timestampUs),
             static_cast<unsigned long>(frame.id), frame.dlc, data,
             frame.extended ? "true" : "false", frame.rtr ? "true" : "false",
             frame.simulated ? "true" : "false");
    if (itemLength <= 0) continue;
    const size_t itemBytes = static_cast<size_t>(itemLength);
    if (itemBytes + 3U >= remaining) break;
    used += itemBytes;
    first = false;
    ++included;
  }

  filteredFrameCount_ += filtered;
  if (first) return;
  json[used++] = ']';
  json[used++] = '}';
  json[used] = '\0';

  const uint32_t startedUs = micros();
  ws_.broadcastTXT(reinterpret_cast<uint8_t*>(json), used);
  const uint32_t elapsedUs = micros() - startedUs;
  if (elapsedUs > maxWsBroadcastUs_) maxWsBroadcastUs_ = elapsedUs;
  if (used > maxWsBatchBytes_) maxWsBatchBytes_ = used;
  ++wsBatchCount_;
  wsFrameCount_ += included;
  lastWsPacketMs_ = millis();
}


void WebApp::noteRxDrain(size_t frames, uint32_t elapsedUs, size_t queueBefore, size_t queueAfter) {
  if (frames > 0) lastCanFrameMs_ = millis();
  if (elapsedUs > maxRxDrainUs_) maxRxDrainUs_ = elapsedUs;
  if (frames > maxRxDrainFrames_) maxRxDrainFrames_ = static_cast<uint16_t>(frames);

  // Count sustained backlog only once per second. This is a diagnostic signal,
  // not a lost-frame counter; actual losses remain queueDrops/TWAI missed/overrun.
  const size_t warningLevel = (Can.queueCapacity() * 3U) / 4U;
  if ((queueBefore >= warningLevel || queueAfter >= warningLevel) &&
      millis() - lastRxBacklogEventMs_ >= 1000U) {
    ++rxBacklogEvents_;
    lastRxBacklogEventMs_ = millis();
    if (!queueWarningActive_) {
      queueWarningActive_ = true;
      addDiagnosticEvent("Queue ueber 75 %");
    }
  } else if (queueWarningActive_ && queueAfter < (Can.queueCapacity() / 2U)) {
    queueWarningActive_ = false;
    addDiagnosticEvent("Queue wieder normal");
  }
}

void WebApp::broadcastStatus() {
  static char json[4608];
  static constexpr char PREFIX[] = "{\"type\":\"status\",\"value\":";
  const size_t prefixLength = sizeof(PREFIX) - 1U;
  memcpy(json, PREFIX, prefixLength);
  const size_t statusLength = statusJson(json + prefixLength, sizeof(json) - prefixLength - 2U);
  size_t used = prefixLength + statusLength;
  if (used + 2U > sizeof(json)) return;
  json[used++] = '}';
  json[used] = '\0';
  ws_.broadcastTXT(reinterpret_cast<uint8_t*>(json), used);
  lastWsPacketMs_ = millis();
}

void WebApp::poll() {
  server_.handleClient();
  ws_.loop();
  const uint32_t freeHeap = ESP.getFreeHeap();
  const uint32_t largestBlock = heap_caps_get_largest_free_block(MALLOC_CAP_8BIT);
  if (freeHeap < minFreeHeap_) minFreeHeap_ = freeHeap;
  if (largestBlock < minLargestHeapBlock_) minLargestHeapBlock_ = largestBlock;
  const uint32_t now = millis();
  const uint32_t pipelineElapsed = now - lastPipelineStatsMs_;
  if (pipelineElapsed >= 1000U) {
    wsFrameRate_ = ((wsFrameCount_ - lastWsFrameCount_) * 1000U) / pipelineElapsed;
    filteredFrameRate_ = ((filteredFrameCount_ - lastFilteredFrameCount_) * 1000U) / pipelineElapsed;
    lastWsFrameCount_ = wsFrameCount_;
    lastFilteredFrameCount_ = filteredFrameCount_;
    lastPipelineStatsMs_ = now;
  }
  if (millis() - lastStatusMs_ >= Config::STATUS_INTERVAL_MS) {
    lastStatusMs_ = millis();
    broadcastStatus();
  }
}
