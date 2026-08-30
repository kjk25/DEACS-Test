#pragma once
#include <Arduino.h>

class RxLed {
 public:
  void begin();
  void pulse();
  void poll();
 private:
  uint32_t offAt_ = 0;
};
extern RxLed Led;
