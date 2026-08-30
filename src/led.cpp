#include "led.h"
#include "config.h"

RxLed Led;

static void setLed(bool on) {
  digitalWrite(Config::RX_LED_PIN, (on == Config::RX_LED_ACTIVE_HIGH) ? HIGH : LOW);
}

void RxLed::begin() {
  pinMode(Config::RX_LED_PIN, OUTPUT);
  setLed(false);
}

void RxLed::pulse() {
  setLed(true);
  offAt_ = millis() + Config::RX_LED_PULSE_MS;
}

void RxLed::poll() {
  if (offAt_ != 0U && static_cast<int32_t>(millis() - offAt_) >= 0) {
    setLed(false);
    offAt_ = 0;
  }
}
