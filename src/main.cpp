#include <Arduino.h>
#include "config.h"
#include "can_manager.h"
#include "simulator.h"
#include "web_app.h"
#include "logger.h"
#include "led.h"
#include "usb_tunnel.h"

void setup() {
  // First instruction: keep CAN transceiver TXD recessive during boot.
  // This happens before Serial, Wi-Fi, LittleFS and TWAI initialization.
  pinMode(Config::CAN_TX_PIN, OUTPUT);
  digitalWrite(Config::CAN_TX_PIN, HIGH);

  // The dummy listen-only TX pin must remain physically unconnected.
  pinMode(Config::CAN_LISTEN_TX_DUMMY_PIN, OUTPUT);
  digitalWrite(Config::CAN_LISTEN_TX_DUMMY_PIN, HIGH);

  Serial.setRxBufferSize(4096);
  Serial.setTxBufferSize(2048);
  Serial.begin(Config::SERIAL_BAUD);
  delay(100);
  Led.begin();
  const bool fsOk = Logger.begin();
  const bool canOk = Can.begin();
  Simulator.begin();
  Web.begin();
  Serial.printf("\n%s %s\n", Config::FW_NAME, Config::FW_VERSION);
  Serial.printf("LittleFS: %s\n", fsOk ? "OK" : "FEHLER");
  Serial.printf("CAN: %s, TX=%d RX=%d, %lu bit/s, %s\n",
                canOk ? "OK" : "FEHLER", Config::CAN_TX_PIN, Config::CAN_RX_PIN,
                static_cast<unsigned long>(Can.bitrate()),
                Can.listenOnly() ? "listen-only (TX physically isolated)" : "normal");
  Serial.printf("CAN listen dummy TX: GPIO%d (must be unconnected)\n",
                Config::CAN_LISTEN_TX_DUMMY_PIN);
  Serial.printf("CAN RX task: core=%d priority=%u, TWAI queue=%lu, ring=%lu\n",
                Config::CAN_RX_TASK_CORE, static_cast<unsigned>(Config::CAN_RX_TASK_PRIORITY),
                static_cast<unsigned long>(Config::TWAI_RX_QUEUE_SIZE),
                static_cast<unsigned long>(Config::CAN_QUEUE_SIZE));
  Serial.printf("WLAN: %s / %s, http://192.168.4.1\n", Config::AP_SSID, Config::AP_PASSWORD);
  Usb.begin();
}

void loop() {
  // Drain the dedicated CAN RX ring before servicing HTTP/WebSocket work.
  // The high-priority TWAI task remains the producer; this loop is the only
  // consumer. A fixed batch keeps latency bounded while still yielding to Wi-Fi.
  static CanFrame batch[Config::WS_BATCH_MAX_FRAMES];
  static size_t count = 0;
  static uint32_t batchStartedMs = 0;

  const size_t queueBefore = Can.queueSize();
  const uint32_t drainStartedUs = micros();
  size_t drained = 0U;
  while (count < Config::WS_BATCH_MAX_FRAMES && Can.receive(batch[count])) {
    if (count == 0U) batchStartedMs = millis();
    Logger.log(batch[count], "RX");
    ++count;
    ++drained;
  }
  const uint32_t drainElapsedUs = micros() - drainStartedUs;
  Web.noteRxDrain(drained, drainElapsedUs, queueBefore, Can.queueSize());

  const bool batchFull = count >= Config::WS_BATCH_MAX_FRAMES;
  const bool batchDue = count > 0U && (millis() - batchStartedMs >= Config::WS_BATCH_INTERVAL_MS);
  if (batchFull || batchDue) {
    Web.broadcastFrames(batch, count, "RX");
    count = 0;
  }

  Can.poll();
  Simulator.poll();

  // LED follows the real successful-TX counter in this task.
  static uint32_t lastLedTxCount = Can.txCount();
  const uint32_t currentTxCount = Can.txCount();
  if (currentTxCount != lastLedTxCount) {
    lastLedTxCount = currentTxCount;
    Led.pulse();
  }
  Led.poll();
  Web.poll();

  // Give Wi-Fi/TCP and WebSocket processing regular CPU time.
  delay(1);
}
