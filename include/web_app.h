#pragma once
#include <Arduino.h>
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <FS.h>
#include "can_frame.h"

class WebApp {
 public:
  void begin();
  void poll();
  void broadcastFrame(const CanFrame& frame, const char* direction);
  void broadcastFrames(const CanFrame* frames, size_t count, const char* direction);
  void broadcastStatus();
  void noteRxDrain(size_t frames, uint32_t elapsedUs, size_t queueBefore, size_t queueAfter);
  void resetDiagnosticPeaks();
  void addDiagnosticEvent(const char* text);
  uint32_t wsFrameCount() const { return wsFrameCount_; }
  uint32_t wsFrameRate() const { return wsFrameRate_; }
  uint32_t filteredFrameCount() const { return filteredFrameCount_; }
  uint32_t filteredFrameRate() const { return filteredFrameRate_; }
  uint32_t minFreeHeap() const { return minFreeHeap_; }
  uint32_t minLargestHeapBlock() const { return minLargestHeapBlock_; }
  uint32_t maxWsBatchBytes() const { return maxWsBatchBytes_; }
  uint32_t maxWsBroadcastUs() const { return maxWsBroadcastUs_; }
 private:
  void setupRoutes();
  size_t statusJson(char* buffer, size_t capacity) const;
  String statusJsonString() const;
  String selfTestJson() const;
  String diagnosticEventsJson() const;
  bool frameAllowed(const CanFrame& frame) const;
  void setServerFilter(const String& idsText, bool enabled);
  String serverFilterIdsText() const;
  WebServer server_{80};
  WebSocketsServer ws_{81};
  uint32_t lastStatusMs_ = 0;
  uint32_t lastPipelineStatsMs_ = 0;
  uint32_t lastWsFrameCount_ = 0;
  uint32_t lastFilteredFrameCount_ = 0;
  uint32_t wsFrameCount_ = 0;
  uint32_t filteredFrameCount_ = 0;
  uint32_t wsFrameRate_ = 0;
  uint32_t filteredFrameRate_ = 0;
  uint32_t minFreeHeap_ = UINT32_MAX;
  uint32_t minLargestHeapBlock_ = UINT32_MAX;
  uint32_t maxWsBatchBytes_ = 0;
  uint32_t maxWsBroadcastUs_ = 0;
  uint32_t wsBatchCount_ = 0;
  uint32_t maxRxDrainUs_ = 0;
  uint16_t maxRxDrainFrames_ = 0;
  uint32_t rxBacklogEvents_ = 0;
  uint32_t lastRxBacklogEventMs_ = 0;
  static constexpr uint8_t DIAGNOSTIC_EVENT_COUNT = 24;
  struct DiagnosticEvent { uint32_t ms = 0; char text[64]{}; };
  DiagnosticEvent diagnosticEvents_[DIAGNOSTIC_EVENT_COUNT]{};
  uint8_t diagnosticEventWrite_ = 0;
  uint8_t diagnosticEventUsed_ = 0;
  uint32_t lastCanFrameMs_ = 0;
  uint32_t lastWsPacketMs_ = 0;
  uint32_t lastQueueWarningMs_ = 0;
  bool queueWarningActive_ = false;
  uint8_t wsClientCount_ = 0;
  static constexpr uint8_t MAX_SERVER_FILTER_IDS = 32;
  bool filterEnabled_ = false;
  bool filterInverted_ = true;
  uint32_t filterIds_[MAX_SERVER_FILTER_IDS]{};
  uint8_t filterIdCount_ = 0;
};
extern WebApp Web;
