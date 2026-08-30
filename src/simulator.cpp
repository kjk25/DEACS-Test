#include "simulator.h"
#include "can_manager.h"

CanSimulator Simulator;

void CanSimulator::begin() {
  stop();
  clear();
}

void CanSimulator::clear() {
  stop();
  for (auto& entry : entries_) entry = Entry{};
  count_ = 0;
}

bool CanSimulator::add(uint32_t id, bool extended, const uint8_t* data, uint8_t dlc,
                       uint32_t intervalMs, bool enabled, bool dynamic,
                       uint8_t dynamicIndex) {
  if (count_ >= MAX_FRAMES || dlc > 8U) return false;
  const uint32_t maxId = extended ? 0x1FFFFFFFUL : 0x7FFUL;
  if (id > maxId) return false;

  Entry& entry = entries_[count_++];
  entry.used = true;
  entry.enabled = enabled;
  entry.extended = extended;
  entry.dynamic = dynamic;
  entry.dynamicIndex = dlc == 0U ? 0U : static_cast<uint8_t>(dynamicIndex % dlc);
  entry.id = id;
  entry.intervalMs = constrain(intervalMs, 10UL, 60000UL);
  entry.dlc = dlc;
  for (uint8_t i = 0; i < dlc; ++i) entry.data[i] = data[i];
  return true;
}

void CanSimulator::start() {
  const uint32_t now = millis();
  running_ = true;
  for (auto& entry : entries_) {
    entry.nextDueMs = entry.used && entry.enabled ? now + entry.intervalMs : 0U;
  }
}

void CanSimulator::stop() {
  running_ = false;
  for (auto& entry : entries_) entry.nextDueMs = 0U;
}

void CanSimulator::poll() {
  if (!running_) return;
  const uint32_t now = millis();

  for (auto& entry : entries_) {
    if (!entry.used || !entry.enabled || entry.nextDueMs == 0U) continue;
    if (static_cast<int32_t>(now - entry.nextDueMs) < 0) continue;

    CanFrame frame;
    frame.timestampUs = micros();
    frame.simulated = true;
    frame.id = entry.id;
    frame.extended = entry.extended;
    frame.dlc = entry.dlc;
    for (uint8_t i = 0; i < entry.dlc; ++i) frame.data[i] = entry.data[i];
    if (liveTx_) Can.send(frame);
    Can.inject(frame);

    if (entry.dynamic && entry.dlc > 0U) {
      entry.data[entry.dynamicIndex] = static_cast<uint8_t>(entry.data[entry.dynamicIndex] + 1U);
      entry.dynamicIndex = static_cast<uint8_t>((entry.dynamicIndex + 1U) % entry.dlc);
    }

    // Intervall gilt pro Message. Verspätete Termine werden nicht nachgeholt.
    entry.nextDueMs = now + entry.intervalMs;
  }
}
