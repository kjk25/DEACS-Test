#include "simulator.h"
#include "can_manager.h"
#include <math.h>

CanSimulator Simulator;

void CanSimulator::begin() {
  stop();
  clear();
}

void CanSimulator::clear() {
  stop();
  entries_.clear();
  pollIndex_ = 0;
  memoryLimited_ = false;
}

bool CanSimulator::add(uint32_t id, bool extended, const uint8_t* data, uint8_t dlc,
                       uint32_t intervalMs, bool enabled, bool dynamic,
                       uint8_t dynamicIndex, uint8_t mode) {
  memoryLimited_ = false;
  if (dlc > 8U || running_) return false;
  const uint32_t maxId = extended ? 0x1FFFFFFFUL : 0x7FFUL;
  if (id > maxId) return false;

  Entry entry;
  entry.used = true;
  entry.enabled = enabled;
  entry.extended = extended;
  entry.dynamic = dynamic;
  entry.mode = mode <= 7U ? mode : 0U;
  entry.dynamicIndex = dlc == 0U ? 0U : static_cast<uint8_t>(dynamicIndex % dlc);
  entry.id = id;
  entry.intervalMs = constrain(intervalMs, 10UL, 60000UL);
  entry.dlc = dlc;
  for (uint8_t i = 0; i < dlc; ++i) entry.baseData[i] = entry.data[i] = data[i];
  memoryLimited_ = !entries_.append(entry);
  return !memoryLimited_;
}

void CanSimulator::start(bool loop) {
  const uint32_t now = millis();
  loop_ = loop;
  ++runId_;
  remaining_ = 0;
  pollIndex_ = 0;
  entries_.each([this, now](Entry& entry) {
    entry.frameIndex = 0;
    entry.lfsr = 0xACE1;
    for (uint8_t i = 0; i < entry.dlc; ++i) entry.data[i] = entry.baseData[i];
    entry.pending = entry.used && entry.enabled;
    if (entry.pending) ++remaining_;
    entry.nextDueMs = entry.pending ? now + entry.intervalMs : 0U;
  });
  running_ = remaining_ > 0;
}

void CanSimulator::stop() {
  running_ = false;
  remaining_ = 0;
  entries_.each([](Entry& entry) { entry.nextDueMs = 0U; entry.pending = false; });
}

void CanSimulator::poll() {
  if (!running_) return;
  const uint32_t now = millis();

  const uint32_t startedUs = micros();
  size_t visited = 0;
  while (visited++ < entries_.size()) {
    if (micros() - startedUs >= 2000U) break;
    if (pollIndex_ >= entries_.size()) pollIndex_ = 0;
    auto& entry = entries_[pollIndex_++];
    if (!entry.pending) continue;
    if (static_cast<int32_t>(now - entry.nextDueMs) < 0) continue;

    CanFrame frame;
    frame.timestampUs = micros();
    frame.simulated = true;
    frame.id = entry.id;
    frame.extended = entry.extended;
    frame.dlc = entry.dlc;
    if (entry.dlc > 0U && entry.mode > 0U) {
      const uint32_t n = entry.frameIndex++;
      for (uint8_t i = 0; i < entry.dlc; ++i) entry.data[i] = entry.baseData[i];
      switch (entry.mode) {
        case 1:
          for (uint8_t i = 0; i < entry.dlc; ++i) entry.data[i] = static_cast<uint8_t>(random(256));
          break;
        case 2:
          for (uint8_t i = 0; i < entry.dlc; ++i) entry.data[i] = static_cast<uint8_t>(entry.baseData[0] + n);
          break;
        case 3: {
          const uint8_t bit = n % (entry.dlc * 8U);
          for (uint8_t i = 0; i < entry.dlc; ++i) entry.data[i] = 0;
          entry.data[bit / 8U] = 1U << (bit % 8U);
          break;
        }
        case 4: entry.data[0] = static_cast<uint8_t>(lround(127.5 + 127.5 * sin((n % 32U) * 2.0 * 3.141592653589793 / 32.0))); break;
        case 5: entry.data[0] = static_cast<uint8_t>(entry.baseData[0] + n); break;
        case 6: entry.data[0] = n % 32U < 16U ? 0 : 255; break;
        case 7:
          for (uint8_t i = 0; i < entry.dlc; ++i) {
            entry.lfsr = (entry.lfsr >> 1U) ^ ((entry.lfsr & 1U) ? 0xB400U : 0U);
            entry.data[i] = static_cast<uint8_t>(entry.lfsr);
          }
          break;
      }
    }
    for (uint8_t i = 0; i < entry.dlc; ++i) frame.data[i] = entry.data[i];
    if (liveTx_) Can.send(frame);
    Can.inject(frame);

    if (entry.dynamic && entry.dlc > 0U) {
      entry.data[entry.dynamicIndex] = static_cast<uint8_t>(entry.data[entry.dynamicIndex] + 1U);
      entry.dynamicIndex = static_cast<uint8_t>((entry.dynamicIndex + 1U) % entry.dlc);
    }

    // Intervall gilt pro Message. Verspätete Termine werden nicht nachgeholt.
    if (loop_) entry.nextDueMs = now + entry.intervalMs;
    else {
      entry.pending = false;
      entry.nextDueMs = 0U;
      if (--remaining_ == 0U) { running_ = false; break; }
    }
  }
}
