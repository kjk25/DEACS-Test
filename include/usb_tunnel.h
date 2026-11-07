#pragma once
#include <Arduino.h>

// Binary serial transport to the existing local HTTP/WebSocket listeners.
// Its worker owns every tunnel socket; CAN/UI tasks never write serial data.
class UsbTunnel {
 public:
  void begin();
  bool active() const { return __atomic_load_n(&active_, __ATOMIC_ACQUIRE); }
  bool started() const { return started_; }
 private:
  static void taskEntry(void* context);
  void run();
  volatile bool active_ = false;
  bool started_ = false;
};
extern UsbTunnel Usb;
