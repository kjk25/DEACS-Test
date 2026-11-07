#pragma once
#include <Arduino.h>

// Lock-free Single-Producer/Single-Consumer ring buffer.
// The producer owns head_, the consumer owns tail_. When full, the newest
// frame is dropped so the producer never modifies the consumer index.
template <typename T, size_t Capacity>
class RingBuffer {
 public:
  static_assert(Capacity >= 2, "RingBuffer capacity must be at least 2");

  bool push(const T& value) {
    const size_t head = __atomic_load_n(&head_, __ATOMIC_RELAXED);
    const size_t next = increment(head);
    const size_t tail = __atomic_load_n(&tail_, __ATOMIC_ACQUIRE);
    if (next == tail) {
      __atomic_add_fetch(&drops_, 1U, __ATOMIC_RELAXED);
      return false;
    }
    items_[head] = value;
    __atomic_store_n(&head_, next, __ATOMIC_RELEASE);
    const size_t used = distance(next, tail);
    size_t high = __atomic_load_n(&highWater_, __ATOMIC_RELAXED);
    while (used > high && !__atomic_compare_exchange_n(
             &highWater_, &high, used, false, __ATOMIC_RELAXED, __ATOMIC_RELAXED)) {}
    return true;
  }

  bool pop(T& value) {
    const size_t tail = __atomic_load_n(&tail_, __ATOMIC_RELAXED);
    const size_t head = __atomic_load_n(&head_, __ATOMIC_ACQUIRE);
    if (tail == head) return false;
    value = items_[tail];
    __atomic_store_n(&tail_, increment(tail), __ATOMIC_RELEASE);
    return true;
  }

  size_t size() const {
    const size_t head = __atomic_load_n(&head_, __ATOMIC_ACQUIRE);
    const size_t tail = __atomic_load_n(&tail_, __ATOMIC_ACQUIRE);
    return distance(head, tail);
  }

  void resetStatistics() {
    __atomic_store_n(&drops_, 0U, __ATOMIC_RELAXED);
    __atomic_store_n(&highWater_, size(), __ATOMIC_RELAXED);
  }

  uint32_t drops() const { return __atomic_load_n(&drops_, __ATOMIC_RELAXED); }
  size_t highWater() const { return __atomic_load_n(&highWater_, __ATOMIC_RELAXED); }
  static constexpr size_t capacity() { return Capacity - 1U; }

 private:
  static constexpr size_t increment(size_t value) { return (value + 1U) % Capacity; }
  static constexpr size_t distance(size_t head, size_t tail) {
    return head >= tail ? head - tail : Capacity - tail + head;
  }

  T items_[Capacity]{};
  volatile size_t head_ = 0;
  volatile size_t tail_ = 0;
  volatile uint32_t drops_ = 0;
  volatile size_t highWater_ = 0;
};
