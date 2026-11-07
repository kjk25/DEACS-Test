#include "can_manager.h"
#include "led.h"
#include <driver/twai.h>
#include <Preferences.h>

CanManager Can;
static Preferences canPreferences;

static twai_timing_config_t timingFor(uint32_t bitrate) {
  switch (bitrate) {
    case 1000000: return TWAI_TIMING_CONFIG_1MBITS();
    case 500000: return TWAI_TIMING_CONFIG_500KBITS();
    case 250000: return TWAI_TIMING_CONFIG_250KBITS();
    case 125000: return TWAI_TIMING_CONFIG_125KBITS();
    case 100000: return TWAI_TIMING_CONFIG_100KBITS();
    case 50000: return TWAI_TIMING_CONFIG_50KBITS();
    case 25000: return TWAI_TIMING_CONFIG_25KBITS();
    default: return TWAI_TIMING_CONFIG_500KBITS();
  }
}

bool CanManager::setAcceptanceFilter(const uint32_t* ids, uint8_t count) {
  bool enable = count > 0;
  uint32_t commonBits = 0x7FFU;
  const uint32_t commonValue = enable ? (ids[0] & 0x7FFU) : 0U;
  for (uint8_t i = 0; i < count; ++i) {
    if (ids[i] > 0x7FFU) { enable = false; break; }
    commonBits &= ~(commonValue ^ ids[i]);
  }

  const bool wasRunning = running_;
  if (wasRunning && !disconnect()) return false;
  acceptanceFilterEnabled_ = enable;
  acceptanceCode_ = enable ? ((commonValue & commonBits) << 21U) : 0U;
  acceptanceMask_ = enable ? ~(commonBits << 21U) : 0xFFFFFFFFUL;
  return !wasRunning || reconnect();
}

bool CanManager::installDriver() {
  // In listen-only mode, never connect the TWAI TX signal to the physical
  // transceiver TXD. GPIO17 is held HIGH and TWAI is routed to an unused pin.
  const gpio_num_t twaiTxPin = listenOnly_
      ? Config::CAN_LISTEN_TX_DUMMY_PIN
      : Config::CAN_TX_PIN;
  if (listenOnly_) {
    pinMode(Config::CAN_TX_PIN, OUTPUT);
    digitalWrite(Config::CAN_TX_PIN, HIGH);
  }

  twai_general_config_t general = TWAI_GENERAL_CONFIG_DEFAULT(
      twaiTxPin, Config::CAN_RX_PIN,
      listenOnly_ ? TWAI_MODE_LISTEN_ONLY : (noAck_ ? TWAI_MODE_NO_ACK : TWAI_MODE_NORMAL));
  general.rx_queue_len = Config::TWAI_RX_QUEUE_SIZE;
  general.tx_queue_len = listenOnly_ ? 1 : 32;
  general.alerts_enabled = TWAI_ALERT_BUS_OFF | TWAI_ALERT_BUS_RECOVERED |
                           TWAI_ALERT_RX_QUEUE_FULL | TWAI_ALERT_TX_FAILED |
                           TWAI_ALERT_ERR_PASS | TWAI_ALERT_BUS_ERROR |
                           TWAI_ALERT_ARB_LOST | TWAI_ALERT_ABOVE_ERR_WARN |
                           TWAI_ALERT_BELOW_ERR_WARN;

  const twai_timing_config_t timing = timingFor(bitrate_);
  twai_filter_config_t filter = TWAI_FILTER_CONFIG_ACCEPT_ALL();
  if (acceptanceFilterEnabled_) {
    filter.acceptance_code = acceptanceCode_;
    filter.acceptance_mask = acceptanceMask_;
    filter.single_filter = true;
  }
  if (twai_driver_install(&general, &timing, &filter) != ESP_OK) return false;
  missedBaseline_ = overrunBaseline_ = busErrorBaseline_ = 0;
  arbitrationBaseline_ = txFailedBaseline_ = lastDriverBusErrors_ = 0;
  if (twai_start() != ESP_OK) {
    twai_driver_uninstall();
    return false;
  }
  running_ = true;
  return true;
}

bool CanManager::startRxTask() {
  if (rxTaskHandle_ != nullptr) return true;
  return xTaskCreatePinnedToCore(rxTaskEntry, "can-rx", Config::CAN_RX_TASK_STACK,
                                 this, Config::CAN_RX_TASK_PRIORITY,
                                 &rxTaskHandle_, Config::CAN_RX_TASK_CORE) == pdPASS;
}

bool CanManager::begin() {
  canPreferences.begin("deacs-can", false);
  const uint32_t savedBitrate = canPreferences.getUInt("bitrate", Config::CAN_BITRATE);
  switch (savedBitrate) {
    case 1000000: case 500000: case 250000: case 125000:
    case 100000: case 50000: case 25000: bitrate_ = savedBitrate; break;
    default: bitrate_ = Config::CAN_BITRATE; break;
  }
  listenOnly_ = canPreferences.getBool("listen", true);
  noAck_ = !listenOnly_ && canPreferences.getBool("noack", false);
  lastStatsMs_ = millis();
  const bool installed = installDriver();
  if (!startRxTask()) {
    running_ = false;
    if (installed) { twai_stop(); twai_driver_uninstall(); }
    return false;
  }
  return installed;
}

void CanManager::rxTaskEntry(void* context) {
  static_cast<CanManager*>(context)->rxTask();
}

void CanManager::rxTask() {
  for (;;) {
    if (!running_ || driverChanging_) {
      vTaskDelay(pdMS_TO_TICKS(2));
      continue;
    }

    twai_message_t message{};
    if (twai_receive(&message, pdMS_TO_TICKS(10)) != ESP_OK) continue;

    uint16_t burst = 0;
    do {
      CanFrame frame{};
      frame.timestampUs = micros();
      frame.id = message.identifier;
      frame.dlc = message.data_length_code > 8 ? 8 : message.data_length_code;
      frame.extended = message.extd;
      frame.rtr = message.rtr;
      for (uint8_t i = 0; i < frame.dlc; ++i) frame.data[i] = message.data[i];
      if (queue_.push(frame)) ++ringWriteCount_;
      ++rxCount_;
      ++burst;
    } while (burst < Config::CAN_RX_BURST_MAX &&
             running_ && !driverChanging_ &&
             twai_receive(&message, 0) == ESP_OK);

    if (burst > maxRxBurst_) maxRxBurst_ = burst;

    // A large drain budget empties short TWAI bursts before yielding. The hard
    // limit still guarantees scheduler fairness on a continuously full bus.
    // taskYIELD alone only yields to equal-priority tasks. Under continuous
    // RX the high-priority receiver must also let the lower-priority main
    // loop drain the ring and service HTTP/WebSocket and control commands.
    if (burst >= Config::CAN_RX_BURST_MAX) vTaskDelay(1);
    else taskYIELD();
  }
}

bool CanManager::restart(uint32_t bitrate, bool listenOnly, bool noAck) {
  const bool previousNoAck = noAck_;
  const uint32_t previousBitrate = bitrate_;
  const bool previousListenOnly = listenOnly_;
  driverChanging_ = true;
  ackMissing_ = false;
  running_ = false;
  vTaskDelay(pdMS_TO_TICKS(15));
  twai_stop();
  twai_driver_uninstall();

  // Keep the real transceiver TXD recessive while the driver is detached or
  // reconfigured. This also covers the transition into listen-only mode.
  pinMode(Config::CAN_TX_PIN, OUTPUT);
  digitalWrite(Config::CAN_TX_PIN, HIGH);

  bitrate_ = bitrate;
  listenOnly_ = listenOnly;
  noAck_ = !listenOnly && noAck;
  if (installDriver()) {
    canPreferences.putUInt("bitrate", bitrate_);
    canPreferences.putBool("listen", listenOnly_);
    canPreferences.putBool("noack", noAck_);
    driverChanging_ = false;
    return true;
  }

  bitrate_ = previousBitrate;
  listenOnly_ = previousListenOnly;
  noAck_ = previousNoAck;
  installDriver();
  driverChanging_ = false;
  return false;
}

bool CanManager::disconnect() {
  ackMissing_ = false;
  if (!running_) return true;
  driverChanging_ = true;
  running_ = false;
  vTaskDelay(pdMS_TO_TICKS(15));
  const esp_err_t stopResult = twai_stop();
  const esp_err_t uninstallResult = twai_driver_uninstall();
  pinMode(Config::CAN_TX_PIN, OUTPUT);
  digitalWrite(Config::CAN_TX_PIN, HIGH);
  driverChanging_ = false;
  return (stopResult == ESP_OK || stopResult == ESP_ERR_INVALID_STATE) &&
         (uninstallResult == ESP_OK || uninstallResult == ESP_ERR_INVALID_STATE);
}

bool CanManager::reconnect() {
  ackMissing_ = false;
  if (running_) return true;
  driverChanging_ = true;
  pinMode(Config::CAN_TX_PIN, OUTPUT);
  digitalWrite(Config::CAN_TX_PIN, HIGH);
  const bool ok = installDriver();
  driverChanging_ = false;
  return ok;
}

void CanManager::updateLastAlertText(uint32_t alerts) {
  lastAlertText_[0] = '\0';
  auto append = [this](const char* name) {
    if (lastAlertText_[0] != '\0') strlcat(lastAlertText_, "|", sizeof(lastAlertText_));
    strlcat(lastAlertText_, name, sizeof(lastAlertText_));
  };
  if (alerts & TWAI_ALERT_BUS_OFF) append("BUS_OFF");
  if (alerts & TWAI_ALERT_BUS_RECOVERED) append("BUS_RECOVERED");
  if (alerts & TWAI_ALERT_RX_QUEUE_FULL) append("RX_QUEUE_FULL");
  if (alerts & TWAI_ALERT_TX_FAILED) append("TX_FAILED");
  if (alerts & TWAI_ALERT_ERR_PASS) append("ERR_PASS");
  if (alerts & TWAI_ALERT_BUS_ERROR) append("BUS_ERROR");
  if (alerts & TWAI_ALERT_ARB_LOST) append("ARB_LOST");
  if (alerts & TWAI_ALERT_ABOVE_ERR_WARN) append("ABOVE_WARN");
  if (alerts & TWAI_ALERT_BELOW_ERR_WARN) append("BELOW_WARN");
  if (lastAlertText_[0] == '\0') strlcpy(lastAlertText_, "OTHER", sizeof(lastAlertText_));
}

void CanManager::handleAlerts() {
  if (!running_ || driverChanging_) return;
  uint32_t alerts = 0;
  if (twai_read_alerts(&alerts, 0) != ESP_OK || alerts == 0U) return;
  lastAlertMask_ = alerts;
  ++alertReadCount_;
  snprintf(lastAlertMaskHex_, sizeof(lastAlertMaskHex_), "0x%08lX", static_cast<unsigned long>(alerts));
  updateLastAlertText(alerts);
  if (alerts & TWAI_ALERT_BUS_OFF) {
    ackMissing_ = true;
    ++busOffCount_;
    ++errorCount_;
    twai_initiate_recovery();
  }
  if (alerts & TWAI_ALERT_BUS_RECOVERED) ++busRecoveredAlerts_;
  if (alerts & TWAI_ALERT_RX_QUEUE_FULL) { ++rxQueueFullAlerts_; ++errorCount_; }
  if (alerts & TWAI_ALERT_TX_FAILED) { if (!noAck_) ackMissing_ = true; ++txFailedCount_; ++errorCount_; }
  if (alerts & TWAI_ALERT_ERR_PASS) { ++errorPassiveCount_; ++errorCount_; }
  if (alerts & TWAI_ALERT_BUS_ERROR) { ++busErrorCount_; ++errorCount_; }
  if (alerts & TWAI_ALERT_ARB_LOST) ++arbitrationLostAlerts_;
  if (alerts & TWAI_ALERT_ABOVE_ERR_WARN) ++aboveWarningAlerts_;
  if (alerts & TWAI_ALERT_BELOW_ERR_WARN) ++belowWarningAlerts_;
}

void CanManager::updateDriverStatus() {
  if (!running_ || driverChanging_) return;
  twai_status_info_t status{};
  if (twai_get_status_info(&status) == ESP_OK) {
    twaiRxMissed_ = status.rx_missed_count - missedBaseline_;
    twaiRxOverrun_ = status.rx_overrun_count - overrunBaseline_;
    txErrorCounter_ = status.tx_error_counter;
    // In normal mode a rising TX error counter means transmitted frames are
    // not acknowledged, even when no separate TX_FAILED alert is delivered.
    if (!listenOnly_ && !noAck_ && status.tx_error_counter > 0U) ackMissing_ = true;
    rxErrorCounter_ = status.rx_error_counter;
    const uint32_t nativeBusErrors = status.bus_error_count;
    driverBusErrorDelta_ = nativeBusErrors - lastDriverBusErrors_;
    lastDriverBusErrors_ = nativeBusErrors;
    driverBusErrors_ = nativeBusErrors - busErrorBaseline_;
    driverArbitrationLost_ = status.arb_lost_count - arbitrationBaseline_;
    driverTxFailed_ = status.tx_failed_count - txFailedBaseline_;
    driverRxQueued_ = status.msgs_to_rx;
    driverTxQueued_ = status.msgs_to_tx;
    switch (status.state) {
      case TWAI_STATE_STOPPED: strlcpy(driverStateText_, "STOPPED", sizeof(driverStateText_)); break;
      case TWAI_STATE_RUNNING: strlcpy(driverStateText_, "RUNNING", sizeof(driverStateText_)); break;
      case TWAI_STATE_BUS_OFF: strlcpy(driverStateText_, "BUS_OFF", sizeof(driverStateText_)); break;
      case TWAI_STATE_RECOVERING: strlcpy(driverStateText_, "RECOVERING", sizeof(driverStateText_)); break;
      default: strlcpy(driverStateText_, "UNKNOWN", sizeof(driverStateText_)); break;
    }
  }
}

void CanManager::poll() {
  // Sample the physical TWAI RX input. On a quiet CAN bus RXD must be HIGH
  // (recessive). A LOW level at idle means the controller sees a permanently
  // dominant bus, even if CAN-H/CAN-L look quiet on the oscilloscope.
  const int level = digitalRead(Config::CAN_RX_PIN);
  rxPinLevel_ = level == HIGH ? 1U : 0U;
  ++rxPinSamples_;
  if (level == LOW) ++rxPinLowSamples_;

  handleAlerts();
  updateStatistics();
}

void CanManager::resetDiagnostics() {
  // Rebase cumulative hardware counters without stopping CAN or discarding frames.
  twai_status_info_t status{};
  if (running_ && !driverChanging_ && twai_get_status_info(&status) == ESP_OK) {
    missedBaseline_ = status.rx_missed_count;
    overrunBaseline_ = status.rx_overrun_count;
    busErrorBaseline_ = lastDriverBusErrors_ = status.bus_error_count;
    arbitrationBaseline_ = status.arb_lost_count;
    txFailedBaseline_ = status.tx_failed_count;
  }
  errorCount_ = busOffCount_ = busErrorCount_ = rxQueueFullAlerts_ = 0;
  errorPassiveCount_ = txFailedCount_ = arbitrationLostAlerts_ = 0;
  aboveWarningAlerts_ = belowWarningAlerts_ = busRecoveredAlerts_ = 0;
  lastAlertMask_ = alertReadCount_ = 0;
  strlcpy(lastAlertMaskHex_, "0x00000000", sizeof(lastAlertMaskHex_));
  strlcpy(lastAlertText_, "NONE", sizeof(lastAlertText_));
  twaiRxMissed_ = twaiRxOverrun_ = driverBusErrors_ = driverBusErrorDelta_ = 0;
  driverArbitrationLost_ = driverTxFailed_ = maxRxBurst_ = 0;
  rxCount_ = txCount_ = ringWriteCount_ = ringReadCount_ = 0;
  lastRxCount_ = lastTxCount_ = lastRingWriteCount_ = lastRingReadCount_ = 0;
  rxRate_ = txRate_ = ringWriteRate_ = ringReadRate_ = 0;
  busLoadPercent_ = 0;
  lastStatsMs_ = millis();
  rxPinSamples_ = rxPinLowSamples_ = rxPinLowPercent_ = 0;
  queue_.resetStatistics();
}

void CanManager::updateStatistics() {
  const uint32_t now = millis();
  const uint32_t elapsed = now - lastStatsMs_;
  if (elapsed < 1000U) return;
  updateDriverStatus();
  if (rxPinSamples_ > 0U) {
    rxPinLowPercent_ = static_cast<uint8_t>((rxPinLowSamples_ * 100U) / rxPinSamples_);
  } else {
    rxPinLowPercent_ = 0U;
  }
  rxPinSamples_ = 0U;
  rxPinLowSamples_ = 0U;

  const uint32_t rxNow = rxCount_;
  const uint32_t txNow = txCount_;
  const uint32_t ringWriteNow = ringWriteCount_;
  const uint32_t ringReadNow = ringReadCount_;
  rxRate_ = ((rxNow - lastRxCount_) * 1000U) / elapsed;
  txRate_ = ((txNow - lastTxCount_) * 1000U) / elapsed;
  ringWriteRate_ = ((ringWriteNow - lastRingWriteCount_) * 1000U) / elapsed;
  ringReadRate_ = ((ringReadNow - lastRingReadCount_) * 1000U) / elapsed;
  const float bitsPerSecond = static_cast<float>(rxRate_ + txRate_) * 128.0f;
  busLoadPercent_ = bitrate_ == 0U ? 0.0f : bitsPerSecond * 100.0f / static_cast<float>(bitrate_);
  if (busLoadPercent_ > 100.0f) busLoadPercent_ = 100.0f;
  lastRxCount_ = rxNow;
  lastTxCount_ = txNow;
  lastRingWriteCount_ = ringWriteNow;
  lastRingReadCount_ = ringReadNow;
  lastStatsMs_ = now;
}

bool CanManager::receive(CanFrame& frame) {
  if (!queue_.pop(frame)) return false;
  ++ringReadCount_;
  return true;
}

void CanManager::inject(const CanFrame& frame) {
  if (queue_.push(frame)) ++ringWriteCount_;
  ++rxCount_;
}

bool CanManager::send(const CanFrame& frame) {
  if (!running_ || listenOnly_ || driverChanging_) return false;
  twai_message_t message{};
  message.identifier = frame.id;
  message.data_length_code = frame.dlc > 8 ? 8 : frame.dlc;
  message.extd = frame.extended;
  message.rtr = frame.rtr;
  for (uint8_t i = 0; i < message.data_length_code; ++i) message.data[i] = frame.data[i];
  if (twai_transmit(&message, pdMS_TO_TICKS(20)) != ESP_OK) {
    ++errorCount_;
    return false;
  }
  ++txCount_;
  return true;
}
