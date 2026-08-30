#pragma once
#include <Arduino.h>
#include "can_frame.h"
#include "ring_buffer.h"
#include "config.h"

class CanManager {
 public:
  bool begin();
  void poll();
  bool receive(CanFrame& frame);
  bool send(const CanFrame& frame);
  bool restart(uint32_t bitrate, bool listenOnly, bool noAck = false);
  bool disconnect();
  bool reconnect();
  bool setAcceptanceFilter(const uint32_t* ids, uint8_t count);
  void inject(const CanFrame& frame);
  void updateStatistics();

  uint32_t rxCount() const { return rxCount_; }
  uint32_t txCount() const { return txCount_; }
  uint32_t errorCount() const { return errorCount_; }
  uint32_t busOffCount() const { return busOffCount_; }
  uint32_t busErrorCount() const { return busErrorCount_; }
  uint32_t rxQueueFullAlerts() const { return rxQueueFullAlerts_; }
  uint32_t errorPassiveCount() const { return errorPassiveCount_; }
  uint32_t txFailedCount() const { return txFailedCount_; }
  uint32_t arbitrationLostAlerts() const { return arbitrationLostAlerts_; }
  uint32_t aboveWarningAlerts() const { return aboveWarningAlerts_; }
  uint32_t belowWarningAlerts() const { return belowWarningAlerts_; }
  uint32_t busRecoveredAlerts() const { return busRecoveredAlerts_; }
  uint32_t lastAlertMask() const { return lastAlertMask_; }
  const char* lastAlertMaskHex() const { return lastAlertMaskHex_; }
  uint32_t alertReadCount() const { return alertReadCount_; }
  uint32_t driverBusErrorDelta() const { return driverBusErrorDelta_; }
  const char* lastAlertText() const { return lastAlertText_; }
  const char* driverStateText() const { return driverStateText_; }
  uint32_t txErrorCounter() const { return txErrorCounter_; }
  uint32_t rxErrorCounter() const { return rxErrorCounter_; }
  uint32_t driverBusErrors() const { return driverBusErrors_; }
  uint32_t driverArbitrationLost() const { return driverArbitrationLost_; }
  uint32_t driverTxFailed() const { return driverTxFailed_; }
  uint32_t driverRxQueued() const { return driverRxQueued_; }
  uint32_t driverTxQueued() const { return driverTxQueued_; }
  uint8_t rxPinLevel() const { return rxPinLevel_; }
  uint8_t rxPinLowPercent() const { return rxPinLowPercent_; }
  uint32_t rxRate() const { return rxRate_; }
  uint32_t ringWriteCount() const { return ringWriteCount_; }
  uint32_t ringWriteRate() const { return ringWriteRate_; }
  uint32_t ringReadCount() const { return ringReadCount_; }
  uint32_t ringReadRate() const { return ringReadRate_; }
  uint32_t txRate() const { return txRate_; }
  float busLoadPercent() const { return busLoadPercent_; }
  uint32_t queueDrops() const { return queue_.drops(); }
  size_t queueSize() const { return queue_.size(); }
  size_t queueHighWater() const { return queue_.highWater(); }
  size_t queueCapacity() const { return queue_.capacity(); }
  uint8_t queueUtilizationPercent() const {
    const size_t capacity = queue_.capacity();
    return capacity == 0U ? 0U : static_cast<uint8_t>((queue_.size() * 100U) / capacity);
  }
  uint32_t twaiRxMissed() const { return twaiRxMissed_; }
  uint32_t twaiRxOverrun() const { return twaiRxOverrun_; }
  uint16_t maxRxBurst() const { return maxRxBurst_; }
  bool running() const { return running_; }
  bool listenOnly() const { return listenOnly_; }
  bool ackMissing() const { return ackMissing_; }
  bool noAck() const { return noAck_; }
  uint32_t bitrate() const { return bitrate_; }

 private:
  bool installDriver();
  bool startRxTask();
  static void rxTaskEntry(void* context);
  void rxTask();
  void handleAlerts();
  void updateDriverStatus();
  void updateLastAlertText(uint32_t alerts);

  RingBuffer<CanFrame, Config::CAN_QUEUE_SIZE> queue_;
  TaskHandle_t rxTaskHandle_ = nullptr;
  volatile uint32_t rxCount_ = 0;
  volatile uint32_t ringWriteCount_ = 0;
  volatile uint32_t ringReadCount_ = 0;
  volatile uint32_t txCount_ = 0;
  volatile uint32_t errorCount_ = 0;
  volatile uint32_t busOffCount_ = 0;
  volatile bool ackMissing_ = false;
  volatile uint32_t busErrorCount_ = 0;
  volatile uint32_t rxQueueFullAlerts_ = 0;
  volatile uint32_t errorPassiveCount_ = 0;
  volatile uint32_t txFailedCount_ = 0;
  volatile uint32_t arbitrationLostAlerts_ = 0;
  volatile uint32_t aboveWarningAlerts_ = 0;
  volatile uint32_t belowWarningAlerts_ = 0;
  volatile uint32_t busRecoveredAlerts_ = 0;
  volatile uint32_t lastAlertMask_ = 0;
  volatile uint32_t alertReadCount_ = 0;
  char lastAlertMaskHex_[16] = "0x00000000";
  char lastAlertText_[128] = "NONE";
  char driverStateText_[24] = "UNKNOWN";
  volatile uint32_t txErrorCounter_ = 0;
  volatile uint32_t rxErrorCounter_ = 0;
  volatile uint32_t driverBusErrors_ = 0;
  volatile uint32_t driverBusErrorDelta_ = 0;
  uint32_t lastDriverBusErrors_ = 0;
  volatile uint32_t driverArbitrationLost_ = 0;
  volatile uint32_t driverTxFailed_ = 0;
  volatile uint32_t driverRxQueued_ = 0;
  volatile uint32_t driverTxQueued_ = 0;
  volatile uint8_t rxPinLevel_ = 1;
  volatile uint8_t rxPinLowPercent_ = 0;
  uint32_t rxPinSamples_ = 0;
  uint32_t rxPinLowSamples_ = 0;
  volatile uint32_t twaiRxMissed_ = 0;
  volatile uint32_t twaiRxOverrun_ = 0;
  volatile uint16_t maxRxBurst_ = 0;
  uint32_t bitrate_ = Config::CAN_BITRATE;
  uint32_t lastStatsMs_ = 0;
  uint32_t lastRxCount_ = 0;
  uint32_t lastRingWriteCount_ = 0;
  uint32_t lastRingReadCount_ = 0;
  uint32_t lastTxCount_ = 0;
  uint32_t rxRate_ = 0;
  uint32_t ringWriteRate_ = 0;
  uint32_t ringReadRate_ = 0;
  uint32_t txRate_ = 0;
  float busLoadPercent_ = 0.0f;
  volatile bool listenOnly_ = true;
  volatile bool noAck_ = false;
  volatile bool running_ = false;
  volatile bool driverChanging_ = false;
  bool acceptanceFilterEnabled_ = false;
  uint32_t acceptanceCode_ = 0;
  uint32_t acceptanceMask_ = 0xFFFFFFFFUL;
};
extern CanManager Can;
