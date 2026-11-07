#include "usb_tunnel.h"
#include "config.h"
#include "memory_budget.h"
#include <WiFi.h>
#include <esp_log.h>
#include <lwip/sockets.h>
#include <errno.h>

UsbTunnel Usb;
namespace {
constexpr size_t PAYLOAD = 512;
constexpr uint8_t CHANNELS = 3;
enum Kind : uint8_t { HELLO=1, READY, OPEN, OPENED, DATA, ACK, CLOSE, PING, PONG };
uint16_t crc16(const uint8_t* p, size_t n) {
  uint16_t crc = 0xffff;
  while (n--) { crc ^= uint16_t(*p++) << 8;
    for (unsigned i=0;i<8;++i) crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
  }
  return crc;
}
bool sendPacket(uint8_t kind, uint8_t channel, const uint8_t* data=nullptr, size_t size=0) {
  uint8_t packet[PAYLOAD+10];
  memcpy(packet,"DUSB",4);packet[4]=kind;packet[5]=channel;packet[6]=size;packet[7]=size>>8;
  if (size) memcpy(packet+8,data,size);
  const uint16_t crc=crc16(packet+4,size+4);packet[8+size]=crc;packet[9+size]=crc>>8;
  return Serial.write(packet,size+10)==size+10;
}
struct Channel {
  WiFiClient client;
  uint8_t id=0;
  bool open=false, waiting=false;
  uint32_t sentAt=0, writeStarted=0;
  uint8_t pending[PAYLOAD];
  size_t pendingSize=0, pendingOffset=0;
};
}

void UsbTunnel::begin() {
  TaskHandle_t task=nullptr;
  // Fixed transport working memory is charged before creating the worker.
  if (MemoryBudget::available(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT) > 16384U)
    started_ = xTaskCreatePinnedToCore(taskEntry,"usb-tunnel",8192,this,1,&task,0) == pdPASS;
}
void UsbTunnel::taskEntry(void* context) { static_cast<UsbTunnel*>(context)->run(); }

void UsbTunnel::run() {
  Channel channels[CHANNELS];
  uint8_t input[PAYLOAD+10],output[PAYLOAD];size_t used=0;
  uint32_t lastHost=0,lastByte=0;
  for (;;) {
    if (used && millis()-lastByte>1000U) used=0;
    size_t budget=2048;
    while (Serial.available() && budget--) {
      const uint8_t b=Serial.read();lastByte=millis();
      if (used<4 && b!=static_cast<uint8_t>("DUSB"[used])) { used=b=='D'?1U:0U;input[0]='D';continue; }
      input[used++]=b;
      if (used<8) continue;
      const size_t size=input[6]|(size_t(input[7])<<8);
      if (size>PAYLOAD) { used=0;continue; }
      if (used<size+10) continue;
      used=0;
      const uint16_t crc=input[8+size]|(uint16_t(input[9+size])<<8);
      if (crc!=crc16(input+4,size+4)) continue;
      const uint8_t kind=input[4],id=input[5];
      if (kind==HELLO && id==0 && size==1 && input[8]==1) {
        for (auto& ch:channels) {ch.client.stop();ch.open=false;ch.waiting=false;ch.pendingSize=0;}
        Serial.setDebugOutput(false);esp_log_level_set("*",ESP_LOG_NONE);
        __atomic_store_n(&active_,true,__ATOMIC_RELEASE);lastHost=millis();
        sendPacket(READY,0,reinterpret_cast<const uint8_t*>(Config::FW_VERSION),strlen(Config::FW_VERSION));
        continue;
      }
      if (!active()) continue;
      lastHost=millis();
      if (kind==PING && id==0) {sendPacket(PONG,0);continue;}
      const uint8_t slot=id & 3U;
      if (slot<1 || slot>CHANNELS) continue;
      auto& ch=channels[slot-1];
      if (kind==OPEN && size==2) {
        ch.client.stop();ch.open=false;ch.waiting=false;ch.pendingSize=0;ch.id=id;
        const uint16_t port=input[8]|(uint16_t(input[9])<<8);
        if ((port==80 || port==81) && MemoryBudget::available(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT)>8192U &&
            ch.client.connect(IPAddress(127,0,0,1),port,250)) {
          ch.client.setNoDelay(true);ch.client.setTimeout(1);ch.open=true;sendPacket(OPENED,id);
        } else sendPacket(CLOSE,id);
      } else if (id!=ch.id) continue;
      else if (kind==DATA && ch.open) {
        if (ch.pendingSize) {ch.client.stop();ch.open=false;sendPacket(CLOSE,id);}
        else if (!size) sendPacket(ACK,id);
        else {memcpy(ch.pending,input+8,size);ch.pendingSize=size;ch.pendingOffset=0;ch.writeStarted=millis();}
      } else if (kind==ACK) ch.waiting=false;
      else if (kind==CLOSE) {ch.client.stop();ch.open=false;ch.waiting=false;}
    }
    if (active() && millis()-lastHost>5000U) {
      __atomic_store_n(&active_,false,__ATOMIC_RELEASE);
      for (auto& ch:channels) {ch.client.stop();ch.open=false;ch.waiting=false;}
      esp_log_level_set("*",ESP_LOG_ERROR);
    }
    if (active()) for (uint8_t i=0;i<CHANNELS;++i) {
      auto& ch=channels[i];if (!ch.open) continue;
      if (ch.waiting && millis()-ch.sentAt>3000U) {ch.client.stop();ch.open=false;sendPacket(CLOSE,ch.id);continue;}
      // Never block this worker on a loopback socket. It must continue reading
      // serial ACKs/PINGs while the HTTP/WS task consumes or produces TCP data.
      if (ch.pendingSize) {
        const int count=::send(ch.client.fd(),ch.pending+ch.pendingOffset,ch.pendingSize-ch.pendingOffset,MSG_DONTWAIT);
        if (count>0) ch.pendingOffset+=count;
        if ((count<0 && errno!=EAGAIN && errno!=EWOULDBLOCK && errno!=EINTR) || millis()-ch.writeStarted>3000U) {
          ch.client.stop();ch.open=false;sendPacket(CLOSE,ch.id);continue;
        }
        if (ch.pendingOffset==ch.pendingSize) {ch.pendingSize=0;sendPacket(ACK,ch.id);}
      }
      if (!ch.waiting) {
        const int count=::recv(ch.client.fd(),output,sizeof(output),MSG_DONTWAIT);
        if (count>0) {sendPacket(DATA,ch.id,output,count);ch.waiting=true;ch.sentAt=millis();}
        else if (count==0 || (count<0 && errno!=EAGAIN && errno!=EWOULDBLOCK && errno!=EINTR)) {
          ch.client.stop();ch.open=false;sendPacket(CLOSE,ch.id);
        }
      }
    }
    vTaskDelay(1);
  }
}
