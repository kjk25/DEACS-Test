#pragma once
#include <Arduino.h>
#include <FS.h>
#include "can_frame.h"

class CanLogger {
 public:
  bool begin();
  bool start(bool truncateFile);
  void stop();
  void log(const CanFrame& frame, const char* direction);
  bool active() const { return active_; }
  bool mounted() const { return mounted_; }
  bool memoryLimited() const { return memoryLimited_; }
  size_t fileSize() const;
  uint32_t writtenFrames() const { return writtenFrames_; }
 private:
  File file_;
  bool active_ = false;
  bool mounted_ = false;
  bool memoryLimited_ = false;
  size_t pendingFlush_ = 0;
  uint32_t writtenFrames_ = 0;
};
extern CanLogger Logger;
