#pragma once
#include <Arduino.h>
#include <esp_heap_caps.h>
#include <LittleFS.h>
#include <new>

// Each physical pool retains 20%; external memory cannot hide internal pressure.
namespace MemoryBudget {
constexpr unsigned LIMIT_PERCENT = 80;
inline size_t available(uint32_t caps) {
  const size_t total = heap_caps_get_total_size(caps);
  const size_t free = heap_caps_get_free_size(caps);
  const size_t reserve = (total + 4U) / 5U;
  return free > reserve ? free - reserve : 0U;
}
inline void* allocate(size_t bytes) {
  constexpr uint32_t internal = MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT;
  constexpr uint32_t external = MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT;
  if (available(internal) < 1024U) return nullptr;
  for (uint32_t caps : {external, internal}) {
    // Leave room for allocator metadata, too.
    if (bytes + 64U > available(caps)) continue;
    void* p = heap_caps_malloc(bytes, caps);
    if (p) return p;
  }
  return nullptr;
}
inline bool canWrite(size_t bytes) {
  const size_t total = LittleFS.totalBytes();
  const size_t used = LittleFS.usedBytes();
  const size_t limit = total / 5U * 4U;
  // LittleFS allocates blocks, not individual bytes.
  const size_t rounded = ((bytes + 4095U) / 4096U) * 4096U + 4096U;
  return used <= limit && rounded <= limit - used;
}
}

// Incremental allocation avoids copying a large old/new vector at growth time.
template<typename T, size_t BlockSize = 32>
class BudgetList {
  struct Block { Block* next = nullptr; T items[BlockSize]{}; };
  Block* first_ = nullptr;
  Block* last_ = nullptr;
  size_t count_ = 0;
  mutable Block* cached_ = nullptr;
  mutable size_t cachedIndex_ = 0;
 public:
  BudgetList() = default;
  BudgetList(const BudgetList&) = delete;
  BudgetList& operator=(const BudgetList&) = delete;
  ~BudgetList() { clear(); }
  size_t size() const { return count_; }
  bool append(const T& value) {
    if (MemoryBudget::available(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT) < 1024U) return false;
    if (count_ % BlockSize == 0U) {
      void* p = MemoryBudget::allocate(sizeof(Block));
      if (!p) return false;
      Block* block = new(p) Block;
      if (last_) last_->next = block; else first_ = block;
      last_ = block;
    }
    last_->items[count_++ % BlockSize] = value;
    return true;
  }
  T& operator[](size_t index) {
    const size_t blockIndex = index / BlockSize;
    Block* block = cached_ && blockIndex >= cachedIndex_ ? cached_ : first_;
    const size_t start = block == cached_ ? cachedIndex_ : 0U;
    for (size_t i = start; i < blockIndex; ++i) block = block->next;
    cached_ = block; cachedIndex_ = blockIndex;
    return block->items[index % BlockSize];
  }
  const T& operator[](size_t index) const { return const_cast<BudgetList*>(this)->operator[](index); }
  template<typename F> void each(F f) {
    size_t remaining = count_;
    for (Block* b = first_; b; b = b->next) {
      const size_t n = remaining < BlockSize ? remaining : BlockSize;
      for (size_t i = 0; i < n; ++i) f(b->items[i]);
      remaining -= n;
      delay(0);
    }
  }
  void swap(BudgetList& other) {
    auto* first = first_; first_ = other.first_; other.first_ = first;
    auto* last = last_; last_ = other.last_; other.last_ = last;
    size_t count = count_; count_ = other.count_; other.count_ = count;
    cached_ = nullptr; other.cached_ = nullptr;
  }
  void clear() {
    while (first_) { Block* next = first_->next; first_->~Block(); heap_caps_free(first_); first_ = next; }
    last_ = nullptr; count_ = 0; cached_ = nullptr; cachedIndex_ = 0;
  }
};
