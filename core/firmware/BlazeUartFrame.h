#ifndef BLAZE_UART_FRAME_H
#define BLAZE_UART_FRAME_H

// Lab-only bounded UART ping/pong frames. No GPIO outputs, authentication,
// payment, command execution, flashing, or electrical safety guarantees.
// Compatible with Arduino AVR / ESP8266 / classic ESP32 and host C++11.
#include <stddef.h>
#include <stdint.h>

namespace BlazeUart {
static const uint8_t START=0xA5;
static const uint8_t VERSION=1;
static const uint8_t PING=1;
static const uint8_t PONG=2;
static const uint8_t MAX_PAYLOAD=16;
static const size_t MAX_FRAME=static_cast<size_t>(MAX_PAYLOAD)+6;
static const uint32_t RX_TIMEOUT_MS=250;

struct Frame {
 uint8_t kind;
 uint8_t sequence;
 uint8_t length;
 uint8_t payload[MAX_PAYLOAD];
 Frame():kind(0),sequence(0),length(0),payload() {}
};

inline bool allowedKind(uint8_t k){ return k==PING||k==PONG; }
inline uint8_t crcByte(uint8_t crc,uint8_t value){
 crc^=value;
 for(uint8_t b=0;b<8;++b)
  crc=(crc&0x80)?static_cast<uint8_t>((crc<<1)^0x07):static_cast<uint8_t>(crc<<1);
 return crc;
}
inline size_t encode(const Frame &f,uint8_t *out,size_t capacity){
 if(!out||!allowedKind(f.kind)||f.length>MAX_PAYLOAD||capacity<static_cast<size_t>(f.length)+6)return 0;
 out[0]=START;out[1]=VERSION;out[2]=f.kind;out[3]=f.sequence;out[4]=f.length;
 uint8_t crc=0;
 for(size_t i=1;i<5;++i)crc=crcByte(crc,out[i]);
 for(uint8_t i=0;i<f.length;++i){out[5+i]=f.payload[i];crc=crcByte(crc,f.payload[i]);}
 out[5+f.length]=crc;
 return static_cast<size_t>(f.length)+6;
}

class Parser {
 enum State { SEEK, READ_VERSION, READ_KIND, READ_SEQ, READ_LEN, READ_PAYLOAD, READ_CRC };
 State state_;
 Frame candidate_;
 uint8_t crc_;
 uint8_t position_;
 uint32_t lastByteAt_;
 public:
 Parser():state_(SEEK),candidate_(),crc_(0),position_(0),lastByteAt_(0){}
 void reset(){state_=SEEK;candidate_=Frame();crc_=0;position_=0;lastByteAt_=0;}
 void expire(uint32_t now){
  // unsigned subtraction intentionally supports millis() rollover.
  if(state_!=SEEK && static_cast<uint32_t>(now-lastByteAt_)>RX_TIMEOUT_MS)reset();
 }
 bool feed(uint8_t byte,uint32_t now,Frame &out){
  expire(now);
  if(state_==SEEK){
   if(byte==START){state_=READ_VERSION;lastByteAt_=now;crc_=0;position_=0;candidate_=Frame();}
   return false;
  }
  lastByteAt_=now;
  switch(state_){
  case READ_VERSION:
   if(byte!=VERSION){reset();return false;}
   crc_=crcByte(crc_,byte);state_=READ_KIND;return false;
  case READ_KIND:
   if(!allowedKind(byte)){reset();return false;}
   candidate_.kind=byte;crc_=crcByte(crc_,byte);state_=READ_SEQ;return false;
  case READ_SEQ:
   candidate_.sequence=byte;crc_=crcByte(crc_,byte);state_=READ_LEN;return false;
  case READ_LEN:
   if(byte>MAX_PAYLOAD){reset();return false;}
   candidate_.length=byte;crc_=crcByte(crc_,byte);
   state_=byte?READ_PAYLOAD:READ_CRC;return false;
  case READ_PAYLOAD:
   candidate_.payload[position_++]=byte;crc_=crcByte(crc_,byte);
   if(position_==candidate_.length)state_=READ_CRC;
   return false;
  case READ_CRC:{
   const bool valid=byte==crc_;
   if(valid)out=candidate_;
   reset();
   return valid;
  }
  default:reset();return false;
  }
 }
};

// Only inert PING is serviced; all other traffic results in no response.
// Never attach a relay, coin value, GPIO action, or security decision to this API.
inline bool makePong(const Frame &request,Frame &reply){
 if(request.kind!=PING||request.length>MAX_PAYLOAD)return false;
 reply=Frame();reply.kind=PONG;reply.sequence=request.sequence;reply.length=request.length;
 for(uint8_t i=0;i<request.length;++i)reply.payload[i]=request.payload[i];
 return true;
}
} // namespace BlazeUart
#endif
