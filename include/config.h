#pragma once
#include <Arduino.h>

#if !CONFIG_IDF_TARGET_ESP32S3
#error "DEACS requires an ESP32-S3 N16R8 board."
#endif

namespace Config {
constexpr char FW_NAME[] = "DEACS";
constexpr char FW_VERSION[] = "0.13.63-TEST";
constexpr uint32_t SERIAL_BAUD = 921600;
constexpr gpio_num_t CAN_TX_PIN = GPIO_NUM_17;
constexpr gpio_num_t CAN_RX_PIN = GPIO_NUM_16;
// In listen-only mode TWAI uses this unconnected dummy TX pin.
// The physical transceiver TXD on GPIO17 is then held permanently recessive (HIGH).
// GPIO27 is reserved for flash/PSRAM on ESP32-S3 modules.
constexpr gpio_num_t CAN_LISTEN_TX_DUMMY_PIN = GPIO_NUM_21;
constexpr uint32_t CAN_BITRATE = 500000;
constexpr int RX_LED_PIN = 2;
constexpr bool RX_LED_ACTIVE_HIGH = true;
// Sichtbarer TX-Impuls; weitere Live-Sendungen verlängern ihn fortlaufend.
constexpr uint32_t RX_LED_PULSE_MS = 500;
constexpr char AP_SSID[] = "DEACS";
constexpr char AP_PASSWORD[] = "deacs123";
constexpr uint16_t HTTP_PORT = 80;
constexpr uint16_t WS_PORT = 81;
constexpr size_t CAN_QUEUE_SIZE = 2048;
constexpr uint32_t TWAI_RX_QUEUE_SIZE = 512;
constexpr uint16_t WS_BATCH_MAX_FRAMES = 64;
constexpr uint32_t CAN_RX_TASK_STACK = 4096;
constexpr UBaseType_t CAN_RX_TASK_PRIORITY = 12;
constexpr BaseType_t CAN_RX_TASK_CORE = 1;
constexpr uint32_t STATUS_INTERVAL_MS = 1000;
constexpr uint32_t WS_BATCH_INTERVAL_MS = 25;
constexpr uint16_t CAN_RX_BURST_MAX = 256;
constexpr char LOG_PATH[] = "/canlog.csv";
constexpr size_t LOG_FLUSH_EVERY = 32;
}
