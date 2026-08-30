#include "logger.h"
#include "config.h"
#include <LittleFS.h>

CanLogger Logger;

bool CanLogger::begin() {
  mounted_ = LittleFS.begin(true);
  if (!mounted_) {
    Serial.println("[FS] LittleFS konnte nicht gemountet werden");
  }
  return mounted_;
}

bool CanLogger::start(bool truncateFile) {
  if (!mounted_) return false;
  stop();
  file_ = LittleFS.open(Config::LOG_PATH, truncateFile ? "w" : "a");
  if (!file_) return false;
  if (truncateFile || file_.size() == 0U) {
    file_.println("timestamp_us,direction,id,extended,rtr,dlc,data,simulated");
  }
  active_ = true;
  pendingFlush_ = 0;
  writtenFrames_ = 0;
  return true;
}

void CanLogger::stop() {
  if (file_) {
    file_.flush();
    file_.close();
  }
  active_ = false;
  pendingFlush_ = 0;
}

void CanLogger::log(const CanFrame& frame, const char* direction) {
  if (!active_ || !file_) return;
  file_.printf("%lu,%s,%lX,%u,%u,%u,", static_cast<unsigned long>(frame.timestampUs), direction,
               static_cast<unsigned long>(frame.id), frame.extended ? 1U : 0U,
               frame.rtr ? 1U : 0U, frame.dlc);
  for (uint8_t i = 0; i < frame.dlc; ++i) file_.printf("%02X", frame.data[i]);
  file_.printf(",%u\n", frame.simulated ? 1U : 0U);
  ++writtenFrames_;
  if (++pendingFlush_ >= Config::LOG_FLUSH_EVERY) {
    file_.flush();
    pendingFlush_ = 0;
  }
}

size_t CanLogger::fileSize() const {
  if (!mounted_) return 0;

  // FILE_APPEND creates the file silently when it does not exist.
  // LittleFS.exists() internally attempts a read-open and logs an error
  // for a missing file on the ESP32 Arduino core.
  File file = LittleFS.open(Config::LOG_PATH, FILE_APPEND);
  if (!file) return 0;

  const size_t size = file.size();
  file.close();
  return size;
}
