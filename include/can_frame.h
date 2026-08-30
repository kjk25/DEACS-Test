#pragma once
#include <Arduino.h>

struct CanFrame {
  uint32_t timestampUs = 0;
  uint32_t id = 0;
  uint8_t dlc = 0;
  uint8_t data[8]{};
  bool extended = false;
  bool rtr = false;
  bool simulated = false;
};
