#pragma once
#include <Arduino.h>
#include "can_frame.h"
#include "memory_budget.h"

class CanSimulator {
 public:
  struct Entry {
    bool used = false;
    bool pending = false;
    bool enabled = false;
    bool extended = false;
    bool dynamic = false;
    uint8_t dynamicIndex = 0;
    uint8_t mode = 0;
    uint8_t baseData[8]{};
    uint32_t frameIndex = 0;
    uint16_t lfsr = 0xACE1;
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
           uint32_t intervalMs, bool enabled, bool dynamic, uint8_t dynamicIndex,
           uint8_t mode = 0);
  void start(bool loop = true);
  void stop();
  void setLiveTx(bool enabled) { liveTx_ = enabled; }
  bool liveTx() const { return liveTx_; }
  bool enabled() const { return running_; }
  bool looping() const { return loop_; }
  size_t remaining() const { return remaining_; }
  uint32_t runId() const { return runId_; }
  size_t count() const { return entries_.size(); }
  bool memoryLimited() const { return memoryLimited_; }
  const char* profileName() const { return "custom"; }

 private:
  BudgetList<Entry> entries_;
  bool running_ = false;
  bool loop_ = true;
  size_t remaining_ = 0;
  uint32_t runId_ = 0;
  bool liveTx_ = false;
  bool memoryLimited_ = false;
  size_t pollIndex_ = 0;
};

extern CanSimulator Simulator;
