#pragma once
#include <Arduino.h>
#include "can_frame.h"

class CanSimulator {
 public:
  static constexpr uint8_t MAX_FRAMES = 16;

  struct Entry {
    bool used = false;
    bool enabled = false;
    bool extended = false;
    bool dynamic = false;
    uint8_t dynamicIndex = 0;
    uint32_t id = 0;
    uint32_t intervalMs = 100;
    uint32_t nextDueMs = 0;
    uint8_t dlc = 0;
    uint8_t data[8]{};
  };

  void begin();
  void poll();
  void clear();
  bool add(uint32_t id, bool extended, const uint8_t* data, uint8_t dlc,
           uint32_t intervalMs, bool enabled, bool dynamic, uint8_t dynamicIndex);
  void start();
  void stop();
  void setLiveTx(bool enabled) { liveTx_ = enabled; }
  bool enabled() const { return running_; }
  uint8_t count() const { return count_; }
  const char* profileName() const { return "custom"; }

 private:
  Entry entries_[MAX_FRAMES]{};
  bool running_ = false;
  bool liveTx_ = false;
  uint8_t count_ = 0;
};

extern CanSimulator Simulator;
